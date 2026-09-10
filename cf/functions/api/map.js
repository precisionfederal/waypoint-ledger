/* POST /api/map — AI reads the story; the table prices it.

   The deterministic rules run first (the same lib/mapper.ts the browser runs).
   Every phrase they left blank — no unit, no gap, no span of time — goes to a
   model with the catalog's ids and labels, and nothing else. The model may
   answer only with an id the catalog already holds, or null. The rules'
   answers are never overridden. No price is sent to the model and no price
   comes back: the response carries ids, and the table prices them on either
   side of the wire.

   The model also sees every phrase the rules DID read, with the id they landed
   on, so it reads the whole story. It may answer {"r":n,"flag":"…"} to say a
   rules answer looks wrong: that is a report, carried on the wire as `flag`,
   and it never overrides a unit, a count or a price.

   Providers, in order: OpenAI (OPENAI_API_KEY, the models in OPENAI_MODELS or
   READER_MODELS, strongest first), Anthropic (ANTHROPIC_API_KEY), then
   Cloudflare Workers AI (the AI binding). None reachable → the rules'
   answer, marked `model: null`, so the product never waits on a model.
   Answers are cached in KV by the story's SHA-256 for a day. */
import { json, bad, readJson, count } from './_http.js';
import { parseJourney } from '../../../lib/mapper.ts';
import { SELECTABLE, TABLE_VERSION } from '../../../lib/table.ts';
import { catalogFor, candidatesOf, rulesReadOf, SYSTEM_PROMPT, buildUserPrompt, parseModelJson, applyModel, toWire } from '../../../lib/map-model.ts';

/* Which model reads the story — measured, not assumed. 209 sentences of a patient's own words
   (data/test-fixtures/map-eval.json) through this exact prompt and these exact guarantees, four
   models, 2026-09-09 (scripts/eval-models.mjs; table in data/test-fixtures/READER-EVAL.md):

     gpt-5.5        F1 83.8  precision 79.0  recall 89.1  p95 3771 ms  0 wrong units added
     gpt-5.4        F1 83.3  precision 78.6  recall 88.6  p95 2540 ms  1
     gpt-5.4-mini   F1 83.2  precision 78.3  recall 88.6  p95 2407 ms  2
     gpt-5.4-nano   F1 81.5  precision 77.2  recall 86.4  p95 4627 ms  4

   gpt-5.5 is first: the strongest reader on every axis, and the only one that added no unit a
   careful reader would call wrong, with a p95 well inside the 9 s timeout. gpt-5.4-mini is the
   fallback — the next strongest, and the fastest — for when the first errors or times out.
   READER_MODELS (a comma list) overrides both without a code change; READER_EFFORT overrides the
   reasoning effort, which the same measurement says buys nothing at medium. */
export const OPENAI_MODELS = ['gpt-5.5', 'gpt-5.4-mini'];
export const modelsFor = (env) => {
  const raw = String(env?.READER_MODELS || '').trim();
  const list = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return list.length ? list : OPENAI_MODELS;
};
const effortFor = (env) => {
  const e = String(env?.READER_EFFORT || '').trim().toLowerCase();
  return ['minimal', 'low', 'medium', 'high'].includes(e) ? e : 'low';
};
export const ANTHROPIC_MODEL = 'claude-sonnet-5';
export const WORKERS_AI_MODELS = ['@cf/openai/gpt-oss-120b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct'];
const TIMEOUT_MS = 9000;
const MAX_STORY = 2000;
const CACHE_TTL = 24 * 3600;
const PROMPT_VERSION = 'map-6';
/* The cache key carries a hash of the prompt itself, so editing the prompt invalidates the cache
   without anyone remembering to bump a constant. A stale answer read back after a prompt change is
   the quietest way to measure the wrong thing. */
let promptHashMemo = null;
async function promptHash() {
  if (!promptHashMemo) promptHashMemo = (await sha256(SYSTEM_PROMPT)).slice(0, 12);
  return promptHashMemo;
}
// The paid path has a ceiling and a kill switch: a global KV counter per hour (READER_HOURLY_CEILING,
// default 2000 model calls), and the counter is read fail-CLOSED — if KV cannot answer, the model is
// skipped, never the request. READER_OFF=1 pauses the model entirely. The rules' answer always ships.
const DEFAULT_CEILING = 2000;

async function readerAllowed(env) {
  if (String(env.READER_OFF || '') === '1') return { ok: false, why: 'the reader is paused' };
  if (!env.LEDGER) return { ok: false, why: 'the reader needs KV to meter itself' };
  const hour = new Date().toISOString().slice(0, 13);
  const key = `map:spend:${hour}`;
  try {
    const n = Number((await env.LEDGER.get(key)) || 0);
    const cap = Number(env.READER_HOURLY_CEILING || DEFAULT_CEILING);
    if (n >= cap) return { ok: false, why: 'the reader is paused for this hour' };
    await env.LEDGER.put(key, String(n + 1), { expirationTtl: 2 * 3600 });
    return { ok: true, why: null };
  } catch { return { ok: false, why: 'the reader could not meter itself' }; }
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('model timeout')), ms))]);

async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function askOpenAI(env, system, user) {
  let lastErr = null;
  for (const model of modelsFor(env)) {
    try {
      const r = await withTimeout(fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model,
          reasoning_effort: effortFor(env),
          response_format: { type: 'json_object' },
          max_completion_tokens: 1500,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
      }), TIMEOUT_MS);
      if (!r.ok) throw new Error(`openai ${r.status}`);
      const data = await r.json();
      const text = data?.choices?.[0]?.message?.content || '';
      if (!text) throw new Error('openai empty');
      return { text, model: data.model || model };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('openai unavailable');
}

async function askAnthropic(env, system, user) {
  const r = await withTimeout(fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1200, temperature: 0, system, messages: [{ role: 'user', content: user }] }),
  }), TIMEOUT_MS);
  if (!r.ok) throw new Error(`anthropic ${r.status}`);
  const data = await r.json();
  const text = (data.content || []).map((c) => c.text || '').join('');
  return { text, model: ANTHROPIC_MODEL };
}

async function askWorkersAi(env, system, user) {
  let lastErr = null;
  for (const model of WORKERS_AI_MODELS) {
    try {
      const isResponses = model.startsWith('@cf/openai/gpt-oss');
      const input = isResponses
        ? { instructions: system, input: user, reasoning: { effort: 'low' } }
        : { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 1200, temperature: 0 };
      const out = await withTimeout(env.AI.run(model, input), TIMEOUT_MS);
      // Workers AI answers { response: string } for chat models; some builds return an object or a tool-call
      // shape instead. Whatever came back, the parser is given a string and looks for the JSON inside it.
      // gpt-oss answers in the Responses shape: output[].content[].text. Chat models answer { response }.
      const fromOutput = Array.isArray(out?.output)
        ? out.output.flatMap((o) => (Array.isArray(o?.content) ? o.content : [])).map((c) => c?.text || '').join('')
        : '';
      const raw = fromOutput || (typeof out === 'string' ? out : (out?.response ?? out));
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
      return { text, model };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('workers ai unavailable');
}

export async function readWithModel(env, story, debug = false) {
  const segments = parseJourney(story, SELECTABLE);
  const candidates = candidatesOf(segments);
  // `flags` is always present, empty when no model spoke, so a caller never has to test for it.
  const base = { tableVersion: TABLE_VERSION, model: null, filled: 0, refused: 0, flags: [] };
  if (!candidates.length) return { ...base, segments: toWire(segments), note: 'the rules read every phrase' };
  const provider = env.OPENAI_API_KEY ? askOpenAI : env.ANTHROPIC_API_KEY ? askAnthropic : env.AI ? askWorkersAi : null;
  if (!provider) return { ...base, segments: toWire(segments), note: 'no model configured' };
  const gate = await readerAllowed(env);
  if (!gate.ok) return { ...base, segments: toWire(segments), note: gate.why };
  const alreadyRead = rulesReadOf(segments);
  const user = buildUserPrompt(catalogFor(SELECTABLE), candidates.map((i) => segments[i].raw), story, alreadyRead);
  try {
    const { text, model } = await provider(env, SYSTEM_PROMPT, user);
    const answers = parseModelJson(text);
    const applied = applyModel(segments, candidates, answers, SELECTABLE, alreadyRead);
    // `flags` is the model's report on phrases the RULES read. It is carried on the wire and never
    // overrides anything: the unit, the count and the price on those phrases are the rules' answer.
    return { tableVersion: TABLE_VERSION, model, filled: applied.filled.length, refused: applied.refused.length, flags: applied.flags, segments: toWire(applied.segments, applied.flags), ...(debug ? { modelText: String(text).slice(0, 1500), asked: candidates.map((i) => segments[i].raw) } : {}) };
  } catch (e) {
    return { ...base, segments: toWire(segments), note: `model unavailable: ${String(e.message || e).slice(0, 80)}` };
  }
}

export async function onRequestPost({ request, env }) {
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  const story = typeof body.story === 'string' ? body.story.trim().slice(0, MAX_STORY) : '';
  if (!story) return bad('POST a JSON body: {"story":"…"}');
  const debug = new URL(request.url).searchParams.get('debug') === '1';
  // The model list is part of the key: switching READER_MODELS must never serve another model's answer.
  const key = `map:${PROMPT_VERSION}.${await promptHash()}:${TABLE_VERSION}:${modelsFor(env).join('+')}:${await sha256(story)}`;
  let hit = null;
  try { hit = env.LEDGER ? await env.LEDGER.get(key, 'json') : null; } catch { hit = null; }
  if (hit && hit.model && !debug) { await count(env, 'map'); return json({ ok: true, cached: true, ...hit }); }
  const out = await readWithModel(env, story, debug);
  if (out.model && env.LEDGER) { try { await env.LEDGER.put(key, JSON.stringify(out), { expirationTtl: CACHE_TTL }); } catch { /* cache is a convenience */ } }
  await count(env, 'map');
  return json({ ok: true, cached: false, ...out });
}

export const onRequestGet = () => bad('POST a JSON body: {"story":"…"}. The model names units from the catalog; the published table prices them. No figure is ever produced by a model.');

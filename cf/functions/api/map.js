/* POST /api/map — AI reads the story; the table prices it.

   The deterministic rules run first (the same lib/mapper.ts the browser runs).
   Every phrase they left blank — no unit, no gap, no span of time — goes to a
   model with the catalog's ids and labels, and nothing else. The model may
   answer only with an id the catalog already holds, or null. The rules'
   answers are never overridden. No price is sent to the model and no price
   comes back: the response carries ids, and the table prices them on either
   side of the wire.

   Providers, in order: OpenAI (OPENAI_API_KEY, gpt-5.4-nano, ~1 s, then
   gpt-5-mini), Anthropic (ANTHROPIC_API_KEY), then Cloudflare Workers AI (the
   AI binding). None reachable → the rules'
   answer, marked `model: null`, so the product never waits on a model.
   Answers are cached in KV by the story's SHA-256 for a day. */
import { json, bad, readJson, count } from './_http.js';
import { parseJourney } from '../../../lib/mapper.ts';
import { SELECTABLE, TABLE_VERSION } from '../../../lib/table.ts';
import { catalogFor, candidatesOf, SYSTEM_PROMPT, buildUserPrompt, parseModelJson, applyModel, toWire } from '../../../lib/map-model.ts';

export const OPENAI_MODELS = ['gpt-5.4-nano', 'gpt-5-mini'];
export const ANTHROPIC_MODEL = 'claude-sonnet-5';
export const WORKERS_AI_MODELS = ['@cf/openai/gpt-oss-120b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct'];
const TIMEOUT_MS = 9000;
const MAX_STORY = 2000;
const CACHE_TTL = 24 * 3600;
const PROMPT_VERSION = 'map-4';

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('model timeout')), ms))]);

async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function askOpenAI(env, system, user) {
  let lastErr = null;
  for (const model of OPENAI_MODELS) {
    try {
      const r = await withTimeout(fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model,
          reasoning_effort: 'low',
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
  const base = { tableVersion: TABLE_VERSION, model: null, filled: 0, refused: 0 };
  if (!candidates.length) return { ...base, segments: toWire(segments), note: 'the rules read every phrase' };
  const provider = env.OPENAI_API_KEY ? askOpenAI : env.ANTHROPIC_API_KEY ? askAnthropic : env.AI ? askWorkersAi : null;
  if (!provider) return { ...base, segments: toWire(segments), note: 'no model configured' };
  const user = buildUserPrompt(catalogFor(SELECTABLE), candidates.map((i) => segments[i].raw), story);
  try {
    const { text, model } = await provider(env, SYSTEM_PROMPT, user);
    const answers = parseModelJson(text);
    const applied = applyModel(segments, candidates, answers, SELECTABLE);
    return { tableVersion: TABLE_VERSION, model, filled: applied.filled.length, refused: applied.refused.length, segments: toWire(applied.segments), ...(debug ? { modelText: String(text).slice(0, 1500), asked: candidates.map((i) => segments[i].raw) } : {}) };
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
  const key = `map:${PROMPT_VERSION}:${TABLE_VERSION}:${await sha256(story)}`;
  let hit = null;
  try { hit = env.LEDGER ? await env.LEDGER.get(key, 'json') : null; } catch { hit = null; }
  if (hit && hit.model && !debug) { await count(env, 'map'); return json({ ok: true, cached: true, ...hit }); }
  const out = await readWithModel(env, story, debug);
  if (out.model && env.LEDGER) { try { await env.LEDGER.put(key, JSON.stringify(out), { expirationTtl: CACHE_TTL }); } catch { /* cache is a convenience */ } }
  await count(env, 'map');
  return json({ ok: true, cached: false, ...out });
}

export const onRequestGet = () => bad('POST a JSON body: {"story":"…"}. The model names units from the catalog; the published table prices them. No figure is ever produced by a model.');

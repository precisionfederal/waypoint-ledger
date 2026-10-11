/* POST /api/map — AI reads the phrases the rules could not; the table prices them.

   The deterministic rules run first (the same lib/mapper.ts the browser runs).
   Every phrase they left blank — no unit, no gap, no span of time — goes to a
   model with the catalog's ids and labels. The model may answer only with an
   id the catalog already holds, or null. The rules' answers are never
   overridden. No price is sent to the model and no price comes back: the
   response carries ids, and the table prices them on either side of the wire.

   WHAT LEAVES FOR THE MODEL, AND NOTHING ELSE (2026-10-01). /privacy, /journey
   and the demo script say only the phrases the rules could not place go to the
   model. Until today the request also carried the whole story and every phrase
   the rules HAD read, so that was not true. Now each unplaced phrase goes out
   with at most NEIGHBOUR_WORDS words from the phrase just before it and the
   phrase just after it, which is what a nerve study told in two halves ("they
   put electrodes on my legs" … "shocked the nerves") needs to be read as one
   test. Never the rest of the story, never a phrase the rules placed on its
   own, never a price. See phrasesForModel() below; tests/map-privacy.test.ts
   holds it to that.

   Providers, chosen by which key this deployment holds, not tried in turn:
   OpenAI (OPENAI_API_KEY; the models in READER_MODELS or OPENAI_MODELS,
   strongest first, each next one only if the one before it errors), else Anthropic
   (ANTHROPIC_API_KEY), else Cloudflare Workers AI (the AI binding). Production
   holds only the OpenAI key; the staging preview holds none and uses Workers
   AI. If the chosen provider does not answer, the rules' answer ships, marked
   `model: null`, so the product never waits on a model. Answers are cached in
   KV by the story's SHA-256 for a day. */
import { json, bad, readJson, count } from './_http.js';
import { parseJourney } from '../../../lib/mapper.ts';
import { stripBidi } from '../../../lib/price-api.ts';
import { SELECTABLE, TABLE_VERSION } from '../../../lib/table.ts';
import { catalogFor, candidatesOf, SYSTEM_PROMPT, parseModelJson, applyModel, toWire } from '../../../lib/map-model.ts';

/* Which model reads the story — measured, not assumed. 209 sentences of a patient's own words
   (data/test-fixtures/map-eval.json) through the same prompt and the same guarantees for every
   model (scripts/eval-models.mjs, reasoning effort low).

   2026-09-30, one run, same conditions (winloop/BETA-2026-10-01/R6-luna.md):
     gpt-5.6-luna   F1 98.4  precision 97.7  recall 99.1  p95 2338 ms  0 wrong units added  0 errors
     gpt-5.5        F1 98.2  precision 97.7  recall 98.6  p95 3559 ms  0 wrong units added  0 errors
   A second run in the reverse order held it: luna p95 2793 ms, gpt-5.5 p95 3329 ms.

   2026-09-09, four models (table in data/test-fixtures/READER-EVAL.md, over the rules as they
   stood that day, so the F1 is lower for every row):
     gpt-5.5        F1 83.8  precision 79.0  recall 89.1  p95 3771 ms  0 wrong units added
     gpt-5.4        F1 83.3  precision 78.6  recall 88.6  p95 2540 ms  1
     gpt-5.4-mini   F1 83.2  precision 78.3  recall 88.6  p95 2407 ms  2
     gpt-5.4-nano   F1 81.5  precision 77.2  recall 86.4  p95 4627 ms  4

   gpt-5.6-luna is first: F1 at least as high as gpt-5.5, no wrong unit of its own, and a p95
   about a second lower, well inside the 9 s timeout. gpt-5.5 is second, the reader it replaced,
   and gpt-5.4-mini third, the fastest of the 2026-09-09 four; each is tried only if the one
   before it errors or times out. READER_MODELS (a comma list) overrides all three without a code
   change; READER_EFFORT overrides the reasoning effort, which the same measurement says buys
   nothing at medium. */
export const OPENAI_MODELS = ['gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4-mini'];
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
const PROMPT_VERSION = 'map-7-phrases-only';
/* The cache key carries a hash of the prompt itself, so editing the prompt invalidates the cache
   without anyone remembering to bump a constant. A stale answer read back after a prompt change is
   the quietest way to measure the wrong thing. */
let promptHashMemo = null;
async function promptHash() {
  if (!promptHashMemo) promptHashMemo = (await sha256(PHRASE_SYSTEM_PROMPT)).slice(0, 12);
  return promptHashMemo;
}

/* ==========================================================================
   THE PHRASES, AND ONLY THE PHRASES.
   ========================================================================== */

/** How many words of each neighbouring phrase travel with an unplaced one. */
export const NEIGHBOUR_WORDS = 4;

const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);

/** Pure. For each phrase the rules left blank: the phrase, the last few words of
 *  the phrase before it and the first few words of the phrase after it. That is
 *  everything about the story that leaves for the model. */
export function phrasesForModel(segments, candidates, n = NEIGHBOUR_WORDS) {
  return candidates.map((idx) => {
    const before = idx > 0 ? words(segments[idx - 1]?.raw).slice(-n).join(' ') : '';
    const after = idx < segments.length - 1 ? words(segments[idx + 1]?.raw).slice(0, n).join(' ') : '';
    return { phrase: String(segments[idx]?.raw || ''), before, after };
  });
}

/* The system prompt is lib/map-model.ts's, with the two passages that asked for
   the whole story taken out: "read each phrase in the context of the whole
   story", and the check of every phrase the rules already read (that list is
   no longer sent). If the source prompt changes so these no longer match, the
   reader still runs (the user message carries only the phrases either way, so
   privacy does not depend on this) and tests/map-privacy.test.ts fails, so
   the stale instruction is caught before it ships. */
const WHOLE_STORY = 'Read each phrase in the context of the whole story and choose the catalog unit it describes.';
const RULES_CHECK = /THEN CHECK THE RULES\.[\s\S]*?Never mention money\./;
function phrasePrompt(src) {
  return src
    .replace(WHOLE_STORY, 'Each phrase comes with at most a few words from the phrases just before and after it, and nothing else of the story. Read the phrase with those words and choose the catalog unit it describes.')
    .replace(RULES_CHECK, 'Never mention money.');
}
export const PHRASE_SYSTEM_PROMPT = phrasePrompt(SYSTEM_PROMPT);

/** The user message: the catalog (ids, labels, synonyms; no prices) and the
 *  unplaced phrases with their few neighbouring words. Nothing else. */
export function buildPhrasePrompt(catalog, items) {
  const cat = catalog.map((c) => `${c.id} | ${c.label}${c.also.length ? ` | also: ${c.also.join(', ')}` : ''}`).join('\n');
  const ph = items.map((it, i) => `${i}: ${it.phrase}${it.before || it.after ? `   [just before: "${it.before}" · just after: "${it.after}"]` : ''}`).join('\n');
  return `CATALOG (id | label | also)\n${cat}\n\n` +
    `PHRASES TO MAP (index: phrase, then the few words just before and after it, for context only; map the phrase, not the context)\n${ph}\n\n` +
    `Return {"map":[...]} with one {"i":…,"id":…,"why":…} entry per phrase index. Where two phrases are two halves of one appointment, give both the same id.`;
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
  const items = phrasesForModel(segments, candidates);
  const user = buildPhrasePrompt(catalogFor(SELECTABLE), items);
  try {
    const { text, model } = await provider(env, PHRASE_SYSTEM_PROMPT, user);
    const answers = parseModelJson(text);
    /* No list of the rules' own reads is sent any more, so there is nothing for
       an `r` flag to point at: applyModel is given an empty list and ignores
       them. A flag on an asked phrase (`i`) is still carried, report only. */
    const applied = applyModel(segments, candidates, answers, SELECTABLE, []);
    return { tableVersion: TABLE_VERSION, model, filled: applied.filled.length, refused: applied.refused.length, flags: applied.flags, segments: toWire(applied.segments, applied.flags), ...(debug ? { modelText: String(text).slice(0, 1500), asked: items, sent: user.slice(user.indexOf('PHRASES TO MAP')) } : {}) };
  } catch (e) {
    return { ...base, segments: toWire(segments), note: `model unavailable: ${String(e.message || e).slice(0, 80)}` };
  }
}

export async function onRequestPost({ request, env }) {
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  const story = typeof body.story === 'string' ? stripBidi(body.story).trim().slice(0, MAX_STORY) : '';
  if (!story) return bad('POST a JSON body: {"story":"…"}');
  const debug = new URL(request.url).searchParams.get('debug') === '1';
  // The model list is part of the key: switching READER_MODELS must never serve another model's answer.
  // So is the rules' own read of this story: a cached answer carries the rules' segments, so a change to
  // the mapper or the synonyms must never be answered with yesterday's read of the same words.
  const rulesHash = (await sha256(JSON.stringify(toWire(parseJourney(story, SELECTABLE))))).slice(0, 12);
  const key = `map:${PROMPT_VERSION}.${await promptHash()}:${TABLE_VERSION}:${rulesHash}:${modelsFor(env).join('+')}:${await sha256(story)}`;
  let hit = null;
  try { hit = env.LEDGER ? await env.LEDGER.get(key, 'json') : null; } catch { hit = null; }
  if (hit && hit.model && !debug) { await count(env, 'map'); return json({ ok: true, cached: true, ...hit }); }
  const out = await readWithModel(env, story, debug);
  if (out.model && env.LEDGER) { try { await env.LEDGER.put(key, JSON.stringify(out), { expirationTtl: CACHE_TTL }); } catch { /* cache is a convenience */ } }
  await count(env, 'map');
  return json({ ok: true, cached: false, ...out });
}

export const onRequestGet = () => bad('POST a JSON body: {"story":"…"}. The model names units from the catalog; the published table prices them. No figure is ever produced by a model.');

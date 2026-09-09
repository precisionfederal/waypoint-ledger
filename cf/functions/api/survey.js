/* ==========================================================================
   POST /api/survey — the burden-ranking instrument
   GET  /api/survey — the aggregate, published as counts with their N

   Dr. Phillips asked the cohort, four separate times, for a weighting with a
   stated basis, and said that eliciting it from the affected community "would
   be a great contribution". This is that elicitation. Every figure served here
   is a count of responses exactly as entered: no weighting scheme of ours, no
   imputation, no extrapolation to a population.

   One instrument: lib/survey-def.js. One validator and one aggregate, pure, so
   the Node route (next dev) and the tests use the same rules.
   The optional free-text sentence is encrypted at rest and NEVER served.
   System of record: D1 `survey_responses`.
   ========================================================================== */
import { json, bad, readJson, str, int, channelOf, count, isDryRun, dryOk } from './_http.js';
import { cachedAggregate, writeProbe } from './_counters.js';
import { all, encrypt, userOf } from './_db.js';
import { appendChained } from './_hash.js';
import { BURDEN_IDS as BURDENS, DECIDER_IDS as DECIDERS, CONTEXT as CTX, SURVEY_VERSION } from '../../../lib/survey-def.js';

const CONTEXT = Object.fromEntries(Object.entries(CTX).map(([k, v]) => [k, v.options]));

export function validateSurvey(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'Body must be a JSON object.' };
  const ranking = Array.isArray(b.ranking) ? b.ranking.filter((x, i, a) => BURDENS.includes(x) && a.indexOf(x) === i) : [];
  if (ranking.length !== 5) return { error: 'Rank all five burdens, heaviest first.' };
  const unasked = b.unasked === 'all-asked' || BURDENS.includes(b.unasked) ? b.unasked : null;
  if (!unasked) return { error: 'Answer which burden no one asked about.' };
  if (!BURDENS.includes(b.lead)) return { error: 'Choose the burden a tool should lead with.' };
  if (!DECIDERS.includes(b.decide)) return { error: 'Choose who should decide the weighing.' };
  let clinicians = null;
  if (b.clinicians !== null && b.clinicians !== undefined && b.clinicians !== '') {
    const n = int(b.clinicians, 0, 99);
    if (n === undefined) return { error: 'Clinicians must be a whole number from 0 to 99.' };
    clinicians = n;
  }
  const context = {};
  if (b.context && typeof b.context === 'object') {
    for (const k of Object.keys(CONTEXT)) if (CONTEXT[k].includes(b.context[k])) context[k] = b.context[k];
  }
  const sentence = typeof b.sentence === 'string' && b.sentence.trim() ? b.sentence.trim().slice(0, 280) : undefined;
  return {
    record: {
      ranking, unasked, lead: b.lead, decide: b.decide, clinicians,
      context: Object.keys(context).length ? context : undefined,
      sentence, channel: channelOf(b.channel),
      /* The version names which context fields the integrity chain covers for
         this row (see SURVEY_PROJECTIONS in _hash.js). A row that did not state
         one was collected under the instrument running here, so that is what is
         recorded — never a blank that leaves the row unwalkable. */
      surveyVersion: str(b.surveyVersion, 20) ?? SURVEY_VERSION,
      receivedAt: new Date().toISOString(),
    },
  };
}

export function aggregateSurvey(rows) {
  if (!rows.length) return { ok: true, n: 0, note: 'No survey responses yet. This endpoint reports only what people have actually sent.' };
  const count_ = (arr) => arr.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {});
  const ranking = BURDENS.map((id) => {
    const positions = rows.map((r) => r.ranking.indexOf(id) + 1).filter((p) => p > 0);
    return {
      burden: id,
      rankedFirstBy: rows.filter((r) => r.ranking[0] === id).length,
      rankedLastBy: rows.filter((r) => r.ranking[4] === id).length,
      meanRank: positions.length ? +(positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(2) : null,
    };
  }).sort((a, b) => (a.meanRank ?? 9) - (b.meanRank ?? 9));
  const clin = rows.map((r) => r.clinicians).filter((n) => typeof n === 'number').sort((a, b) => a - b);
  const coverage = {};
  for (const k of Object.keys(CONTEXT)) coverage[k] = count_(rows.map((r) => (r.context && r.context[k]) || 'not stated'));
  const dates = rows.map((r) => r.receivedAt).sort();
  return {
    ok: true,
    n: rows.length,
    firstAt: dates[0], lastAt: dates[dates.length - 1],
    channels: count_(rows.map((r) => r.channel || 'direct')),
    ranking,
    unasked: count_(rows.map((r) => r.unasked)),
    lead: count_(rows.map((r) => r.lead)),
    decide: count_(rows.map((r) => r.decide)),
    clinicians: clin.length ? { n: clin.length, median: clin[Math.floor(clin.length / 2)], mean: +(clin.reduce((a, b) => a + b, 0) / clin.length).toFixed(1), max: clin[clin.length - 1] } : { n: 0 },
    coverage,
    sentencesHeld: rows.filter((r) => r.sentence).length,
    method: 'Every figure is a count of responses exactly as entered. No weighting scheme of ours, no imputation, no extrapolation to a population. This is a self-selected sample, recruited through the channels listed, and must be read as one.',
  };
}

const parse = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

/** D1 row -> the canonical record shape. `sentence` is the held flag only: the
 *  text itself stays encrypted and is never served by any endpoint. */
export const surveyOf = (r) => ({
  id: r.id,
  prevHash: r.prev_hash ?? undefined,
  rowHash: r.row_hash ?? undefined,
  ranking: parse(r.ranking_json, []),
  unasked: r.unasked, lead: r.lead, decide: r.decide,
  clinicians: r.clinicians === null ? null : Number(r.clinicians),
  context: parse(r.context_json, undefined),
  sentence: r.sentence_enc ? true : undefined,
  channel: r.channel || 'direct',
  surveyVersion: r.survey_version ?? undefined,
  receivedAt: r.received_at,
});

export async function surveyRows(env) {
  return (await all(env, 'SELECT * FROM survey_responses ORDER BY received_at ASC, rowid ASC')).map(surveyOf);
}

export async function onRequestPost({ request, env }) {
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  const v = validateSurvey(body);
  if (v.error) return bad(v.error);
  const r = v.record;
  if (isDryRun(request)) return dryOk('survey', { ranking: r.ranking, channel: r.channel, surveyVersion: r.surveyVersion }, await writeProbe(env, 'survey'));
  let chain;
  try {
    const who = await userOf(env, request).catch(() => null);
    chain = await appendChained(env, 'survey_responses', {
      user_id: who ? who.id : null,
      ranking_json: JSON.stringify(r.ranking), unasked: r.unasked, lead: r.lead, decide: r.decide,
      clinicians: r.clinicians, context_json: r.context ? JSON.stringify(r.context) : null,
      sentence_enc: await encrypt(env, r.sentence), channel: r.channel,
      survey_version: r.surveyVersion ?? null, received_at: r.receivedAt,
    }, r);
  } catch { return bad('Could not record the response. Nothing was saved.', 500); }
  await count(env, 'survey');
  return json({ ok: true, integrity: { prevHash: chain.prevHash, rowHash: chain.rowHash, position: chain.position } });
}

export async function onRequestGet({ env }) {
  try { return json(await cachedAggregate(env, { kind: 'survey', loadRows: surveyRows, aggregate: aggregateSurvey })); }
  catch { return bad('The survey aggregate could not be read right now.', 503); }
}

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
import { panelCode } from './_panel.js';
import { cachedAggregate, writeProbe } from './_counters.js';
import { markSender, peopleCount, withSenders } from './_senders.js';
import { ALIASES } from '../../../lib/count-fields.js';
import { all, encrypt, userOf } from './_db.js';
import { appendChained, versionAtLeast } from './_hash.js';
import { publishCoverage, publicDates, NOT_STATED } from './_cells.js';
import { BURDEN_IDS as BURDENS, DECIDER_IDS as DECIDERS, CONTEXT as CTX, SURVEY_VERSION, SMALL_CELL_MIN, SEX_ASK_ORIGIN, ONSET_KEYS, STRATA, stratumOf } from '../../../lib/survey-def.js';

/** The instrument version at which who-is-answering and the onset ages were first asked. */
export const ONSET_FROM = '2026-10-01.1';

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
  /* S-14 (2026-09-30): the version is the client's claim about which form it
     showed, and it decides which fields are kept and which chain projection the
     row is hashed under. Free text let a row name any version at all, including
     one that has never existed. A version is accepted only in the instrument's
     own shape and never newer than the instrument running here; anything else is
     recorded as the version running here. */
  const surveyVersion = typeof b.surveyVersion === 'string' && /^\d{4}-\d{2}-\d{2}\.\d{1,3}$/.test(b.surveyVersion) && versionAtLeast(SURVEY_VERSION, b.surveyVersion)
    ? b.surveyVersion : SURVEY_VERSION;
  /* A row that states an instrument older than ONSET_FROM was collected by a
     form that never asked who was answering or when it began, and the chain for
     that version does not cover those fields. So they are not accepted on it:
     a field stored outside its version's projection is the ctx_state defect. */
  const onsetAsked = versionAtLeast(surveyVersion, ONSET_FROM);
  const context = {};
  if (b.context && typeof b.context === 'object') {
    for (const k of Object.keys(CONTEXT)) {
      if (!onsetAsked && ONSET_KEYS.includes(k)) continue;
      if (CONTEXT[k].includes(b.context[k])) context[k] = b.context[k];
    }
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
      surveyVersion,
      receivedAt: new Date().toISOString(),
    },
  };
}

/** The five burdens with how a set of respondents placed them. Pure; used for
 *  the whole sample and, unchanged, for each published sex group, so a group
 *  can never be computed by a different rule than the total it sits under. */
export function rankOf(rows) {
  return BURDENS.map((id) => {
    const positions = rows.map((r) => r.ranking.indexOf(id) + 1).filter((p) => p > 0);
    return {
      burden: id,
      rankedFirstBy: rows.filter((r) => r.ranking[0] === id).length,
      rankedLastBy: rows.filter((r) => r.ranking[4] === id).length,
      meanRank: positions.length ? +(positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(2) : null,
    };
  }).sort((a, b) => (a.meanRank ?? 9) - (b.meanRank ?? 9));
}

/* ==========================================================================
   THE RANKING, READ BY SEX.

   The Federal Sprint Lead for the Invisible Illness track asked every team on
   26 August 2026 to be intentional about sex differences where relevant. A
   burden ranking that cannot be read by sex cannot answer that, so this is the
   cross-tabulation, and it is the reason the instrument asks.

   It is suppressed HERE, on the server, and not in the browser: a marginal
   count is one number about a lot of people, but a cross-tabulation narrows
   the group twice, so a small cell must never leave the machine holding it.
   Any sex group under SMALL_CELL_MIN is not served at all; the number of
   withheld groups and the responses they hold ARE served, so the table still
   adds up in public. No weighting, no imputation: each group is the same count
   of the same answers, computed by the same function as the total.
   ========================================================================== */
export function rankingBySex(rows, min = SMALL_CELL_MIN) {
  const groups = new Map();
  let notStated = 0;
  for (const r of rows) {
    const v = r.context && r.context.sex;
    if (!v) { notStated++; continue; }
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v).push(r);
  }
  const published = [];
  let withheldGroups = 0, withheldResponses = 0;
  for (const [sex, rs] of groups) {
    if (rs.length >= min) published.push({ sex, n: rs.length, ranking: rankOf(rs) });
    else { withheldGroups++; withheldResponses += rs.length; }
  }
  published.sort((a, b) => b.n - a.n);
  return {
    min,
    stated: rows.length - notStated,
    notStated,
    groups: published,
    withheldGroups,
    withheldResponses,
    why: SEX_ASK_ORIGIN,
    method: `Each group is the same count of the same answers as the total above it, computed by the same function. A sex group holding fewer than ${min} responses is withheld here rather than served and hidden later, because a cross-tabulation narrows the group twice. Nothing is weighted, imputed or extrapolated.`,
  };
}

/* ==========================================================================
   THE RANKING, READ BY WHO ANSWERED AND WHEN IT BEGAN.

   A caregiver answering for a child, a person whose illness began before 18,
   and a person whose illness began as an adult are different strata, and a
   ranking pooled across them can be moved by one of them without anyone
   seeing it. The pooled ranking above stays exactly as it was computed; this
   is the same count of the same answers, read per stratum, under the same
   small-cell rule as the ranking by sex, suppressed here on the server.
   Every row collected before 2026-10-01.1 is "onset not stated": it is never
   assumed to be adult-onset.
   ========================================================================== */
export function rankingByStratum(rows, min = SMALL_CELL_MIN) {
  const groups = new Map(STRATA.map((s) => [s.id, []]));
  for (const r of rows) groups.get(stratumOf(r.context)).push(r);
  const published = [];
  const counts = {};
  let withheldGroups = 0, withheldResponses = 0;
  for (const s of STRATA) {
    const rs = groups.get(s.id);
    /* A stratum is a breakdown by who someone is, so its COUNT is under the
       same rule as its ranking: served only at SMALL_CELL_MIN or more. "Age at
       onset not stated" names nobody's answer and is always served. */
    if (rs.length >= min || s.id === 'onset-not-stated') counts[s.id] = rs.length;
    if (!rs.length) continue;
    if (rs.length >= min) published.push({ stratum: s.id, label: s.label, n: rs.length, ranking: rankOf(rs) });
    else { withheldGroups++; withheldResponses += rs.length; }
  }
  return {
    min,
    counts,
    groups: published,
    withheldGroups,
    withheldResponses,
    method: `Each stratum is the same count of the same answers as the total, computed by the same function. A stratum holding fewer than ${min} responses is withheld here rather than served, its count as well as its ranking. Rows collected before the instrument asked (version ${ONSET_FROM}) are "age at onset not stated", never assumed adult.`,
  };
}

/** flow3-4: what the headline counts, in the words the register prints. */
export const HEADLINE_OF = "answers about the person's own illness";
export const HEADLINE_METHOD = 'The ranking, the three questions, the clinician count and the ranking by sex are computed from answers about the person\'s own illness. Answers a parent or caregiver gave about a child are read only as their own group, by stratum, and that group is withheld until it holds ' + SMALL_CELL_MIN + ' answers.';

export function aggregateSurvey(rows) {
  if (!rows.length) return { ok: true, n: 0, note: 'No survey responses yet. This endpoint reports only what people have actually sent.' };
  const count_ = (arr) => arr.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {});
  /* 🔴 flow3-4: THE HEADLINE IS ABOUT THE PERSON'S OWN ILLNESS. A parent's
     answer for a child went into the headline ranking and into "how many
     clinicians did you see" (the 9 was the child's), while the thank-you page
     says answers about a child are read as their own group and never reshape
     the adult answers. The headline (ranking, unasked, lead, decide,
     clinicians, and the ranking by sex beneath it) is now computed from the
     answers about the person's own illness only. A child's answers are read
     only in rankingByStratum, withheld under SMALL_CELL_MIN like every group.
     `n` stays every answer received, as the register's tiles count it. */
  const own = rows.filter((r) => stratumOf(r.context) !== 'caregiver-child');
  const ranking = rankOf(own);
  const clin = own.map((r) => r.clinicians).filter((n) => typeof n === 'number').sort((a, b) => a - b);
  /* Who answered, by every optional self-description. Suppressed HERE: any
     value held by fewer than SMALL_CELL_MIN answers is folded into one
     "fewer than 11, not shown" line, so no small count ever leaves the server
     (cf/functions/api/_cells.js). The page used to do this in the browser,
     after the raw counts had already been served. */
  const raw = {};
  for (const k of Object.keys(CONTEXT)) raw[k] = count_(rows.map((r) => (r.context && r.context[k]) || NOT_STATED));
  const { coverage, withheld: coverageWithheld } = publishCoverage(raw);
  const dates = rows.map((r) => r.receivedAt).sort();
  return publicDates({
    ok: true,
    n: rows.length,
    firstAt: dates[0], lastAt: dates[dates.length - 1],
    channels: count_(rows.map((r) => r.channel || 'direct')),
    headline: { n: own.length, of: HEADLINE_OF, method: HEADLINE_METHOD },
    ranking,
    rankingBySex: rankingBySex(own),
    rankingByStratum: rankingByStratum(rows),
    unasked: count_(own.map((r) => r.unasked)),
    lead: count_(own.map((r) => r.lead)),
    decide: count_(own.map((r) => r.decide)),
    clinicians: clin.length ? { n: clin.length, median: clin[Math.floor(clin.length / 2)], mean: +(clin.reduce((a, b) => a + b, 0) / clin.length).toFixed(1), max: clin[clin.length - 1] } : { n: 0 },
    coverage,
    coverageWithheld,
    smallCellMin: SMALL_CELL_MIN,
    sentencesHeld: rows.filter((r) => r.sentence).length,
    method: `Every figure is a count of responses exactly as entered. No weighting scheme of ours, no imputation, no extrapolation to a population. This is a self-selected sample, recruited through the channels listed, and must be read as one. Any answer to a question about the person (age, sex, coverage, region, state, stage, who is answering, the ages at onset and diagnosis) held by fewer than ${SMALL_CELL_MIN} responses is not shown: it is counted in the line "fewer than ${SMALL_CELL_MIN}, not shown" and never named. Dates are published as the day, never the time.`,
  });
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
  /* R6 edge #3: the published N is people, not sends. Counted here, outside
     the row, never with it. See cf/functions/api/_senders.js. */
  await markSender(request, env, 'survey');
  return json({ ok: true, integrity: { prevHash: chain.prevHash, rowHash: chain.rowHash, position: chain.position }, ...panelCode(env, r.channel) });
}

/* FINAL-1011 honest: THE SENDER COUNT CANNOT LEAVE OUR OWN TESTS OUT.
   Every published count leaves the rows we marked as our own tests out
   (_annotations.js). The distinct-sender count is the one number that cannot:
   it is a counter of networks kept outside the rows (_senders.js), and the
   network our tests came from was counted when they arrived. Capped at the
   counted answers it can still say "4 answers from 4 senders" when one of those
   senders was us. So while any row of a table is marked, that table publishes
   no sender count of its own: senders falls back to what was sent, the basis
   says 'sends', and the denominator says why in plain words. */
export const TEAM_TEST_DENOMINATOR =
  'Some rows were our own team testing the form. They are left out of this count, and teamTests says how many. The sender index counts networks and cannot leave ours out, so while any row is marked this number counts what was sent, not senders.';

/** withSenders, unless the aggregate left our own test rows out: then no sender count is claimed. */
export function withSendersCounted(agg, opts) {
  if (!(Number(agg?.teamTests) > 0)) return withSenders(agg, opts);
  const s = withSenders(agg, { ...opts, people: null });
  return s.senderBasis === 'sends' ? { ...s, denominator: TEAM_TEST_DENOMINATOR } : s;
}

export async function onRequestGet({ env }) {
  try {
    const agg = await cachedAggregate(env, { kind: 'survey', loadRows: surveyRows, aggregate: aggregateSurvey });
    /* `answers` and `submissions` are how many were sent, `senders` the
       distinct senders. JUDGE-5 #7: `n` is the deprecated alias of answers
       here as on /api/register (it was senders on this endpoint only), and the
       payload names the alias in `deprecated`. */
    return json({ ...withSendersCounted(agg, { key: 'senders', people: await peopleCount(env, 'survey'), submissions: agg.n ?? 0, noun: 'answers' }), deprecated: ALIASES.survey });
  }
  catch { return bad('The survey aggregate could not be read right now.', 503); }
}

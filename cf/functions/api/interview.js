/* ==========================================================================
   POST /api/interview — a written user-research interview
   GET  /api/interview — a count and its dates. Nothing else, ever.

   Answers, name and email are encrypted at rest with AES-GCM (INTERVIEW_KEY)
   and are NEVER served by any public endpoint. What changes because of an
   interview is published on the register as "a user said this, so we changed
   that", with a quote only where the writer chose to be quoted.
   System of record: D1 `interviews`.
   ========================================================================== */
import { json, bad, readJson, oneOf, channelOf, count, isDryRun, dryOk } from './_http.js';
import { panelCode } from './_panel.js';
import { cachedAggregate, writeProbe } from './_counters.js';
import { all, encrypt } from './_db.js';
import { appendChained } from './_hash.js';
import { markSender, peopleCount, withSenders } from './_senders.js';
import { withSendersCounted } from './survey.js';
import { INTERVIEW_QUESTIONS, INTERVIEW_RESPONDENT_SELF, INTERVIEW_RESPONDENT_CARER } from '../../../lib/survey-def.js';

const CONSENT = ['notes', 'quote-anonymously', 'quote-by-name'];

/* ---------------------------------------------------------------------------
   AN ANSWER THAT SAYS SOMETHING (R1-security S-04, 2026-09-30).

   The register prints how many written interviews there are, and Bo reads that
   number out. Six posts of three one-letter answers each counted as six
   interviews. So an interview is recorded only when at least three answers say
   something: SUBSTANTIVE_CHARS characters and SUBSTANTIVE_WORDS words, which is
   one short sentence ("I paid $211 for the echo."). Every answer the person
   wrote is still kept exactly as written, short ones included; the rule only
   decides whether the interview is counted and stored at all.

   It lives beside validateInterview, not inside it: validateInterview names the
   fields an interview keeps (the privacy page is generated from it), and this
   decides whether one is worth recording. Both run on every POST.
   --------------------------------------------------------------------------- */
export const SUBSTANTIVE_CHARS = 20;
export const SUBSTANTIVE_WORDS = 4;
export const TOO_SHORT = 'Write a sentence or two for at least three of the questions, so there is something to learn from. Skip any you like.';
export const isSubstantive = (a) => typeof a === 'string'
  && a.trim().length >= SUBSTANTIVE_CHARS
  && a.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length >= SUBSTANTIVE_WORDS;
/** null when the record is worth recording, else the sentence to show. */
export function tooShort(record) {
  const n = Object.values((record && record.answers) || {}).filter(isSubstantive).length;
  return n >= 3 ? null : TOO_SHORT;
}

export function validateInterview(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'Body must be a JSON object.' };
  if (!oneOf(b.consent, CONSENT)) return { error: 'Choose how we may use what you write.' };
  const answers = {};
  let filled = 0;
  for (const [id] of INTERVIEW_QUESTIONS) {
    const a = typeof b.answers?.[id] === 'string' ? b.answers[id].trim().slice(0, 3000) : '';
    if (a) { answers[id] = a; filled++; }
  }
  if (filled < 3) return { error: 'Answer at least three questions. Skip any you like.' };
  const name = b.consent === 'quote-by-name' && typeof b.name === 'string' ? b.name.trim().slice(0, 80) : undefined;
  if (b.consent === 'quote-by-name' && !name) return { error: 'To be quoted by name, add the name you want used.' };
  const followUp = b.followUp === true;
  const email = followUp && typeof b.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()) ? b.email.trim().slice(0, 120) : undefined;
  if (followUp && !email) return { error: 'To hear back when there is a new version, add an email address, or untick that box.' };
  /* Who is answering (R4 content, 2026-10-01): optional, one of two fixed values.
     It is kept INSIDE the encrypted answers blob (see onRequestPost), so it needs
     no column, no migration and no change to the chain, and it is never public. */
  const respondent = [INTERVIEW_RESPONDENT_SELF, INTERVIEW_RESPONDENT_CARER].includes(b.respondent) ? b.respondent : undefined;
  return { record: { consent: b.consent, name, answers, respondent, followUp, email, channel: channelOf(b.channel), receivedAt: new Date().toISOString() } };
}

export function summarizeInterviews(rows) {
  const dates = rows.map((r) => r.receivedAt).sort();
  return {
    ok: true, n: rows.length,
    firstAt: dates[0], lastAt: dates[dates.length - 1],
    consent: rows.reduce((m, r) => ((m[r.consent] = (m[r.consent] || 0) + 1), m), {}),
    note: 'Written interviews are held privately and are never served by any endpoint. Findings are published on the register as "a user said X, so we changed Y", with quotes only where the writer chose to be quoted.',
  };
}

/** Public-safe projection: consent, channel and dates. No ciphertext leaves this module. */
export async function interviewRows(env) {
  return (await all(env, 'SELECT id, consent, channel, follow_up, prev_hash, row_hash, received_at, reviewed_at FROM interviews ORDER BY received_at ASC, rowid ASC'))
    .map((r) => ({ id: r.id, consent: r.consent, channel: r.channel || 'direct', followUp: r.follow_up ? 1 : 0, prevHash: r.prev_hash ?? undefined, rowHash: r.row_hash ?? undefined, receivedAt: r.received_at, reviewedAt: r.reviewed_at ?? null }));
}

export async function onRequestPost({ request, env }) {
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  const v = validateInterview(body);
  if (v.error) return bad(v.error);
  const r = v.record;
  const short = tooShort(r);
  if (short) return bad(short);
  if (isDryRun(request)) return dryOk('interviews', { consent: r.consent, channel: r.channel, answered: Object.keys(r.answers).length }, await writeProbe(env, 'interviews'));
  /* `_respondent` is added after tooShort() has counted the answers, so it can
     never count as one. The admin screen shows it when present. Built here, from
     the validated record's two fields, never from the request body. */
  const blob = r.respondent ? Object.assign({}, r.answers, { _respondent: r.respondent }) : r.answers;
  let chain;
  try {
    chain = await appendChained(env, 'interviews', {
      consent: r.consent,
      name_enc: await encrypt(env, r.name),
      answers_enc: await encrypt(env, JSON.stringify(blob)),
      follow_up: r.followUp ? 1 : 0,
      email_enc: await encrypt(env, r.email),
      channel: r.channel, received_at: r.receivedAt,
    }, r);
  } catch { return bad('Could not record the interview. Nothing was saved.', 500); }
  await count(env, 'interview');
  /* S-04: the interview count gets the same distinct-sender denominator the
     survey has, counted outside the row and never with it (_senders.js). */
  await markSender(request, env, 'interview');
  return json({ ok: true, integrity: { prevHash: chain.prevHash, rowHash: chain.rowHash, position: chain.position }, ...panelCode(env, r.channel, 'interview') });
}

/** `n` stays the number of interviews written, as it always was; `senders` is
 *  how many distinct senders wrote them (never more than n). Interviews written
 *  before 2026-09-30 were never marked, so while the index is behind the rows
 *  `senders` runs low, which is the direction the denominator promises. */
export async function interviewsWithSenders(env, agg) {
  const s = withSendersCounted(agg, { key: 'senders', people: await peopleCount(env, 'interview'), submissions: agg.n ?? 0 });
  return { ...agg, senders: s.senders, senderBasis: s.senderBasis, denominator: s.denominator };
}

export async function onRequestGet({ env }) {
  try { return json(await interviewsWithSenders(env, await cachedAggregate(env, { kind: 'interviews', loadRows: interviewRows, aggregate: summarizeInterviews }))); }
  catch { return bad('The interview count could not be read right now.', 503); }
}

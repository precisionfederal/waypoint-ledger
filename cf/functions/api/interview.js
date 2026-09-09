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
import { cachedAggregate, writeProbe } from './_counters.js';
import { all, encrypt } from './_db.js';
import { appendChained } from './_hash.js';
import { INTERVIEW_QUESTIONS } from '../../../lib/survey-def.js';

const CONSENT = ['notes', 'quote-anonymously', 'quote-by-name'];

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
  return { record: { consent: b.consent, name, answers, followUp, email, channel: channelOf(b.channel), receivedAt: new Date().toISOString() } };
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
  if (isDryRun(request)) return dryOk('interviews', { consent: r.consent, channel: r.channel, answered: Object.keys(r.answers).length }, await writeProbe(env, 'interviews'));
  let chain;
  try {
    chain = await appendChained(env, 'interviews', {
      consent: r.consent,
      name_enc: await encrypt(env, r.name),
      answers_enc: await encrypt(env, JSON.stringify(r.answers)),
      follow_up: r.followUp ? 1 : 0,
      email_enc: await encrypt(env, r.email),
      channel: r.channel, received_at: r.receivedAt,
    }, r);
  } catch { return bad('Could not record the interview. Nothing was saved.', 500); }
  await count(env, 'interview');
  return json({ ok: true, integrity: { prevHash: chain.prevHash, rowHash: chain.rowHash, position: chain.position } });
}

export async function onRequestGet({ env }) {
  try { return json(await cachedAggregate(env, { kind: 'interviews', loadRows: interviewRows, aggregate: summarizeInterviews })); }
  catch { return bad('The interview count could not be read right now.', 503); }
}

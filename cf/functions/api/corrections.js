/* ==========================================================================
   POST /api/corrections — the demand signal back to government
   GET  /api/corrections — aggregate counts per federal source row

   A correction is a public assertion about ONE published federal figure, bound
   to the exact source row it concerns so it can be routed to the agency that
   published it. That binding is the point. Nothing here identifies a person: no
   name, no diagnosis, no IP address. A signed-in sender's account id is stored so
   /api/me can show them their own; it is never public, and deleting the account
   clears it. The optional note is stored and is NEVER served publicly (admin only).
   Every column of this table is on /privacy, generated from the schema by
   scripts/gen-privacy.mjs.

   Three things make the count worth reading (see /integrity):
     1. `priceId` must be one of the published rows in data/prices.json. A
        correction that names no federal figure is not a demand signal.
     2. One thumb per browser per figure per table version. The browser sends a
        random `submitterId` it keeps to itself; the server stores only a
        truncated hash bound to that figure, and refuses a repeat with 409.
     3. Every accepted row is hash-chained to the row before it, so the count
        cannot be edited afterwards without the published head changing.
     4. A vote costs something. Clearing a browser makes a fresh `submitterId`
        and defeats rule 2, so the same figure also carries a cooldown per
        network: FIGURE_CAP.hour in an hour, FIGURE_CAP.day in a day. A person
        who clears storage a hundred times still lands three votes, and a
        household of three is never blocked. The refusal is a 429, which the
        browser's outbox holds and re-sends later, so an honest fourth voter in
        one house loses nothing. Documented on /integrity, with the denominator
        (senders, not sends) published on /register.

   System of record: D1 `corrections`. The validator and the aggregate are pure
   functions so the Node route (next dev) and the tests use the same rules.
   ========================================================================== */
import { json, bad, readJson, str, num, oneOf, count, isDryRun, dryOk } from './_http.js';
import { cachedAggregate, writeProbe } from './_counters.js';
import { all, userOf } from './_db.js';
import { appendChained, submitterHash, figureBucket, pepperOf } from './_hash.js';
import prices from '../../../data/prices.json';

const NOTE_MAX = 600;

/** What one network may say about ONE figure. Not a limit on people: a limit on
 *  how far one machine can move a public count on its own. Quoted verbatim on
 *  /integrity; tests/corrections-cap.test.ts fails if the page and this
 *  disagree. */
export const FIGURE_CAP = { hour: 3, day: 8 };

/** Count one vote against this network's bucket for this figure. Returns
 *  { allowed, scope } — `scope` names which window refused it, so the sentence
 *  the person reads is the truth and not a generic 429. Best effort: if KV is
 *  unavailable the vote is allowed, because losing a real correction is worse
 *  than counting one extra. */
export async function chargeFigure(env, bucket) {
  if (!bucket || !env || !env.LEDGER) return { allowed: true, scope: null };
  const now = new Date().toISOString();
  const windows = [
    { key: `cf:h:${now.slice(0, 13)}:${bucket}`, cap: FIGURE_CAP.hour, ttl: 3700, scope: 'hour' },
    { key: `cf:d:${now.slice(0, 10)}:${bucket}`, cap: FIGURE_CAP.day, ttl: 90000, scope: 'day' },
  ];
  try {
    const counts = await Promise.all(windows.map((w) => env.LEDGER.get(w.key)));
    for (let i = 0; i < windows.length; i++) {
      if (Number(counts[i] || 0) >= windows[i].cap) return { allowed: false, scope: windows[i].scope };
    }
    await Promise.all(windows.map((w, i) => env.LEDGER.put(w.key, String(Number(counts[i] || 0) + 1), { expirationTtl: w.ttl })));
  } catch { return { allowed: true, scope: null }; }
  return { allowed: true, scope: null };
}

/** The published figures. A correction must name one of these and nothing else. */
export const PRICE_IDS = new Set((prices.items || []).map((i) => i.id));

/** Validate a POST body. Returns { record } or { error }. Pure. */
export function validateCorrection(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'Body must be a JSON object.' };
  const priceId = typeof b.priceId === 'string' ? b.priceId.trim() : '';
  if (!priceId || priceId.length > 120) return { error: 'priceId is required.' };
  if (!PRICE_IDS.has(priceId)) return { error: 'That identifier is not a published figure in this table.' };
  const verdict = oneOf(b.verdict, ['right', 'wrong']);
  if (!verdict) return { error: "verdict must be 'right' or 'wrong'." };
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.slice(0, NOTE_MAX) : undefined;
  let believedValueUsd;
  if (b.believedValueUsd === null || b.believedValueUsd === undefined) believedValueUsd = null;
  else if (num(b.believedValueUsd, 0, 9_999_999.99) !== undefined) believedValueUsd = b.believedValueUsd;
  else return { error: 'believedValueUsd must be a plausible dollar amount or null.' };
  return {
    record: {
      priceId, verdict, note, believedValueUsd,
      priceTableVersion: str(b.priceTableVersion, 40),
      journeyId: str(b.journeyId, 64),
      submitterId: str(b.submitterId, 120),
      receivedAt: new Date().toISOString(),
    },
  };
}

/** The public aggregate. Pure; takes records, not D1 rows. */
export function aggregateCorrections(rows) {
  if (!rows.length) return { ok: true, totals: {}, senders: 0, figures: 0, note: 'No corrections recorded yet.' };
  const totals = {};
  /* The denominator a statistician asks for first: how many DISTINCT senders,
     not how many sends. A sender is one browser on one network, never a
     verified person — /register says so in that many words. Only the count
     leaves this function; the keys themselves are never published. */
  const senders = new Set(rows.map((r) => r.senderKey).filter(Boolean));
  for (const r of rows) {
    const t = (totals[r.priceId] ||= { right: 0, wrong: 0, believed: [] });
    if (r.verdict === 'wrong') t.wrong++; else t.right++;
    if (typeof r.believedValueUsd === 'number') t.believed.push(r.believedValueUsd);
  }
  const summary = Object.entries(totals).map(([priceId, t]) => {
    const b = [...t.believed].sort((x, y) => x - y);
    return {
      priceId, confirmedRight: t.right, flaggedWrong: t.wrong,
      publicMedianBelievedUsd: b.length ? b[Math.floor(b.length / 2)] : null,
      note: 'publicMedianBelievedUsd is a demand signal about the published figure. It is never used to price a ledger.',
    };
  }).sort((a, b) => b.flaggedWrong - a.flaggedWrong);
  const dates = rows.map((r) => r.receivedAt).filter(Boolean).sort();
  return {
    ok: true, summary,
    sends: rows.length,
    senders: senders.size,
    figures: summary.length,
    firstAt: dates[0], lastAt: dates[dates.length - 1],
  };
}

/** D1 row -> the canonical record shape used by the aggregate and the CSV export. */
export const correctionOf = (r) => ({
  id: r.id,
  priceId: r.price_id,
  verdict: r.verdict,
  believedValueUsd: r.believed_usd === null ? null : Number(r.believed_usd),
  note: r.note ?? undefined,
  priceTableVersion: r.table_version ?? undefined,
  journeyId: r.journey_id ?? undefined,
  receivedAt: r.received_at,
  prevHash: r.prev_hash ?? undefined,
  rowHash: r.row_hash ?? undefined,
  /* Counted, never published. The CSV export writes a fixed column list and the
     chain projection a fixed key list, so this can never reach either. It exists
     so aggregateCorrections can publish a denominator of senders. */
  senderKey: r.submitter_hash ?? undefined,
});

/** Every correction, oldest first (the order the CSV export publishes and the
 *  order the chain was written in: rowid breaks a tie inside one millisecond). */
export async function correctionRows(env) {
  return (await all(env, 'SELECT * FROM corrections ORDER BY received_at ASC, rowid ASC')).map(correctionOf);
}

/** What this figure now stands at — returned to the person who just spoke, so
 *  the ledger can say "you are the Nth person to say this". */
export async function tallyFor(env, priceId) {
  const r = await env.DB.prepare(
    "SELECT SUM(CASE WHEN verdict='right' THEN 1 ELSE 0 END) AS r, SUM(CASE WHEN verdict='wrong' THEN 1 ELSE 0 END) AS w, COUNT(*) AS n FROM corrections WHERE price_id=?1",
  ).bind(priceId).first();
  return { confirmedRight: Number(r?.r || 0), flaggedWrong: Number(r?.w || 0), n: Number(r?.n || 0) };
}

export async function onRequestPost({ request, env }) {
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  const v = validateCorrection(body);
  if (v.error) return bad(v.error);
  const r = v.record;
  if (isDryRun(request)) return dryOk('corrections', { priceId: r.priceId, verdict: r.verdict }, await writeProbe(env, 'corrections'));
  const sub = await submitterHash(r.submitterId, r.priceId, r.priceTableVersion, pepperOf(env));
  let chain;
  try {
    if (sub) {
      const dupe = await env.DB.prepare('SELECT id FROM corrections WHERE price_id=?1 AND submitter_hash=?2').bind(r.priceId, sub).first();
      if (dupe) {
        return json({ ok: false, error: 'You have already told us about this figure.', already: true, tally: await tallyFor(env, r.priceId) }, 409);
      }
    }
    /* The cooldown is charged AFTER the duplicate check, so a person pressing
       the same thumb twice is told they already spoke rather than spending a
       vote, and BEFORE the insert, so a refusal never leaves a row. */
    const charge = await chargeFigure(env, await figureBucket(request, env, r.priceId, r.priceTableVersion));
    if (!charge.allowed) {
      return json({
        ok: false,
        error: charge.scope === 'hour'
          ? 'This network has already sent ' + FIGURE_CAP.hour + ' corrections about this figure in the last hour. Yours is held on your device and will be sent later.'
          : 'This network has already sent ' + FIGURE_CAP.day + ' corrections about this figure today. Yours is held on your device and will be sent later.',
        retryAfter: charge.scope,
        tally: await tallyFor(env, r.priceId),
      }, 429);
    }
    const who = await userOf(env, request).catch(() => null);
    chain = await appendChained(env, 'corrections', {
      user_id: who ? who.id : null,
      price_id: r.priceId, verdict: r.verdict, believed_usd: r.believedValueUsd,
      note: r.note ?? null, table_version: r.priceTableVersion ?? null,
      journey_id: r.journeyId ?? null, submitter_hash: sub, received_at: r.receivedAt,
    }, r);
  } catch { return bad('Could not record the correction. Nothing was saved.', 500); }
  await count(env, 'corrections');
  return json({
    ok: true,
    recorded: r.priceId,
    tally: await tallyFor(env, r.priceId),
    integrity: { prevHash: chain.prevHash, rowHash: chain.rowHash, position: chain.position },
  });
}

export async function onRequestGet({ env }) {
  try { return json(await cachedAggregate(env, { kind: 'corrections', loadRows: correctionRows, aggregate: aggregateCorrections })); }
  catch { return bad('The corrections aggregate could not be read right now.', 503); }
}

/* ==========================================================================
   HOW MANY PEOPLE, NOT HOW MANY SENDS.

   R6 edge #3, verbatim: "The register's N counts submissions, not people — one
   browser posted four 'respondents'." /api/survey published `n` and /api/gap
   published `respondents`, and both were rows.length. A reviewer who reloaded
   the page twice owned the headline of the instrument Dr. Phillips asked for.

   corrections.js already answers this — it publishes `senders` (distinct)
   beside `sends` (rows) — because a correction carries a submitter hash ON its
   row. The survey and the gap report cannot: their columns are published on
   /privacy, generated from the schema, and fixed by the chain projection, so
   nothing about a sender may be written into a row here.

   So a sender is counted OUTSIDE the row and never with it. The bucket is a
   truncated hash of the network key (which already rolls every day and carries
   a server secret, see _hash.js) plus the instrument's name. The first send
   from a bucket increments a cumulative counter; every later send from it does
   not. No row references the bucket, the bucket cannot be reversed to an
   address, and the only thing that ever leaves this module is a count.

   What that count is, exactly — the page says it in these words:
     · one network on one day counts once, so a demo room on one wifi counts as
       ONE sender. That is an undercount, and it is the direction we would
       rather be wrong in;
     · a sender is never a verified person;
     · it is never larger than the number of sends.
   ========================================================================== */
import { sha256Hex, networkKey } from './_hash.js';

/** A bucket is kept long enough that a person returning next month is not
 *  counted twice by this counter running out. */
export const SENDER_TTL = 60 * 60 * 24 * 400;

export const DENOMINATOR =
  'Distinct senders, counted outside the row: one network on one day, counted once, never a verified person. A room on one shared connection counts as one sender, so this number runs low, never high. "submissions" is how many were sent.';

export const NO_INDEX_DENOMINATOR =
  'The sender index could not be read, so this number counts sends, not senders. It may count one browser more than once.';

const key = (kind, bucket) => `snd:${kind}:${bucket}`;
const peopleKey = (kind) => `snd:${kind}:people`;

/** The bucket one network's sends to ONE instrument are counted in. */
export async function senderBucket(request, env, kind) {
  try { return (await sha256Hex((await networkKey(request, env)) + ' ' + kind)).slice(0, 24); }
  catch { return null; }
}

/** Count this send's sender once, after the row is safely written. Best effort:
 *  a KV failure never costs a person their answer, it only leaves the
 *  denominator behind, and the denominator says so. Returns the new people
 *  count when this send was a new sender, else null. */
export async function markSender(request, env, kind) {
  if (!env || !env.LEDGER) return null;
  const bucket = await senderBucket(request, env, kind);
  if (!bucket) return null;
  try {
    if (await env.LEDGER.get(key(kind, bucket))) return null;
    await env.LEDGER.put(key(kind, bucket), '1', { expirationTtl: SENDER_TTL });
    const n = Number((await env.LEDGER.get(peopleKey(kind))) || 0) + 1;
    await env.LEDGER.put(peopleKey(kind), String(n));
    return n;
  } catch { return null; }
}

/** The cumulative distinct-sender count, or null when it cannot be read. */
export async function peopleCount(env, kind) {
  if (!env || !env.LEDGER) return null;
  try {
    const v = await env.LEDGER.get(peopleKey(kind));
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch { return null; }
}

/**
 * Pure. Publish people under the name the page already reads (`n` for the
 * survey, `respondents` for the gap) and sends beside it as `submissions`.
 *
 * JUDGE-4 #6: those legacy names meant senders here and answers or reports on
 * /api/register. They keep their values (deprecated aliases, lib/count-fields.ts),
 * and every result now also carries `senders` and, when `noun` is given, the
 * sends under their own name (`answers` for the survey, `reports` for the gap).
 *
 * A count of senders is never allowed to exceed the sends it came from, and a
 * sample that has at least one send has at least one sender.
 *
 * @param {Record<string, any>} agg
 * @param {{ key?: string, people: any, submissions: any, noun?: 'answers' | 'reports' }} opts
 * @returns {Record<string, any>}
 */
export function withSenders(agg, { key: field = 'n', people, submissions, noun }) {
  const sends = Number.isFinite(Number(submissions)) ? Math.max(0, Math.floor(Number(submissions))) : 0;
  const named = (senders) => ({ senders, ...(noun ? { [noun]: sends } : {}) });
  if (sends === 0) return { ...agg, ...named(0), [field]: 0, submissions: 0, senderBasis: 'none', denominator: DENOMINATOR };
  const known = people !== null && people !== undefined && Number.isFinite(Number(people));
  if (!known) return { ...agg, ...named(sends), [field]: sends, submissions: sends, senderBasis: 'sends', denominator: NO_INDEX_DENOMINATOR };
  const senders = Math.max(1, Math.min(Math.floor(Number(people)), sends));
  return {
    ...agg,
    ...named(senders),
    [field]: senders,
    submissions: sends,
    senderBasis: 'senders',
    denominator: DENOMINATOR,
  };
}

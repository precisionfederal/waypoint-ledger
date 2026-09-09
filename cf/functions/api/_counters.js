/* ==========================================================================
   THE REGISTER READS THE SAME SPEED AT TEN ROWS AND AT A HUNDRED THOUSAND.

   Every aggregate GET used to run SELECT * and reduce the whole table in
   JavaScript. That is fine on the day nobody has answered and it is the wrong
   shape on the day the tool works — the day a national response arrives is not
   the day to discover the register cannot serve it.

   The fix keeps ONE definition of every aggregate. The pure functions that
   already existed (aggregateCorrections, aggregateGap, aggregateSurvey,
   summarizeInterviews) stay the only place a number is computed; what changes
   is that their OUTPUT is materialised in `agg` and served from one row.

   IT CAN NEVER BE STALE. The cache stores the fingerprint of the rows it was
   folded from: the row count and the chain head. An append moves the head; a
   delete moves the count; a delete plus an append moves both. If the pair on
   the cache is not the pair on the table right now, the cache is ignored, the
   rows are folded again and the cache is replaced. So this is not a time-based
   cache with a window of wrongness — a person who has just spoken sees their
   own count move, immediately, which is the whole promise of the thing.

   That is also why the aggregate GETs stay `cache-control: no-store`: the
   speed comes from here, not from a timer that would hand a fresh visitor a
   number that is a minute old on the one day it matters.
   ========================================================================== */

/** kind -> the D1 table it is folded from. The kind is what the API calls it;
 *  the table is what the schema calls it. */
export const AGG_SOURCE = {
  corrections: 'corrections',
  gap: 'gap_reports',
  survey: 'survey_responses',
  interviews: 'interviews',
};

/** Pure. Is a cached fold exactly the rows that are in the table right now? */
export function isFresh(cached, fingerprint) {
  if (!cached || !fingerprint) return false;
  if (typeof cached.payload_json !== 'string' || !cached.payload_json) return false;
  if (Number(cached.rows_folded) !== Number(fingerprint.rows)) return false;
  return String(cached.head_hash || '') === String(fingerprint.head || '');
}

/** Pure. The stored payload, or null if it cannot be read — an unreadable
 *  cache is a cache miss, never an error a reader sees. */
export function parsePayload(cached) {
  try { const v = JSON.parse(cached.payload_json); return v && typeof v === 'object' ? v : null; } catch { return null; }
}

/** The row count and chain head for one table, in one round trip with the
 *  cached row. Returns { cached, fingerprint }. */
export async function readCache(env, kind, table) {
  const res = await env.DB.batch([
    env.DB.prepare('SELECT kind, rows_folded, head_hash, payload_json, updated_at FROM agg WHERE kind=?1').bind(kind),
    env.DB.prepare(`SELECT (SELECT COUNT(*) FROM ${table}) AS rows, (SELECT head_hash FROM integrity_heads WHERE table_name=?1) AS head`).bind(table),
  ]);
  const cached = (res?.[0]?.results || [])[0] || null;
  const fp = (res?.[1]?.results || [])[0] || null;
  return { cached, fingerprint: fp ? { rows: Number(fp.rows || 0), head: String(fp.head || '') } : null };
}

/** Replace the fold for one kind. Best effort: a register that cannot cache is
 *  still a register that answers. */
export async function writeCache(env, kind, fingerprint, payload) {
  await env.DB.prepare(
    'INSERT INTO agg (kind, rows_folded, head_hash, payload_json, updated_at) VALUES (?1,?2,?3,?4,?5)' +
    ' ON CONFLICT(kind) DO UPDATE SET rows_folded=excluded.rows_folded, head_hash=excluded.head_hash, payload_json=excluded.payload_json, updated_at=excluded.updated_at',
  ).bind(kind, Number(fingerprint.rows), String(fingerprint.head || ''), JSON.stringify(payload), new Date().toISOString()).run();
}

/**
 * Serve an aggregate from the fold when the fold is exactly current, and fold
 * it again when it is not. The aggregate function is the caller's — this
 * module never computes a published number itself.
 *
 * @param {*} env
 * @param {{kind:string, loadRows:(env:any)=>Promise<any[]>, aggregate:(rows:any[])=>object}} spec
 */
export async function cachedAggregate(env, { kind, loadRows, aggregate }) {
  const table = AGG_SOURCE[kind];
  if (!table) throw new Error('No aggregate source for ' + kind);
  let cached = null; let fingerprint = null;
  try { ({ cached, fingerprint } = await readCache(env, kind, table)); } catch { cached = null; fingerprint = null; }

  if (isFresh(cached, fingerprint)) {
    const payload = parsePayload(cached);
    if (payload) return { ...payload, fold: { hit: true, rows: Number(cached.rows_folded), foldedAt: cached.updated_at } };
  }

  const rows = await loadRows(env);
  const payload = aggregate(rows);
  const fp = fingerprint || { rows: rows.length, head: '' };
  const stamp = { rows: rows.length, head: fp.head };
  try { await writeCache(env, kind, stamp, payload); } catch { /* the fold is an optimisation, never a precondition */ }
  return { ...payload, fold: { hit: false, rows: rows.length, foldedAt: new Date().toISOString() } };
}

/** Prove the resources a write needs are present — the D1 binding, the table,
 *  and the chain head an append is written against — without inserting. Used by
 *  ?dry=1 so a deploy can verify the write path with no row in the register. */
export async function writeProbe(env, kind) {
  const table = AGG_SOURCE[kind];
  if (!table) return { ok: false, reason: 'unknown kind' };
  try {
    const row = await env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM ${table}) AS rows, (SELECT head_hash FROM integrity_heads WHERE table_name=?1) AS head`,
    ).bind(table).first();
    const head = String(row?.head || '');
    return { ok: Boolean(head), table, rows: Number(row?.rows ?? 0), head };
  } catch { return { ok: false, table, reason: 'the database did not answer' }; }
}

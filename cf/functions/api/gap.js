/* ==========================================================================
   POST /api/gap — a report of what federal health data could not see
   GET  /api/gap — the aggregate: the measured shape of the gap

   MEPS, HCUP and CMS claims record care that was DELIVERED AND BILLED. A person
   who needed care and did not get it produces no row in any of them. This
   endpoint counts that absence in a structured form, and carries the community's
   own ranking of which uncounted cost weighed most — a weighting with a stated
   basis, elicited from the people who carried it.

   Privacy is the precondition: no name, no diagnosis, no IP, no cookie. The
   optional note is stored and is NEVER served publicly (admin only).
   System of record: D1 `gap_reports`.
   ========================================================================== */
import { json, bad, readJson, str, count, isDryRun, dryOk } from './_http.js';
import { cachedAggregate, writeProbe } from './_counters.js';
import { all, userOf } from './_db.js';
import { appendChained } from './_hash.js';

export const CATEGORY_IDS = ['care-not-sought', 'care-denied', 'dismissed', 'wrong-track', 'time-searching', 'life-lost'];
const CTX_KEYS = ['ageBand', 'insurance', 'region', 'urbanicity'];

/** Validate a POST body. Returns { record } or { error }. Pure. */
export function validateGap(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'Body must be a JSON object.' };
  const counts = {};
  if (b.counts && typeof b.counts === 'object') {
    for (const [k, v] of Object.entries(b.counts)) {
      if (!CATEGORY_IDS.includes(k)) continue;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10_000) continue;
      counts[k] = Math.floor(v);
    }
  }
  const ranking = [];
  if (Array.isArray(b.ranking)) for (const r of b.ranking) if (typeof r === 'string' && CATEGORY_IDS.includes(r) && !ranking.includes(r)) ranking.push(r);
  if (!Object.values(counts).some((v) => v > 0) && !ranking.length) return { error: 'A gap report needs at least one count or one ranking.' };
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.slice(0, 400) : undefined;
  const ctxIn = b.context && typeof b.context === 'object' ? b.context : {};
  const context = {};
  for (const k of CTX_KEYS) { const v = str(ctxIn[k], 40); if (v) context[k] = v; }
  return {
    record: {
      counts, ranking, note,
      context: Object.keys(context).length ? context : undefined,
      receivedAt: new Date().toISOString(),
      tableVersion: str(b.tableVersion, 40),
    },
  };
}

/** The public aggregate. Pure; takes records, not D1 rows. */
export function aggregateGap(rows) {
  if (!rows.length) return { ok: true, respondents: 0, note: 'No gap reports yet. This endpoint reports only what people have actually sent.' };
  const totals = {}, rankFirst = {}, rankAny = {};
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.counts || {})) { const t = (totals[k] ||= { reports: 0, sum: 0 }); t.reports++; t.sum += v; }
    if (r.ranking?.length) { rankFirst[r.ranking[0]] = (rankFirst[r.ranking[0]] || 0) + 1; for (const id of r.ranking) rankAny[id] = (rankAny[id] || 0) + 1; }
  }
  const gap = Object.entries(totals).map(([id, t]) => ({ category: id, respondentsReporting: t.reports, totalReported: t.sum, meanPerRespondent: +(t.sum / t.reports).toFixed(1) })).sort((a, b) => b.respondentsReporting - a.respondentsReporting);
  const communityWeights = Object.keys(rankAny).map((id) => ({ category: id, rankedFirstBy: rankFirst[id] || 0, rankedAtAllBy: rankAny[id] })).sort((a, b) => b.rankedFirstBy - a.rankedFirstBy);
  const coverage = {};
  for (const k of CTX_KEYS) coverage[k] = rows.reduce((m, r) => { const v = (r.context && r.context[k]) || 'not stated'; m[v] = (m[v] || 0) + 1; return m; }, {});
  const dates = rows.map((r) => r.receivedAt).sort();
  return {
    ok: true, respondents: rows.length, firstAt: dates[0], lastAt: dates[dates.length - 1], gap, communityWeights, coverage,
    method: 'Counts and rankings are reported exactly as respondents entered them. No imputation, no weighting scheme of our own, no extrapolation to a population. This is a description of the sample that answered, nothing more.',
  };
}

const parse = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

/** D1 row -> the canonical record shape. */
export const gapOf = (r) => ({
  id: r.id,
  prevHash: r.prev_hash ?? undefined,
  rowHash: r.row_hash ?? undefined,
  counts: parse(r.counts_json, {}),
  ranking: parse(r.ranking_json, []),
  note: r.note ?? undefined,
  context: parse(r.context_json, undefined),
  tableVersion: r.table_version ?? undefined,
  receivedAt: r.received_at,
});

export async function gapRows(env) {
  return (await all(env, 'SELECT * FROM gap_reports ORDER BY received_at ASC, rowid ASC')).map(gapOf);
}

export async function onRequestPost({ request, env }) {
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  const v = validateGap(body);
  if (v.error) return bad(v.error);
  const r = v.record;
  if (isDryRun(request)) return dryOk('gap', { counts: r.counts, ranking: r.ranking }, await writeProbe(env, 'gap'));
  let chain;
  try {
    const who = await userOf(env, request).catch(() => null);
    chain = await appendChained(env, 'gap_reports', {
      user_id: who ? who.id : null,
      counts_json: JSON.stringify(r.counts), ranking_json: JSON.stringify(r.ranking),
      note: r.note ?? null, context_json: r.context ? JSON.stringify(r.context) : null,
      table_version: r.tableVersion ?? null, received_at: r.receivedAt,
    }, r);
  } catch { return bad('Could not record the report. Nothing was saved.', 500); }
  await count(env, 'gap');
  return json({ ok: true, integrity: { prevHash: chain.prevHash, rowHash: chain.rowHash, position: chain.position } });
}

export async function onRequestGet({ env }) {
  try { return json(await cachedAggregate(env, { kind: 'gap', loadRows: gapRows, aggregate: aggregateGap })); }
  catch { return bad('The gap aggregate could not be read right now.', 503); }
}

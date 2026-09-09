/* ==========================================================================
   GET /api/integrity — the register's heads, so anyone can check the count.
   GET /api/integrity?verify=1 — we walk every chain ourselves and publish the
   result, including a failure. The walk is exactly the one a third party runs
   against the CSV export, in the same order, with the same formula.

   Public, no identifiers, counts only.
   ========================================================================== */
import { json, bad } from './_http.js';
import { one } from './_db.js';
import { heads, verifyChain, GENESIS, PUBLISHED, CHAINED_TABLES, SURVEY_CTX_KEYS } from './_hash.js';
import { correctionRows } from './corrections.js';
import { gapRows } from './gap.js';
import { surveyRows } from './survey.js';
import { interviewRows } from './interview.js';
import prices from '../../../data/prices.json';

const LOADER = { corrections: correctionRows, gap_reports: gapRows, survey_responses: surveyRows, interviews: interviewRows };

/** The field list each chain covers, published so the formula is reproducible. */
export const COVERED = {
  corrections: ['received_at', 'price_id', 'verdict', 'believed_usd', 'table_version'],
  gap_reports: ['received_at', 'counts', 'ranking', 'table_version'],
  survey_responses: ['received_at', 'channel', 'ranking', 'unasked', 'lead', 'decide', 'clinicians', 'context (' + SURVEY_CTX_KEYS.join(', ') + ')', 'survey_version'],
  interviews: ['received_at', 'consent', 'channel', 'follow_up'],
};

export const METHOD = {
  formula: 'row_hash = SHA-256( prev_hash + canonical_json(covered fields) ), lower-case hex; the first row of a table uses prev_hash = 64 zeros.',
  canonicalJson: 'JSON with object keys sorted by code point at every level, no whitespace, undefined written as null.',
  covers: 'Exactly the fields listed under covers[] for each table — the same fields the public CSV export publishes. An optional note, an encrypted sentence and every interview answer are outside the chain on purpose: they are never published, so nobody outside could ever check a hash taken over them.',
  proves: 'No published row was edited, deleted or reordered after it was written without the head changing.',
  doesNotProve: 'That the people who wrote the rows are distinct people, or that every row received was published. Those are different claims, and this endpoint does not make them.',
  recompute: 'Download /api/export/corrections.csv, walk it top to bottom, and recompute each row_hash from the row above. The head you land on is the head published here.',
};

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const verify = url.searchParams.get('verify') === '1';
  let list;
  try { list = await heads(env); } catch { return bad('The integrity heads could not be read right now.', 503); }

  /* Rows written before migration 0002 carry no hash. Say how many rather than
     letting the head imply they are covered. */
  let unchained = {};
  try {
    const row = await one(env, 'SELECT ' + CHAINED_TABLES.map((t) => `(SELECT COUNT(*) FROM ${t} WHERE row_hash IS NULL) AS ${t}`).join(', '));
    for (const t of CHAINED_TABLES) unchained[t] = Number(row?.[t] ?? 0);
  } catch { unchained = {}; }

  const tables = [];
  for (const h of list) {
    const entry = { ...h, covers: COVERED[h.table] || [], unchainedLegacyRows: unchained[h.table] ?? null };
    if (verify) {
      try {
        const rows = (await LOADER[h.table](env)).filter((r) => r.rowHash);
        const res = await verifyChain(h.table, rows);
        entry.verified = { ok: res.ok && (rows.length === 0 ? h.head === GENESIS : res.head === h.head), walked: res.length, recomputedHead: res.head, brokeAt: res.brokeAt, reason: res.reason ?? null };
      } catch { entry.verified = { ok: null, reason: 'This chain could not be walked right now.' }; }
    }
    tables.push(entry);
  }

  return json({
    ok: true,
    genesis: GENESIS,
    priceTableVersion: prices._version || 'unknown',
    publishedFigures: (prices.items || []).length,
    chains: CHAINED_TABLES.length,
    tables,
    method: METHOD,
    projections: Object.fromEntries(Object.keys(PUBLISHED).map((t) => [t, COVERED[t]])),
    generatedAt: new Date().toISOString(),
  }, 200, verify ? {} : { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' });
}

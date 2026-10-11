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
import { dayOf, dayStamp } from './_cells.js';
import { teamTestCount } from './_annotations.js';
/* The count of published figures is the table the ledger prices from — the same
   TABLE /api/health (via build.json), public/data/price-table.json and the
   corrections validator use. It used to be data/prices.json alone, which printed
   117 here while every other surface said 274 (2026-10-01; see
   tests/figure-count.test.ts). */
import { TABLE, TABLE_VERSION } from '../../../lib/table.ts';

const LOADER = { corrections: correctionRows, gap_reports: gapRows, survey_responses: surveyRows, interviews: interviewRows };

/** The field list each chain covers, published so the formula is reproducible. */
export const COVERED = {
  corrections: ['received_at', 'price_id', 'verdict', 'believed_usd', 'table_version'],
  gap_reports: ['received_at', 'counts', 'ranking', 'table_version'],
  survey_responses: ['received_at', 'channel', 'ranking', 'unasked', 'lead', 'decide', 'clinicians', 'context (' + SURVEY_CTX_KEYS.join(', ') + ')', 'survey_version'],
  interviews: ['received_at', 'consent', 'channel', 'follow_up'],
};

/** What each CSV lets a stranger do with the chain. The survey and gap files
 *  publish the day and leave out the self-description (see export/[kind].js),
 *  so there the chain is checked link by link, not recomputed. */
export const IN_CSV = {
  corrections: { file: '/api/export/corrections.csv', check: 'recompute', withheld: [] },
  gap_reports: { file: '/api/export/gap.csv', check: 'links', withheld: ['received_at (published as the day only, received_on)'] },
  survey_responses: { file: '/api/export/survey.csv', check: 'links', withheld: ['received_at (published as the day only, received_on)', 'context (every self-description: published only as counts at /api/survey, with any value under 11 answers not shown)'] },
  interviews: null,
};

export const METHOD = {
  formula: 'row_hash = SHA-256( prev_hash + canonical_json(covered fields) ), lower-case hex; the first row of a table uses prev_hash = 64 zeros.',
  canonicalJson: 'JSON with object keys sorted by code point at every level, no whitespace, undefined written as null.',
  covers: 'Exactly the fields listed under covers[] for each table, as they were written. For corrections every one of them is in the CSV. For survey answers and gap reports the CSV leaves some out on purpose (inCsv.withheld): the time of day, and on the survey every self-description, because one row carrying all of them could point at a person. An optional note, an encrypted sentence and every interview answer were never in the chain: they are never published.',
  proves: 'No row was edited, deleted or reordered after it was written without the head changing.',
  doesNotProve: 'That the people who wrote the rows are distinct people, or that every row received was published. Those are different claims, and this endpoint does not make them. On the survey and gap files a stranger checks the links between rows, not the content of each row: the hash was taken over fields those files no longer publish.',
  teamTests: 'Rows we wrote ourselves while testing the form are never deleted, because deleting one would break the chain. They are marked by row_hash in a separate append-only table (GET /api/annotations), flagged team_test in every CSV, and left out of every published count. A mark never changes a row or its hash, so this walk covers every row, marked or not; teamTestRows says how many rows of each table are marked.',
  recompute: 'corrections.csv: walk it top to bottom and recompute each row_hash from the row above. survey.csv and gap.csv: check that the first prev_hash is 64 zeros, that each prev_hash equals the row_hash above it, and that the last row_hash and the row count match the head published here. We walk every chain over the stored rows ourselves at ?verify=1.',
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

  /* How many rows of each chain are marked as our own tests. Counted, never
     excluded: the walk below covers every row (_annotations.js). */
  const marked = {};
  for (const t of CHAINED_TABLES) marked[t] = await teamTestCount(env, t);

  const tables = [];
  for (const h of list) {
    /* The head moves the moment a row lands, so its time to the millisecond is
       the time that row arrived. Published as the day, like every other date
       on the register (cf/functions/api/_cells.js). */
    const entry = { ...h, updatedAt: dayStamp(h.updatedAt), updatedOn: dayOf(h.updatedAt), covers: COVERED[h.table] || [], inCsv: IN_CSV[h.table] ?? null, unchainedLegacyRows: unchained[h.table] ?? null, teamTestRows: marked[h.table] ?? 0 };
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
    priceTableVersion: TABLE_VERSION,
    publishedFigures: TABLE.length,
    chains: CHAINED_TABLES.length,
    tables,
    method: METHOD,
    projections: Object.fromEntries(Object.keys(PUBLISHED).map((t) => [t, COVERED[t]])),
    generatedAt: new Date().toISOString(),
  }, 200, verify ? {} : { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' });
}

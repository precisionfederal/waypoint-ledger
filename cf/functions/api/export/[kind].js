/* ==========================================================================
   GET /api/export/{corrections|gap|survey}.csv — the de-identified register.

   An agency, a researcher or a committee staffer can take these without asking
   us. Free-text fields are never exported; interviews are never exported at
   all. Rows are published oldest first, the order they arrived — which is also
   the order of the integrity chain, so the last column of the last row is the
   head published at /api/integrity.
   Columns are fixed: data/dictionary.csv describes every one of them, and the
   corrections file publishes its own column contract at
   /api/export/corrections.json.

   The corrections export is written by cf/functions/api/export/_defect-report.js
   — one definition, so this route and /api/export/corrections.csv can never
   publish two different files.

   SAFE TO OPEN: cf/functions/api/export/_csv.js quotes any cell a spreadsheet
   would execute.
   ========================================================================== */
import { bad } from '../_http.js';
import { csvOf, isFormulaCell } from './_csv.js';
import { correctionsDefectCsv } from './_defect-report.js';
import { correctionRows } from '../corrections.js';
import { gapRows } from '../gap.js';
import { surveyRows } from '../survey.js';
import { withTeamTestFlags } from '../_annotations.js';
import { CSV_TABLE } from '../_hash.js';

const GAP_IDS = ['care-not-sought', 'care-denied', 'dismissed', 'wrong-track', 'time-searching', 'life-lost', 'care-made-worse'];
import { dayOf } from '../_cells.js';

export { csvOf, isFormulaCell };

/* ==========================================================================
   WHAT THE SURVEY AND GAP FILES NO LONGER CARRY (2026-10-01).

   Until today survey.csv published, for every answer, the time to the
   millisecond, the channel, and every optional self-description: age band,
   sex, coverage, region, state, stage, who answered, and the ages at onset
   and diagnosis. One row per person with all of that is a quasi-identifier,
   and the survey promised that no small count could point at anybody. So:

     - no ctx_ column is published. Those answers are published only as
       counts, at /api/survey, where any value under SMALL_CELL_MIN is not
       shown (cf/functions/api/_cells.js);
     - the time becomes the day: received_on, YYYY-MM-DD (UTC);
     - each row carries prev_hash and row_hash, so a stranger can still walk
       the chain row by row: the first prev_hash is 64 zeros, each prev_hash
       is the row_hash above it, and the last row_hash is the head at
       /api/integrity. What a stranger can no longer do on these two files is
       recompute a row_hash, because the hash was taken over the full time and
       the self-description, which we no longer publish. The chain in D1 is
       not rewritten: every stored hash is the hash it always was, and
       /api/integrity?verify=1 still walks it over the stored rows.

   corrections.csv is unchanged: a correction describes a federal figure and
   carries nothing about the person, and a stranger can still recompute every
   hash in it from the file alone.
   ========================================================================== */
/* team_test (migration 0007): true on a row we marked as our own team testing
   the form. The row stays, its hashes stay, and every count at /api/survey and
   /api/gap leaves it out. Placed before prev_hash so row_hash stays the last
   column and the head stays the last cell. Outside the chain: _hash.js
   UNCHAINED_CSV says why. */
export const SURVEY_CSV_HEADER = ['received_on', 'channel', 'rank_1', 'rank_2', 'rank_3', 'rank_4', 'rank_5', 'unasked', 'lead', 'decide', 'clinicians', 'survey_version', 'team_test', 'prev_hash', 'row_hash'];
export const GAP_CSV_HEADER = ['received_on', ...GAP_IDS, 'rank_1', 'rank_2', 'rank_3', 'rank_4', 'rank_5', 'rank_6', 'rank_7', 'table_version', 'team_test', 'prev_hash', 'row_hash'];
const tt = (r) => (r.teamTest ? 'true' : 'false');

export function exportRows(kind, rows, opts = {}) {
  if (kind === 'corrections') return correctionsDefectCsv(rows, opts);
  if (kind === 'gap') return csvOf(
    GAP_CSV_HEADER,
    rows.map((r) => [dayOf(r.receivedAt) || '', ...GAP_IDS.map((id) => (r.counts && typeof r.counts[id] === 'number' ? r.counts[id] : '')), ...GAP_IDS.map((_, i) => (r.ranking && r.ranking[i]) || ''), r.tableVersion || '', tt(r), r.prevHash || '', r.rowHash || '']));
  if (kind === 'survey') return csvOf(
    SURVEY_CSV_HEADER,
    rows.map((r) => [dayOf(r.receivedAt) || '', r.channel || 'direct', ...[0, 1, 2, 3, 4].map((i) => r.ranking[i] || ''), r.unasked, r.lead, r.decide, typeof r.clinicians === 'number' ? r.clinicians : '', r.surveyVersion || '', tt(r), r.prevHash || '', r.rowHash || '']));
  return null;
}

const LOADER = { corrections: correctionRows, gap: gapRows, survey: surveyRows };

export async function onRequestGet({ params, request, env }) {
  const kind = String(params.kind || '').replace(/\.csv$/, '');
  if (!LOADER[kind]) return bad('Unknown export. Use corrections, gap or survey.', 404);
  let rows;
  try { rows = await withTeamTestFlags(env, CSV_TABLE[kind], await LOADER[kind](env)); }
  catch { return bad('The export could not be read right now.', 503); }
  /* The citation permalink in the corrections file has to point at a real host,
     so it is read off the request rather than typed. */
  const site = request ? new URL(request.url).origin : '';
  return new Response(exportRows(kind, rows, { site }), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="waypoint-ledger-${kind}.csv"`,
      'cache-control': 'no-store',
    },
  });
}

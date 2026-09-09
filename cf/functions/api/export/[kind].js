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

const GAP_IDS = ['care-not-sought', 'care-denied', 'dismissed', 'wrong-track', 'time-searching', 'life-lost'];
import { CONTEXT_KEYS } from '../../../../lib/survey-def.js';
const CTX = CONTEXT_KEYS;                       // one definition, never a copy

export { csvOf, isFormulaCell };

export function exportRows(kind, rows, opts = {}) {
  if (kind === 'corrections') return correctionsDefectCsv(rows, opts);
  if (kind === 'gap') return csvOf(
    ['received_at', ...GAP_IDS, 'rank_1', 'rank_2', 'rank_3', 'rank_4', 'rank_5', 'rank_6', 'table_version', 'row_hash'],
    rows.map((r) => [r.receivedAt, ...GAP_IDS.map((id) => (r.counts && typeof r.counts[id] === 'number' ? r.counts[id] : '')), ...[0, 1, 2, 3, 4, 5].map((i) => (r.ranking && r.ranking[i]) || ''), r.tableVersion || '', r.rowHash || '']));
  if (kind === 'survey') return csvOf(
    ['received_at', 'channel', 'rank_1', 'rank_2', 'rank_3', 'rank_4', 'rank_5', 'unasked', 'lead', 'decide', 'clinicians', ...CTX.map((k) => 'ctx_' + k), 'survey_version', 'row_hash'],
    rows.map((r) => [r.receivedAt, r.channel || 'direct', ...[0, 1, 2, 3, 4].map((i) => r.ranking[i] || ''), r.unasked, r.lead, r.decide, typeof r.clinicians === 'number' ? r.clinicians : '', ...CTX.map((k) => (r.context && r.context[k]) || ''), r.surveyVersion || '', r.rowHash || '']));
  return null;
}

const LOADER = { corrections: correctionRows, gap: gapRows, survey: surveyRows };

export async function onRequestGet({ params, request, env }) {
  const kind = String(params.kind || '').replace(/\.csv$/, '');
  if (!LOADER[kind]) return bad('Unknown export. Use corrections, gap or survey.', 404);
  let rows;
  try { rows = await LOADER[kind](env); }
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

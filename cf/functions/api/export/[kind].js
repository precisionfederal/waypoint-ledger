/* ==========================================================================
   GET /api/export/{corrections|gap|survey}.csv — the de-identified register.

   An agency, a researcher or a committee staffer can take these without asking
   us. Free-text fields are never exported; interviews are never exported at
   all. Rows are published oldest first, the order they arrived — which is also
   the order of the integrity chain, so the last column of the last row is the
   head published at /api/integrity.
   Columns are fixed: data/dictionary.csv describes every one of them.

   SAFE TO OPEN. A cell that begins with = + - @, a tab or a carriage return is
   a formula to Excel, Numbers and Sheets. Every such cell is quoted and given a
   leading apostrophe, so the file a policy shop opens is data, never a command.
   Plain numbers are left as numbers.
   ========================================================================== */
import { bad } from '../_http.js';
import { correctionRows } from '../corrections.js';
import { gapRows } from '../gap.js';
import { surveyRows } from '../survey.js';

const GAP_IDS = ['care-not-sought', 'care-denied', 'dismissed', 'wrong-track', 'time-searching', 'life-lost'];
import { CONTEXT_KEYS } from '../../../../lib/survey-def.js';
const CTX = CONTEXT_KEYS;                       // one definition, never a copy

/** A cell that a spreadsheet would execute. Numbers are not formulas. */
export const isFormulaCell = (s) => /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s);

export function csvOf(header, rows) {
  const esc = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (isFormulaCell(s)) return '"\'' + s.replace(/"/g, '""') + '"';
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [header, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

export function exportRows(kind, rows) {
  if (kind === 'corrections') return csvOf(
    ['received_at', 'price_id', 'verdict', 'believed_usd', 'table_version', 'row_hash'],
    rows.map((r) => [r.receivedAt, r.priceId, r.verdict, typeof r.believedValueUsd === 'number' ? r.believedValueUsd : '', r.priceTableVersion || '', r.rowHash || '']));
  if (kind === 'gap') return csvOf(
    ['received_at', ...GAP_IDS, 'rank_1', 'rank_2', 'rank_3', 'rank_4', 'rank_5', 'rank_6', 'table_version', 'row_hash'],
    rows.map((r) => [r.receivedAt, ...GAP_IDS.map((id) => (r.counts && typeof r.counts[id] === 'number' ? r.counts[id] : '')), ...[0, 1, 2, 3, 4, 5].map((i) => (r.ranking && r.ranking[i]) || ''), r.tableVersion || '', r.rowHash || '']));
  if (kind === 'survey') return csvOf(
    ['received_at', 'channel', 'rank_1', 'rank_2', 'rank_3', 'rank_4', 'rank_5', 'unasked', 'lead', 'decide', 'clinicians', ...CTX.map((k) => 'ctx_' + k), 'survey_version', 'row_hash'],
    rows.map((r) => [r.receivedAt, r.channel || 'direct', ...[0, 1, 2, 3, 4].map((i) => r.ranking[i] || ''), r.unasked, r.lead, r.decide, typeof r.clinicians === 'number' ? r.clinicians : '', ...CTX.map((k) => (r.context && r.context[k]) || ''), r.surveyVersion || '', r.rowHash || '']));
  return null;
}

const LOADER = { corrections: correctionRows, gap: gapRows, survey: surveyRows };

export async function onRequestGet({ params, env }) {
  const kind = String(params.kind || '').replace(/\.csv$/, '');
  if (!LOADER[kind]) return bad('Unknown export. Use corrections, gap or survey.', 404);
  let rows;
  try { rows = await LOADER[kind](env); }
  catch { return bad('The export could not be read right now.', 503); }
  return new Response(exportRows(kind, rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="waypoint-ledger-${kind}.csv"`,
      'cache-control': 'no-store',
    },
  });
}

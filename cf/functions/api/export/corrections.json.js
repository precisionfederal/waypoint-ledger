/* ==========================================================================
   GET /api/export/corrections.json — the same defect report as JSON, shaped as
   the DCAT distribution /data.json describes.

   It carries its own column contract (name, type, meaning) beside the rows, the
   price-table version, the audit line and the date, so a harvester or an agency
   script never has to guess what a column means or which table it describes.
   Each row also carries the CY2024 companion charge where CMS publishes one for
   that code — the figure an uninsured person is billed against — with its file,
   its SHA-256 and the exact row it was read from.
   ========================================================================== */
import { json, bad } from '../_http.js';
import { correctionRows } from '../corrections.js';
import { correctionsDefectJson } from './_defect-report.js';

export async function onRequestGet({ request, env }) {
  let rows;
  try { rows = await correctionRows(env); }
  catch { return bad('The export could not be read right now.', 503); }
  const site = request ? new URL(request.url).origin : '';
  return json(correctionsDefectJson(rows, { site }), 200, {
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  });
}

/* ==========================================================================
   GET /api/export/corrections.csv — the corrections file, by its own route.

   Same bytes as /api/export/{kind}.csv for kind=corrections: both call
   correctionsDefectCsv in _defect-report.js. This route exists so the file can
   carry a dated filename and so the catalog, the OpenAPI description and the
   register page can all point at one address that says what it is.
   ========================================================================== */
import { bad } from '../_http.js';
import { correctionRows } from '../corrections.js';
import { correctionsDefectCsv } from './_defect-report.js';

export async function onRequestGet({ request, env }) {
  let rows;
  try { rows = await correctionRows(env); }
  catch { return bad('The export could not be read right now.', 503); }
  const site = request ? new URL(request.url).origin : '';
  const asOf = new Date().toISOString().slice(0, 10);
  return new Response(correctionsDefectCsv(rows, { site, asOf }), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="waypoint-ledger-corrections-${asOf}.csv"`,
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}

/* GET /api/annotations — the public list of marked rows: which chained rows we
   marked as our own team testing the form, by row_hash, with the day of the mark.
   Our free-text note on a mark is admin-only, like every note on this site.
   Every published count leaves these rows out and says how many (`teamTests`);
   the rows themselves stay in every export, flagged team_test. See _annotations.js. */
import { json } from './_http.js';
import { all } from './_db.js';
import { dayOf } from './_cells.js';

export async function onRequestGet({ env }) {
  let rows = [];
  try { rows = await all(env, 'SELECT table_name, row_hash, kind, at FROM annotations ORDER BY at ASC, rowid ASC'); }
  catch { rows = []; }
  return json({
    ok: true,
    n: rows.length,
    annotations: rows.map((r) => ({ table: r.table_name, rowHash: r.row_hash, kind: r.kind, on: dayOf(r.at) })),
    method: 'A mark never changes the row it marks, its hash or the chain. Published counts leave marked rows out and report how many as teamTests; the CSV exports keep every row and flag these in the team_test column.',
  });
}

/* GET /api/admin/corrections — every correction row, newest first, with the
   notes the public aggregate never serves. Optional ?status=right|wrong. */
import { json, bad, oneOf } from '../_http.js';
import { all } from '../_db.js';
import { correctionOf } from '../corrections.js';
import { requireAdmin } from './_admin.js';

export async function onRequestGet({ request, env }) {
  const stop = requireAdmin(env, request); if (stop) return stop;
  const status = oneOf(new URL(request.url).searchParams.get('status'), ['right', 'wrong']);
  try {
    const rows = status
      ? await all(env, 'SELECT * FROM corrections WHERE verdict = ?1 ORDER BY received_at DESC', status)
      : await all(env, 'SELECT * FROM corrections ORDER BY received_at DESC');
    const corrections = rows.map(correctionOf);
    return json({ ok: true, n: corrections.length, withNote: corrections.filter((c) => c.note).length, corrections });
  } catch { return bad('The corrections could not be read.', 500); }
}

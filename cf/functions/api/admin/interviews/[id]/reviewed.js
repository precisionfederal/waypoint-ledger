/* POST /api/admin/interviews/{id}/reviewed — mark one interview read. */
import { json, bad, now } from '../../../_http.js';
import { one, run } from '../../../_db.js';
import { requireAdmin } from '../../_admin.js';

export async function onRequestPost({ request, env, params }) {
  const stop = requireAdmin(env, request); if (stop) return stop;
  const id = String(params.id || '');
  try {
    const row = await one(env, 'SELECT id FROM interviews WHERE id = ?1', id);
    if (!row) return bad('No interview with that id.', 404);
    const reviewedAt = now();
    await run(env, 'UPDATE interviews SET reviewed_at = ?1 WHERE id = ?2', reviewedAt, id);
    return json({ ok: true, id, reviewedAt });
  } catch { return bad('Could not mark it reviewed.', 500); }
}

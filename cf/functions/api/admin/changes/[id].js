/* DELETE /api/admin/changes/{id} — remove one change-log row. */
import { json, bad } from '../../_http.js';
import { one, run } from '../../_db.js';
import { requireAdmin } from '../_admin.js';

export async function onRequestDelete({ request, env, params }) {
  const stop = requireAdmin(env, request); if (stop) return stop;
  const id = String(params.id || '');
  try {
    const row = await one(env, 'SELECT id FROM changes WHERE id = ?1', id);
    if (!row) return bad('No change-log entry with that id.', 404);
    await run(env, 'DELETE FROM changes WHERE id = ?1', id);
    return json({ ok: true, deleted: id });
  } catch { return bad('Could not delete the entry.', 500); }
}

/* DELETE /api/admin/changes/{id} — remove one change-log row.
   PATCH  /api/admin/changes/{id} — {published: true|false}: publish a draft, or take one back. */
import { json, bad, readJson } from '../../_http.js';
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

/** Pure, so the tests and the console agree on the rule. */
export function validatePublishedPatch(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'Body must be a JSON object.' };
  if (typeof b.published !== 'boolean') return { error: 'published must be true or false.' };
  return { published: b.published ? 1 : 0 };
}

export async function onRequestPatch({ request, env, params }) {
  const stop = requireAdmin(env, request); if (stop) return stop;
  const id = String(params.id || '');
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  const v = validatePublishedPatch(body);
  if (v.error) return bad(v.error);
  try {
    const row = await one(env, 'SELECT id FROM changes WHERE id = ?1', id);
    if (!row) return bad('No change-log entry with that id.', 404);
    await run(env, 'UPDATE changes SET published = ?1 WHERE id = ?2', v.published, id);
    return json({ ok: true, id, published: v.published === 1 });
  } catch { return bad('Could not change the entry.', 500); }
}

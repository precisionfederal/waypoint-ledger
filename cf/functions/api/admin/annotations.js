/* POST /api/admin/annotations — mark one chained row as our own team test.
   Body: {table: corrections|gap|survey|interviews, rowHash, kind?: 'team-test', note?}
   GET  /api/admin/annotations — every mark, oldest first (the public list is GET /api/annotations).

   Bearer ADMIN_TOKEN (requireAdmin), like every admin route. The mark is
   append-only (migration 0007 triggers refuse UPDATE and DELETE) and a row is
   marked once. The marked row itself is never touched. See _annotations.js. */
import { json, bad, readJson, id as newId, now } from '../_http.js';
import { all, one, run } from '../_db.js';
import { requireAdmin } from './_admin.js';
import { validateAnnotation } from '../_annotations.js';

/* One fixed statement per chained table: the table name is never built into SQL. */
const ROW_BY_HASH = {
  corrections: 'SELECT id FROM corrections WHERE row_hash = ?1',
  gap_reports: 'SELECT id FROM gap_reports WHERE row_hash = ?1',
  survey_responses: 'SELECT id FROM survey_responses WHERE row_hash = ?1',
  interviews: 'SELECT id FROM interviews WHERE row_hash = ?1',
};

export async function onRequestGet({ request, env }) {
  const stop = requireAdmin(env, request); if (stop) return stop;
  try {
    const rows = await all(env, 'SELECT id, table_name, row_hash, kind, note, at FROM annotations ORDER BY at ASC, rowid ASC');
    return json({ ok: true, n: rows.length, annotations: rows.map((r) => ({ id: r.id, table: r.table_name, rowHash: r.row_hash, kind: r.kind, note: r.note ?? null, at: r.at })) });
  } catch { return bad('The annotations could not be read.', 500); }
}

export async function onRequestPost({ request, env }) {
  const stop = requireAdmin(env, request); if (stop) return stop;
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  const v = validateAnnotation(body);
  if (v.error) return bad(v.error);
  const r = v.record;
  try {
    /* Only a row that is really there, in that chain, can be marked. */
    const row = await one(env, ROW_BY_HASH[r.table], r.rowHash);
    if (!row) return bad(`No row in ${r.table} has that row_hash.`, 404);
    const dupe = await one(env, 'SELECT id FROM annotations WHERE table_name=?1 AND row_hash=?2 AND kind=?3', r.table, r.rowHash, r.kind);
    if (dupe) return json({ ok: true, already: true, id: dupe.id, table: r.table, rowHash: r.rowHash, kind: r.kind }, 200);
    const at = now();
    const rowId = newId();
    /* An explicit statement: insert() in _db.js stamps a received_at column this table does not have. */
    await run(env, 'INSERT INTO annotations (id, table_name, row_hash, kind, note, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)', rowId, r.table, r.rowHash, r.kind, r.note, at);
    return json({ ok: true, id: rowId, table: r.table, rowHash: r.rowHash, kind: r.kind, note: r.note, at }, 201);
  } catch { return bad('Could not save the annotation.', 500); }
}

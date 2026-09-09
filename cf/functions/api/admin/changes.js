/* GET  /api/admin/changes — every change-log row, published or not, newest first.
   POST /api/admin/changes — add one: {date, said, changed, who, sourceInterviewId?, published?}
   The public sees only published rows, at GET /api/changes. */
import { json, bad, readJson, str, id as newId, now } from '../_http.js';
import { all, insert } from '../_db.js';
import { requireAdmin } from './_admin.js';

const MAX = 600;

/** Pure validator, so the tests and the console agree on the rules. */
export function validateChange(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'Body must be a JSON object.' };
  const date = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date.trim()) ? b.date.trim() : undefined;
  if (!date) return { error: 'date must be YYYY-MM-DD.' };
  if (Number.isNaN(Date.parse(date))) return { error: 'date must be a real calendar date.' };
  const said = str(b.said, MAX); if (!said) return { error: 'said is required.' };
  const changed = str(b.changed, MAX); if (!changed) return { error: 'changed is required.' };
  const who = str(b.who, MAX); if (!who) return { error: 'who is required.' };
  for (const [k, v] of [['said', b.said], ['changed', b.changed], ['who', b.who]]) {
    if (typeof v === 'string' && v.trim().length > MAX) return { error: `${k} must be ${MAX} characters or fewer.` };
  }
  return {
    record: {
      date, said, changed, who,
      sourceInterviewId: str(b.sourceInterviewId, 64) ?? null,
      published: b.published === false ? 0 : 1,
    },
  };
}

export async function onRequestGet({ request, env }) {
  const stop = requireAdmin(env, request); if (stop) return stop;
  try {
    const rows = await all(env, 'SELECT * FROM changes ORDER BY date DESC, created_at DESC');
    return json({ ok: true, n: rows.length, changes: rows.map((r) => ({ id: r.id, date: r.date, said: r.said, changed: r.changed, who: r.who, sourceInterviewId: r.source_interview_id ?? null, published: r.published === 1, createdAt: r.created_at })) });
  } catch { return bad('The change log could not be read.', 500); }
}

export async function onRequestPost({ request, env }) {
  const stop = requireAdmin(env, request); if (stop) return stop;
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  const v = validateChange(body);
  if (v.error) return bad(v.error);
  const r = v.record;
  try {
    const rowId = newId();
    await insert(env, 'changes', {
      id: rowId, date: r.date, said: r.said, changed: r.changed, who: r.who,
      source_interview_id: r.sourceInterviewId, published: r.published, created_at: now(),
    });
    return json({ ok: true, id: rowId }, 201);
  } catch { return bad('Could not save the change-log entry.', 500); }
}

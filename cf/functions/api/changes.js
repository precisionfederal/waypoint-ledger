/* ==========================================================================
   GET /api/changes — the change log: "a user said this, so we changed that".

   Published rows only. Written from real written interviews through the admin
   API; an empty log is served as an empty log, never padded.
   System of record: D1 `changes`.
   ========================================================================== */
import { json, bad } from './_http.js';
import { all } from './_db.js';

export const changeOf = (r) => ({ id: r.id, date: r.date, said: r.said, changed: r.changed, who: r.who });

/** Published change-log rows, newest first. */
export async function publishedChanges(env) {
  return (await all(env, 'SELECT * FROM changes WHERE published = 1 ORDER BY date DESC, created_at DESC')).map(changeOf);
}

export async function onRequestGet({ env }) {
  try {
    const changes = await publishedChanges(env);
    return json({ ok: true, n: changes.length, changes });
  } catch { return bad('The change log could not be read right now.', 503); }
}

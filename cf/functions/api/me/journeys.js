/* ==========================================================================
   GET /api/me/journeys — the ledgers this person saved, newest change first.

   Returns only what a list needs: the share slug to open it, the title, when it
   changed, and how many lines it holds. The entries themselves come from
   /api/journeys/{slug} when a ledger is actually opened.
   ========================================================================== */
import { json, bad } from '../_http.js';
import { all, userOf } from '../_db.js';

const LIMIT = 200;

const countEntries = (s) => { try { const e = JSON.parse(s || '[]'); return Array.isArray(e) ? e.length : 0; } catch { return 0; } };

export async function onRequestGet({ request, env }) {
  let user;
  try { user = await userOf(env, request); }
  catch { return bad('Your sign-in could not be read right now.', 503); }
  if (!user) return bad('Sign in first.', 401);
  let rows;
  try {
    rows = await all(env, 'SELECT id, share_slug, title, entries_json, table_version, created_at, updated_at FROM journeys WHERE user_id=?1 ORDER BY updated_at DESC LIMIT ?2', user.id, LIMIT);
  } catch { return bad('Your saved ledgers could not be read right now.', 503); }
  return json({
    ok: true,
    n: rows.length,
    journeys: rows.map((r) => ({
      id: r.id,
      slug: r.share_slug,
      title: r.title ?? null,
      entryCount: countEntries(r.entries_json),
      tableVersion: r.table_version ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
}

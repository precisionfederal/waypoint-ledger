/* ==========================================================================
   POST /api/auth/logout — delete the session row and clear the cookie.
   Signing out on a device that has no session is not an error.
   ========================================================================== */
import { json } from '../_http.js';
import { clearCookie, cookieOf, run } from '../_db.js';

export async function onRequestPost({ request, env }) {
  const sid = cookieOf(request, 'wl_session');
  if (sid) { try { await run(env, 'DELETE FROM sessions WHERE id=?1', sid); } catch { /* the cookie goes either way */ } }
  return json({ ok: true, user: null }, 200, { 'set-cookie': clearCookie() });
}

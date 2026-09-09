/* POST /api/bluebutton/disconnect — hand the key back.

   Two things happen and the second one always happens: the token is revoked at
   CMS, and the cookie is cleared here. If CMS is unreachable the revoke fails
   silently and the cookie still goes, so "disconnect" is never a promise this
   app cannot keep from its own side. */
import { json } from '../_http.js';
import { isConfigured, cookieOf, TOKEN_COOKIE, killCookie, revokeToken } from './_bb.js';

export async function onRequestPost({ request, env }) {
  const token = cookieOf(request, TOKEN_COOKIE);
  let revoked = false;
  if (token && isConfigured(env)) revoked = await revokeToken(env, token);
  return json({ ok: true, connected: false, revokedAtCms: revoked }, 200, { 'set-cookie': killCookie(TOKEN_COOKIE) });
}

export const onRequestGet = () => json(
  { ok: false, error: 'POST to disconnect from Medicare.' }, 405,
);

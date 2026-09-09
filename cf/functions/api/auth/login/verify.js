/* ==========================================================================
   POST /api/auth/login/verify — finish signing in with a passkey.

   Body: { challengeId, response } from startAuthentication(). The credential is
   found by the id the authenticator returned; its signature counter is advanced
   so a replayed assertion is rejected next time.
   ========================================================================== */
import { json, bad, readJson, count } from '../../_http.js';
import { one, run } from '../../_db.js';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { rpOf, takeChallenge, startSession } from '../_webauthn.js';

export async function onRequestPost({ request, env }) {
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  const res = body.response;
  if (!res || typeof res !== 'object' || typeof res.id !== 'string') return bad('The passkey response is missing.');
  const chal = await takeChallenge(env, body.challengeId, 'login');
  if (!chal) return bad('That sign-in attempt expired. Please try again.', 410);

  let row;
  try { row = await one(env, 'SELECT c.id, c.user_id, c.public_key, c.counter, c.transports, u.display_name FROM credentials c JOIN users u ON u.id=c.user_id WHERE c.id=?1', res.id); }
  catch { return bad('Sign-in is unavailable right now. Nothing was changed.', 503); }
  if (!row) return bad('That passkey is not registered here.', 404);

  let transports;
  try { const t = JSON.parse(row.transports || '[]'); transports = Array.isArray(t) && t.length ? t : undefined; } catch { transports = undefined; }

  const { rpID, origin } = rpOf(request);
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response: res,
      expectedChallenge: chal.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: { id: row.id, publicKey: isoBase64URL.toBuffer(row.public_key), counter: Number(row.counter) || 0, transports },
      requireUserVerification: false,
    });
  } catch { return bad('That passkey could not be verified. Try again, or sign in with your password.', 400); }   // never hand the library's internals to the caller
  if (!v.verified) return bad('That passkey could not be verified.', 400);

  try { await run(env, 'UPDATE credentials SET counter=?1 WHERE id=?2', v.authenticationInfo.newCounter, row.id); } catch { /* counter is advisory for platform passkeys */ }
  const cookie = await startSession(env, request, row.user_id);
  await count(env, 'auth_login');
  return json({ ok: true, user: { id: row.user_id, displayName: row.display_name ?? null } }, 200, { 'set-cookie': cookie });
}

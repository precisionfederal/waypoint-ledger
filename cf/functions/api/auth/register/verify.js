/* ==========================================================================
   POST /api/auth/register/verify — finish creating a passkey and sign in.

   Body: { challengeId, response } where response is what
   @simplewebauthn/browser's startRegistration() returned.
   On success: a users row, a credentials row, a 30-day session cookie.
   ========================================================================== */
import { json, bad, readJson, now, count } from '../../_http.js';
import { insert } from '../../_db.js';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { rpOf, takeChallenge, startSession } from '../_webauthn.js';

export async function onRequestPost({ request, env }) {
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  if (!body.response || typeof body.response !== 'object') return bad('The passkey response is missing.');
  const chal = await takeChallenge(env, body.challengeId, 'register');
  if (!chal) return bad('That passkey attempt expired. Please try again.', 410);

  const { rpID, origin } = rpOf(request);
  let v;
  try {
    v = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: chal.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (e) { return bad(e instanceof Error ? e.message : 'The passkey could not be verified.', 400); }
  if (!v.verified || !v.registrationInfo) return bad('The passkey could not be verified.', 400);

  const cred = v.registrationInfo.credential;
  try {
    // An added passkey joins the account that is already signed in; a first one creates it.
    if (!chal.addToExisting) await insert(env, 'users', { id: chal.userId, created_at: now(), display_name: chal.displayName ?? null });
    await insert(env, 'credentials', {
      id: cred.id,
      user_id: chal.userId,
      public_key: isoBase64URL.fromBuffer(cred.publicKey),
      counter: cred.counter ?? 0,
      transports: JSON.stringify(cred.transports ?? []),
      created_at: now(),
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    if (/UNIQUE|constraint/i.test(m)) return bad('That passkey is already registered here.', 409);
    return bad('The passkey could not be saved. Nothing was changed.', 503);
  }

  const cookie = await startSession(env, request, chal.userId);
  await count(env, chal.addToExisting ? 'auth_add_passkey' : 'auth_register');
  return json({ ok: true, user: { id: chal.userId, displayName: chal.displayName ?? null }, addedToAccount: Boolean(chal.addToExisting) }, 200, { 'set-cookie': cookie });
}

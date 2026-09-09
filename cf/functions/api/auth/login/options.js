/* ==========================================================================
   POST /api/auth/login/options — begin signing in with a passkey.

   No username is asked for and none is sent: allowCredentials is empty, so the
   browser offers whatever discoverable passkey it holds for this site.
   ========================================================================== */
import { json, bad, readJson } from '../../_http.js';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { rpOf, putChallenge, optionalJson } from '../_webauthn.js';

export async function onRequestPost({ request, env }) {
  const { error } = await optionalJson(request, readJson);
  if (error) return bad(error);
  const { rpID } = rpOf(request);
  let options;
  try {
    options = await generateAuthenticationOptions({ rpID, allowCredentials: [], userVerification: 'preferred' });
  } catch { return bad('Sign-in could not be started right now.', 500); }
  const challengeId = await putChallenge(env, { kind: 'login', challenge: options.challenge });
  return json({ ok: true, challengeId, options });
}

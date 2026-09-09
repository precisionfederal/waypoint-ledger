/* ==========================================================================
   POST /api/auth/register/options — begin creating a passkey.

   Body: { displayName? } (optional, <=40 chars, shown only back to the person).

   Two cases, one endpoint:
   - No session: a new user id is minted here and carried in the KV challenge.
     The users row is written only when the browser proves it created the
     credential (verify), so a cancelled prompt leaves nothing behind.
   - Signed in: the new passkey is ADDED to the account already signed in, so a
     person with a passkey that does not sync can enrol a second device and see
     the same saved ledgers. Their existing credentials are excluded, so the
     browser refuses to make a duplicate on a device that already has one.
   ========================================================================== */
import { json, bad, readJson, id, str } from '../../_http.js';
import { all, userOf } from '../../_db.js';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { RP_NAME, DISPLAY_NAME_MAX, DEFAULT_LABEL, rpOf, putChallenge, optionalJson } from '../_webauthn.js';

const transportsOf = (s) => { try { const t = JSON.parse(s || '[]'); return Array.isArray(t) && t.length ? t : undefined; } catch { return undefined; } };

export async function onRequestPost({ request, env }) {
  const { body, error } = await optionalJson(request, readJson);
  if (error) return bad(error);
  const displayName = str(body.displayName, DISPLAY_NAME_MAX);

  let existing = null;
  try { existing = await userOf(env, request); } catch { existing = null; }

  const userId = existing ? existing.id : id();
  const label = displayName || existing?.displayName || DEFAULT_LABEL;

  let excludeCredentials = [];
  if (existing) {
    try {
      const rows = await all(env, 'SELECT id, transports FROM credentials WHERE user_id=?1', existing.id);
      excludeCredentials = rows.map((r) => ({ id: r.id, transports: transportsOf(r.transports) }));
    } catch { excludeCredentials = []; }
  }

  const { rpID } = rpOf(request);
  let options;
  try {
    options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: new TextEncoder().encode(userId),
      userName: label,
      userDisplayName: label,
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      excludeCredentials,
    });
  } catch { return bad('A passkey could not be started right now.', 500); }

  const challengeId = await putChallenge(env, {
    kind: 'register',
    challenge: options.challenge,
    userId,
    displayName: existing ? (existing.displayName ?? null) : (displayName ?? null),
    addToExisting: Boolean(existing),
  });
  return json({ ok: true, challengeId, options, addingToAccount: Boolean(existing) });
}

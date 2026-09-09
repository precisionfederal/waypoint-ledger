/* ==========================================================================
   POST /api/auth/password/signup — { email, password, displayName? }

   Creates the account, signs it in, and returns a ten-word recovery code once.
   The code is the only way back in if the password is forgotten: there is no
   password-reset email, because sending one would mean holding a mailbox
   relationship with every person here and we hold nothing we do not need.
   Only the code's hash is stored, so a copy of this database does not open
   anybody's account.
   ========================================================================== */
import { json, bad, readJson, id, now, str, count } from '../../_http.js';
import { insert, one } from '../../_db.js';
import { startSession, DISPLAY_NAME_MAX } from '../_webauthn.js';
import { normaliseEmail, passwordProblem, hashPassword, makeRecoveryCode, hashRecovery, EMAIL_MAX } from './_password.js';

export async function onRequestPost({ request, env }) {
  const { body, error } = await readJson(request);
  if (error) return bad(error);

  const email = normaliseEmail(body.email);
  if (!email) return bad(`Enter an email address you can get to, up to ${EMAIL_MAX} characters.`);
  const problem = passwordProblem(body.password, email);
  if (problem) return bad(problem);
  const displayName = str(body.displayName, DISPLAY_NAME_MAX) ?? null;

  // Telling someone the address is taken is the price of a usable sign-up form;
  // the sign-in path opposite says nothing, so an address cannot be probed there.
  let taken;
  try { taken = await one(env, 'SELECT id FROM users WHERE email=?1', email); }
  catch { return bad('Accounts are unavailable right now. Nothing was changed.', 503); }
  if (taken) return bad('There is already an account for that address. Sign in with it, or use your recovery code to set a new password.', 409);

  const { hash, salt } = await hashPassword(body.password, env);
  const recoveryCode = makeRecoveryCode();
  const recoveryHash = await hashRecovery(recoveryCode, env);
  const userId = id();
  const t = now();

  try {
    await insert(env, 'users', {
      id: userId, created_at: t, updated_at: t, display_name: displayName,
      email, password_hash: hash, password_salt: salt, recovery_hash: recoveryHash,
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    if (/UNIQUE|constraint/i.test(m)) return bad('There is already an account for that address.', 409);
    return bad('The account could not be created. Nothing was changed.', 503);
  }

  const cookie = await startSession(env, request, userId);
  await count(env, 'auth_password_signup');
  return json({
    ok: true,
    user: { id: userId, email, displayName, hasPasskey: false, hasPassword: true, createdAt: t },
    recoveryCode,
  }, 200, { 'set-cookie': cookie });
}

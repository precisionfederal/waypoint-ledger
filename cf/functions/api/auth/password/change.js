/* ==========================================================================
   POST /api/auth/password/change — { currentPassword?, newPassword, email? }

   Two jobs, one route, because they are the same act from the person's side:
   - an account that has a password changes it, proving the old one first;
   - an account made with a passkey adds an email address and a password, so it
     can also be opened on a browser that does not do passkeys. The session is
     the proof there, and it is a real proof: it was made by the passkey.

   Either way a fresh recovery code comes back once, because the account gains a
   way in that a stolen laptop could otherwise keep.

   Every other session is ended: a password change that leaves the old sessions
   alive does not lock anybody out.
   ========================================================================== */
import { json, bad, readJson, now, count } from '../../_http.js';
import { cookieOf, one, run, userOf } from '../../_db.js';
import {
  normaliseEmail, passwordProblem, hashPassword, hashRecovery, makeRecoveryCode,
  verifyPassword, EMAIL_MAX,
} from './_password.js';

export async function onRequestPost({ request, env }) {
  const session = await userOf(env, request);
  if (!session) return bad('Sign in first.', 401);
  const { body, error } = await readJson(request);
  if (error) return bad(error);

  let row;
  try { row = await one(env, 'SELECT id, email, display_name, password_hash, password_salt, created_at FROM users WHERE id=?1', session.id); }
  catch { return bad('Your account could not be read right now. Nothing was changed.', 503); }
  if (!row) return bad('Sign in first.', 401);

  if (row.password_hash) {
    const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    if (!current) return bad('Type your current password first.');
    if (!(await verifyPassword(current, row.password_hash, row.password_salt))) {
      return bad('That is not the current password on this account.', 401);
    }
  }

  let email = row.email;
  if (!email) {
    email = normaliseEmail(body.email);
    if (!email) return bad(`Add an email address to sign in with, up to ${EMAIL_MAX} characters. It is used for nothing else — there is no mail from this site.`);
    let taken;
    try { taken = await one(env, 'SELECT id FROM users WHERE email=?1', email); } catch { taken = null; }
    if (taken && taken.id !== row.id) return bad('There is already an account for that address.', 409);
  }

  const problem = passwordProblem(body.newPassword, email);
  if (problem) return bad(problem);
  if (row.password_hash && await verifyPassword(body.newPassword, row.password_hash, row.password_salt)) {
    return bad('That is the password you already have. Choose a different one.');
  }

  const { hash, salt } = await hashPassword(body.newPassword, env);
  const recoveryCode = makeRecoveryCode();
  const recoveryHash = await hashRecovery(recoveryCode, env);
  const keep = cookieOf(request, 'wl_session');
  try {
    await run(env, 'UPDATE users SET email=?1, password_hash=?2, password_salt=?3, recovery_hash=?4, updated_at=?5 WHERE id=?6', email, hash, salt, recoveryHash, now(), row.id);
    await run(env, 'DELETE FROM sessions WHERE user_id=?1 AND id<>?2', row.id, keep ?? '');
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    if (/UNIQUE|constraint/i.test(m)) return bad('There is already an account for that address.', 409);
    return bad('The new password could not be saved. Nothing was changed.', 503);
  }

  let hasPasskey = false;
  try { hasPasskey = Boolean(await one(env, 'SELECT id FROM credentials WHERE user_id=?1', row.id)); } catch { /* not fatal */ }
  await count(env, row.password_hash ? 'auth_password_change' : 'auth_password_added');
  return json({
    ok: true,
    user: { id: row.id, email, displayName: row.display_name ?? null, hasPasskey, hasPassword: true, createdAt: row.created_at },
    recoveryCode,
    endedOtherSessions: true,
  });
}

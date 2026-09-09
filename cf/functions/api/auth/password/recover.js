/* ==========================================================================
   POST /api/auth/password/recover — { email, code, newPassword }

   The way back in when the password is gone. The ten-word code proves the
   account, the password is replaced, and a fresh code is issued because the old
   one has now been used and may have been read over a shoulder.

   Every other session is ended. Someone who needs this route may be recovering
   from a device they no longer control, and leaving thirty-day sessions alive on
   it would make the recovery pointless.
   ========================================================================== */
import { json, bad, readJson, now, count } from '../../_http.js';
import { one, run } from '../../_db.js';
import { startSession } from '../_webauthn.js';
import {
  normaliseEmail, normaliseRecovery, verifyRecovery, hashPassword, hashRecovery,
  makeRecoveryCode, passwordProblem, tooManyFailures, noteFailure, clearFailures,
  RECOVERY_WORDS, MAX_FAILURES_PER_HOUR,
} from './_password.js';

const FAILED = 'That email address and recovery code do not match an account here.';

export async function onRequestPost({ request, env }) {
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  const email = normaliseEmail(body.email);
  const code = normaliseRecovery(body.code);
  if (!email) return bad(FAILED, 401);
  if (!code) return bad(`A recovery code is ${RECOVERY_WORDS} words, in the order they were given. Spaces, hyphens and capital letters do not matter.`);
  const problem = passwordProblem(body.newPassword, email);
  if (problem) return bad(problem);

  if (await tooManyFailures(env, email)) {
    return bad(`That is ${MAX_FAILURES_PER_HOUR} wrong attempts on this address within the hour. For safety it stops answering until the hour is out.`, 429);
  }

  let row;
  try { row = await one(env, 'SELECT id, email, display_name, recovery_hash, created_at FROM users WHERE email=?1', email); }
  catch { return bad('Recovery is unavailable right now. Nothing was changed.', 503); }

  const ok = row && row.recovery_hash ? await verifyRecovery(code, row.recovery_hash) : false;
  if (!ok) { await noteFailure(env, email); return bad(FAILED, 401); }

  const { hash, salt } = await hashPassword(body.newPassword, env);
  const recoveryCode = makeRecoveryCode();
  const recoveryHash = await hashRecovery(recoveryCode, env);
  try {
    await run(env, 'UPDATE users SET password_hash=?1, password_salt=?2, recovery_hash=?3, updated_at=?4 WHERE id=?5', hash, salt, recoveryHash, now(), row.id);
    await run(env, 'DELETE FROM sessions WHERE user_id=?1', row.id);
  } catch { return bad('The new password could not be saved. Nothing was changed.', 503); }

  await clearFailures(env, email);
  let hasPasskey = false;
  try { hasPasskey = Boolean(await one(env, 'SELECT id FROM credentials WHERE user_id=?1', row.id)); } catch { /* not fatal */ }
  const cookie = await startSession(env, request, row.id);
  await count(env, 'auth_password_recover');
  return json({
    ok: true,
    user: { id: row.id, email: row.email, displayName: row.display_name ?? null, hasPasskey, hasPassword: true, createdAt: row.created_at },
    recoveryCode,
    endedOtherSessions: true,
  }, 200, { 'set-cookie': cookie });
}

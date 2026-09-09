/* ==========================================================================
   POST /api/auth/password/login — { email, password }

   A wrong password and an address that was never registered give the same
   sentence and take about the same time, so this endpoint cannot be used to
   find out who has an account here. Ten wrong attempts on one address in an
   hour and that address stops answering until the hour is out; the counter is
   keyed by a hash of the address, so the throttle itself stores no email.

   A sign-in is also the one moment we hold the password in memory, so it is the
   only moment a row written with older derivation parameters can be rewritten
   with today's. That happens here, silently, and never blocks the sign-in.
   ========================================================================== */
import { json, bad, readJson, now, count } from '../../_http.js';
import { one, run } from '../../_db.js';
import { startSession } from '../_webauthn.js';
import {
  normaliseEmail, verifyPassword, needsRehash, hashPassword,
  tooManyFailures, noteFailure, clearFailures,
  SIGN_IN_FAILED, MAX_FAILURES_PER_HOUR, DECOY_HASH, DECOY_SALT,
} from './_password.js';

export async function onRequestPost({ request, env }) {
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  const email = normaliseEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return bad(SIGN_IN_FAILED, 401);

  if (await tooManyFailures(env, email)) {
    return bad(`That is ${MAX_FAILURES_PER_HOUR} wrong attempts on this address within the hour. For safety it stops answering until the hour is out. If it is your account and the password is gone, use your recovery code instead.`, 429);
  }

  let row;
  try { row = await one(env, 'SELECT id, email, display_name, password_hash, password_salt, created_at FROM users WHERE email=?1', email); }
  catch { return bad('Sign-in is unavailable right now. Nothing was changed.', 503); }

  // The decoy carries today's parameters, so an address with no account costs
  // the same work as one with a wrong password: no timing oracle for "is this
  // person registered here".
  const ok = row && row.password_hash
    ? await verifyPassword(password, row.password_hash, row.password_salt)
    : (await verifyPassword(password, DECOY_HASH, DECOY_SALT), false);

  if (!ok) {
    await noteFailure(env, email);
    return bad(SIGN_IN_FAILED, 401);
  }

  // Older parameters, rewritten now that the password is in hand. A failure
  // here is not the person's problem: they are signed in either way.
  if (needsRehash(row.password_hash, env)) {
    try {
      const fresh = await hashPassword(password, env);
      await run(env, 'UPDATE users SET password_hash=?1, password_salt=?2, updated_at=?3 WHERE id=?4', fresh.hash, fresh.salt, now(), row.id);
      await count(env, 'auth_password_rehash');
    } catch { /* the sign-in stands */ }
  }

  await clearFailures(env, email);
  let hasPasskey = false;
  try { hasPasskey = Boolean(await one(env, 'SELECT id FROM credentials WHERE user_id=?1', row.id)); } catch { /* not fatal */ }
  const cookie = await startSession(env, request, row.id);
  await count(env, 'auth_password_login');
  return json({
    ok: true,
    user: { id: row.id, email: row.email, displayName: row.display_name ?? null, hasPasskey, hasPassword: true, createdAt: row.created_at },
  }, 200, { 'set-cookie': cookie });
}

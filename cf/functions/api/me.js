/* ==========================================================================
   /api/me — who this browser is, if it chose to be anyone.

   GET    -> { ok, user: { id, email, displayName, hasPasskey, hasPassword, createdAt } | null }
   PUT    -> { displayName } (<=40 chars, or null/"" to clear it)
   DELETE -> erases the account: the passkeys, the sessions, the saved ledgers,
             the email address and the password hash, and answers with how many
             of each went, so the screen can say it rather than assert it. What
             the person already sent to the public register stays in the register
             — a correction is a message to an agency about a price, it carries
             nothing about a person, and other people's counts are built on it —
             but the link from those rows back to the account is cut, so nothing
             here can say who sent them ever again. The account page says exactly
             this before the button is pressed.

             A ledger saved WITHOUT an account is not reachable from here, by
             design: nothing ties it to a person. It carries its own delete code
             instead — DELETE /api/journeys/{slug} with x-delete-token — and it
             stops opening on its own after 180 days.

   Never CORS (the middleware excludes /api/me) and never cached.
   ========================================================================== */
import { json, bad, readJson, str, count, now } from './_http.js';
import { clearCookie, one, run, userOf } from './_db.js';

const NAME_MAX = 40;

/** The whole profile, from the session. Null when there is no session. */
async function profileOf(env, request) {
  const session = await userOf(env, request);
  if (!session) return null;
  const row = await one(env, 'SELECT id, email, display_name, password_hash, created_at FROM users WHERE id=?1', session.id);
  if (!row) return null;
  let hasPasskey = false;
  try { hasPasskey = Boolean(await one(env, 'SELECT id FROM credentials WHERE user_id=?1', row.id)); } catch { /* not fatal */ }
  return {
    id: row.id,
    email: row.email ?? null,
    displayName: row.display_name ?? null,
    hasPasskey,
    hasPassword: Boolean(row.password_hash),
    createdAt: row.created_at,
  };
}

export async function onRequestGet({ request, env }) {
  try { return json({ ok: true, user: await profileOf(env, request) }); }
  catch { return bad('Your sign-in could not be read right now.', 503); }
}

export async function onRequestPut({ request, env }) {
  const user = await userOf(env, request);
  if (!user) return bad('Sign in first.', 401);
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  let displayName;
  if (body.displayName === null || body.displayName === '') displayName = null;
  else {
    displayName = str(body.displayName, NAME_MAX);
    if (!displayName) return bad(`A display name is up to ${NAME_MAX} characters, or null to clear it.`);
  }
  try { await run(env, 'UPDATE users SET display_name=?1, updated_at=?2 WHERE id=?3', displayName, now(), user.id); }
  catch { return bad('That name could not be saved.', 500); }
  return json({ ok: true, user: await profileOf(env, request) });
}

/** How many rows of each kind this account owns, read before they go so the
 *  answer can name them. A count that cannot be read is reported as null, never
 *  as zero: "nothing was there" and "I could not look" are different sentences. */
async function ownedCounts(env, userId) {
  const of = async (table) => {
    try { const r = await one(env, `SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?1`, userId); return r ? Number(r.n) : 0; }
    catch { return null; }
  };
  return { journeys: await of('journeys'), passkeys: await of('credentials'), corrections: await of('corrections') };
}

export async function onRequestDelete({ request, env }) {
  const user = await userOf(env, request);
  if (!user) return bad('Sign in first.', 401);
  const erased = await ownedCounts(env, user.id);
  try {
    // Cut the link from public contributions to this account first, so a failure
    // half way through can never leave a name attached to a row that outlives it.
    for (const t of ['corrections', 'gap_reports', 'survey_responses']) {
      try { await run(env, `UPDATE ${t} SET user_id=NULL WHERE user_id=?1`, user.id); }
      catch { /* the column arrives with migration 0003; an older database has nothing to unlink */ }
    }
    // Explicit, in dependency order: D1 does not guarantee ON DELETE CASCADE is enforced.
    await run(env, 'DELETE FROM journeys WHERE user_id=?1', user.id);
    await run(env, 'DELETE FROM credentials WHERE user_id=?1', user.id);
    await run(env, 'DELETE FROM sessions WHERE user_id=?1', user.id);
    await run(env, 'DELETE FROM users WHERE id=?1', user.id);
  } catch { return bad('The account could not be erased. Nothing was changed.', 500); }
  await count(env, 'auth_delete');
  return json({ ok: true, user: null, erased: true, removed: erased }, 200, { 'set-cookie': clearCookie() });
}

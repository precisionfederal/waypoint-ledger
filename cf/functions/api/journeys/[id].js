/* GET /api/journeys/{slug} — read a shared journey.
   PUT /api/journeys/{id} — only the session that owns it.
   DELETE /api/journeys/{slug} — the session that owns it, OR the delete code
     handed back once when it was saved. The second door is the point: most
     people here never make an account, and a save they cannot undo is not a
     save, it is a deposit.

   The code travels in the x-delete-token header, or as {"deleteToken":"…"} in
   the body, or as ?token= for a curl a person can copy. It is compared against
   a SHA-256 in the row; the code itself was never stored. */
import { json, bad, readJson, now } from '../_http.js';
import { one, run, userOf } from '../_db.js';
import { tokenMatches } from '../_token.js';
import { validateJourney } from '../../../../lib/price-api.ts';
import { TABLE } from '../../../../lib/table.ts';

const shape = (r) => ({
  ok: true,
  id: r.id,
  slug: r.share_slug,
  title: r.title,
  entries: JSON.parse(r.entries_json),
  tableVersion: r.table_version,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  expiresAt: r.expires_at ?? null,
});

const GONE = 'No journey with that link. A link that was never saved, one whose 180 days are up, and one that has been deleted all read the same from here.';

/** An expired anonymous save is removed the moment anyone asks for it, so the
 *  row does not outlive the promise on the button. */
async function readLive(env, key) {
  const r = await one(env, 'SELECT * FROM journeys WHERE share_slug=?1 OR id=?1', key);
  if (!r) return null;
  if (r.expires_at && r.expires_at <= now()) {
    try { await run(env, 'DELETE FROM journeys WHERE id=?1', r.id); } catch { /* it stops opening either way */ }
    return null;
  }
  return r;
}

export async function onRequestGet({ params, env }) {
  const r = await readLive(env, params.id);
  if (!r) return bad(GONE, 404);
  return json(shape(r));
}

export async function onRequestPut({ params, request, env }) {
  const user = await userOf(env, request);
  if (!user) return bad('Sign in to change a saved journey.', 401);
  const r = await readLive(env, params.id);
  if (!r) return bad(GONE, 404);
  if (r.user_id !== user.id) return bad('That journey belongs to another account.', 403);
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  const v = validateJourney(body, TABLE);
  if (v.error) return bad(v.error);
  await run(env, 'UPDATE journeys SET entries_json=?1, title=?2, updated_at=?3 WHERE id=?4', JSON.stringify(v.entries), v.title, now(), r.id);
  const updated = await one(env, 'SELECT * FROM journeys WHERE id=?1', r.id);
  return json(shape(updated));
}

export async function onRequestDelete({ params, request, env }) {
  const r = await readLive(env, params.id);
  if (!r) return bad(GONE, 404);

  // Door one: the delete code from the day it was saved. No account, no cookie.
  const url = new URL(request.url);
  let offered = request.headers.get('x-delete-token') || url.searchParams.get('token') || '';
  if (!offered && (request.headers.get('content-type') || '').includes('json')) {
    const { body } = await readJson(request);
    if (body && typeof body.deleteToken === 'string') offered = body.deleteToken;
  }
  if (offered && await tokenMatches(offered, r.delete_hash)) {
    await run(env, 'DELETE FROM journeys WHERE id=?1', r.id);
    return json({ ok: true, deleted: r.id, by: 'delete-code' });
  }

  // Door two: the account that owns it.
  const user = await userOf(env, request);
  if (!user) {
    return bad(offered
      ? 'That delete code does not match this ledger. It is the code shown once when the ledger was saved; nobody here can look it up.'
      : 'To delete this ledger, send the delete code you were shown when you saved it (header x-delete-token), or sign in to the account that owns it.', 401);
  }
  if (r.user_id !== user.id) return bad('That journey belongs to another account.', 403);
  await run(env, 'DELETE FROM journeys WHERE id=?1', r.id);
  return json({ ok: true, deleted: r.id, by: 'account' });
}

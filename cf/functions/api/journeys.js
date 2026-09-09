/* POST /api/journeys — save a ledger and get a link back.

   Anonymous by default: a journey carries units of care, counts and the words
   the person typed, and nothing else. It is bound to an account only when a
   session is present.

   Two things come back with the link, and both exist because the anonymous
   saver is the majority here and had no way to undo a save:
   - deleteToken: a 16-character code, shown once, hashed here. It is the only
     way to remove an anonymous save, and it needs no account.
   - expiresAt: an anonymous save stops opening after 180 days. A save bound to
     an account has no expiry, which is the one honest reason to make one. */
import { json, bad, readJson, id as newId, now, slug, count } from './_http.js';
import { insert, userOf } from './_db.js';
import { makeToken, hashToken } from './_token.js';
import { validateJourney } from '../../../lib/price-api.ts';
import { TABLE, TABLE_VERSION } from '../../../lib/table.ts';

export const ANON_DAYS = 180;
const plusDays = (d) => new Date(Date.now() + d * 86400000).toISOString();

export async function onRequestPost({ request, env }) {
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  const v = validateJourney(body, TABLE);
  if (v.error) return bad(v.error);

  const user = await userOf(env, request);
  const shareSlug = slug();
  const t = now();
  const jid = newId();
  const deleteToken = makeToken();
  const expiresAt = user ? null : plusDays(ANON_DAYS);
  await insert(env, 'journeys', {
    id: jid,
    user_id: user ? user.id : null,
    share_slug: shareSlug,
    title: v.title,
    entries_json: JSON.stringify(v.entries),
    table_version: TABLE_VERSION,
    delete_hash: await hashToken(deleteToken),
    expires_at: expiresAt,
    created_at: t,
    updated_at: t,
  });
  await count(env, 'journeys');
  const origin = new URL(request.url).origin;
  return json({
    ok: true,
    id: jid,
    slug: shareSlug,
    url: `${origin}/ledger?s=${shareSlug}`,
    savedTo: user ? 'account' : 'link',
    deleteToken,
    expiresAt,
    deleteWith: `DELETE ${origin}/api/journeys/${shareSlug} with header x-delete-token`,
  });
}

export const onRequestGet = () => bad('A journey is read by its own link: GET /api/journeys/{slug}. There is no list of everyone’s journeys.', 405);

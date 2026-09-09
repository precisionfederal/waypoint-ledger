/* ==========================================================================
   GET /api/me/corrections — what this person has told the government.

   Every thumb sent from a signed-in browser is listed back here with the price
   row it was about and the day it was received, so a person can see their own
   contribution to the public register instead of taking our word for it. The
   note they typed comes back to them and only to them; it is never served
   publicly anywhere.

   A correction sent while signed out has no user_id and appears nowhere here,
   which is the intended default: the register is anonymous.
   ========================================================================== */
import { json, bad } from '../_http.js';
import { all, userOf } from '../_db.js';

const LIMIT = 500;

export async function onRequestGet({ request, env }) {
  let user;
  try { user = await userOf(env, request); }
  catch { return bad('Your sign-in could not be read right now.', 503); }
  if (!user) return bad('Sign in first.', 401);

  let rows;
  try {
    rows = await all(env, 'SELECT id, price_id, verdict, believed_usd, note, table_version, received_at FROM corrections WHERE user_id=?1 ORDER BY received_at DESC LIMIT ?2', user.id, LIMIT);
  } catch { return bad('Your corrections could not be read right now.', 503); }

  return json({
    ok: true,
    n: rows.length,
    corrections: rows.map((r) => ({
      id: r.id,
      priceId: r.price_id,
      verdict: r.verdict,
      believedUsd: r.believed_usd ?? null,
      note: r.note ?? null,
      tableVersion: r.table_version ?? null,
      receivedAt: r.received_at,
    })),
  });
}

/* ==========================================================================
   Passkey plumbing shared by the four auth routes. Not a route (leading _).

   Why a passkey and nothing else: the product promises no account is needed and
   nothing identifies a person. A passkey is the only way to offer "my ledgers on
   my other device" without an email address, a password or a recovery question.
   The relying party is whatever host served the request, so the same code works
   on localhost, on a preview deployment and on the live site with no config.

   A challenge lives in KV for five minutes and is spent on first use. KV holds
   nothing else about a person: no IP, no user agent, no email.
   ========================================================================== */
import { id, now } from '../_http.js';
import { insert, SESSION_DAYS, sessionCookie } from '../_db.js';

export const RP_NAME = 'Waypoint Ledger';
export const CHALLENGE_TTL = 300; // seconds
export const DISPLAY_NAME_MAX = 40;
/** What a passkey manager shows when the person gave no display name. */
export const DEFAULT_LABEL = 'Saved ledger';

/** The relying party is the host that served this request. */
export function rpOf(request) {
  const u = new URL(request.url);
  return { rpID: u.hostname, origin: u.origin };
}

/** Read an optional JSON body without tripping on an empty one. */
export async function optionalJson(request, readJson) {
  const len = Number(request.headers.get('content-length') || 0);
  if (!len) return { body: {} };
  return readJson(request);
}

export async function putChallenge(env, record) {
  const cid = id();
  await env.LEDGER.put(`chal:${cid}`, JSON.stringify(record), { expirationTtl: CHALLENGE_TTL });
  return cid;
}

/** Spend a challenge: read it, delete it, and require the kind it was made for. */
export async function takeChallenge(env, cid, kind) {
  if (typeof cid !== 'string' || !cid || cid.length > 64) return null;
  const raw = await env.LEDGER.get(`chal:${cid}`);
  if (!raw) return null;
  try { await env.LEDGER.delete(`chal:${cid}`); } catch { /* one-use is best effort */ }
  try { const r = JSON.parse(raw); return r && r.kind === kind ? r : null; } catch { return null; }
}

/** Insert a 30-day session and return the Set-Cookie value for it. */
export async function startSession(env, request, userId) {
  const sid = id();
  await insert(env, 'sessions', {
    id: sid, user_id: userId, created_at: now(),
    expires_at: new Date(Date.now() + SESSION_DAYS * 86400 * 1000).toISOString(),
  });
  return sessionCookie(sid, request);
}

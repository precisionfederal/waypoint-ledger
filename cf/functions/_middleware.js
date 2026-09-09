// Cross-cutting: security headers, CORS for public GET, rate limiting for writes, body cap, request counters.
import { bad, MAX_BODY } from './api/_http.js';
import { networkKey } from './api/_hash.js';

const LIMITS = { 'POST /api/price': 300, 'POST /api/fhir': 300, 'POST /api/journeys': 30, 'POST /api/auth/password/login': 60, 'POST /api/auth/password/signup': 20, 'POST /api/auth/password/recover': 30, 'POST /api/auth/password/change': 30, ADMIN: 300, DEFAULT_WRITE: 20 }; // per hashed IP per hour

/* ---------------------------------------------------------------------------
   THE ADMIN DOOR.

   Round 3 sent sixteen wrong bearer tokens at two admin routes and got sixteen
   401s, never a 429: line 22 used to exclude /api/admin/ from both the limiter
   and the body cap, so the one door with no public purpose was the least
   defended thing on the origin. It is now inside both, with a wider limit
   because a legitimate admin session is chatty, plus a lockout that counts
   WRONG tokens rather than requests: five in an hour from one network and that
   network gets 429 on every admin path until the hour turns.

   The lockout is per network, not global, so an attacker cannot lock the real
   admin out by guessing from somewhere else.
   --------------------------------------------------------------------------- */
const ADMIN_FAILS_PER_HOUR = 5;
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

/* One definition of "which network is this", shared with the per-figure
   cooldown in api/corrections.js. See api/_hash.js: it carries a daily salt and
   a server secret, and nothing derived from it is ever stored in a row. */
const ipKey = networkKey;

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith('/api/');
  const method = request.method.toUpperCase();

  if (isApi && method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } });
  }
  const isAdminPath = url.pathname.startsWith('/api/admin/');
  const hour = new Date().toISOString().slice(0, 13);
  let net = null;
  const netOf = async () => (net ??= await ipKey(request, env));

  /* The body cap is first, before any bucket is read or written: an oversized
     request is refused without spending a KV round trip on it, and a fat body is
     never read to find out who sent it. */
  if (isApi && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && Number(request.headers.get('content-length') || 0) > MAX_BODY) {
    return bad('Body too large.', 413);
  }

  /* The lockout is checked on EVERY admin request, including GET: reading the
     interviews is the thing a wrong token is trying to do. */
  if (isApi && isAdminPath) {
    try {
      const fails = Number((await env.LEDGER.get(`af:${hour}:${await netOf()}`)) || 0);
      if (fails >= ADMIN_FAILS_PER_HOUR) return bad('Too many failed attempts from this network this hour.', 429);
    } catch { /* the lockout is best effort; never lock the real admin out on a KV blip */ }
  }

  if (isApi && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const limit = isAdminPath ? LIMITS.ADMIN : (LIMITS[`${method} ${url.pathname}`] ?? LIMITS.DEFAULT_WRITE);
    try {
      const k = `rl:${hour}:${await netOf()}:${url.pathname}`;
      const n = Number((await env.LEDGER.get(k)) || 0) + 1;
      await env.LEDGER.put(k, String(n), { expirationTtl: 3700 });
      if (n > limit) return bad('Too many requests from this network this hour. Please try again later.', 429);
    } catch { /* rate limiting is best effort; never block on its failure */ }
  }

  const res = await next();

  /* A wrong token is counted after the route has judged it, so the counter can
     never be moved by a request that was in fact authorised. */
  if (isApi && isAdminPath && res.status === 401) {
    try {
      const k = `af:${hour}:${await netOf()}`;
      await env.LEDGER.put(k, String(Number((await env.LEDGER.get(k)) || 0) + 1), { expirationTtl: 3700 });
    } catch { /* best effort */ }
  }
  const h = new Headers(res.headers);
  h.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  h.set('x-frame-options', 'DENY');
  if (!isApi) h.set('content-security-policy', CSP);
  // Public reads are open to anyone. The three cookie-backed families are not:
  // /api/admin (token), /api/me (session) and /api/bluebutton (a Medicare
  // access token). A browser already refuses to expose a `*` response to a
  // credentialed cross-origin fetch, and the cookies are SameSite=Lax, so this
  // is the third lock on the same door rather than the only one.
  if (isApi && method === 'GET' && !url.pathname.startsWith('/api/admin/') && !url.pathname.startsWith('/api/me') && !url.pathname.startsWith('/api/bluebutton/')) h.set('access-control-allow-origin', '*');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

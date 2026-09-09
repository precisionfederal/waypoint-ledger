// Cross-cutting: security headers, CORS for public GET, rate limiting for writes, body cap, request counters.
import { bad, MAX_BODY } from './api/_http.js';
import { networkKey } from './api/_hash.js';

const LIMITS = { 'POST /api/price': 300, 'POST /api/fhir': 300, 'POST /api/map': 120, 'POST /api/journeys': 30, 'POST /api/auth/password/login': 60, 'POST /api/auth/password/signup': 20, 'POST /api/auth/password/recover': 30, 'POST /api/auth/password/change': 30, ADMIN: 300, DEFAULT_WRITE: 20 }; // per hashed IP per hour

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

/* ---------------------------------------------------------------------------
   THE CONTENT SECURITY POLICY, AND WHY IT IS COMPUTED INSTEAD OF WRITTEN DOWN.

   Until 2026-09-09 script-src said 'self' 'unsafe-inline'. That is the single
   header that decides whether one reflected or stored string becomes script
   execution on this origin, and 'unsafe-inline' says yes to every inline script
   on the page — including one that was never in the export. The site is a Next
   static export, so it cannot use a per-request nonce the way a rendered app
   does: a nonce has to be written into the HTML, and the HTML here is a file.

   A nonce injected by HTMLRewriter would work until the first 304. The stored
   body carries the old nonce, the revalidation carries a new CSP header, and
   the page loads with every script refused. A policy that depends on the header
   and the body being generated together cannot be cached, and this site is
   cached.

   So the policy is a pure function of the bytes being served: read the HTML,
   take the SHA-256 of every inline script in it, and name those hashes in
   script-src. Same body, same header, always — a cache hit and a fresh render
   agree by construction, and an injected script has no hash and does not run.
   The work is one digest per inline script (eight to twelve on a page here) and
   the result is memoised per ETag, so a repeated request pays nothing.

   'unsafe-hashes' plus the handler's own hash appears ONLY on a page that has
   an inline event-handler attribute. Exactly one page does (public/offline.html,
   onclick="location.reload()"), so exactly one page carries the weaker keyword
   and the other nineteen do not.
   --------------------------------------------------------------------------- */
const CSP_TAIL = "style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
/* An API answer is JSON or CSV. Nothing in it is ever a document, so nothing in
   it may load or run anything at all. */
const CSP_API = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

const INLINE_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const TAG = /<[a-zA-Z][^>]*>/g;
const HANDLER_ATTR = /\son[a-z]{2,20}\s*=\s*("([^"]*)"|'([^']*)')/gi;

/** Memoised per ETag (or per path when the asset has none). Bounded so a long
 *  lived isolate cannot grow one entry per URL an attacker invents. */
const CSP_CACHE = new Map();
const CSP_CACHE_MAX = 64;

const ENC = new TextEncoder();
async function sha256b64(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', ENC.encode(text)));
  let s = '';
  for (let i = 0; i < d.length; i += 1) s += String.fromCharCode(d[i]);
  return btoa(s);
}

/** The script-src source list this exact HTML needs, and nothing wider. */
export async function cspForHtml(html) {
  const sources = ["'self'"];
  const seen = new Set();
  const addHash = async (text) => {
    const h = `'sha256-${await sha256b64(text)}'`;
    if (!seen.has(h)) { seen.add(h); sources.push(h); }
  };

  INLINE_SCRIPT.lastIndex = 0;
  let m;
  while ((m = INLINE_SCRIPT.exec(html)) !== null) {
    if (/\bsrc\s*=/i.test(m[1] || '')) continue;   // external: covered by 'self'
    if (m[2]) await addHash(m[2]);
  }

  /* Handler attributes are read only inside a tag, so prose containing the word
     "one" after a space cannot invent a source. */
  let handlers = 0;
  TAG.lastIndex = 0;
  let t;
  while ((t = TAG.exec(html)) !== null) {
    HANDLER_ATTR.lastIndex = 0;
    let h;
    while ((h = HANDLER_ATTR.exec(t[0])) !== null) {
      const code = h[2] !== undefined ? h[2] : h[3];
      if (code) { handlers += 1; await addHash(code); }
    }
  }
  if (handlers > 0) sources.push("'unsafe-hashes'");

  return `default-src 'self'; script-src ${sources.join(' ')}; ${CSP_TAIL}`;
}

/* One definition of "which network is this", shared with the per-figure
   cooldown in api/corrections.js. See api/_hash.js: it carries a daily salt and
   a server secret, and nothing derived from it is ever stored in a row. */
const ipKey = networkKey;

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith('/api/');
  const method = request.method.toUpperCase();
  const isAdminPath = url.pathname.startsWith('/api/admin/');
  /* The three cookie-backed families. A browser already refuses to expose a `*`
     response to a credentialed cross-origin fetch, and the session cookie is
     SameSite=Lax, so this is the third lock on the same door — but the preflight
     used to answer `*` for them anyway, which said "this door is open" to
     anybody reading the headers. It no longer does. */
  const isCredentialed = isAdminPath || url.pathname.startsWith('/api/me') || url.pathname.startsWith('/api/bluebutton/');

  if (isApi && method === 'OPTIONS') {
    const pre = { 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', 'content-security-policy': CSP_API, 'x-content-type-options': 'nosniff' };
    if (!isCredentialed) pre['access-control-allow-origin'] = '*';
    return new Response(null, { status: 204, headers: pre });
  }
  const hour = new Date().toISOString().slice(0, 13);
  let net = null;
  const netOf = async () => (net ??= await ipKey(request, env));

  /* The body cap is first, before any bucket is read or written: an oversized
     request is refused without spending a KV round trip on it, and a fat body is
     never read to find out who sent it. A body with no content-length at all is
     capped where it is actually read, by readJson in api/_http.js, which counts
     bytes off the stream and cancels it. */
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
      if (n > limit) {
        const r = bad('Too many requests from this network this hour. Please try again later.', 429);
        // A 429 with no Retry-After is a machine-readable answer that only a
        // human can act on. The bucket turns with the hour, so that is the wait.
        r.headers.set('retry-after', String(Math.max(1, 3600 - (Math.floor(Date.now() / 1000) % 3600))));
        return r;
      }
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
  h.set('strict-transport-security', 'max-age=31536000; includeSubDomains; preload');
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  h.set('x-frame-options', 'DENY');
  h.set('cross-origin-opener-policy', 'same-origin');
  h.set('cross-origin-resource-policy', 'same-site');
  if (isApi) h.set('content-security-policy', CSP_API);
  if (isApi && method === 'GET' && !isCredentialed) h.set('access-control-allow-origin', '*');

  if (isApi || res.status !== 200) return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });

  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('text/html')) return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });

  /* An HTML answer is the only thing on this origin that can run script, so it
     is the only thing worth buffering. The body is re-served unchanged; only the
     header is derived from it. */
  const key = res.headers.get('etag') || `p:${url.pathname}`;

  /* A HEAD has the headers and none of the body, so there is nothing to hash.
     Answering it with `script-src 'self'` and no hashes would advertise a policy
     that would break the page the GET returns — a scanner reads that and a
     careful reader is misled. If a GET for this exact ETag has already been
     served, the policy for it is known and is repeated here; otherwise no CSP is
     claimed, because a body-less answer cannot run anything. */
  if (method === 'HEAD') {
    const known = CSP_CACHE.get(key);
    if (known) h.set('content-security-policy', known);
    else h.delete('content-security-policy');
    return new Response(null, { status: res.status, statusText: res.statusText, headers: h });
  }

  const html = await res.text();
  let csp = CSP_CACHE.get(key);
  if (!csp) {
    csp = await cspForHtml(html);
    if (CSP_CACHE.size >= CSP_CACHE_MAX) CSP_CACHE.clear();
    CSP_CACHE.set(key, csp);
  }
  h.set('content-security-policy', csp);
  return new Response(html, { status: res.status, statusText: res.statusText, headers: h });
}

// Cross-cutting: security headers, CORS for public GET, rate limiting for writes, body cap, request counters.
import { bad, json, MAX_BODY, isDryRun, peekJson, channelOf } from './api/_http.js';
import { OPENAPI } from '../../lib/openapi.ts';
import { networkKey } from './api/_hash.js';
import { serverActionOf, recordUse, sourceOf } from './api/_use.js';

const LIMITS = {
  'POST /api/price': 300, 'POST /api/fhir': 300,
  'POST /api/map': 600 /* read-only mapping; the spend ceiling is the global KV counter in map.js (R6 sense F1, 2026-09-09) */,
  'POST /api/journeys': 30,
  'POST /api/auth/password/login': 60, 'POST /api/auth/password/signup': 20, 'POST /api/auth/password/recover': 30, 'POST /api/auth/password/change': 30,
  /* The passkey doors used to fall through to DEFAULT_WRITE (R1-auth I6, 2026-09-30).
     A sign-in is two calls (options, then verify), and a person who cancels the
     prompt and tries again spends two more, so sign-in gets the password door's
     60; creating an account stays at the password signup's 20. */
  'POST /api/auth/login/options': 60, 'POST /api/auth/login/verify': 60,
  'POST /api/auth/register/options': 20, 'POST /api/auth/register/verify': 20,
  'POST /api/gap': 300, 'POST /api/corrections': 300 /* R6 edge #4, 2026-09-09: a demo room, a conference wifi and a NAT are ONE hashed IP, so DEFAULT_WRITE:20 made the 21st thumbs-down in the room fail. The real abuse control is the per-figure FIGURE_CAP in corrections.js, which is per figure and still stops one machine moving a count. */,
  /* THE TWO COUNTS BO READS OUT (R1-security S-04, 2026-09-30). At 300 an hour one
     network added six "interviews" of one-letter answers and five survey answers
     in a minute, and the register printed them. A person answers the burden
     survey once and writes an interview once; five an hour is a household or a
     clinic kiosk, and COUNTED_DAILY below caps the day, because the network key
     rolls daily and an hourly cap alone still lets one machine add 120 a day.
     Corrections and the gap report keep the room-sized ceiling: corrections have
     the per-figure cap, and a gap report is several lines of one person's care. */
  /* THE SURVEY IS NOT LIMITED FOR PEOPLE (Bo, 2026-09-30 21:3x CT: "remove this … why limit the survey").
     A real person, a family or a whole clinic on one Wi-Fi never sees a refusal. Only
     the room-sized flood guard the gap report and corrections use (300 an hour per
     network) remains, against a script; no daily cap. The register shows answers
     next to distinct senders, so a burst from one network stays visible as one sender. */
  'POST /api/survey': 300, 'POST /api/interview': 5,
  'POST /api/use': 600 /* the browser's own action counts (api/_use.js): a room on one network opening ledgers */,
  ADMIN: 300, DEFAULT_WRITE: 20,
}; // per hashed IP per hour
const COUNTED_DAILY = { '/api/interview': 10 }; // per hashed IP per day (the survey has none: Bo 2026-09-30)

/* ---------------------------------------------------------------------------
   A CLINIC'S WAITING ROOM IS ONE NETWORK (FLOW adopter-3, 2026-09-30).

   An organization's survey link (/survey?c=<label>, made at /adopt/kit) is handed
   out in a room where every phone on the Wi-Fi is one hashed network. At 5 an hour
   and 10 a day the sixth patient was refused, and a group could never reach the 11
   answers its own count page needs from one site in one day.

   The mechanism: a survey answer that carries a valid channel label is counted in
   a bucket keyed on network AND label, under a ceiling for the whole network. The
   label is read from a capped copy of the body, the same field the route validates
   and stores (api/survey.js, channelOf(b.channel)).

   🔴 TONIGHT THE NUMBERS EQUAL THE DIRECT LIMITS, AND THE CEILING IS THE DIRECT
   BUCKET ITSELF (main session, 2026-09-30 night). Labels are not registered
   anywhere: /adopt/kit makes the slug in the browser and the only place a label
   lives is the channel column of survey_responses. So any request can invent a
   label, and a raise keyed on an unregistered label would let one person add
   40 an hour to the count Bo reads aloud at 11:00 ET. With CHANNEL_RAISE off,
   every survey answer from one network, labelled or not, shares one bucket of
   5 an hour and 10 a day, exactly as production. THE RAISE WAITS ON REGISTERED
   CHANNELS: only a label registered before the answer arrived may open a bigger
   bucket, and a fresh label per request never does.
   --------------------------------------------------------------------------- */
const CHANNEL_RAISE = false;
export const SURVEY_CHANNEL_LIMIT = { hour: 300, day: null };   // per network + label: the flood guard only (Bo 2026-09-30); no daily cap
export const SURVEY_NETWORK_CEILING = { hour: 300, day: null }; // per network, every label (and, while CHANNEL_RAISE is off, direct) together
const CEILING_SUFFIX = CHANNEL_RAISE ? ':channels' : '';

/** How long until a bucket turns, in words a person acts on. */
export function waitWords(seconds) {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 90) return 'in a minute or two';
  const m = Math.ceil(s / 60);
  if (m < 60) return `in ${m} minutes`;
  const h = Math.round(m / 60);
  return h <= 1 ? 'in about an hour' : `in about ${h} hours`;
}
const toHour = () => 3600 - (Math.floor(Date.now() / 1000) % 3600);
const toDay = () => 86400 - (Math.floor(Date.now() / 1000) % 86400);
function tooMany(message, retryAfter) {
  const r = bad(message, 429);
  // A 429 with no Retry-After is a machine-readable answer that only a
  // human can act on. The bucket turns with the hour (or the UTC day), so that is the wait.
  r.headers.set('retry-after', String(Math.max(1, retryAfter)));
  return r;
}
const hourMessage = (path, wait) => (path === '/api/survey'
  ? `A lot of answers have come from this network in the last hour. Your answers are still on the page: press the button again ${wait}, or switch your phone to mobile data and press it now.`
  : `Too many requests from this network this hour. Please try again ${wait}.`);
const dayMessage = (wait) => `This network has already sent as many of these as one day allows. Thank you; please try again ${wait}, when the day's count starts again.`;

/** Every documented route, as [method, path regex], for the unknown-route answer. */
const ROUTES = Object.entries(OPENAPI.paths).flatMap(([path, item]) =>
  Object.keys(item).filter((m) => ['get', 'post', 'put', 'delete', 'patch'].includes(m))
    .map((m) => [m.toUpperCase(), new RegExp('^' + path.replace(/\{[^/]+\}/g, '[^/]+') + '$')]));

/* ---------------------------------------------------------------------------
   CROSS-SITE WRITES (R1-auth F1, R1-security S-04, 2026-09-30).

   A page on any other site could auto-submit a <form enctype="text/plain"> to
   /api/auth/password/login. The browser follows it as a top-level navigation,
   SameSite=Lax lets the Set-Cookie land, and the victim is now signed in to the
   ATTACKER's account: the next ledger they save, the next correction they send,
   is filed where the attacker reads it. Chromium and WebKit both did this.

   The same text/plain trick needs no preflight, so a third-party page could also
   make every visitor's browser post a survey answer from its own network.

   So a state-changing request to a cookie-backed route or to a counted write is
   refused when the browser says it came from another site. Browsers put Origin
   on every cross-origin POST (and on same-origin ones, where it matches); where
   Origin is missing, Referer is read. A request carrying neither is a server or
   curl, which holds no one's cookie, and it goes through, so the /developers
   examples keep working. /api/price, /api/fhir and /api/map stay open to every
   origin: they read the public table, change nothing a person owns, and the
   /developers page invites browser apps to call them.
   --------------------------------------------------------------------------- */
const CORS_POST = new Set(['/api/price', '/api/fhir']);
const SAME_SITE_ONLY = /^\/api\/(auth|me|journeys|corrections|survey|interview|gap|use)(\/|$)/;
export function crossSite(request, url) {
  const from = request.headers.get('origin') || request.headers.get('referer');
  if (!from) return false;
  try { return new URL(from).host !== url.host; }
  catch { return true; }   // "null" (a sandboxed frame, a privacy redirect) is not this site
}

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

export async function onRequest({ request, env, next, waitUntil = null }) {
  const url = new URL(request.url);
  /* The static export writes every page's React payload beside it as /<page>.txt. The
     client router fetches it; a person never should. When a deploy lands under an open
     tab, the old router can hard-navigate to that .txt and the person sees the raw
     payload (Bo saw /register.txt on 2026-09-09). A top-level document request for a
     page payload goes to the page instead. LICENSE, NOTICE and robots stay as they are. */
  if (request.method === 'GET' && /\.txt$/.test(url.pathname) && request.headers.get('sec-fetch-dest') === 'document'
      && !/^\/(LICENSE|NOTICE|robots)\.txt$/.test(url.pathname)) {
    const page = url.pathname === '/index.txt' ? '/' : url.pathname.replace(/\.txt$/, '');
    return Response.redirect(new URL(page + url.search, url.origin).toString(), 302);
  }
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

  if (isApi && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && SAME_SITE_ONLY.test(url.pathname) && crossSite(request, url)) {
    return bad('This request came from another website, so it was refused. Open Waypoint Ledger itself and try again there.', 403);
  }

  if (isApi && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    /* A ?dry=1 write validates and writes nothing, so it moves no count and is
       not held to the counted caps: a release gate proving the survey path must
       not use up the five a real person on the same network may send. It keeps
       a bucket of its own at the room-sized ceiling. */
    const dryCounted = COUNTED_DAILY[url.pathname] !== undefined && isDryRun(request);
    /* adopter-3: a survey answer sent through an organization's link. */
    let label = null;
    if (method === 'POST' && url.pathname === '/api/survey' && !dryCounted) {
      const c = channelOf((await peekJson(request))?.channel);
      if (c !== 'direct') label = c;
    }
    const bump = async (k, ttl) => {
      const n = Number((await env.LEDGER.get(k)) || 0) + 1;
      await env.LEDGER.put(k, String(n), { expirationTtl: ttl });
      return n;
    };
    try {
      if (label) {
        const ceiling = await bump(`rl:${hour}:${await netOf()}:${url.pathname}${CEILING_SUFFIX}`, 3700);
        const mine = await bump(`rl:${hour}:${await netOf()}:${url.pathname}:c:${label}`, 3700);
        if (mine > SURVEY_CHANNEL_LIMIT.hour || ceiling > SURVEY_NETWORK_CEILING.hour) return tooMany(hourMessage(url.pathname, waitWords(toHour())), toHour());
      } else {
        const limit = isAdminPath ? LIMITS.ADMIN : dryCounted ? 300 : (LIMITS[`${method} ${url.pathname}`] ?? LIMITS.DEFAULT_WRITE);
        const n = await bump(`rl:${hour}:${await netOf()}:${url.pathname}${dryCounted ? ':dry' : ''}`, 3700);
        if (n > limit) return tooMany(hourMessage(url.pathname, waitWords(toHour())), toHour());
      }
    } catch { /* rate limiting is best effort; never block on its failure */ }
    const perDay = method === 'POST' && !dryCounted ? COUNTED_DAILY[url.pathname] : undefined;
    if (perDay) {
      try {
        const day = `rd:${hour.slice(0, 10)}:${await netOf()}:${url.pathname}`;
        let over;
        if (label) {
          const ceiling = await bump(`${day}${CEILING_SUFFIX}`, 90000);
          const mine = await bump(`${day}:c:${label}`, 90000);
          over = mine > SURVEY_CHANNEL_LIMIT.day || ceiling > SURVEY_NETWORK_CEILING.day;
        } else over = (await bump(day, 90000)) > perDay;
        if (over) return tooMany(dayMessage(waitWords(toDay())), toDay());
      } catch { /* best effort, like the hourly bucket */ }
    }
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
  /* USE, COUNTED WITHOUT KNOWING WHO (api/_use.js): one per 2xx product action per day,
     filed by source so our own gates and known bots never reach the public number. */
  const action = isApi ? serverActionOf(method, url.pathname, res.status, request.url) : null;
  if (action) { const p = recordUse(env, action, sourceOf(request)); if (typeof waitUntil === 'function') waitUntil(p); else await p; }
  const h = new Headers(res.headers);
  h.set('strict-transport-security', 'max-age=31536000; includeSubDomains; preload');
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  h.set('x-frame-options', 'DENY');
  h.set('cross-origin-opener-policy', 'same-origin');
  h.set('cross-origin-resource-policy', 'same-site');
  // The embed button's script is meant to load on clinic and agency sites; everything else stays same-site.
  if (url.pathname === '/embed.js') h.set('cross-origin-resource-policy', 'cross-origin');
  if (isApi) h.set('content-security-policy', CSP_API);
  if (isApi && method === 'GET' && !isCredentialed) h.set('access-control-allow-origin', '*');
  /* FLOW adopter-2: the preflight already said POST, and a browser app on another
     site could not read the answer. /api/price and /api/fhir read the public table,
     read no cookie and no session, and change nothing a person owns, so their POST
     answers are readable from any origin. /api/map is not: it spends money on the
     reader model, so it is called from the caller's own server. Never set with
     allow-credentials. */
  if (isApi && method === 'POST' && CORS_POST.has(url.pathname)) h.set('access-control-allow-origin', '*');

  /* FLOW adopter-8: an /api/ path no function answers fell through to the site's
     HTML 404 page. A JSON client gets JSON, with the way to the route list. */
  if (isApi && res.status === 404 && (res.headers.get('content-type') || '').toLowerCase().includes('text/html')) {
    const offered = ROUTES.filter(([, re]) => re.test(url.pathname)).map(([m]) => m);
    const error = offered.length
      ? `${url.pathname} does not take ${method}; it takes ${offered.join(' or ')}. GET /api/openapi.json describes every route.`
      : `No route ${method} ${url.pathname}. GET /api/openapi.json lists all ${ROUTES.length}.`;
    const j = json({ ok: false, error }, offered.length ? 405 : 404);
    for (const [k, v] of j.headers) h.set(k, v);
    h.delete('content-length'); h.delete('etag');
    if (offered.length) h.set('allow', offered.join(', '));
    return new Response(j.body, { status: j.status, headers: h });
  }

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
  /* no-transform keeps the edge from rewriting the page. On waypointledger.org the
     zone's Web Analytics would otherwise inject a third-party beacon, which /privacy
     promises never happens (and the CSP blocks, leaving a red console error). */
  h.set('cache-control', `${(h.get('cache-control') || 'public, max-age=0, must-revalidate').replace(/,?\s*no-transform/g, '')}, no-transform`);
  return new Response(html, { status: res.status, statusText: res.statusText, headers: h });
}

/* ==========================================================================
   Waypoint Ledger — service worker.
   The price table ships with the client, so pricing a journey must work with
   no network at all. This worker precaches the export shell, serves static
   assets stale-while-revalidate, tries the network first for the API, and
   falls back to a written offline page for a navigation it cannot serve.

   Nothing personal is ever cached: /api/admin, /api/me and /api/auth are
   passed straight to the network and their responses are never stored.
   Bump VERSION to retire every old cache on the next activate.
   ========================================================================== */

const VERSION = 'wl-2026-09-09-2';
const SHELL = `${VERSION}:shell`;
const STATIC = `${VERSION}:static`;
const API = `${VERSION}:api`;
const MINE = [SHELL, STATIC, API];

/* Routes that must exist offline. Every other page falls back to /offline.html. */
const SHELL_ROUTES = ['/', '/journey', '/ledger', '/sheet', '/method', '/privacy', '/offline'];
const SHELL_ASSETS = ['/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];

/* Never cached, never intercepted with a cached answer. */
const PRIVATE = ['/api/admin', '/api/me', '/api/auth'];

const isPrivate = (p) => PRIVATE.some((x) => p === x || p.startsWith(`${x}/`));
const isStatic = (p) =>
  p.startsWith('/_next/static/') || p.startsWith('/data/') ||
  /\.(?:js|css|png|jpe?g|svg|webp|avif|ico|woff2?|txt|json|csv)$/.test(p);

/* The export references its chunks from the HTML. Read them out of the markup
   at install time so a first visit to "/" also makes /journey work offline. */
function assetsIn(html) {
  const out = new Set();
  const re = /["'(](\/_next\/static\/[^"')\s]+?\.(?:js|css))["')]/g;
  let m;
  while ((m = re.exec(html))) out.add(m[1].replace(/\\u002F/g, '/'));
  return [...out];
}

/* Pages 308-redirects /x.html to /x. A response that carries redirect state
   cannot be handed back for a navigation (the browser fails the load), so every
   cached response is rebuilt as a plain 200 first. */
function flatten(res) {
  if (!res.redirected && res.type !== 'opaqueredirect') return res;
  return new Response(res.body, { status: 200, statusText: 'OK', headers: res.headers });
}

async function cacheQuietly(cache, urls) {
  await Promise.all(urls.map(async (u) => {
    try {
      const res = await fetch(u, { credentials: 'same-origin' });
      if (res && res.ok) await cache.put(u, flatten(res.clone()));
    } catch { /* one asset missing must never fail the install */ }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    const statics = await caches.open(STATIC);
    const found = new Set();
    await Promise.all(SHELL_ROUTES.map(async (route) => {
      try {
        const res = await fetch(route, { credentials: 'same-origin' });
        if (!res || !res.ok) return;
        const copy = res.clone();
        await shell.put(route, flatten(res));
        if ((copy.headers.get('content-type') || '').includes('text/html')) {
          for (const a of assetsIn(await copy.text())) found.add(a);
        }
      } catch { /* offline at install: the runtime handler will fill in */ }
    }));
    await cacheQuietly(statics, [...found, ...SHELL_ASSETS]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('wl-') && !MINE.includes(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* The page hands back every static URL it actually loaded, so the next visit
   to any route it links to is already warm. */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'PRECACHE' || !Array.isArray(data.urls)) return;
  const urls = data.urls.filter((u) => typeof u === 'string').slice(0, 200);
  event.waitUntil((async () => { await cacheQuietly(await caches.open(STATIC), urls); })());
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request, { ignoreVary: true });
  const network = fetch(request).then((res) => {
    if (res && res.ok && res.status === 200) cache.put(request, flatten(res.clone())).catch(() => {});
    return res;
  }).catch(() => null);
  if (hit) { network.catch(() => {}); return hit; }
  const res = await network;
  if (res) return res;
  return new Response('', { status: 504, statusText: 'Offline' });
}

async function networkFirstApi(request) {
  const cache = await caches.open(API);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch {
    const hit = await cache.match(request);
    if (hit) {
      const h = new Headers(hit.headers);
      h.set('x-waypoint-offline', 'cached');
      return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: h });
    }
    return new Response(JSON.stringify({ ok: false, error: 'You are offline. Nothing was sent and nothing was lost.' }),
      { status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
}

async function navigate(request) {
  const shell = await caches.open(SHELL);
  try {
    const res = await fetch(request);
    if (res && res.ok) shell.put(new URL(request.url).pathname, flatten(res.clone())).catch(() => {});
    return res;
  } catch {
    const url = new URL(request.url);
    const hit = (await shell.match(url.pathname)) || (await caches.match(request, { ignoreSearch: true }));
    if (hit) return hit;
    const off = (await shell.match('/offline')) || (await shell.match('/offline.html'));
    if (off) return off;
    return new Response('Offline.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isPrivate(url.pathname)) return;              // straight to the network, never stored
  if (request.mode === 'navigate') { event.respondWith(navigate(request)); return; }
  if (url.pathname.startsWith('/api/')) { event.respondWith(networkFirstApi(request)); return; }
  if (isStatic(url.pathname)) { event.respondWith(staleWhileRevalidate(request)); return; }
});

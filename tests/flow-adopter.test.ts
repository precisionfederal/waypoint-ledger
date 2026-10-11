/* ==========================================================================
   FLOW AUDIT, ADOPTER (2026-09-30): a state developer, a clinic manager and an
   advocacy lead walked /developers, /adopt and the kit. What they hit, pinned.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import * as Dev from '../components/Developers';

const blocks = Object.entries(Dev).filter(([k, v]) => k.startsWith('CURL_') && typeof v === 'string') as [string, string][];

describe('adopter-1 and adopter-6: every copyable call runs as copied', () => {
  it('finds the worked calls', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(11);
  });
  it('every -d body is valid JSON (a line break inside a quoted string made the first call a 400)', () => {
    let bodies = 0;
    for (const [name, code] of blocks) {
      for (const m of code.matchAll(/-d '([^']*)'/g)) {
        bodies += 1;
        expect(() => JSON.parse(m[1]), `${name}: ${m[1]}`).not.toThrow();
      }
    }
    expect(bodies).toBeGreaterThanOrEqual(5);
  });
  it('every block that uses $BASE defines it on its own first line, so one block copied alone runs', () => {
    for (const [name, code] of blocks) {
      if (!code.includes('$BASE')) continue;
      expect(code.split('\n')[0], name).toBe('BASE=https://waypointledger.org');
    }
  });
  it('quotes any URL with a query string, so zsh does not read ? as a glob', () => {
    for (const [name, code] of blocks) {
      for (const line of code.split('\n')) {
        const m = line.match(/curl [^#]*?(\$BASE\S*\?\S*)/);
        if (m) expect(line, name).toMatch(/"\$BASE[^"]*\?[^"]*"/);
      }
    }
  });
});

/* ---------- the API half: cf/functions/_middleware.js, _http.js, citation ---------- */
import { onRequest, waitWords, SURVEY_CHANNEL_LIMIT, SURVEY_NETWORK_CEILING } from '../cf/functions/_middleware.js';
import { readJson, peekJson } from '../cf/functions/api/_http.js';
import { onRequestGet as citation } from '../cf/functions/api/citation/[id].js';

function fakeKV() {
  const map = new Map<string, string>();
  return { map, get: async (k: string) => (map.has(k) ? map.get(k)! : null), put: async (k: string, v: string) => { map.set(k, String(v)); } };
}
const HOST = 'https://waypoint-ledger.pages.dev';
const env = () => ({ LEDGER: fakeKV(), REGISTER_PEPPER: 'pepper' });
const req = (path: string, init: { method?: string; headers?: Record<string, string>; body?: string; ip?: string } = {}) =>
  new Request(HOST + path, { method: init.method || 'POST', headers: { 'cf-connecting-ip': init.ip || '203.0.113.7', 'content-type': 'application/json', ...(init.headers || {}) }, body: init.method === 'GET' || init.method === 'OPTIONS' ? undefined : (init.body ?? '{}') });
const okNext = async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
const through = (request: Request, e = env(), next = okNext) => onRequest({ request, env: e, next } as never) as Promise<Response>;

describe('adopter-2: a browser app on another site can read POST /api/price and /api/fhir, and nothing more', () => {
  const foreign = { origin: 'https://agency-app.example' };
  it('sends allow-origin * on the POST answers of /api/price and /api/fhir', async () => {
    for (const p of ['/api/price', '/api/fhir']) {
      const r = await through(req(p, { headers: foreign }));
      expect(r.status, p).toBe(200);
      expect(r.headers.get('access-control-allow-origin'), p).toBe('*');
      expect(r.headers.get('access-control-allow-credentials'), p).toBeNull();
    }
  });
  it('does NOT open /api/map (it spends money on the reader) or any write that counts, reads a cookie or a session', async () => {
    const r = await through(req('/api/map', { headers: foreign }));
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
    for (const p of ['/api/journeys', '/api/survey', '/api/interview', '/api/corrections', '/api/gap', '/api/use',
      '/api/auth/password/login', '/api/me', '/api/admin/stats', '/api/bluebutton/status']) {
      const s = await through(req(p, { headers: { origin: HOST } }));
      expect(s.headers.get('access-control-allow-origin'), p).toBeNull();
    }
  });
  it('still refuses a cross-site write to the counted and cookie-backed routes', async () => {
    for (const p of ['/api/survey', '/api/journeys', '/api/auth/password/login']) {
      expect((await through(req(p, { headers: foreign }))).status, p).toBe(403);
    }
  });
});

describe('adopter-3: the survey never refuses a person (Bo 2026-09-30: "remove this … why limit the survey")', () => {
  const survey = (c: string | null, ip = '198.51.100.4') => req('/api/survey', { ip, headers: { origin: HOST }, body: JSON.stringify(c ? { channel: c } : {}) });
  it('a whole clinic on one Wi-Fi sends 40 answers in an hour, direct and labelled, and none is refused', async () => {
    expect(SURVEY_CHANNEL_LIMIT).toEqual({ hour: 300, day: null });
    expect(SURVEY_NETWORK_CEILING).toEqual({ hour: 300, day: null });
    const e = env();
    const codes: number[] = [];
    for (let i = 0; i < 20; i += 1) codes.push((await through(survey(null), e)).status);
    for (let i = 0; i < 20; i += 1) codes.push((await through(survey('riverside-clinic'), e)).status);
    expect(codes.every((c) => c === 200)).toBe(true);
  });
  it('has no daily cap: the eleventh answer of the day goes through', async () => {
    const e = env();
    for (let i = 0; i < 11; i += 1) expect((await through(survey(null), e)).status).toBe(200);
    expect([...e.LEDGER.map.keys()].some((k) => k.startsWith('rd:') && k.includes(':/api/survey'))).toBe(false);
  });
  it('a script past the room-sized flood guard (300 an hour) is refused, with the wait in words and retry-after', async () => {
    const e = env();
    const k = () => [...e.LEDGER.map.keys()].find((x) => x.startsWith('rl:') && x.endsWith(':/api/survey'))!;
    await through(survey(null), e);
    e.LEDGER.map.set(k(), '300');
    const r = await through(survey(null), e);
    expect(r.status).toBe(429);
    const { error } = await r.json() as { error: string };
    expect(error).toMatch(/Your answers are still on the page: press the button again (in a minute or two|in \d+ minutes|in about an hour)/);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
  });
  it('reads the label without consuming the body the route reads', async () => {
    const q = survey('riverside-clinic');
    let routeSaw: unknown = null;
    const r = await through(q, env(), async () => { routeSaw = (await readJson(q)).body; return okNext(); });
    expect(r.status).toBe(200);
    expect(routeSaw).toEqual({ channel: 'riverside-clinic' });
    expect((await peekJson(survey('x-clinic')))?.channel).toBe('x-clinic');
  });
  it('an unreadable label counts as direct and is not refused', async () => {
    const e = env();
    const codes = [];
    for (let i = 0; i < 6; i += 1) codes.push((await through(survey('NOT A LABEL!'), e)).status);
    expect(codes.at(-1)).toBe(200);
  });
  it('says the wait in plain words', () => {
    expect(waitWords(30)).toBe('in a minute or two');
    expect(waitWords(12 * 60)).toBe('in 12 minutes');
    expect(waitWords(3600)).toBe('in about an hour');
    expect(waitWords(5 * 3600)).toBe('in about 5 hours');
  });
});

describe('adopter-7, 8, 9: errors are sentences, and an unknown value is never ignored', () => {
  const emptyDb = { DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }) } };
  it('refuses ?format=xml on /api/citation instead of ignoring it', async () => {
    const r = await citation({ params: { id: 'cms-99213' }, request: new Request(HOST + '/api/citation/cms-99213?format=xml'), env: emptyDb } as never);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toContain('"xml" is not offered');
    const t = await citation({ params: { id: 'cms-99213' }, request: new Request(HOST + '/api/citation/cms-99213?format=text'), env: emptyDb } as never);
    expect(t.status).toBe(200);
  });
  it('answers an unknown /api/ path with JSON, not the HTML 404 page', async () => {
    const html404 = async () => new Response('<!doctype html><title>That page is not here</title>', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
    const r = await through(req('/api/nope', { method: 'GET' }), env(), html404);
    expect(r.status).toBe(404);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    expect(((await r.json()) as { error: string }).error).toMatch(/^No route GET \/api\/nope\. GET \/api\/openapi\.json lists all \d+\.$/);
    const m = await through(req('/api/price', { method: 'GET' }), env(), html404);
    expect(m.status).toBe(405);
    expect(m.headers.get('allow')).toBe('POST');
  });
  it('leaves a route\'s own JSON 404 alone', async () => {
    const own = async () => new Response('{"ok":false,"error":"No published figure"}', { status: 404, headers: { 'content-type': 'application/json' } });
    const r = await through(req('/api/table/cms-99999', { method: 'GET' }), env(), own);
    expect(((await r.json()) as { error: string }).error).toBe('No published figure');
  });
  it('says what is wrong with a body that is not JSON, and how to fix it', async () => {
    const broken = new Request(HOST + '/api/price', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"story":"saw my doctor\nthree times"}' });
    const e1 = (await readJson(broken)).error!;
    expect(e1).toMatch(/must be JSON/);
    expect(e1).toContain('content-type: application/json');
    expect(e1).toContain('line break');
    const form = new Request(HOST + '/api/price', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'story=saw+my+doctor' });
    expect((await readJson(form)).error).toContain('sent as a form');
  });
});

/* ---------- the pages: the menu, the footer, the kit, the 404, the share cards ---------- */
import { readFileSync, existsSync } from 'node:fs';
const src = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

describe('adopter-4, judge-6, judge-16: the frame', () => {
  const shell = src('components/Shell.tsx');
  it('Escape closes the menu and returns focus to its button; opening moves focus into it', () => {
    expect(shell).toMatch(/e\.key !== 'Escape'/);
    expect(shell).toMatch(/btnRef\.current\?\.focus\(\)/);
    expect(shell).toMatch(/navRef\.current\?\.querySelector<HTMLElement>\('a\[href\]'\)\?\.focus\(\)/);
  });
  it('the footer links /conditions, and says what the open-data links open', () => {
    expect(shell).toMatch(/href: '\/conditions', label: 'Conditions and their codes', footerOnly: true/);
    for (const p of ['/api/corrections', '/api/gap', '/api/survey']) expect(shell).toMatch(new RegExp(`href: '${p}'[^}]*format: 'JSON'`));
  });
});

describe('adopter-11 to 19: the kit, the count page, the embed, the 404, the favicon', () => {
  it('the kit reads ?c= and the count page hands its label over', () => {
    expect(src('components/OrgKit.tsx')).toMatch(/searchParams|URLSearchParams\(window\.location\.search\)\.get\('c'\)/);
    expect(src('components/OrgKitChannel.tsx')).toContain('href={`/adopt/kit?c=${encodeURIComponent(');
  });
  it('the flyer tells a waiting room to scan, prints the code at 3.8 in, and says answers, never people', () => {
    const kit = src('components/OrgKit.tsx');
    expect(kit).toContain('Point your phone&rsquo;s camera here.');
    expect(kit).not.toMatch(/people have answered/);
    const css = src('app/adopt/kit/kit.module.css');
    expect(css).toMatch(/grid-template-columns: 3\.8in 1fr/);
    expect(css).toMatch(/@page \{ size: letter; margin: 0\.6in; \}/);
  });
  it('the embed shows the line before its Copy button', () => {
    const a = src('components/OrgKitAgency.tsx');
    expect(a.indexOf('<EmbedSnippet />')).toBeLessThan(a.indexOf('<EmbedCopy'));
  });
  it('the copy button says Copied in a status, not only in its label', () => {
    expect(src('components/trust/CopyButton.tsx')).toMatch(/role="status"[^>]*>\{done \? 'Copied\.' : ''\}/);
  });
  it('the 404 points at the live register and at the API', () => {
    const nf = src('app/not-found.tsx');
    /* VISUAL tech (2026-09-30 night): the register is now one of three cards built from a list,
       so the pin reads the list entry; the meaning (the 404 points at /register/live) is unchanged. */
    expect(nf).toMatch(/href: '\/register\/live', name: 'The public register'/);
    expect(nf).toContain("href: '/developers'");
  });
  it('serves a real /favicon.ico', () => {
    expect(existsSync(new URL('../public/favicon.ico', import.meta.url))).toBe(true);
    const b = readFileSync(new URL('../public/favicon.ico', import.meta.url));
    expect([...b.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
  });
});

describe('adopter-10: a shared link gets its own card', () => {
  it('the layout no longer claims og:url = home for every route', () => {
    expect(src('app/layout.tsx')).not.toMatch(/url: '\/',/);
  });
  it('the developer, adopt, kit and live-register pages carry their own title, url and image', async () => {
    const { shareCard } = await import('../lib/og');
    const c = shareCard('T', 'D', '/adopt/kit');
    expect(c.openGraph).toMatchObject({ title: 'T', url: '/adopt/kit' });
    expect(JSON.stringify(c.openGraph)).toContain('/og/adopt-kit.png'); // VISUAL-4b: the kit now shares its own card
    for (const [p, path] of [['app/developers/page.tsx', '/developers'], ['app/adopt/page.tsx', '/adopt'], ['app/adopt/kit/page.tsx', '/adopt/kit'], ['app/register/live/page.tsx', '/register/live']]) {
      expect(src(p), p).toContain('...shareCard(');
      expect(src(p), p).toContain(`'${path}')`);
    }
  });
});

/* ==========================================================================
   USE, COUNTED WITHOUT KNOWING WHO (cf/functions/api/_use.js).

   What these hold:
     - one number per day per action, in `events`, under a name from a fixed
       list, and nothing else is written;
     - our own gates (x-waypoint-synthetic) and known bots are filed apart and
       never reach the public number; a program is shown on its own;
     - only a 2xx counts, and ?dry=1 never does;
     - the browser's own reports carry one word and no body;
     - the readout says when counting began and fills the empty weeks with 0;
     - the four gates actually send the header, and /privacy says what is kept.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { onRequest } from '../cf/functions/_middleware.js';
import { onRequestGet as getUse, onRequestPost as postUse } from '../cf/functions/api/use.js';
import {
  USE_ACTIONS, USE_IDS, BEACON_IDS, SYNTHETIC_HEADER, sourceOf, useName, parseUseName,
  serverActionOf, recordUse, summarizeUse, weekOf,
} from '../cf/functions/api/_use.js';
import { downloadAction, pageOf } from '../components/UseBeacon';
import { sizeLine, programLine, type UsePayload } from '../components/UsePanel';
import { OPENAPI } from '../lib/openapi';

const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const HEADLESS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36';
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** A D1 holding only `events`, answering the two statements _use.js sends. */
function fakeDB() {
  const rows = new Map<string, number>();
  const DB = {
    rows,
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind: (...a: unknown[]) => { bound = a; return stmt; },
        run: async () => {
          if (!sql.startsWith('INSERT INTO events')) throw new Error('unexpected ' + sql);
          const k = `${bound[0]}|${bound[1]}`;
          rows.set(k, (rows.get(k) || 0) + 1);
          return { meta: { changes: 1 } };
        },
        all: async () => {
          if (!sql.startsWith('SELECT day, name, count FROM events')) throw new Error('unexpected ' + sql);
          const out = [...rows].map(([k, count]) => { const [day, name] = k.split('|'); return { day, name, count }; })
            .filter((r) => /^use:|:use:/.test(r.name)).sort((a, b) => a.day.localeCompare(b.day));
          return { results: out };
        },
      };
      return stmt;
    },
  };
  return DB;
}
function fakeKV() {
  const map = new Map<string, string>();
  return { get: async (k: string) => (map.has(k) ? map.get(k)! : null), put: async (k: string, v: string) => { map.set(k, String(v)); } };
}
const names = (db: ReturnType<typeof fakeDB>) => [...db.rows.keys()].map((k) => k.split('|')[1]).sort();
const req = (path: string, init: RequestInit & { ua?: string } = {}) => {
  const headers = new Headers(init.headers || {});
  headers.set('cf-connecting-ip', '203.0.113.9');
  if (init.ua !== undefined) headers.set('user-agent', init.ua);
  return new Request('https://waypoint-ledger.pages.dev' + path, { method: init.method, headers, body: init.body });
};

describe('where a request came from', () => {
  it('reads our own gates off the header, before anything else', () => {
    expect(sourceOf(req('/api/price', { ua: CHROME, headers: { [SYNTHETIC_HEADER]: 'e2e' } }))).toBe('synthetic');
    expect(sourceOf(req('/api/price', { ua: 'curl/8.7.1', headers: { [SYNTHETIC_HEADER]: 'verify-live' } }))).toBe('synthetic');
  });
  it('files a headless browser and a crawler as bots, a script as a program, and a browser as a browser', () => {
    expect(sourceOf(req('/', { ua: HEADLESS }))).toBe('bot');
    expect(sourceOf(req('/', { ua: GOOGLEBOT }))).toBe('bot');
    expect(sourceOf(req('/', { ua: 'curl/8.7.1' }))).toBe('program');
    expect(sourceOf(req('/', { ua: '' }))).toBe('program');
    expect(sourceOf(req('/', { ua: CHROME }))).toBe('browser');
  });
  it('stores only a source word and an action word, and reads it back', () => {
    expect(useName('ledger', 'browser')).toBe('use:ledger');
    expect(useName('read', 'synthetic')).toBe('synthetic:use:read');
    expect(parseUseName('bot:use:fhir')).toEqual({ source: 'bot', action: 'fhir' });
    expect(parseUseName('use:nonsense')).toBeNull();
    expect(parseUseName('map')).toBeNull();   // the old endpoint counters are not use counts
  });
});

describe('which requests count', () => {
  it('counts a 2xx product action and nothing else', () => {
    expect(serverActionOf('POST', '/api/map', 200, 'https://x/api/map')).toBe('read');
    expect(serverActionOf('POST', '/api/journeys', 200, 'https://x/api/journeys')).toBe('save');
    expect(serverActionOf('POST', '/api/corrections', 409, 'https://x/api/corrections')).toBeNull();
    expect(serverActionOf('POST', '/api/survey', 429, 'https://x/api/survey')).toBeNull();
    expect(serverActionOf('GET', '/api/survey', 200, 'https://x/api/survey')).toBeNull();
    expect(serverActionOf('POST', '/api/health', 200, 'https://x/api/health')).toBeNull();
  });
  it('never counts a ?dry=1 request: it wrote nothing', () => {
    expect(serverActionOf('POST', '/api/survey', 200, 'https://x/api/survey?dry=1')).toBeNull();
  });
  it('writes nothing for a name off the list', async () => {
    const DB = fakeDB();
    expect(await recordUse({ DB }, 'keystrokes', 'browser')).toBe(false);
    expect(DB.rows.size).toBe(0);
  });
  it('never throws when the database is missing', async () => {
    expect(await recordUse({}, 'read', 'browser')).toBe(false);
  });
});

describe('the middleware files each count by its source', () => {
  const run = (env: object, request: Request, status = 200) =>
    onRequest({ request, env, next: async () => new Response('{"ok":true}', { status, headers: { 'content-type': 'application/json' } }) });

  it('a browser pricing a ledger is public; the same call from a gate is synthetic', async () => {
    const DB = fakeDB();
    const env = { DB, LEDGER: fakeKV(), REGISTER_PEPPER: 'p' };
    await run(env, req('/api/price', { method: 'POST', ua: CHROME, body: '{}' }));
    await run(env, req('/api/price', { method: 'POST', ua: CHROME, body: '{}', headers: { [SYNTHETIC_HEADER]: 'demo-smoke' } }));
    await run(env, req('/api/map', { method: 'POST', ua: HEADLESS, body: '{}' }));
    await run(env, req('/api/price', { method: 'POST', ua: 'curl/8.7.1', body: '{}' }));
    expect(names(DB)).toEqual(['bot:use:read', 'program:use:price', 'synthetic:use:price', 'use:price']);
  });
  it('a refused or dry request moves nothing', async () => {
    const DB = fakeDB();
    const env = { DB, LEDGER: fakeKV(), REGISTER_PEPPER: 'p' };
    await run(env, req('/api/price', { method: 'POST', ua: CHROME, body: '{}' }), 400);
    await run(env, req('/api/survey?dry=1', { method: 'POST', ua: CHROME, body: '{}' }));
    expect(DB.rows.size).toBe(0);
  });
  it('hands the write to waitUntil when the runtime offers it, so the answer never waits on a count', async () => {
    const DB = fakeDB();
    const pending: Promise<unknown>[] = [];
    await onRequest({
      request: req('/api/journeys', { method: 'POST', ua: CHROME, body: '{}' }),
      env: { DB, LEDGER: fakeKV(), REGISTER_PEPPER: 'p' },
      next: async () => new Response('{}', { status: 200 }),
      waitUntil: ((p: Promise<unknown>) => { pending.push(p); }) as never,
    });
    expect(pending.length).toBe(1);
    await Promise.all(pending);
    expect(names(DB)).toEqual(['use:save']);
  });
  it('refuses a count posted from another website', async () => {
    const DB = fakeDB();
    const res = await onRequest({
      request: req('/api/use?a=ledger', { method: 'POST', ua: CHROME, headers: { origin: 'https://elsewhere.example' } }),
      env: { DB, LEDGER: fakeKV(), REGISTER_PEPPER: 'p' },
      next: async () => new Response('{}', { status: 200 }),
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/use: one word, no body', () => {
  it('counts a listed browser action and answers with the one word back', async () => {
    const DB = fakeDB();
    const res = await postUse({ request: req('/api/use?a=fhir', { method: 'POST', ua: CHROME }), env: { DB } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, counted: 'fhir' });
    expect(names(DB)).toEqual(['use:fhir']);
  });
  it('refuses a server action and anything off the list, so it cannot stand in for a survey answer', async () => {
    const DB = fakeDB();
    for (const a of ['survey', 'interview', 'read', 'price', 'x', '']) {
      const res = await postUse({ request: req(`/api/use?a=${a}`, { method: 'POST', ua: CHROME }), env: { DB } });
      expect(res.status, a).toBe(400);
    }
    expect(DB.rows.size).toBe(0);
  });
  it('?dry=1 validates and counts nothing', async () => {
    const DB = fakeDB();
    const res = await postUse({ request: req('/api/use?a=ledger&dry=1', { method: 'POST', ua: CHROME }), env: { DB } });
    expect(res.status).toBe(200);
    expect(DB.rows.size).toBe(0);
  });
  it('lists exactly the four actions the browser does on its own', () => {
    expect(BEACON_IDS).toEqual(['ledger', 'sheet', 'fhir', 'export']);
    expect(new Set(USE_IDS).size).toBe(USE_ACTIONS.length);
  });
});

describe('the readout', () => {
  it('weeks start on Monday, UTC', () => {
    expect(weekOf('2026-10-05')).toBe('2026-10-05');   // a Monday
    expect(weekOf('2026-10-11')).toBe('2026-10-05');   // the Sunday after
    expect(weekOf('2026-10-12')).toBe('2026-10-12');
  });
  it('says when counting began, fills empty weeks with 0, and leaves our tests and bots out', () => {
    const s = summarizeUse([
      { day: '2026-10-05', name: 'synthetic:use:read', count: 30 },
      { day: '2026-10-06', name: 'use:read', count: 3 },
      { day: '2026-10-06', name: 'use:ledger', count: 2 },
      { day: '2026-10-20', name: 'use:ledger', count: 1 },
      { day: '2026-10-20', name: 'bot:use:ledger', count: 4 },
      { day: '2026-10-21', name: 'program:use:price', count: 5 },
    ], '2026-10-21');
    expect(s.since).toBe('2026-10-05');
    expect(s.weeks.map((w) => w.weekStart)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
    expect(s.weeks[1].counts.ledger).toBe(0);
    expect(s.totals.read).toBe(3);
    expect(s.totals.ledger).toBe(3);
    expect(s.total).toBe(6);
    expect(s.programs.price).toBe(5);
    expect(s.leftOut).toEqual({ synthetic: 30, bot: 4 });
    expect(s.unit).toBe('counts of actions, never of who took them');
  });
  it('before anything is counted there is no start date, and no invented one', () => {
    const s = summarizeUse([], '2026-10-05');
    expect(s.since).toBeNull();
    expect(s.weeks).toEqual([]);
    expect(s.total).toBe(0);
  });
  it('GET /api/use serves it, and says unread rather than zero when the database fails', async () => {
    const DB = fakeDB();
    await recordUse({ DB }, 'ledger', 'browser');
    const ok = await (await getUse({ env: { DB } })).json();
    expect(ok.ok).toBe(true);
    expect(ok.totals.ledger).toBe(1);
    const down = await getUse({ env: {} });
    expect(down.status).toBe(503);
    expect((await down.json()).error).toMatch(/unread, not zero/);
  });
  it('the panel says a small number at its size, and zero as zero', () => {
    const base = summarizeUse([{ day: '2026-10-06', name: 'use:ledger', count: 2 }, { day: '2026-10-06', name: 'program:use:price', count: 3 }], '2026-10-06') as unknown as UsePayload;
    expect(sizeLine(base)).toBe('2 actions from a browser since Oct 6, 2026. These are small numbers, shown at their size.');
    expect(programLine(base)).toBe('ledgers priced through the open API: 3');
    const zero = summarizeUse([{ day: '2026-10-06', name: 'synthetic:use:read', count: 9 }], '2026-10-06') as unknown as UsePayload;
    expect(sizeLine(zero)).toMatch(/^Nothing has been counted from a browser yet/);
  });
  it('names the period by the day counting began, never "in 1 week" on its first day', () => {
    const first = summarizeUse([{ day: '2026-09-30', name: 'use:ledger', count: 3 }], '2026-09-30') as unknown as UsePayload;
    expect(first.weeksTotal).toBe(1);
    expect(sizeLine(first)).toBe('3 actions from a browser since Sep 30, 2026. These are small numbers, shown at their size.');
    expect(sizeLine(first)).not.toMatch(/in \d+ weeks?/);
    const none = summarizeUse([{ day: '2026-09-30', name: 'bot:use:read', count: 4 }], '2026-09-30') as unknown as UsePayload;
    expect(sizeLine(none)).toBe('Nothing has been counted from a browser yet, since counting began on Sep 30, 2026. That is a count of zero, not a hidden number.');
  });
});

describe('the browser side', () => {
  it('knows the ledger exports by their file names and ignores every other download', () => {
    expect(downloadAction('waypoint-ledger-fhir.json')).toBe('fhir');
    expect(downloadAction('waypoint-ledger.csv')).toBe('export');
    expect(downloadAction('waypoint-ledger.json')).toBe('export');
    expect(downloadAction('waypoint-brief.txt')).toBe('export');
    expect(downloadAction('waypoint-ledger.png')).toBeNull();
    expect(downloadAction('waypoint-corrections-2026-10-05.csv')).toBeNull();
  });
  it('reads a page with or without its trailing slash', () => {
    expect(pageOf('/ledger/')).toBe('/ledger');
    expect(pageOf('/')).toBe('/');
  });
  it('sends no body and no cookie', () => {
    const src = read('components/UseBeacon.tsx');
    expect(src).toContain("credentials: 'omit'");
    expect(src).not.toMatch(/body\s*:/);
  });
  it('is mounted once, in the root layout', () => {
    expect(read('app/layout.tsx')).toContain('<UseBeacon />');
  });
});

describe('the promises around it', () => {
  it('/privacy says what is counted and what is not', () => {
    const p = read('app/privacy/page.tsx');
    expect(p).toContain('one number per day for each of a few actions');
    expect(p).toContain('no cookie, no address, no identifier and nothing you typed');
  });
  it('the live register mounts the panel, and the illustrative one does not', () => {
    expect(read('components/Register.tsx')).toContain('{!sample && <UsePanel />}');
  });
  it('every gate identifies itself', () => {
    /* FLOW4 flow4-5: shots2/ (the browser gates) is left out of the public
       download, so in that copy this checks the two gates it ships. Wherever
       shots2/ exists, both of its gates are still read and must identify. */
    const shots2 = existsSync(new URL('../shots2', import.meta.url));
    for (const [f, name] of [['cf/verify-live.sh', 'verify-live'], ['scripts/uptime-check.sh', 'uptime-check'], ['shots2/demo-smoke.mjs', 'demo-smoke'], ['shots2/e2e.mjs', 'e2e']]) {
      if (f.startsWith('shots2/') && !shots2) continue;
      expect(read(f), f).toContain(name === 'verify-live' || name === 'uptime-check' ? `x-waypoint-synthetic: ${name}` : `'x-waypoint-synthetic': '${name}'`);
    }
  });
  it('the OpenAPI document publishes both halves of /api/use', () => {
    const p = (OPENAPI.paths as Record<string, Record<string, unknown>>)['/api/use'];
    expect(Object.keys(p).sort()).toEqual(['get', 'post']);
  });
});

/* ==========================================================================
   BETA NIGHT ROUND 2, THE SERVER HALF (2026-09-30).

   R1-auth F1   login CSRF: a cross-site form signed the victim in to the
                attacker's account. Cross-site writes to cookie-backed routes
                and counted writes are refused; the public reuse routes stay open.
   R1-security S-04  one network could inflate the survey and interview counts.
   R1-security S-03  the register block carries the same sender count the
                open data publishes, beside its answers.
   R1-security S-14  surveyVersion is no longer free text.
   R1-security S-15  bidirectional overrides are removed from what people typed.
   R1-auth I1   a journey is read by its share slug; the id only for its owner.
   R1-auth I6   the passkey doors have limits of their own.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { onRequest, crossSite } from '../cf/functions/_middleware.js';
import { validateInterview, tooShort, isSubstantive, TOO_SHORT } from '../cf/functions/api/interview.js';
import { validateSurvey } from '../cf/functions/api/survey.js';
import { onRequestGet as getJourney } from '../cf/functions/api/journeys/[id].js';
import { stripBidi, validateJourney, priceRequest } from '../lib/price-api';
import { SELECTABLE, TABLE } from '../lib/table';
import { SURVEY_VERSION, BURDEN_IDS, DECIDER_IDS } from '../lib/survey-def.js';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

function fakeKV() {
  const map = new Map<string, string>();
  return { map, get: async (k: string) => (map.has(k) ? map.get(k)! : null), put: async (k: string, v: string) => { map.set(k, String(v)); } };
}
const HOST = 'https://waypoint-ledger.pages.dev';
const env = () => ({ LEDGER: fakeKV(), REGISTER_PEPPER: 'pepper' });
const post = (path: string, headers: Record<string, string> = {}) =>
  new Request(HOST + path, { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.9', 'content-type': 'text/plain', ...headers }, body: '{}' });
const through = async (request: Request, e = env()) =>
  (await onRequest({ request, env: e, next: async () => new Response('{"ok":true}', { status: 200 }) })).status;

describe('F1: a write to a cookie-backed route or a counted write is refused when another site sent it', () => {
  const guarded = ['/api/auth/password/login', '/api/auth/password/signup', '/api/auth/login/verify', '/api/auth/logout',
    '/api/me', '/api/journeys', '/api/journeys/abc', '/api/corrections', '/api/survey', '/api/interview', '/api/gap'];
  it('refuses a foreign Origin with 403 before the route runs', async () => {
    for (const p of guarded) expect(await through(post(p, { origin: 'https://evil.example' })), p).toBe(403);
  });
  it('reads Referer when Origin is missing, and treats Origin "null" as foreign', async () => {
    expect(await through(post('/api/auth/password/login', { referer: 'https://evil.example/page' }))).toBe(403);
    expect(await through(post('/api/auth/password/login', { origin: 'null' }))).toBe(403);
  });
  it('lets this site through, and lets a request with neither header through (curl, a server)', async () => {
    expect(await through(post('/api/auth/password/login', { origin: HOST }))).toBe(200);
    expect(await through(post('/api/journeys', { referer: HOST + '/ledger' }))).toBe(200);
    expect(await through(post('/api/journeys'))).toBe(200);
  });
  it('keeps the public reuse routes open to every origin, as /developers promises', async () => {
    for (const p of ['/api/price', '/api/map', '/api/fhir']) expect(await through(post(p, { origin: 'https://someone-elses-app.example' })), p).toBe(200);
  });
  it('compares the host, port included', () => {
    const url = new URL('http://localhost:8855/api/me');
    expect(crossSite(new Request(url, { headers: { origin: 'http://localhost:8855' } }), url)).toBe(false);
    expect(crossSite(new Request(url, { headers: { origin: 'http://localhost:8856' } }), url)).toBe(true);
  });
});

describe('S-04: the survey and interview counts take a human rate', () => {
  it('lets a whole room answer the survey (Bo 2026-09-30: no human limit), and dry runs still pass', async () => {
    const e = env();
    const codes = [];
    for (let i = 0; i < 12; i += 1) codes.push(await through(post('/api/survey', { origin: HOST }), e));
    expect(codes.every((c) => c === 200)).toBe(true);
    expect(await through(post('/api/survey?dry=1', { origin: HOST }), e)).toBe(200);
  });
  it('caps a day at ten even when the hour turns', async () => {
    const e = env();
    const day = new Date().toISOString().slice(0, 10);
    // seed the day bucket as if ten had already been sent in earlier hours
    await onRequest({ request: post('/api/interview', { origin: HOST }), env: e, next: async () => new Response('{}') });
    const dayKey = [...e.LEDGER.map.keys()].find((k) => k.startsWith(`rd:${day}:`))!;
    expect(dayKey).toBeTruthy();
    e.LEDGER.map.set(dayKey, '10');
    for (const k of [...e.LEDGER.map.keys()]) if (k.startsWith('rl:')) e.LEDGER.map.delete(k);
    expect(await through(post('/api/interview', { origin: HOST }), e)).toBe(429);
  });
  it('gives the passkey doors limits of their own (I6)', () => {
    const mw = read('cf/functions/_middleware.js');
    for (const p of ['login/options', 'login/verify', 'register/options', 'register/verify']) expect(mw).toMatch(new RegExp(`'POST /api/auth/${p}':\\s*\\d+`));
  });
  it('records an interview only when three answers say something', () => {
    const ok = { q1: 'It started in the spring, nineteen months before a name.', q2: 'Four thousand dollars and a job.', q3: 'The echo was nine hundred; I paid 211.' };
    const good = validateInterview({ consent: 'notes', answers: ok }) as unknown as { record: { answers: Record<string, string> } };
    expect(tooShort(good.record)).toBeNull();
    const one = validateInterview({ consent: 'notes', answers: { q1: 'a', q2: 'b', q3: 'c' } }) as unknown as { record: { answers: Record<string, string> } };
    expect(one.record).toBeTruthy();             // the privacy generator's view of the fields is unchanged
    expect(tooShort(one.record)).toBe(TOO_SHORT);
    expect(isSubstantive('aaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);   // one long word is not a sentence
    expect(isSubstantive('I paid $211 for the echo.')).toBe(true);
  });
  it('calls markSender for the interview after the row is written, like the survey', () => {
    const src = read('cf/functions/api/interview.js');
    expect(src.indexOf("await markSender(request, env, 'interview')")).toBeGreaterThan(src.indexOf("await count(env, 'interview')"));
    expect(src.indexOf('const short = tooShort(r)')).toBeLessThan(src.indexOf('isDryRun(request)'));
  });
});

describe('S-03: the register carries senders beside answers', () => {
  it('wraps survey, gap and interviews without renaming n', () => {
    const src = read('cf/functions/api/register.js');
    /* JUDGE-4 #6: n and respondents keep their values; answers and reports are added beside them */
    expect(src).toContain("survey: await senders(survey, 'survey', 'n', 'answers', ALIASES.survey)");
    expect(src).toContain("gap: await senders(gap, 'gap', 'respondents', 'reports', ALIASES.gap)");
    expect(src).toContain('interviews: await interviewsWithSenders(env, interviews)');
    /* FINAL-1011 honest: through withSendersCounted, which is withSenders unless rows are marked as our own tests */
    expect(src).toContain("withSendersCounted(agg, { key: 'senders'");
  });
});

describe('S-14: surveyVersion is the instrument shape, never newer than the instrument', () => {
  const base = { ranking: [...BURDEN_IDS], unasked: BURDEN_IDS[0], lead: BURDEN_IDS[0], decide: DECIDER_IDS[0] };
  const v = (surveyVersion: unknown) => (validateSurvey({ ...base, surveyVersion }) as { record: { surveyVersion: string } }).record.surveyVersion;
  it('keeps a real earlier version and the current one', () => {
    expect(v('2026-09-09.1')).toBe('2026-09-09.1');
    expect(v(SURVEY_VERSION)).toBe(SURVEY_VERSION);
  });
  it('records the running version for free text, a formula, or a version from the future', () => {
    for (const bad of ['=HYPERLINK("x")', 'v', '2099-01-01.1', '', 42, null]) expect(v(bad), String(bad)).toBe(SURVEY_VERSION);
  });
});

describe('S-15: directional overrides are removed from what people typed', () => {
  it('strips them from a story, a saved line and a title, and leaves every script alone', () => {
    expect(stripBidi('\u202EEKAF saw my doctor')).toBe('EKAF saw my doctor');
    expect(stripBidi('רופא طبيب doctor')).toBe('רופא طبيب doctor');
    const out = priceRequest({ story: '\u202Esaw my regular doctor three times' }, SELECTABLE) as { result: { segments: { raw: string }[] } };
    expect(JSON.stringify(out.result)).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/);
    const j = validateJourney({ title: '\u2066title\u2069', entries: [{ raw: '\u202Eline', itemId: null, times: 1 }] }, TABLE) as { title: string; entries: { raw: string }[] };
    expect(j.title).toBe('title');
    expect(j.entries[0].raw).toBe('line');
  });
});

describe('I1: a journey is read by its share slug; the row id opens it only for its owner', () => {
  const row = { id: 'uuid-1', user_id: 'user-a', share_slug: 'slug1', title: 't', entries_json: '[]', table_version: 'v', created_at: 'x', updated_at: 'x', expires_at: null };
  const db = (sessionUser: string | null) => ({
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('FROM sessions')) return sessionUser ? { user_id: sessionUser, expires_at: '9999', display_name: null } : null;
          if (sql.includes('share_slug=?1 OR id=?1')) return args[0] === row.share_slug || args[0] === row.id ? row : null;
          if (sql.includes('share_slug=?1')) return args[0] === row.share_slug ? row : null;
          return null;
        },
        run: async () => ({}),
      }),
    }),
  });
  const get = (key: string, cookie?: string, user: string | null = null) =>
    getJourney({ params: { id: key }, request: new Request(`${HOST}/api/journeys/${key}`, { headers: cookie ? { cookie } : {} }), env: { DB: db(user) } } as never);
  it('opens by slug for anyone', async () => { expect((await get('slug1')).status).toBe(200); });
  it('refuses the id to a stranger and to another account', async () => {
    expect((await get('uuid-1')).status).toBe(404);
    expect((await get('uuid-1', 'wl_session=s2', 'user-b')).status).toBe(404);
  });
  it('opens the id for the account that owns it', async () => {
    expect((await get('uuid-1', 'wl_session=s1', 'user-a')).status).toBe(200);
  });
});

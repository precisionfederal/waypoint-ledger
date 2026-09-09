/* ==========================================================================
   A DEPLOY THAT CANNOT LIE, AND AN ADMIN DOOR THAT COSTS SOMETHING.

   Two Round 3 findings, held here so they cannot come back:

   1. The gate ran AFTER the upload. `pages deploy && sleep 20 && verify-live.sh`
      can only describe a site the public is already reading, and
      `--commit-dirty=true` meant the artifact matched no commit at all: live
      /build.json said `a982b3bc4 dirty:true` while the round's work was
      somewhere else entirely.

   2. Sixteen wrong bearer tokens at two admin routes returned sixteen 401s and
      never a 429, because /api/admin/ was excluded from BOTH the rate limiter
      and the 16 KB body cap — the one door with no public purpose was the least
      defended thing on the origin.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { onRequest } from '../cf/functions/_middleware.js';

const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

function fakeKV() {
  const map = new Map<string, string>();
  return { map, get: async (k: string) => (map.has(k) ? map.get(k)! : null), put: async (k: string, v: string) => { map.set(k, String(v)); } };
}
const envWith = (kv = fakeKV()) => ({ LEDGER: kv, ADMIN_TOKEN: 'the-real-token', REGISTER_PEPPER: 'pepper' });
const req = (path: string, init: RequestInit = {}) =>
  new Request('https://waypoint-ledger.pages.dev' + path, { headers: { 'cf-connecting-ip': '203.0.113.7', ...(init.headers || {}) }, ...init });

describe('the admin door', () => {
  it('is inside the body cap: a 20 KB admin write is refused before the route sees it', async () => {
    const res = await onRequest({
      request: req('/api/admin/changes', { method: 'POST', headers: { 'content-length': String(20 * 1024) } }),
      env: envWith(),
      next: async () => new Response('should never run', { status: 200 }),
    });
    expect(res.status).toBe(413);
  });

  it('locks a network out after five wrong tokens in an hour', async () => {
    const env = envWith();
    const wrong = () => onRequest({
      request: req('/api/admin/interviews'),
      env,
      next: async () => new Response(JSON.stringify({ ok: false }), { status: 401 }),
    });
    for (let i = 0; i < 5; i++) expect((await wrong()).status).toBe(401);

    let routeRan = false;
    const sixth = await onRequest({
      request: req('/api/admin/interviews'),
      env,
      next: async () => { routeRan = true; return new Response('{}', { status: 200 }); },
    });
    expect(sixth.status).toBe(429);
    /* The point of a lockout: the route is never reached, so a correct token
       guessed on the sixth try is not tested either. */
    expect(routeRan).toBe(false);
  });

  it('locks the guesser out, never the admin on another network', async () => {
    const env = envWith();
    for (let i = 0; i < 6; i++) {
      await onRequest({ request: req('/api/admin/interviews'), env, next: async () => new Response('{}', { status: 401 }) });
    }
    const elsewhere = await onRequest({
      request: new Request('https://waypoint-ledger.pages.dev/api/admin/interviews', { headers: { 'cf-connecting-ip': '198.51.100.9' } }),
      env,
      next: async () => new Response('{"ok":true}', { status: 200 }),
    });
    expect(elsewhere.status).toBe(200);
  });

  it('does not count a request the route authorised', async () => {
    const env = envWith();
    for (let i = 0; i < 10; i++) {
      const r = await onRequest({ request: req('/api/admin/stats'), env, next: async () => new Response('{"ok":true}', { status: 200 }) });
      expect(r.status).toBe(200);
    }
  });

  it('gives admin a wider write limit than the public 20/hour, so a real session is not throttled', async () => {
    const env = envWith();
    for (let i = 0; i < 25; i++) {
      const r = await onRequest({
        request: req('/api/admin/changes', { method: 'POST', headers: { 'content-length': '120' } }),
        env,
        next: async () => new Response('{"ok":true}', { status: 200 }),
      });
      expect(r.status).toBe(200);
    }
  });

  it('still throttles a public write at its own limit', async () => {
    const env = envWith();
    let last = 200;
    for (let i = 0; i < 25; i++) {
      const r = await onRequest({
        request: req('/api/corrections', { method: 'POST', headers: { 'content-length': '120' } }),
        env,
        next: async () => new Response('{"ok":true}', { status: 200 }),
      });
      last = r.status;
    }
    expect(last).toBe(429);
  });

  it('never puts an address in the bucket key', async () => {
    const kv = fakeKV();
    await onRequest({
      request: req('/api/corrections', { method: 'POST', headers: { 'content-length': '120' } }),
      env: envWith(kv),
      next: async () => new Response('{"ok":true}', { status: 200 }),
    });
    expect([...kv.map.keys()].join(' ')).not.toContain('203.0.113.7');
  });
});

describe('npm run deploy is the only deploy path', () => {
  const pkg = JSON.parse(read('package.json'));
  /* The commands only. The file's header comment quotes the OLD deploy line
     verbatim so the next reader knows what was wrong with it, and a check that
     could not tell a comment from a command would fail on the explanation. */
  const sh = read('scripts/deploy.sh').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

  it('package.json points at the script and nowhere else', () => {
    expect(pkg.scripts.deploy).toBe('bash scripts/deploy.sh');
    expect(pkg.scripts['deploy:dry']).toContain('PF_DEPLOY_DRY=1');
    /* No other script may publish. */
    for (const [name, cmd] of Object.entries(pkg.scripts as Record<string, string>)) {
      if (name === 'deploy' || name === 'deploy:dry') continue;
      expect(cmd).not.toContain('pages deploy');
    }
  });

  it('refuses a dirty tree before anything is published', () => {
    expect(sh).toContain('status --porcelain');
    expect(sh.indexOf('status --porcelain')).toBeLessThan(sh.indexOf('pages deploy'));
  });

  it('never passes --commit-dirty', () => {
    expect(sh).not.toContain('--commit-dirty');
    expect(JSON.stringify(pkg.scripts)).not.toContain('--commit-dirty');
  });

  it('runs types, tests, the build and the local stack before the upload', () => {
    const upload = sh.indexOf('pages deploy');
    for (const gate of ['tsc --noEmit', 'npm test', 'build:static', 'verify-live.sh', 'shots2/e2e.mjs']) {
      expect(sh.indexOf(gate)).toBeGreaterThan(-1);
      expect(sh.indexOf(gate)).toBeLessThan(upload);
    }
  });

  it('stops on any red: every gate ends in a die() that exits non-zero', () => {
    expect(sh).toMatch(/die\(\)\s*\{[^}]*exit 1/s);
    expect(sh).toContain('|| die');
  });

  it('checks the artifact names the commit it was built from', () => {
    expect(sh).toContain('STAMP_SHA');
    expect(sh).toContain('HEAD_SHA');
  });
});

describe('the live gate', () => {
  const vl = read('cf/verify-live.sh');
  const vw = read('cf/verify-write.sh');

  it('reads a big published file by its first bytes instead of slurping it', () => {
    expect(vl).toContain('check_head');
    expect(vl).toContain('-r 0-4095');
    expect(vl).not.toContain('check_json "/data/locality-prices.csv"');
  });

  it('checks the build stamp is a real, clean commit', () => {
    expect(vl).toContain('/build.json');
    expect(vl).toContain('merge-base --is-ancestor');
  });

  it('never prints ok for a check that did not run', () => {
    expect(vw).not.toContain('ok "write canary skipped');
    expect(vw).toContain('VERIFY_NO_WRITE');
  });
});

describe('CI, for the day the repository is public', () => {
  const ci = read('.github/workflows/ci.yml');
  it('runs the three gates a stranger can watch', () => {
    expect(ci).toContain('tsc --noEmit');
    expect(ci).toContain('npm test');
    expect(ci).toContain('npm run build:static');
    expect(ci).toContain('npm ci');
  });
});

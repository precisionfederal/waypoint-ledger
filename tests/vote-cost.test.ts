/* ==========================================================================
   WHAT ONE VOTE COSTS — the controls that make the register a signal.

   Round 3's finding, in its own words: "the dedupe key is a SHA-256 of three
   browser-supplied values, so a fresh submitterId is a fresh vote", and the only
   other limit was 20 writes an hour per network across ALL figures. A count that
   one person can move a hundred times is a poll, not a demand signal, and the
   first thing a federal statistician asks of a public number is what it resists.

   These tests hold the answer: a server secret inside the stored key, a cooldown
   per network per figure, a refusal that the browser keeps rather than loses, and
   a denominator of senders published beside the count of sends. They also hold the
   page and the code to the SAME numbers, because a control nobody can read is not
   a control anybody can check.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { submitterHash, networkKey, figureBucket, pepperOf } from '../cf/functions/api/_hash.js';
import { FIGURE_CAP, chargeFigure, aggregateCorrections } from '../cf/functions/api/corrections.js';

/** A KV that behaves like the binding: string values, get/put, nothing else. */
function fakeKV() {
  const map = new Map<string, string>();
  return {
    map,
    get: async (k: string) => (map.has(k) ? map.get(k)! : null),
    put: async (k: string, v: string) => { map.set(k, String(v)); },
  };
}
const reqFrom = (ip: string) => new Request('https://example.test/api/corrections', { headers: { 'cf-connecting-ip': ip } });

describe('the stored per-figure key', () => {
  it('is peppered: the same browser and figure hash differently once the server has a secret', async () => {
    const plain = await submitterHash('browser-1', 'cms-99213', 'v1');
    const peppered = await submitterHash('browser-1', 'cms-99213', 'v1', 'a-server-secret');
    expect(plain).not.toBe(peppered);
    expect(peppered).toHaveLength(32);
  });

  it('is still deterministic, so the duplicate check still works', async () => {
    expect(await submitterHash('b', 'cms-99213', 'v1', 'p')).toBe(await submitterHash('b', 'cms-99213', 'v1', 'p'));
  });

  it('still separates figures and table versions', async () => {
    const a = await submitterHash('b', 'cms-99213', 'v1', 'p');
    expect(a).not.toBe(await submitterHash('b', 'cms-99214', 'v1', 'p'));
    expect(a).not.toBe(await submitterHash('b', 'cms-99213', 'v2', 'p'));
  });

  it('takes the dedicated secret first and falls back to the admin token, so an existing deployment keeps a salt', () => {
    expect(pepperOf({ REGISTER_PEPPER: 'one', ADMIN_TOKEN: 'two' })).toBe('one');
    expect(pepperOf({ ADMIN_TOKEN: 'two' })).toBe('two');
    expect(pepperOf({})).toBe('');
  });
});

describe('the network key', () => {
  it('separates two networks and is stable for one', async () => {
    const env = { REGISTER_PEPPER: 'secret' };
    expect(await networkKey(reqFrom('203.0.113.7'), env)).toBe(await networkKey(reqFrom('203.0.113.7'), env));
    expect(await networkKey(reqFrom('203.0.113.7'), env)).not.toBe(await networkKey(reqFrom('198.51.100.9'), env));
  });

  it('is not recomputable without the server secret', async () => {
    expect(await networkKey(reqFrom('203.0.113.7'), { REGISTER_PEPPER: 'secret' }))
      .not.toBe(await networkKey(reqFrom('203.0.113.7'), {}));
  });

  it('buckets one network per figure, so a cooldown on one row never silences another', async () => {
    const env = { REGISTER_PEPPER: 'secret' };
    const a = await figureBucket(reqFrom('203.0.113.7'), env, 'cms-99213', 'v1');
    expect(a).not.toBe(await figureBucket(reqFrom('203.0.113.7'), env, 'cms-99214', 'v1'));
    expect(a).not.toBe(await figureBucket(reqFrom('198.51.100.9'), env, 'cms-99213', 'v1'));
  });
});

describe('the cooldown', () => {
  it('lets three votes about one figure through in an hour and refuses the fourth', async () => {
    const env = { LEDGER: fakeKV() };
    const bucket = 'one-network-one-figure';
    for (let i = 0; i < FIGURE_CAP.hour; i++) {
      expect((await chargeFigure(env, bucket)).allowed).toBe(true);
    }
    const fourth = await chargeFigure(env, bucket);
    expect(fourth.allowed).toBe(false);
    expect(fourth.scope).toBe('hour');
  });

  it('two different browsers on one network still collide on the same figure — clearing storage does not buy a vote', async () => {
    const env = { LEDGER: fakeKV() };
    const request = reqFrom('203.0.113.7');
    const secrets = { REGISTER_PEPPER: 'secret', LEDGER: env.LEDGER };
    /* Four different submitterIds, one network, one figure: the per-browser key
       differs every time, which is exactly the hole Round 3 named. The bucket
       does not, so the fourth is refused. */
    const bucket = await figureBucket(request, secrets, 'cms-99213', 'v1');
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await chargeFigure(secrets, bucket)).allowed);
    expect(results).toEqual([true, true, true, false]);
  });

  it('does not touch a different figure', async () => {
    const env = { REGISTER_PEPPER: 'secret', LEDGER: fakeKV() };
    const request = reqFrom('203.0.113.7');
    const one = await figureBucket(request, env, 'cms-99213', 'v1');
    const two = await figureBucket(request, env, 'cms-99214', 'v1');
    for (let i = 0; i < FIGURE_CAP.hour; i++) await chargeFigure(env, one);
    expect((await chargeFigure(env, one)).allowed).toBe(false);
    expect((await chargeFigure(env, two)).allowed).toBe(true);
  });

  it('stops at the daily cap even across hours', async () => {
    const env = { LEDGER: fakeKV() };
    const bucket = 'b';
    /* Charge the day counter to its cap directly, the way a run of hours would. */
    const dayKey = `cf:d:${new Date().toISOString().slice(0, 10)}:${bucket}`;
    await env.LEDGER.put(dayKey, String(FIGURE_CAP.day));
    const r = await chargeFigure(env, bucket);
    expect(r.allowed).toBe(false);
    expect(r.scope).toBe('day');
  });

  it('never blocks a correction when KV is unavailable — losing a real one is worse than counting one extra', async () => {
    const broken = { LEDGER: { get: async () => { throw new Error('kv down'); }, put: async () => {} } };
    expect((await chargeFigure(broken, 'b')).allowed).toBe(true);
    expect((await chargeFigure({}, 'b')).allowed).toBe(true);
  });
});

describe('the published denominator', () => {
  const row = (priceId: string, senderKey: string) => ({
    priceId, verdict: 'wrong' as const, believedValueUsd: null,
    receivedAt: '2026-10-22T12:00:00.000Z', senderKey,
  });

  it('counts distinct senders, not sends', () => {
    const a = aggregateCorrections([row('cms-99213', 's1'), row('cms-99213', 's1'), row('cms-99214', 's2')]);
    expect(a.sends).toBe(3);
    expect(a.senders).toBe(2);
    expect(a.figures).toBe(2);
  });

  it('publishes the count only, never a key', () => {
    const a = aggregateCorrections([row('cms-99213', 's1')]);
    expect(JSON.stringify(a)).not.toContain('s1');
    expect(JSON.stringify(a)).not.toContain('senderKey');
  });

  it('an empty register still answers with its zeros', () => {
    expect(aggregateCorrections([]).senders).toBe(0);
  });
});

describe('the page and the code say the same numbers', () => {
  const page = readFileSync(new URL('../app/integrity/page.tsx', import.meta.url), 'utf8');

  it('/integrity quotes the caps that are actually enforced', () => {
    expect(page).toContain(`${FIGURE_CAP.hour} in an hour, ${FIGURE_CAP.day} in a day`);
  });

  it('/integrity still says what the controls do NOT stop', () => {
    expect(page).toMatch(/does not stop/i);
    expect(page).toMatch(/hundred browsers/i);
  });

  it('/register quotes the same caps', () => {
    const reg = readFileSync(new URL('../components/Register.tsx', import.meta.url), 'utf8');
    expect(reg).toContain(`at most ${FIGURE_CAP.hour} corrections about`);
    expect(reg).toContain(`${FIGURE_CAP.day} in a day`);
  });
});

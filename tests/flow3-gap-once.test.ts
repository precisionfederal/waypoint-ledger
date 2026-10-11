/* FLOW3 flow3-3: one press of "Add it to the count" is one report. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { alreadyCounted, idemOf, noteCounted, onRequestPost, IDEM_TTL } from '../cf/functions/api/gap.js';

function fakeKV() {
  const map = new Map<string, string>();
  const ttl = new Map<string, number>();
  return { map, ttl, async get(k: string) { return map.get(k) ?? null; }, async put(k: string, v: string, o?: { expirationTtl?: number }) { map.set(k, v); if (o?.expirationTtl) ttl.set(k, o.expirationTtl); } };
}
const post = (body: object) => new Request('https://x.test/api/gap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
/* A database that fails the test if it is touched: a repeat must never reach it. */
const untouchableDB = new Proxy({}, { get() { throw new Error('a repeat reached the database'); } });

describe('flow3-3 the server drops a repeat', () => {
  it('reads only a well-formed key', () => {
    expect(idemOf({ idempotencyKey: '0123456789abcdef01234567:3' })).toBe('0123456789abcdef01234567:3');
    for (const k of [undefined, 3, '', 'short', 'has space in it', 'x'.repeat(81), '<script>alert(1)</script>']) expect(idemOf({ idempotencyKey: k })).toBeNull();
  });
  it('a key is counted once, for a day, hashed, outside the row', async () => {
    const env = { LEDGER: fakeKV() };
    const k = 'a1b2c3d4e5f6a7b8c9d0e1f2:3';
    expect(await alreadyCounted(env, k)).toBe(false);
    await noteCounted(env, k);
    expect(await alreadyCounted(env, k)).toBe(true);
    expect(await alreadyCounted(env, 'a1b2c3d4e5f6a7b8c9d0e1f2:4')).toBe(false);
    const [slot] = [...env.LEDGER.map.keys()];
    expect(slot).toMatch(/^idem:gap:[0-9a-f]{32}$/);
    expect(slot).not.toContain('a1b2c3');
    expect(env.LEDGER.ttl.get(slot)).toBe(IDEM_TTL);
  });
  it('no key, or no KV, records as before (never blocks a first report)', async () => {
    expect(await alreadyCounted({ LEDGER: fakeKV() }, null)).toBe(false);
    expect(await alreadyCounted({}, 'a1b2c3d4e5f6a7b8c9d0e1f2:3')).toBe(false);
    const broken = { LEDGER: { get: async () => { throw new Error('down'); }, put: async () => { throw new Error('down'); } } };
    expect(await alreadyCounted(broken, 'a1b2c3d4e5f6a7b8c9d0e1f2:3')).toBe(false);
    await expect(noteCounted(broken, 'a1b2c3d4e5f6a7b8c9d0e1f2:3')).resolves.toBeUndefined();
  });
  it('a repeat is answered "already counted" and never reaches the database', async () => {
    const env = { LEDGER: fakeKV(), DB: untouchableDB };
    const k = 'a1b2c3d4e5f6a7b8c9d0e1f2:3';
    await noteCounted(env, k);
    const res = await onRequestPost({ request: post({ counts: { dismissed: 3 }, idempotencyKey: k }), env } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: true, note: 'Already counted. Nothing was added.' });
  });
});

describe('flow3-3 the page: Added, aria-disabled, focus kept, key sent', () => {
  const src = readFileSync('components/BurdenLedger.tsx', 'utf8');
  it('never uses disabled on the send button, so focus stays on it', () => {
    const btn = src.slice(src.indexOf('onClick={() => void sendDismissed()}') - 400, src.indexOf('onClick={() => void sendDismissed()}'));
    expect(btn).toContain('aria-disabled={sendBlocked || undefined}');
    expect(btn).not.toMatch(/\sdisabled=\{/);
    expect(src).toContain('if (sendBlocked) return;');
    expect(src).toContain("const isAdded = sendState === 'sent' && sentCount.current === c.dismissed;");
    expect(src).toContain('Added</>');
  });
  it('sends this ledger\'s key with the count', () => {
    expect(src).toContain('idempotencyKey: gapSendKey(c.dismissed)');
  });
});

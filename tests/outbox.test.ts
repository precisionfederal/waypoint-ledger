/* ==========================================================================
   THE OUTBOX, AFTER A RELOAD.

   A person in a hospital basement presses a thumb with no signal, then the page
   reloads. Before this, "waiting to send" lived in React state: the item was
   still in localStorage and the screen said nothing about it. These tests hold
   the rule that fixed it — every reader of the queue derives from the storage,
   so the screen and the queue cannot disagree, whatever React did.
   ========================================================================== */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  OUTBOX_KEY, enqueue, readOutbox, pending, pendingItems, pendingCorrections,
  queuedCorrections, queuedVerdicts, snapshot, subscribe, waitingLabel, post, flush, remove,
} from '../lib/outbox';

/** A localStorage that behaves like the real one, including surviving a
 *  "reload" (the module reads it fresh every time — nothing is memoised). */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    get size() { return map.size; },
  };
}

const storage = fakeStorage();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('window', { localStorage: storage, addEventListener: () => {} });
});
afterEach(() => { vi.unstubAllGlobals(); });

const correction = (priceId: string, verdict: 'right' | 'wrong' = 'wrong') =>
  ({ priceId, verdict, believedValueUsd: null, priceTableVersion: '2026-09-08.1-verified', submitterId: 'abc' });

describe('what is still on this device', () => {
  it('a queued correction is readable by figure after a reload', () => {
    enqueue('/api/corrections', correction('cms-99214'));
    /* The reload: nothing in memory survives it, so read the storage again. */
    expect(pending()).toBe(1);
    expect(queuedCorrections()).toEqual({ 'cms-99214': true });
    expect(queuedVerdicts()).toEqual({ 'cms-99214': 'wrong' });
    expect(pendingCorrections()['cms-99214'].queuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('holds the verdict the person actually pressed, not a default', () => {
    enqueue('/api/corrections', correction('cms-99204', 'right'));
    expect(queuedVerdicts()).toEqual({ 'cms-99204': 'right' });
  });

  it('reads several figures at once and keeps them apart', () => {
    enqueue('/api/corrections', correction('cms-99214', 'wrong'));
    enqueue('/api/corrections', correction('cms-img-echo', 'right'));
    expect(Object.keys(queuedCorrections()).sort()).toEqual(['cms-99214', 'cms-img-echo']);
    expect(queuedVerdicts()['cms-img-echo']).toBe('right');
  });

  it('never reads a queued item of another kind as a correction', () => {
    enqueue('/api/gap', { counts: { 'care-denied': 2 } });
    expect(pending()).toBe(1);
    expect(queuedCorrections()).toEqual({});
    expect(pendingItems()).toHaveLength(1);
  });

  it('ignores a malformed item rather than showing a thumb for nothing', () => {
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify([
      { id: 'a', url: '/api/corrections', body: { verdict: 'wrong' }, queuedAt: new Date().toISOString(), tries: 0 },
      { id: 'b', url: '/api/corrections', body: { priceId: 'cms-99214', verdict: 'sideways' }, queuedAt: new Date().toISOString(), tries: 0 },
    ]));
    expect(queuedCorrections()).toEqual({});
  });

  it('says how many are waiting, in words, singular and plural', () => {
    expect(waitingLabel(1)).toBe('1 correction waiting to send');
    expect(waitingLabel(3)).toBe('3 corrections waiting to send');
  });
});

describe('the snapshot a React view subscribes to', () => {
  it('is a stable string: two reads with no change are identical', () => {
    enqueue('/api/corrections', correction('cms-99214'));
    const a = snapshot();
    expect(snapshot()).toBe(a);
    expect(a).toContain('cms-99214');
  });

  it('changes when the queue changes, and the subscriber is told', () => {
    const seen: string[] = [];
    const off = subscribe(() => seen.push(snapshot()));
    enqueue('/api/corrections', correction('cms-99214'));
    expect(seen).toHaveLength(1);
    const item = readOutbox()[0];
    remove(item.id);
    expect(seen).toHaveLength(2);
    expect(snapshot()).toBe('');
    off();
    enqueue('/api/corrections', correction('cms-99204'));
    expect(seen).toHaveLength(2);            // unsubscribed means unsubscribed
  });
});

describe('sending', () => {
  it('a failed POST is queued and still queued after the call returns', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const r = await post('/api/corrections', correction('cms-99214'));
    expect(r.ok).toBe(false);
    expect(r.queued).toBe(true);
    expect(queuedCorrections()).toEqual({ 'cms-99214': true });
  });

  it('a flush that succeeds empties the queue, so the chip disappears', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await post('/api/corrections', correction('cms-99214'));
    expect(pending()).toBe(1);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const out = await flush();
    expect(out.sent).toBe(1);
    expect(pending()).toBe(0);
    expect(queuedCorrections()).toEqual({});
  });

  it('a 409 "you already told us" is an answer, so it leaves the queue too', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await post('/api/corrections', correction('cms-99214'));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, already: true }), { status: 409, headers: { 'content-type': 'application/json' } })));
    const out = await flush();
    expect(out.sent).toBe(0);
    expect(pending()).toBe(0);
  });

  it('the same correction is never queued twice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await post('/api/corrections', correction('cms-99214'));
    await post('/api/corrections', correction('cms-99214'));
    expect(pending()).toBe(1);
  });
});

/* ==========================================================================
   NOTHING IS EVER SILENTLY DISCARDED.

   Round 3, measured: `tries` climbed once per PAGE LOAD, and at twelve the item
   was deleted with `.filter((i) => i.tries < MAX_TRIES)` — no chip, no message,
   and a thumb still rendering as pressed. Twelve ordinary opens is about a week.
   The one thing this tool asks a sick person for was thrown away without a word.
   ========================================================================== */
describe('a correction that cannot be delivered', () => {
  const offline = () => vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));

  it('is kept, not deleted, after the automatic tries run out', async () => {
    const { MAX_TRIES, stuckItems, stuckLabel } = await import('../lib/outbox');
    offline();
    await post('/api/corrections', correction('cms-99214'));
    for (let i = 0; i < MAX_TRIES + 3; i++) await flush(true);
    expect(pending()).toBe(1);                       // still here, forever
    expect(stuckItems()).toHaveLength(1);
    expect(stuckLabel(1)).toContain('still on this device');
  });

  it('stops being retried automatically once it is stuck, but Try now still tries it', async () => {
    const { MAX_TRIES, stuckItems } = await import('../lib/outbox');
    offline();
    await post('/api/corrections', correction('cms-99214'));
    for (let i = 0; i < MAX_TRIES; i++) await flush(true);
    expect(stuckItems()).toHaveLength(1);

    const sender = vi.fn(async () => { throw new Error('offline'); });
    vi.stubGlobal('fetch', sender);
    await flush();                                   // an ordinary page load
    expect(sender).not.toHaveBeenCalled();
    await flush(true);                               // the person pressed Try now
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it('goes out the moment the network comes back, however long it sat', async () => {
    const { MAX_TRIES } = await import('../lib/outbox');
    offline();
    await post('/api/corrections', correction('cms-99214'));
    for (let i = 0; i < MAX_TRIES + 1; i++) await flush(true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const out = await flush(true);
    expect(out.sent).toBe(1);
    expect(pending()).toBe(0);
  });

  it('copies out as plain text a person could paste into an email', async () => {
    const { MAX_TRIES, stuckText } = await import('../lib/outbox');
    offline();
    await post('/api/corrections', correction('cms-99214'));
    for (let i = 0; i < MAX_TRIES; i++) await flush(true);
    const text = stuckText();
    expect(text).toContain('cms-99214');
    expect(text).toContain('this figure is wrong for me');
    expect(text).toContain('bo@precisionfederal.com');
  });

  it('holds a 429 rather than dropping it: the cooldown is a "later", not a "no"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'too many about this figure' }), { status: 429, headers: { 'content-type': 'application/json' } })));
    const r = await post('/api/corrections', correction('cms-99214'));
    expect(r.ok).toBe(false);
    expect(r.queued).toBe(true);
    expect(pending()).toBe(1);
  });

  it('an old item is marked stuck rather than swept out of storage', async () => {
    const old = new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString();
    storage.setItem(OUTBOX_KEY, JSON.stringify([{ id: 'x', url: '/api/corrections', body: { priceId: 'cms-99214', verdict: 'wrong' }, queuedAt: old, tries: 0 }]));
    const { stuckItems } = await import('../lib/outbox');
    expect(pending()).toBe(1);
    expect(stuckItems()).toHaveLength(1);
  });
});

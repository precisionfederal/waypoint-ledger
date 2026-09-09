/* The register's integrity. Three things have to hold forever: the hash is the
   hash anyone else would compute, an edited or reordered row is detectable, and
   a cell in the CSV we hand to an agency is never a command.

   The chain hash is checked against an INDEPENDENT implementation (node:crypto
   over a string this test builds by hand), not against our own helper — a test
   that only asks the code to agree with itself proves nothing. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  GENESIS, canonical, sha256Hex, rowHash, verifyChain, submitterHash, PUBLISHED, CHAINED_TABLES,
} from '../cf/functions/api/_hash.js';
import { csvOf, exportRows, isFormulaCell } from '../cf/functions/api/export/[kind].js';
import { validateCorrection, PRICE_IDS } from '../cf/functions/api/corrections.js';

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

const corr = (over: Record<string, unknown> = {}) => ({
  receivedAt: '2026-09-09T12:00:00.000Z',
  priceId: 'cms-99214',
  verdict: 'wrong',
  believedValueUsd: 240,
  priceTableVersion: '2026-09-08.1-verified',
  note: 'a private note that must never be hashed or published',
  ...over,
});

/** Build a chain the way the server does, so the walk has something to check. */
async function chainOf(records: Record<string, unknown>[]) {
  const rows: Record<string, unknown>[] = [];
  let prev = GENESIS;
  for (const r of records) {
    const h = await rowHash(prev, PUBLISHED.corrections(r));
    rows.push({ ...r, prevHash: prev, rowHash: h });
    prev = h;
  }
  return { rows, head: prev };
}

describe('canonical JSON', () => {
  it('sorts object keys at every level and writes no whitespace', () => {
    expect(canonical({ b: 1, a: [3, { z: 1, y: 2 }], c: null })).toBe('{"a":[3,{"y":2,"z":1}],"b":1,"c":null}');
  });
  it('does not depend on the order the object was built in', () => {
    expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }));
  });
  it('writes undefined as null so a missing field is one value, never absent', () => {
    expect(canonical({ a: undefined })).toBe('{"a":null}');
  });
});

describe('the hash itself', () => {
  it('matches an independent SHA-256 of the empty string', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('is exactly SHA-256(prev_hash + canonical fields), recomputed by hand', async () => {
    const fields = PUBLISHED.corrections(corr());
    const byHand = sha(GENESIS + '{"believed_usd":240,"price_id":"cms-99214","received_at":"2026-09-09T12:00:00.000Z","table_version":"2026-09-08.1-verified","verdict":"wrong"}');
    expect(await rowHash(GENESIS, fields)).toBe(byHand);
    expect(byHand).toHaveLength(64);
  });
  it('changes when any covered field changes', async () => {
    const a = await rowHash(GENESIS, PUBLISHED.corrections(corr()));
    const b = await rowHash(GENESIS, PUBLISHED.corrections(corr({ verdict: 'right' })));
    expect(a).not.toBe(b);
  });
  it('changes when the row before it changes, which is what makes it a chain', async () => {
    const a = await rowHash(GENESIS, PUBLISHED.corrections(corr()));
    const b = await rowHash('a'.repeat(64), PUBLISHED.corrections(corr()));
    expect(a).not.toBe(b);
  });
});

describe('what the chain covers', () => {
  it('covers exactly the five published correction columns — never the private note', () => {
    const f = PUBLISHED.corrections(corr());
    expect(Object.keys(f).sort()).toEqual(['believed_usd', 'price_id', 'received_at', 'table_version', 'verdict']);
    expect(JSON.stringify(f)).not.toContain('private note');
  });
  it('covers no free text on any chained table', () => {
    const samples: Record<string, Record<string, unknown>> = {
      corrections: corr(),
      gap_reports: { receivedAt: 'x', counts: { dismissed: 2 }, ranking: ['dismissed'], note: 'secret gap note', tableVersion: 'v' },
      survey_responses: { receivedAt: 'x', ranking: ['a'], unasked: 'a', lead: 'a', decide: 'patients', clinicians: 3, context: { age: '30–44' }, sentence: 'secret sentence', channel: 'demo', surveyVersion: 'v' },
      interviews: { receivedAt: 'x', consent: 'notes', channel: 'direct', followUp: true, answers: { q1: 'secret answer' }, name: 'a name', email: 'a@b.co' },
    };
    const projections = PUBLISHED as Record<string, (r: Record<string, unknown>) => unknown>;
    for (const t of CHAINED_TABLES as string[]) {
      const s = JSON.stringify(projections[t](samples[t]));
      for (const banned of ['secret', 'a name', 'a@b.co']) expect(s).not.toContain(banned);
    }
  });
  it('reduces a survey context to the four published keys, so the chain and the CSV cover the same thing', () => {
    const f = PUBLISHED.survey_responses({ receivedAt: 'x', ranking: [], context: { age: '30–44', state: 'Iowa' } }) as unknown as { context: Record<string, unknown> };
    expect(Object.keys(f.context).sort()).toEqual(['age', 'insurance', 'region', 'stage']);
  });
});

describe('walking the chain', () => {
  it('accepts a chain that was written honestly', async () => {
    const { rows, head } = await chainOf([corr(), corr({ verdict: 'right', believedValueUsd: null }), corr({ priceId: 'cms-99213' })]);
    const res = await verifyChain('corrections', rows);
    expect(res.ok).toBe(true);
    expect(res.length).toBe(3);
    expect(res.head).toBe(head);
  });
  it('catches a field edited after the fact', async () => {
    const { rows } = await chainOf([corr(), corr({ verdict: 'right' })]);
    rows[1].verdict = 'wrong';
    const res = await verifyChain('corrections', rows);
    expect(res.ok).toBe(false);
    expect(res.brokeAt).toBe(1);
  });
  it('catches two rows swapped', async () => {
    const { rows } = await chainOf([corr(), corr({ priceId: 'cms-99213' })]);
    const res = await verifyChain('corrections', [rows[1], rows[0]]);
    expect(res.ok).toBe(false);
  });
  it('catches a row quietly removed: the head no longer lands where it did', async () => {
    const { rows, head } = await chainOf([corr(), corr({ priceId: 'cms-99213' }), corr({ verdict: 'right' })]);
    const res = await verifyChain('corrections', [rows[0], rows[2]]);
    expect(res.ok).toBe(false);
    expect(res.head).not.toBe(head);
  });
  it('an empty chain has the genesis head and that is a true statement', async () => {
    const res = await verifyChain('corrections', []);
    expect(res.ok).toBe(true);
    expect(res.head).toBe(GENESIS);
    expect(GENESIS).toBe('0'.repeat(64));
  });
});

describe('the submitter key', () => {
  it('is one-way, 32 hex characters, and never the id itself', async () => {
    const h = await submitterHash('browser-abc-123', 'cms-99214', 'v1');
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(h).not.toContain('browser-abc-123');
  });
  it('is stable for the same browser, figure and table version', async () => {
    expect(await submitterHash('b', 'cms-99214', 'v1')).toBe(await submitterHash('b', 'cms-99214', 'v1'));
  });
  it('cannot be used to link one browser across two figures or two table versions', async () => {
    const a = await submitterHash('b', 'cms-99214', 'v1');
    expect(a).not.toBe(await submitterHash('b', 'cms-99213', 'v1'));
    expect(a).not.toBe(await submitterHash('b', 'cms-99214', 'v2'));
  });
  it('is nothing at all when the browser sent nothing', async () => {
    expect(await submitterHash(undefined, 'cms-99214', 'v1')).toBeNull();
  });
});

describe('a correction must name a published federal figure', () => {
  it('accepts one of the published ids', () => {
    expect(PRICE_IDS.has('cms-99214')).toBe(true);
    expect(validateCorrection({ priceId: 'cms-99214', verdict: 'wrong' }).error).toBeUndefined();
  });
  it('refuses an identifier that is not in the table, in the sentence a person should see', () => {
    expect(validateCorrection({ priceId: 'cms-DOES-NOT-EXIST-9999', verdict: 'wrong' }).error)
      .toBe('That identifier is not a published figure in this table.');
  });
  it('carries the optional submitterId through so a repeat can be refused', () => {
    expect(validateCorrection({ priceId: 'cms-99214', verdict: 'right', submitterId: 'abc' }).record?.submitterId).toBe('abc');
  });
});

describe('the CSV an agency opens', () => {
  it('neutralises the exact payload Round 1 round-tripped', () => {
    const csv = csvOf(['price_id', 'table_version'], [["=cmd|'/C calc'!A0", '@SUM(1+9)*cmd|']]);
    const cells = csv.split('\n')[1];
    expect(cells).toBe(`"'=cmd|'/C calc'!A0","'@SUM(1+9)*cmd|"`);
    expect(cells.startsWith('=')).toBe(false);
  });
  it('escapes every character a spreadsheet would execute', () => {
    for (const p of ['=1+1', '+1', '-1+1', '@A1', '\tSUM', '\rSUM']) expect(isFormulaCell(p)).toBe(true);
  });
  it('leaves a plain number alone, including a negative one, so numbers stay numbers', () => {
    expect(isFormulaCell('240')).toBe(false);
    expect(isFormulaCell('-240.5')).toBe(false);
    expect(csvOf(['believed_usd'], [[240]]).split('\n')[1]).toBe('240');
  });
  it('publishes row_hash as the last column of every export', () => {
    for (const kind of ['corrections', 'gap', 'survey']) {
      /* corrections.csv leads with a # comment naming the table version and the
         audit; the header is the first line that is not a comment. */
      const header = (exportRows(kind, []) as string).trim().split('\n').filter((l) => !l.startsWith('#'))[0];
      const cols = header.split(',');
      expect(cols[cols.length - 1]).toBe('row_hash');
    }
  });
  it('carries the hash of the row it exports', () => {
    const csv = exportRows('corrections', [{ ...corr(), rowHash: 'a'.repeat(64) }]) as string;
    const rows = csv.trim().split('\n').filter((l) => !l.startsWith('#')).slice(1);
    expect(rows[0].endsWith('a'.repeat(64))).toBe(true);
  });
});

/* ---- the outbox: a correction is never silently lost ---- */
function fakeBrowser() {
  const store = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
    addEventListener: () => {},
  };
  return store;
}

describe('the outbox', () => {
  let store: Map<string, string>;
  beforeEach(() => { store = fakeBrowser(); vi.resetModules(); });

  it('queues a POST the network refused, and reports it as queued, never as sent', async () => {
    const { post, pending, OUTBOX_KEY } = await import('../lib/outbox');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const res = await post('/api/corrections', { priceId: 'cms-99214', verdict: 'wrong' });
    expect(res.ok).toBe(false);
    expect(res.queued).toBe(true);
    expect(pending()).toBe(1);
    expect(store.get(OUTBOX_KEY)).toContain('cms-99214');
  });

  it('sends what it queued when the connection comes back, and empties itself', async () => {
    const { post, flush, pending } = await import('../lib/outbox');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await post('/api/corrections', { priceId: 'cms-99214', verdict: 'wrong' });
    expect(pending()).toBe(1);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, json: async () => ({ ok: true }) }));
    expect(await flush()).toEqual({ sent: 1, left: 0, stuck: 0 });
    expect(pending()).toBe(0);
  });

  it('does not queue an answer the server already gave: a repeat thumb is not retried forever', async () => {
    const { post, pending } = await import('../lib/outbox');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 409, json: async () => ({ ok: false, already: true }) }));
    const res = await post('/api/corrections', { priceId: 'cms-99214', verdict: 'wrong' });
    expect(res.ok).toBe(false);
    expect(res.queued).toBe(false);
    expect(pending()).toBe(0);
  });

  it('retries a server that said it saved nothing', async () => {
    const { post, pending } = await import('../lib/outbox');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 500, json: async () => ({ ok: false, error: 'Nothing was saved.' }) }));
    await post('/api/corrections', { priceId: 'cms-99214', verdict: 'wrong' });
    expect(pending()).toBe(1);
  });

  it('never queues the same request twice', async () => {
    const { post, pending } = await import('../lib/outbox');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await post('/api/corrections', { priceId: 'cms-99214', verdict: 'wrong' });
    await post('/api/corrections', { priceId: 'cms-99214', verdict: 'wrong' });
    expect(pending()).toBe(1);
  });
});

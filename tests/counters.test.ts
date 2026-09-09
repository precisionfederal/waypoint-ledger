/* ==========================================================================
   THE REGISTER READS THE SAME AT TEN ROWS AND AT A HUNDRED THOUSAND — and it
   is never a minute out of date while it does it.

   The fold is a cache with a fingerprint instead of a timer: the row count and
   the chain head it was folded from. These tests hold the two properties that
   make it safe to publish from — it is used when it is exactly current, and it
   is ignored the moment it is not — and the one that makes it safe to ship: a
   database that cannot cache still answers.

   And ?dry=1: a deploy has to prove the write path, and a test row in a public
   register is a lie about how many people have spoken.
   ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { cachedAggregate, isFresh, parsePayload, writeProbe, readCache, AGG_SOURCE } from '../cf/functions/api/_counters.js';
import { isDryRun, dryOk } from '../cf/functions/api/_http.js';

interface State { agg: Record<string, unknown> | null; rows: number; head: string; writes: number }

/** A D1 that answers the three statements this module sends, and nothing else:
 *  an unexpected query is a test failure, not a silent pass. */
function fakeD1(state: State, opts: { failAgg?: boolean; failWrite?: boolean } = {}) {
  const log: string[] = [];
  const run = (sql: string, bound: unknown[]) => {
    log.push(sql);
    if (sql.startsWith('SELECT kind, rows_folded')) {
      if (opts.failAgg) throw new Error('no such table: agg');
      return { results: state.agg ? [state.agg] : [], meta: { changes: 0 } };
    }
    if (sql.includes('AS rows')) return { results: [{ rows: state.rows, head: state.head }], meta: { changes: 0 } };
    if (sql.startsWith('INSERT INTO agg')) {
      if (opts.failWrite) throw new Error('read only');
      state.writes++;
      state.agg = { kind: bound[0], rows_folded: bound[1], head_hash: bound[2], payload_json: bound[3], updated_at: bound[4] };
      return { results: [], meta: { changes: 1 } };
    }
    throw new Error('unexpected sql: ' + sql);
  };
  const prepare = (sql: string) => {
    const st = {
      sql, bound: [] as unknown[],
      bind(...a: unknown[]) { st.bound = a; return st; },
      async first() { return run(st.sql, st.bound).results[0] ?? null; },
      async run() { return run(st.sql, st.bound); },
      async all() { return run(st.sql, st.bound); },
    };
    return st;
  };
  return { log, env: { DB: { prepare, batch: async (sts: { sql: string; bound: unknown[] }[]) => sts.map((s) => run(s.sql, s.bound)) } } };
}

const AGGREGATE = (rows: unknown[]) => ({ ok: true, n: rows.length, note: 'counted' });
const spec = (rows: unknown[]) => ({ kind: 'survey', loadRows: vi.fn(async () => rows), aggregate: AGGREGATE });

describe('the fold is used only when it is exactly current', () => {
  it('folds on a cold cache and stores the fingerprint it folded from', async () => {
    const state: State = { agg: null, rows: 3, head: 'aaa', writes: 0 };
    const { env } = fakeD1(state);
    const s = spec([1, 2, 3]);
    const out = await cachedAggregate(env, s);
    expect(out.n).toBe(3);
    expect(out.fold).toMatchObject({ hit: false, rows: 3 });
    expect(s.loadRows).toHaveBeenCalledTimes(1);
    expect(state.agg).toMatchObject({ kind: 'survey', rows_folded: 3, head_hash: 'aaa' });
  });

  it('serves from the fold without touching a row when the fingerprint matches', async () => {
    const state: State = { agg: { kind: 'survey', rows_folded: 3, head_hash: 'aaa', payload_json: JSON.stringify({ ok: true, n: 3 }), updated_at: 'T' }, rows: 3, head: 'aaa', writes: 0 };
    const { env } = fakeD1(state);
    const s = spec([1, 2, 3]);
    const out = await cachedAggregate(env, s);
    expect(out).toMatchObject({ ok: true, n: 3, fold: { hit: true, rows: 3, foldedAt: 'T' } });
    expect(s.loadRows).not.toHaveBeenCalled();
    expect(state.writes).toBe(0);
  });

  it('refolds after an append: the head moved', async () => {
    const state: State = { agg: { kind: 'survey', rows_folded: 3, head_hash: 'aaa', payload_json: JSON.stringify({ n: 3 }), updated_at: 'T' }, rows: 4, head: 'bbb', writes: 0 };
    const { env } = fakeD1(state);
    const s = spec([1, 2, 3, 4]);
    const out = await cachedAggregate(env, s);
    expect(out.n).toBe(4);
    expect(out.fold.hit).toBe(false);
    expect(state.agg).toMatchObject({ rows_folded: 4, head_hash: 'bbb' });
  });

  it('refolds after a delete: the count moved while the head did not', async () => {
    const state: State = { agg: { kind: 'survey', rows_folded: 3, head_hash: 'aaa', payload_json: JSON.stringify({ n: 3 }), updated_at: 'T' }, rows: 2, head: 'aaa', writes: 0 };
    const { env } = fakeD1(state);
    const out = await cachedAggregate(env, spec([1, 2]));
    expect(out.n).toBe(2);
    expect(out.fold.hit).toBe(false);
  });

  it('a delete and an append together move both, so the pair still catches it', () => {
    expect(isFresh({ rows_folded: 3, head_hash: 'aaa', payload_json: '{}' }, { rows: 3, head: 'bbb' })).toBe(false);
    expect(isFresh({ rows_folded: 3, head_hash: 'aaa', payload_json: '{}' }, { rows: 3, head: 'aaa' })).toBe(true);
    expect(isFresh(null, { rows: 0, head: '' })).toBe(false);
    expect(isFresh({ rows_folded: 0, head_hash: '', payload_json: '' }, { rows: 0, head: '' })).toBe(false);
  });

  it('an unreadable payload is a miss, never an error the reader sees', async () => {
    const state: State = { agg: { kind: 'survey', rows_folded: 2, head_hash: 'aaa', payload_json: 'not json', updated_at: 'T' }, rows: 2, head: 'aaa', writes: 0 };
    const { env } = fakeD1(state);
    expect(parsePayload({ payload_json: 'not json' })).toBeNull();
    const out = await cachedAggregate(env, spec([1, 2]));
    expect(out).toMatchObject({ ok: true, n: 2 });
  });
});

describe('the fold is an optimisation, never a precondition', () => {
  it('answers from the rows when the agg table is not there yet', async () => {
    const state: State = { agg: null, rows: 2, head: 'aaa', writes: 0 };
    const { env } = fakeD1(state, { failAgg: true });
    const out = await cachedAggregate(env, spec([1, 2]));
    expect(out).toMatchObject({ ok: true, n: 2, fold: { hit: false, rows: 2 } });
  });

  it('answers when the cache cannot be written', async () => {
    const state: State = { agg: null, rows: 1, head: 'aaa', writes: 0 };
    const { env } = fakeD1(state, { failWrite: true });
    const out = await cachedAggregate(env, spec([1]));
    expect(out.n).toBe(1);
    expect(state.writes).toBe(0);
  });

  it('refuses a kind it has no source for, rather than inventing one', async () => {
    const { env } = fakeD1({ agg: null, rows: 0, head: '', writes: 0 });
    await expect(cachedAggregate(env, { kind: 'nonsense', loadRows: async () => [], aggregate: AGGREGATE })).rejects.toThrow(/no aggregate source/i);
    expect(Object.keys(AGG_SOURCE).sort()).toEqual(['corrections', 'gap', 'interviews', 'survey']);
  });

  it('reads the cache row and the fingerprint in one round trip', async () => {
    const state: State = { agg: null, rows: 5, head: 'ccc', writes: 0 };
    const { env, log } = fakeD1(state);
    const { fingerprint } = await readCache(env, 'gap', 'gap_reports');
    expect(fingerprint).toEqual({ rows: 5, head: 'ccc' });
    expect(log).toHaveLength(2);
  });
});

describe('?dry=1 — validate a write without writing', () => {
  const req = (url: string) => new Request(url, { method: 'POST' });
  it('is on only when it is asked for', () => {
    expect(isDryRun(req('https://x.test/api/corrections?dry=1'))).toBe(true);
    expect(isDryRun(req('https://x.test/api/corrections'))).toBe(false);
    expect(isDryRun(req('https://x.test/api/corrections?dry=0'))).toBe(false);
    expect(isDryRun(req('https://x.test/api/corrections?dry=true'))).toBe(false);
  });

  it('answers 200 and says plainly that nothing was written', async () => {
    const res = dryOk('corrections', { priceId: 'cms-99214' }, { ok: true, rows: 0, head: 'a' });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, dryRun: true, kind: 'corrections' });
    expect(body.note).toMatch(/nothing was written/i);
  });

  it('the storage probe proves the table and its chain head, without inserting', async () => {
    const state: State = { agg: null, rows: 7, head: 'head-hash', writes: 0 };
    const { env } = fakeD1(state);
    expect(await writeProbe(env, 'survey')).toEqual({ ok: true, table: 'survey_responses', rows: 7, head: 'head-hash' });
    expect(state.writes).toBe(0);
  });

  it('says so when there is no chain head to append against', async () => {
    const { env } = fakeD1({ agg: null, rows: 0, head: '', writes: 0 });
    expect(await writeProbe(env, 'gap')).toMatchObject({ ok: false });
    expect(await writeProbe(env, 'nope')).toMatchObject({ ok: false, reason: 'unknown kind' });
  });
});

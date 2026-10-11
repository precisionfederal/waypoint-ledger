/* FIX-annotations (2026-10-01, judge panel R1 item 1): our own test rows are
   marked in public and left out of every count, and the chain is untouched.
   Run against a REAL SQLite database with every migration in cf/migrations
   applied, so the SQL, the triggers and the unique key are the ones D1 runs. */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { appendChained } from '../cf/functions/api/_hash.js';
import { onRequestPost as annotate, onRequestGet as adminList } from '../cf/functions/api/admin/annotations.js';
import { onRequestGet as publicList } from '../cf/functions/api/annotations.js';
import { onRequestGet as surveyGet } from '../cf/functions/api/survey.js';
import { onRequestGet as correctionsGet, tallyFor } from '../cf/functions/api/corrections.js';
import { onRequestGet as registerGet } from '../cf/functions/api/register.js';
import { onRequestGet as integrityGet } from '../cf/functions/api/integrity.js';
import { onRequestGet as exportGet } from '../cf/functions/api/export/[kind].js';
import { onRequestGet as correctionsCsvGet } from '../cf/functions/api/export/corrections.csv.js';
import { validateAnnotation, splitTeamTests } from '../cf/functions/api/_annotations.js';

const MIG = 'cf/migrations/';
const TOKEN = 'the-admin-token';

/** A D1 binding over node:sqlite: prepare/bind/first/all/run and a transactional batch. */
function d1(db: DatabaseSync) {
  const val = (v: unknown) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
  const isRead = (sql: string) => /^\s*(SELECT|WITH)\b/i.test(sql);
  const exec = (sql: string, bound: unknown[]) => {
    const st = db.prepare(sql);
    const args = bound.map(val) as (string | number | null)[];
    if (isRead(sql)) return { results: st.all(...args), meta: { changes: 0 } };
    const r = st.run(...args);
    return { results: [], meta: { changes: Number(r.changes) } };
  };
  const prepare = (sql: string) => {
    const st = {
      sql, bound: [] as unknown[],
      bind(...a: unknown[]) { st.bound = a; return st; },
      async first() { return (exec(st.sql, st.bound).results[0] as Record<string, unknown>) ?? null; },
      async all() { return exec(st.sql, st.bound); },
      async run() { return exec(st.sql, st.bound); },
    };
    return st;
  };
  const batch = async (sts: { sql: string; bound: unknown[] }[]) => {
    db.exec('BEGIN');
    try { const out = sts.map((s) => exec(s.sql, s.bound)); db.exec('COMMIT'); return out; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  return { prepare, batch };
}

function freshDb(opts: { withAnnotations?: boolean } = {}) {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()) {
    if (f.startsWith('0007') && opts.withAnnotations === false) continue;
    db.exec(readFileSync(MIG + f, 'utf8'));
  }
  return { db, env: { DB: d1(db), ADMIN_TOKEN: TOKEN } as Record<string, unknown> };
}

const BURDENS = ['time', 'oop', 'work', 'unpaid', 'forgone'];
async function addSurvey(env: Record<string, unknown>, lead: string, at: string) {
  const ranking = [lead, ...BURDENS.filter((b) => b !== lead)];
  const record = { receivedAt: at, channel: 'direct', ranking, unasked: 'unpaid', lead, decide: 'patients', clinicians: 3, context: {}, surveyVersion: '2026-10-01.1' };
  return appendChained(env, 'survey_responses', { ranking_json: JSON.stringify(ranking), unasked: 'unpaid', lead, decide: 'patients', clinicians: 3, context_json: '{}', channel: 'direct', survey_version: '2026-10-01.1', received_at: at }, record);
}
async function addCorrection(env: Record<string, unknown>, verdict: 'right' | 'wrong', at: string, sub: string) {
  const record = { receivedAt: at, priceId: 'cms-99213', verdict, believedValueUsd: 118, priceTableVersion: 'v1' };
  return appendChained(env, 'corrections', { price_id: 'cms-99213', verdict, believed_usd: 118, table_version: 'v1', received_at: at, submitter_hash: sub }, record);
}

const post = (body: unknown, token: string | null = TOKEN) => new Request('https://x.test/api/admin/annotations', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
});
const get = (path: string) => new Request('https://x.test' + path);
const csvRows = (csv: string) => csv.split('\n').filter((l) => l && !l.startsWith('#'));
/** One CSV line -> cells, honouring quotes (the corrections file quotes labels with commas). */
const cellsOf = (line: string) => { const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
  out.push(cur); return out; };

describe('annotations: our own test rows, marked in public, never deleted', () => {
  let env: Record<string, unknown>; let db: DatabaseSync;
  let s1: { rowHash: string }, s2: { rowHash: string }, s3: { rowHash: string };
  beforeEach(async () => {
    ({ db, env } = freshDb());
    s1 = await addSurvey(env, 'time', '2026-10-01T10:00:00.000Z');
    s2 = await addSurvey(env, 'oop', '2026-10-01T11:00:00.000Z');
    s3 = await addSurvey(env, 'oop', '2026-10-01T12:00:00.000Z');
  });

  it('only the admin token can mark a row, and only a real row, once', async () => {
    expect((await annotate({ request: post({ table: 'survey', rowHash: s2.rowHash }, null), env } as never)).status).toBe(401);
    expect((await annotate({ request: post({ table: 'survey', rowHash: s2.rowHash }, 'wrong'), env } as never)).status).toBe(401);
    expect((await annotate({ request: post({ table: 'nope', rowHash: s2.rowHash }), env } as never)).status).toBe(400);
    expect((await annotate({ request: post({ table: 'survey', rowHash: 'abc' }), env } as never)).status).toBe(400);
    expect((await annotate({ request: post({ table: 'survey', rowHash: s2.rowHash, kind: 'spam' }), env } as never)).status).toBe(400);
    expect((await annotate({ request: post({ table: 'survey', rowHash: 'f'.repeat(64) }), env } as never)).status).toBe(404);
    const ok = await annotate({ request: post({ table: 'survey', rowHash: s2.rowHash, note: 'our own test' }), env } as never);
    expect(ok.status).toBe(201);
    const again = await (await annotate({ request: post({ table: 'survey_responses', rowHash: s2.rowHash }), env } as never)).json();
    expect(again.already).toBe(true);
    expect((await adminList({ request: get('/api/admin/annotations'), env } as never)).status).toBe(401);
    const list = await (await adminList({ request: new Request('https://x.test/api/admin/annotations', { headers: { authorization: `Bearer ${TOKEN}` } }), env } as never)).json();
    expect(list.n).toBe(1);
    expect(list.annotations[0]).toMatchObject({ table: 'survey_responses', rowHash: s2.rowHash, kind: 'team-test', note: 'our own test' });
  });

  it('is append-only: the database refuses to edit or delete a mark', async () => {
    await annotate({ request: post({ table: 'survey', rowHash: s2.rowHash }), env } as never);
    expect(() => db.exec("UPDATE annotations SET kind='team-test', note='x'")).toThrow(/append-only/);
    expect(() => db.exec('DELETE FROM annotations')).toThrow(/append-only/);
    expect(() => db.exec(`INSERT INTO annotations (id, table_name, row_hash, kind, at) VALUES ('z', 'survey_responses', '${s2.rowHash}', 'team-test', 'now')`)).toThrow(/UNIQUE/);
  });

  it('leaves the marked row out of /api/survey and /api/register, says how many, and refolds the cache', async () => {
    const before = await (await surveyGet({ env } as never)).json();
    expect(before.n).toBe(3);
    expect(before.teamTests).toBe(0);
    expect(before.ranking[0]).toMatchObject({ burden: 'oop' });
    await annotate({ request: post({ table: 'survey', rowHash: s2.rowHash }), env } as never);
    await annotate({ request: post({ table: 'survey', rowHash: s3.rowHash }), env } as never);
    /* the chain head did not move, but the fold must not be served stale */
    const after = await (await surveyGet({ env } as never)).json();
    expect(after.n).toBe(1);
    expect(after.teamTests).toBe(2);
    expect(after.fold.hit).toBe(false);
    expect(after.ranking[0]).toMatchObject({ burden: 'time' });
    const again = await (await surveyGet({ env } as never)).json();
    expect(again.fold.hit).toBe(true);
    expect(again.teamTests).toBe(2);
    const reg = await (await registerGet({ env } as never)).json();
    expect(reg.survey.n).toBe(1);
    expect(reg.survey.teamTests).toBe(2);
    expect(reg.gap.teamTests).toBe(0);
    const pub = await (await publicList({ env } as never)).json();
    expect(pub.n).toBe(2);
    expect(pub.annotations[0]).toEqual({ table: 'survey_responses', rowHash: s2.rowHash, kind: 'team-test', on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(JSON.stringify(pub)).not.toContain('note":');
  });

  it('keeps every row in the CSV, flags ours team_test, and the chain still verifies over every row', async () => {
    await annotate({ request: post({ table: 'survey', rowHash: s2.rowHash }), env } as never);
    const csv = await (await exportGet({ params: { kind: 'survey.csv' }, request: get('/api/export/survey.csv'), env } as never)).text();
    const [header, ...rows] = csvRows(csv);
    const cols = header.split(',');
    expect(rows).toHaveLength(3);
    const tt = cols.indexOf('team_test');
    expect(cols[cols.length - 1]).toBe('row_hash');
    expect(rows.map((r) => r.split(',')[tt])).toEqual(['false', 'true', 'false']);
    expect(rows[1].split(',').pop()).toBe(s2.rowHash);
    const integ = await (await integrityGet({ request: get('/api/integrity?verify=1'), env } as never)).json();
    const t = integ.tables.find((x: { table: string }) => x.table === 'survey_responses');
    expect(t.verified).toMatchObject({ ok: true, walked: 3 });
    expect(t.rows).toBe(3);
    expect(t.teamTestRows).toBe(1);
    expect(t.head).toBe(s3.rowHash);
  });
});

describe('annotations on corrections', () => {
  it('leaves our thumbs out of /api/corrections, the per-figure tally and the CSV counts, and keeps the rows', async () => {
    const { env } = freshDb();
    const a = await addCorrection(env, 'wrong', '2026-10-01T10:00:00.000Z', 'a'.repeat(32));
    await addCorrection(env, 'wrong', '2026-10-01T11:00:00.000Z', 'b'.repeat(32));
    await addCorrection(env, 'right', '2026-10-01T12:00:00.000Z', 'c'.repeat(32));
    expect(await tallyFor(env, 'cms-99213')).toEqual({ confirmedRight: 1, flaggedWrong: 2, n: 3 });
    await annotate({ request: post({ table: 'corrections', rowHash: a.rowHash }), env } as never);
    expect(await tallyFor(env, 'cms-99213')).toEqual({ confirmedRight: 1, flaggedWrong: 1, n: 2 });
    const agg = await (await correctionsGet({ env } as never)).json();
    expect(agg.sends).toBe(2);
    expect(agg.teamTests).toBe(1);
    expect(agg.summary[0]).toMatchObject({ priceId: 'cms-99213', confirmedRight: 1, flaggedWrong: 1 });
    const csv = await (await correctionsCsvGet({ request: get('/api/export/corrections.csv'), env } as never)).text();
    const [header, ...rows] = csvRows(csv);
    const cols = header.split(',');
    const at = (r: string, c: string) => cellsOf(r)[cols.indexOf(c)];
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => at(r, 'team_test'))).toEqual(['true', 'false', 'false']);
    expect(rows.map((r) => at(r, 'figure_responses'))).toEqual(['2', '2', '2']);
    expect(cols[cols.length - 1]).toBe('row_hash');
  });
});

describe('before migration 0007 runs', () => {
  it('every count is exactly what it was, with teamTests 0', async () => {
    const { env } = freshDb({ withAnnotations: false });
    await addSurvey(env, 'time', '2026-10-01T10:00:00.000Z');
    await addCorrection(env, 'wrong', '2026-10-01T10:00:00.000Z', 'a'.repeat(32));
    const s = await (await surveyGet({ env } as never)).json();
    expect(s).toMatchObject({ n: 1, teamTests: 0 });
    expect(await tallyFor(env, 'cms-99213')).toEqual({ confirmedRight: 0, flaggedWrong: 1, n: 1 });
    const csv = await (await exportGet({ params: { kind: 'survey.csv' }, request: get('/api/export/survey.csv'), env } as never)).text();
    expect(csvRows(csv)[1]).toContain(',false,');
  });
});

describe('pure parts', () => {
  it('validates a mark and splits rows', () => {
    expect(validateAnnotation({ table: 'gap', rowHash: 'A'.repeat(64) }).record).toEqual({ table: 'gap_reports', rowHash: 'a'.repeat(64), kind: 'team-test', note: null });
    expect(validateAnnotation({ table: 'gap', rowHash: 'a'.repeat(64), note: 'x'.repeat(201) }).error).toMatch(/200/);
    const rows = [{ rowHash: 'x' }, { rowHash: 'y' }, { rowHash: undefined }];
    expect(splitTeamTests(rows, new Set(['y']))).toEqual({ counted: [rows[0], rows[2]], teamTests: 1 });
  });
});

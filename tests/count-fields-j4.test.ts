/* JUDGE-4 #6: the open APIs used one field name for two numbers. /api/gap
   `respondents` was senders (1) while /api/register `gap.respondents` was
   reports (3); /api/survey and /api/policy `n` were senders (2) while
   /api/register `survey.n` was answers (7). Every block now carries a field
   whose name says what it counts (answers, reports, senders,
   browserFigurePairs), the old names keep their exact values as deprecated
   aliases, and lib/openapi.ts describes every one from lib/count-fields.js.

   The fixture is the staging shape the judge read: 7 survey answers from 2
   senders, 3 uncounted-care reports from 1 sender, and corrections where one
   browser corrected two figures. It runs against a real SQLite database with
   every migration applied, through the real GET handlers. */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { appendChained, submitterHash } from '../cf/functions/api/_hash.js';
import { onRequestGet as surveyGet } from '../cf/functions/api/survey.js';
import { onRequestGet as gapGet } from '../cf/functions/api/gap.js';
import { onRequestGet as correctionsGet } from '../cf/functions/api/corrections.js';
import { onRequestGet as registerGet } from '../cf/functions/api/register.js';
import { onRequestGet as policyGet } from '../cf/functions/api/policy.js';
import { onRequestGet as interviewGet } from '../cf/functions/api/interview.js';
import { channelAggregate } from '../cf/functions/api/survey/channel.js';
import { surveyRows } from '../cf/functions/api/survey.js';
import { OPENAPI } from '../lib/openapi';
import { COUNT_FIELD, DEPRECATED_ALIAS, COUNT_FIELD_MAP } from '../lib/count-fields.js';
import { dictionary } from '../lib/survey';

const MIG = 'cf/migrations/';

/** A D1 binding over node:sqlite (the same harness as tests/annotations.test.ts). */
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

/** KV with the sender counters as _senders.js keeps them. */
function kv(init: Record<string, string>) {
  const m = new Map(Object.entries(init));
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); } };
}

const BURDENS = ['time', 'oop', 'work', 'unpaid', 'forgone'];
const at = (i: number) => `2026-10-01T1${i % 10}:00:00.000Z`;

let env: Record<string, unknown>;
const body = async (r: Response) => r.json();

beforeAll(async () => {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(MIG + f, 'utf8'));
  /* 2 survey senders, 1 gap sender, 1 interview sender, as the counters hold them */
  env = { DB: d1(db), LEDGER: kv({ 'snd:survey:people': '2', 'snd:gap:people': '1', 'snd:interview:people': '1' }) };
  for (let i = 0; i < 7; i++) {
    const lead = BURDENS[i % 5];
    const ranking = [lead, ...BURDENS.filter((b) => b !== lead)];
    await appendChained(env, 'survey_responses', { ranking_json: JSON.stringify(ranking), unasked: 'unpaid', lead, decide: 'patients', clinicians: 3, context_json: '{}', channel: 'direct', survey_version: '2026-10-01.1', received_at: at(i) },
      { receivedAt: at(i), channel: 'direct', ranking, unasked: 'unpaid', lead, decide: 'patients', clinicians: 3, context: {}, surveyVersion: '2026-10-01.1' });
  }
  for (let i = 0; i < 3; i++) {
    const r = { counts: { dismissed: i + 1 }, ranking: ['dismissed'], receivedAt: at(i), tableVersion: 'v1' };
    await appendChained(env, 'gap_reports', { counts_json: JSON.stringify(r.counts), ranking_json: JSON.stringify(r.ranking), note: null, context_json: null, table_version: 'v1', received_at: r.receivedAt }, r);
  }
  /* browser A corrects two figures, browser B one: 3 corrections, 3 browser-and-figure keys, 2 browsers */
  const rows = [['A', 'cms-99213'], ['A', 'cms-99214'], ['B', 'cms-99213']] as const;
  for (const [i, [who, priceId]] of rows.entries()) {
    const sub = await submitterHash(who, priceId, 'v1', '');
    const record = { receivedAt: at(i), priceId, verdict: 'wrong', believedValueUsd: null, priceTableVersion: 'v1' };
    await appendChained(env, 'corrections', { price_id: priceId, verdict: 'wrong', believed_usd: null, table_version: 'v1', received_at: at(i), submitter_hash: sub }, record);
  }
});

describe('JUDGE-4 #6: the named count fields, against the fixture', () => {
  it('/api/survey: answers 7, senders 2; n is answers (JUDGE-5 #7: it was senders here)', async () => {
    const s = await body(await surveyGet({ env } as never));
    expect([s.answers, s.senders, s.submissions, s.senderBasis]).toEqual([7, 2, 7, 'senders']);
    expect(s.n).toBe(7);
  });
  it('/api/gap: reports 3, senders 1; respondents is reports (JUDGE-5 #7: it was senders here)', async () => {
    const g = await body(await gapGet({ env } as never));
    expect([g.reports, g.senders, g.submissions, g.senderBasis]).toEqual([3, 1, 3, 'senders']);
    expect(g.respondents).toBe(3);
  });
  it('/api/corrections: sends 3, browserFigurePairs 3 (one browser on two figures is two); senders stays the same value', async () => {
    const c = await body(await correctionsGet({ env } as never));
    expect([c.sends, c.browserFigurePairs, c.figures]).toEqual([3, 3, 2]);
    expect(c.senders).toBe(c.browserFigurePairs);
  });
  it('/api/register: the same named numbers; survey.n stays answers and gap.respondents stays reports', async () => {
    const r = await body(await registerGet({ env } as never));
    expect([r.survey.answers, r.survey.senders, r.survey.submissions]).toEqual([7, 2, 7]);
    expect(r.survey.n).toBe(7);
    expect([r.gap.reports, r.gap.senders, r.gap.submissions]).toEqual([3, 1, 3]);
    expect(r.gap.respondents).toBe(3);
    expect([r.corrections.sends, r.corrections.browserFigurePairs, r.corrections.senders]).toEqual([3, 3, 3]);
    expect([r.interviews.n, r.interviews.senders]).toEqual([0, 0]);
  });
  /* /api/policy is another lane's this round: its n and respondents are still senders. */
  it('/api/policy: the same named numbers; uncounted n and respondents are answers and reports, as everywhere (JUDGE-5 #7)', async () => {
    const p = await body(await policyGet({ env } as never));
    const { survey, gap } = p.uncounted;
    expect([survey.answers, survey.senders, survey.submissions, survey.n]).toEqual([7, 2, 7, 7]);
    expect([gap.reports, gap.senders, gap.submissions, gap.respondents]).toEqual([3, 1, 3, 3]);
    expect([p.disputes.sends, p.disputes.browserFigurePairs, p.disputes.senders]).toEqual([3, 3, 3]);
  });
  it('one named field is one number on every endpoint', async () => {
    const [s, g, c, r, p] = await Promise.all([surveyGet({ env } as never), gapGet({ env } as never), correctionsGet({ env } as never), registerGet({ env } as never), policyGet({ env } as never)].map((x) => x.then(body)));
    expect(new Set([s.answers, r.survey.answers, p.uncounted.survey.answers]).size).toBe(1);
    expect(new Set([s.senders, r.survey.senders, p.uncounted.survey.senders]).size).toBe(1);
    expect(new Set([g.reports, r.gap.reports, p.uncounted.gap.reports]).size).toBe(1);
    expect(new Set([g.senders, r.gap.senders, p.uncounted.gap.senders]).size).toBe(1);
    expect(new Set([c.browserFigurePairs, r.corrections.browserFigurePairs, p.disputes.browserFigurePairs]).size).toBe(1);
  });
  it('/api/interview carries senders under the same definition', async () => {
    const iv = await body(await interviewGet({ env } as never));
    expect(iv.n).toBe(0);
    expect(iv.senders).toBe(0);
  });
  it('/api/survey/channel: answers is the count, n keeps the same value', async () => {
    const rows = await surveyRows(env);
    expect(channelAggregate('direct', [], 11)).toMatchObject({ answers: 0, n: 0 });
    expect(channelAggregate('direct', rows, 11)).toMatchObject({ answers: null, n: null, withheld: true });
    expect(channelAggregate('direct', rows, 3)).toMatchObject({ answers: 7, n: 7, withheld: false });
  });
});

/* -------------------------------------------------- the published descriptions */
type Schema = { properties?: Record<string, Schema>; description?: string; deprecated?: boolean };
const resp = (path: string) => (OPENAPI.paths[path].get!.responses['200'] as { content: { 'application/json': { schema: Schema } } }).content['application/json'].schema;
const prop = (path: string, dotted: string) => dotted.split('.').reduce<Schema | undefined>((s, k) => s?.properties?.[k], resp(path));

describe('JUDGE-4 #6: every count field is described in the OpenAPI document', () => {
  it('each field in the map is there, with exactly its definition, and every alias is deprecated', () => {
    for (const row of COUNT_FIELD_MAP) {
      const p = prop(row.endpoint, row.field);
      expect(p, `${row.endpoint} ${row.field}`).toBeDefined();
      expect(p!.description, `${row.endpoint} ${row.field}`).toBe(row.note);
      expect(!!p!.deprecated, `${row.endpoint} ${row.field}`).toBe(row.counts === 'deprecated');
    }
  });
  it('each alias says which named field to read, and what it holds on the other endpoints', () => {
    expect(prop('/api/gap', 'respondents')!.description).toBe(DEPRECATED_ALIAS.respondentsIsReports);
    expect(prop('/api/register', 'gap.respondents')!.description).toBe(DEPRECATED_ALIAS.respondentsIsReports);
    expect(prop('/api/survey', 'n')!.description).toBe(DEPRECATED_ALIAS.nIsAnswers);
    expect(prop('/api/register', 'survey.n')!.description).toBe(DEPRECATED_ALIAS.nIsAnswers);
    expect(prop('/api/policy', 'uncounted.survey.n')!.description).toBe(DEPRECATED_ALIAS.nIsAnswers);
    expect(prop('/api/policy', 'uncounted.gap.respondents')!.description).toBe(DEPRECATED_ALIAS.respondentsIsReports);
    for (const d of Object.values(DEPRECATED_ALIAS)) expect(d).toMatch(/^Deprecated/);
  });
  it('the definitions say what is counted, in the words the pages use', () => {
    expect(COUNT_FIELD.senders).toContain('one network on one day, counted once, never a verified person');
    expect(COUNT_FIELD.browserFigurePairs).toContain('It is not a count of senders.');
    expect(COUNT_FIELD.answers).toMatch(/^Survey answers received/);
    expect(COUNT_FIELD.reports).toMatch(/^Uncounted-care reports received/);
    for (const t of [...Object.values(COUNT_FIELD), ...Object.values(DEPRECATED_ALIAS)]) {
      expect(t).not.toMatch(/\u2014|\bpeople\b/);
    }
  });
  it('the data dictionary carries every row of the map', () => {
    const dict = dictionary();
    for (const row of COUNT_FIELD_MAP) {
      const d = dict.find((x) => x.file === row.endpoint && x.field === row.field);
      expect(d, `${row.endpoint} ${row.field}`).toBeDefined();
      expect(d!.note).toBe(row.note);
      expect(d!.type.includes('deprecated')).toBe(row.counts === 'deprecated');
    }
  });
});

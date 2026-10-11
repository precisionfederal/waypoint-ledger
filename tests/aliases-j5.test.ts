/* JUDGE-5 #7: the deprecated API aliases contradicted the new fields: /api/survey
   n:2 against /api/register survey.n:7, /api/gap respondents:1 against
   register gap.respondents:3, and corrections senders (browser-and-figure
   keys) under the name the survey uses for network-day senders. Every old name
   now equals, on every endpoint, the one named field it aliases, and every
   payload names that field in its `deprecated` map. One fixture, every
   endpoint: the same quantity is the same number everywhere, /api/policy
   included (its uncounted.survey, uncounted.gap and disputes blocks). */
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
import { ALIASES } from '../lib/count-fields.js';

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


const get = async () => {
  const [survey, gap, corrections, register, policy, interview] = await Promise.all(
    [surveyGet, gapGet, correctionsGet, registerGet, policyGet, interviewGet].map((f) => f({ env } as never).then(body)));
  const channel = channelAggregate('direct', await surveyRows(env), 3);
  return { survey, gap, corrections, register, policy, interview, channel };
};

describe('JUDGE-5 #7: one quantity, one number, on every endpoint', () => {
  it('every alias equals the named field its payload says it aliases', async () => {
    const e = await get();
    const blocks: [string, Record<string, unknown>, Record<string, string>][] = [
      ['/api/survey', e.survey, ALIASES.survey], ['/api/gap', e.gap, ALIASES.gap], ['/api/corrections', e.corrections, ALIASES.corrections],
      ['/api/register survey', e.register.survey, ALIASES.survey], ['/api/register gap', e.register.gap, ALIASES.gap],
      ['/api/register corrections', e.register.corrections, ALIASES.corrections], ['/api/survey/channel', e.channel, ALIASES.channel],
      ['/api/policy uncounted.survey', e.policy.uncounted.survey, ALIASES.survey], ['/api/policy uncounted.gap', e.policy.uncounted.gap, ALIASES.gap],
      ['/api/policy disputes', e.policy.disputes, ALIASES.corrections],
    ];
    for (const [where, b, want] of blocks) {
      expect(b.deprecated, where).toEqual(want);
      for (const [alias, field] of Object.entries(want)) {
        expect(b[field], `${where} ${field}`).toEqual(expect.any(Number));
        expect(b[alias], `${where} ${alias} = ${field}`).toBe(b[field]);
      }
    }
  });
  it('answers, n, reports, respondents, senders and browserFigurePairs are each one number everywhere they appear', async () => {
    const e = await get();
    const S = e.policy.uncounted.survey, G = e.policy.uncounted.gap, D = e.policy.disputes;
    const same = (label: string, xs: unknown[], want: number) => { for (const x of xs) expect(x, label).toBe(want); };
    same('answers', [e.survey.answers, e.survey.n, e.register.survey.answers, e.register.survey.n, e.channel.answers, e.channel.n, S.answers, S.n], 7);
    same('survey senders', [e.survey.senders, e.register.survey.senders, S.senders], 2);
    same('reports', [e.gap.reports, e.gap.respondents, e.register.gap.reports, e.register.gap.respondents, G.reports, G.respondents], 3);
    same('gap senders', [e.gap.senders, e.register.gap.senders, G.senders], 1);
    same('browserFigurePairs', [e.corrections.browserFigurePairs, e.corrections.senders, e.register.corrections.browserFigurePairs, e.register.corrections.senders, D.browserFigurePairs, D.senders], 3);
    same('corrections', [e.corrections.sends, e.register.corrections.sends, D.sends], 3);
    same('interviews', [e.interview.n, e.register.interviews.n], 0);
  });
});

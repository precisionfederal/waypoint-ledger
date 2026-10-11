/* FINAL-1011 honest lane: our own test rows are marked, left out of every
   displayed number, and SAID beside the count; the stale and inconsistent lines
   judge row 7 named are gone. Item 1 runs against a real SQLite database with
   every migration applied (the same harness as tests/annotations.test.ts). */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { appendChained } from '../cf/functions/api/_hash.js';
import { onRequestPost as annotate } from '../cf/functions/api/admin/annotations.js';
import { onRequestGet as surveyGet, withSendersCounted, TEAM_TEST_DENOMINATOR } from '../cf/functions/api/survey.js';
import { onRequestGet as correctionsGet, tallyFor } from '../cf/functions/api/corrections.js';
import { onRequestGet as registerGet } from '../cf/functions/api/register.js';
import { DENOMINATOR } from '../cf/functions/api/_senders.js';
import { forgoneRank, forgoneRankSentence } from '../lib/forgone';
import { rankLine } from '../components/CareGoneWithout';
import { teamTestsPhrase } from '../lib/team-tests';
import { parseJourney, unpricedByName } from '../lib/mapper';
import { SELECTABLE, TABLE } from '../lib/table';
import { priceJourney } from '../lib/pricing';
import { shareCardData } from '../components/JourneyBuilder';
import Ledger from '../components/Ledger';
import { demoEntries, fakeStore, renderWith } from './helpers/ledger-render';

const MIG = 'cf/migrations/';
const TOKEN = 'the-admin-token';

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

/** A KV whose sender index says 13 distinct networks sent a survey: more than
 *  the answers left once ours are marked, which is exactly the leak. */
function kv(seed: Record<string, string>) {
  const m = new Map(Object.entries(seed));
  return { async get(k: string) { return m.has(k) ? m.get(k)! : null; }, async put(k: string, v: string) { m.set(k, v); } };
}

function freshDb() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(MIG + f, 'utf8'));
  return { db, env: { DB: d1(db), ADMIN_TOKEN: TOKEN, LEDGER: kv({ 'snd:survey:people': '13' }) } as Record<string, unknown> };
}

const BURDENS = ['time', 'oop', 'work', 'unpaid', 'forgone'];
async function addSurvey(env: Record<string, unknown>, lead: string, at: string, channel = 'advocate') {
  const ranking = [lead, ...BURDENS.filter((b) => b !== lead)];
  const record = { receivedAt: at, channel, ranking, unasked: 'unpaid', lead, decide: 'patients', clinicians: 3, context: {}, surveyVersion: '2026-10-01.1' };
  return appendChained(env, 'survey_responses', { ranking_json: JSON.stringify(ranking), unasked: 'unpaid', lead, decide: 'patients', clinicians: 3, context_json: '{}', channel, survey_version: '2026-10-01.1', received_at: at }, record);
}
async function addCorrection(env: Record<string, unknown>, priceId: string, verdict: 'right' | 'wrong', at: string, sub: string) {
  const record = { receivedAt: at, priceId, verdict, believedValueUsd: verdict === 'wrong' ? 185 : null, priceTableVersion: 'v1' };
  return appendChained(env, 'corrections', { price_id: priceId, verdict, believed_usd: verdict === 'wrong' ? 185 : null, table_version: 'v1', received_at: at, submitter_hash: sub }, record);
}
const mark = (env: Record<string, unknown>, table: string, rowHash: string) => annotate({
  request: new Request('https://x.test/api/admin/annotations', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ table, rowHash }) }),
  env,
} as never);

describe('item 1: every displayed number leaves our marked rows out, and says so', () => {
  it('survey ranking, headline, senders, register block and the ledger sentence', async () => {
    const { env } = freshDb();
    for (let i = 0; i < 11; i++) await addSurvey(env, 'forgone', `2026-09-${String(10 + i).padStart(2, '0')}T10:00:00.000Z`);
    const ours = [await addSurvey(env, 'oop', '2026-10-01T02:00:00.000Z', 'direct'), await addSurvey(env, 'oop', '2026-10-01T02:01:00.000Z', 'direct')];

    const before = await (await surveyGet({ env } as never)).json();
    expect(before.answers).toBe(13);
    expect(before.senderBasis).toBe('senders');
    expect(before.senders).toBe(13);
    expect(before.denominator).toBe(DENOMINATOR);

    for (const r of ours) expect((await mark(env, 'survey', r.rowHash)).status).toBe(201);

    const s = await (await surveyGet({ env } as never)).json();
    expect(s.answers).toBe(11);
    expect(s.teamTests).toBe(2);
    expect(s.headline.n).toBe(11);
    expect(s.channels).toEqual({ advocate: 11 });
    expect(s.ranking.find((r: { burden: string }) => r.burden === 'forgone').rankedFirstBy).toBe(11);
    expect(s.ranking.find((r: { burden: string }) => r.burden === 'oop').rankedFirstBy).toBe(0);
    /* The leak this lane closed: the network counter still holds 13, and it
       cannot drop ours. No sender count is claimed while rows are marked. */
    expect(s.senderBasis).toBe('sends');
    expect(s.senders).toBe(11);
    expect(s.denominator).toBe(TEAM_TEST_DENOMINATOR);

    const reg = await (await registerGet({ env } as never)).json();
    expect(reg.survey).toMatchObject({ n: 11, answers: 11, teamTests: 2, senderBasis: 'sends', senders: 11 });

    /* The ledger's "X of Y" sentence, from the same payload CareGoneWithout reads. */
    const rank = forgoneRank(s)!;
    expect(rank).toMatchObject({ first: 11, answers: 11, top: true });
    expect(rankLine(rank, s.teamTests)).toBe('11 of 11 survey answers ranked it heaviest of the five burdens (plus 2 of our own tests, marked and not counted).');
  });

  it('corrections summary, the per-figure tally and the register thumbs tile', async () => {
    const { env } = freshDb();
    const alpha = await addCorrection(env, 'cms-99213', 'wrong', '2026-09-10T15:25:26.848Z', 'a'.repeat(32));
    const t1 = await addCorrection(env, 'cms-99213', 'right', '2026-10-01T02:34:03.303Z', 'b'.repeat(32));
    await addCorrection(env, 'cms-img-echo', 'wrong', '2026-10-01T08:49:12.622Z', 'c'.repeat(32));
    await mark(env, 'corrections', alpha.rowHash);
    await mark(env, 'corrections', t1.rowHash);
    const c = await (await correctionsGet({ env } as never)).json();
    expect(c).toMatchObject({ sends: 1, figures: 1, teamTests: 2 });
    expect(c.summary).toEqual([expect.objectContaining({ priceId: 'cms-img-echo', confirmedRight: 0, flaggedWrong: 1 })]);
    expect(await tallyFor(env, 'cms-99213')).toEqual({ confirmedRight: 0, flaggedWrong: 0, n: 0 });
    const reg = await (await registerGet({ env } as never)).json();
    expect(reg.corrections.teamTests).toBe(2);
    expect(reg.corrections.summary.reduce((a: number, r: { confirmedRight: number; flaggedWrong: number }) => a + r.confirmedRight + r.flaggedWrong, 0)).toBe(1);
  });

  it('with nothing marked, the sender count is exactly what it was', () => {
    const agg = { n: 4, teamTests: 0 };
    expect(withSendersCounted(agg, { key: 'senders', people: 3, submissions: 4, noun: 'answers' })).toMatchObject({ senders: 3, senderBasis: 'senders', denominator: DENOMINATOR });
  });

  it('one wording beside every count, and none when nothing is marked', () => {
    expect(teamTestsPhrase(5)).toBe('plus 5 of our own tests, marked');
    expect(teamTestsPhrase(1)).toBe('plus 1 of our own test, marked');
    expect(teamTestsPhrase(0)).toBeNull();
    expect(teamTestsPhrase(undefined)).toBeNull();
    expect(rankLine({ first: 11, answers: 12, top: true }, 0)).toBe(forgoneRankSentence({ first: 11, answers: 12, top: true }));
    expect(rankLine({ first: 11, answers: 12, top: true }, 0)).toBe('11 of 12 survey answers ranked it heaviest of the five burdens.');
    /* the journey map loads lib/forgone.ts; the phrase never rides along with it */
    expect(readFileSync('lib/forgone.ts', 'utf8')).not.toContain('team-tests');
  });

  it('the register prints the phrase on all four tiles and the ranking chip, never on the sample', () => {
    const src = readFileSync('components/Register.tsx', 'utf8');
    for (const k of ['survey', 'interviews', 'corrections', 'gap']) expect(src).toContain(`marked={ours('${k}')}`);
    expect(src).toContain("const ours = (k: 'survey' | 'interviews' | 'corrections' | 'gap') => (sample ? null : teamTestsPhrase(d?.[k]?.teamTests));");
    expect(src).toContain("${ours('survey') ? ` · ${ours('survey')}` : ''}");
    /* both Stat branches (a counted card and a zero card) carry it */
    expect(src.match(/\{ours\}/g)?.length).toBe(2);
    /* a sender count only when the server says it is one */
    expect(src).toContain("(sv.senderBasis === undefined || sv.senderBasis === 'senders')");
  });

  it('the share card reads no register count at all, so it can carry none of ours', () => {
    const src = readFileSync('components/ShareCard.tsx', 'utf8');
    expect(src).not.toMatch(/fetch\(|\/api\//);
  });
});

describe('item 3: judge row 7', () => {
  const method = readFileSync('app/method/page.tsx', 'utf8');
  it('(a) no stale /method sentence', () => {
    for (const stale of ['no Lyme condition yet', 'Long COVID is the only one', 'does not yet', 'Lyme&rsquo;s CDC-led study', 'no published\n            federal figure covers a year of it']) expect(method).not.toContain(stale);
    expect(method).toContain('Lyme disease is listed with its ICD-10-CM code');
    /* the written interview asks who is answering now, so it is not "not built" */
    expect(readFileSync('components/InterviewForm.tsx', 'utf8')).toContain('Who is answering?');
  });

  it('(b) the home sample prices "my regular doctor" as the ledger does: 99213, low complexity, $95.19', () => {
    const page = readFileSync('app/page.tsx', 'utf8');
    expect(page).toContain("{ said: 'my regular doctor, six times', id: 'cms-99213', n: 6 }");
    const seg = parseJourney('saw my regular doctor six times', SELECTABLE).filter((x) => !x.absorbed)[0];
    expect(seg.result.item?.id).toBe('cms-99213');
    const row = TABLE.find((t) => t.id === 'cms-99213')!;
    expect(row.valueUsd).toBe(95.19);
    expect(row.label).toMatch(/low complexity/);
  });

  it('(c) the share card counts what the ledger counts, and says no "$0"', () => {
    const entries = demoEntries();
    const card = shareCardData(priceJourney(entries), entries.length, 0);
    const html = renderWith(Ledger, fakeStore(entries));
    const visits = Number((html.match(/(\d+) visits and tests/) ?? [])[1]);
    expect(visits).toBeGreaterThan(0);
    expect(card.stepCount).toBe(visits);
    const src = readFileSync('components/ShareCard.tsx', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('$0');
  });

  it('(d) the Brief says the nerve test is unpriced by name, with its reason', () => {
    const segs = parseJourney('then they put electrodes on my legs and shocked the nerves', SELECTABLE).filter((x) => !x.absorbed);
    const nerves = segs.find((s) => /shocked the nerves/.test(s.raw))!;
    expect(nerves.result.item).toBeNull();
    expect(unpricedByName(nerves.result.reason)).toBe(true);
    const ledger = readFileSync('components/Ledger.tsx', 'utf8');
    expect(ledger).toContain('`UNPRICED UNTIL ONE DETAIL IS SAID: ${why}`');
    expect(ledger).not.toMatch(/NO FEDERAL FIGURE EXISTS/i);
  });

  it('(e) "For agencies" is in the top nav, and once in the phone menu', () => {
    const shell = readFileSync('components/Shell.tsx', 'utf8');
    expect(shell).toContain("{ href: '/policy', label: 'For agencies' },");
    expect(shell).toContain("{ href: '/policy', label: 'Policy brief for agencies', footerOnly: true },");
  });
});

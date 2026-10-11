/* ==========================================================================
   PEDIATRIC ONSET AND THE CAREGIVER PATH — instrument version 2026-10-01.1.

   A patient advocate who fell ill at eleven wrote on 12 September 2026 that
   the questions "skew towards 'adults working at the time of illness/
   diagnosis'" and asked for wording that covers pediatric patients so that
   caregiver cost is carried. These tests pin what was built in answer:

   1. The instrument asks who is answering and when it began, with bands below 18.
   2. A caregiver answering for a child sees the same five burdens with the
      same ids, so every answer stays comparable.
   3. The new fields are accepted only on the version that asks them, and are
      chained from that version on; every earlier row walks exactly as it was
      written.
   4. The ranking is read by stratum, suppressed under the small-cell rule, and
      the pooled ranking is computed exactly as before.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateSurvey, aggregateSurvey, rankingByStratum, rankOf, ONSET_FROM } from '../cf/functions/api/survey.js';
import { PUBLISHED, SURVEY_PROJECTIONS, surveyCtxKeysFor, rowHash, verifyChain, GENESIS } from '../cf/functions/api/_hash.js';
import {
  BURDENS, BURDENS_FOR_CHILD, QUESTIONS, QUESTIONS_FOR_CHILD, CONTEXT, CONTEXT_KEYS, SURVEY_VERSION, SMALL_CELL_MIN,
  RESPONDENT_SELF, RESPONDENT_CHILD, ONSET_BANDS, ONSET_CHILD_BANDS, NOT_DIAGNOSED, ONSET_KEYS, STRATA,
  burdensFor, questionsFor, stratumOf,
} from '../lib/survey-def.js';

type Rec = { ranking: string[]; unasked: string; lead: string; decide: string; clinicians: number | null; context?: Record<string, string>; channel: string; surveyVersion: string; receivedAt: string };
const rec = (b: unknown): Rec => {
  const v = validateSurvey(b) as { error?: string; record?: Rec };
  if (!v.record) throw new Error(`refused: ${v.error}`);
  return v.record;
};
const BASE = { ranking: ['forgone', 'oop', 'time', 'unpaid', 'work'], unasked: 'forgone', lead: 'forgone', decide: 'patients', clinicians: 9 };

describe('the instrument asks who is answering and when it began', () => {
  it('is version 2026-10-01.1, and the new projection starts there', () => {
    expect(SURVEY_VERSION).toBe('2026-10-01.1');
    expect(ONSET_FROM).toBe(SURVEY_VERSION);
    expect(SURVEY_PROJECTIONS[0].from).toBe(SURVEY_VERSION);
  });
  it('offers onset bands below 18, and diagnosis may be "not yet"', () => {
    expect(ONSET_CHILD_BANDS).toEqual(['Under 5', '5–12', '13–17']);
    expect(CONTEXT.onset_age.options.slice(0, 3)).toEqual(ONSET_CHILD_BANDS);
    expect(CONTEXT.onset_age.options).toEqual(ONSET_BANDS);
    expect(CONTEXT.diagnosis_age.options).toContain(NOT_DIAGNOSED);
    expect(CONTEXT.respondent.options).toEqual([RESPONDENT_SELF, RESPONDENT_CHILD]);
  });
  it('appends the three fields, so every earlier CSV column keeps its place', () => {
    expect(CONTEXT_KEYS.slice(0, 6)).toEqual(['age', 'sex', 'insurance', 'region', 'state', 'stage']);
    expect(CONTEXT_KEYS.slice(6)).toEqual(ONSET_KEYS);
  });
});

describe('the caregiver path is worded for the family and changes no id', () => {
  it('keeps the five ids, in the same order', () => {
    expect(BURDENS_FOR_CHILD.map((b) => b.id)).toEqual(BURDENS.map((b) => b.id));
    expect(burdensFor(RESPONDENT_CHILD)).toBe(BURDENS_FOR_CHILD);
    expect(burdensFor(RESPONDENT_SELF)).toBe(BURDENS);
    expect(burdensFor(undefined)).toBe(BURDENS);
  });
  it('carries the caregiver cost in the words themselves', () => {
    const w = BURDENS_FOR_CHILD.find((b) => b.id === 'work')!.label;
    const u = BURDENS_FOR_CHILD.find((b) => b.id === 'unpaid')!.label;
    expect(w).toMatch(/caregiver/i);
    expect(u).toMatch(/you and the family/i);
    expect(QUESTIONS_FOR_CHILD.rank).toMatch(/not only the child/);
    expect(QUESTIONS_FOR_CHILD.clinicians).toMatch(/the child see/);
    expect(questionsFor(RESPONDENT_CHILD)).toBe(QUESTIONS_FOR_CHILD);
    expect(questionsFor(undefined)).toBe(QUESTIONS);
  });
  it('the form renders the caregiver wording and asks the onset question on its face', () => {
    const form = readFileSync('components/SurveyForm.tsx', 'utf8');
    expect(form).toContain('burdensFor(context.respondent)');
    expect(form).toContain('questionsFor(context.respondent)');
    expect(form).toContain('data-testid="respondent"');
    expect(form).toContain('data-testid="onset"');
  });
});

describe('the new fields are accepted only on the version that asks them', () => {
  const ctx = { age: '30–44', respondent: RESPONDENT_CHILD, onset_age: '5–12', diagnosis_age: '13–17' };
  it('keeps them on 2026-10-01.1', () => {
    const r = rec({ ...BASE, context: ctx, surveyVersion: SURVEY_VERSION });
    expect(r.context).toEqual(ctx);
  });
  it('drops them from a row that states an older instrument, and keeps the rest', () => {
    const r = rec({ ...BASE, context: ctx, surveyVersion: '2026-09-09.3' });
    expect(r.context).toEqual({ age: '30–44' });
  });
  it('refuses a value outside the published options', () => {
    const r = rec({ ...BASE, context: { onset_age: '11', respondent: 'my mum' }, surveyVersion: SURVEY_VERSION });
    expect(r.context).toBeUndefined();
  });
  it('a response that states no version is recorded under the running one', () => {
    const r = rec({ ...BASE, context: { onset_age: 'Under 5' } });
    expect(r.surveyVersion).toBe(SURVEY_VERSION);
    expect(r.context).toEqual({ onset_age: 'Under 5' });
  });
});

describe('the chain covers the new fields from 2026-10-01.1, and every earlier row walks as written', () => {
  it('the new version chains all nine fields', () => {
    expect(surveyCtxKeysFor(SURVEY_VERSION)).toEqual([...CONTEXT_KEYS]);
  });
  it('a 2026-09-09.3 row is projected over exactly the six fields it was hashed over', () => {
    expect(surveyCtxKeysFor('2026-09-09.3')).toEqual(['age', 'sex', 'insurance', 'region', 'state', 'stage']);
    const old = { receivedAt: '2026-09-14T20:21:00.125Z', channel: 'advocate', ranking: BASE.ranking, unasked: 'forgone', lead: 'forgone', decide: 'patients', clinicians: 7, context: { age: '45–64', sex: 'Female' }, surveyVersion: '2026-09-09.3' };
    const f = PUBLISHED.survey_responses(old) as unknown as { context: Record<string, unknown> };
    expect(Object.keys(f.context)).toEqual(['age', 'sex', 'insurance', 'region', 'state', 'stage']);
  });
  it('a chain of old and new rows verifies end to end', async () => {
    const rows: Record<string, unknown>[] = [];
    let prev = GENESIS;
    const records = [
      { receivedAt: '2026-09-09T22:21:43.872Z', channel: 'advocate', ranking: BASE.ranking, unasked: 'forgone', lead: 'forgone', decide: 'patients', clinicians: 5, context: { sex: 'Female' }, surveyVersion: '2026-09-09.3' },
      { receivedAt: '2026-10-02T10:00:00.000Z', channel: 'direct', ranking: BASE.ranking, unasked: 'forgone', lead: 'forgone', decide: 'patients', clinicians: 4, context: { respondent: RESPONDENT_CHILD, onset_age: '5–12' }, surveyVersion: SURVEY_VERSION },
    ];
    for (const r of records) {
      const h = await rowHash(prev, PUBLISHED.survey_responses(r));
      rows.push({ ...r, prevHash: prev, rowHash: h });
      prev = h;
    }
    const res = await verifyChain('survey_responses', rows);
    expect(res.ok).toBe(true);
    // An edit to a new field after the fact is caught.
    (rows[1].context as Record<string, string>).onset_age = '30–44';
    expect((await verifyChain('survey_responses', rows)).ok).toBe(false);
  });
});

describe('the ranking is read by stratum, and the pooled ranking is unchanged', () => {
  const row = (ctx: Record<string, string> | undefined, first = 'forgone') => ({
    ...BASE, ranking: [first, ...BASE.ranking.filter((b) => b !== first)], context: ctx, channel: 'direct', surveyVersion: SURVEY_VERSION, receivedAt: '2026-10-02T00:00:00Z',
  });
  it('sorts each row into exactly one stratum; a row with no onset is never assumed adult', () => {
    expect(stratumOf({ respondent: RESPONDENT_CHILD, onset_age: '30–44' })).toBe('caregiver-child');
    expect(stratumOf({ onset_age: '13–17' })).toBe('pediatric-onset');
    expect(stratumOf({ onset_age: '18–29' })).toBe('adult-onset');
    expect(stratumOf({ age: '30–44' })).toBe('onset-not-stated');
    expect(stratumOf(undefined)).toBe('onset-not-stated');
    expect(STRATA.map((s) => s.id)).toEqual(['caregiver-child', 'pediatric-onset', 'adult-onset', 'onset-not-stated']);
  });
  it('withholds a stratum under the small-cell rule, and counts what it withheld', () => {
    const rows = [...Array(SMALL_CELL_MIN).fill(0).map(() => row({ onset_age: '30–44' })), row({ onset_age: '5–12' }, 'time'), row({ respondent: RESPONDENT_CHILD }, 'unpaid')];
    const s = rankingByStratum(rows);
    expect(s.groups.map((g: { stratum: string }) => g.stratum)).toEqual(['adult-onset']);
    expect(s.withheldGroups).toBe(2);
    expect(s.withheldResponses).toBe(2);
    // 2026-10-01: a stratum's COUNT is under the rule too; only "not stated" is always served.
    expect(s.counts).toEqual({ 'adult-onset': SMALL_CELL_MIN, 'onset-not-stated': 0 });
    expect(JSON.stringify(s)).not.toContain('caregiver-child');
  });
  it('the headline ranking is the same function over the answers about the person\'s own illness (flow3-4)', () => {
    /* Until FLOW3 this pinned a pooled ranking over every row, a parent's answer
       for a child included. The headline now leaves the child's answers to
       rankingByStratum, as the thank-you page promises. */
    const rows = [row({ onset_age: '5–12' }), row(undefined, 'time'), row({ respondent: RESPONDENT_CHILD }, 'oop')];
    const a = aggregateSurvey(rows) as { ranking: unknown; rankingByStratum: unknown; headline: { n: number } };
    expect(a.ranking).toEqual(rankOf(rows.slice(0, 2)));
    expect(a.headline.n).toBe(2);
    expect(a.rankingByStratum).toBeTruthy();
  });
});

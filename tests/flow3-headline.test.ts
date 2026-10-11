/* FLOW3 flow3-4: a parent's answer about a child never reshapes the headline. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { aggregateSurvey, rankOf, HEADLINE_OF } from '../cf/functions/api/survey.js';
import { RESPONDENT_CHILD, SMALL_CELL_MIN } from '../lib/survey-def.js';

const BURDENS = ['forgone', 'time', 'oop', 'unpaid', 'dismissed'];
const row = (ctx: Record<string, string> | undefined, first: string, extra: Record<string, unknown> = {}) => ({
  ranking: [first, ...BURDENS.filter((b) => b !== first)],
  unasked: 'time', lead: 'oop', decide: 'clinician', clinicians: 3, context: ctx, receivedAt: '2026-10-01T05:00:00.000Z', ...extra,
});

describe('flow3-4 the headline is about the person\'s own illness', () => {
  // The audit's walk: answers about the person's own illness, then one parent for a child with 9 clinicians and out-of-pocket first.
  const adults = [row({ onset_age: '30–44' }, 'forgone', { clinicians: 5 }), row({ onset_age: '18–29' }, 'time', { clinicians: 7 }), row(undefined, 'forgone', { clinicians: 7 })];
  const child = row({ respondent: RESPONDENT_CHILD }, 'oop', { clinicians: 9, unasked: 'oop', lead: 'unpaid', decide: 'family' });
  const a = aggregateSurvey([...adults, child]) as Record<string, any>;

  it('ranking, unasked, lead, decide and clinicians leave the child\'s answer out', () => {
    expect(a.ranking).toEqual(rankOf(adults));
    expect(a.ranking.find((r: any) => r.burden === 'oop').rankedFirstBy).toBe(0);
    expect(a.clinicians).toMatchObject({ n: 3, max: 7, median: 7 });
    expect(a.unasked).toEqual({ time: 3 });
    expect(a.lead).toEqual({ oop: 3 });
    expect(a.decide).toEqual({ clinician: 3 });
    expect(a.rankingBySex.stated + a.rankingBySex.notStated).toBe(3);
  });
  it('n stays every answer; the headline names how many it is of, in the register\'s words', () => {
    expect(a.n).toBe(4);
    expect(a.headline).toMatchObject({ n: 3, of: "answers about the person's own illness" });
    expect(HEADLINE_OF).toBe("answers about the person's own illness");
  });
  it('the child\'s group is read only by stratum, and withheld under the small-cell minimum', () => {
    const st = a.rankingByStratum;
    expect(st.groups.some((g: any) => g.stratum === 'caregiver-child')).toBe(false);
    expect(st.counts['caregiver-child']).toBeUndefined();
    const many = aggregateSurvey([...adults, ...Array(SMALL_CELL_MIN).fill(child)]) as Record<string, any>;
    expect(many.rankingByStratum.groups.find((g: any) => g.stratum === 'caregiver-child').n).toBe(SMALL_CELL_MIN);
    expect(many.ranking).toEqual(rankOf(adults));
  });
  it('the register prints "Of N answers about the person\'s own illness" over the headline', () => {
    const src = readFileSync('components/Register.tsx', 'utf8');
    expect(src).toContain('const hn = sv?.headline?.n ?? sv?.n ?? 0;');
    expect(src).toMatch(/Of \{n\} \{n === 1 \? 'answer' : 'answers'\}\{of \? ` \$\{of\.replace\(\/\^answers \/, ''\)\}` : ''\}/);
  });
});

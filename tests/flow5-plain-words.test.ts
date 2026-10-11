/* JUDGE-5 #5 (2026-10-01): a span with no number is time searching; a wait is
   one chip; plain English is never told to check its spelling. */
import { describe, it, expect } from 'vitest';
import { parseJourney, NO_MATCH_REASON, PLAIN_WORDS_REASON, SAY_IT_REASON } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const read = (s: string) => parseJourney(s, SELECTABLE).map((g) => ({ raw: g.raw, gap: g.result.gapCategory, months: g.result.months, reason: g.result.reason }));

describe('JUDGE-5 #5', () => {
  for (const [s, m] of [['it took months to find out', null], ['it took years to find out', null], ['took months before anyone listened', null], ['it took 2 years to find out', 24]] as const) {
    it(`${s}: one chip, time searching, months ${m}`, () => {
      const r = read(s);
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({ raw: s, gap: 'time-searching', months: m });
    });
  }
  it('a filler-only echo beside a wait is not a line', () => {
    expect(read('it took 2 years all in all')).toEqual([expect.objectContaining({ raw: 'it took 2 years all in all', gap: 'time-searching', months: 24 })]);
    expect(read('waited 3 months and then some more').map((x) => x.raw)).toEqual(['waited 3 months']);
  });
  it('plain English that names no care says so, never "check the spelling"', () => {
    const [l] = read('my aunt told me about it');
    expect(l.reason).toBe(PLAIN_WORDS_REASON);
    expect(PLAIN_WORDS_REASON).not.toMatch(/spelling/);
  });
  /* JUDGE-6 #5 narrowed the spelling advice to a word two letters or fewer
     from a catalog word; care the table holds under other words says so. */
  it('a near-miss of a catalog word keeps the spelling advice; care said another way says so', () => {
    expect(read('a gastroscpy')[0].reason).toBe(NO_MATCH_REASON);
    expect(read('saw 6 doctors')[0].reason).toBe(SAY_IT_REASON);
  });
});

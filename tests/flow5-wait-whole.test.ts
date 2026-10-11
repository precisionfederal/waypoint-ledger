/* FLOW5 flow5-4 (2026-10-01): a wait and what it waited for is one line; a
   result after care is never a line of its own. */
import { describe, it, expect } from 'vitest';
import { parseJourney, DURATION_REASON, NO_MATCH_REASON, RESULT_REASON } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const read = (s: string) => parseJourney(s, SELECTABLE).map((g) => ({ raw: g.raw, id: g.result.item?.id ?? null, gap: g.result.gapCategory, months: g.result.months, reason: g.result.reason }));

describe('flow5-4 the wait, whole', () => {
  it('it took 6 years to get a diagnosis: one line, 72 months', () => {
    expect(read('it took 6 years to get a diagnosis')).toEqual([{ raw: 'it took 6 years to get a diagnosis', id: null, gap: 'time-searching', months: 72, reason: DURATION_REASON }]);
  });
  for (const [s, m] of [['spent 3 years trying to get a diagnosis', 36], ['it took 2 years to find out', 24]] as const) {
    it(`${s}: one line, ${m} months`, () => { expect(read(s).map((l) => [l.gap, l.months])).toEqual([['time-searching', m]]); });
  }
  for (const s of ['it took months to find out what was wrong', 'took a while to figure out', 'it took forever to get an answer']) {
    it(`${s}: a span of unknown length, no months made up`, () => {
      expect(read(s)).toEqual([{ raw: s, id: null, gap: 'time-searching', months: null, reason: DURATION_REASON }]);
    });
  }
  it('care inside the wait still prices', () => {
    expect(read('waited 8 months for a gastroenterologist appointment').map((l) => l.id)).toContain('cms-99204');
    expect(read('it took a long time to see a neurologist').map((l) => l.id)).toEqual(['cms-99204']);
  });
});

describe('flow5-4 "they found nothing" is a result, not a line', () => {
  it('after care in the same sentence it is dropped', () => {
    expect(read('had a colonoscopy where they found nothing')).toEqual([{ raw: 'had a colonoscopy', id: 'cms-proc-colonoscopy', gap: null, months: null, reason: null }]);
  });
  it('on its own it says it is a result, never "check the spelling"', () => {
    const [l] = read('they found nothing');
    expect(l.reason).toBe(RESULT_REASON);
    expect(l.reason).not.toBe(NO_MATCH_REASON);
  });
});

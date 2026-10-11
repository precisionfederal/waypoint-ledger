/* JUDGE-7 #8 (2026-10-01, the specialty half): "Saw rheumatology 4x,
   neurology 2x, GI 3x" priced $0. */
import { describe, it, expect } from 'vitest';
import { parseJourney, SAY_IT_REASON, CLINICIAN_COUNT_REASON } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const read = (s: string) => parseJourney(s, SELECTABLE).map((g) => [g.result.item?.id ?? null, g.times]);

describe('JUDGE-7 #8', () => {
  it('a specialty with a count is that specialist, first visit and returns', () => {
    expect(read('Saw rheumatology 4x, neurology 2x, GI 3x')).toEqual([
      ['cms-99204', 1], ['cms-99214', 3], ['cms-99204', 1], ['cms-99214', 1], ['cms-99204', 1], ['cms-99214', 2],
    ]);
  });
  it('a wait for a specialty is never a visit', () => {
    expect(read('waited five months for neurology').every((x) => x[0] === null)).toBe(true);
    expect(read('the neurology department ordered an MRI of my brain').map((x) => x[0])).toEqual(['cms-img-mri-brain-nc']);
  });
  it('"saw 6 doctors" is counted, unpriced, with the say-it reason', () => {
    const r = parseJourney('saw 6 doctors', SELECTABLE);
    expect(r.map((g) => [g.result.item, g.times, g.result.reason])).toEqual([[null, 6, CLINICIAN_COUNT_REASON]]);
  });
});

/* JUDGE-7 #3 (2026-10-01): a hospital stay is counted, never priced as a
   different service. */
import { describe, it, expect } from 'vitest';
import { parseJourney, HOSPITAL_STAY_REASON } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const read = (s: string) => parseJourney(s, SELECTABLE).map((g) => ({ id: g.result.item?.id ?? null, reason: g.result.reason }));

describe('JUDGE-7 #3', () => {
  it('"in the hospital for 5 days after a fall" is a stay, never 99495', () => {
    expect(read('He was in the hospital for 5 days after a fall')).toEqual([{ id: null, reason: HOSPITAL_STAY_REASON }]);
  });
  it('the ICU and "N nights in" are stays', () => {
    for (const s of ['spent 3 nights in the ICU', 'a week in the hospital', 'she was in the ICU']) {
      expect(read(s).map((x) => x.reason), s).toEqual([HOSPITAL_STAY_REASON]);
    }
  });
  it('the ER beside a stay keeps its price', () => {
    expect(read('went to the ER and was admitted').map((x) => x.id)).toEqual(['cms-ed-99284-complete', null]);
    expect(read('the D-dimer was high so they scanned my chest with contrast and kept me in the ER').map((x) => x.id)).toContain('cms-ed-99284-complete');
  });
});

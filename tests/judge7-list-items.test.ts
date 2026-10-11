/* JUDGE-7 #8 (2026-10-01, the list half): "Dr. visits: 12. Labs: 8. MRIs: 2."
   left junk chips "Dr.", "visits" and "12.". */
import { describe, it, expect } from 'vitest';
import { parseJourney } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const read = (s: string) => parseJourney(s, SELECTABLE).map((g) => [g.raw, g.result.item?.id ?? null, g.times]);

describe('JUDGE-7 #8 lists', () => {
  it('each "label: number" item is the label times the number, in her words', () => {
    expect(read('Dr. visits: 12. Labs: 8. MRIs: 2.')).toEqual([
      ['Dr. visits: 12.', 'cms-99213', 12],
      ['Labs: 8.', 'cms-lab-cbc', 8],
      ['MRIs: 2.', null, 2],
    ]);
  });
  it('"Dr. Smith" is not the end of a sentence', () => {
    expect(read('I saw Dr. Smith twice.')).toHaveLength(1);
  });
});

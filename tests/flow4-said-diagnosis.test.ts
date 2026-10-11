/* FLOW4 flow4-6 (2026-10-01): a diagnosis said plainly is read as a diagnosis,
   never "check the spelling". */
import { describe, it, expect } from 'vitest';
import { parseJourney, DIAGNOSIS_REASON, NO_MATCH_REASON } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const read = (s: string) => parseJourney(s, SELECTABLE);

describe('flow4-6 the answer, said plainly', () => {
  for (const s of ['it was lupus', 'they found lupus', 'it was celiac', "it's lupus", 'diagnosed with lupus', 'they finally said it was MS', 'it turned out to be POTS']) {
    it(s, () => {
      const g = read(s);
      expect(g).toHaveLength(1);
      expect(g[0].result.item).toBeNull();
      expect(g[0].result.reason).toBe(DIAGNOSIS_REASON);
      expect(g[0].result.reason).not.toBe(NO_MATCH_REASON);
    });
  }
  it('took me 3 years to find out it was lupus: one line, the diagnosis, with 36 months', () => {
    const g = read('took me 3 years to find out it was lupus');
    expect(g).toHaveLength(1);
    expect(g[0].result).toMatchObject({ item: null, reason: DIAGNOSIS_REASON, gapCategory: 'time-searching', months: 36 });
  });
  it('care beside the diagnosis still prices', () => {
    expect(read('it was a colonoscopy that found the crohns').filter((x) => x.result.item).map((x) => x.result.item!.id)).toEqual(['cms-proc-colonoscopy']);
  });
});

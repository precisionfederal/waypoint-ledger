/* JUDGE-6 #10 (2026-10-01): a line found in what a match left over stores the
   words it came from, cut on a word that carries meaning, never on a dangling
   article, preposition or helping verb. */
import { describe, it, expect } from 'vitest';
import { parseJourney } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const read = (s: string) => parseJourney(s, SELECTABLE).map((g) => ({ id: g.result.item?.id ?? null, raw: g.raw }));
const DANGLES = /\b(?:a|an|the|of|to|for|with|and|or|did|had|got|was|finally|then)$/i;

describe('JUDGE-6 #10', () => {
  it('"A GI doctor finally did an endoscopy": the visit quotes "GI doctor"', () => {
    const r = read('A GI doctor finally did an endoscopy');
    expect(r.map((x) => x.id)).toEqual(['cms-proc-egd-biopsy', 'cms-99204']);
    expect(r[1].raw).toBe('GI doctor');
  });
  it('no residual line stores words that end or start on a joining word', () => {
    for (const s of [
      'A GI doctor finally did an endoscopy',
      'my pcp ordered a1c',
      'my regular doctor sent me for blood work',
      'a neurologist eventually ordered an EEG',
      'then a rheumatologist did an ANA test',
    ]) {
      for (const x of read(s)) {
        expect(x.raw, `${s} -> ${x.raw}`).not.toMatch(DANGLES);
        expect(x.raw.length, s).toBeGreaterThan(0);
      }
    }
  });
});

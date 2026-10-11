/* JUDGE-6 #7 (2026-10-01): "2 mri's of my brain" counts x2, the same as "2 MRIs". */
import { describe, it, expect } from 'vitest';
import { parseJourney } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const read = (s: string) => parseJourney(s, SELECTABLE).map((g) => [g.result.item?.id ?? null, g.times]);

describe('JUDGE-6 #7', () => {
  it('an apostrophe plural counts like the plain plural', () => {
    expect(read("2 mri's of my brain")).toEqual([['cms-img-mri-brain-nc', 2]]);
    expect(read('2 MRIs of my brain')).toEqual([['cms-img-mri-brain-nc', 2]]);
    expect(read('2 MRI’s of my brain')).toEqual([['cms-img-mri-brain-nc', 2]]);
  });
  it('a short acronym plural prices and counts', () => {
    expect(read("3 CT's of my head")).toEqual([['cms-img-ct-head-nc', 3]]);
    expect(read('3 CTs of my head')).toEqual([['cms-img-ct-head-nc', 3]]);
    expect(read('2 EKGs')).toEqual([['cms-test-ecg', 2]]);
    expect(read("two ekg's")).toEqual([['cms-test-ecg', 2]]);
  });
  it('a possessive on someone else stays someone else', () => {
    expect(read("my dad's MRI")).toEqual([[null, 1]]);
  });
});

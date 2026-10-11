/* JUDGE-6 #3 (2026-10-01): the caregiver voice. One story is one patient. */
import { describe, it, expect } from 'vitest';
import { parseJourney, NOT_YOURS_OR_NOT_YET_REASON } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const lines = (s: string) => parseJourney(s, SELECTABLE).map((g) => [g.result.item?.id ?? null, g.times]);

describe('JUDGE-6 #3 one story, one patient', () => {
  it('my mom took me to the pediatrician 6 times: my care, x6', () => {
    expect(lines('my mom took me to the pediatrician 6 times')).toEqual([['cms-99213', 6]]);
  });
  it('my wife saw a neurologist twice: her first visit and her return', () => {
    expect(lines('my wife saw a neurologist twice')).toEqual([['cms-99204', 1], ['cms-99214', 1]]);
  });
  it('my husband had a sleep study and an EEG: both, for him', () => {
    expect(lines('my husband had a sleep study and an EEG')).toEqual([['cms-test-sleep-study', 1], ['cms-test-eeg-awake-drowsy', 1]]);
    expect(lines('he had a sleep study')).toEqual([['cms-test-sleep-study', 1]]);
  });
  it('a second relative, or a relative beside the writer\'s own care, is still not this ledger', () => {
    const g = parseJourney('my sister had an MRI and I had a CT of my head', SELECTABLE);
    expect(g[0].result.reason).toBe(NOT_YOURS_OR_NOT_YET_REASON);
    expect(lines('my mom had an MRI of her brain and my dad had a CT of his head')).toEqual([['cms-img-mri-brain-nc', 1], [null, 1]]);
  });
});

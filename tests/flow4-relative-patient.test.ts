/* FLOW4 flow4-10 (2026-10-01): a spouse or an adult child telling the story of
   the person they care for is not told "did not happen to you". */
import { describe, it, expect } from 'vitest';
import { parseJourney, NOT_YOURS_OR_NOT_YET_REASON } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const read = (s: string) => parseJourney(s, SELECTABLE);
const priced = (s: string) => read(s).filter((g) => g.result.item).map((g) => g.result.item!.id);

describe('flow4-10 the relative a story is about is the patient', () => {
  it('my wife had seizures for a year. she saw…: the year is counted and line 1 is not "did not happen"', () => {
    const g = read('my wife had seizures for a year. she saw her regular doctor 4 times, a neurologist, and 2 EEGs');
    expect(g[0].result).toMatchObject({ gapCategory: 'time-searching', months: 12 });
    expect(g[0].result.reason).not.toBe(NOT_YOURS_OR_NOT_YET_REASON);
    expect(priced('my wife had seizures for a year. she saw her regular doctor 4 times, a neurologist, and 2 EEGs'))
      .toEqual(['cms-99213', 'cms-99204', 'cms-test-eeg-awake-drowsy']);
  });
  it('my husband was sick for 2 years: 24 months', () => {
    expect(read('my husband was sick for 2 years')[0].result).toMatchObject({ gapCategory: 'time-searching', months: 24 });
  });
  it('my mom had an MRI of her brain. then she saw a neurologist twice: her care prices', () => {
    expect(priced('my mom had an MRI of her brain. then she saw a neurologist twice')).toEqual(['cms-img-mri-brain-nc', 'cms-99204', 'cms-99214']);
  });
  /* JUDGE-6 #3: a lone relative's story is now that relative's ledger (see
     tests/mapper-r4.test.ts for why); beside the writer's own care it is not. */
  it('a story where the writer names their own care keeps a relative\'s care out', () => {
    expect(priced('my husband saw a cardiologist')).toEqual(['cms-99204']);
    expect(priced('my sister had an MRI and I had a CT of my head')).toEqual(['cms-img-ct-head-nc']);
    expect(priced('I saw my GP. my husband had an MRI')).toEqual(['cms-99213']);
  });
  it('the rule never outlives its call', () => {
    read('my wife had seizures for a year. she saw her regular doctor 4 times');
    expect(priced('I saw my GP. my wife saw a cardiologist')).toEqual(['cms-99213']);
  });
});

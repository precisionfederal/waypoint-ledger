/* FLOW3 round-3 eval cases on the count and the default variant. */
import { describe, it, expect } from 'vitest';
import { parseJourney } from '../lib/mapper';
import { ITEMS } from '../lib/store';

const read = (s: string) => parseJourney(s, ITEMS).filter((x) => !x.absorbed).map((x) => [x.result.item?.id ?? null, x.times]);

describe('flow3-2 a count with a modifier word before the plural', () => {
  /* The merged build FLOW3 walked (02b75dc7f) read "4 brain MRIs" as x1; this
     branch carries rule 4b (judge panel #5a, ad1d00c23b), which skips up to
     three modifier words. These are the audit's own phrases. */
  it.each([
    ['4 brain MRIs', 'cms-img-mri-brain-nc', 4],
    ['2 blood tests', 'cms-lab-cbc', 2],
    ['3 brain scans', 'cms-img-mri-brain-nc', 3],
  ])('%s', (s, id, n) => { expect(read(s)).toEqual([[id, n]]); });
  it('both counts survive in one sentence', () => {
    expect(read('had 4 brain MRIs and 2 blood tests')).toEqual([['cms-img-mri-brain-nc', 4], ['cms-lab-cbc', 2]]);
  });
  it('time and measure words on the final noun are still never a count of care', () => {
    for (const s of ['2 long years', 'drove 60 long miles', 'waited 3 whole months']) {
      expect(read(s).every(([id]) => id === null), s).toBe(true);
    }
  });
});

describe('flow3-8 an unqualified test gets the plain variant, marked worth a check', () => {
  const one = (s: string) => { const x = parseJourney(s, ITEMS).filter((y) => !y.absorbed)[0]; return [x.result.item?.id ?? null, x.times, x.result.confidence]; };
  it.each([
    ['4 brain MRIs', 'cms-img-mri-brain-nc', 4, 'low'],
    ['an MRI of her brain', 'cms-img-mri-brain-nc', 1, 'low'],
    ['MRI of my brain', 'cms-img-mri-brain-nc', 1, 'low'],
    ['2 EEGs', 'cms-test-eeg-awake-drowsy', 2, 'low'],
    ['an EEG', 'cms-test-eeg-awake-drowsy', 1, 'low'],
  ])('%s', (s, id, n, c) => { expect(one(s)).toEqual([id, n, c]); });
  it('a said detail wins, and is not marked', () => {
    expect(one('brain MRI with and without contrast')[0]).toBe('cms-img-mri-brain-both');
    expect(one('an MRI of my brain without contrast')).toEqual(['cms-img-mri-brain-nc', 1, expect.not.stringMatching(/^low$/)]);
    expect(one('an EEG while I slept')[0]).toBe('cms-test-eeg');
    expect(one('a routine EEG')).toEqual(['cms-test-eeg-awake-drowsy', 1, expect.not.stringMatching(/^low$/)]);
  });
  it('a test named after a visit still prices beside it', () => {
    expect(parseJourney('my regular doctor did an EEG', ITEMS).map((x) => x.result.item?.id)).toEqual(['cms-99213', 'cms-test-eeg-awake-drowsy']);
  });
});

import { searchLength, splitFrom } from '../lib/search-length';
import { gapSummary } from '../lib/sheet';

describe('flow3-17 two ages, the onset and now, are the length of the search', () => {
  const led = (s: string) => parseJourney(s, ITEMS).filter((x) => !x.absorbed)
    .map((x, i) => ({ key: String(i), raw: x.raw, item: x.result.item, times: x.times, gapCategory: x.result.gapCategory, months: x.result.months }));
  it.each([
    ['got sick when she was 9, shes 13 now', 48, '4 years searching, from “got sick when she was 9, shes 13 now”'],
    ['got sick at 12 and im 19 now', 84, '7 years searching, from “got sick at 12 and im 19 now”'],
    ["I got sick at 30. I'm 34 now.", 48, "4 years searching, from “I got sick at 30. I'm 34 now.”"],
  ])('%s', (s, months, line) => {
    expect(gapSummary(led(s)).months).toBe(months);
    expect(searchLength(led(s)).line).toBe(line);
  });
  it('a diagnosis age said in the same words wins, and is the lower bound', () => {
    expect(gapSummary(led('got sick at 12, diagnosed at 15, im 19 now')).months).toBe(36);
    expect(searchLength(led('got sick at 12 and was diagnosed at 19')).line).toBe('7 years searching');
  });
  it('never counted twice beside an explicit length: the longest span is the search', () => {
    expect(gapSummary(led('got sick at 12 and im 19 now, searched for 5 years')).months).toBe(84);
    expect(gapSummary(led('got sick at 15 and im 17 now, searched for 2 years')).months).toBe(24);
  });
  it('the page can set her words apart from the figure', () => {
    expect(splitFrom('7 years searching, from “got sick at 12 and im 19 now” · 2 clinicians named')).toEqual(['7 years searching', ', from “got sick at 12 and im 19 now”', ' · 2 clinicians named']);
    expect(splitFrom('7 years searching')).toEqual(['7 years searching', '', '']);
  });
  it('an age now that is not after the onset is no span', () => {
    expect(gapSummary(led('got sick at 19 and im 19 now')).months).toBe(0);
  });
});

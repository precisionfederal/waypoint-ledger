/* JUDGE-5 #4 (2026-10-01): the regular doctor, however it is said. */
import { describe, it, expect } from 'vitest';
import { parseJourney } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const lines = (s: string) => parseJourney(s, SELECTABLE).map((g) => [g.result.item?.id ?? null, g.times]);

describe('JUDGE-5 #4 "the doctor saw me 5 times" is five visits to the regular doctor', () => {
  for (const s of ['the doctor saw me 5 times', 'she saw her doctor 5 times', 'her doctor saw her 5 times', 'saw my doctor 5 times', 'saw the doctor 5 times', 'went to the doctor 5 times']) {
    it(s, () => { expect(lines(s)).toEqual([['cms-99213', 5]]); });
  }
  it('a specialist said the other way round still splits first visit and returns', () => {
    expect(lines('the neurologist saw me 3 times')).toEqual([['cms-99204', 1], ['cms-99214', 2]]);
  });
  it('who the story is about is still read from her words', () => {
    // JUDGE-6 #3: a lone relative's story is theirs; beside the writer's own care it is not.
    expect(lines('my sister saw her doctor')).toEqual([['cms-99213', 1]]);
    expect(lines('I had a CT of my head. my sister saw her doctor')).toEqual([['cms-img-ct-head-nc', 1], [null, 1]]);
    expect(lines('my wife has been ill for three years, her doctor saw her 5 times')).toEqual([[null, 1], ['cms-99213', 5]]);
  });
  it('a dismissal by the doctor is still a dismissal', () => {
    expect(parseJourney('the doctor said it was anxiety', SELECTABLE)[0].result.gapCategory).toBe('dismissed');
  });
});

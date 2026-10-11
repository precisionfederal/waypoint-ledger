/* JUDGE-6 #9 (2026-10-01): rate times span reads the same in either order;
   "over and over" is a repeat with no number, never a chip of its own. */
import { describe, it, expect } from 'vitest';
import { parseJourney, NO_MATCH_REASON } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const read = (s: string) => parseJourney(s, SELECTABLE).map((g) => ({ id: g.result.item?.id ?? null, times: g.times, note: g.countNote, raw: g.raw, reason: g.result.reason }));

describe('JUDGE-6 #9', () => {
  it('"for 6 weeks, 2x a week" and "2x a week for 6 weeks" both read x12', () => {
    for (const s of ['physical therapy for 6 weeks, 2x a week', 'physical therapy 2x a week for 6 weeks', 'physical therapy for six weeks, twice a week']) {
      const r = read(s);
      expect(r, s).toHaveLength(1);
      expect(r[0]).toMatchObject({ id: 'cms-pt-exercise-15', times: 12, note: '2 a week × 6 weeks = 12' });
    }
  });
  it('a rate after a clause with no span stays its own clause', () => {
    expect(read('I saw a neurologist, 2x a week').length).toBe(2);
  });
  it('"over and over" is counted once with an ask, and leaves no chip', () => {
    const r = read('my mom took me to the pediatrician over and over');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'cms-99213', times: 1 });
    expect(r[0].note).toMatch(/“over and over”, which is not a number/);
    expect(read('I saw my doctor again and again')).toHaveLength(1);
  });
  it('"threw up" is plain English, never a spelling question', () => {
    for (const x of read('I was sick for 6 weeks, 2x a week I threw up')) expect(x.reason).not.toBe(NO_MATCH_REASON);
  });
});

describe('JUDGE-6 #9, the words as typed', () => {
  it('a held phrase before a full stop keeps no stray space', () => {
    expect(read('my mom took me to the pediatrician over and over. then an MRI of my brain')[0].raw).toBe('my mom took me to the pediatrician over and over.');
  });
});

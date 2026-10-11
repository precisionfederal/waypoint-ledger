/* JUDGE-6 #5 (2026-10-01): plain English is never told to check its spelling. */
import { describe, it, expect } from 'vitest';
import { parseJourney, NO_MATCH_REASON, HOSPITAL_STAY_REASON, BARE_ULTRASOUND_REASON, SAY_IT_REASON, PLAIN_WORDS_REASON, readOnPurpose, unpricedByName } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const read = (s: string) => parseJourney(s, SELECTABLE).map((g) => ({ id: g.result.item?.id ?? null, gap: g.result.gapCategory, months: g.result.months, reason: g.result.reason }));

describe('JUDGE-6 #5', () => {
  it('a hospital stay says it is one, and the reader is not asked to force a row on it', () => {
    for (const s of ['admitted overnight', 'admitted to the hospital for 3 days', 'he was admitted for two nights']) {
      expect(read(s)[0].reason, s).toBe(HOSPITAL_STAY_REASON);
    }
    expect(read('ER visit by ambulance, admitted overnight').map((x) => x.id)).toEqual(['cms-ed-99284-complete', null]);
    expect(readOnPurpose(HOSPITAL_STAY_REASON)).toBe(true);
  });
  it('"since I was 12 … I\'m 34 now" is 22 years searching; "7 yrs" is 84 months', () => {
    expect(read("I've been sick since I was 12, I'm 34 now")).toEqual([expect.objectContaining({ gap: 'time-searching', months: 264 })]);
    expect(read('ive been sick for 7 yrs')).toEqual([expect.objectContaining({ gap: 'time-searching', months: 84 })]);
  });
  it('an ultrasound with no part asks for the part, as an MRI does', () => {
    expect(read('a couple of ultrasounds')[0].reason).toBe(BARE_ULTRASOUND_REASON);
    expect(unpricedByName(BARE_ULTRASOUND_REASON)).toBe(true);
  });
  it('spelling advice only for a word two letters or fewer from a catalog word', () => {
    expect(read('a gastroscpy')[0].reason).toBe(NO_MATCH_REASON);
    expect(read('saw 6 doctors')[0].reason).toBe(SAY_IT_REASON);
    expect(read('my aunt told me about it')[0].reason).toBe(PLAIN_WORDS_REASON);
    for (const r of [SAY_IT_REASON, PLAIN_WORDS_REASON, HOSPITAL_STAY_REASON, BARE_ULTRASOUND_REASON]) expect(r).not.toMatch(/spelling/);
  });
});

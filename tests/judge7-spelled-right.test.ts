/* JUDGE-7 #7 (2026-10-01): "check the spelling" never lands on a word spelled
   right, and missed work days are the lost-work reason. */
import { describe, it, expect } from 'vitest';
import { parseJourney, NO_MATCH_REASON, LOST_WORK_REASON } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const read = (s: string) => parseJourney(s, SELECTABLE).map((g) => ({ id: g.result.item?.id ?? null, reason: g.result.reason, gap: g.result.gapCategory, times: g.times }));

describe('JUDGE-7 #7', () => {
  it('correctly spelled care gets no spelling advice', () => {
    for (const s of ['dialysis', 'a heart cath', 'neurology 2x', 'a HIDA scan']) {
      for (const x of read(s)) expect(x.reason, s).not.toBe(NO_MATCH_REASON);
    }
  });
  it('a real misspelling still gets it', () => {
    expect(read('a gastroscpy')[0].reason).toBe(NO_MATCH_REASON);
  });
  it('"I missed about 30 days of work." is lost work, 30 days', () => {
    const r = read('I missed about 30 days of work.');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: null, reason: LOST_WORK_REASON, times: 30 });
  });
});

/* FLOW4 flow4-4 (2026-10-01): a count said after a comma belongs to the care
   before it. "my GP kept saying stress, maybe 8 visits" priced the GP once and
   left "maybe 8 visits ×8" with no figure. */
import { describe, it, expect } from 'vitest';
import { parseJourney } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const lines = (s: string) => parseJourney(s, SELECTABLE).map((g) => ({ id: g.result.item?.id ?? null, times: g.times, note: g.countNote ?? null }));

describe('flow4-4 a count after a comma', () => {
  it('my GP kept saying stress, maybe 8 visits.', () => {
    expect(lines('my GP kept saying stress, maybe 8 visits.')).toEqual([{ id: 'cms-99213', times: 8, note: '8, from “maybe 8 visits”' }]);
  });
  it('my GP kept saying stress, about 8 times', () => {
    expect(lines('my GP kept saying stress, about 8 times')).toEqual([{ id: 'cms-99213', times: 8, note: '8, from “about 8 times”' }]);
  });
  it('a specialist splits into the first visit and the returns, as "3 times" does', () => {
    expect(lines('saw a neurologist, maybe 3 visits').map(({ id, times }) => ({ id, times })))
      .toEqual([{ id: 'cms-99204', times: 1 }, { id: 'cms-99214', times: 2 }]);
  });
  it('never moves onto a line that already has its count, or onto a symptom', () => {
    expect(lines('saw my GP 8 times, maybe 10 visits')[0]).toMatchObject({ id: 'cms-99213', times: 8 });
    expect(lines('I was exhausted, maybe 8 times').some((l) => l.id)).toBe(false);
  });
  it('the judge sentence prices the GP 8 times and nothing is lost', () => {
    const s = 'took me 3 years to find out it was lupus. my GP kept saying stress, maybe 8 visits. saw a rheumatologist twice, tons of bloodwork, an ultrasound of my belly, a colonoscopy, and two trips to the ER for chest pain';
    const got = lines(s).filter((l) => l.id);
    expect(got.find((l) => l.id === 'cms-99213')).toMatchObject({ times: 8 });
    expect(got.map((l) => l.id)).not.toContain('cms-proc-colonoscopy-polyp');
    expect(lines(s).some((l) => !l.id && l.times === 8)).toBe(false);
  });
});

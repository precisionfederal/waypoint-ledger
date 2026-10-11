/* FLOW4 blocker (2026-10-01): everyday "took ... out" wording is never priced as care. */
import { describe, it, expect } from 'vitest';
import { parseJourney } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const ids = (s: string) => JSON.stringify(parseJourney(s, SELECTABLE)).match(/"id":"cms-[^"]+"/g) ?? [];

describe('"took" and "out" never carry a match on their own', () => {
  for (const s of [
    'it took months to find out what was wrong',
    'took me 3 years to find out it was lupus',
    'they took me out of work for 3 weeks',
    'took out a loan to pay for it',
  ]) {
    it(s, () => { expect(ids(s).join(' ')).not.toMatch(/colonoscopy/); });
  }
  it('a real polyp removal still prices', () => {
    expect(ids('they took out a polyp').join(' ')).toMatch(/cms-proc-colonoscopy-polyp/);
    expect(ids('colonoscopy where they took out a polyp').join(' ')).toMatch(/cms-proc-colonoscopy-polyp/);
  });
  it('the ER still reads', () => {
    expect(ids('she took me to the ER').join(' ')).toMatch(/cms-ed-99284/);
  });
  it('a joining word is never a hit: "where" does not make a plain colonoscopy a biopsy', () => {
    const got = ids('Mississippi is where I grew up but the colonoscopy was done here').join(' ');
    expect(got).toMatch(/cms-proc-colonoscopy"/);
    expect(got).not.toMatch(/biopsy/);
  });
  for (const s of ['took a while to figure out', 'they found out what was wrong']) {
    it(`${s}: no unit of care`, () => { expect(ids(s)).toEqual([]); });
  }
  it('flow4-15: "they took blood" is a blood draw, as "they drew blood" is', () => {
    expect(ids('they took blood 3 times').join(' ')).toMatch(/cms-lab-cbc/);
    expect(ids('they took my blood').join(' ')).toMatch(/cms-lab-cbc/);
  });
  it('flow4-15: a phrase that is one word once its taking verb is set aside matches only whole', () => {
    expect(ids('they measured how well my lungs move oxygen into my blood').join(' ')).not.toMatch(/cms-lab-cbc/);
    expect(ids('they took out a polyp').join(' ')).toMatch(/cms-proc-colonoscopy-polyp/);
  });
});

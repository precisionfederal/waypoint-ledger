/* FLOW4 flow4-3 (2026-10-01): the length of the search, said as the illness.
   "sick for 4 years" and "had dizzy spells for 4 years" gave no months, and
   "took me 3 years to find out it was lupus" gave none either. */
import { describe, it, expect } from 'vitest';
import { parseJourney } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const months = (s: string) => parseJourney(s, SELECTABLE)
  .filter((g) => g.result.gapCategory === 'time-searching')
  .map((g) => g.result.months);
const priced = (s: string) => parseJourney(s, SELECTABLE).filter((g) => g.result.item).map((g) => g.result.item!.id);

describe('flow4-3 how long she was ill is how long she searched', () => {
  for (const s of ['had dizzy spells for 4 years', 'sick for 4 years', 'dizzy for 4 years', 'had migraines for 4 years', 'I was sick for 4 years before anyone listened']) {
    it(`${s}: 48 months, nothing priced`, () => {
      expect(months(s)).toEqual([48]);
      expect(priced(s)).toEqual([]);
    });
  }
  it('keeps the symptom reason on the line', () => {
    const [g] = parseJourney('sick for 4 years', SELECTABLE);
    expect(g.result.reason).toMatch(/^a symptom, not a unit of care/);
  });
  it('took me 3 years: 36 months', () => {
    expect(months('took me 3 years to find out it was lupus')).toEqual([36]);
    expect(priced('took me 3 years to find out it was lupus')).toEqual([]);
  });
  it('a symptom that lasted days is not a search', () => {
    expect(months('had a headache for 3 days')).toEqual([]);
  });
  it('the forms that already worked still do', () => {
    expect(months('this went on for 5 years')).toEqual([60]);
    expect(months('my son had stomach pain for 2 years before they found celiac')).toEqual([24]);
  });
  it('care said beside the illness still prices, and the months ride along', () => {
    const s = 'had dizzy spells for 4 years. saw my family doctor 6 times, a tilt table test';
    expect(months(s)).toEqual([48]);
    expect(priced(s)).toEqual(['cms-99213', 'cms-test-tilt-table']);
  });
});

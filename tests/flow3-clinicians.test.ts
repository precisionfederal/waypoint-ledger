/* FLOW3 flow3-21: the clinicians count survives a misspelling and a visit line that names no one. */
import { describe, it, expect } from 'vitest';
import { cliniciansSaid, parseJourney } from '../lib/mapper';
import { ITEMS, exampleLedger } from '../lib/store';
import { searchLength } from '../lib/search-length';
import type { JourneyEntry } from '../lib/types';

const led = (s: string): JourneyEntry[] => parseJourney(s, ITEMS).filter((x) => !x.absorbed)
  .map((x, i) => ({ key: String(i), raw: x.raw, item: x.result.item, times: x.times, gapCategory: x.result.gapCategory, months: x.result.months }));

describe('flow3-21 misspelled clinicians are still clinicians', () => {
  it.each([
    ['saw my pediatrican like 10 tims', 'pcp'],
    ['then a cardiolgist', 'cardiologist'],
  ])('%s', (s, who) => { expect(cliniciansSaid(s).named).toEqual([who]); });
  it('"pediatrican" now prices by rules as the regular doctor', () => {
    expect(led('saw my pediatrican like 10 tims').map((e) => [e.item?.id, e.times])).toEqual([['cms-99213', 10]]);
  });
  it('the audit story shows its clinicians', () => {
    expect(searchLength(led('got sick at 12 and im 19 now, saw my pediatrican like 10 tims, then a cardiolgist, they think its POTS.')).line)
      .toBe('7 years searching, from “got sick at 12 and im 19 now” · 2 clinicians named');
  });
});

describe('flow3-21 a visit line that names no one still saw someone, counted once', () => {
  const visit = (key: string, raw: string, id: string): JourneyEntry => ({ key, raw, item: ITEMS.find((i) => i.id === id)!, times: 1, source: 'model' });
  it('a first visit counts once per line; a return visit is the regular doctor, once', () => {
    const e = [visit('a', 'saw the peditrishun', 'cms-99213'), visit('b', 'then a new one', 'cms-99204'), visit('c', 'and another new one', 'cms-99204'), visit('d', 'back to the peditrishun', 'cms-99213')];
    expect(searchLength(e).clinicians).toBe(3);
  });
  it('a line that names its clinician is never counted a second time from its unit', () => {
    expect(searchLength(led('saw my regular doctor 3 times, then a cardiologist')).clinicians).toBe(2);
    expect(searchLength(led('saw my regular doctor 4 times')).clinicians).toBe(0); // one clinician is not a count worth a line
  });
  it('the worked example keeps its count', () => {
    // measured before and after this change: the example names all three
    expect(searchLength(exampleLedger()).line).toBe('3 clinicians named');
  });
});

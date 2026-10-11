/* JUDGE-7 #9 (2026-10-01): a named analyte beside a generic lab word is that
   analyte's own row, read before the generic labs-to-CBC match. */
import { describe, it, expect } from 'vitest';
import { parseJourney } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const ids = (s: string) => parseJourney(s, SELECTABLE).map((g) => g.result.item?.id ?? null);

describe('JUDGE-7 #9', () => {
  it('"thyroid labs" is the TSH, as "TSH test" is', () => {
    expect(ids('thyroid labs')).toEqual(['cms-lab-tsh']);
    expect(ids('TSH test')).toEqual(['cms-lab-tsh']);
  });
  it('"labs (ANA, CBC, sed rate)" is three different tests', () => {
    expect(ids('a ton of labs (ANA, CBC, sed rate).')).toEqual(['cms-lab-ana', 'cms-lab-cbc', 'cms-lab-esr']);
  });
  it('plain "blood work" is still the one CBC, with its note', () => {
    expect(ids('blood work')).toEqual(['cms-lab-cbc']);
  });
});

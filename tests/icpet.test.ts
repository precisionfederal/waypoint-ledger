/* FINAL-1011 (susan): from a written interview with a patient advocate living
   with ME/CFS (14 Sep 2026). Her diagnosis came through an invasive
   cardiopulmonary exercise test (iCPET). iCPET is named and never priced as the
   ordinary CPET row (CPT 94621, $165.67): the table holds no row for the
   invasive part, and no single published federal figure covers the whole
   procedure. */
import { describe, it, expect } from 'vitest';
import { parseJourney, mapUtterance, unpricedByName, notReadAsCare, INVASIVE_CPET_REASON } from '../lib/mapper';
import { SELECTABLE, TABLE } from '../lib/table';
import synonyms from '../data/synonyms.json';

const INVASIVE = ['iCPET', 'an iCPET', 'i-CPET', 'invasive CPET', 'an invasive CPET at a research study',
  'invasive cardiopulmonary exercise test', 'an invasive cardiopulmonary exercise test', 'invasive exercise test',
  'a CPET with a right heart catheter', 'cardiopulmonary exercise testing with right heart catheterization'];

describe('iCPET is named, never silently priced as the standard CPET', () => {
  it('every way of saying it comes back unpriced, with the plain reason', () => {
    for (const s of INVASIVE) {
      const r = mapUtterance(s, SELECTABLE);
      expect(r.item, s).toBeNull();
      expect(r.reason, s).toBe(INVASIVE_CPET_REASON);
      const lines = parseJourney(s, SELECTABLE);
      expect(lines.map((l) => l.result.item?.id ?? null), s).not.toContain('cms-test-cpet');
      expect(lines.some((l) => l.result.reason === INVASIVE_CPET_REASON), s).toBe(true);
    }
  });

  it('the reason says why, and says the standard row is a different test', () => {
    expect(INVASIVE_CPET_REASON).toMatch(/no single published federal figure for the whole procedure/);
    expect(INVASIVE_CPET_REASON).toMatch(/standard exercise test row is not the same test/);
    expect(unpricedByName(INVASIVE_CPET_REASON)).toBe(true);
  });

  it('the line is read and kept on the ledger, never dropped as "not care"', () => {
    const r = mapUtterance('iCPET', SELECTABLE);
    expect(notReadAsCare({ raw: 'iCPET', item: r.item, gapCategory: r.gapCategory, months: r.months, reason: r.reason })).toBe(false);
  });

  it('the ordinary CPET still prices on its own federal row', () => {
    for (const s of ['a CPET', 'a cardiopulmonary exercise test', 'a two-day CPET']) {
      expect(parseJourney(s, SELECTABLE)[0].result.item?.id, s).toBe('cms-test-cpet');
    }
    const row = TABLE.find((i) => i.id === 'cms-test-cpet')!;
    expect(row.valueUsd).toBeCloseTo(165.67, 2);
  });

  it('inside a longer sentence the other care still prices and the iCPET does not', () => {
    const ids = parseJourney('saw a cardiologist; an iCPET at a research study; blood work', SELECTABLE).map((l) => l.result.item?.id ?? null);
    expect(ids).not.toContain('cms-test-cpet');
    expect(ids).toContain('cms-lab-cbc');
  });

  it('no synonym sends an invasive test to the standard CPET row', () => {
    const cpet = (synonyms as { synonyms: Record<string, string[]> }).synonyms['cms-test-cpet'] ?? [];
    expect(cpet.filter((p) => /invasive|icpet/i.test(p))).toEqual([]);
  });

  it('the table holds no row for the invasive part (right heart catheterization), so nothing is combined', () => {
    const cath = TABLE.filter((i) => /\b9345[1-6]\b|right heart cath/i.test(`${i.code ?? ''} ${i.label ?? ''}`));
    expect(cath).toEqual([]);
  });
});

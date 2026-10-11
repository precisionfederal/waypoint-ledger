/* FLOW3 round-3 MINOR items. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import unpriceable from '../data/unpriceable.json';

const src = (p: string) => readFileSync(p, 'utf8');

describe('flow3-7 one page, one answer on whether a lost workday has a figure', () => {
  const lost = (unpriceable as { items: { id: string; whyUnpriced: string; whatWouldFixIt: string }[] }).items.find((u) => u.id === 'lost-work')!;
  it('the reason says where the figure is shown, not that there is none', () => {
    expect(lost.whyUnpriced.startsWith('Shown on the workdays card, at the published median or your own pay, and never added to the medical total.')).toBe(true);
    expect(lost.whyUnpriced).not.toMatch(/not a national median/);
    expect(lost.whatWouldFixIt).toMatch(/workdays card/);
  });
  it('the ledger marks a line with a priced card "outside the total", never "blank"', () => {
    const l = src('components/Ledger.tsx');
    expect(l).toContain("'lost-work': { kind: 'workdays', act: 'Enter the days you missed', mark: 'outside the total' }");
    expect(l).toContain("'caregiver-time': { kind: 'care-hours', act: 'Enter the hours of care', mark: 'outside the total' }");
    expect(l).toContain("<span className=\"blank\">{count?.mark ?? 'blank'}</span>");
    expect(l).toContain("'Why it stays out of the total, and what would fix it'");
  });
});

import { parseJourney, notReadAsCare, AGE_NOW_REASON, DIAGNOSIS_REASON, NOT_YOURS_OR_NOT_YET_REASON, readOnPurpose } from '../lib/mapper';
import { ITEMS } from '../lib/store';

describe('flow3-6 fragments are not steps', () => {
  const read = (s: string) => parseJourney(s, ITEMS).filter((x) => !x.absorbed)
    .map((x) => ({ raw: x.raw, item: x.result.item, gapCategory: x.result.gapCategory, months: x.result.months, reason: x.result.reason }));
  it.each(['im 19 now', "she's 13 now", 'my daughter is 9 now', 'I turned 40', "I'm 34 years old"])('"%s" is an age, read on purpose, never a step', (s) => {
    const [l] = read(s);
    expect(l.reason).toBe(AGE_NOW_REASON);
    expect(readOnPurpose(l.reason)).toBe(true);
    expect(notReadAsCare(l)).toBe(true);
  });
  it('"they think it\'s POTS" and "they said it might be lupus" name a condition, not care that has not happened', () => {
    expect(read("they think it's POTS")[0].reason).toBe(DIAGNOSIS_REASON);
    expect(read('they said it might be lupus')[0].reason).toBe(DIAGNOSIS_REASON);
    expect(read('they might do an MRI next month')[0].reason).toBe(NOT_YOURS_OR_NOT_YET_REASON);
  });
  it('the audit sentence: the two ages are the length of the search (flow3-17), care and the condition stay', () => {
    const ls = read('got sick at 12 and im 19 now, saw my pediatrican like 10 tims, they think its POTS.');
    expect(ls.map((l) => [l.gapCategory, l.months])).toEqual([['time-searching', 84], [null, null], [null, null]]);
    /* FLOW5 flow5-2: the condition ("they think its POTS") is context, not a
       blank line of care: it stays on the ledger under "The diagnosis, in your
       words" and in the Brief's head, and leaves the care list and its count. */
    expect(ls.map(notReadAsCare)).toEqual([false, false, true]);
    expect(read('got sick at 12, diagnosed at 15, im 19 now').map(notReadAsCare)).toEqual([false, true]);
  });
  it('care, counts, gaps and short care phrases are never dropped', () => {
    for (const s of ['went to 3 er visits', 'an echo', 'blood work', 'told it was anxiety by 3 diffrent doctors', 'flow-audit test']) {
      expect(read(s).some(notReadAsCare), s).toBe(false);
    }
  });
  it('the ledger keeps them under "Not read as care"; the Brief leaves them out', () => {
    const l = src('components/Ledger.tsx');
    expect(l).toContain("label: 'Not read as care'");
    expect(l).toContain('if (!l.entry.item && notReadAsCare({ ...l.entry, reason: reasonOf(l.entry) })) continue;');
  });
});

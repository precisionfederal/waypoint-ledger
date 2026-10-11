/* JUDGE-6 #6: "My daughter is 14." came back from the reader as an age (never
   priced) and was then counted on the ledger tile as "2 Without a federal
   figure" (the CT plus the age) and printed on the sheet as a cost row
   "My daughter is 14. | not matched to a federal figure | 1". The ledger
   already listed it under "Not read as care" and the Brief left it out; now
   the sheet's isCareLine, and so the tile, the sheet rows and its count, agree. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SELECTABLE, TABLE } from '../lib/table';
import { AGE_NOW_REASON, mapUtterance } from '../lib/mapper';
import { NO_FIGURE, gapSummary, isCareLine, noteRowsOf, sheetRowsOf } from '../lib/sheet';
import type { JourneyEntry } from '../lib/types';

const item = (id: string) => { const it = TABLE.find((x) => x.id === id); if (!it) throw new Error(id); return it; };
/** A line as the store keeps it: the reader's own item and reason. */
const read = (key: string, raw: string, times = 1): JourneyEntry => {
  const m = mapUtterance(raw, SELECTABLE);
  return { key, raw, item: m.item, times, reason: m.reason ?? null, gapCategory: m.gapCategory ?? null, months: m.months ?? null } as JourneyEntry;
};

describe('JUDGE-6 #6: an age is never a line without a federal figure', () => {
  it('the reader reads each of these as an age', () => {
    for (const raw of ['My daughter is 14.', 'im 19 now', 'she turned 14 this year', 'My son is 9']) {
      const e = read('a', raw);
      expect(e.item).toBeNull();
      expect((e as JourneyEntry & { reason: string }).reason).toBe(AGE_NOW_REASON);
      expect(isCareLine(e)).toBe(false);
    }
  });

  it('the child story counts the CT, not the age, and prints the age as her words', () => {
    const entries: JourneyEntry[] = [
      read('age', 'My daughter is 14.'),
      { key: 'ped', raw: 'saw her pediatrician six times', item: item('cms-99213'), times: 6 },
      /* an unpriced step that names care, as the CT was in the judge's story */
      { key: 'ct', raw: 'a CT at the hospital they never billed', item: null, times: 1 },
    ];
    const g = gapSummary(entries);
    expect(new Map(g.cats).get(NO_FIGURE)).toEqual({ lines: 1, times: 1 });
    expect(sheetRowsOf(entries).map((e) => e.key)).toEqual(['ped', 'ct']);
    expect(noteRowsOf(entries).map((e) => e.key)).toEqual(['age']);
  });

  it('the ledger tile and the journey preview count from the same gapSummary', () => {
    const ledger = readFileSync(new URL('../components/Ledger.tsx', import.meta.url), 'utf8');
    expect(ledger).toContain('const blankLines = (gaps.cats.find(([id]) => id === NO_FIGURE)?.[1].lines ?? 0) + gaps.named.length;');
    expect(ledger).toMatch(/function brief\(\)[\s\S]{0,400}if \(!l\.entry\.item && notReadAsCare\(/);
    const builder = readFileSync(new URL('../components/JourneyBuilder.tsx', import.meta.url), 'utf8');
    expect(builder).toContain('gapSummary(');
  });

  it('a step that names care keeps its row', () => {
    expect(isCareLine({ key: 'x', raw: 'a lumbar puncture at the hospital', item: null, times: 1 })).toBe(true);
    expect(isCareLine(read('y', 'a lumbar puncture'))).toBe(true);
  });
});

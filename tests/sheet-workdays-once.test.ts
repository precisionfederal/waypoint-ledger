/* JUDGE-7 #4 (2026-10-01): the lupus story's sheet printed "Workdays you
   missed: 30 days · $7,506.00" AND named "Days of work you missed" as a real
   cost with no defensible federal figure, counted in "Without a federal
   figure". With days on the workdays card, the sheet leaves lost work out of
   the count, the named list and the size check; with no days, it stays. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LOST_WORK_LABEL, countedGaps, sheetSizeOf } from '../components/sheet/sheet-size';
import { gapSummary } from '../lib/sheet';
import { EMPTY_BURDENS } from '../lib/burdens';
import type { JourneyEntry } from '../lib/types';

const unmatched = { key: 'u', raw: 'an ultrasound of my wrist', item: null, times: 1 } as unknown as JourneyEntry;
const named = [LOST_WORK_LABEL, 'Travel to appointments'];
const size = (workdays: number) => sheetSizeOf({ entries: [unmatched], lines: [], fits: new Map(), gaps: gapSummary([unmatched], named), burdens: { ...EMPTY_BURDENS, workdays }, paid: false, locality: false });

describe('missed work prints once on the sheet', () => {
  it('the label is the ledger\'s own', () => {
    expect(LOST_WORK_LABEL).toBe('Days of work you missed');
  });
  it('with days on the workdays card, lost work leaves the named list; every other named cost and line stays', () => {
    const c = countedGaps(gapSummary([unmatched], named), { ...EMPTY_BURDENS, workdays: 30 });
    expect(c.named).toEqual(['Travel to appointments']);
    expect(c.cats.map(([id]) => id)).toEqual(['no-federal-figure']);
    expect(c.empty).toBe(false);
  });
  it('with no days entered, lost work is still named exactly as before', () => {
    const g = gapSummary([unmatched], named);
    expect(countedGaps(g, EMPTY_BURDENS)).toEqual(g);
    expect(countedGaps(g, EMPTY_BURDENS).named).toContain(LOST_WORK_LABEL);
  });
  it('a counted line that held only lost work is left off when the card holds the days', () => {
    expect(countedGaps(gapSummary([], [LOST_WORK_LABEL]), { ...EMPTY_BURDENS, workdays: 30 }).empty).toBe(true);
    expect(countedGaps(gapSummary([], [LOST_WORK_LABEL]), EMPTY_BURDENS).empty).toBe(false);
  });
  it('the size check counts the named item only when the sheet prints it', () => {
    expect(size(0).gapChars).toBeGreaterThan(size(30).gapChars);
    expect(size(0).gapItems).toBe(2);
    expect(size(30).gapItems).toBe(2);
  });
  it('the sheet counts "Without a federal figure" and prints the named list from countedGaps', () => {
    const src = readFileSync('app/sheet/page.tsx', 'utf8');
    expect(src).toContain('const noFigureLines = (gaps.cats.find(([id]) => id === NO_FIGURE)?.[1].lines ?? 0) + counted.named.length;');
    expect(src).toContain('{counted.named.join(\' · \')}');
    expect(src).not.toContain('gaps.named.length');
  });
});

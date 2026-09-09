/* The appointment sheet is the artifact the whole product ends in: the page a
   person hands a clinician or attaches to a leave request. These tests hold the
   two promises that page makes. First, it carries the WHOLE burden — the priced
   lines, the four counts the claims files never see, and the care that did not
   happen — and never sums across them. Second, it prints: on Letter, from a
   phone, with type that was never shrunk to make it fit. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  NO_FIGURE, TIME_SEARCHING, fitTally, gapLabel, gapSummary, gapWhy, monthsPhrase,
} from '../lib/sheet';
import { burdenCards, EMPTY_BURDENS } from '../lib/burdens';
import { TABLE } from '../lib/table';
import type { JourneyEntry } from '../lib/types';

const item = (id: string) => {
  const it = TABLE.find((i) => i.id === id);
  if (!it) throw new Error(`fixture row ${id} is not in the published table`);
  return it;
};
/* The mapper is free to add fields; the sheet reads two of them. The cast keeps
   this fixture honest about exactly what the sheet depends on. */
const gapEntry = (key: string, raw: string, gapCategory: string, months?: number): JourneyEntry =>
  ({ key, raw, item: null, times: 1, gapCategory, months }) as unknown as JourneyEntry;

const PRINT_CSS = readFileSync(new URL('../app/sheet/print.css', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../app/sheet/page.tsx', import.meta.url), 'utf8');

describe('care that did not happen is counted, never priced', () => {
  it('counts a negated segment under its own category and gives it no figure', () => {
    const g = gapSummary([gapEntry('a', 'I could not afford the specialist so I never went', 'care-not-sought')]);
    expect(g.cats).toEqual([['care-not-sought', { lines: 1, times: 1 }]]);
    expect(g.empty).toBe(false);
    expect(JSON.stringify(g)).not.toMatch(/\$|usd|valueUsd/i);
  });

  it('keeps a denial apart from a step that simply has no published figure', () => {
    const g = gapSummary([
      gapEntry('a', 'the insurer denied the MRI', 'care-denied'),
      { key: 'b', raw: 'a lumbar puncture', item: null, times: 2 },
    ]);
    expect(new Map(g.cats).get('care-denied')).toEqual({ lines: 1, times: 1 });
    expect(new Map(g.cats).get(NO_FIGURE)).toEqual({ lines: 1, times: 2 });
  });

  it('sums a duration into months and never lets it become a line of care', () => {
    const g = gapSummary([
      gapEntry('a', 'six months of waiting', TIME_SEARCHING, 6),
      gapEntry('b', 'two years of appointments', TIME_SEARCHING, 24),
    ]);
    expect(g.months).toBe(30);
    expect(g.cats).toEqual([]);
  });

  it('never counts a priced line as a gap', () => {
    const g = gapSummary([{ key: 'a', raw: 'saw my doctor', item: item('cms-99214'), times: 3 }]);
    expect(g.empty).toBe(true);
  });

  it('carries the costs this product names and will not price', () => {
    const g = gapSummary([], ['Travel to appointments', 'What you paid out of pocket']);
    expect(g.named).toHaveLength(2);
    expect(g.empty).toBe(false);
  });

  it('says why in English, for a category it has never seen', () => {
    expect(gapLabel('care-not-sought')).toBe('care you needed and did not get');
    expect(gapLabel('some-new-category')).toBe('some new category');
    expect(gapWhy('care-not-sought')).toMatch(/never priced/);
    expect(gapWhy(TIME_SEARCHING)).toMatch(/not a unit of care/);
    expect(gapWhy(NO_FIGURE)).toMatch(/rather than estimated/);
  });
});

describe('the counts a person reads', () => {
  it('says a length of time exactly, never rounded away', () => {
    expect(monthsPhrase(1)).toBe('1 month');
    expect(monthsPhrase(11)).toBe('11 months');
    expect(monthsPhrase(12)).toBe('1 year');
    expect(monthsPhrase(30)).toBe('2 years 6 months');
    expect(monthsPhrase(-4)).toBe('0 months');
  });

  it('counts the fit verdicts without hard-coding them', () => {
    expect(fitTally(['DESCRIBES YOU', 'NOT DESCRIBED', 'DESCRIBES YOU'])).toEqual([
      ['DESCRIBES YOU', 2], ['NOT DESCRIBED', 1],
    ]);
    expect(fitTally([])).toEqual([]);
  });
});

describe('the sheet carries the whole burden', () => {
  it('reads the four burden counts from the same module the ledger writes', () => {
    expect(PAGE).toMatch(/from '@\/lib\/burdens'/);
    expect(PAGE).toMatch(/loadBurdens/);
    expect(PAGE).toMatch(/burdenCards/);
    expect(PAGE).toMatch(/sheet-burdens/);
    expect(PAGE).toMatch(/sheet-gaps/);
  });

  it('prints every burden the ledger holds, with its arithmetic and its source', () => {
    const cards = burdenCards({ ...EMPTY_BURDENS, workdays: 40, careHours: 200, trips: 30, dismissed: 4 });
    expect(cards).toHaveLength(4);
    for (const c of cards) expect(c.count).toBeGreaterThan(0);
    const priced = cards.filter((c) => c.valueUsd !== null);
    expect(priced.length).toBe(2);
    for (const c of priced) { expect(c.arithmetic).toBeTruthy(); expect(c.source.title).toBeTruthy(); }
    const counted = cards.filter((c) => c.valueUsd === null);
    for (const c of counted) expect(c.noFigureReason).toBeTruthy();
  });

  it('never offers a total across the burdens', () => {
    expect(PAGE).toMatch(/never added to another|none is added to another/i);
    /* there is no function anywhere that adds two burden cards together */
    expect(readFileSync(new URL('../lib/burdens.ts', import.meta.url), 'utf8')).not.toMatch(/function\s+totalBurdens/);
  });

  it('shows the fit answer above the rows that carry it', () => {
    expect(PAGE).toMatch(/sheet-fit/);
    expect(PAGE).toMatch(/Does the published figure describe you/);
  });
});

describe('the sheet prints', () => {
  it('is a Letter page with real margins', () => {
    expect(PRINT_CSS).toMatch(/@page\s*\{[^}]*size:\s*Letter/);
    expect(PRINT_CSS).toMatch(/margin:\s*0\.5in/);
  });

  it('puts the table back on paper, whatever the phone showed', () => {
    expect(PRINT_CSS).toMatch(/\.sheet-table\s*\{\s*display:\s*table\s*!important/);
    expect(PRINT_CSS).toMatch(/\.sheet-table thead\s*\{\s*display:\s*table-header-group/);
    expect(PRINT_CSS).toMatch(/td\[data-label\]::before\s*\{\s*content:\s*none/);
  });

  it('keeps a burden card and a table row whole on one page', () => {
    expect(PRINT_CSS).toMatch(/\.sheet-table tr\s*\{[^}]*break-inside:\s*avoid/);
    expect(PRINT_CSS).toMatch(/\.sheet-burdens article\s*\{[^}]*break-inside:\s*avoid/);
  });

  it('prints a card\'s source once, in the citation list at the foot', () => {
    /* the card keeps its source on screen; on paper the same title is printed in
       full under "Where every figure comes from", so the card drops the repeat */
    expect(PRINT_CSS).toMatch(/\.sheet-burdens \.sb-src \{\s*display: none/);
    expect(PAGE).toMatch(/className="sb-why"/);
    expect(PAGE).toMatch(/noFigureReason/);
  });

  it('never shrinks type to fit the page: no print rule below 11pt', () => {
    const sizes = [...PRINT_CSS.matchAll(/font-size:\s*([\d.]+)pt/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(5);
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(11);
  });
});

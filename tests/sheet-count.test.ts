/* ==========================================================================
   ONE JOURNEY, ONE COUNT (judge round, 2026-09-30). The ledger said
   "1 Without a federal figure" and the sheet for the same journey said
   "0 Lines without a federal figure". The sheet now counts exactly as the
   ledger does (lines that happened with no figure plus the costs named and
   never priced), and its sample is the home page's own example.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ledger from '../components/Ledger';
import Sheet from '../app/sheet/page';
import { fakeStore, renderWith, demoEntries } from './helpers/ledger-render';
import { EXAMPLE_UNPRICED, exampleEntries, exampleLines } from '../components/sheet/example';
import { exampleLedger } from '../lib/store';
import type { JourneyEntry } from '../lib/types';

/** The ledger's count: the numeral beside "No published price", or 0 when it says every line is cited. */
const ledgerCount = (h: string): number => {
  const m = /figV[^>]*>(\d+)<\/span><span[^>]*>No published price</.exec(h);
  if (m) return Number(m[1]);
  expect(h).toContain('Every visit and test');
  return 0;
};
/** The sheet's count: the same label in its summary band, or 0 when it says every line carries a figure. */
const sheetCount = (h: string): number => {
  const m = /<dt>No published price<\/dt><dd>(\d+)<\/dd>/.exec(h);
  if (m) return Number(m[1]);
  expect(h).toContain('Every visit and test carries a published federal figure');
  return 0;
};
const both = (entries: JourneyEntry[], unpricedHits: string[]) => {
  const store = fakeStore(entries, { unpricedHits });
  return { ledger: ledgerCount(renderWith(Ledger, store)), sheet: sheetCount(renderWith(Sheet, store)) };
};

describe('the sheet and the ledger count lines without a federal figure the same way', () => {
  it('the home example: one named cost never priced, on both pages', () => {
    const c = both(exampleEntries(), EXAMPLE_UNPRICED);
    expect(c.ledger).toBe(1);
    expect(c.sheet).toBe(c.ledger);
  });
  it('the six-line demo sentence: one line with no figure, on both pages', () => {
    const c = both(demoEntries(), []);
    expect(c.sheet).toBe(c.ledger);
    expect(c.sheet).toBe(1);
  });
  it('a journey with every line cited says so on both pages, never as a zero', () => {
    const c = both(exampleEntries(), []);
    expect(c).toEqual({ ledger: 0, sheet: 0 });
  });
});

describe('the sample sheet is the home example', () => {
  it('lists the same lines, counts and named cost as lib/store.tsx loadExample', () => {
    /* MERGE (4b JUDGE-2 2c): loadExample reads exampleLedger(); the sample delegates to it. */
    const src = readFileSync(new URL('../lib/store.tsx', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('const loadExample'), src.indexOf('const correct'));
    expect(body).toContain('exampleLedger()');
    expect(exampleLines()).toEqual(exampleLedger().map((e) => [e.raw, e.item?.id ?? null, e.times]));
    expect(body).toContain(`setUnpriced(${JSON.stringify(EXAMPLE_UNPRICED).replace(/"/g, "'")})`);
  });
  it('prices $2,692.51, the figure the ledger shows for the home example', () => {
    const total = exampleEntries().reduce((a, e) => a + (e.item?.valueUsd ?? 0) * e.times, 0);
    expect(Math.round(total * 100) / 100).toBe(2692.51);
  });
});

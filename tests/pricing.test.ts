/* The pricing layer performs exactly one arithmetic operation: a published figure
   times a count the person supplied. These tests exist to make any second operation
   — an average, an adjustment, a fallback, a default — fail loudly. */
import { describe, it, expect } from 'vitest';
import { priceEntry, priceJourney, totals, basisWarning, grossLines, usd, abbreviateUsd, priceTableIsLoaded } from '../lib/pricing';
import { TABLE, SELECTABLE, SUMMABLE, rulesFor, checkCombination, bundlingNote, TABLE_VERSION } from '../lib/table';
import type { JourneyEntry, PriceItem } from '../lib/types';

const item = (id: string): PriceItem => {
  const it = TABLE.find((i) => i.id === id);
  if (!it) throw new Error(`fixture row ${id} is not in the published table`);
  return it;
};
const entry = (id: string | null, times = 1, raw = 'x'): JourneyEntry =>
  ({ key: `${id}-${times}`, raw, item: id ? item(id) : null, times });

describe('priceEntry — one multiplication, never a guess', () => {
  it('multiplies the published figure by the count', () => {
    const it = item('cms-99214');
    const line = priceEntry(entry('cms-99214', 3));
    expect(line.priced).toBe(true);
    expect(line.totalUsd).toBeCloseTo((it.valueUsd as number) * 3, 6);
  });

  it('leaves a line unpriced when the row carries no published figure', () => {
    const line = priceEntry(entry('hcup2021-ed-cost-to-charge-ratio'));
    expect(item('hcup2021-ed-cost-to-charge-ratio').valueUsd).toBeNull();
    expect(line.priced).toBe(false);
    expect(line.totalUsd).toBeNull();
    expect(line.outOfPocketUsd).toBeNull();
  });

  it('leaves a line unpriced when nothing in the table matched', () => {
    const line = priceEntry(entry(null, 2, 'three nights in the hospital'));
    expect(line.priced).toBe(false);
    expect(line.totalUsd).toBeNull();
  });

  it('clamps the count to 1..365 and never invents a fraction', () => {
    expect(priceEntry(entry('cms-99214', 0)).totalUsd).toBeCloseTo(item('cms-99214').valueUsd as number, 6);
    expect(priceEntry(entry('cms-99214', 4000)).totalUsd).toBeCloseTo((item('cms-99214').valueUsd as number) * 365, 6);
    expect(priceEntry({ ...entry('cms-99214'), times: NaN }).totalUsd).toBeCloseTo(item('cms-99214').valueUsd as number, 6);
    expect(priceEntry({ ...entry('cms-99214'), times: 2.7 }).totalUsd).toBeCloseTo((item('cms-99214').valueUsd as number) * 2, 6);
  });

  it('reports the out-of-pocket share only where the source publishes one', () => {
    const oop = TABLE.find((i) => i.outOfPocketUsd !== null && i.valueUsd !== null);
    if (oop) expect(priceEntry(entry(oop.id, 2)).outOfPocketUsd).toBeCloseTo((oop.outOfPocketUsd as number) * 2, 6);
    expect(priceEntry(entry('cms-99214', 2)).outOfPocketUsd).toBeNull();
  });
});

describe('totals', () => {
  const lines = priceJourney([entry('cms-99214', 3), entry('cms-img-echo'), entry(null, 1, 'mold in the flat')]);

  it('counts priced and unpriced lines separately and adds only the priced ones', () => {
    const t = totals(lines);
    expect(t.pricedCount).toBe(2);
    expect(t.unpricedCount).toBe(1);
    expect(t.totalUsd).toBeCloseTo((item('cms-99214').valueUsd as number) * 3 + (item('cms-img-echo').valueUsd as number), 6);
  });

  it('reports the bases actually present so the UI can say what it summed', () => {
    expect(totals(lines).basesUsed).toEqual(['allowed']);
    expect(totals(priceJourney([])).totalUsd).toBe(0);
  });

  it('never adds a row the table marks non-summable, because such a row cannot be selected', () => {
    // The guard is structural: SELECTABLE is what a person can put in a ledger.
    for (const it of SELECTABLE) expect(rulesFor(it.id).summable).toBe(true);
    expect(SELECTABLE.some((i) => i.id === 'meps2022-longcovid-excess-total')).toBe(false);
    expect(SUMMABLE.length).toBeLessThan(TABLE.length);
  });
});

describe('checkCombination — two true figures that must not be added', () => {
  it('flags a whole-year figure against every per-event line', () => {
    const r = checkCombination(['meps2022-longcovid-excess-total', 'cms-99214', 'cms-img-echo']);
    expect(r.conflicts.map((c) => c.drop).sort()).toEqual(['cms-99214', 'cms-img-echo']);
    expect(r.nonSummable).toEqual(['meps2022-longcovid-excess-total']);
    expect(r.conflicts[0].reason).toMatch(/counts the same care twice/);
  });

  it('flags the ER halves against the complete ER visit', () => {
    const r = checkCombination(['cms-ed-99284-complete', 'cms-ed-99284-facility-only']);
    expect(r.conflicts.length).toBeGreaterThan(0);
  });

  it('says nothing when the lines are independent', () => {
    const r = checkCombination(['cms-99214', 'cms-img-echo', 'cms-test-holter']);
    expect(r.conflicts).toEqual([]);
    expect(r.nonSummable).toEqual([]);
    expect(r.bundlingRisk).toBe(false);
    expect(bundlingNote(['cms-99214', 'cms-img-echo'])).toBeNull();
  });

  it('warns when a bundled figure sits beside unbundled line items', () => {
    expect(bundlingNote(['meps2014-office-visit-any', 'cms-lab-cbc'])).toMatch(/count some tests twice/);
  });
});

describe('basisWarning — the total says out loud when it mixes measures', () => {
  it('fires when two different measures are summed', () => {
    expect(basisWarning(['allowed', 'out_of_pocket'])).toMatch(/different measures/);
  });
  it('does not fire on one measure', () => {
    expect(basisWarning(['allowed', 'allowed'])).toBeNull();
    expect(basisWarning([])).toBeNull();
  });
  it('does not fire when the only other stack is lost time, which is legitimately separate', () => {
    expect(basisWarning(['allowed', 'wage'])).toBeNull();
  });
  it('names each measure it mixed', () => {
    const w = basisWarning(['charge', 'payment']) as string;
    expect(w).toContain('billed charges');
    expect(w).toContain('payments');
  });
});

describe('formatting and table health', () => {
  it('formats dollars without inventing precision', () => {
    expect(usd(135.61)).toBe('$136');
    expect(usd(135.61, true)).toBe('$135.61');
    expect(usd(null)).toBe('—');
    expect(usd(NaN)).toBe('—');
    expect(usd(1234567)).toBe('$1,234,567');
  });
  it('abbreviates only above a thousand', () => {
    expect(abbreviateUsd(950)).toBe('$950');
    expect(abbreviateUsd(4_100)).toBe('$4K');
    expect(abbreviateUsd(2_400_000)).toBe('$2.4M');
    expect(abbreviateUsd(null)).toBe('—');
  });
  it('ships a loaded, versioned table where every row carries its source and coverage', () => {
    expect(priceTableIsLoaded(TABLE)).toBe(true);
    expect(TABLE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}/);
    for (const i of TABLE) {
      expect(i.sourceTitle.length).toBeGreaterThan(0);
      expect(i.coverage.length).toBeGreaterThan(0);
      expect(i.year.length).toBeGreaterThan(0);
    }
  });
  it('separates gross figures from excess figures', () => {
    const g = grossLines(priceJourney([entry('cms-99214'), entry('cms-img-echo')]));
    expect(g).toHaveLength(2);
    expect(TABLE.some((i) => i.attribution === 'excess')).toBe(true);
  });
});

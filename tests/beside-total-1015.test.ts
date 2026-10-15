/* Judge panel 15 Oct #2.1 (B-1): "He prescribed an antidepressant." put the yearly
   prescriptions survey figure ($54, 2018 dollars, out of pocket) inside a total of
   2026 Medicare allowed amounts: "$4,136 across 10 priced lines". A row the table
   marks summable:false is now kept out of totalUsd, pricedCount and the bases, and
   returned beside the total for the page to print. */
import { describe, it, expect } from 'vitest';
import { parseJourney } from '../lib/mapper';
import { ITEMS, exampleLedger } from '../lib/store';
import { rulesFor } from '../lib/table';
import { basisWarning, besideFigures, besideSentence, priceJourney, totals } from '../lib/pricing';
import { buildJourneyModel } from '../components/JourneyMap';
import { shareCardData } from '../components/JourneyBuilder';
import type { JourneyEntry } from '../lib/types';

const RX = 'meps2018-retail-rx-out-of-pocket';
const said = (story: string): JourneyEntry[] =>
  parseJourney(story, ITEMS).filter((s) => !s.absorbed)
    .map((s, i) => ({ key: `k${i}`, raw: s.raw, item: s.result.item, times: s.times }) as JourneyEntry);

describe('B-1: a summable:false row never enters the total', () => {
  const base = exampleLedger();
  const withRx = [...base, ...said('He prescribed an antidepressant.')];

  it('the rx row is the one the table marks non-summable', () => {
    expect(withRx.some((e) => e.item?.id === RX)).toBe(true);
    expect(rulesFor(RX).summable).toBe(false);
  });

  it('the total, the priced count and the bases are the Medicare lines alone', () => {
    const before = totals(priceJourney(base));
    const after = totals(priceJourney(withRx));
    const medicareOnly = priceJourney(withRx)
      .filter((l) => l.priced && l.entry.item?.id !== RX)
      .reduce((a, l) => a + (l.totalUsd ?? 0), 0);
    expect(after.totalUsd).toBeCloseTo(medicareOnly, 6);
    expect(after.totalUsd).toBeCloseTo(before.totalUsd, 6);
    expect(after.pricedCount).toBe(before.pricedCount);
    expect(after.basesUsed).toEqual(before.basesUsed);
    expect(after.outOfPocketUsd).toBeCloseTo(before.outOfPocketUsd, 6);
    expect(basisWarning(after.basesUsed)).toBeNull();
  });

  it('the rx line is returned beside the total, and the page says so with its own figure and dollar year', () => {
    const t = totals(priceJourney(withRx));
    expect(t.beside.map((l) => l.entry.item?.id)).toEqual([RX]);
    const rx = ITEMS.concat().find((i) => i.id === RX) ?? t.beside[0].entry.item!;
    const f = besideFigures(t.beside);
    expect(f).toHaveLength(1);
    expect(f[0].usd).toBe(rx.valueUsd);
    expect(besideSentence(t.beside)).toBe(
      `Shown beside the total, not in it: ${rx.label}, $${rx.valueUsd!.toFixed(2)} (${rx.year} dollars)`,
    );
    expect(besideSentence(totals(priceJourney(base)).beside)).toBeNull();
  });

  it('the journey map, its running total and the share card carry the same total', () => {
    const lines = priceJourney(withRx);
    const t = totals(lines);
    const m = buildJourneyModel(lines);
    expect(m.totalUsd).toBeCloseTo(t.totalUsd, 2);
    expect(m.pricedCount).toBe(t.pricedCount);
    expect(Math.max(...m.stops.map((s) => s.runningUsd))).toBeCloseTo(t.totalUsd, 2);
    const card = shareCardData(lines, withRx.length, 0) as unknown as { total?: number; totalUsd?: number; bars: { total: number }[] };
    const cardTotal = card.totalUsd ?? card.total ?? 0;
    expect(cardTotal).toBeCloseTo(t.totalUsd, 2);
    expect(card.bars.reduce((a, b) => a + b.total, 0)).toBeCloseTo(t.totalUsd, 2);
  });
});

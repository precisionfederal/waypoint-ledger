/* ==========================================================================
   PRICING LAYER — deterministic table lookup, and nothing else.

   🔴 There is exactly one arithmetic operation in this file: multiply a
   published figure by a count the user supplied. There is no averaging, no
   inflation adjustment, no interpolation, no fallback, and no default. If a
   figure is null, the line is unpriced and stays unpriced.

   If you are tempted to add "a reasonable estimate" here, don't. The product's
   only real claim is that every number can be shown. One invented figure and
   the claim is gone.
   ========================================================================== */

import type {
  JourneyEntry, LedgerTotals, PriceBasis, PricedLine, PriceItem,
} from './types';

/**
 * `figureUsd` is the one hook for a DIFFERENT PUBLISHED FIGURE for the same unit
 * of care — the CMS locality allowed amount, or the published submitted charge an
 * uninsured person is billed against (see lib/fit.ts). It is never a figure this
 * code computed: the caller must hand in a number that is published somewhere.
 * Omit it and the row's own national figure is used. `null` means "nothing
 * published describes this person here", and the line goes unpriced rather than
 * silently falling back to a figure that describes someone else.
 */
export function priceEntry(entry: JourneyEntry, figureUsd?: number | null): PricedLine {
  const item = entry.item;
  const figure = figureUsd === undefined ? item?.valueUsd ?? null : figureUsd;
  if (!item || figure === null) {
    return { entry, priced: false, outOfPocketUsd: null, totalUsd: null };
  }
  const n = clampTimes(entry.times);
  return {
    entry,
    priced: true,
    outOfPocketUsd: item.outOfPocketUsd === null ? null : item.outOfPocketUsd * n,
    totalUsd: figure * n,
  };
}

export function priceJourney(
  entries: JourneyEntry[],
  figureFor?: (entry: JourneyEntry) => number | null | undefined,
): PricedLine[] {
  return entries.map((e) => priceEntry(e, figureFor ? figureFor(e) : undefined));
}

export function totals(lines: PricedLine[]): LedgerTotals {
  let outOfPocketUsd = 0;
  let totalUsd = 0;
  let outOfPocketReported = false;
  let pricedCount = 0;
  let unpricedCount = 0;
  const bases = new Set<PriceBasis>();

  for (const l of lines) {
    if (!l.priced) { unpricedCount++; continue; }
    pricedCount++;
    if (l.entry.item) bases.add(l.entry.item.basis);
    if (l.outOfPocketUsd !== null) { outOfPocketUsd += l.outOfPocketUsd; outOfPocketReported = true; }
    if (l.totalUsd !== null) totalUsd += l.totalUsd;
  }

  return {
    outOfPocketUsd,
    totalUsd,
    outOfPocketReported,
    pricedCount,
    unpricedCount,
    basesUsed: [...bases],
  };
}

/**
 * 🔴 Basis hygiene. Charges, allowed amounts and payments answer different
 * questions and summing them silently is the most common way a cost-of-illness
 * total becomes meaningless. When more than one basis is present the UI must
 * say so out loud rather than print a clean single number.
 */
export function basisWarning(basesUsed: PriceBasis[]): string | null {
  const distinct = new Set(basesUsed);
  distinct.delete('wage'); // lost time is legitimately a separate stack
  if (distinct.size <= 1) return null;

  const names: Record<PriceBasis, string> = {
    charge: 'billed charges',
    allowed: 'allowed amounts',
    payment: 'payments',
    out_of_pocket: 'out-of-pocket payments',
    total_expenditure: 'total expenditures',
    wage: 'wages',
  };
  const list = [...distinct].map((b) => names[b]).join(' and ');
  return `This total mixes ${list}. Those are different measures — a billed charge is not what ` +
         `anyone paid, and an allowed amount is not an out-of-pocket cost. Read the total as a ` +
         `rough magnitude, not an exact sum, and open any line to see which measure it uses.`;
}

/** Lines whose figure is gross rather than excess, for the honesty note. */
export function grossLines(lines: PricedLine[]): PricedLine[] {
  return lines.filter((l) => l.priced && l.entry.item?.attribution === 'gross');
}

function clampTimes(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(365, Math.floor(n)));
}

export function usd(n: number | null, cents = false): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

export function abbreviateUsd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return usd(n);
}

export function priceTableIsLoaded(table: PriceItem[]): boolean {
  return table.some((i) => i.valueUsd !== null);
}

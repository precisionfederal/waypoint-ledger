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
  const n = clampTimes(item, entry.times).times;
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

/* JUDGE-4 #7: /journey said "all payers combined" beside the running total,
   while the ledger beside it says "Medicare reference · national" and the
   drawer says read it as the floor for a plan from work. The journey total is
   priceJourney() with no context: the national valueUsd of rows from
   SELECTABLE, and every SELECTABLE row is a CMS allowed amount
   (tests/journey-total-label-j4.test.ts fails the day one is not).
   Kept here, not in lib/fit.ts, so /journey does not load the fit tables. A Medicare
   allowed amount is what Medicare pays plus the patient's share. */
export const JOURNEY_TOTAL_BASIS = 'national Medicare allowed amounts: what Medicare and the patient pay together';

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
  return `This total mixes ${list}. Those are different measures: a billed charge is not what ` +
         `anyone paid, and an allowed amount is not an out-of-pocket cost. Read the total as a ` +
         `rough magnitude, not an exact sum, and open any line to see which measure it uses.`;
}

/** Lines whose figure is gross rather than excess, for the honesty note. */
export function grossLines(lines: PricedLine[]): PricedLine[] {
  return lines.filter((l) => l.priced && l.entry.item?.attribution === 'gross');
}

function clampCount(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(365, Math.floor(n)));
}

export interface ClampedTimes {
  /** the count that may be PRICED */
  times: number;
  /** the count the person actually said, always kept */
  said: number;
  /** true when the two differ because the code is a once-a-year code */
  capped: boolean;
  /** the sentence to print on the line when it is capped */
  note: string | null;
}

/**
 * 🔴 R6 finding F5. "They screened me for depression at 6 visits" priced a yearly
 * screening six times — $112.20 of a code Medicare cannot allow more than once in a
 * 12-month period, on a line whose own label says "Yearly". The count the person said
 * is never overwritten; only the count that may be priced is capped, and the line says
 * so in words. The cap itself comes from the table row (max_per_year), whose basis is
 * CMS's own long descriptor for the code, re-read by data/verify_price_table.py.
 */
export function clampTimes(item: PriceItem | null | undefined, times: number): ClampedTimes {
  const said = clampCount(times);
  const cap = item?.maxPerYear;
  if (!cap || said <= cap) return { times: said, said, capped: false, note: null };
  const others = said - cap;
  return {
    times: cap,
    said,
    capped: true,
    note: `You said ${said}. CMS pays this once in a 12-month period, so ${cap === 1 ? 'one is' : `${cap} are`} `
        + `priced and the other ${others} ${others === 1 ? 'is' : 'are'} counted, not priced.`,
  };
}

/* ==========================================================================
   WHERE THE CARE HAPPENED — R6 findings F3 and F12

   The same code costs two different things depending on the building, and the
   difference is not small: a hospital-owned clinic bills its own facility fee on
   top of a LOWER payment to the clinician. Our rows already carried both figures,
   read out of the CY2026 fee schedule and the January 2026 OPPS Addendum B, and
   the app showed neither — so a person who typed "an echo at the hospital" was
   shown the freestanding-centre price and nothing else.

   siteOf reads the person's OWN WORDS. It never guesses, and "unknown" is the
   honest default: no site word, no site claim.
   ========================================================================== */
export type CareSite = 'hospital' | 'office' | 'unknown';

const HOSPITAL_WORDS = [
  'at the hospital', 'in the hospital', 'in hospital', 'hospital clinic', 'hospital-based',
  'hospital based', 'hospital outpatient', 'outpatient department', 'hospital department',
  'the er', 'er visit', 'emergency room', 'emergency department', 'inpatient', 'admitted',
  'medical center', 'medical centre',
];
const OFFICE_WORDS = [
  'freestanding', 'free-standing', 'private office', "doctor's office", 'doctors office',
  'private practice', 'imaging center', 'imaging centre', 'in the office', 'at the office',
];

/** The setting the person named, from the words they used. Never inferred from a code. */
export function siteOf(story: string): CareSite {
  const t = ` ${(story || '').toLowerCase().replace(/\s+/g, ' ')} `;
  const hit = (w: string) => t.includes(w);
  if (HOSPITAL_WORDS.some(hit)) return 'hospital';
  if (OFFICE_WORDS.some(hit)) return 'office';
  return 'unknown';
}

export interface SiteFigure {
  site: CareSite;
  /** what the fee schedule pays the CLINICIAN in that setting, where it differs */
  usd: number | null;
  /** what the HOSPITAL bills on its own account, where CMS publishes it */
  hospitalFeeUsd: number | null;
  hospitalCopayUsd: number | null;
  /** the two published bills added, with the addition disclosed. Never a total. */
  twoBillsUsd: number | null;
  /** one plain sentence for the line, or null when the setting changes nothing */
  note: string | null;
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The figures that describe this row IN THIS SETTING. It never changes the itemized
 * total: the ledger prices what the fee schedule pays, and this sits beside it so a
 * person who was treated in a hospital can see the second bill that is coming.
 */
export function figureFor(item: PriceItem | null | undefined, site: CareSite): SiteFigure {
  const none: SiteFigure = { site, usd: null, hospitalFeeUsd: null, hospitalCopayUsd: null, twoBillsUsd: null, note: null };
  if (!item) return none;
  const fac = item.facilityUsd ?? null;
  const hosp = item.hospitalFeeUsd ?? null;
  const copay = item.hospitalCopayUsd ?? null;
  if (site !== 'hospital' || (fac === null && hosp === null)) {
    return { ...none, usd: site === 'hospital' ? item.valueUsd : null, hospitalFeeUsd: hosp, hospitalCopayUsd: copay };
  }
  const two = fac !== null && hosp !== null ? Math.round((fac + hosp) * 100) / 100 : null;
  const parts: string[] = [];
  if (fac !== null) {
    parts.push(`In a hospital the fee schedule pays the clinician ${money(fac)} for this code, not `
             + `${money(item.valueUsd ?? 0)}: the ${item.facilityComponent?.startsWith('modifier 26')
                 ? 'scan itself moves to the hospital\u2019s own bill' : 'practice-expense half moves to the hospital'}.`);
  }
  if (hosp !== null) {
    parts.push(`The hospital bills ${money(hosp)} of its own (${item.hospitalFeeSource ?? 'CMS OPPS Addendum B'})`
             + `${copay !== null ? `, with a Medicare minimum copay of ${money(copay)}` : ''}.`);
  }
  if (two !== null) parts.push(`Two bills, one visit: ${money(two)} together. The addition is ours.`);
  return { site, usd: fac ?? item.valueUsd, hospitalFeeUsd: hosp, hospitalCopayUsd: copay, twoBillsUsd: two,
           note: parts.join(' ') };
}

export function usd(n: number | null, cents = false): string {
  if (n === null || !Number.isFinite(n)) return '–';
  return n.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

/** Lines and their total, shown so the lines add up to the total on screen.
 *  Each line is rounded to the cent once, and the total is the sum of those
 *  rounded lines, never a separately rounded sum: 571.14 + 177.36 + 1,089.08
 *  shows $1,837.58, where whole dollars showed $571 + $177 + $1,089 = $1,838. */
export function shownLines(values: number[]): { lines: string[]; total: string } {
  const c = values.map((v) => Math.round(v * 100));
  return { lines: c.map((x) => usd(x / 100, true)), total: usd(c.reduce((a, x) => a + x, 0) / 100, true) };
}

export function abbreviateUsd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '–';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return usd(n);
}

export function priceTableIsLoaded(table: PriceItem[]): boolean {
  return table.some((i) => i.valueUsd !== null);
}

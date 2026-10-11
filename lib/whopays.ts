/* ==========================================================================
   WHO CARRIES THIS COST — the ledger's Medicare lines split by published rule.

   NIH federal lead, Beta demo, 1 Oct 2026: "how much… is cost to the healthcare
   system, how much… is out of pocket, how much… is kind of invisible", and "are
   they real dollars, are they from this year… the interval that's being
   measured." This module answers both, from published rules only.

   🔴 WHAT THIS MODULE MAY AND MAY NOT DO
   · The split applies the 2026 Original Medicare Part B rules to the Medicare
     approved amounts already on the ledger. The deductible ($283) and the
     coinsurance rate (20%) are READ from the price table row
     cms2026-part-b-deductible (CMS fact sheet, source key "partb"); nothing
     here types a dollar figure.
   · The rule is chosen per line from the published Medicare.gov cost pages:
       physician fee schedule and hospital outpatient lines: the deductible,
         then 20% of the Medicare-approved amount
         (medicare.gov/coverage/doctor-other-health-care-provider-services,
          /diagnostic-non-laboratory-tests, /outpatient-hospital-services);
       clinical lab fee schedule lines: $0, no deductible
         (medicare.gov/basics/costs/medicare-costs "Clinical laboratory services
          $0 for covered clinical laboratory services");
       yearly depression and alcohol misuse screening: $0
         (medicare-costs "$0 for your yearly depression screening";
          /coverage/alcohol-misuse-screenings-counseling "You pay nothing").
   · The deductible is met once, across every line it applies to. Because the
     coinsurance rate is one rate, the order the lines are met in does not change
     the totals, so no visit order is assumed.
   · Lines on any other basis (MEPS survey spending, HCUP cost, BLS wages) are
     never split and never summed with these; they are listed on their own basis.
   · The private-plan figure is the hospital-published negotiated range already
     in each line's drawer, summed only low with low and high with high, over the
     lines that carry one, and never added to a Medicare figure.
   · Nothing here is "your bill" or "what you paid". It is a reference under a
     stated assumption, and the assumption is printed on its face.
   ========================================================================== */
import { TABLE, rulesFor } from './table';
import { clampTimes } from './pricing';
import { scheduleFigureOf, type Ctx, type Fit } from './fit';
import { privateRangeFor, medicareMarkerApplies } from './private-rates';
import type { JourneyEntry, PriceItem, PricedLine } from './types';

/* ---------------------------------------------------------------- the rules */

/** The price-table row the deductible and the coinsurance rate are read from. */
export const PART_B_ROW_ID = 'cms2026-part-b-deductible';
const PART_B_ROW = TABLE.find((i) => i.id === PART_B_ROW_ID) ?? null;
const PART_B_ALT = rulesFor(PART_B_ROW_ID).alternates as Record<string, unknown> | undefined;

export const PART_B = {
  year: PART_B_ROW?.year ?? '2026',
  /** Annual Part B deductible, read from the CMS fact sheet row. */
  deductibleUsd: PART_B_ROW?.valueUsd ?? null,
  /** Share of the Medicare-approved amount the person pays after the deductible. */
  coinsuranceRate: typeof PART_B_ALT?.coinsurance_rate_after_deductible === 'number' ? (PART_B_ALT.coinsurance_rate_after_deductible as number) : null,
  deductibleSource: {
    title: 'CMS fact sheet, 2026 Medicare Parts A & B premiums and deductibles',
    url: PART_B_ROW?.sourceUrl ?? 'https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles',
    quote: 'The annual deductible for all Medicare Part B beneficiaries will be $283 in 2026',
  },
  coinsuranceSource: {
    title: 'Medicare.gov, Medicare costs',
    url: 'https://www.medicare.gov/basics/costs/medicare-costs',
    quote: 'Usually 20% of the cost for each Medicare-covered service or item after you’ve paid your deductible',
  },
} as const;

export type PartBRule = 'deductible-and-20' | 'no-share-lab' | 'no-share-preventive';

export const RULE_TEXT: Record<PartBRule, { short: string; source: string; url: string }> = {
  'deductible-and-20': {
    short: 'deductible, then 20%',
    source: 'After you meet the Part B deductible, you pay 20% of the Medicare-approved amount',
    url: 'https://www.medicare.gov/coverage/doctor-other-health-care-provider-services',
  },
  'no-share-lab': {
    short: 'lab test: $0, no deductible',
    source: '$0 for covered clinical laboratory services',
    url: 'https://www.medicare.gov/basics/costs/medicare-costs',
  },
  'no-share-preventive': {
    short: 'yearly screening: $0',
    source: '$0 for your yearly depression screening; alcohol misuse screening: you pay nothing if your provider accepts assignment',
    url: 'https://www.medicare.gov/basics/costs/medicare-costs',
  },
};

/** Yearly screenings Medicare.gov lists at $0 (depression G0444, alcohol misuse G0442). */
const PREVENTIVE_NO_SHARE = new Set(['cms-g0444', 'cms-g0442']);

/** Which Part B fee schedule a row is priced from, read off its source title.
 *  Mirrors lib/policy.ts scheduleOf for the three CMS payment schedules (kept
 *  here so the ledger does not load policy.ts's tables); tests/whopays.test.ts
 *  holds the two equal on every row of the price table. */
export function partBScheduleOf(item: Pick<PriceItem, 'sourceTitle'>): 'cms-pfs' | 'cms-opps' | 'cms-clfs' | null {
  const t = item.sourceTitle || '';
  if (/NOT a government publication|peer-reviewed/i.test(t)) return null;
  if (/Outpatient Prospective Payment/i.test(t)) return 'cms-opps';
  if (/Clinical Laboratory Fee Schedule/i.test(t)) return 'cms-clfs';
  if (/Physician Fee Schedule/i.test(t)) return 'cms-pfs';
  return null;
}

/** The coinsurance rate as a person reads it, "20%". */
export const RATE_PCT = PART_B.coinsuranceRate === null ? '' : `${Math.round(PART_B.coinsuranceRate * 100)}%`;

/** The Part B rule for a line, or null when the line is not a Part B payment
 *  amount (survey spending, a cost, a wage) and is therefore never split. */
export function partBRuleOf(item: PriceItem): PartBRule | null {
  if (item.pfsStatus === 'N') return null; // Medicare publishes the code and does not cover it
  const s = partBScheduleOf(item);
  if (!s) return null;
  if (s === 'cms-clfs') return 'no-share-lab';
  if (PREVENTIVE_NO_SHARE.has(item.id)) return 'no-share-preventive';
  return 'deductible-and-20';
}

/* ---------------------------------------------------------------- the split */

const cents = (n: number): number => Math.round(n * 100) / 100;

export interface SplitLine {
  key: string;
  label: string;
  /** the count that may be priced (once-a-year codes capped, as on the ledger) */
  times: number;
  rule: PartBRule;
  /** Medicare-approved amount for the line: the schedule figure for this place, times the count */
  approvedUsd: number;
}

export interface OtherBasisLine { key: string; label: string; basis: string; year: string; totalUsd: number | null }

export interface PrivateSpan {
  lowUsd: number;
  highUsd: number;
  /** Medicare lines whose drawer shows a hospital range for the same fee */
  lines: number;
  /** Medicare lines with no such range (fewer than two hospitals, or an encounter that is two fees) */
  without: number;
  hospitals: number;
  readOn: string[];
}

export interface MedicareSplit {
  lines: SplitLine[];
  /** sum of Medicare-approved amounts over every Part B line */
  approvedUsd: number;
  /** the part of that the deductible and 20% rule applies to */
  subjectUsd: number;
  /** the part on lines with no cost-sharing (labs, yearly screenings) */
  noShareUsd: number;
  deductibleUsd: number;
  deductibleAppliedUsd: number;
  coinsuranceUsd: number;
  /** deductible applied + coinsurance */
  personUsd: number;
  /** approved − person: what the Medicare program pays */
  programUsd: number;
}

export interface WhoPays {
  year: string;
  /** true when the person chose a coverage that is not Medicare (or none): the split is a reference */
  reference: boolean;
  medicare: MedicareSplit | null;
  other: OtherBasisLine[];
  private: PrivateSpan | null;
}

/**
 * Split the ledger's Part B lines between the Medicare program and the person,
 * under 2026 Original Medicare rules, assuming none of the deductible has been met.
 */
export function medicareSplit(entries: readonly JourneyEntry[], ctx: Ctx = {}): MedicareSplit | null {
  const d = PART_B.deductibleUsd, r = PART_B.coinsuranceRate;
  if (d === null || r === null) return null;
  const lines: SplitLine[] = [];
  for (const e of entries) {
    const it = e.item;
    if (!it) continue;
    const rule = partBRuleOf(it);
    if (!rule) continue;
    const fig = scheduleFigureOf(it, ctx);
    if (fig === null) continue;
    const n = clampTimes(it, e.times).times;
    lines.push({ key: e.key, label: it.label, times: n, rule, approvedUsd: cents(fig * n) });
  }
  if (!lines.length) return null;
  const approvedUsd = cents(lines.reduce((a, l) => a + l.approvedUsd, 0));
  const subjectUsd = cents(lines.filter((l) => l.rule === 'deductible-and-20').reduce((a, l) => a + l.approvedUsd, 0));
  const noShareUsd = cents(approvedUsd - subjectUsd);
  /* The deductible is met once across every line it applies to, never per line. */
  const deductibleAppliedUsd = cents(Math.min(d, subjectUsd));
  const coinsuranceUsd = cents(r * (subjectUsd - deductibleAppliedUsd));
  const personUsd = cents(deductibleAppliedUsd + coinsuranceUsd);
  return { lines, approvedUsd, subjectUsd, noShareUsd, deductibleUsd: d, deductibleAppliedUsd, coinsuranceUsd, personUsd, programUsd: cents(approvedUsd - personUsd) };
}

/** The hospital-published negotiated ranges on the Medicare lines, low with low
 *  and high with high, over the lines that carry one. Never added to Medicare. */
export function privateSpan(entries: readonly JourneyEntry[]): PrivateSpan | null {
  let low = 0, high = 0, lines = 0, without = 0;
  const hospitals = new Set<string>();
  const read = new Set<string>();
  for (const e of entries) {
    const it = e.item;
    if (!it || !partBRuleOf(it)) continue;
    const view = privateRangeFor(it);
    const r = view?.shown.find((s) => medicareMarkerApplies(it, s.group));
    if (!r) { without++; continue; }
    const n = clampTimes(it, e.times).times;
    low += r.spread.low * n; high += r.spread.high * n; lines++;
    for (const h of r.hospitals) hospitals.add(h.id);
    for (const d of r.readOn) read.add(d);
  }
  if (!lines) return null;
  return { lowUsd: cents(low), highUsd: cents(high), lines, without, hospitals: hospitals.size, readOn: [...read].sort() };
}

const BASIS_WORD: Record<string, string> = {
  charge: 'billed charges', allowed: 'allowed amounts', payment: 'survey spending (MEPS)',
  out_of_pocket: 'out-of-pocket spending', total_expenditure: 'survey spending (MEPS)', wage: 'wages (BLS)',
};

/** The whole panel's money side, from the ledger's own lines. */
export function whoPays(lines: readonly PricedLine[], ctx: Ctx = {}): WhoPays {
  const entries = lines.map((l) => l.entry);
  const other: OtherBasisLine[] = [];
  for (const l of lines) {
    const it = l.entry.item;
    if (!it || partBRuleOf(it)) continue;
    other.push({ key: l.entry.key, label: it.label, basis: BASIS_WORD[it.basis] ?? it.basis, year: it.year, totalUsd: l.totalUsd });
  }
  return {
    year: PART_B.year,
    reference: ctx.coverage !== 'medicare',
    medicare: medicareSplit(entries, ctx),
    other,
    private: privateSpan(entries),
  };
}

/* ------------------------------------------------------------ the invisible */

export type ForgoneLike = { 'care-not-sought': number; 'care-denied': number };

export interface InvisibleCount { id: string; label: string; count: number; unit: string }

/**
 * The costs no file prices, as counts. Every count is one the ledger already
 * holds: the gap lines from her words (lib/sheet gapSummary), the burden
 * counters (lib/burdens) and the care-gone-without counters (lib/forgone).
 * Care gone without takes the counter when it has been used, the words otherwise,
 * never both, because the counter is pre-filled from the words.
 */
export function invisibleCounts(input: {
  months: number;
  wordCats: readonly [string, { lines: number; times: number }][];
  named: readonly string[];
  forgone: ForgoneLike | null;
  dismissed: number;
  trips: number;
}): InvisibleCount[] {
  const out: InvisibleCount[] = [];
  const words = new Map(input.wordCats);
  const f = input.forgone;
  const fromCounter = f ? f['care-not-sought'] + f['care-denied'] : 0;
  const fromWords = (words.get('care-not-sought')?.times ?? 0) + (words.get('care-denied')?.times ?? 0);
  const gone = fromCounter > 0 ? fromCounter : fromWords;
  if (gone > 0) out.push({ id: 'care-gone-without', label: 'Care you went without or were turned down for', count: gone, unit: gone === 1 ? 'time' : 'times' });
  for (const [id, label] of [['care-delayed', 'Care you put off'], ['care-cancelled', 'Care that was cancelled']] as const) {
    const n = words.get(id)?.times ?? 0;
    if (n > 0) out.push({ id, label, count: n, unit: n === 1 ? 'time' : 'times' });
  }
  if (input.dismissed > 0) out.push({ id: 'dismissed', label: 'Times you were told it was nothing', count: input.dismissed, unit: input.dismissed === 1 ? 'time' : 'times' });
  if (input.months > 0) out.push({ id: 'time-searching', label: 'Time spent searching for an answer', count: input.months, unit: input.months === 1 ? 'month' : 'months' });
  if (input.trips > 0) out.push({ id: 'trips', label: 'Trips made to get care', count: input.trips, unit: input.trips === 1 ? 'trip' : 'trips' });
  const blank = (words.get('no-federal-figure')?.lines ?? 0) + input.named.length;
  if (blank > 0) out.push({ id: 'no-figure', label: 'Care and costs you named that no federal figure prices', count: blank, unit: blank === 1 ? 'line' : 'lines' });
  return out;
}

/* ------------------------------------------------------------ the dollar year */

/** The year of the uninsured view's billed-charge figures: the CY2024 claims file
 *  lib/fit.ts submittedChargeOf reads (alternate cy2024_average_submitted_charge_usd). */
export const CHARGE_YEAR = '2024';

/** The dollar year of one line's figure as the ledger shows it. */
export function lineDollarYear(item: PriceItem, fit?: Pick<Fit, 'which'> | null): string {
  return fit?.which === 'charge' ? CHARGE_YEAR : item.year;
}

/** A short "2024 dollars" note for a figure whose year is not the ledger's year; null otherwise. */
export function lineYearNote(item: PriceItem, fit?: Pick<Fit, 'which'> | null): string | null {
  const y = lineDollarYear(item, fit);
  return y === PART_B.year ? null : `${y} dollars`;
}

/**
 * The dollar year and basis on the face of the total. Every figure is a
 * published price for one visit or test in its file's year, multiplied by her
 * count; none is adjusted for inflation, so the interval is the file's year.
 */
export function totalDollarYear(lines: readonly PricedLine[], fits: ReadonlyMap<string, Pick<Fit, 'which'>>): string | null {
  const byYear = new Map<string, { n: number; charge: boolean; medicare: boolean }>();
  for (const l of lines) {
    const it = l.entry.item;
    if (!l.priced || !it) continue;
    const fit = fits.get(l.entry.key) ?? null;
    const y = lineDollarYear(it, fit);
    const at = byYear.get(y) ?? { n: 0, charge: false, medicare: false };
    at.n++;
    if (fit?.which === 'charge') at.charge = true;
    else if (partBRuleOf(it)) at.medicare = true;
    byYear.set(y, at);
  }
  if (!byYear.size) return null;
  if (byYear.size === 1) {
    const [[y, v]] = [...byYear.entries()];
    if (v.charge && !v.medicare) return `${y} dollars: average billed charges on ${y} Medicare claims, not adjusted to ${PART_B.year}`;
    if (v.medicare && !v.charge) return `${y} Medicare dollars: each visit and test at the ${y} published rate, whenever it happened`;
    return `${y} dollars, each line at its file’s ${y} figure`;
  }
  const parts = [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([y, v]) => `${y} (${v.n} ${v.n === 1 ? 'line' : 'lines'})`);
  return `Dollar years: ${parts.join(', ')}. None is adjusted for inflation`;
}

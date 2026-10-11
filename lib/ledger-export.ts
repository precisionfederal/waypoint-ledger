/* ==========================================================================
   WHAT THE DOWNLOADS MUST CARRY — R6 findings F11 and edge #8.

   The CSV and the JSON are the two artefacts a re-user actually keeps, and two
   things were falling out of them on the way to disk:

   1. WHETHER WE MULTIPLIED, AND WHETHER THE FIGURE WAS READ OR DERIVED.
      "285.57" told a reader nothing about "3 x 95.19", and nothing about the
      fact that 95.19 is itself 2.85 total RVUs x $33.4009 rather than a number
      printed in a file. Both are on the row; neither reached the export.

   2. THE ONLY NUMBER ON A BURDEN LINE. The CSV row for "waited 8 months" was
      `"waited 8 months","","","","1",...` — the 8 was gone, and, in the
      adversary's words, "an actuary opening the CSV cannot tell an 8-month wait
      from an 8-year one."

   These are pure functions on a ledger line so that the browser download, the
   API export and the tests all say the same thing. They add no figure and
   change no total: everything here is already on the line or on the row.
   ========================================================================== */
import type { JourneyEntry, PriceItem } from './types';
import { clampTimes } from './pricing';

/** Money, at the export boundary. `406.83000000000004` is a float artefact, not data. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** patient-20: the JSON download printed `"totalUsd": 2199.2400000000002`. A
 *  JSON.stringify replacer that rounds every money field (a key ending in "Usd")
 *  to cents. Every published figure in the table is already whole cents, so only
 *  the sums change, and only by float noise. Non-money numbers (counts, months)
 *  and nulls pass through untouched. */
export function moneyReplacer(key: string, value: unknown): unknown {
  return typeof value === 'number' && Number.isFinite(value) && /Usd$/.test(key) ? round2(value) : value;
}

/** The ledger JSON download, money in cents, pretty-printed as before. */
export const ledgerJson = (doc: unknown): string => JSON.stringify(doc, moneyReplacer, 2);

/** The multiplication the ROW prints on the face of its own figure, or ''.
 *  Never recomputed here — this is the row quoting itself. */
export function figureArithmetic(item: PriceItem | null | undefined): string {
  const cs = item?.coverage ?? '';
  const rvu = /([\d.]+)\s+Total(?:\s+non-facility)?\s+RVUs?\s*[x×]\s*\$([\d.,]+)/i.exec(cs);
  if (rvu) return `${rvu[1]} total RVUs x $${rvu[2]}`;
  const sum = /\$([\d.,]+)\s*\+\s*\$([\d.,]+)\s*=\s*\$([\d.,]+)/.exec(cs);
  if (sum) return `$${sum[1]} + $${sum[2]} = $${sum[3]}`;
  return '';
}

export interface Burden { quantity: number; unit: string }

/** The number inside a line no federal file prices: months waited, or a count. */
export function burdenOf(entry: JourneyEntry): Burden | null {
  if (entry.item) return null;
  if (typeof entry.months === 'number' && entry.months > 0) return { quantity: entry.months, unit: 'months' };
  const n = Math.floor(entry.times);
  return n > 0 ? { quantity: n, unit: 'times' } : null;
}

export interface LedgerExportExtras {
  /** VERIFIED read straight off a file · DERIVED the product of figures on it · REPORTED quoted */
  figureConfidence: string;
  /** the row's own printed multiplication, empty where the figure was simply read */
  figureArithmetic: string;
  /** the count the person said */
  times: number;
  /** the count that was PRICED — lower only where the code is a once-a-year code */
  timesPriced: number;
  /** true when the line total is a multiple of the unit figure rather than the figure itself */
  multiplied: boolean;
  /** why the priced count is lower than the count they said, in words, or '' */
  timesNote: string;
  burden: Burden | null;
}

export function exportExtras(entry: JourneyEntry): LedgerExportExtras {
  const item = entry.item;
  const clamped = clampTimes(item, entry.times);
  return {
    figureConfidence: item?.confidence ?? '',
    figureArithmetic: figureArithmetic(item),
    times: clamped.said,
    timesPriced: item ? clamped.times : 0,
    multiplied: !!item && clamped.times > 1,
    timesNote: clamped.note ?? '',
    burden: burdenOf(entry),
  };
}

/** The columns these add to the ledger CSV, in order. Append them to the header. */
export const CSV_EXTRA_COLUMNS = [
  'figure_confidence', 'figure_arithmetic', 'times_priced', 'multiplied',
  'times_note', 'burden_quantity', 'burden_unit',
] as const;

/** The cells for one line, in the same order. Append them to the row. */
export function csvExtraCells(entry: JourneyEntry): string[] {
  const x = exportExtras(entry);
  return [
    x.figureConfidence, x.figureArithmetic,
    x.timesPriced ? String(x.timesPriced) : '',
    x.multiplied ? 'TRUE' : 'FALSE',
    x.timesNote,
    x.burden ? String(x.burden.quantity) : '',
    x.burden ? x.burden.unit : '',
  ];
}

/** What each new column means, for public/data/dictionary.csv and /developers. */
export const CSV_EXTRA_COLUMN_NOTES: Record<string, string> = {
  figure_confidence: 'VERIFIED read straight off the federal file; DERIVED the product of figures on the file, formula in figure_arithmetic; REPORTED quoted from a published report.',
  figure_arithmetic: "The row's own printed multiplication, e.g. 2.85 total RVUs x $33.4009. Empty where the figure was read rather than computed.",
  times_priced: 'How many of them were priced. Lower than times only where CMS pays the code once in a 12-month period.',
  multiplied: 'TRUE where the line total is the figure multiplied by a count, FALSE where it is the figure itself.',
  times_note: 'Why the priced count is lower than the count the person gave, in the words shown on the line.',
  burden_quantity: 'The number inside a line no federal file prices: 8 for "waited 8 months".',
  burden_unit: 'What that number counts: months, or times.',
};

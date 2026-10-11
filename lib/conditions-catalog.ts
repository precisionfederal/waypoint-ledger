/* ==========================================================================
   THE CONDITIONS CATALOG — what /conditions prints, as a pure function.

   For every condition in a conditions file: its code, its year-ahead figure
   or the absence, the figures published about it that are not a year for one
   person, and what the tool prices for it. "What the tool prices" is not a
   claim written in prose: where the entry carries an example sentence, that
   sentence is run through the same reader (lib/mapper.ts) and the same table
   (lib/table.ts) as anything a person types on the home page, and the lines
   that come back are the answer, priced or unpriced by name.

   It takes the files as arguments so the unit suite can hand it a file with a
   condition appended that no code has ever heard of, and prove the condition
   comes out on the page and through the price path unchanged.

   🔴 Nothing here adds a published figure to a journey, or a journey to a
   published figure, or divides one by the other. They answer different
   questions and are printed side by side with what each one measures.
   ========================================================================== */

import {
  benchmarkOf, conditionsOf, priceRowsOf,
  type Benchmark, type Condition, type RawConditionsFile, type RawPrice,
} from './conditions-core';
import { parseJourney } from './mapper';
import { clampTimes } from './pricing';
import type { PriceItem } from './types';

export interface ExampleLine {
  /** the words, exactly as the reader split them */
  raw: string;
  times: number;
  /** null when the phrase is unpriced; the name is then the words themselves */
  itemId: string | null;
  itemLabel: string | null;
  code: string | null;
  unitUsd: number | null;
  lineUsd: number | null;
  year: string | null;
  /** the reader's own reason a line is unpriced */
  reason: string | null;
}

export interface PricedExample {
  sentence: string;
  composedFrom: string;
  lines: ExampleLine[];
  /** the sum of the priced lines only, to the cent; never includes a published figure */
  pricedTotalUsd: number;
  pricedCount: number;
  unpricedCount: number;
  /** the fee-schedule years the priced lines come from */
  years: string[];
}

export interface CatalogEntry {
  condition: Condition;
  benchmark: Benchmark;
  example: PricedExample | null;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Run one sentence through the reader and the table, as the ledger would. */
export function priceSentence(sentence: string, table: PriceItem[]): Omit<PricedExample, 'composedFrom'> {
  const lines: ExampleLine[] = [];
  for (const seg of parseJourney(sentence, table)) {
    if (seg.absorbed) continue;
    const item = seg.result.item;
    if (!item || item.valueUsd === null) {
      lines.push({ raw: seg.raw, times: seg.times, itemId: null, itemLabel: null, code: null,
        unitUsd: null, lineUsd: null, year: null, reason: seg.result.reason ?? null });
      continue;
    }
    const n = clampTimes(item, seg.times).times;
    lines.push({ raw: seg.raw, times: n, itemId: item.id, itemLabel: item.label, code: item.code ?? null,
      unitUsd: item.valueUsd, lineUsd: cents(item.valueUsd * n), year: item.year, reason: null });
  }
  const priced = lines.filter((l) => l.lineUsd !== null);
  return {
    sentence,
    lines,
    pricedTotalUsd: cents(priced.reduce((a, l) => a + (l.lineUsd as number), 0)),
    pricedCount: priced.length,
    unpricedCount: lines.length - priced.length,
    years: [...new Set(priced.map((l) => l.year as string))].sort(),
  };
}

export function catalogOf(
  file: RawConditionsFile,
  prices: { items: RawPrice[] },
  table: PriceItem[],
): CatalogEntry[] {
  const rows = priceRowsOf(prices);
  const opts = { qualifier: file._when_there_is_no_figure ?? '', gapHref: file._gap_link ?? '/gap' };
  return conditionsOf(file).map((condition) => ({
    condition,
    benchmark: benchmarkOf(condition, rows, opts),
    example: condition.exampleJourney
      ? { ...priceSentence(condition.exampleJourney.sentence, table),
          composedFrom: condition.exampleJourney.composedFrom }
      : null,
  }));
}

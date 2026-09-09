/* ==========================================================================
   WHAT THE APPOINTMENT SHEET CARRIES BESIDE THE MONEY

   The itemized total is one column of a person's burden. The sheet they print
   has to carry the rest of it, and carry it apart: counts that no federal file
   prices, care that never happened, and time spent searching.

   Everything here is counting, never pricing. There is deliberately no function
   in this file that returns a dollar figure and no function that adds two
   counts of different kinds together.
   ========================================================================== */

import type { JourneyEntry } from './types';

/** The mapper marks a segment that describes care which did not happen, or a
 *  length of time rather than a unit of care, with a category. The sheet reads
 *  those fields defensively: a build of the mapper that does not set them still
 *  produces a correct sheet, with the line counted as simply unpriced. */
export type GapFields = { gapCategory?: string | null; months?: number | null; reason?: string | null };
export const gapFieldsOf = (e: JourneyEntry): GapFields => e as JourneyEntry & GapFields;

/** A step that happened but matched no row is its own category, kept separate
 *  from care that never happened: they are different facts about a person. */
export const NO_FIGURE = 'no-federal-figure';
export const TIME_SEARCHING = 'time-searching';

const GAP_LABEL: Record<string, string> = {
  'care-not-sought': 'care you needed and did not get',
  'care-denied': 'care you were denied or turned down for',
  'care-delayed': 'care you put off',
  'care-cancelled': 'care that was cancelled',
  [TIME_SEARCHING]: 'time spent searching for an answer',
  [NO_FIGURE]: 'steps with no published federal figure',
};

/** An unknown category still reads as English rather than as an identifier. */
export const gapLabel = (id: string): string => GAP_LABEL[id] ?? id.replace(/-/g, ' ');

const GAP_WHY: Record<string, string> = {
  [NO_FIGURE]: 'The step happened. No published federal figure in this table prices it, so it is left blank rather than estimated.',
  [TIME_SEARCHING]: 'A length of time is not a unit of care, so it is counted here and never given a price.',
};
const GAP_WHY_DEFAULT = 'No federal file records care that did not happen, so it is counted here and never priced.';
export const gapWhy = (id: string): string => GAP_WHY[id] ?? GAP_WHY_DEFAULT;

export interface GapCount { lines: number; times: number }
export interface GapSummary {
  /** Category id → how many lines and how many times, sorted most-counted first. */
  cats: [string, GapCount][];
  /** Months of searching, summed from the durations the mapper refused to price. */
  months: number;
  /** Costs this product names and will not price, in the person's own list. */
  named: string[];
  /** True when there is nothing to print, so the block is left off the page. */
  empty: boolean;
}

/** Everything the sheet counts and never prices, from the journey as stored. */
export function gapSummary(entries: readonly JourneyEntry[], namedUnpriced: readonly string[] = []): GapSummary {
  const cats = new Map<string, GapCount>();
  let months = 0;
  for (const e of entries) {
    const g = gapFieldsOf(e);
    if (g.gapCategory === TIME_SEARCHING) {
      const m = Math.floor(g.months ?? 0);
      if (m > 0) months += m;
      continue;
    }
    if (e.item) continue;
    const key = g.gapCategory ?? NO_FIGURE;
    const at = cats.get(key) ?? { lines: 0, times: 0 };
    cats.set(key, { lines: at.lines + 1, times: at.times + Math.max(1, e.times) });
  }
  const named = [...namedUnpriced];
  const sorted = [...cats.entries()].sort((a, b) => b[1].times - a[1].times || a[0].localeCompare(b[0]));
  return { cats: sorted, months, named, empty: sorted.length === 0 && months === 0 && named.length === 0 };
}

/** How many lines carry a figure that describes this person, counted by verdict.
 *  The verdict strings come from lib/fit; this never hard-codes them. */
export function fitTally(verdicts: readonly string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const v of verdicts) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Months, said the way a person says them. Exact arithmetic, nothing rounded away. */
export function monthsPhrase(m: number): string {
  const n = Math.max(0, Math.floor(m));
  if (n < 12) return `${n} ${n === 1 ? 'month' : 'months'}`;
  const y = Math.floor(n / 12), r = n % 12;
  return `${y} ${y === 1 ? 'year' : 'years'}${r ? ` ${r} ${r === 1 ? 'month' : 'months'}` : ''}`;
}

/* ==========================================================================
   THE LINE THAT TRAVELS — the odyssey, said the way a person says it.

   A person who spent four years getting an answer does not repeat "$2,049".
   They repeat "four years and twenty-seven appointments". Those counts are
   already parsed (the mapper returns `months` for "four years of appointments"
   and refuses to price it) and were, until now, thrown away on the ledger.

   🔴 EVERY CLAUSE IS A REAL COUNT OR IT IS NOT WRITTEN. A clause whose count is
   zero is dropped, never printed as a zero and never softened into a word. The
   closing sentence appears only when something was actually counted and not
   priced, because that sentence is the claim the whole product makes.
   ========================================================================== */

/** Short forms for the one-line version; the long forms stay in GAP_LABEL.
 *  One is one: "1 times you were denied" is the tell that a machine wrote it. */
const GAP_SHORT: Record<string, [one: string, many: string]> = {
  'care-not-sought': ['time you went without care you needed', 'times you went without care you needed'],
  'care-denied': ['time you were denied', 'times you were denied'],
  'care-delayed': ['time you put care off', 'times you put care off'],
  'care-cancelled': ['appointment cancelled', 'appointments cancelled'],
  [NO_FIGURE]: ['step no federal file prices', 'steps no federal file prices'],
};
export const gapShort = (id: string, n = 2): string => {
  const pair = GAP_SHORT[id];
  return pair ? pair[n === 1 ? 0 : 1] : gapLabel(id);
};

export interface OdysseyInput {
  /** Months of searching the mapper refused to price. */
  months: number;
  /** Appointments: counts summed across the priced and unpriced lines alike. */
  appointments: number;
  /** Category id → how many times, as gapSummary returns them. */
  cats: readonly [string, GapCount][];
}

/** The clauses, in order, each already a sentence fragment a person would say. */
export function odysseyClauses(i: OdysseyInput): string[] {
  const out: string[] = [];
  if (i.months > 0) out.push(`${monthsPhrase(i.months)} of searching`);
  if (i.appointments > 0) out.push(`${i.appointments} ${i.appointments === 1 ? 'appointment' : 'appointments'}`);
  for (const [id, c] of i.cats) {
    if (c.times <= 0) continue;
    out.push(`${c.times} ${gapShort(id, c.times)}`);
  }
  return out;
}

/** One line, or null when nothing real can be said. Never a template with a hole. */
export function odysseyLine(i: OdysseyInput): string | null {
  const cl = odysseyClauses(i);
  if (!cl.length) return null;
  const counted = i.months > 0 || i.cats.some(([, c]) => c.times > 0);
  return `${cl.join(' · ')}${counted ? ' · none of that produces a row in federal data' : ''}`;
}

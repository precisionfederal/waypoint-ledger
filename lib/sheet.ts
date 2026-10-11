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
import { isFormulaCell } from './csv-cell.js';
import { isDiagnosisLine } from './diagnosis-line';
/* JUDGE-6 #6: the reader's own test for a line that is not care (an age, a
   short fragment), the one the ledger's "Not read as care" group and the
   Brief already use. lib/mapper does not import this module. */
import { AGE_NOW_REASON, notReadAsCare } from './mapper';

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
  [NO_FIGURE]: 'lines without a federal figure',
};

/** An unknown category still reads as English rather than as an identifier. */
export const gapLabel = (id: string): string => GAP_LABEL[id] ?? id.replace(/-/g, ' ');

const GAP_WHY: Record<string, string> = {
  [NO_FIGURE]: 'Care you named that no published federal figure in this table prices, so each is left blank rather than estimated.',
  [TIME_SEARCHING]: 'A length of time is not a unit of care, so it is counted here and never given a price.',
};
const GAP_WHY_DEFAULT = 'No federal file records care that did not happen, so it is counted here and never priced.';
export const gapWhy = (id: string): string => GAP_WHY[id] ?? GAP_WHY_DEFAULT;

/* ==========================================================================
   🔴 WORDS THAT ARE NOT CARE ARE NOT COST ROWS (R3 clinician C04, brainfog
   BF-19, parent PAR-16). "It started in March 2023 after covid.", "I nearly
   fainted", "came back negative" and "made the crashes worse" printed as table
   rows reading "no federal figure exists", and were then counted as steps that
   "happened". They are the person's own words: the sheet prints them verbatim,
   in order, under "In my own words", and no count of care includes them.

   A line is care when it carries a unit, a counter (refused, not sought, put
   off, cancelled, time searching), or a care word. The list below only decides
   where a line is printed. It never prices anything and never drops a line.
   ========================================================================== */
const CARE_WORDS = new RegExp([
  '\\b(?:saw|seen|see|seeing|went|go|going|visit(?:s|ed)?|appointments?|appt|consult(?:s|ation)?|referr(?:al|als|ed)|admitted|hospital(?:i[sz]ed)?|clinic|er|ed|emergency|urgent care|telehealth|video visit)\\b',
  '\\b(?:doc|docs|doctors?|physicians?|nurses?|np|pa|gp|pcp|specialists?|surgeons?|pediatricians?|therap(?:y|ies|ist|ists)|counsel(?:ing|or)|psychiatrists?|psychologists?|chiropractors?|dentists?|naturopaths?)\\b',
  '[a-z]+olog(?:ist|ists|y)\\b',
  '\\b(?:tests?|tested|testing|scans?|scanned|mri|ct|x-?rays?|ultrasounds?|echo(?:cardiogram)?s?|ekg|ecg|eeg|emg|labs?|blood ?work|blood (?:tests?|draws?|panels?)|panels?|biops(?:y|ies)|screenings?|exams?|studies|study|monitors?|holter|endoscop(?:y|ies)|colonoscop(?:y|ies)|surgery|surger(?:y|ies)|procedures?|injections?|infusions?|shots?|prescri(?:bed|ption|ptions)|medications?|meds|sessions?|x-ray)\\b',
].join('|'), 'i');

/** A line shown from a share link, whose words stayed with the sender. */
export const SHARED_NO_FIGURE = 'A step with no federal figure (its words stay with the person who shared it)';

/* Words that say when it began, how it felt, or what a result was. A line with
   none of these and no care word stays a row: an unlisted procedure ("a lumbar
   puncture") is still care. */
const NOTE_WORDS = /\b(?:started|starts|began|begun|onset|got sick|fell ill|came back|negative|positive|normal|worse|better|fainted|passed out|nearly|felt|feel|feeling|tired|exhausted|sick|ill|pain|hurts?|crash(?:es|ed)?|symptoms?|missed)\b/i;

/** True when a line names care: it has a unit, a counter, or it is not plainly
 *  a statement of onset, feeling or result. */
export function isCareLine(e: JourneyEntry): boolean {
  if (e.item) return true;
  if (gapFieldsOf(e).gapCategory) return true;
  /* FLOW5 flow5-2: "it was epilepsy" names the answer, not care. It prints in
     her own words, never as a cost row or a "without a federal figure" count. */
  const g = gapFieldsOf(e);
  const reason = (e as JourneyEntry & { reason?: string | null }).reason ?? null;
  if (isDiagnosisLine({ item: e.item, gapCategory: g.gapCategory, months: g.months, reason })) return false;
  /* JUDGE-6 #6: "My daughter is 14." is an age. It was a cost row on the sheet
     and a "Without a federal figure" count on the ledger tile, while the
     ledger listed it under "Not read as care" and the Brief left it out. Now
     all of them read it the same way: her words, never a row or a count. */
  if (reason === AGE_NOW_REASON || notReadAsCare({ raw: e.raw, item: e.item, gapCategory: g.gapCategory, months: g.months, reason })) return false;
  if (e.raw === SHARED_NO_FIGURE) return true;
  if (CARE_WORDS.test(e.raw)) return true;
  return !NOTE_WORDS.test(e.raw);
}
/** The person's own words that are not care: printed verbatim, never a cost row. */
export const noteRowsOf = <T extends JourneyEntry>(entries: readonly T[]): T[] => entries.filter((e) => !isCareLine(e) && e.raw.trim() !== '');
/** Every other line: the rows of the cost table. */
export const sheetRowsOf = <T extends JourneyEntry>(entries: readonly T[]): T[] => entries.filter((e) => isCareLine(e) || e.raw.trim() === '');

export interface GapCount { lines: number; times: number }
export interface GapSummary {
  /** Category id → how many lines and how many times, sorted most-counted first. */
  cats: [string, GapCount][];
  /** Months of searching: the longest duration the mapper refused to price (the others sit inside it). */
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
      /* 🔴 THE LONGEST SPAN SAID IS THE SEARCH (R3 clinician C02). "waiting 7
         months" sits inside "3 years of looking", so adding them printed "3 years
         7 months". Each span keeps its own row; the count is the longest one. */
      if (m > 0) months = Math.max(months, m);
      continue;
    }
    if (e.item) continue;
    if (!g.gapCategory && !isCareLine(e)) continue;
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
  [NO_FIGURE]: ['line without a federal figure', 'lines without a federal figure'],
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
  if (i.appointments > 0) out.push(`${i.appointments} ${i.appointments === 1 ? 'visit or test' : 'visits and tests'}`);
  for (const [id, c] of i.cats) {
    /* lines, not times, for the no-figure count: the ledger's stat counts lines */
    const n = id === NO_FIGURE ? c.lines : c.times;
    if (n <= 0) continue;
    out.push(`${n} ${gapShort(id, n)}`);
  }
  return out;
}

/** One line, or null when nothing real can be said. Never a template with a hole. */
export function odysseyLine(i: OdysseyInput): string | null {
  const cl = odysseyClauses(i);
  if (!cl.length) return null;
  const counted = i.months > 0 || i.cats.some(([, c]) => c.times > 0);
  // A lone appointment count restates the card above it. No band beats a repeated one.
  if (!counted && cl.length <= 1) return null;
  /* 🔴 THE CLOSING CLAUSE IS TRUE OF WHAT IT FOLLOWS (desktop F17). "None of
     that produces a row in federal data" followed "8 appointments", and
     appointments do produce claim rows. It now names what has a price and what
     does not. The caller counts as appointments only lines with a unit of care. */
  const tail = !counted ? '' : i.appointments > 0
    ? ' · only the visits and tests have a price in a federal cost file'
    : ' · none of it has a price in a federal cost file';
  return `${cl.join(' · ')}${tail}`;
}

/** One CSV cell, quoted. 🔴 A SHARED LINK CANNOT PLANT A FORMULA (security S-06).
 *  A cell that a spreadsheet would read as a formula (=, +, -, @, tab or CR
 *  first) gets a leading apostrophe, unless it is a plain number. The rule is
 *  shared with the server exports through lib/csv-cell.js, never copied. */
export function csvCell(c: string): string {
  const s = isFormulaCell(c) ? `'${c}` : c;
  return `"${s.replace(/"/g, '""')}"`;
}

/* ==========================================================================
   DOES THIS JOURNEY'S SHEET PRINT ON ONE PAGE? (merge round 5, 2026-10-01;
   re-measured for JUDGE-6 #8)

   The ledger's sheet card says "One printed page" only when the sheet does
   print on one page. SHEET3 (winloop/BETA-2026-10-01/VISUAL-4b-sheet3.md)
   capped every part that grows at the example's own size, so an ordinary
   child story (9 rows, one sentence in her own words, a dismissal card, four
   years searching) was "Ready to print", and it did print on two pages.
   SHEET4 (VISUAL-4b-sheet4.md) tightened the paper layout, and this check now
   adds up the printed height of a Letter page part by part: the table's rows
   and the lines they wrap to, and the lines each run-in block (her own words,
   the burden cards, the counted-never-priced line, the sources) wraps to at
   about 100 characters a line. The constants are SHEET4's measurements of the
   example, the three journey-ai stories and four caregiver stories, Letter at
   0.5 in margins (the A4 page is taller and had more room left in every one),
   pinned by tests/sheet-one-page.test.ts. Two or more burden cards, a paid
   column, a locality foot, or figures of more than one kind are never claimed.
   ========================================================================== */
export interface SheetSize {
  rows: readonly { words: string; unit: string }[];
  notes: number; sources: number; gapItems: number; burdenCards: number;
  figureKinds: number; verdictKinds: number; paid: boolean; locality: boolean;
  /** Characters printed in the blocks that run in: her own words, the
   *  counted-never-priced items, the burden cards, the sources with their addresses. */
  noteChars: number; gapChars: number; cardChars: number; sourceChars: number;
}
/** Printed lines a row wraps to on Letter: its words column holds about 24
 *  characters a line at 11 pt, its unit column about 44. Rounded so a row is
 *  never counted shorter than it prints. */
export const sheetRowLines = (words: string, unit: string): number =>
  Math.max(1, Math.ceil(words.trim().length / 24), Math.ceil(unit.trim().length / 44));
/** Letter, in CSS px at 96 a inch: 10 in of paper inside 0.5 in margins. */
export const PRINT = {
  pagePx: 960, linePx: 15.6, charsPerLine: 100,
  /** Room the estimate must leave at the foot: three times its largest miss (4.1 px),
   *  so a sheet that might just reach page 2 says "Ready to print" instead. */
  safetyPx: 12.5,
  /** Head, total band, fit line, table header, questions, help, foot and the rules between
   *  them; then each row and each line a row wraps to. Least squares over SHEET4's seven
   *  measured sheets, raised by the largest miss (4.1 px) so no measured sheet is
   *  estimated shorter than it printed. */
  fixedPx: 388.5, rowLinePx: 9.9, rowPx: 15.6,
} as const;
const runLines = (chars: number): number => Math.ceil(chars / PRINT.charsPerLine);
/** The sheet's printed height on Letter, in px. Never a dollar figure. */
export function sheetPrintPx(s: SheetSize): number {
  const P = PRINT;
  const rowLines = s.rows.reduce((a, r) => a + sheetRowLines(r.words, r.unit), 0);
  const table = P.rowLinePx * rowLines + P.rowPx * s.rows.length;
  const words = s.notes ? 4 + P.linePx * runLines(60 + s.noteChars) : 0;
  /* the block's title runs into a lone card or into the counted line; the note is two lines,
     or runs on from the counted line after a card */
  const burdens = !s.gapItems && !s.burdenCards ? 0 : 6 + P.linePx * (s.burdenCards
    ? runLines(36 + s.cardChars) + runLines(24 + s.gapChars + 215)
    : runLines(57 + s.gapChars) + 2);
  const sources = P.linePx * runLines(30 + s.sourceChars);
  return P.fixedPx + table + words + burdens + sources;
}
export function sheetFitsOnePage(s: SheetSize): boolean {
  if (s.paid || s.locality || s.burdenCards > 1 || s.figureKinds > 1 || s.verdictKinds > 1) return false;
  return sheetPrintPx(s) <= PRINT.pagePx - PRINT.safetyPx;
}

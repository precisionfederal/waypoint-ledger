/* ==========================================================================
   WHAT YOU PAID, ON YOUR OWN LINE (round 5; Bo to Dr. Honey, 9/10: "Each
   ledger line will show what the person paid, what the schedule pays for the
   covered alternative, and the gap. Rolled up by diagnostic category, so the
   biggest deltas are easy to see.")

   🔴 THE RULES OF THIS FILE.
   1. A paid amount is the PERSON'S OWN NUMBER. It is typed by them, kept on the
      line in this browser, and never added into the federal total. Nothing here
      produces, adjusts or fills a federal figure (the rule of the codebase).
   2. It rides only where the person sends it: a journey they choose to save,
      and a correction they choose to send. A share link never carries it.
   3. The difference is counted only on a line that carries BOTH numbers.
      A line with no federal figure keeps its paid amount and has no difference.
   4. "each" means the amount is for one of the times on the line (the Wrong box
      asks about one figure). The line's paid total is then that amount times
      the person's own count, and the page shows that arithmetic.
   ========================================================================== */
import type { JourneyEntry, PricedLine, PriceItem } from './types';
import { CATEGORIES, categoryKey } from './categories';

/** The most anyone may type on one line. Above it is a typing slip, not a bill. */
export const PAID_MAX = 1_000_000;

/** The fields a line carries when the person said what they paid. */
export interface PaidFields { paid?: number | null; paidEach?: boolean | null }

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A typed amount made safe to keep: a number from 0 to PAID_MAX, to the cent. Anything else is null. */
export function cleanPaid(v: unknown): number | null {
  const n = typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v.replace(/[$,\s]/g, ''))) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n) || n < 0 || n > PAID_MAX) return null;
  return round2(n);
}

export const paidOf = (e: JourneyEntry): number | null => cleanPaid((e as JourneyEntry & PaidFields).paid);
export const paidEachOf = (e: JourneyEntry): boolean => (e as JourneyEntry & PaidFields).paidEach === true;
export const hasPaid = (e: JourneyEntry): boolean => paidOf(e) !== null;

/** What the person paid for the whole line. Null when they said nothing. */
export function paidLineTotal(e: JourneyEntry): number | null {
  const p = paidOf(e);
  if (p === null) return null;
  const times = Math.max(1, Math.floor(e.times) || 1);
  return paidEachOf(e) && times > 1 ? round2(p * times) : p;
}

/** "$120.00 each × 3" when the amount was for one of several; otherwise null. */
export function paidArithmetic(e: JourneyEntry, money: (n: number) => string): string | null {
  const p = paidOf(e);
  const times = Math.max(1, Math.floor(e.times) || 1);
  if (p === null || !paidEachOf(e) || times <= 1) return null;
  return `${money(p)} each × ${times}`;
}

/** The figure the difference is measured from, named plainly. */
export function figureNameOf(item: PriceItem | null | undefined): string {
  if (!item) return 'federal figure';
  const a = `${item.agency ?? ''} ${item.agencyDisplay ?? ''}`;
  return /\bCMS\b|Medicare/i.test(a) || /^cms-/.test(item.id) ? 'Medicare figure' : 'federal figure';
}

/** One line of the comparison. `federalUsd` is the line total the ledger shows, or null when it shows none. */
export interface PaidRow { key: string; paidUsd: number | null; federalUsd: number | null; gapUsd: number | null; figureName: string }

export function paidRowOf(l: PricedLine): PaidRow {
  const paidUsd = paidLineTotal(l.entry);
  const federalUsd = l.priced && typeof l.totalUsd === 'number' ? l.totalUsd : null;
  return {
    key: l.entry.key,
    paidUsd,
    federalUsd,
    gapUsd: paidUsd !== null && federalUsd !== null ? round2(paidUsd - federalUsd) : null,
    figureName: figureNameOf(l.entry.item),
  };
}

/** "$244.81 more than the Medicare figure", "$20.00 less than…", "the same as…". */
export function gapPhrase(gapUsd: number, figureName: string, money: (n: number) => string): string {
  if (Math.abs(gapUsd) < 0.005) return `the same as the ${figureName}`;
  return gapUsd > 0 ? `${money(gapUsd)} more than the ${figureName}` : `${money(-gapUsd)} less than the ${figureName}`;
}

/** Signed money for a table cell: +$244.81, −$20.00, $0.00. */
export function signedMoney(n: number, money: (n: number) => string): string {
  if (Math.abs(n) < 0.005) return money(0);
  return n > 0 ? `+${money(n)}` : `−${money(-n)}`;
}

export interface PaidGroup {
  key: string;
  label: string;
  /** lines in this group that carry a paid amount */
  lines: number;
  /** what the person paid on those lines */
  paidUsd: number;
  /** of those, the lines that also carry a federal figure */
  compared: number;
  /** the federal figure on the compared lines only */
  federalUsd: number;
  /** paid minus federal, on the compared lines only; null when none compared */
  gapUsd: number | null;
}

export interface PaidSummary {
  /** true when at least one line carries a paid amount; nothing is shown otherwise */
  any: boolean;
  paidUsd: number;
  paidLines: number;
  /** lines carrying both numbers, and the two sums over them */
  compared: number;
  comparedPaidUsd: number;
  comparedFederalUsd: number;
  gapUsd: number | null;
  /** paid on lines that have no federal figure (never part of the difference) */
  noFigurePaidUsd: number;
  noFigureLines: number;
  /** "Medicare figure" when every compared line is a CMS figure, else "federal figure" */
  figureName: string;
  /** by kind of care, largest difference first; lines with no federal figure last */
  groups: PaidGroup[];
}

export const NO_FIGURE_GROUP = { key: 'no-figure', label: 'No federal figure' };

/** Everything the paid view shows, from the priced lines. Pure; tested. */
export function paidSummary(lines: readonly PricedLine[]): PaidSummary {
  const m = new Map<string, PaidGroup>();
  let paidUsd = 0, paidLines = 0, compared = 0, cPaid = 0, cFed = 0, nfPaid = 0, nfLines = 0;
  const names = new Set<string>();
  for (const l of lines) {
    const r = paidRowOf(l);
    if (r.paidUsd === null) continue;
    paidUsd += r.paidUsd; paidLines += 1;
    const key = r.federalUsd === null ? NO_FIGURE_GROUP.key : (l.entry.item ? categoryKey(l.entry.item) : NO_FIGURE_GROUP.key);
    const label = key === NO_FIGURE_GROUP.key ? NO_FIGURE_GROUP.label : (CATEGORIES.find((c) => c.key === key)?.label ?? 'Other');
    const g = m.get(key) ?? { key, label, lines: 0, paidUsd: 0, compared: 0, federalUsd: 0, gapUsd: null };
    g.lines += 1; g.paidUsd = round2(g.paidUsd + r.paidUsd);
    if (r.federalUsd !== null) {
      g.compared += 1; g.federalUsd = round2(g.federalUsd + r.federalUsd);
      g.gapUsd = round2(g.paidUsd - g.federalUsd);
      compared += 1; cPaid += r.paidUsd; cFed += r.federalUsd; names.add(r.figureName);
    } else { nfPaid += r.paidUsd; nfLines += 1; }
    m.set(key, g);
  }
  const groups = [...m.values()].sort((a, b) => {
    if (a.key === NO_FIGURE_GROUP.key) return 1;
    if (b.key === NO_FIGURE_GROUP.key) return -1;
    return Math.abs(b.gapUsd ?? 0) - Math.abs(a.gapUsd ?? 0) || b.paidUsd - a.paidUsd;
  });
  return {
    any: paidLines > 0,
    paidUsd: round2(paidUsd), paidLines,
    compared, comparedPaidUsd: round2(cPaid), comparedFederalUsd: round2(cFed),
    gapUsd: compared ? round2(cPaid - cFed) : null,
    noFigurePaidUsd: round2(nfPaid), noFigureLines: nfLines,
    figureName: names.size === 1 && names.has('Medicare figure') ? 'Medicare figure' : names.size ? 'federal figure' : 'Medicare figure',
    groups,
  };
}

/** Sets (or clears, with null) the paid amount on one line. Returns a new array. */
export function withPaid<T extends JourneyEntry>(entries: readonly T[], key: string, usd: number | null, each = false): T[] {
  const clean = usd === null ? null : cleanPaid(usd);
  return entries.map((e) => {
    if (e.key !== key) return e;
    const next = { ...e } as T & PaidFields;
    if (clean === null) { delete next.paid; delete next.paidEach; }
    else { next.paid = clean; if (each && Math.floor(e.times) > 1) next.paidEach = true; else delete next.paidEach; }
    return next as T;
  });
}

/** The two fields as they are stored with a line (local ledger, saved journey). Empty when there is no amount. */
export function paidFieldsOut(e: JourneyEntry): { paid?: number; paidEach?: true } {
  const p = paidOf(e);
  if (p === null) return {};
  return paidEachOf(e) && Math.floor(e.times) > 1 ? { paid: p, paidEach: true } : { paid: p };
}

/** The same two fields read back from anything stored or received. */
export function paidFieldsIn(raw: unknown): { paid?: number; paidEach?: true } {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const p = cleanPaid(r.paid);
  if (p === null) return {};
  return r.paidEach === true ? { paid: p, paidEach: true } : { paid: p };
}

/** Lines a person can say they paid for: care that happened, priced or not.
 *  Care that did not happen and lengths of time are counted, never paid. */
export function payableLine(e: JourneyEntry, hasGapHint: boolean): boolean {
  return Boolean(e.item) || !hasGapHint;
}

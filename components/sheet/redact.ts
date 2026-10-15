/* ==========================================================================
   HIDE BEFORE SHARING — the sheet's redaction (app/sheet/page.tsx).

   A person hands this page to a clinician, an HR office or a disability
   reviewer, and not every line is that reader's business. They can hide any
   line, and their own words, before they print or save it. A hidden line is
   gone from everything the page prints: the rows, the total, the counts, the
   journey strip and the words read for the length of the search. The total
   says how many lines they hid, so the page never pretends to be the whole
   journey. Nothing hidden by default; nothing about it is stored or sent.
   ========================================================================== */
import type { JourneyEntry } from '@/lib/types';

/** The entries the sheet prints: every entry whose key is not hidden. */
export function shownEntries<E extends Pick<JourneyEntry, 'key'>>(entries: readonly E[], hidden: ReadonlySet<string>): E[] {
  return hidden.size ? entries.filter((e) => !hidden.has(e.key)) : [...entries];
}

/** How many of these entries are hidden (a key no longer on the ledger is not counted). */
export function hiddenCount(entries: readonly Pick<JourneyEntry, 'key'>[], hidden: ReadonlySet<string>): number {
  return hidden.size ? entries.filter((e) => hidden.has(e.key)).length : 0;
}

/** The sentence under the total, printed on paper too; null when nothing is hidden. */
export function hiddenNote(n: number): string | null {
  return n > 0 ? `${n} ${n === 1 ? 'line' : 'lines'} hidden by you, not in this total` : null;
}

/** Toggle one key, returning a new set. */
export function toggled(hidden: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(hidden);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

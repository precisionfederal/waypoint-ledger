/* FLOW3 flow3-1: a read that lands after Add still reaches the ledger.
   A tired person taps Add the moment it appears. If the AI reader is still on a
   phrase the rules left blank, the home page waits up to 4 s for it; past that
   the rules' lines go in at once, and when the read lands FOR THE SAME TEXT,
   each line it priced fills the blank line the person already has, by the
   words she typed. Nothing is added twice and nothing she changed is touched:
   only a line that is still blank (no unit, no gap counter, no length of time)
   is filled, and its count stays the count on the line. */
import type { ParsedSegment } from './mapper';
import type { JourneyEntry } from './types';

export interface LateUpgrade { key: string; label: string; times: number }

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export function applyLateRead(entries: JourneyEntry[], segs: ParsedSegment[]): { entries: JourneyEntry[]; upgraded: LateUpgrade[] } {
  const reads = segs.filter((s) => !s.absorbed && s.source === 'model' && s.result.item);
  const used = new Set<ParsedSegment>();
  const upgraded: LateUpgrade[] = [];
  const next = entries.map((e) => {
    if (e.item || e.gapCategory || e.months != null) return e;
    const s = reads.find((x) => !used.has(x) && norm(x.raw) === norm(e.raw));
    if (!s) return e;
    used.add(s);
    upgraded.push({ key: e.key, label: s.result.item!.label, times: e.times });
    const { reason: _drop, ...rest } = e as JourneyEntry & { reason?: string };
    void _drop;
    return { ...rest, item: s.result.item, source: 'model' as const, modelWhy: s.modelWhy ?? null };
  });
  return { entries: upgraded.length ? next : entries, upgraded };
}

/** "The AI read priced 1 more line: Doctor's office visit ×10." */
export function lateReadToast(up: LateUpgrade[]): string | null {
  if (!up.length) return null;
  return `The AI read priced ${up.length} more ${up.length === 1 ? 'line' : 'lines'}: ${up.map((u) => `${u.label} ×${u.times}`).join('; ')}.`;
}

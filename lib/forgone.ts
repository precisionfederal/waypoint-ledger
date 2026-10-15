/* ==========================================================================
   CARE GONE WITHOUT — the burden people ranked heaviest, at the centre of the
   ledger.

   /survey asks people to rank five burdens. Every answer received by
   30 September 2026 ranked "Care you went without" first, and until this file
   the ledger showed it only as a link at the foot of the page. It now sits
   directly under the total.

   Three rules, the same ones the rest of the ledger keeps:

   1. NO DOLLAR FIGURE. No federal cost file prices care that did not happen:
      a visit that never took place leaves no claim, no encounter and no
      expenditure event. So this is a count, and nothing in this file returns
      money or could be added to the itemized total.
   2. THE SURVEY SENTENCE IS READ LIVE. "X of Y survey answers ranked it
      heaviest" is computed from GET /api/survey when the page loads, never
      typed into the page, so it cannot go stale and is not shown at all when it
      cannot be read. It says "heaviest" only while no other burden was ranked
      first by more answers. Counts are answers, never people.
   3. THE PERSON'S OWN WORDS FIRST. Whatever they already typed on /journey
      that the mapper recognised as care they did not get arrives here as a
      number in its box, with the sentence it came from. Nothing is sent until
      they press the button.
   ========================================================================== */

import gapData from '@/data/invisible-events.json';
import type { SurveyAggregateLike } from './forgone-rank';
/* The survey sentence lives in ./forgone-rank so the home proof strip reads it without
   the counter rows (judge panel 15 Oct B-5); it is re-exported here unchanged. */
export { RANK_MIN_ANSWERS, FORGONE_BURDEN, forgoneRank, forgoneRankSentence } from './forgone-rank';
export type { SurveyAggregateLike, ForgoneRank } from './forgone-rank';

export const FORGONE_KEY = 'waypoint-ledger.forgone.v1';
/** The two gap-counter categories that are care a person went without. Same ids /gap and /api/gap use. */
export const FORGONE_CATEGORIES = ['care-not-sought', 'care-denied'] as const;
export type ForgoneCategory = (typeof FORGONE_CATEGORIES)[number];
export const FORGONE_MAX = 500;

interface RawCat { id: string; label: string; prompt: string; examples: string[]; whyInvisible: string; unit: string }

export interface ForgoneRow { id: ForgoneCategory; label: string; prompt: string; examples: string[]; whyInvisible: string; unit: string }

/** The two categories, read from the same file /gap reads, so the words cannot drift apart. */
export function forgoneRows(): ForgoneRow[] {
  const cats = (gapData as unknown as { categories: RawCat[] }).categories;
  return FORGONE_CATEGORIES.map((id) => {
    const c = cats.find((x) => x.id === id);
    if (!c) throw new Error(`data/invisible-events.json has no category ${id}`);
    return { id, label: c.label, prompt: c.prompt, examples: c.examples, whyInvisible: c.whyInvisible, unit: c.unit };
  });
}

export type ForgoneCounts = Record<ForgoneCategory, number>;
export const EMPTY_FORGONE: ForgoneCounts = { 'care-not-sought': 0, 'care-denied': 0 };

const clamp = (v: unknown): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;
  return Math.max(0, Math.min(FORGONE_MAX, n));
};

export function normalizeForgone(raw: unknown): ForgoneCounts {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { 'care-not-sought': clamp(r['care-not-sought']), 'care-denied': clamp(r['care-denied']) };
}

export function forgoneEntered(c: ForgoneCounts): number {
  return FORGONE_CATEGORIES.filter((k) => c[k] > 0).length;
}

/** The body POST /api/gap takes. Counts only: no note, no context, no money. Null when there is nothing to send. */
export function forgoneGapBody(c: ForgoneCounts, tableVersion: string): { counts: Partial<ForgoneCounts>; tableVersion: string } | null {
  const counts: Partial<ForgoneCounts> = {};
  for (const k of FORGONE_CATEGORIES) if (c[k] > 0) counts[k] = c[k];
  return Object.keys(counts).length ? { counts, tableVersion } : null;
}

/** Whether the survey can be read at all: an aggregate that says zero answers. */
export function surveyIsEmpty(agg: SurveyAggregateLike | null | undefined): boolean {
  if (!agg || typeof agg !== 'object') return false;
  const answers = Number.isFinite(agg.submissions) ? Number(agg.submissions) : Number(agg.n);
  return Number.isFinite(answers) && answers <= 0;
}

export function loadForgone(): ForgoneCounts {
  if (typeof localStorage === 'undefined') return { ...EMPTY_FORGONE };
  try { const raw = localStorage.getItem(FORGONE_KEY); return raw ? normalizeForgone(JSON.parse(raw)) : { ...EMPTY_FORGONE }; }
  catch { return { ...EMPTY_FORGONE }; }
}

export function saveForgone(c: ForgoneCounts): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (forgoneEntered(c) === 0) localStorage.removeItem(FORGONE_KEY);
    else localStorage.setItem(FORGONE_KEY, JSON.stringify(c));
  } catch { /* storage disabled: the block still works, it just forgets */ }
}

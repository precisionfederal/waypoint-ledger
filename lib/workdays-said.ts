/* ==========================================================================
   THE WORKDAYS A PERSON SAID, kept in this browser (round 2, c1).
   lib/burdens.ts explains the rule: the days said fill the workdays card only
   while it is still 0. This file is the storage half alone, so lib/store.tsx can
   note the days on every page without lib/burdens.ts on first load (PERF,
   2026-10-01). lib/burdens.ts re-exports all of it.
   ========================================================================== */
/** The most workdays the card counts (ten years); lib/burdens.ts MAX.workdays. */
export const MAX_WORKDAYS = 3650;

export const WORKDAYS_SAID_KEY = 'waypoint-ledger.workdays-said.v1';
export interface WorkdaysSaid { raw: string; days: number; note: string }

export function readWorkdaysSaid(): WorkdaysSaid[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const v = JSON.parse(localStorage.getItem(WORKDAYS_SAID_KEY) ?? '[]') as unknown;
    return Array.isArray(v)
      ? v.filter((x): x is WorkdaysSaid => !!x && typeof x.raw === 'string' && typeof x.days === 'number' && x.days > 0 && typeof x.note === 'string').slice(0, 50)
      : [];
  } catch { return []; }
}

export function noteWorkdaysSaid(w: WorkdaysSaid): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const list = readWorkdaysSaid().filter((x) => x.raw !== w.raw);
    localStorage.setItem(WORKDAYS_SAID_KEY, JSON.stringify([...list, { raw: w.raw.slice(0, 200), days: Math.min(MAX_WORKDAYS, Math.floor(w.days)), note: w.note.slice(0, 120) }]));
  } catch { /* storage disabled: the card stays as it was */ }
}

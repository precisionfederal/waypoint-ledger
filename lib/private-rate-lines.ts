/* ==========================================================================
   WHICH HOSPITAL-PUBLISHED RANGES A LEDGER LINE SHOWS, WITHOUT THE RATES.

   lib/fit.ts names how many hospitals' files list commercial rates for a line
   (the employer and Marketplace sentence). fit.ts is on every page's first load,
   and the rates themselves (data/private-rates-client.json, about 41 KB) are
   needed only when a line's drawer opens. So the count comes from
   data/private-rates-lines.json, the hospitals behind each billing group per line
   (scripts/payer/build_private_rates.py, step 2c), and the rule for which group a
   line shows on its face lives here once. lib/private-rates.ts uses the same rule.
   tests/perf-private-rate-lines.test.ts holds the count equal to the one
   privateRangeFor computes from the rates, for every line.

   The same file carries each fee group's lowest and highest rate, so the ledger
   row can print the range the drawer opens on (faceRange) without the rates.
   tests/perf-private-rate-lines.test.ts and tests/face.test.ts hold it equal to
   the drawer's first range, for every line. It is never added to any total.
   ========================================================================== */
import packed from '@/data/private-rates-lines.json';

export type BillingGroup = 'professional' | 'facility' | 'not_stated';

/** A range needs rates from at least two hospitals; with fewer, none is shown. */
export const MIN_HOSPITALS = 2;

/* Which billing class sits beside which ledger line. A line that is the
   hospital's half is shown the facility rates; the doctor's half, the
   professional rates; the whole ER encounter, both, each on its own row and
   never added. Every other line is a CMS fee schedule amount for the clinician's
   service, so its first row is the professional one; the facility rates for the
   same code follow on their own labelled row. */
export const FACILITY_LINES = new Set(['cms-ed-99284-facility-only', 'cms-g0463-hospital-clinic-fee']);
const PROFESSIONAL_LINES = new Set(['cms-ed-99284-physician-only']);

/** The billing groups a line may show on its face, in order. */
export function faceOrder(itemId: string): BillingGroup[] {
  return FACILITY_LINES.has(itemId) ? ['facility']
    : PROFESSIONAL_LINES.has(itemId) ? ['professional']
      : ['professional', 'facility'];
}

/* p and f: [hospitals, lowest rate, highest rate]; n: hospitals only (its dollars never render). */
type GroupFace = [number, number, number];
const LINES = (packed as unknown as { lines: Record<string, { p?: GroupFace; f?: GroupFace; n?: number }> }).lines;

const faceOf = (itemId: string, group: BillingGroup): GroupFace | undefined =>
  group === 'professional' ? LINES[itemId]?.p : group === 'facility' ? LINES[itemId]?.f : undefined;

/** Hospitals behind the widest range on the line's face; 0 when the line shows none. */
export function privateRangeHospitals(item: { id: string }): number {
  let most = 0;
  for (const group of faceOrder(item.id)) {
    const n = faceOf(item.id, group)?.[0] ?? 0;
    if (n >= MIN_HOSPITALS && n > most) most = n;
  }
  return most;
}

/** The range the line's drawer opens on (its first shown group): lowest and highest
 *  hospital-published rate and how many hospitals publish it. null when fewer than
 *  MIN_HOSPITALS hospitals publish the line. A reference beside the Medicare figure,
 *  never a price for the person and never added to any total. */
export interface FaceRange { group: BillingGroup; low: number; high: number; hospitals: number }
export function faceRange(item: { id: string }): FaceRange | null {
  return faceRangeOf(item.id, LINES[item.id]);
}
/** The rule alone, for any packed entry (tests hold it below MIN_HOSPITALS). */
export function faceRangeOf(itemId: string, packedLine: { p?: GroupFace; f?: GroupFace } | undefined): FaceRange | null {
  for (const group of faceOrder(itemId)) {
    const g = group === 'professional' ? packedLine?.p : group === 'facility' ? packedLine?.f : undefined;
    if (g && g[0] >= MIN_HOSPITALS) return { group, hospitals: g[0], low: g[1], high: g[2] };
  }
  return null;
}

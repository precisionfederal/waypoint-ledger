/* ==========================================================================
   HOSPITAL-PUBLISHED NEGOTIATED RATES, beside the Medicare reference figure.

   Bo, 2026-09-30: "Why only Medicare data? Why don't you just do it for
   everybody?" The answer for a person on an employer or Marketplace plan is
   not a federal figure, because no federal file publishes what private plans
   pay. Hospitals do publish it: the federal hospital price transparency rule
   (45 CFR 180) makes every hospital post the rate it negotiated with each plan.

   🔴 WHAT THIS MODULE MAY AND MAY NOT DO
   · Every dollar figure here was printed by a hospital in its own file, read on
     the date shown, and pinned by that file's sha256. data/private-rates.json
     holds every rate with its payer, plan, row and file;
     scripts/payer/build_private_rates.py made the spreads; nothing here
     computes a price.
   · A spread is lowest, median and highest of the DISTINCT dollar amounts. It
     is never an average across plans, and it is never added to a ledger total.
   · These are not federal figures, and they are not national or typical
     prices. They are these hospitals' rates.
   · A range needs rates from at least two hospitals; with fewer, none is shown.
   ========================================================================== */
import packed from '@/data/private-rates-client.json';
import type { PriceItem } from './types';
import { FACILITY_LINES, MIN_HOSPITALS, faceOrder, type BillingGroup } from './private-rate-lines';

export { MIN_HOSPITALS, type BillingGroup };

export interface HospitalSpan { source: string; low: number; high: number; rates: number; rows: number }
export interface Spread {
  low: number; median: number; high: number;
  /** distinct dollar amounts across the hospitals */
  rates: number;
  /** payer-and-plan lines that carry them */
  rows: number;
  hospitals: number;
  byHospital: HospitalSpan[];
}
export interface CodeRates {
  code: string; codeType: string; ledgerLines: string[];
  groups: Partial<Record<BillingGroup, Spread>>;
  rowsRead: number;
  notInSpread: Record<string, number>;
}
export interface RateSource {
  id: string; displayName: string; system: string; kind: string; hospitalName: string;
  locationName: string; lastUpdatedOn: string; fileUrl: string; sha256: string; readAt: string; rule: string;
}

/* data/private-rates-client.json is data/private-rates-summary.json packed for the
   bundle (scripts/payer/build_private_rates.py, step 2b). Unpacked once, here. */
type PackedSpread = [number, number, number, number, number, [number, number, number, number, number][]];
const P = packed as unknown as {
  sources: RateSource[];
  notRead: { system: string; why: string }[];
  leftOutKeys: string[];
  lines: Record<string, string>;
  codes: Record<string, [string, number, Record<string, PackedSpread>, [number, number][]]>;
};
const GROUP_OF: Record<string, BillingGroup> = { p: 'professional', f: 'facility', n: 'not_stated' };
const CODES: Record<string, CodeRates> = {};
for (const [code, [t, rowsRead, g, left]] of Object.entries(P.codes)) {
  const groups: CodeRates['groups'] = {};
  for (const [k, [low, median, high, rates, rows, byH]] of Object.entries(g)) {
    groups[GROUP_OF[k]] = {
      low, median, high, rates, rows, hospitals: byH.length,
      byHospital: byH.map(([i, l, h, r, n]) => ({ source: P.sources[i].id, low: l, high: h, rates: r, rows: n })),
    };
  }
  CODES[code] = {
    code, codeType: t === 'H' ? 'HCPCS' : 'CPT',
    ledgerLines: Object.entries(P.lines).filter(([, c]) => c === code).map(([id]) => id),
    groups, rowsRead,
    notInSpread: Object.fromEntries(left.map(([i, n]) => [P.leftOutKeys[i], n])),
  };
}
const S = { sources: P.sources, notRead: P.notRead, codes: CODES };

export const PRIVATE_RATE_RULE = '45 CFR 180';
export const PRIVATE_RATE_RULE_URL = 'https://www.govinfo.gov/link/cfr/45/180?sectionnum=50&year=mostrecent';
/** the one label every range carries, on every surface */
export const PRIVATE_RATE_LABEL = 'Hospital-published negotiated rates';
export const PRIVATE_RATE_LABEL_LONG =
  'Hospital-published negotiated rates (required by the federal hospital price transparency rule, 45 CFR 180)';
export const PRIVATE_RATE_NOT_FEDERAL =
  'These are rates the hospitals printed in their own files, not federal figures, and they are never added to your total.';

export const RATE_SOURCES: RateSource[] = S.sources;
export const RATE_SOURCES_NOT_READ = S.notRead;
export const PRIVATE_RATE_CODES: Record<string, CodeRates> = S.codes;
export const sourceById = (id: string): RateSource | undefined => S.sources.find((s) => s.id === id);

/** The date the files were read, as one date when they were all read the same day. */
export function readDates(ids: string[]): string[] {
  const set = new Set(ids.map((id) => sourceById(id)?.readAt.slice(0, 10)).filter(Boolean) as string[]);
  return [...set].sort();
}

export const GROUP_LABEL: Record<BillingGroup, string> = {
  professional: 'Doctor’s fee (professional claim)',
  facility: 'Hospital’s own fee (facility claim)',
  not_stated: 'Fee type not stated in the hospital’s file',
};

/* Which billing class sits beside which ledger line: lib/private-rate-lines.ts
   (faceOrder), the one rule the fit sentence's hospital count also uses. */

/** The whole ER encounter: Medicare's figure is the hospital's half plus the doctor's,
 *  so it is comparable to neither range alone and no marker is drawn. */
const COMBINED_LINES = new Set(['cms-ed-99284-complete']);

/** Does Medicare's figure for this line price the same fee as this range? Fee-schedule
 *  lines price the clinician's service (professional); the hospital's-half lines price
 *  the facility fee; the whole-encounter line prices both and is marked on neither. */
export function medicareMarkerApplies(item: Pick<PriceItem, 'id'>, group: BillingGroup): boolean {
  if (COMBINED_LINES.has(item.id)) return false;
  if (FACILITY_LINES.has(item.id)) return group === 'facility';
  return group === 'professional';
}

export function codeOf(item: Pick<PriceItem, 'id' | 'code'>): string | null {
  return P.lines[item.id] ?? null;
}

export interface ShownRange { group: BillingGroup; label: string; spread: Spread; hospitals: RateSource[]; readOn: string[] }
export interface PrivateRangeView {
  code: string; codeType: string;
  /** the ranges shown on the face, each with two or more hospitals */
  shown: ShownRange[];
  /** groups held back because fewer than MIN_HOSPITALS hospitals list a rate */
  heldBack: { group: BillingGroup; hospitals: number }[];
  notInSpread: Record<string, number>;
  rowsRead: number;
}

export function privateRangeFor(item: Pick<PriceItem, 'id' | 'code'>): PrivateRangeView | null {
  const code = codeOf(item);
  if (!code) return null;
  const c = S.codes[code];
  const order: BillingGroup[] = faceOrder(item.id);
  const shown: ShownRange[] = [];
  const heldBack: PrivateRangeView['heldBack'] = [];
  for (const g of [...order, 'not_stated' as BillingGroup]) {
    const sp = c.groups[g];
    if (!sp) continue;
    if (sp.hospitals < MIN_HOSPITALS) { heldBack.push({ group: g, hospitals: sp.hospitals }); continue; }
    if (g === 'not_stated' || !order.includes(g)) continue;
    const ids = sp.byHospital.map((h) => h.source);
    shown.push({ group: g, label: GROUP_LABEL[g], spread: sp, hospitals: ids.map((id) => sourceById(id)!).filter(Boolean), readOn: readDates(ids) });
  }
  if (!shown.length) return null;
  return { code, codeType: c.codeType, shown, heldBack, notInSpread: c.notInSpread, rowsRead: c.rowsRead };
}

/** The not-stated group and any group this line does not show on its face, for the fold. */
export function otherRangesFor(item: Pick<PriceItem, 'id' | 'code'>): ShownRange[] {
  const view = privateRangeFor(item);
  if (!view) return [];
  const c = S.codes[view.code];
  const onFace = new Set(view.shown.map((s) => s.group));
  const out: ShownRange[] = [];
  /* 🔴 the not-stated group never renders as dollar amounts (coordinator, 2026-09-30):
     those files hold whatever a hospital coded with the CPT, e.g. a "FETAL DEMISE"
     line under 99214 at $2,845.80. It is a count only; see unstatedRatesFor. */
  for (const g of ['professional', 'facility'] as BillingGroup[]) {
    const sp = c.groups[g];
    if (!sp || onFace.has(g) || sp.hospitals < MIN_HOSPITALS) continue;
    const ids = sp.byHospital.map((h) => h.source);
    out.push({ group: g, label: GROUP_LABEL[g], spread: sp, hospitals: ids.map((id) => sourceById(id)!).filter(Boolean), readOn: readDates(ids) });
  }
  return out;
}

/** How many distinct rates come from files that do not say whether a line is the
 *  doctor's fee or the hospital's. Shown as a count, never as dollar amounts. */
export function unstatedRatesFor(item: Pick<PriceItem, 'id' | 'code'>): number {
  const code = codeOf(item);
  return code ? (S.codes[code].groups.not_stated?.rates ?? 0) : 0;
}

/** Plain words for each reason a published rate was left out of the range. */
export const LEFT_OUT: Record<string, string> = {
  'plan:medicare_advantage': 'Medicare Advantage plans',
  'plan:medicaid': 'Medicaid plans',
  'plan:other': 'workers’ comp, auto, TRICARE, VA, transplant and other special contracts',
  'plan:not_stated': 'plans the file does not say are commercial',
  'rate:percentage': 'a percentage of the bill, not a dollar amount',
  'rate:per_diem': 'a per-day rate',
  'rate:other_dollar': 'a dollar amount the file marks "other"',
  'rate:algorithm_only': 'a formula with no dollar amount',
  'setting:inpatient': 'inpatient stays',
  'setting:not_stated': 'setting not stated',
  modifier: 'billed with a modifier (one part of the service)',
  'above-own-gross-charge': 'higher than the hospital’s own list price for the same line',
  'amount<=0': 'zero or blank',
};

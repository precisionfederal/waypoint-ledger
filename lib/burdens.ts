/* ==========================================================================
   THE BURDENS THE CLAIMS FILES NEVER SEE

   /survey asks people to rank five burdens: money, time, missed work, unpaid
   care, and care gone without. Until now the ledger priced exactly one of them.

   This module prices two more — missed work and unpaid care — from two BLS
   rows that are already in the verified table, and counts two that no federal
   file prices at all. Four rules govern every line here:

   1. NO NEW NUMBER. Every dollar comes from `data/prices.json`
      (`bls2026q2-median-weekly-earnings`, `bls2025-caregiver-replacement-wages`)
      or from a figure the person typed about their own pay.
   2. THE ARITHMETIC IS PRINTED. The BLS earnings row says it in its own words:
      BLS publishes weekly and never daily, so a daily figure "is arithmetic
      and must be shown as arithmetic, never cited as a government statistic."
      Every card carries the multiplication on its face.
   3. NEVER SUMMED. Not into the medical total, and not with each other. There
      is deliberately no function in this file that adds two cards together:
      a week of missed work and an hour of a sister's time are different
      quantities, and Dr. Phillips's question about weighting is answered by
      not weighting.
   4. THE PERSON CHOOSES THE BASIS. The caregiving row is explicit that the
      defensible range spans a factor of 2.7 depending on which task is being
      priced, and that "showing the range is more truthful than asserting a
      point." So the method is a control, not a default we hide.
   ========================================================================== */

import { TABLE, rulesFor } from './table';
import type { PriceItem } from './types';

export const WORKDAY_ROW_ID = 'bls2026q2-median-weekly-earnings';
export const CARE_ROW_ID = 'bls2025-caregiver-replacement-wages';
export const BURDENS_KEY = 'waypoint-ledger.burdens.v1';

/** The gap-report category a dismissal count is sent as (see cf/functions/api/gap.js). */
export const DISMISSED_CATEGORY = 'dismissed';

export type BurdenKind = 'workdays' | 'care-hours' | 'trips' | 'dismissed';
export type CareMethodId = 'home-health-aide' | 'nursing-assistant' | 'registered-nurse' | 'opportunity-cost';
export type PayBasisId = 'median' | 'men' | 'women' | 'own';

const rowOf = (id: string): PriceItem | null => TABLE.find((i) => i.id === id) ?? null;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const alt = (id: string, key: string): number | null => num(rulesFor(id).alternates?.[key]);

export const cents = (n: number): number => Math.round(n * 100) / 100;

/** Money, printed the way the rest of the ledger prints it. Cents where cents matter. */
export function money(n: number, showCents = true): string {
  return n.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0, maximumFractionDigits: showCents ? 2 : 0,
  });
}

const clamp = (n: number, max: number): number =>
  !Number.isFinite(n) || n <= 0 ? 0 : Math.min(Math.floor(n), max);

export const MAX = { workdays: 3650, careHours: 20000, trips: 3650, dismissed: 500 } as const;

export interface BurdenCounts {
  workdays: number;
  careHours: number;
  trips: number;
  dismissed: number;
  careMethod: CareMethodId;
  payBasis: PayBasisId;
  /** What the person says a week of their own work is worth. Never leaves the device. */
  ownWeeklyPayUsd: number | null;
}

export const EMPTY_BURDENS: BurdenCounts = {
  workdays: 0, careHours: 0, trips: 0, dismissed: 0,
  careMethod: 'home-health-aide', payBasis: 'median', ownWeeklyPayUsd: null,
};

export interface BurdenSource {
  priceId: string | null;
  title: string | null;
  url: string | null;
  year: string | null;
  describes: string | null;
}

export interface BurdenAlternative { id: string; label: string; valueUsd: number; note: string; arithmetic: string | null }

export interface BurdenCard {
  kind: BurdenKind;
  /** The heading on the card. */
  title: string;
  /** The question put to the person, in their own terms. */
  question: string;
  unit: string;
  count: number;
  /** null means no published federal figure prices this. It stays blank; it is never filled. */
  valueUsd: number | null;
  tag: 'DERIVED' | 'COUNT ONLY';
  /** The multiplication, shown on the face of the card. */
  arithmetic: string | null;
  /** What method produced the figure, in one sentence. */
  method: string;
  /** Who the federal figure describes, and who it leaves out. */
  limit: string;
  source: BurdenSource;
  /** Other defensible ways to price the same count, all from the same federal row. */
  alternatives: BurdenAlternative[];
  /** Present only when nothing prices this burden. */
  noFigureReason: string | null;
}

/* ------------------------------------------------------------------ pay */

export interface PayBasisOption { id: PayBasisId; label: string; weeklyUsd: number | null; note: string }

/** The published weekly-earnings figures on the BLS row, plus the person's own. */
export function payBases(ownWeeklyPayUsd: number | null): PayBasisOption[] {
  const row = rowOf(WORKDAY_ROW_ID);
  return [
    { id: 'median', label: 'All full-time workers', weeklyUsd: row?.valueUsd ?? null, note: 'The published national median: half of full-time workers earn more, half less.' },
    { id: 'men', label: 'Men, full time', weeklyUsd: alt(WORKDAY_ROW_ID, 'men_usd'), note: 'Published in the same release.' },
    { id: 'women', label: 'Women, full time', weeklyUsd: alt(WORKDAY_ROW_ID, 'women_usd'), note: 'Published in the same release. Long COVID is more common among women, so the all-worker median over-prices the typical patient.' },
    { id: 'own', label: 'My own weekly pay', weeklyUsd: ownWeeklyPayUsd, note: 'Your figure, not a federal one. It stays in this browser and is never sent anywhere.' },
  ];
}

export function weeklyPayFor(basis: PayBasisId, ownWeeklyPayUsd: number | null): { weeklyUsd: number | null; label: string; federal: boolean } {
  const opt = payBases(ownWeeklyPayUsd).find((o) => o.id === basis) ?? payBases(ownWeeklyPayUsd)[0];
  return { weeklyUsd: opt.weeklyUsd, label: opt.label, federal: opt.id !== 'own' };
}

/* ------------------------------------------------------- missed workdays */

export function priceWorkdays(daysIn: number, basis: PayBasisId = 'median', ownWeeklyPayUsd: number | null = null): BurdenCard {
  const days = clamp(daysIn, MAX.workdays);
  const row = rowOf(WORKDAY_ROW_ID);
  const pay = weeklyPayFor(basis, ownWeeklyPayUsd);
  const weekly = pay.weeklyUsd;
  const daily = weekly === null ? null : cents(weekly / 5);
  const value = daily === null || days === 0 ? null : cents(daily * days);
  const source: BurdenSource = pay.federal
    ? { priceId: WORKDAY_ROW_ID, title: row?.sourceTitle ?? null, url: row?.sourceUrl ?? null, year: row?.year ?? null, describes: row?.population ?? null }
    : { priceId: null, title: 'Your own figure, typed by you', url: null, year: null, describes: 'You. It is not a federal statistic and is not published anywhere.' };

  return {
    kind: 'workdays',
    title: 'Workdays you missed',
    question: 'How many workdays did the search for a diagnosis take from you?',
    unit: days === 1 ? 'day' : 'days',
    count: days,
    valueUsd: value,
    tag: 'DERIVED',
    arithmetic: weekly === null || daily === null || days === 0 ? null
      : `${money(weekly, false)} a week ÷ 5 = ${money(daily)} a day × ${days} ${days === 1 ? 'day' : 'days'} = ${money(value ?? 0)}`,
    method: pay.federal
      ? `Published weekly earnings (${pay.label}) divided by five, times the days you entered. BLS publishes this figure weekly and never daily, so the daily number here is arithmetic on this page, not a government statistic.`
      : 'Your own weekly pay divided by five, times the days you entered. No federal figure is involved in this line.',
    limit: pay.federal
      ? 'It describes people still working full time. Anyone who cut their hours or stopped working because of the illness has left the count, so as a measure of what an illness costs a person it runs low. The self-employed are excluded entirely.'
      : 'This is your figure. It describes you and nobody else, and it is not evidence about anyone else.',
    source,
    alternatives: pay.federal ? payBases(ownWeeklyPayUsd)
      .filter((o) => o.id !== basis && o.id !== 'own' && o.weeklyUsd !== null)
      .map((o) => ({
        id: o.id, label: o.label, valueUsd: cents((o.weeklyUsd as number) / 5 * days), note: o.note,
        arithmetic: days === 0 ? null : `${money(o.weeklyUsd as number, false)} ÷ 5 × ${days} = ${money(cents((o.weeklyUsd as number) / 5 * days))}`,
      })) : [],
    noFigureReason: weekly === null ? 'No weekly earnings figure is loaded, so this line stays blank.' : null,
  };
}

/* --------------------------------------------------------- unpaid caring */

export interface CareMethodOption { id: CareMethodId; label: string; hourlyUsd: number | null; question: string }

/** Every rate here is published on the caregiving row; the person picks which task is being priced. */
export function careMethods(): CareMethodOption[] {
  return [
    { id: 'home-health-aide', label: 'Custodial help', hourlyUsd: alt(CARE_ROW_ID, 'home_health_aide_median_hourly_usd'), question: 'What it would cost to buy the help you were given: bathing, dressing, meals, getting to appointments.' },
    { id: 'nursing-assistant', label: 'Clinical tasks', hourlyUsd: alt(CARE_ROW_ID, 'nursing_assistant_median_hourly_usd'), question: 'What it would cost if the tasks were the ones a nursing assistant does.' },
    { id: 'registered-nurse', label: 'Nursing-level care', hourlyUsd: alt(CARE_ROW_ID, 'registered_nurse_median_hourly_usd'), question: 'What it would cost if the care was genuinely nursing-level.' },
    { id: 'opportunity-cost', label: 'What they gave up', hourlyUsd: alt(CARE_ROW_ID, 'all_occupations_median_hourly_usd'), question: 'A different question entirely: what the person caring for you gave up by not working, at the all-occupations median wage.' },
  ];
}

export function priceCareHours(hoursIn: number, method: CareMethodId = 'home-health-aide'): BurdenCard {
  const hours = clamp(hoursIn, MAX.careHours);
  const row = rowOf(CARE_ROW_ID);
  const opts = careMethods();
  const chosen = opts.find((m) => m.id === method) ?? opts[0];
  const rate = chosen.hourlyUsd;
  const value = rate === null || hours === 0 ? null : cents(rate * hours);

  return {
    kind: 'care-hours',
    title: 'Hours someone cared for you, unpaid',
    question: 'Roughly how many hours did someone look after you without being paid for it?',
    unit: hours === 1 ? 'hour' : 'hours',
    count: hours,
    valueUsd: value,
    tag: 'DERIVED',
    arithmetic: rate === null || hours === 0 ? null
      : `${money(rate)} an hour × ${hours} ${hours === 1 ? 'hour' : 'hours'} = ${money(value ?? 0)} · ${chosen.label.toLowerCase()}`,
    method: `${chosen.question} The wage is the published BLS median for that occupation, times the hours you entered.`,
    limit: 'BLS publishes the wage, and separately the hours, and has never published their product — it says putting a money value on unpaid household work is outside the scope of its work. So this is arithmetic over two federal inputs, shown as arithmetic, and never a federal statistic. It is also a wage, not a price: a family hiring through an agency pays more, and BLS does not publish that rate.',
    source: { priceId: CARE_ROW_ID, title: row?.sourceTitle ?? null, url: row?.sourceUrl ?? null, year: row?.year ?? null, describes: row?.population ?? null },
    alternatives: opts.filter((m) => m.id !== chosen.id && m.hourlyUsd !== null).map((m) => ({
      id: m.id, label: m.label, valueUsd: cents((m.hourlyUsd as number) * hours), note: m.question,
      arithmetic: hours === 0 ? null : `${money(m.hourlyUsd as number)} × ${hours} = ${money(cents((m.hourlyUsd as number) * hours))}`,
    })),
    noFigureReason: rate === null ? 'No hourly figure is loaded for that method, so this line stays blank.' : null,
  };
}

/* ------------------------------------------------ counted, never priced */

export function countTrips(tripsIn: number): BurdenCard {
  const trips = clamp(tripsIn, MAX.trips);
  return {
    kind: 'trips',
    title: 'Trips you made',
    question: 'How many times did you travel to get care during the search?',
    unit: trips === 1 ? 'trip' : 'trips',
    count: trips,
    valueUsd: null,
    tag: 'COUNT ONLY',
    arithmetic: null,
    method: 'Counted, not priced.',
    limit: 'Miles, parking, fuel, a bus fare and a day of someone else driving are all real, and they differ so much by person that a single national figure would describe almost nobody.',
    source: { priceId: null, title: null, url: null, year: null, describes: null },
    alternatives: [],
    noFigureReason: 'No published federal figure prices a trip to care, so this column stays blank rather than get filled with an estimate. The table does carry the federal mileage rate — GSA, $0.76 a mile from 1 July 2026 — which reimburses federal travellers for a mile driven on official business. It is an input you can apply to your own miles, it is not a medical price, and nothing here adds it for you.',
  };
}

export function countDismissed(timesIn: number): BurdenCard {
  const times = clamp(timesIn, MAX.dismissed);
  return {
    kind: 'dismissed',
    title: 'Times you were told it was nothing',
    question: 'How many times were you told your symptoms were anxiety, stress, or nothing at all?',
    unit: times === 1 ? 'time' : 'times',
    count: times,
    valueUsd: null,
    tag: 'COUNT ONLY',
    arithmetic: null,
    method: 'Counted, not priced. You can add the count to the public tally, which is the only place it exists.',
    limit: 'A visit where you were told it was nothing was still billed as a visit, so the money is already in the ledger above. What is missing everywhere is the dismissal itself.',
    source: { priceId: null, title: null, url: null, year: null, describes: null },
    alternatives: [],
    noFigureReason: 'No dataset records being dismissed. MEPS, HCUP and CMS files record care that was delivered and billed.',
  };
}

/* ------------------------------------------------------------ the cards */

/** The four cards, in order. Deliberately no total: they are never added. */
export function burdenCards(c: BurdenCounts): BurdenCard[] {
  return [
    priceWorkdays(c.workdays, c.payBasis, c.ownWeeklyPayUsd),
    priceCareHours(c.careHours, c.careMethod),
    countTrips(c.trips),
    countDismissed(c.dismissed),
  ];
}

/** How many of the four the person actually filled in. Used for the heading, never for money. */
export function burdensEntered(c: BurdenCounts): number {
  return [c.workdays, c.careHours, c.trips, c.dismissed].filter((n) => n > 0).length;
}

/* ------------------------------------------- persistence, on this device */

const CARE_IDS: CareMethodId[] = ['home-health-aide', 'nursing-assistant', 'registered-nurse', 'opportunity-cost'];
const PAY_IDS: PayBasisId[] = ['median', 'men', 'women', 'own'];

export function normalizeBurdens(raw: unknown): BurdenCounts {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_BURDENS };
  const r = raw as Record<string, unknown>;
  const own = num(r.ownWeeklyPayUsd);
  return {
    workdays: clamp(num(r.workdays) ?? 0, MAX.workdays),
    careHours: clamp(num(r.careHours) ?? 0, MAX.careHours),
    trips: clamp(num(r.trips) ?? 0, MAX.trips),
    dismissed: clamp(num(r.dismissed) ?? 0, MAX.dismissed),
    careMethod: CARE_IDS.includes(r.careMethod as CareMethodId) ? (r.careMethod as CareMethodId) : 'home-health-aide',
    payBasis: PAY_IDS.includes(r.payBasis as PayBasisId) ? (r.payBasis as PayBasisId) : 'median',
    ownWeeklyPayUsd: own !== null && own > 0 ? cents(Math.min(own, 100000)) : null,
  };
}

export function loadBurdens(): BurdenCounts {
  if (typeof localStorage === 'undefined') return { ...EMPTY_BURDENS };
  try {
    const raw = localStorage.getItem(BURDENS_KEY);
    return raw ? normalizeBurdens(JSON.parse(raw)) : { ...EMPTY_BURDENS };
  } catch { return { ...EMPTY_BURDENS }; }
}

export function saveBurdens(c: BurdenCounts): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (burdensEntered(c) === 0 && c.ownWeeklyPayUsd === null) localStorage.removeItem(BURDENS_KEY);
    else localStorage.setItem(BURDENS_KEY, JSON.stringify(c));
  } catch { /* a browser with storage disabled still works, it just forgets */ }
}

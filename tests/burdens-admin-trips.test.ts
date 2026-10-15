/* FINAL-1014 admin lane: the hours on the phone and paperwork, and the trips
   valued on the person's own miles and hours. Every rate is read from the
   verified table; every figure is arithmetic shown on the card; none is ever
   added to the medical total or to another card. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as B from '../lib/burdens';
import {
  BURDENS_KEY, CARE_ROW_ID, EMPTY_BURDENS, MAX, MILEAGE_ROW_ID, TYPICAL_WAGE_KEY,
  burdenCards, burdensEntered, countTrips, loadBurdens, normalizeBurdens, priceAdminHours, saveBurdens, typicalHourlyWage,
} from '../lib/burdens';
import { TABLE, rulesFor } from '../lib/table';

const pricesRaw = JSON.parse(readFileSync('data/prices.json', 'utf8'));
const prices = (Array.isArray(pricesRaw) ? pricesRaw : pricesRaw.items) as { id: string; value_usd: number; summable?: boolean; alternates?: Record<string, unknown> }[];
const rowJson = (id: string) => prices.find((r) => r.id === id)!;
const WAGE = rowJson(CARE_ROW_ID).alternates![TYPICAL_WAGE_KEY] as number;
const PER_MILE = rowJson(MILEAGE_ROW_ID).value_usd;
const TODAY_TRIP_TEXT = 'No published federal figure prices a trip to care, so this column stays blank rather than get filled with an estimate. The table does carry the federal mileage rate (GSA, $0.76 a mile from 1 July 2026), which reimburses federal travellers for a mile driven on official business. It is an input you can apply to your own miles, it is not a medical price, and nothing here adds it for you.';

describe('the rates come from the verified table, never a new number', () => {
  it('the wage is the all-occupations median on the caregiving row, and the mile is the GSA row', () => {
    expect(WAGE).toBe(24.51);
    expect(typicalHourlyWage()).toBe(WAGE);
    expect(rulesFor(CARE_ROW_ID).alternates?.[TYPICAL_WAGE_KEY]).toBe(WAGE);
    expect(PER_MILE).toBe(0.76);
    expect(TABLE.find((i) => i.id === MILEAGE_ROW_ID)?.valueUsd).toBe(PER_MILE);
  });

  it('the mileage row can never enter a medical total', () => {
    expect(rowJson(MILEAGE_ROW_ID).summable).toBe(false);
  });
});

describe('hours on the phone and paperwork', () => {
  it('prices ten hours at the published median wage, with the arithmetic on its face', () => {
    const c = priceAdminHours(10);
    expect(c.kind).toBe('admin-hours');
    expect(c.title).toBe('Hours on the phone and paperwork');
    expect(c.question).toContain('insurers and offices, chasing records, referrals and prior authorizations');
    expect(c.valueUsd).toBe(245.1);
    expect(c.arithmetic).toBe('10 hours × $24.51 an hour (BLS all-occupations median) = $245.10');
    expect(c.tag).toBe('DERIVED');
    expect(c.source.priceId).toBe(CARE_ROW_ID);
    expect(c.source.url).toBeTruthy();
  });

  it('says what the figure means: the value of the time at the typical wage, not money paid', () => {
    const c = priceAdminHours(3);
    expect(c.method).toContain('typical U.S. wage, not money anyone paid');
    expect(c.limit).toContain('never a federal statistic');
    /* the caregiving row's population is aides; this card must not say it describes aides */
    expect(c.source.describes).not.toMatch(/aide/i);
  });

  it('one hour reads in the singular; zero is blank; the count is clamped', () => {
    expect(priceAdminHours(1).arithmetic).toBe('1 hour × $24.51 an hour (BLS all-occupations median) = $24.51');
    expect(priceAdminHours(0).valueUsd).toBeNull();
    expect(priceAdminHours(0).arithmetic).toBeNull();
    expect(priceAdminHours(-4).count).toBe(0);
    expect(priceAdminHours(99999).count).toBe(MAX.adminHours);
    expect(MAX.adminHours).toBe(5000);
  });
});

describe('trips: counted, and valued only on the person\'s own miles and hours', () => {
  it('miles and hours blank: today\'s no-figure text stays, word for word', () => {
    const c = countTrips(12);
    expect(c.valueUsd).toBeNull();
    expect(c.arithmetic).toBeNull();
    expect(c.ownLines).toEqual([]);
    expect(c.tag).toBe('COUNT ONLY');
    expect(c.noFigureReason).toBe(TODAY_TRIP_TEXT);
    expect(c.method).toBe('Counted, not priced.');
  });

  it('miles only: trips × miles × the GSA rate, and no time line', () => {
    const c = countTrips(12, 40);
    expect(c.ownLines).toHaveLength(1);
    expect(c.ownLines[0].id).toBe('miles');
    expect(c.ownLines[0].valueUsd).toBe(364.8);
    expect(c.ownLines[0].arithmetic).toBe('12 trips × 40 miles × $0.76 a mile (GSA rate) = $364.80');
    expect(c.arithmetic).toBe('12 trips × 40 miles × $0.76 a mile (GSA rate) = $364.80');
    expect(c.source.priceId).toBe(MILEAGE_ROW_ID);
    expect(c.tag).toBe('YOUR NUMBERS');
  });

  it('hours only: trips × hours × the median wage, and no mileage line', () => {
    const c = countTrips(12, 0, 3);
    expect(c.ownLines.map((l) => l.id)).toEqual(['trip-hours']);
    expect(c.ownLines[0].valueUsd).toBe(882.36);
    expect(c.arithmetic).toBe('12 trips × 3 hours × $24.51 an hour (BLS all-occupations median) = $882.36');
    expect(c.source.priceId).toBe(CARE_ROW_ID);
  });

  it('both: two lines, each standing alone, and the card itself still carries no price', () => {
    const c = countTrips(12, 40, 3);
    expect(c.ownLines.map((l) => l.valueUsd)).toEqual([364.8, 882.36]);
    expect(c.valueUsd).toBeNull();
    expect(c.arithmetic).toBe('12 trips × 40 miles × $0.76 a mile (GSA rate) = $364.80 · 12 trips × 3 hours × $24.51 an hour (BLS all-occupations median) = $882.36');
    /* never summed: the sum of the two lines appears nowhere on the card */
    expect(JSON.stringify(c)).not.toContain('1,247.16');
    expect(JSON.stringify(c)).not.toContain('1247.16');
    expect(c.noFigureReason).toContain('arithmetic on the numbers you typed');
    expect(c.noFigureReason).toContain('Neither line is a medical price or added to anything');
  });

  it('miles or hours with no trips counted makes no figure; decimals keep one place', () => {
    expect(countTrips(0, 40, 3).ownLines).toEqual([]);
    expect(countTrips(2, 12.25).ownLines[0].arithmetic).toBe('2 trips × 12.3 miles × $0.76 a mile (GSA rate) = $18.70');
    expect(countTrips(1, 1, 1).ownLines.map((l) => l.arithmetic)).toEqual([
      '1 trip × 1 mile × $0.76 a mile (GSA rate) = $0.76',
      '1 trip × 1 hour × $24.51 an hour (BLS all-occupations median) = $24.51',
    ]);
    expect(countTrips(5, 99999, 99999).ownLines.map((l) => l.arithmetic)[0]).toContain(`${MAX.milesPerTrip} miles`);
  });

  it('the wording a patient reads carries no em-dash', () => {
    for (const c of [priceAdminHours(4), countTrips(3, 20, 2), countTrips(3)]) {
      const words = [c.title, c.question, c.method, c.limit, c.noFigureReason ?? '', c.arithmetic ?? '', c.source.describes ?? '', ...c.ownLines.map((l) => l.label)];
      for (const w of words) expect(w).not.toContain('—');
    }
  });
});

describe('the five cards, never added to the medical total or to each other', () => {
  it('the card count includes the phone-and-paperwork card', () => {
    const cards = burdenCards({ ...EMPTY_BURDENS, adminHours: 8, trips: 4, milesPerTrip: 30, hoursPerTrip: 2 });
    expect(cards.map((c) => c.kind)).toEqual(['workdays', 'care-hours', 'admin-hours', 'trips', 'dismissed']);
    expect(cards.find((c) => c.kind === 'trips')!.ownLines).toHaveLength(2);
    expect(burdensEntered({ ...EMPTY_BURDENS, adminHours: 8 })).toBe(1);
    expect(burdensEntered({ ...EMPTY_BURDENS, workdays: 1, careHours: 1, adminHours: 1, trips: 1, dismissed: 1 })).toBe(5);
  });

  it('nothing in the module totals them, and the medical pricing never reads them', () => {
    expect(Object.keys(B).filter((k) => /total|sum|combine|aggregate/i.test(k))).toEqual([]);
    const pricing = readFileSync('lib/pricing.ts', 'utf8');
    expect(pricing).not.toMatch(/burdens/);
  });
});

describe('saved state on this device', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a ledger saved before these fields existed loads, with each new field 0', () => {
    const old = { workdays: 9, careHours: 40, trips: 12, dismissed: 2, careMethod: 'nursing-assistant', payBasis: 'median', ownWeeklyPayUsd: null };
    expect(normalizeBurdens(old)).toEqual({ ...EMPTY_BURDENS, workdays: 9, careHours: 40, trips: 12, dismissed: 2, careMethod: 'nursing-assistant' });
    const store = new Map<string, string>([[BURDENS_KEY, JSON.stringify(old)]]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    const c = loadBurdens();
    expect(c.adminHours).toBe(0);
    expect(c.milesPerTrip).toBe(0);
    expect(c.hoursPerTrip).toBe(0);
    expect(burdenCards(c).find((k) => k.kind === 'trips')!.noFigureReason).toBe(TODAY_TRIP_TEXT);
  });

  it('the new fields round-trip, junk becomes blank, and typed miles alone are kept', () => {
    expect(normalizeBurdens({ adminHours: 7.9, milesPerTrip: 42.26, hoursPerTrip: 'three' })).toMatchObject({ adminHours: 7, milesPerTrip: 42.3, hoursPerTrip: 0 });
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    saveBurdens({ ...EMPTY_BURDENS, milesPerTrip: 30 });
    expect(loadBurdens().milesPerTrip).toBe(30);
    saveBurdens({ ...EMPTY_BURDENS, adminHours: 12, trips: 3, milesPerTrip: 18, hoursPerTrip: 1.5 });
    expect(loadBurdens()).toMatchObject({ adminHours: 12, trips: 3, milesPerTrip: 18, hoursPerTrip: 1.5 });
    saveBurdens({ ...EMPTY_BURDENS });
    expect(store.has(BURDENS_KEY)).toBe(false);
  });
});

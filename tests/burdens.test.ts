/* The burden lines are the only place in this product where a dollar figure is
   produced by arithmetic rather than a lookup. These tests exist so that the
   arithmetic can never quietly become an estimate: every input must come from a
   published row, the multiplication must be printed exactly as it is computed,
   and nothing here may ever be summed into the medical total or into another
   burden. A test that fails here is a claim we would not be able to defend. */
import { describe, it, expect } from 'vitest';
import * as B from '../lib/burdens';
import {
  BURDENS_KEY, CARE_ROW_ID, DISMISSED_CATEGORY, EMPTY_BURDENS, MAX, WORKDAY_ROW_ID,
  burdenCards, burdensEntered, careMethods, countDismissed, countTrips, money,
  normalizeBurdens, payBases, priceCareHours, priceWorkdays,
} from '../lib/burdens';
import { TABLE, rulesFor } from '../lib/table';
import { CATEGORY_IDS, validateGap } from '../cf/functions/api/gap.js';

const row = (id: string) => {
  const r = TABLE.find((i) => i.id === id);
  if (!r) throw new Error(`${id} is not in the published table`);
  return r;
};

describe('the two federal inputs are real rows in the published table', () => {
  it('weekly earnings is the BLS figure, read from the table and not from the code', () => {
    const r = row(WORKDAY_ROW_ID);
    expect(r.valueUsd).toBe(1251);
    expect(r.basis).toBe('wage');
    expect(r.sourceUrl).toContain('bls.gov');
    expect(r.confidence).toBe('VERIFIED');
  });

  it('the caregiving wage is the BLS figure with its four published rates', () => {
    const r = row(CARE_ROW_ID);
    expect(r.valueUsd).toBe(17.21);
    expect(r.sourceUrl).toContain('bls.gov');
    expect(careMethods().map((m) => m.hourlyUsd)).toEqual([17.21, 20.32, 46.9, 24.51]);
  });

  it('🔴 neither row may ever enter an itemized medical total', () => {
    expect(rulesFor(WORKDAY_ROW_ID).summable).toBe(false);
    expect(rulesFor(CARE_ROW_ID).summable).toBe(false);
  });
});

describe('missed workdays — weekly earnings ÷ 5 × days, printed', () => {
  it('prices twelve days to the cent', () => {
    const c = priceWorkdays(12);
    expect(c.valueUsd).toBe(3002.4);
    expect(c.arithmetic).toBe('$1,251 a week ÷ 5 = $250.20 a day × 12 days = $3,002.40');
    expect(c.tag).toBe('DERIVED');
    expect(c.source.priceId).toBe(WORKDAY_ROW_ID);
  });

  it('says a day is arithmetic on this page, because BLS never publishes a daily figure', () => {
    expect(priceWorkdays(3).method).toContain('never daily');
  });

  it('one day reads as one day', () => {
    const c = priceWorkdays(1);
    expect(c.valueUsd).toBe(250.2);
    expect(c.arithmetic).toBe('$1,251 a week ÷ 5 = $250.20 a day × 1 day = $250.20');
    expect(c.unit).toBe('day');
  });

  it('nothing entered means no figure and no arithmetic — never a default', () => {
    const c = priceWorkdays(0);
    expect(c.valueUsd).toBeNull();
    expect(c.arithmetic).toBeNull();
  });

  it('offers the other published bases for the same count, each with its own arithmetic', () => {
    const c = priceWorkdays(10);
    const women = c.alternatives.find((a) => a.id === 'women');
    expect(women?.valueUsd).toBe(2262);
    expect(women?.arithmetic).toBe('$1,131 ÷ 5 × 10 = $2,262.00');
    expect(c.alternatives.some((a) => a.id === 'own')).toBe(false);
  });

  it('the published bases are the ones on the BLS row', () => {
    const p = payBases(null);
    expect(p.map((o) => o.weeklyUsd)).toEqual([1251, 1380, 1131, null]);
  });

  it("a person's own pay is never attributed to BLS", () => {
    const c = priceWorkdays(5, 'own', 2000);
    expect(c.valueUsd).toBe(2000);
    expect(c.source.priceId).toBeNull();
    expect(c.source.url).toBeNull();
    expect(c.method).toContain('No federal figure is involved');
    expect(c.alternatives).toHaveLength(0);
  });

  it('own pay with no figure entered stays blank rather than falling back to the median', () => {
    const c = priceWorkdays(5, 'own', null);
    expect(c.valueUsd).toBeNull();
    expect(c.noFigureReason).toBeTruthy();
  });

  it('names who the figure leaves out — the people who stopped working', () => {
    expect(priceWorkdays(1).limit).toContain('stopped working');
    expect(priceWorkdays(1).source.describes).toContain('self-employed');
  });
});

describe('unpaid caring — a published wage × the hours, with the method chosen, never assumed', () => {
  it('prices forty hours of custodial help to the cent', () => {
    const c = priceCareHours(40);
    expect(c.valueUsd).toBe(688.4);
    expect(c.arithmetic).toBe('$17.21 an hour × 40 hours = $688.40 · custodial help');
    expect(c.source.priceId).toBe(CARE_ROW_ID);
  });

  it('each of the four published rates prices the same hours differently', () => {
    expect(priceCareHours(40, 'nursing-assistant').valueUsd).toBe(812.8);
    expect(priceCareHours(40, 'registered-nurse').valueUsd).toBe(1876);
    expect(priceCareHours(40, 'opportunity-cost').valueUsd).toBe(980.4);
  });

  it('shows the other three as alternatives rather than asserting one point', () => {
    const c = priceCareHours(10);
    expect(c.alternatives.map((a) => a.valueUsd)).toEqual([203.2, 469, 245.1]);
    expect(c.alternatives[0].arithmetic).toBe('$20.32 × 10 = $203.20');
  });

  it('says plainly that BLS has never published the product of the wage and the hours', () => {
    expect(priceCareHours(1).limit).toContain('never published their product');
  });
});

describe('what no federal file prices stays blank', () => {
  it('a trip is counted and never priced', () => {
    const c = countTrips(14);
    expect(c.count).toBe(14);
    expect(c.valueUsd).toBeNull();
    expect(c.tag).toBe('COUNT ONLY');
    expect(c.noFigureReason).toContain('No published federal figure');
    expect(c.alternatives).toHaveLength(0);
  });

  it('a dismissal is counted, and the count is a real category of the public gap report', () => {
    const c = countDismissed(4);
    expect(c.valueUsd).toBeNull();
    expect(CATEGORY_IDS).toContain(DISMISSED_CATEGORY);
    const v = validateGap({ counts: { [DISMISSED_CATEGORY]: 4 } }) as { error?: string; record?: { counts: Record<string, number> } };
    expect(v.error).toBeUndefined();
    expect(v.record?.counts[DISMISSED_CATEGORY]).toBe(4);
  });
});

describe('🔴 the four are never added — to the medical total or to each other', () => {
  it('exports no function that totals them', () => {
    const adders = Object.keys(B).filter((k) => /total|sum|combine|aggregate/i.test(k));
    expect(adders).toEqual([]);
  });

  it('returns four separate cards, each carrying its own source', () => {
    const cards = burdenCards({ ...EMPTY_BURDENS, workdays: 12, careHours: 40, trips: 9, dismissed: 3 });
    expect(cards.map((c) => c.kind)).toEqual(['workdays', 'care-hours', 'trips', 'dismissed']);
    expect(cards.filter((c) => c.valueUsd !== null)).toHaveLength(2);
    expect(new Set(cards.map((c) => c.source.priceId))).toEqual(new Set([WORKDAY_ROW_ID, CARE_ROW_ID, null]));
  });

  it('counts how many were filled in, and counts nothing else', () => {
    expect(burdensEntered(EMPTY_BURDENS)).toBe(0);
    expect(burdensEntered({ ...EMPTY_BURDENS, workdays: 2, trips: 1 })).toBe(2);
  });
});

describe('counts are clamped, and junk never becomes a figure', () => {
  it('a negative or non-finite count is zero', () => {
    expect(priceWorkdays(-5).count).toBe(0);
    expect(priceWorkdays(Number.NaN).count).toBe(0);
    expect(priceCareHours(Number.POSITIVE_INFINITY).count).toBe(0);
  });

  it('a fractional count floors, and an absurd count is capped', () => {
    expect(priceWorkdays(3.9).count).toBe(3);
    expect(priceWorkdays(99999).count).toBe(MAX.workdays);
    expect(countTrips(99999).count).toBe(MAX.trips);
    expect(countDismissed(99999).count).toBe(MAX.dismissed);
  });

  it('normalizes anything a browser hands back, including nothing at all', () => {
    expect(normalizeBurdens(null)).toEqual(EMPTY_BURDENS);
    expect(normalizeBurdens({ workdays: '12', careMethod: 'nonsense', payBasis: 'nonsense' })).toEqual(EMPTY_BURDENS);
    expect(normalizeBurdens({ workdays: 12, careHours: 40.7, trips: -3, dismissed: 2, careMethod: 'registered-nurse', payBasis: 'women', ownWeeklyPayUsd: 1234.567 }))
      .toEqual({ workdays: 12, careHours: 40, trips: 0, dismissed: 2, careMethod: 'registered-nurse', payBasis: 'women', ownWeeklyPayUsd: 1234.57 });
  });

  it('keeps its own storage key, apart from the journey', () => {
    expect(BURDENS_KEY).toBe('waypoint-ledger.burdens.v1');
  });
});

describe('money is printed the way a person reads it', () => {
  it('shows cents where cents are the point', () => {
    expect(money(3002.4)).toBe('$3,002.40');
    expect(money(1251, false)).toBe('$1,251');
  });
});

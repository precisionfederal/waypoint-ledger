/* The public pricing API's pure core. Anyone reusing Waypoint Ledger — an agency, an
   app, a researcher — gets this function's output. The contract it must never break:
   every dollar in the response is a row of the federal table, carried back with the
   year, the basis, the population it describes and the URL it came from. */
import { describe, it, expect } from 'vitest';
import { priceRequest, validateJourney, PRICE_METHOD, MAX_STORY, MAX_ITEMS } from '../lib/price-api';
import { TABLE, SELECTABLE, TABLE_VERSION, checkCombination, bundlingNote } from '../lib/table';
import type { PriceResponse } from '../lib/price-api';

const OPTS = { tableVersion: TABLE_VERSION, checkCombination, bundlingNote };
const ok = (r: ReturnType<typeof priceRequest>): PriceResponse => {
  if ('error' in r) throw new Error(`expected a priced response, got: ${r.error}`);
  return r.result;
};
const err = (r: ReturnType<typeof priceRequest>): string => {
  if (!('error' in r)) throw new Error('expected an error');
  return r.error;
};
const row = (id: string) => TABLE.find((i) => i.id === id)!;

describe('priceRequest — a story', () => {
  const res = ok(priceRequest({ story: 'saw my regular doctor three times, then an echo and a Holter' }, SELECTABLE, OPTS));

  it('returns one segment per event with the count the person gave', () => {
    expect(res.segments.map((s) => s.itemId)).toEqual(['cms-99213', 'cms-img-echo', 'cms-test-holter']);
    expect(res.segments[0].times).toBe(3);
    expect(res.input).toBe('story');
  });

  it('carries the provenance a third party needs on every segment', () => {
    for (const s of res.segments) {
      const r = row(s.itemId);
      expect(s.valueUsd).toBe(r.valueUsd);            // never computed
      expect(s.year).toBe(r.year);
      expect(s.basis).toBe(r.basis);
      expect(s.population).toBe(r.population);
      expect(s.coverage).toBe(r.coverage);            // who it does and does not describe
      expect(s.sourceTitle).toBe(r.sourceTitle);
      expect(s.sourceUrl).toMatch(/^https?:\/\//);
      expect(s.lineTotalUsd).toBeCloseTo((r.valueUsd as number) * s.times, 2);
    }
  });

  it('adds only what it returned as summable, and states the method', () => {
    const expected = res.segments.filter((s) => s.summable).reduce((a, s) => a + s.lineTotalUsd, 0);
    expect(res.totals.totalUsd).toBeCloseTo(expected, 2);
    expect(res.method).toBe(PRICE_METHOD);
    expect(res.method).toMatch(/No model produces a dollar figure/);
    expect(res.tableVersion).toBe(TABLE_VERSION);
  });

  it('returns a phrase it cannot map as unpriced, with a reason, rather than guessing', () => {
    const r = ok(priceRequest({ story: 'my landlord would not fix the mold' }, SELECTABLE, OPTS));
    expect(r.segments).toEqual([]);
    expect(r.unpriced).toHaveLength(1);
    expect(r.unpriced[0].raw).toBe('my landlord would not fix the mold');
    expect(r.unpriced[0].kind).toBe('no-match');
    expect(r.unpriced[0].reason).toMatch(/no figure|unpriced/i);
    expect(r.totals.totalUsd).toBe(0);
  });

  it('cannot mix measures inside an itemized total, by construction', () => {
    /* Every row the table marks summable is an allowed amount; the MEPS payment,
       out-of-pocket and BLS wage rows are all non-summable and are reported beside
       the total, never inside it. So the itemized total is single-basis and the
       mixed-basis warning cannot fire through this API. (basisWarning's own logic
       is exercised in pricing.test.ts.) */
    const r = ok(priceRequest({ items: [{ itemId: 'cms-99213' }, { itemId: 'meps2018-retail-rx-out-of-pocket' }] }, TABLE, OPTS));
    expect(r.totals.basesUsed).toEqual(['allowed']);
    expect(r.basisWarning).toBeNull();
    expect(r.excludedFromTotal.map((e) => e.itemId)).toEqual(['meps2018-retail-rx-out-of-pocket']);
    for (const s of TABLE.filter((i) => SELECTABLE.some((x) => x.id === i.id))) expect(s.basis).toBe('allowed');
  });
});

describe('priceRequest — an explicit list of units', () => {
  it('prices by id and multiplies by times', () => {
    const r = ok(priceRequest({ items: [{ itemId: 'cms-99214', times: 4 }] }, SELECTABLE, OPTS));
    expect(r.input).toBe('items');
    expect(r.segments[0].lineTotalUsd).toBeCloseTo((row('cms-99214').valueUsd as number) * 4, 2);
  });

  it('keeps a whole-year figure out of the itemized total and says why', () => {
    const r = ok(priceRequest({ items: [{ itemId: 'meps2022-longcovid-excess-total' }, { itemId: 'cms-99214' }] }, TABLE, OPTS));
    const year = r.segments.find((s) => s.itemId === 'meps2022-longcovid-excess-total')!;
    expect(year.valueUsd).toBe(row('meps2022-longcovid-excess-total').valueUsd);  // still returned in full
    expect(year.summable).toBe(false);
    expect(r.totals.totalUsd).toBeCloseTo(row('cms-99214').valueUsd as number, 2); // and out of the sum
    expect(r.excludedFromTotal.map((e) => e.itemId)).toEqual(['meps2022-longcovid-excess-total']);
    expect(r.conflicts.length).toBeGreaterThan(0);
  });

  it('returns a row that has no published figure as unpriced', () => {
    const r = ok(priceRequest({ items: [{ itemId: 'hcup2021-ed-cost-to-charge-ratio' }] }, TABLE, OPTS));
    expect(r.segments).toEqual([]);
    expect(r.unpriced[0].reason).toMatch(/no published figure/);
  });

  it('maps a raw phrase sent without an id', () => {
    const r = ok(priceRequest({ items: [{ raw: 'echocardiogram', times: 2 }] }, SELECTABLE, OPTS));
    expect(r.segments[0].itemId).toBe('cms-img-echo');
    expect(r.segments[0].times).toBe(2);
  });
});

describe('priceRequest — refuses a bad request in words the caller can act on', () => {
  it('a body that is not an object', () => {
    expect(err(priceRequest(null, SELECTABLE, OPTS))).toMatch(/JSON object/);
    expect(err(priceRequest([{ itemId: 'cms-99214' }], SELECTABLE, OPTS))).toMatch(/JSON object/);
  });
  it('neither a story nor items', () => {
    expect(err(priceRequest({}, SELECTABLE, OPTS))).toMatch(/story|items/);
  });
  it('both at once', () => {
    expect(err(priceRequest({ story: 'a', items: [] }, SELECTABLE, OPTS))).toMatch(/not both/);
  });
  it('an empty or oversized story', () => {
    expect(err(priceRequest({ story: '   ' }, SELECTABLE, OPTS))).toMatch(/empty/);
    expect(err(priceRequest({ story: 'x'.repeat(MAX_STORY + 1) }, SELECTABLE, OPTS))).toMatch(String(MAX_STORY));
  });
  it('too many items, or none', () => {
    expect(err(priceRequest({ items: [] }, SELECTABLE, OPTS))).toMatch(/at least one/);
    expect(err(priceRequest({ items: Array.from({ length: MAX_ITEMS + 1 }, () => ({ itemId: 'cms-99214' })) }, SELECTABLE, OPTS))).toMatch(String(MAX_ITEMS));
  });
  it('a unit of care that is not in the table — and points at where the ids are', () => {
    expect(err(priceRequest({ items: [{ itemId: 'not-a-row' }] }, SELECTABLE, OPTS))).toMatch(/GET \/api\/table/);
  });
  it('an implausible count', () => {
    expect(err(priceRequest({ items: [{ itemId: 'cms-99214', times: 0 }] }, SELECTABLE, OPTS))).toMatch(/1 to 365/);
    expect(err(priceRequest({ items: [{ itemId: 'cms-99214', times: 2.5 }] }, SELECTABLE, OPTS))).toMatch(/1 to 365/);
    expect(err(priceRequest({ items: [{ itemId: 'cms-99214', times: 900 }] }, SELECTABLE, OPTS))).toMatch(/1 to 365/);
  });
  it('an item that is neither an id nor words', () => {
    expect(err(priceRequest({ items: [{}] }, SELECTABLE, OPTS))).toMatch(/itemId/);
    expect(err(priceRequest({ items: ['echo'] }, SELECTABLE, OPTS))).toMatch(/must be an object/);
  });
});

describe('validateJourney — what may be saved and shared', () => {
  it('accepts a real journey and keeps the words the person typed', () => {
    const v = validateJourney({ entries: [{ raw: 'saw my doctor', itemId: 'cms-99213', times: 3 }], title: 'Nineteen months' }, SELECTABLE);
    if ('error' in v) throw new Error(v.error);
    expect(v.entries).toEqual([{ raw: 'saw my doctor', itemId: 'cms-99213', times: 3 }]);
    expect(v.title).toBe('Nineteen months');
  });
  it('accepts an unpriced line, because a named step with no figure is still part of the story', () => {
    const v = validateJourney({ entries: [{ raw: 'three nights in the hospital', itemId: null, times: 1 }] }, SELECTABLE);
    expect('error' in v).toBe(false);
  });
  it('refuses an unknown unit, an empty journey, a bad count and a bad shape', () => {
    const e = (b: unknown) => { const r = validateJourney(b, SELECTABLE); return 'error' in r ? r.error : ''; };
    expect(e({ entries: [{ itemId: 'nope', times: 1 }] })).toMatch(/No such unit of care/);
    expect(e({ entries: [] })).toMatch(/at least one line/);
    expect(e({})).toMatch(/entries/);
    expect(e({ entries: [{ itemId: 'cms-99213', times: 0 }] })).toMatch(/1 to 99/);
    expect(e({ entries: [{ itemId: 'cms-99213', times: 100 }] })).toMatch(/1 to 99/);
    expect(e({ entries: [{ times: 1 }] })).toMatch(/itemId or the words/);
    expect(e({ entries: Array.from({ length: MAX_ITEMS + 1 }, () => ({ itemId: 'cms-99213', times: 1 })) })).toMatch(String(MAX_ITEMS));
  });
});

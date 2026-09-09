/* ==========================================================================
   THE REUSE SURFACE MUST EQUAL THE PRODUCT.

   The site asks who you are and where you live before it shows you a figure.
   Until this round the API did not: it took a `state`, ignored it, and returned
   the national Medicare amount with no warning. An agency that took us at our
   word on /developers got a narrower product than the one we demonstrate.

   These tests hold the two together. They assert that POST /api/price returns
   the SAME figure, the SAME verdict and the SAME labels the browser renders,
   from the same module (lib/fit.ts), and that an unknown coverage, state or
   locality is an error with a sentence rather than a silent national figure.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { priceRequest, resolveContext, localityRangeFor, COVERAGE_KEYS } from '../lib/price-api';
import type { PriceResponse } from '../lib/price-api';
import { TABLE, SELECTABLE, TABLE_VERSION, checkCombination, bundlingNote } from '../lib/table';
import { LOCALITIES, fitOf, localityFigure, totalLabels } from '../lib/fit';

const OPTS = { tableVersion: TABLE_VERSION, checkCombination, bundlingNote };
const STORY = 'saw my regular doctor three times, then an echocardiogram';

const ok = (r: ReturnType<typeof priceRequest>): PriceResponse => {
  if ('error' in r) throw new Error(`expected a priced response, got: ${r.error}`);
  return r.result;
};
const err = (r: ReturnType<typeof priceRequest>): string => {
  if (!('error' in r)) throw new Error('expected an error, got a priced response');
  return r.error;
};
const price = (body: Record<string, unknown>) => priceRequest(body, SELECTABLE, OPTS);
const row = (id: string) => TABLE.find((i) => i.id === id)!;

describe('resolveContext — who is asking', () => {
  it('takes a locality key and returns the CMS indices that price it', () => {
    const r = resolveContext({ locality: 'IA-00' });
    if ('error' in r) throw new Error(r.error);
    expect(r.context.locality?.key).toBe('IA-00');
    expect(r.context.locality?.stateName).toBe('Iowa');
    expect(r.context.locality?.mac).toBe('05102');
    expect(r.context.localityFrom).toBe('locality');
    expect(r.context.figureBasis).toContain('CY2026');
  });

  it('accepts a state when CMS prices it as one locality, and says so', () => {
    const r = resolveContext({ state: 'ia' });
    if ('error' in r) throw new Error(r.error);
    expect(r.context.locality?.key).toBe('IA-00');
    expect(r.context.localityFrom).toBe('state');
  });

  it('refuses a state with several localities and names every one of them', () => {
    const r = resolveContext({ state: 'TX' });
    if (!('error' in r)) throw new Error('expected an error');
    expect(r.error).toContain('more than one CMS payment locality');
    expect(r.error).toContain('TX-18');
    expect(r.error).toContain('Houston');
  });

  it('refuses an unknown coverage, state or locality rather than defaulting', () => {
    expect(resolveContext({ coverage: 'platinum' })).toHaveProperty('error');
    expect(resolveContext({ state: 'ZZ' })).toHaveProperty('error');
    expect(resolveContext({ locality: 'IA-99' })).toHaveProperty('error');
  });

  it('refuses a state and a locality that name different places', () => {
    const r = resolveContext({ state: 'CA', locality: 'IA-00' });
    if (!('error' in r)) throw new Error('expected an error');
    expect(r.error).toContain('different places');
  });

  it('with nothing said, says plainly that the figures are national', () => {
    const r = resolveContext({});
    if ('error' in r) throw new Error(r.error);
    expect(r.context.coverage).toBeNull();
    expect(r.context.locality).toBeNull();
    expect(r.context.figureBasis).toContain('national');
  });

  it('every coverage the site offers is a coverage the API accepts', () => {
    for (const c of COVERAGE_KEYS) expect(resolveContext({ coverage: c })).not.toHaveProperty('error');
    expect(COVERAGE_KEYS).toContain('medicaid');
  });
});

describe('POST /api/price — the figure fitted to the caller', () => {
  it('returns the locality amount, not the national one, when a state is given', () => {
    const res = ok(price({ story: STORY, coverage: 'medicare', state: 'IA' }));
    const s = res.segments[0];
    expect(s.localityName).toBe('Iowa');
    expect(s.localityUsd).toBe(localityFigure('cms-99213', 'IA-00'));
    expect(s.nationalUsd).toBe(row('cms-99213').valueUsd);
    expect(s.localityUsd).not.toBe(s.nationalUsd);
    expect(s.fit.figureUsd).toBe(s.localityUsd);
    expect(s.fit.which).toBe('locality');
    expect(s.fit.verdict).toBe('DESCRIBES YOU');
  });

  it('gives the same verdict, figure and note the browser renders, from the same module', () => {
    for (const coverage of COVERAGE_KEYS) {
      const res = ok(price({ story: STORY, coverage, locality: 'TX-18' }));
      for (const s of res.segments) {
        const expected = fitOf(row(s.itemId), { coverage, locality: 'TX-18' });
        expect(s.fit.verdict).toBe(expected.verdict);
        expect(s.fit.figureUsd).toBe(expected.figureUsd);
        expect(s.fit.figureNote).toBe(expected.figureNote);
        expect(s.fit.why).toBe(expected.why);
        expect(s.fit.offerGap).toBe(expected.offerGap);
      }
      expect(res.fitted.labels).toEqual(totalLabels({ coverage, locality: 'TX-18' }));
    }
  });

  it('multiplies the fitted figure by the count, and nothing else', () => {
    const res = ok(price({ story: STORY, coverage: 'uninsured' }));
    const s = res.segments[0];
    expect(s.times).toBe(3);
    expect(s.fit.lineTotalUsd).toBeCloseTo((s.fit.figureUsd as number) * 3, 2);
  });

  it('🔴 reports NO total — null, never 0 — when nothing published describes the caller', () => {
    const res = ok(price({ story: STORY, coverage: 'medicaid', locality: 'TX-18' }));
    expect(res.fitted.totalUsd).toBeNull();
    expect(res.fitted.describedCount).toBe(0);
    expect(res.fitted.notDescribedCount).toBe(res.segments.length);
    expect(res.fitted.suppressedReason).toContain('not a cost of zero');
    for (const s of res.segments) {
      expect(s.fit.verdict).toBe('NOT DESCRIBED');
      expect(s.fit.figureUsd).toBeNull();
      expect(s.fit.lineTotalUsd).toBeNull();
      expect(s.fit.offerGap).toBe(true);
    }
  });

  it('does not call a non-summable row a gap — the figure exists, it just may not be added', () => {
    const res = ok(priceRequest(
      { items: [{ itemId: 'meps2022-longcovid-excess-total' }], coverage: 'employer' },
      TABLE, OPTS,
    ));
    expect(res.segments[0].summable).toBe(false);
    expect(res.segments[0].fit.figureUsd).not.toBeNull();
    expect(res.fitted.totalUsd).toBe(0);              // nothing may enter the total
    expect(res.fitted.suppressedReason).toBeNull();   // but it is not a gap
    expect(res.fitted.describedCount).toBe(1);
    expect(res.excludedFromTotal.length).toBe(1);
  });

  it('totals the charge figures for an uninsured caller and says which kind fed the total', () => {
    const res = ok(price({ story: STORY, coverage: 'uninsured', state: 'IA' }));
    expect(res.fitted.figureKindsUsed).toEqual(['charge']);
    expect(res.fitted.basisWarning).toBeNull();
    const expected = res.segments
      .filter((s) => s.summable && s.fit.lineTotalUsd !== null)
      .reduce((a, s) => a + (s.fit.lineTotalUsd as number), 0);
    expect(res.fitted.totalUsd).toBeCloseTo(expected, 2);
    // the charge total is a different measure from the allowed-amount total, and larger
    expect(res.fitted.totalUsd as number).toBeGreaterThan(res.totals.totalUsd);
  });

  it('never lets the national total change because a locality was named', () => {
    const national = ok(price({ story: STORY })).totals.totalUsd;
    const iowa = ok(price({ story: STORY, state: 'IA', coverage: 'medicare' })).totals.totalUsd;
    expect(iowa).toBe(national);   // `totals` is the published national basis, always
  });

  it('counts one verdict row per verdict present, and no empty ones', () => {
    const res = ok(price({ story: STORY, coverage: 'medicare', state: 'IA' }));
    expect(res.fitted.verdicts).toEqual([{ verdict: 'DESCRIBES YOU', lines: 2 }]);
  });

  it('echoes the context back so a response is never ambiguous about its basis', () => {
    const res = ok(price({ story: STORY, coverage: 'employer', locality: 'CA-65' }));
    expect(res.context.coverage).toBe('employer');
    expect(res.context.locality?.key).toBe('CA-65');
    expect(res.context.figureBasis).toContain('CMS locality CA-65');
    expect(res.segments.every((s) => s.fit.verdict === 'REFERENCE PRICE')).toBe(true);
  });

  it('applies the context to an explicit item list too, not only to a story', () => {
    const res = ok(price({ items: [{ itemId: 'cms-99213', times: 2 }], coverage: 'medicare', state: 'IA' }));
    expect(res.segments[0].fit.figureUsd).toBe(localityFigure('cms-99213', 'IA-00'));
    expect(res.segments[0].fit.lineTotalUsd).toBeCloseTo((localityFigure('cms-99213', 'IA-00') as number) * 2, 2);
  });

  it('refuses the whole request when the context is wrong — it never prices half of it', () => {
    expect(err(price({ story: STORY, state: 'TX' }))).toContain('more than one CMS payment locality');
    expect(err(price({ story: STORY, coverage: 'gold' }))).toContain('coverage must be one of');
    expect(err(price({ story: STORY, locality: 'nowhere' }))).toContain('No CMS locality');
  });
});

describe('localityRangeFor — what a service costs across the country', () => {
  it('spans every locality CMS publishes for the code, low and high named', () => {
    const r = localityRangeFor(row('cms-99213'))!;
    expect(r.localityCount).toBe(LOCALITIES.length);
    expect(r.lowUsd).toBeLessThan(r.nationalUsd);
    expect(r.highUsd).toBeGreaterThan(r.nationalUsd);
    expect(r.lowLocalityName.length).toBeGreaterThan(0);
    expect(r.highLocalityName.length).toBeGreaterThan(0);
    expect(r.formula).toContain('33.4009');
  });

  it('agrees to the cent with the built locality table at both ends', () => {
    const r = localityRangeFor(row('cms-img-echo'))!;
    expect(localityFigure('cms-img-echo', r.lowLocalityKey)).toBe(r.lowUsd);
    expect(localityFigure('cms-img-echo', r.highLocalityKey)).toBe(r.highUsd);
    for (const l of LOCALITIES) {
      const v = localityFigure('cms-img-echo', l.key);
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(r.lowUsd);
      expect(v).toBeLessThanOrEqual(r.highUsd);
    }
  });

  it('is null for a row CMS does not price by locality — never an invented spread', () => {
    const lab = TABLE.find((i) => i.id.startsWith('cms-lab-'));
    if (lab) expect(localityRangeFor(lab)).toBeNull();
  });

  it('is on every priced segment of a response', () => {
    const res = ok(price({ story: STORY, coverage: 'medicare', state: 'IA' }));
    for (const s of res.segments) {
      expect(s.localityRange).not.toBeNull();
      expect(s.localityRange!.nationalUsd).toBe(s.nationalUsd);
    }
  });
});

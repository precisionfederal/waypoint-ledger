/* ==========================================================================
   WHO CARRIES THIS COST (FINAL-1011 whopays). The NIH federal lead at the Beta
   asked every team for the health system's share, the person's share and the
   invisible, and for the dollar year on every number. These tests hold the
   split to the published 2026 Part B rules and hold every label on its face.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { TABLE, SELECTABLE, rulesFor } from '../lib/table';
import { priceJourney } from '../lib/pricing';
import { fitOf, type Ctx } from '../lib/fit';
import { scheduleOf } from '../lib/policy';
import { privateRangeFor, medicareMarkerApplies } from '../lib/private-rates';
import { EMPTY_BURDENS } from '../lib/burdens';
import {
  PART_B, CHARGE_YEAR, invisibleCounts, lineYearNote, medicareSplit, partBRuleOf, partBScheduleOf,
  privateSpan, totalDollarYear, whoPays,
} from '../lib/whopays';
import WhoPays from '../components/WhoPays';
import Ledger from '../components/Ledger';
import { exampleEntries } from '../components/sheet/example';
import { fakeStore, renderWith } from './helpers/ledger-render';
import type { JourneyEntry, PriceItem } from '../lib/types';

const pick = (id: string): PriceItem => { const t = TABLE.find((x) => x.id === id); if (!t) throw new Error(id); return t; };
let k = 0;
const line = (id: string, times = 1): JourneyEntry => ({ key: `t${++k}`, raw: id, item: pick(id), times });
const c2 = (n: number) => Math.round(n * 100) / 100;

describe('the 2026 Part B rule is read from the cited row, never typed', () => {
  it('deductible $283 and coinsurance 20% come from cms2026-part-b-deductible, whose CMS sentence the audit read', () => {
    expect(PART_B.deductibleUsd).toBe(283);
    expect(PART_B.coinsuranceRate).toBe(0.2);
    expect(PART_B.year).toBe('2026');
    const audit = JSON.parse(readFileSync('data/AUDIT.json', 'utf8'));
    const rows = audit.results as { id: string; evidence: string; source_key: string }[];
    const row = rows.find((r) => r.id === 'cms2026-part-b-deductible')!;
    expect(row.source_key).toBe('partb');
    expect(row.evidence).toContain('$283 in 2026');
    expect(PART_B.deductibleSource.quote).toContain(row.evidence.replace(/^annual/, ''));
  });

  it('the Part B schedule test agrees with lib/policy scheduleOf on every row of the table', () => {
    for (const it of TABLE) {
      const s = scheduleOf(it.sourceTitle);
      const mine = partBScheduleOf(it);
      expect(mine, it.id).toBe(s === 'cms-pfs' || s === 'cms-opps' || s === 'cms-clfs' ? s : null);
    }
  });

  it('20% on a hospital outpatient line equals the copayment CMS publishes for it in Addendum B, to the cent', () => {
    for (const [id, half] of [['cms-ed-99284-complete', 'hospital_facility_fee_usd'], ['cms-g0463-hospital-clinic-fee', null]] as const) {
      const a = rulesFor(id).alternates as Record<string, number>;
      const fee = half ? a[half] : pick(id).valueUsd!;
      expect(Math.abs(0.2 * fee - a.hospital_outpatient_minimum_beneficiary_copay_usd)).toBeLessThanOrEqual(0.01);
      expect(partBRuleOf(pick(id))).toBe('deductible-and-20');
    }
  });
});

describe('the split', () => {
  it('applies the deductible once across lines, never per line', () => {
    const s = medicareSplit([line('cms-99213', 6), line('cms-99204'), line('cms-img-echo')])!;
    const sum = c2(95.19 * 6 + 177.36 + 196.73);
    expect(s.approvedUsd).toBe(sum);
    expect(s.deductibleAppliedUsd).toBe(283);
    expect(s.coinsuranceUsd).toBe(c2(0.2 * (sum - 283)));
    expect(s.personUsd).toBe(c2(283 + c2(0.2 * (sum - 283))));
    expect(c2(s.programUsd + s.personUsd)).toBe(s.approvedUsd);
  });

  it('a total under the deductible is all the person\'s share, and no coinsurance', () => {
    const s = medicareSplit([line('cms-99212')])!;
    expect(s.deductibleAppliedUsd).toBe(59.45);
    expect(s.coinsuranceUsd).toBe(0);
    expect(s.personUsd).toBe(59.45);
    expect(s.programUsd).toBe(0);
  });

  it('20% only where the rule says so: lab tests and yearly screenings carry no share and no deductible', () => {
    expect(partBRuleOf(pick('cms-lab-cbc'))).toBe('no-share-lab');
    expect(partBRuleOf(pick('cms-g0444'))).toBe('no-share-preventive');
    expect(partBRuleOf(pick('cms-g0442'))).toBe('no-share-preventive');
    const labs = medicareSplit([line('cms-lab-cbc', 6), line('cms-g0444')])!;
    expect(labs.personUsd).toBe(0);
    expect(labs.deductibleAppliedUsd).toBe(0);
    expect(labs.programUsd).toBe(labs.approvedUsd);
    /* adding a lab line to a visit changes the program's share, never the person's */
    const visit = medicareSplit([line('cms-99214')])!;
    const both = medicareSplit([line('cms-99214'), line('cms-lab-cbc', 6)])!;
    expect(both.personUsd).toBe(visit.personUsd);
    expect(both.programUsd).toBe(c2(visit.programUsd + c2(7.77 * 6)));
  });

  it('every selectable row gets a rule, and every clinical lab row is $0', () => {
    for (const it of SELECTABLE) {
      const r = partBRuleOf(it);
      expect(r, it.id).not.toBeNull();
      if (partBScheduleOf(it) === 'cms-clfs') expect(r).toBe('no-share-lab');
    }
  });

  it('a once-a-year code is priced once, as on the ledger', () => {
    const s = medicareSplit([line('cms-g0444', 6)])!;
    expect(s.lines[0].times).toBe(1);
  });

  it('never sums across bases: a survey-spending or wage line is listed on its own basis, outside the split', () => {
    const meps = TABLE.find((i) => i.basis === 'total_expenditure' && /MEPS/.test(i.sourceTitle))!;
    const wage = TABLE.find((i) => i.basis === 'wage')!;
    expect(partBRuleOf(meps)).toBeNull();
    expect(partBRuleOf(wage)).toBeNull();
    const entries = [line('cms-99214'), { key: 'm1', raw: 'meps', item: meps, times: 1 }, { key: 'w1', raw: 'wage', item: wage, times: 1 }];
    const w = whoPays(priceJourney(entries));
    expect(w.medicare!.approvedUsd).toBe(135.61);
    expect(w.other.map((o) => o.key)).toEqual(['m1', 'w1']);
    expect(w.other[0].year).toBe(meps.year);
  });

  it('the private range is never added: low with low, high with high, only over lines that carry one', () => {
    const entries = exampleEntries();
    const p = privateSpan(entries)!;
    let lo = 0, hi = 0, n = 0;
    for (const e of entries) {
      const r = privateRangeFor(e.item!)?.shown.find((s) => medicareMarkerApplies(e.item!, s.group));
      if (!r) continue;
      lo += r.spread.low * e.times; hi += r.spread.high * e.times; n++;
    }
    expect(p.lowUsd).toBe(c2(lo));
    expect(p.highUsd).toBe(c2(hi));
    expect(p.lines).toBe(n);
    expect(p.lines + p.without).toBe(entries.filter((e) => e.item).length);
    /* the whole ER encounter is two fees, so neither range alone is its counterpart */
    expect(p.without).toBe(1);
    const w = whoPays(priceJourney(entries));
    expect(c2(w.medicare!.programUsd + w.medicare!.personUsd)).toBe(w.medicare!.approvedUsd);
  });

  it('the example ledger, worked by hand', () => {
    const w = whoPays(priceJourney(exampleEntries()))!;
    const m = w.medicare!;
    expect(m.approvedUsd).toBe(2692.51);
    expect(m.noShareUsd).toBe(46.62); // complete blood count, 6 x $7.77
    expect(m.subjectUsd).toBe(2645.89);
    expect(m.deductibleAppliedUsd).toBe(283);
    expect(m.coinsuranceUsd).toBe(472.58); // 0.2 x 2,362.89 = 472.578
    expect(m.personUsd).toBe(755.58);
    expect(m.programUsd).toBe(1936.93);
  });
});

describe('the invisible, as counts', () => {
  it('counts care gone without from the counter when used, from the words otherwise, never both', () => {
    const cats: [string, { lines: number; times: number }][] = [['care-not-sought', { lines: 1, times: 2 }], ['no-federal-figure', { lines: 1, times: 1 }]];
    const base = { months: 30, wordCats: cats, named: ['lost-work'], dismissed: 3, trips: 0 };
    const fromWords = invisibleCounts({ ...base, forgone: null });
    expect(fromWords.find((c) => c.id === 'care-gone-without')!.count).toBe(2);
    const fromCounter = invisibleCounts({ ...base, forgone: { 'care-not-sought': 4, 'care-denied': 1 } });
    expect(fromCounter.find((c) => c.id === 'care-gone-without')!.count).toBe(5);
    expect(fromCounter.find((c) => c.id === 'dismissed')!.count).toBe(3);
    expect(fromCounter.find((c) => c.id === 'time-searching')!.unit).toBe('months');
    expect(fromCounter.find((c) => c.id === 'no-figure')!.count).toBe(2);
  });
});

describe('labels on the face', () => {
  const lines = priceJourney(exampleEntries());
  const gaps = { cats: [] as [string, { lines: number; times: number }][], months: 0, named: [] as string[] };
  const html = (ctx: Ctx) => renderToStaticMarkup(createElement(WhoPays, { lines, ctx, gaps, burdens: { ...EMPTY_BURDENS, dismissed: 2 } }));

  it('names who carries it, the basis and the dollar year, and states the assumption', () => {
    const h = html({ coverage: 'medicare' });
    expect(h).toContain('Who carries this cost');
    expect(h).toContain('The Medicare program pays');
    expect(h).toContain('Your share if you had Original Medicare (Part B) and had not met the 2026 deductible');
    expect(h).toContain('2026 Medicare rules');
    expect(h).toContain('$1,936.93');
    expect(h).toContain('$755.58');
    expect(h).toMatch(/Hospital files read \d{1,2} [A-Z][a-z]{2} 2026/);
    expect(h).toContain('never added to the Medicare figures');
    expect(h).toContain('On nobody’s bill');
    expect(h).toContain('Times you were told it was nothing');
    expect(h).toContain('accepts the Medicare-approved amount as full payment');
    expect(h).not.toContain('whopays-reference');
    for (const banned of [/your bill/i, /what you paid/i, /\bexcess\b/i]) expect(h).not.toMatch(banned);
  });

  it('a person who chose another coverage is told the split is a Medicare reference', () => {
    const h = html({ coverage: 'employer' });
    expect(h).toContain('You chose <b>Employer</b>. The Medicare split below is a reference for someone with Original Medicare, not what your plan pays.');
    expect(html({})).toContain('Shown as a reference for someone with Original Medicare');
  });

  it('on a phone it folds to the heading and one line that still carries the year', () => {
    const h = renderToStaticMarkup(createElement(WhoPays, { lines, ctx: {}, gaps, burdens: EMPTY_BURDENS, compact: true }));
    expect(h).toMatch(/<details[^>]*data-testid="who-pays"/);
    expect(h).toContain('your share $756 with Original Medicare · 2026 Medicare rules');
  });
});

describe('the dollar year on the total and on every non-2026 figure', () => {
  const entries = exampleEntries();
  const fitsFor = (ctx: Ctx) => new Map(entries.filter((e) => e.item).map((e) => [e.key, fitOf(e.item!, ctx)]));

  it('the Medicare total says "2026 Medicare dollars" and the interval', () => {
    const fits = fitsFor({});
    const lines = priceJourney(entries, (e) => fits.get(e.key)?.figureUsd ?? null);
    expect(totalDollarYear(lines, fits)).toBe("Every visit and test priced at Medicare's 2026 rate, even if it happened years ago");
  });

  it('the uninsured charge stack says 2024 dollars, and each charge figure carries its year', () => {
    const fits = fitsFor({ coverage: 'uninsured' });
    const lines = priceJourney(entries, (e) => fits.get(e.key)?.figureUsd ?? null);
    expect(totalDollarYear(lines, fits)).toBe(`${CHARGE_YEAR} dollars: average billed charges on ${CHARGE_YEAR} Medicare claims, not adjusted to 2026`);
    const charged = entries.find((e) => fits.get(e.key)?.which === 'charge')!;
    expect(lineYearNote(charged.item!, fits.get(charged.key))).toBe('2024 dollars');
    expect(fits.get(charged.key)!.figureNote).toContain('CY2024');
    expect(lineYearNote(pick('cms-99213'), fitOf(pick('cms-99213'), {}))).toBeNull();
  });

  it('mixed years are listed, never blended into one year', () => {
    const fits = new Map<string, { which: 'schedule' | 'charge' }>([['a', { which: 'charge' }], ['b', { which: 'schedule' }]]);
    const a = { key: 'a', raw: 'a', item: pick('cms-99213'), times: 1 }, b = { key: 'b', raw: 'b', item: pick('cms-99214'), times: 1 };
    expect(totalDollarYear(priceJourney([a, b]), fits)).toBe('Dollar years: 2026 (1 line), 2024 (1 line). None is adjusted for inflation');
  });

  it('the ledger prints the dollar year under the total and mounts the panel under the total', () => {
    const h = renderWith(Ledger, fakeStore(entries));
    expect(h).toContain("Every visit and test priced at Medicare&#x27;s 2026 rate, even if it happened years ago");
    expect(h).toContain('Who carries this cost');
    expect(h.indexOf('Who carries this cost')).toBeGreaterThan(h.indexOf('Every visit and test priced at Medicare'));
    const u = renderWith(Ledger, fakeStore(entries, { ctx: { coverage: 'uninsured' } }));
    expect(u).toContain('2024 dollars: average billed charges');
    expect(u).toMatch(/core-year"> 2024 dollars/);
  });
});

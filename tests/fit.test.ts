/* ==========================================================================
   THE FIT LAYER — the tests that make it safe to say "this describes you".

   Two things are proved here:
   1. THE ARITHMETIC IS THE GOVERNMENT'S. Every one of the published locality
      figures the product can show reproduces, to the cent, from the RVUs and
      GPCIs CMS published and the conversion factor CMS published.
   2. THE FIT LAYER NEVER INVENTS A FIGURE. Across every row of the table and
      every coverage a person can choose, the number handed to the interface is
      always one of exactly three published numbers, or null.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import statePrices from '@/data/state-prices.json';
import { TABLE, rulesFor } from '@/lib/table';
import { priceEntry, priceJourney } from '@/lib/pricing';
import {
  CONVERSION_FACTOR, GAP_CATEGORIES, LOCALITIES, LOCALITY_ROW_COUNT, MEDICAID_LINK_COUNT,
  MEDICAID_LINKS_VERIFIED_ON,
  RVU, STATES, STATE_NAME, agencyOf, agencyTally, everyLineUndescribed,
  fitOf, formulaParts, gapCategoryLabel, gapHintOf, localityFigure, localityOf,
  medicaidFeeScheduleFor, medicaidProgramFor, noFigureCopy, scheduleFigureOf, soleLocality,
  submittedChargeOf, totalLabels, type Coverage,
} from '@/lib/fit';
import feeSchedules from '@/data/medicaid-fee-schedules.json';
import type { JourneyEntry, PriceItem } from '@/lib/types';

const SP = statePrices as unknown as { items: Record<string, Record<string, number>> };
const item = (id: string): PriceItem => {
  const it = TABLE.find((t) => t.id === id);
  if (!it) throw new Error(`no such row: ${id}`);
  return it;
};
const entry = (it: PriceItem, times = 1): JourneyEntry => ({ key: it.id, raw: it.label, item: it, times });
const COVERAGES: Coverage[] = ['employer', 'marketplace', 'medicaid', 'medicare', 'uninsured', 'unsure'];

describe('the CMS localities', () => {
  it('carries all 109 published localities, uniquely keyed', () => {
    expect(LOCALITIES.length).toBe(109);
    expect(new Set(LOCALITIES.map((l) => l.key)).size).toBe(109);
  });
  it('names every state, district and territory CMS pays under', () => {
    for (const l of LOCALITIES) expect(STATE_NAME[l.state], `no name for ${l.state}`).toBeTruthy();
    expect(STATES.length).toBe(53);
  });
  it('groups California into its 29 localities and Iowa into one', () => {
    expect(STATES.find((s) => s.code === 'CA')!.localities.length).toBe(29);
    expect(soleLocality('IA')!.key).toBe('IA-00');
    expect(soleLocality('CA')).toBeNull();
  });
  it('title-cases the locality names CMS publishes in capitals', () => {
    expect(localityOf('IA-00')!.displayName).toBe('Iowa');
    expect(localityOf('NY-01')?.displayName ?? localityOf('NY-99')?.displayName).toBeDefined();
  });
});

describe('every locality figure is the CMS formula, recomputed', () => {
  it('reproduces all published locality figures to the cent', () => {
    let checked = 0;
    for (const [id, cells] of Object.entries(SP.items)) {
      const r = RVU[id];
      expect(r, `no RVU components for ${id}`).toBeTruthy();
      for (const loc of LOCALITIES) {
        const published = cells[loc.key];
        if (typeof published !== 'number') continue;
        const mine = Math.round((r.work * loc.pw + r.peNonFacility * loc.pe + r.mp * loc.mp) * CONVERSION_FACTOR * 100) / 100;
        expect(mine, `${id} in ${loc.key}`).toBe(published);
        checked++;
      }
    }
    expect(checked).toBe(LOCALITY_ROW_COUNT * LOCALITIES.length);
  });

  it('reproduces the national figure on the row from the same components', () => {
    for (const [id, r] of Object.entries(RVU)) {
      const national = Math.round((r.work + r.peNonFacility + r.mp) * CONVERSION_FACTOR * 100) / 100;
      expect(national, `${id} national`).toBe(item(id).valueUsd);
    }
  });

  it('shows the three products of the formula, and they sum to the figure', () => {
    const iowa = localityOf('IA-00')!;
    const f = formulaParts('cms-99213', iowa)!;
    expect(f.code).toBe('99213');
    expect(f.parts.map((p) => p.name)).toEqual(['Work', 'Practice expense', 'Malpractice']);
    expect(f.total).toBe(localityFigure('cms-99213', 'IA-00'));
    expect(Math.round(f.parts.reduce((a, p) => a + p.product, 0) * 1e6) / 1e6).toBe(Math.round(f.sum * 1e6) / 1e6);
  });

  it('has no locality figure for the lab fee schedule, which is national by law of the schedule', () => {
    expect(localityFigure('cms-lab-cmp', 'IA-00')).toBeNull();
    expect(item('cms-lab-cmp').geography).toMatch(/no geographic adjustment/i);
  });
});

describe('fitOf answers Phillips: does this figure tie to their circumstances', () => {
  const visit = item('cms-99213');

  it('on Medicare, a Medicare allowed amount describes you', () => {
    const f = fitOf(visit, { coverage: 'medicare' });
    expect(f.verdict).toBe('DESCRIBES YOU');
    expect(f.figureUsd).toBe(visit.valueUsd);
    expect(f.offerGap).toBe(false);
  });

  it('on employer or Marketplace coverage it is a reference price, and says why', () => {
    for (const c of ['employer', 'marketplace'] as Coverage[]) {
      const f = fitOf(visit, { coverage: c });
      expect(f.verdict).toBe('REFERENCE PRICE');
      expect(f.why).toMatch(/no federal file publishes|not published/i);
      expect(f.figureUsd).toBe(visit.valueUsd);
    }
  });

  it('on Medicaid nothing published describes you, and the gap is offered', () => {
    const f = fitOf(visit, { coverage: 'medicaid' });
    expect(f.verdict).toBe('NOT DESCRIBED');
    expect(f.figureUsd).toBeNull();
    expect(f.offerGap).toBe(true);
    expect(f.figureNote).toBe('No published federal figure describes you here');
  });

  it('uninsured, the row switches to the charge it is billed against', () => {
    const f = fitOf(visit, { coverage: 'uninsured' });
    expect(f.verdict).toBe('BILLED AGAINST THIS');
    expect(f.which).toBe('charge');
    expect(f.figureUsd).toBe(submittedChargeOf(visit));
    expect(f.figureUsd).not.toBe(visit.valueUsd);
    expect(f.figureNote).toMatch(/submitted charge, CY2024/i);
  });

  it('uninsured, a row with no published charge says so instead of filling it', () => {
    const bare = TABLE.find((t) => /medicare/i.test(t.population) && submittedChargeOf(t) === null);
    expect(bare, 'the table should still contain a Medicare row with no published charge').toBeTruthy();
    const f = fitOf(bare!, { coverage: 'uninsured' });
    expect(f.verdict).toBe('NOT DESCRIBED');
    expect(f.figureUsd).toBeNull();
    expect(f.offerGap).toBe(true);
    expect(f.figureNote).toBe('No published federal figure describes you here');
  });

  it('with no coverage chosen it claims nothing and asks', () => {
    const f = fitOf(visit, {});
    expect(f.verdict).toBe('REFERENCE PRICE');
    expect(f.why).toMatch(/say what coverage you have/i);
    expect(f.figureNote).toBe('');
  });

  it('a locality switches the figure and names the locality on its face', () => {
    const f = fitOf(visit, { coverage: 'medicare', locality: 'IA-00' });
    expect(f.which).toBe('locality');
    expect(f.figureUsd).toBe(SP.items['cms-99213']['IA-00']);
    expect(f.figureNote).toBe('Medicare allowed amount, Iowa, CY2026 formula');
    expect(f.figureUsd).not.toBe(visit.valueUsd);
  });

  it('a row with no locality figure explains itself with the table’s own geography line', () => {
    const f = fitOf(item('cms-lab-cmp'), { coverage: 'medicare', locality: 'IA-00' });
    expect(f.which).toBe('schedule');
    expect(f.figureUsd).toBe(item('cms-lab-cmp').valueUsd);
    expect(f.figureNote).toBe(item('cms-lab-cmp').geography);
  });

  it('a survey figure describes the population it was drawn from, whatever your coverage', () => {
    const meps = TABLE.find((t) => /civilian noninstitutionalized/i.test(t.population) && !/medicare/i.test(t.population))!;
    for (const c of COVERAGES) expect(fitOf(meps, { coverage: c }).verdict).toBe('DESCRIBES YOU');
  });

  it('🔴 never hands back a figure that is not published somewhere', () => {
    const localities = ['IA-00', 'CA-05', 'NY-01', undefined];
    let seen = 0;
    for (const it of TABLE) {
      for (const coverage of COVERAGES) {
        for (const locality of localities) {
          const f = fitOf(it, { coverage, locality });
          seen++;
          if (f.figureUsd === null) continue;
          const allowed = [it.valueUsd, submittedChargeOf(it), localityFigure(it.id, locality)];
          expect(allowed, `${it.id}/${coverage}/${locality}`).toContain(f.figureUsd);
        }
      }
    }
    expect(seen).toBe(TABLE.length * COVERAGES.length * localities.length);
  });
});

describe('the agency on the face of every row', () => {
  it('names the publisher of every row, and never falls back', () => {
    const known = ['CMS', 'AHRQ MEPS', 'AHRQ HCUP', 'BLS', 'GSA', 'Peer-reviewed analysis of MEPS'];
    for (const it of TABLE) expect(known, `${it.id}: ${it.sourceTitle}`).toContain(agencyOf(it));
  });
  it('does not call a peer-reviewed article a federal agency', () => {
    expect(agencyOf(item('meps2022-longcovid-excess-total'))).toBe('Peer-reviewed analysis of MEPS');
  });
  it('counts the lines per agency for the strip under the total', () => {
    const t = agencyTally([item('cms-99213'), item('cms-99214'), item('hcup2021-ed-facility-cost')]);
    expect(t[0]).toEqual({ agency: 'CMS', lines: 2 });
    expect(t[1]).toEqual({ agency: 'AHRQ HCUP', lines: 1 });
  });
});

describe('the total says what it is', () => {
  it('never calls a stack of Medicare figures "all payers combined"', () => {
    for (const ctx of [{}, { locality: 'IA-00' }, { coverage: 'medicare' as Coverage }]) {
      expect(totalLabels(ctx).primary).toBe(
        ctx.locality ? 'What the published Medicare figures add up to in Iowa' : 'What the published Medicare figures add up to');
      expect(totalLabels(ctx).primary).not.toMatch(/all payers/i);
    }
  });
  it('never labels a Medicare stack as what Medicaid pays', () => {
    const l = totalLabels({ coverage: 'medicaid', locality: 'IA-00' });
    expect(l.primary).toBe('What Medicare would allow for these services in Iowa — a reference, not what Medicaid pays');
    expect(l.primary).not.toMatch(/published Medicare figures add up to/i);
    expect(l.secondary).toBeNull();
  });
  it('leads with the charge stack for an uninsured person and keeps the allowed stack beside it', () => {
    const l = totalLabels({ coverage: 'uninsured', locality: 'IA-00' });
    expect(l.primary).toBe('What providers billed on average for these services');
    expect(l.secondary).toBe('What the published Medicare figures add up to in Iowa');
  });
});

describe('pricing accepts a published figure per line and nothing else', () => {
  const visit = item('cms-99213');
  it('multiplies the row figure when no override is given', () => {
    expect(priceEntry(entry(visit, 3)).totalUsd).toBe(visit.valueUsd! * 3);
  });
  it('multiplies the locality figure when one is handed in', () => {
    const iowa = localityFigure('cms-99213', 'IA-00')!;
    expect(priceEntry(entry(visit, 3), iowa).totalUsd).toBe(iowa * 3);
  });
  it('leaves the line unpriced when nothing published describes the person', () => {
    const l = priceEntry(entry(visit, 3), null);
    expect(l.priced).toBe(false);
    expect(l.totalUsd).toBeNull();
  });
  it('prices a whole journey through the fit layer', () => {
    const es = [entry(visit, 2), entry(item('cms-lab-cmp'), 4)];
    const lines = priceJourney(es, (e) => (e.item ? fitOf(e.item, { coverage: 'medicare', locality: 'IA-00' }).figureUsd : undefined));
    expect(lines[0].totalUsd).toBe(localityFigure('cms-99213', 'IA-00')! * 2);
    expect(lines[1].totalUsd).toBe(item('cms-lab-cmp').valueUsd! * 4);
  });
  it('scheduleFigureOf falls back to the national rate, never to another person’s figure', () => {
    expect(scheduleFigureOf(visit, { locality: 'IA-00' })).toBe(localityFigure('cms-99213', 'IA-00'));
    expect(scheduleFigureOf(visit, {})).toBe(visit.valueUsd);
    expect(scheduleFigureOf(item('cms-lab-cmp'), { locality: 'IA-00' })).toBe(item('cms-lab-cmp').valueUsd);
  });
  it('the charge it shows an uninsured person is the one carried on the row', () => {
    expect(submittedChargeOf(visit)).toBe(
      (rulesFor('cms-99213').alternates as Record<string, number>)['cy2024_average_submitted_charge_usd']);
  });
});

/* ==========================================================================
   MEDICAID IS NOT A $0 PRODUCT.

   79 million people are on Medicaid, and every Medicare row in this table
   correctly comes back NOT DESCRIBED for them. The old page then summed
   nothing and printed $0, which reads as "your care was free". These tests
   hold the replacement to the same rule as everything else in the product:
   the blank stays a blank, the two figures beside it are published figures
   read off the same row, and the link we send them to was fetched before it
   shipped.
   ========================================================================== */
describe('the Medicaid blank, and what stands beside it', () => {
  const MEDICARE_ROWS = TABLE.filter((t) => /medicare/i.test(t.population) && t.valueUsd !== null);

  it('never prices a Medicare row for a Medicaid enrollee, on any row in the table', () => {
    expect(MEDICARE_ROWS.length).toBeGreaterThan(40);
    for (const it of MEDICARE_ROWS) {
      const f = fitOf(it, { coverage: 'medicaid' });
      expect(f.verdict).toBe('NOT DESCRIBED');
      expect(f.figureUsd).toBeNull();
      expect(f.offerGap).toBe(true);
    }
  });

  it('the reference beside the blank is a PUBLISHED figure, never a computed one', () => {
    for (const it of MEDICARE_ROWS) {
      for (const locality of [undefined, 'IA-00', 'CA-18', 'TX-31']) {
        const ctx = { coverage: 'medicaid' as Coverage, locality };
        const f = fitOf(it, ctx);
        expect(f.reference).not.toBeNull();
        // the floor is exactly what the fee schedule publishes for this place
        expect(f.reference!.floorUsd).toBe(scheduleFigureOf(it, ctx));
        // the ceiling is exactly the charge the row carries, or nothing at all
        expect(f.reference!.ceilingUsd).toBe(submittedChargeOf(it));
        expect(f.reference!.floorLabel).toMatch(/not your rate/i);
        if (f.reference!.ceilingUsd !== null) expect(f.reference!.ceilingLabel).toMatch(/not your rate/i);
      }
    }
  });

  it('a described line carries no reference — the bracket only ever replaces a blank', () => {
    for (const it of MEDICARE_ROWS.slice(0, 12)) {
      expect(fitOf(it, { coverage: 'medicare' }).reference).toBeNull();
      expect(fitOf(it, { coverage: 'employer' }).reference).toBeNull();
    }
  });

  it('suppresses the total only when NOT ONE line describes the person', () => {
    const allPayer = TABLE.find((t) => /civilian noninstitutionalized/i.test(t.population))!;
    const medicaidFits = MEDICARE_ROWS.slice(0, 5).map((it) => fitOf(it, { coverage: 'medicaid' }));
    expect(everyLineUndescribed(medicaidFits)).toBe(true);
    // one line that does describe them is enough to keep a real total on the page
    expect(everyLineUndescribed([...medicaidFits, fitOf(allPayer, { coverage: 'medicaid' })])).toBe(false);
    // an empty ledger is not a suppressed one
    expect(everyLineUndescribed([])).toBe(false);
    // on Medicare, nothing is suppressed
    expect(everyLineUndescribed(MEDICARE_ROWS.slice(0, 5).map((it) => fitOf(it, { coverage: 'medicare' })))).toBe(false);
  });

  it('the words that replace the total name the state, never a dollar figure', () => {
    const c = noFigureCopy({ coverage: 'medicaid' }, 5);
    expect(c.headline).toMatch(/no federal file publishes/i);
    expect(c.body).toMatch(/set by each state/i);
    expect(c.action).toMatch(/all 5 lines/);
    // 🔴 never a number we did not publish, anywhere in the replacement copy
    for (const t of [c.headline, c.body, c.action, c.insteadOfComparison]) expect(t).not.toMatch(/\$/);
  });

  it('says one line for one line, and never compares against a total it suppressed', () => {
    expect(noFigureCopy({ coverage: 'medicaid' }, 1).action).toMatch(/all 1 line$/);
    for (const cov of ['medicaid', 'uninsured', undefined] as (Coverage | undefined)[]) {
      expect(noFigureCopy({ coverage: cov }, 3).insteadOfComparison).toMatch(/no itemized total/i);
    }
  });
});

/* Every address in data/medicaid-fee-schedules.json was fetched by
   data/verify_medicaid_links.py before it shipped. These tests hold the FILE to
   that promise, so a hand-edit can never slip a guessed link onto the screen. */
describe('the state fee-schedule links', () => {
  const doc = feeSchedules as unknown as {
    _verified_on: string; _states_published: number; _states_omitted: number;
    states: Record<string, { state_name: string; program: string; url: string; http_status: number; verified_by: string; verified_on: string }>;
    _omitted: { state: string; reason: string; tried: unknown[] }[];
  };

  it('publishes only addresses that answered, over https, on the day recorded', () => {
    const codes = Object.keys(doc.states);
    expect(codes.length).toBe(MEDICAID_LINK_COUNT);
    expect(codes.length).toBeGreaterThanOrEqual(30);
    for (const code of codes) {
      const r = doc.states[code];
      expect(STATE_NAME[code], `${code} is not a state CMS prices`).toBeTruthy();
      expect(r.url.startsWith('https://'), `${code} ${r.url}`).toBe(true);
      expect(r.http_status).toBeGreaterThanOrEqual(200);
      expect(r.http_status).toBeLessThan(300);
      expect(r.verified_by).toMatch(/content|status\+address/);
      expect(r.verified_on).toBe(doc._verified_on);
      expect(r.verified_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(MEDICAID_LINKS_VERIFIED_ON).toBe(doc._verified_on);
  });

  it('records every state it could NOT verify, with its reason — an absence stays visible', () => {
    expect(doc._states_published).toBe(Object.keys(doc.states).length);
    expect(doc._states_omitted).toBe(doc._omitted.length);
    for (const o of doc._omitted) {
      expect(o.reason).toMatch(/omitted rather than guessed/i);
      expect(Array.isArray(o.tried)).toBe(true);
    }
  });

  it('names the program for EVERY state, including the ones with no linkable address', () => {
    const programs = (doc as unknown as { programs: Record<string, { state_name: string; program: string }> }).programs;
    expect(Object.keys(programs).length).toBeGreaterThanOrEqual(51);
    for (const code of Object.keys(programs)) {
      const p = medicaidProgramFor(code);
      expect(p, code).not.toBeNull();
      expect(p!.program.length).toBeGreaterThan(3);
      expect(p!.stateName).toBe(STATE_NAME[code]);
    }
    // the four we could not fetch still get a true sentence, not a blank
    for (const o of doc._omitted) expect(medicaidProgramFor(o.state)?.program).toBeTruthy();
    expect(medicaidProgramFor('ZZ')).toBeNull();
    expect(medicaidProgramFor(null)).toBeNull();
  });

  it('hands back null for a state it could not verify — never a guessed address', () => {
    for (const o of doc._omitted) expect(medicaidFeeScheduleFor(o.state)).toBeNull();
    expect(medicaidFeeScheduleFor(undefined)).toBeNull();
    expect(medicaidFeeScheduleFor('ZZ')).toBeNull();
    const one = Object.keys(doc.states)[0];
    expect(medicaidFeeScheduleFor(one.toLowerCase())?.url).toBe(doc.states[one].url);
  });
});

/* ==========================================================================
   A LENGTH OF TIME IS NOT A UNIT OF CARE.
   The mapper refuses the phrase and names the counter; this is the reading
   side. It must survive a mapper that has not shipped the field yet, and it
   must never invent a counter of its own.
   ========================================================================== */
describe('what the ledger does with a phrase the mapper refused', () => {
  it('reads the counter, the sentence and the months the mapper handed back', () => {
    const h = gapHintOf({ item: null, reason: 'a length of time, not a unit of care', gapCategory: 'time-searching', months: 24 });
    expect(h).toEqual({ category: 'time-searching', label: 'Time spent searching rather than being treated', reason: 'a length of time, not a unit of care', months: 24 });
  });

  it('never puts a phrase in a counter that does not exist', () => {
    expect(gapHintOf({ item: null, gapCategory: 'made-up-counter', reason: 'x' })).toBeNull();
    expect(gapHintOf({ item: null, gapCategory: '', reason: 'x' })).toBeNull();
    for (const c of GAP_CATEGORIES) {
      expect(gapHintOf({ item: null, gapCategory: c.id, reason: 'r' })?.label).toBe(c.label);
      expect(gapCategoryLabel(c.id)).toBe(c.label);
    }
    expect(gapCategoryLabel('nope')).toBeNull();
  });

  it('never routes a line that WAS priced into a counter', () => {
    expect(gapHintOf({ item: item('cms-99213'), gapCategory: 'time-searching', reason: 'r' })).toBeNull();
  });

  it('survives a mapper that carries none of these fields', () => {
    expect(gapHintOf({ item: null, score: 0, matchedOn: null, confidence: 'none', reason: null })).toBeNull();
    expect(gapHintOf(null)).toBeNull();
    expect(gapHintOf(undefined)).toBeNull();
    expect(gapHintOf('nonsense')).toBeNull();
  });

  it('drops a months value that is not a real length of time, and keeps the sentence honest', () => {
    expect(gapHintOf({ item: null, gapCategory: 'care-denied', reason: 'r', months: 0 })?.months).toBeNull();
    expect(gapHintOf({ item: null, gapCategory: 'care-denied', reason: 'r', months: Number.NaN })?.months).toBeNull();
    expect(gapHintOf({ item: null, gapCategory: 'care-denied', reason: '  ' })?.reason).toBe('counted, never priced');
  });
});

/* 🔴 TWO BASES ARE NEVER COMPARED IN ONE SENTENCE. The uninsured total is a
   stack of billed charges; the published year-ahead figure is measured in
   expenditures. The ledger compares against the allowed-amount stack instead,
   and these are the two stacks it must have to do that. */
describe('the two stacks an uninsured page carries', () => {
  const visit = item('cms-99213');
  it('are different numbers, and the labels say which is which', () => {
    const charge = submittedChargeOf(visit)!;
    expect(charge).not.toBe(visit.valueUsd);
    expect(fitOf(visit, { coverage: 'uninsured' }).figureUsd).toBe(charge);
    expect(scheduleFigureOf(visit, { coverage: 'uninsured' } as never)).toBe(visit.valueUsd);
    const l = totalLabels({ coverage: 'uninsured' });
    expect(l.primary).toMatch(/providers billed/i);
    expect(l.secondary).toMatch(/medicare figures/i);
  });
});

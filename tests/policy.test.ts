/* /policy and GET /api/policy: the policy view says only what the data holds.
   The burden figures are the price table's rows (the same join as the ledger),
   every rollup cell under 11 is withheld on the server, and every lever cites
   two sources and claims nothing has changed. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import conditionsRaw from '../data/conditions.json';
import { benchmarkFor, CONDITIONS } from '../lib/conditions';
import { TABLE } from '../lib/table';
import {
  conditionRows, scheduleOf, figuresBySchedule, SCHEDULE_OF_ROW, rollupCorrections, foldCells,
  surveyView, gapView, LEVERS, AGENCIES, AGENCY_ORDER, SCHEDULES, SMALL_CELL_MIN,
} from '../lib/policy';
import { policyDocument, onRequestGet, POLICY_CACHE } from '../cf/functions/api/policy.js';

const at = (d: number) => `2026-09-${String(d).padStart(2, '0')}T12:00:00.000Z`;
const many = (priceId: string, n: number, verdict = 'wrong') =>
  Array.from({ length: n }, (_, i) => ({ priceId, verdict, believedValueUsd: i % 2 ? 120 : null, receivedAt: at(10 + (i % 5)), senderKey: `s${i}` }));

describe('section 1: the burden figures are the ledger’s own join', () => {
  it('renders every condition the conditions file holds, in its order, with no list of its own', () => {
    const ids = (conditionsRaw as { conditions: { id: string }[] }).conditions.map((c) => c.id);
    expect(conditionRows().map((r) => r.id)).toEqual(ids);
  });
  it('agrees with lib/conditions benchmarkFor on every figure and every absence', () => {
    for (const c of CONDITIONS) {
      const b = benchmarkFor(c.id)!;
      const r = conditionRows().find((x) => x.id === c.id)!;
      if (b.kind === 'figure') {
        expect(r.figure, c.id).not.toBeNull();
        expect([r.figure!.point, r.figure!.low, r.figure!.high, r.figure!.year, r.figure!.sourceUrl], c.id)
          .toEqual([b.point, b.low, b.high, b.year, b.sourceUrl]);
        expect(r.figure!.government, c.id).toBe(b.isGovernmentPublication);
      } else {
        expect(r.figure, c.id).toBeNull();
        expect(r.reason, c.id).toBeTruthy();
      }
    }
  });
  it('labels the long COVID figure as research, not government', () => {
    const lc = conditionRows().find((r) => r.id === 'long-covid');
    if (lc?.figure) expect(lc.figure.government).toBe(false);
  });
});

describe('section 2: every published row lands in exactly one schedule', () => {
  it('classifies the rows the demo names', () => {
    expect(SCHEDULE_OF_ROW.get('cms-99213')).toBe('cms-pfs');
    expect(SCHEDULE_OF_ROW.get('cms-lab-lyme-screen')).toBe('cms-clfs');
    expect(SCHEDULE_OF_ROW.get('meps2022-longcovid-excess-total')).toBe('research');
    expect(SCHEDULE_OF_ROW.get('meps2022-benchmark-heart-disease')).toBe('ahrq-meps');
    expect(scheduleOf('CMS, January 2026 Hospital Outpatient Prospective Payment System Addendum B; CMS, CY2026 N')).toBe('cms-opps');
  });
  it('the schedule counts add up to the whole table', () => {
    const per = figuresBySchedule();
    expect(Object.values(per).reduce((a, b) => a + b, 0)).toBe(TABLE.length);
    expect(Object.keys(per).sort()).toEqual(SCHEDULES.map((s) => s.key).sort());
  });
});

describe('section 2: the small-cell rule runs on the server', () => {
  it('withholds a cell of 1 whole, counts and dates, and still adds up to N', () => {
    const doc = policyDocument({ corrections: many('cms-99213', 1) });
    const cms = doc.disputes.byAgency.find((c) => c.key === 'CMS')!;
    expect(cms.shown).toBe(false);
    expect([cms.sends, cms.wrong, cms.right, cms.withAmount, cms.firstOn, cms.lastOn]).toEqual([null, null, null, null, null, null]);
    expect(doc.disputes.withheld.byAgency.sends).toBe(1);
    expect(doc.disputes.withheld.byAgency.label).toBe(`fewer than ${SMALL_CELL_MIN}, not shown`);
    const pfs = doc.disputes.bySchedule.find((c) => c.key === 'cms-pfs')!;
    expect(pfs.shown).toBe(false);
    expect(pfs.figuresPublished).toBeGreaterThan(0);
  });
  it('withholds 10 and shows 11', () => {
    const ten = policyDocument({ corrections: many('cms-99213', 10) }).disputes.bySchedule.find((c) => c.key === 'cms-pfs')!;
    expect(ten.shown).toBe(false);
    const eleven = policyDocument({ corrections: many('cms-99213', 11) }).disputes.bySchedule.find((c) => c.key === 'cms-pfs')!;
    expect(eleven.shown).toBe(true);
    expect([eleven.sends, eleven.wrong, eleven.withAmount, eleven.figuresNamed, eleven.senders]).toEqual([11, 11, 5, 1, 11]);
    expect([eleven.firstOn, eleven.lastOn]).toEqual(['2026-09-10', '2026-09-14']);
  });
  it('shows an empty cell as zero: zero names nobody', () => {
    const doc = policyDocument({ corrections: [] });
    for (const c of doc.disputes.byAgency) { expect(c.shown).toBe(true); expect(c.sends).toBe(0); }
    expect(doc.disputes.withheld.byAgency.cells).toBe(0);
  });
  it('rolls a schedule into its agency and ignores a row the table does not hold', () => {
    const r = rollupCorrections([...many('cms-99213', 3), ...many('cms-lab-lyme-screen', 2), { priceId: 'no-such-row', verdict: 'wrong' }]);
    expect(r.byAgency.find((c) => c.key === 'CMS')!.sends).toBe(5);
    expect(r.bySchedule.find((c) => c.key === 'cms-clfs')!.sends).toBe(2);
    const folded = foldCells(r.bySchedule, SMALL_CELL_MIN, 'x');
    expect(folded.withheld).toEqual({ cells: 2, sends: 5, min: SMALL_CELL_MIN, label: 'x' });
  });
  it('never serves a believed amount, only how many sends carried one', () => {
    const text = JSON.stringify(policyDocument({ corrections: many('cms-99213', 12) }));
    expect(text).not.toMatch(/believed/i);
    expect(text).not.toContain('120');
  });
});

describe('the survey and the gap, folded', () => {
  it('withholds every ranked-first count under 11 and keeps the order and N', () => {
    const v = surveyView({ n: 4, submissions: 4, ranking: [
      { burden: 'forgone', rankedFirstBy: 4, meanRank: 1 }, { burden: 'oop', rankedFirstBy: 0, meanRank: 2.5 },
    ] }, SMALL_CELL_MIN);
    expect(v.n).toBe(4);
    expect(v.ranking.map((r) => r.burden)).toEqual(['forgone', 'oop']);
    expect(v.ranking[0].rankedFirstBy).toBeNull();
    expect(v.ranking[1].countedByFederalFiles).toBe(true);
    expect(v.readAs).toBe('signal');
    expect(surveyView({ n: 12, ranking: [{ burden: 'time', rankedFirstBy: 12, meanRank: 1 }] }, SMALL_CELL_MIN).ranking[0].rankedFirstBy).toBe(12);
  });
  it('withholds a gap category reported by 1 to 10, shows 0 and 11+', () => {
    const g = gapView({ respondents: 20, gap: [{ category: 'dismissed', respondentsReporting: 3 }, { category: 'care-denied', respondentsReporting: 11 }] }, SMALL_CELL_MIN);
    const by = Object.fromEntries(g.categories.map((c) => [c.id, c.reporting]));
    expect(by.dismissed).toBeNull();
    expect(by['care-denied']).toBe(11);
    expect(by['life-lost']).toBe(0);
  });
});

describe('section 3: every lever cites two sources and claims nothing has happened', () => {
  it('has three to five levers, each with two distinct https sources, a year and a quote', () => {
    expect(LEVERS.length).toBeGreaterThanOrEqual(3);
    expect(LEVERS.length).toBeLessThanOrEqual(5);
    for (const l of LEVERS) {
      expect(l.sources.length, l.id).toBeGreaterThanOrEqual(2);
      expect(new Set(l.sources.map((s) => s.url)).size, l.id).toBe(l.sources.length);
      for (const s of l.sources) {
        expect(s.url, l.id).toMatch(/^https:\/\//);
        expect(s.year, l.id).toMatch(/\d{4}/);
        expect(s.quote.length, l.id).toBeGreaterThan(20);
      }
      expect(l.today && l.larger && l.what, l.id).toBeTruthy();
    }
  });
  it('never says a change happened, and never uses a banned word', () => {
    const text = JSON.stringify(LEVERS) + JSON.stringify(AGENCIES);
    expect(text).not.toMatch(/\b(has|have) (changed|adopted|routed)\b|\bwe (changed|sent|routed)\b/i);
    expect(text).not.toMatch(/\b(prototype|demo|mockup|MVP|TODO|lorem|undefined|NaN)\b/);
    expect(text).not.toMatch(/—/);
  });
  it('names an office for every agency that publishes a figure in the table', () => {
    const per = figuresBySchedule();
    for (const k of AGENCY_ORDER) {
      const n = SCHEDULES.filter((s) => s.agency === k).reduce((a, s) => a + per[s.key], 0);
      if (n) expect(AGENCIES[k].office, k).toBeTruthy();
      if (n && k !== 'research') expect(AGENCIES[k].sources.length, k).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('GET /api/policy', () => {
  const stmt = { bind() { return stmt; }, async all() { return { results: [] }; }, async first() { return null; }, async run() { return {}; } };
  const env = { DB: { prepare: () => stmt, batch: async () => [] } };
  it('answers GET with the document, cached, and no POST handler exists', async () => {
    const res = await onRequestGet({ env } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(POLICY_CACHE);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.smallCellMin).toBe(SMALL_CELL_MIN);
    expect(body.conditions.rows.length).toBe(conditionRows().length);
    const mod = await import('../cf/functions/api/policy.js');
    expect('onRequestPost' in mod).toBe(false);
  });
  it('says unread, not zero, when the database is down', async () => {
    const res = await onRequestGet({ env: { DB: { prepare: () => { throw new Error('down'); } } } } as never);
    expect(res.status).toBe(503);
  });
});

describe('the page and the two links', () => {
  const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  it('/register/live links to /policy once; the shell lists it in the top nav and the footer (JUDGE-7 #7e)', () => {
    expect(src('components/Register.tsx').match(/href="\/policy"/g)?.length).toBe(1);
    /* once in NAV ("For agencies", bar and phone menu) and once in the footer, footerOnly so the phone menu shows it once */
    expect(src('components/Shell.tsx').match(/href: '\/policy'/g)?.length).toBe(2);
    expect(src('components/Shell.tsx')).toContain("{ href: '/policy', label: 'Policy brief for agencies', footerOnly: true }");
  });
  it('prints: the page carries a print stylesheet and a print button', () => {
    expect(src('app/policy/policy.css')).toMatch(/@media print/);
    expect(src('components/PolicyMount.tsx')).toMatch(/window\.print\(\)/);
  });
});

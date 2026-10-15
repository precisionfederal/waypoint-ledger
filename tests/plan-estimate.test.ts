/* ==========================================================================
   YOUR PLAN (FINAL-1014 plan lane). "Medicare's rate is not what I pay": a
   person types their own plan's terms and sees their own share. These tests
   hold the arithmetic (deductible partly met, copays, the out-of-pocket cap,
   blanks and nonsense clamped), hold the label on the face, keep the default
   panel exactly the Original Medicare one, and hold the sheet's redaction out
   of the total and off the paper.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { TABLE } from '../lib/table';
import { priceJourney, totals } from '../lib/pricing';
import { medicareSplit } from '../lib/whopays';
import { EMPTY_BURDENS } from '../lib/burdens';
import { medicaidFeeScheduleFor } from '../lib/fit';
import {
  clampNum, cleanTerms, hasTerms, isVisitLine, planArithmetic, planEstimate, type PlanLineIn,
} from '../lib/plan-estimate';
import WhoPays from '../components/WhoPays';
import YourPlan from '../components/YourPlan';
import { exampleEntries } from '../components/sheet/example';
import { hiddenCount, hiddenNote, shownEntries, toggled } from '../components/sheet/redact';
import RedactList from '../components/sheet/RedactList';
import type { JourneyEntry } from '../lib/types';

const row = (id: string) => { const t = TABLE.find((x) => x.id === id); if (!t) throw new Error(id); return t; };
const ln = (id: string, times = 1): PlanLineIn => {
  const it = row(id);
  return { key: `${id}-${times}`, label: it.label, itemId: it.id, code: it.code, times, approvedUsd: Math.round(it.valueUsd! * times * 100) / 100 };
};
const money = (n: number) => `$${n.toFixed(2)}`;

describe('the arithmetic, from the person\'s own terms', () => {
  it('deductible partly met: the rest of the deductible once, then coinsurance on what is left', () => {
    // office visit 99213 $95.19 x2 = $190.38, brain MRI $195.40; no copay typed, so the visit goes through the deductible too
    const e = planEstimate([ln('cms-99213', 2), ln('cms-img-mri-brain-nc')], { deductibleUsd: 500, deductibleMetUsd: 300, coinsurancePct: 30 });
    expect(e.subjectUsd).toBe(385.78);
    expect(e.deductibleLeftUsd).toBe(200);
    expect(e.deductibleAppliedUsd).toBe(200);
    expect(e.remainingUsd).toBe(185.78);
    expect(e.coinsuranceUsd).toBe(55.73);
    expect(e.shareUsd).toBe(255.73);
    expect(e.planPaysUsd).toBe(130.05);
    expect(planArithmetic(e, money)).toBe('$200.00 deductible + $55.73 coinsurance (30% of the remaining $185.78) = $255.73');
  });

  it('copay lines: a flat copay per visit, never more than the visit\'s approved amount; tests go through the deductible', () => {
    const e = planEstimate([ln('cms-99213', 2), ln('cms-99211'), ln('cms-img-mri-brain-nc')], { deductibleUsd: 100, coinsurancePct: 20, copayUsd: 40 });
    const by = Object.fromEntries(e.lines.map((l) => [l.itemId, l]));
    expect(by['cms-99213'].rule).toBe('copay');
    expect(by['cms-99213'].copayTotalUsd).toBe(80);
    expect(by['cms-99211'].copayTotalUsd).toBe(24.38); // a $40 copay on a $24.38 visit is $24.38
    expect(by['cms-img-mri-brain-nc'].rule).toBe('deductible-coinsurance');
    expect(e.copaysUsd).toBe(104.38);
    expect(e.copayVisits).toBe(3);
    expect(e.coinsuranceUsd).toBe(19.08); // 20% of (195.40 - 100)
    expect(e.shareUsd).toBe(223.46);
    expect(planArithmetic(e, money)).toBe('$104.38 in copays (3 visits at $40.00) + $100.00 deductible + $19.08 coinsurance (20% of the remaining $95.40) = $223.46');
  });

  it('the hospital\'s own clinic fee and the ER hospital half are not visits; the ER whole encounter is', () => {
    expect(isVisitLine(ln('cms-g0463-hospital-clinic-fee'))).toBe(false);
    expect(isVisitLine(ln('cms-ed-99284-facility-only'))).toBe(false);
    expect(isVisitLine(ln('cms-ed-99284-complete'))).toBe(true);
    expect(isVisitLine(ln('cms-mh-therapy-45'))).toBe(true);
    expect(isVisitLine(ln('cms-lab-cbc'))).toBe(false);
  });

  it('the out-of-pocket maximum caps the year, less the deductible already paid', () => {
    const e = planEstimate([ln('cms-img-mri-brain-both'), ln('cms-img-ct-abd-pelvis-c')], { deductibleUsd: 1000, deductibleMetUsd: 200, coinsurancePct: 50, oopMaxUsd: 500 });
    expect(e.beforeCapUsd).toBe(617.24);
    expect(e.capRoomUsd).toBe(300);
    expect(e.capped).toBe(true);
    expect(e.shareUsd).toBe(300);
    expect(planArithmetic(e, money)).toContain('capped at $300.00: your $500.00 out-of-pocket maximum less the $200.00 already paid');
  });

  it('yearly depression screening is $0 under a private plan, citing HealthCare.gov', () => {
    const e = planEstimate([ln('cms-g0444')], { deductibleUsd: 500, coinsurancePct: 20 });
    expect(e.lines[0].rule).toBe('preventive');
    expect(e.shareUsd).toBe(0);
  });

  it('zero inputs: every term $0 gives a $0 share; all blank shows no estimate', () => {
    const e = planEstimate([ln('cms-99214'), ln('cms-lab-cmp')], { deductibleUsd: 0, coinsurancePct: 0, copayUsd: 0 });
    expect(e.shareUsd).toBe(0);
    expect(e.planPaysUsd).toBe(146.17);
    expect(hasTerms({})).toBe(false);
    expect(hasTerms({ deductibleUsd: null, copayUsd: undefined })).toBe(false);
    expect(hasTerms({ deductibleUsd: 0 })).toBe(true);
  });

  it('nonsense inputs are clamped, never trusted', () => {
    expect(clampNum('abc', 0, 100)).toBeNull();
    expect(clampNum('$1,500', 0, 1e6)).toBe(1500);
    expect(clampNum('30%', 0, 100)).toBe(30);
    expect(clampNum(-50, 0, 100)).toBe(0);
    expect(clampNum(Infinity, 0, 100)).toBeNull();
    const t = cleanTerms({ deductibleUsd: -5, coinsurancePct: 250, copayUsd: Number.NaN, oopMaxUsd: null, deductibleMetUsd: 999 });
    expect(t).toEqual({ deductibleUsd: 0, coinsuranceRate: 1, copayUsd: 0, oopMaxUsd: null, deductibleMetUsd: 0 });
    expect(cleanTerms({ deductibleUsd: 400, deductibleMetUsd: 900 }).deductibleMetUsd).toBe(400);
    const e = planEstimate([{ ...ln('cms-99213'), times: Number.NaN }, { ...ln('cms-lab-cbc'), approvedUsd: -10 }], { coinsurancePct: 250 });
    expect(e.lines[0].times).toBe(0);
    expect(e.lines[1].approvedUsd).toBe(0);
    expect(e.shareUsd).toBe(95.19); // 250% read as 100% of the $95.19 approved, never more
    expect(Number.isFinite(e.planPaysUsd)).toBe(true);
  });
});

describe('the panel on the ledger', () => {
  const lines = priceJourney(exampleEntries());
  const gaps = { cats: [] as [string, { lines: number; times: number }][], months: 0, named: [] as string[] };
  const html = (ctx = {}) => renderToStaticMarkup(createElement(WhoPays, { lines, ctx, gaps, burdens: EMPTY_BURDENS }));

  it('renders Original Medicare by default, unchanged, with the picker set to it and no plan form', () => {
    const h = html({ coverage: 'medicare' });
    expect(h).toContain('$755.58');
    expect(h).toContain('Your share if you had Original Medicare (Part B) and had not met the 2026 deductible');
    expect(h).toContain('Work out your share with');
    expect(h).toMatch(/checked="" value="medicare"/);
    expect(h).not.toContain('your-plan');
  });

  it('says why the Medicare figure may look low, with no new number', () => {
    const h = html();
    expect(h).toContain('Why this may look low:');
    expect(h).toContain('a rate the government sets. Private plans and hospital charges are usually higher.');
  });

  it('the private plan form labels its figure an estimate from the person\'s own numbers and never "what you will pay"', () => {
    const split = medicareSplit(exampleEntries())!;
    const h = renderToStaticMarkup(createElement(YourPlan, { kind: 'private', split }));
    expect(h).toContain('Your share with your plan’s own numbers (an estimate)');
    expect(h).toContain('An estimate from your own plan’s numbers. Your plan’s real allowed amounts can differ from Medicare’s; this applies your terms to Medicare’s published rate.');
    expect(h).toContain('They stay in this browser and are never sent.');
    for (const banned of [/what you will pay/i, /your bill/i, /what you paid/i, /—/]) expect(h).not.toMatch(banned);
  });

  it('Medicaid: no invented copay; the state\'s own fee schedule is linked when one is verified', () => {
    const split = medicareSplit(exampleEntries())!;
    const h = renderToStaticMarkup(createElement(YourPlan, { kind: 'medicaid', split, stateCode: 'IA' }));
    expect(h).toContain('your state sets it');
    expect(h).toContain('https://www.medicaid.gov/medicaid/cost-sharing');
    const fs = medicaidFeeScheduleFor('IA');
    if (fs) expect(h).toContain(fs.url);
    expect(h).not.toMatch(/\$\d/);
    const none = renderToStaticMarkup(createElement(YourPlan, { kind: 'medicaid', split }));
    expect(none).toContain('Choose your state at the top of the ledger');
  });
});

describe('hide before sharing, on the sheet', () => {
  const entries = exampleEntries();

  it('nothing is hidden by default', () => {
    expect(shownEntries(entries, new Set())).toEqual(entries);
    expect(hiddenNote(0)).toBeNull();
  });

  it('a hidden line leaves the total, and the total says how many were hidden', () => {
    const priced = entries.find((e) => e.item && e.item.valueUsd);
    expect(priced).toBeTruthy();
    const hidden = toggled(new Set(), priced!.key);
    const all = totals(priceJourney(entries));
    const shown = shownEntries(entries, hidden);
    const t = totals(priceJourney(shown));
    expect(shown.find((e) => e.key === priced!.key)).toBeUndefined();
    const line = priceJourney([priced!])[0];
    expect(Math.round((all.totalUsd - t.totalUsd) * 100) / 100).toBe(Math.round((line.totalUsd ?? 0) * 100) / 100);
    expect(hiddenCount(entries, hidden)).toBe(1);
    expect(hiddenNote(1)).toBe('1 line hidden by you, not in this total');
    expect(hiddenNote(3)).toBe('3 lines hidden by you, not in this total');
    expect(toggled(hidden, priced!.key).size).toBe(0);
  });

  it('the tick list offers every line and the person\'s own words, nothing ticked by default', () => {
    const h = renderToStaticMarkup(createElement(RedactList, { entries, hidden: new Set<string>(), onToggle: () => {}, hideWords: false, onWords: () => {} }));
    expect(h.match(/type="checkbox"/g)!.length).toBe(entries.length + 1);
    expect(h).not.toContain('checked');
    expect(h).toContain('Hide my own words (what I typed on each line, and my notes)');
    expect(h).toContain(`Hide line 1: ${entries[0].raw.trim()}`);
  });

  it('a key no longer on the ledger is not counted', () => {
    expect(hiddenCount(entries, new Set(['gone']))).toBe(0);
  });

  it('the page prints only the shown lines, keeps the controls off paper and prints the hidden count', () => {
    const page = readFileSync(new URL('../app/sheet/page.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/const entries: JourneyEntry\[\] \| null = allEntries === null \? null : shownEntries\(allEntries, hidden\)/);
    expect(page).toMatch(/className="sheet-redact no-print"/);
    expect(page).toContain('{nHidden > 0 && <p className="st-hidden" data-testid="sheet-hidden-note">{hiddenNote(nHidden)}</p>}');
    expect(page).toContain('notes.length > 0 && !hideWords');
    expect(page).not.toMatch(/localStorage|fetch\(/);
  });
});

/* keep the fixture honest: exampleEntries carries keys the redaction can address */
const _k: JourneyEntry['key'] = exampleEntries()[0].key; void _k;

/* ==========================================================================
   YOUR PLAN — the person's own plan terms applied to the ledger's Medicare lines.

   The first thing every patient, payer and judge says is "Medicare's rate is not
   what I pay." This module lets a person type THEIR plan's terms (deductible,
   coinsurance, copay per visit, out-of-pocket maximum, deductible already met)
   and see the arithmetic of their own share, line by line, on the face.

   🔴 WHAT THIS MODULE MAY AND MAY NOT DO
   · Every dollar here is either a Medicare-approved amount already on the
     ledger (lib/whopays.ts medicareSplit, cited CMS rows) or a number the person
     typed. Nothing is assumed, defaulted or invented: a blank field is $0 or
     "no cap", and it says so.
   · It is an estimate under a stated assumption: the person's terms applied to
     Medicare's published rate. Their plan's own allowed amounts can differ, and
     the face says so. It is never "what you will pay".
   · Pure arithmetic, no storage, no network. The component keeps the typed
     terms in localStorage on this device only.
   ========================================================================== */


import { MAX_USD, clampNum, hasTerms, type PlanTerms } from './plan-store';
export { MAX_USD, PLAN_KEY, clampNum, hasTerms, loadPlan, savePlan } from './plan-store';
export type { PlanKind, PlanTerms, SavedPlan } from './plan-store';

/** The same terms after clamping: every number is finite and in range. */
export interface CleanTerms {
  deductibleUsd: number;
  coinsuranceRate: number;
  copayUsd: number;
  oopMaxUsd: number | null;
  deductibleMetUsd: number;
}

/** One ledger line as this module needs it: a Medicare-approved amount and a count. */
export interface PlanLineIn {
  key: string;
  label: string;
  /** the price-table row id, used only to tell a visit from a test */
  itemId: string;
  /** the row's service code, "CPT 99213" */
  code?: string;
  times: number;
  /** Medicare-approved amount for the line (figure × times), dollars */
  approvedUsd: number;
}

export type PlanRule = 'copay' | 'deductible-coinsurance' | 'preventive';

export interface PlanLine extends PlanLineIn {
  rule: PlanRule;
  /** for copay lines: what the copays come to (never more than the approved amount) */
  copayTotalUsd: number;
}

export interface PlanEstimate {
  terms: CleanTerms;
  lines: PlanLine[];
  approvedUsd: number;
  /** visits charged a copay, and what the copays come to */
  copayVisits: number;
  copaysUsd: number;
  /** the part the deductible-then-coinsurance rule applies to */
  subjectUsd: number;
  /** what was left of the deductible before these lines */
  deductibleLeftUsd: number;
  deductibleAppliedUsd: number;
  /** subject − deductible applied */
  remainingUsd: number;
  coinsuranceUsd: number;
  /** yearly screenings on the preventive list, $0 */
  preventiveUsd: number;
  /** copays + deductible applied + coinsurance, before any cap */
  beforeCapUsd: number;
  /** what the out-of-pocket maximum leaves room for (max − deductible already met), or null with no cap */
  capRoomUsd: number | null;
  capped: boolean;
  /** the estimate */
  shareUsd: number;
  /** approved − share: what the plan would pay at Medicare's rate */
  planPaysUsd: number;
}

const cents = (n: number): number => Math.round(n * 100) / 100;



/** Clamp what the person typed. A blank dollar field is $0; a blank cap is no cap;
 *  coinsurance is 0 to 100%; the deductible already met cannot exceed the deductible. */
export function cleanTerms(t: PlanTerms): CleanTerms {
  const deductibleUsd = clampNum(t.deductibleUsd, 0, MAX_USD) ?? 0;
  const pct = clampNum(t.coinsurancePct, 0, 100) ?? 0;
  const copayUsd = clampNum(t.copayUsd, 0, MAX_USD) ?? 0;
  const oopMaxUsd = clampNum(t.oopMaxUsd, 0, MAX_USD);
  const deductibleMetUsd = Math.min(deductibleUsd, clampNum(t.deductibleMetUsd, 0, MAX_USD) ?? 0);
  return { deductibleUsd, coinsuranceRate: pct / 100, copayUsd, oopMaxUsd, deductibleMetUsd };
}


/** Visit codes a plan usually charges a flat copay on: office and specialist visits
 *  (CPT 99202-99215), the emergency visit (99281-99285) and the psychiatric
 *  evaluation and therapy sessions (90791-90792, 90832-90838). Tests, scans,
 *  labs and procedures go through the deductible and coinsurance. */
const VISIT_CODE = /\b(99(20[2-5]|21[1-5]|28[1-5])|9079[12]|9083[2-8])\b/;

/** Yearly screenings on HealthCare.gov's list of preventive services plans must cover. */
const PREVENTIVE_IDS = new Set(['cms-g0444', 'cms-g0442']);

export const PREVENTIVE_SOURCE = {
  title: 'HealthCare.gov, Preventive care benefits for adults',
  url: 'https://www.healthcare.gov/preventive-care-adults/',
  quote: 'Generally, these services are covered at no cost to you when provided by an in-network medical provider',
} as const;

export const MEDICAID_SOURCE = {
  title: 'Medicaid.gov, Cost sharing',
  url: 'https://www.medicaid.gov/medicaid/cost-sharing',
  quote: 'States have the option to charge premiums and to establish out of pocket spending (cost sharing) requirements for Medicaid enrollees',
  quote2: 'For people with income at or below 150% FPL, copayments are limited to nominal amounts',
} as const;

export function isVisitLine(l: Pick<PlanLineIn, 'code' | 'itemId'>): boolean {
  if (/hospital|facility/i.test(l.itemId)) return false; // the hospital's own fee is not the visit
  return VISIT_CODE.test(l.code ?? '');
}

/**
 * Apply the person's own plan terms to the ledger's Medicare lines.
 * Copays per visit on visit lines (when a copay is typed), never more than the
 * line's approved amount; the remaining deductible is met once across every
 * other line, then the coinsurance rate on what is left; yearly screenings on
 * the preventive list are $0; the year is capped at the out-of-pocket maximum
 * less the deductible already met. One rate, so line order never matters.
 */
export function planEstimate(input: readonly PlanLineIn[], typed: PlanTerms): PlanEstimate {
  const terms = cleanTerms(typed);
  const lines: PlanLine[] = input.map((l) => {
    const times = Math.max(0, Math.floor(Number.isFinite(l.times) ? l.times : 0));
    const approvedUsd = Math.max(0, Number.isFinite(l.approvedUsd) ? l.approvedUsd : 0);
    if (PREVENTIVE_IDS.has(l.itemId)) return { ...l, times, approvedUsd, rule: 'preventive' as const, copayTotalUsd: 0 };
    if (terms.copayUsd > 0 && isVisitLine(l)) {
      return { ...l, times, approvedUsd, rule: 'copay' as const, copayTotalUsd: cents(Math.min(approvedUsd, terms.copayUsd * times)) };
    }
    return { ...l, times, approvedUsd, rule: 'deductible-coinsurance' as const, copayTotalUsd: 0 };
  });
  const approvedUsd = cents(lines.reduce((a, l) => a + l.approvedUsd, 0));
  const copayLines = lines.filter((l) => l.rule === 'copay');
  const copayVisits = copayLines.reduce((a, l) => a + l.times, 0);
  const copaysUsd = cents(copayLines.reduce((a, l) => a + l.copayTotalUsd, 0));
  const subjectUsd = cents(lines.filter((l) => l.rule === 'deductible-coinsurance').reduce((a, l) => a + l.approvedUsd, 0));
  const preventiveUsd = cents(lines.filter((l) => l.rule === 'preventive').reduce((a, l) => a + l.approvedUsd, 0));
  const deductibleLeftUsd = cents(terms.deductibleUsd - terms.deductibleMetUsd);
  const deductibleAppliedUsd = cents(Math.min(deductibleLeftUsd, subjectUsd));
  const remainingUsd = cents(subjectUsd - deductibleAppliedUsd);
  const coinsuranceUsd = cents(terms.coinsuranceRate * remainingUsd);
  const beforeCapUsd = cents(copaysUsd + deductibleAppliedUsd + coinsuranceUsd);
  const capRoomUsd = terms.oopMaxUsd === null ? null : cents(Math.max(0, terms.oopMaxUsd - terms.deductibleMetUsd));
  const capped = capRoomUsd !== null && beforeCapUsd > capRoomUsd;
  const shareUsd = capped ? capRoomUsd! : beforeCapUsd;
  return {
    terms, lines, approvedUsd, copayVisits, copaysUsd, subjectUsd, deductibleLeftUsd, deductibleAppliedUsd,
    remainingUsd, coinsuranceUsd, preventiveUsd, beforeCapUsd, capRoomUsd, capped, shareUsd,
    planPaysUsd: cents(Math.max(0, approvedUsd - shareUsd)),
  };
}

/** The arithmetic, as one line a person can check with a pencil. `money` formats dollars. */
export function planArithmetic(e: PlanEstimate, money: (n: number) => string): string {
  const pct = `${Math.round(e.terms.coinsuranceRate * 1000) / 10}%`;
  const parts: string[] = [];
  if (e.copayVisits > 0) parts.push(`${money(e.copaysUsd)} in copays (${e.copayVisits} ${e.copayVisits === 1 ? 'visit' : 'visits'} at ${money(e.terms.copayUsd)})`);
  if (e.subjectUsd > 0) {
    parts.push(`${money(e.deductibleAppliedUsd)} deductible`);
    if (e.remainingUsd > 0) parts.push(`${money(e.coinsuranceUsd)} coinsurance (${pct} of the remaining ${money(e.remainingUsd)})`);
  }
  const sum = parts.length ? `${parts.join(' + ')} = ${money(e.beforeCapUsd)}` : `${money(0)}`;
  if (e.capped) return `${sum}, capped at ${money(e.capRoomUsd!)}: your ${money(e.terms.oopMaxUsd!)} out-of-pocket maximum${e.terms.deductibleMetUsd > 0 ? ` less the ${money(e.terms.deductibleMetUsd)} already paid` : ''}`;
  return sum;
}

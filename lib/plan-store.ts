/* ==========================================================================
   YOUR PLAN, the small part the ledger loads up front: what the person typed,
   how a typed value is read, and keeping it on this device (localStorage only,
   never sent). The arithmetic is lib/plan-estimate.ts, loaded with the form.
   ========================================================================== */

/** What the person typed. Every field is optional; blanks are read as stated below. */
export interface PlanTerms {
  /** yearly deductible, dollars */
  deductibleUsd?: number | null;
  /** coinsurance after the deductible, in percent (30 = 30%) */
  coinsurancePct?: number | null;
  /** flat copay per office, specialist, therapy or ER visit, dollars */
  copayUsd?: number | null;
  /** yearly out-of-pocket maximum, dollars; blank = no cap applied */
  oopMaxUsd?: number | null;
  /** how much of the deductible is already paid this year, dollars */
  deductibleMetUsd?: number | null;
}

/** A typed value as a finite number in [lo, hi]; blank, NaN or text is null. */
export function clampNum(v: unknown, lo: number, hi: number): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,%\s]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}

/** The largest figure a person can type into any dollar field. */
export const MAX_USD = 1_000_000;

/** True when the person has typed at least one term (an all-blank form shows no estimate). */
export function hasTerms(t: PlanTerms): boolean {
  return (['deductibleUsd', 'coinsurancePct', 'copayUsd', 'oopMaxUsd', 'deductibleMetUsd'] as const)
    .some((k) => clampNum(t[k], 0, MAX_USD) !== null);
}

/* ---------------------------------------------------------------- storage */

export type PlanKind = 'medicare' | 'private' | 'medicaid';

export interface SavedPlan { kind: PlanKind; terms: PlanTerms }

export const PLAN_KEY = 'waypoint.plan.v1';

/** What this device holds, or Original Medicare with nothing typed. Never throws. */
export function loadPlan(): SavedPlan {
  const none: SavedPlan = { kind: 'medicare', terms: {} };
  try {
    if (typeof localStorage === 'undefined') return none;
    const raw = localStorage.getItem(PLAN_KEY);
    if (!raw) return none;
    const v = JSON.parse(raw) as Partial<SavedPlan>;
    const kind: PlanKind = v.kind === 'private' || v.kind === 'medicaid' ? v.kind : 'medicare';
    const t = (v.terms && typeof v.terms === 'object' ? v.terms : {}) as Record<string, unknown>;
    const terms: PlanTerms = {};
    for (const k of ['deductibleUsd', 'coinsurancePct', 'copayUsd', 'oopMaxUsd', 'deductibleMetUsd'] as const) {
      const n = clampNum(t[k], 0, MAX_USD);
      if (n !== null) terms[k] = n;
    }
    return { kind, terms };
  } catch { return none; }
}

/** Keep it on this device only. Original Medicare with nothing typed removes the key. */
export function savePlan(p: SavedPlan): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (p.kind === 'medicare' && !hasTerms(p.terms)) localStorage.removeItem(PLAN_KEY);
    else localStorage.setItem(PLAN_KEY, JSON.stringify(p));
  } catch { /* private mode: the estimate still works for this visit */ }
}

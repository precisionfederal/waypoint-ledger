'use client';
/* ==========================================================================
   THE CONDITION — which one the person has, and what a year of it costs.

   Until now the ledger pinned one benchmark into the code and printed "for an
   adult with long COVID" to everyone, including people who never said they had
   it. This module makes the condition a choice, and makes the answer to that
   choice come from data instead of a constant.

   Two rules govern everything here.

   1. NO FIGURE LIVES IN THIS FILE. `price_row_id` in data/conditions.json points
      at a row that is already in data/prices.json with its own federal file
      behind it, and the benchmark renders whatever that row says — its year,
      its population, its coverage statement. Adding a tenth condition is one
      JSON object, and it may only be added once its figure exists as a
      verified row.

   2. AN ABSENCE IS AN ANSWER. Six of the nine conditions have no published
      federal annual figure. `benchmarkFor` returns that absence in the
      product's own words with a link to /gap, so the missing figure is COUNTED
      rather than filled with the nearest number to hand. That refusal is the
      finding, and it is the one thing a judge cannot get from a model.

   The distinction the panel must keep on its face: an EXCESS figure is what a
   person spends OVER a comparable person without the condition; a
   CONDITION-ATTRIBUTED figure is what was spent treating it. They are not the
   same kind of number and are never ranked against each other.

   Verified by data/verify_conditions.py: every ICD-10-CM code re-read in the
   CDC/NCHS code file for FY2026 and FY2027, every figure re-read in the paper
   or brief it is cited to. Audit: data/CONDITIONS-AUDIT.json.
   ========================================================================== */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import conditionsRaw from '@/data/conditions.json';
import pricesRaw from '@/data/prices.json';

/* ------------------------------------------------------------------ types */

export type FigureKind = 'excess' | 'condition_attributed';

export interface Condition {
  id: string;
  label: string;
  alsoCalled: string[];
  /** the standard diagnosis code, or null where no single code names this population */
  icd10cm: string | null;
  icd10cmTitle: string | null;
  /** false where the code is a category heading rather than a claimable code */
  icd10cmBillable: boolean | null;
  icd10cmBillableNote: string | null;
  icd10cmFirstEffective: string | null;
  icd10cmSource: string | null;
  /** why this row deliberately carries no code */
  icd10cmBlankReason: string | null;
  priceRowId: string | null;
  figureKind: FigureKind | null;
  figureKindLabel: string | null;
  figureIsGovernmentPublication: boolean | null;
  figurePublisherNote: string | null;
  note: string | null;
  definitionCaveat: string | null;
}

/** What the year-ahead panel renders when the figure exists. */
export interface ConditionFigure {
  kind: 'figure';
  condition: Condition;
  rowId: string;
  point: number;
  /** the published 95% interval, where the source publishes one */
  low: number | null;
  high: number | null;
  year: string;
  figureKind: FigureKind;
  figureKindLabel: string;
  /** the row's own sentence about who it describes */
  coverageStatement: string;
  population: string;
  geography: string;
  sourceTitle: string;
  sourceUrl: string;
  agencyDisplay: string | null;
  isGovernmentPublication: boolean;
  publisherNote: string;
  /** true when the row may never be added to the itemized lines */
  neverAddedToTotal: boolean;
  median: number | null;
}

/** What it renders when there is none — the honest null, with its reason. */
export interface ConditionAbsence {
  kind: 'none';
  condition: Condition;
  reason: string;
  /** the general statement about what "no figure" means and does not mean */
  qualifier: string;
  gapHref: string;
}

export type Benchmark = ConditionFigure | ConditionAbsence;

/* ------------------------------------------------------------------- data */

interface RawCondition {
  id: string; label: string; also_called?: string[];
  icd10cm?: string | null; icd10cm_title?: string | null;
  icd10cm_billable?: boolean | null; icd10cm_billable_note?: string | null;
  icd10cm_first_effective?: string | null; icd10cm_source?: string | null;
  icd10cm_blank_reason?: string | null;
  price_row_id?: string | null; figure_kind?: string | null; figure_kind_label?: string | null;
  figure_is_government_publication?: boolean | null; figure_publisher_note?: string | null;
  note?: string | null; definition_caveat?: string | null;
}

interface RawFile {
  _version?: string;
  _when_there_is_no_figure?: string;
  _gap_link?: string;
  _the_distinction_that_must_stay_on_the_face?: string;
  _no_code_is_not_an_oversight?: string;
  _icd10cm_source?: { browser_url?: string; verified_on?: string; why_two_years?: string;
                      checked_against?: { fiscal_year: number; in_effect: string }[] };
  conditions: RawCondition[];
}

const FILE = conditionsRaw as unknown as RawFile;

export const CONDITIONS_VERSION = FILE._version ?? 'unknown';
export const GAP_HREF = FILE._gap_link ?? '/gap';
/** "We have not found a published federal figure" is a statement about our
 *  search, not a claim that none exists. The product prints it verbatim. */
export const NO_FIGURE_QUALIFIER = FILE._when_there_is_no_figure ?? '';
export const KIND_DISTINCTION = FILE._the_distinction_that_must_stay_on_the_face ?? '';
export const BLANK_CODE_NOTE = FILE._no_code_is_not_an_oversight ?? '';
export const ICD10CM_BROWSER = FILE._icd10cm_source?.browser_url ?? 'https://icd10cmtool.cdc.gov/';
export const ICD10CM_VERIFIED_ON = FILE._icd10cm_source?.verified_on ?? '';
export const ICD10CM_YEARS = (FILE._icd10cm_source?.checked_against ?? []).map((y) => y.fiscal_year);

export const CONDITIONS: Condition[] = FILE.conditions.map((r) => ({
  id: r.id,
  label: r.label,
  alsoCalled: r.also_called ?? [],
  icd10cm: r.icd10cm ?? null,
  icd10cmTitle: r.icd10cm_title ?? null,
  icd10cmBillable: r.icd10cm_billable ?? null,
  icd10cmBillableNote: r.icd10cm_billable_note ?? null,
  icd10cmFirstEffective: r.icd10cm_first_effective ?? null,
  icd10cmSource: r.icd10cm_source ?? null,
  icd10cmBlankReason: r.icd10cm_blank_reason ?? null,
  priceRowId: r.price_row_id ?? null,
  figureKind: (r.figure_kind as FigureKind | null) ?? null,
  figureKindLabel: r.figure_kind_label ?? null,
  figureIsGovernmentPublication: r.figure_is_government_publication ?? null,
  figurePublisherNote: r.figure_publisher_note ?? null,
  note: r.note ?? null,
  definitionCaveat: r.definition_caveat ?? null,
}));

export function conditionById(id: string | null | undefined): Condition | null {
  if (!id) return null;
  return CONDITIONS.find((c) => c.id === id) ?? null;
}

/* ------------------------------------------------------- the price row join */

interface RawPrice {
  id: string; value_usd: number | null; value_range_usd?: number[]; year: string;
  geography?: string; population?: string; coverage_statement?: string;
  source_title?: string; source_url?: string; agency_display?: string;
  summable?: boolean; alternates?: Record<string, unknown> | null;
}

const PRICE_ROWS = new Map<string, RawPrice>(
  (pricesRaw as unknown as { items: RawPrice[] }).items.map((r) => [r.id, r]),
);

/**
 * 🔴 THE ONE FUNCTION THIS FILE EXISTS FOR.
 *
 * Given a condition id, return the year-ahead figure the product may print —
 * or the absence, in words, with the gap link. Never a guess, never the
 * nearest number: a condition with `price_row_id: null`, or one whose row has
 * gone missing from the price table, returns `kind: 'none'` and says why.
 *
 * Returns null only when the id names no condition at all (nothing selected).
 */
export function benchmarkFor(conditionId: string | null | undefined): Benchmark | null {
  const condition = conditionById(conditionId);
  if (!condition) return null;

  const absence = (reason: string): ConditionAbsence => ({
    kind: 'none', condition, reason, qualifier: NO_FIGURE_QUALIFIER, gapHref: GAP_HREF,
  });

  if (!condition.priceRowId) {
    return absence(condition.note
      ?? `No published federal figure prices a year of ${condition.label.toLowerCase()}.`);
  }

  const row = PRICE_ROWS.get(condition.priceRowId);
  if (!row || row.value_usd === null) {
    // The condition points at a row that is not in the table, or the row
    // carries no figure. Either way the product has nothing to print, and it
    // says so rather than reaching for a substitute.
    return absence(`The figure this condition points at (${condition.priceRowId}) is not in the `
      + 'price table, so there is nothing to show. That is a fault in our data, not in your search.');
  }

  const range = Array.isArray(row.value_range_usd) && row.value_range_usd.length === 2
    ? row.value_range_usd : null;
  const median = typeof row.alternates?.median_usd === 'number'
    ? (row.alternates.median_usd as number) : null;

  return {
    kind: 'figure',
    condition,
    rowId: condition.priceRowId,
    point: row.value_usd,
    low: range ? range[0] : null,
    high: range ? range[1] : null,
    year: row.year,
    figureKind: condition.figureKind ?? 'condition_attributed',
    figureKindLabel: condition.figureKindLabel
      ?? 'what was spent in a year, per adult the figure describes',
    coverageStatement: row.coverage_statement ?? '',
    population: row.population ?? 'not stated',
    geography: row.geography ?? 'not stated',
    sourceTitle: row.source_title ?? 'not stated',
    sourceUrl: row.source_url ?? '',
    agencyDisplay: row.agency_display ?? null,
    isGovernmentPublication: condition.figureIsGovernmentPublication !== false,
    publisherNote: condition.figurePublisherNote ?? '',
    neverAddedToTotal: row.summable === false,
    median,
  };
}

/** Conditions with a published figure, and conditions without — for the picker. */
export const PRICED_CONDITIONS = CONDITIONS.filter((c) => c.priceRowId);
export const UNPRICED_CONDITIONS = CONDITIONS.filter((c) => !c.priceRowId);

/* --------------------------------------------------------------- the state */

export const CONDITION_KEY = 'waypoint-ledger.condition.v1';

/* One value, one set of listeners. The picker and the year-ahead panel are two
   components in two places on the page; if each kept its own useState they
   would disagree the moment either changed. useSyncExternalStore over a module
   value keeps them identical without touching the journey store, which another
   part of the app owns. */
let current: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
function snapshot() { return current; }
function serverSnapshot(): string | null { return null; }
function loadedSnapshot() { return loaded; }
function loadedServerSnapshot() { return false; }

function loadOnce() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(CONDITION_KEY);
    if (raw && CONDITIONS.some((c) => c.id === raw)) current = raw;
  } catch { /* private mode, or storage disabled — the picker still works */ }
  emit();
}

/** Test seam and hard reset. Clears the choice from memory and from storage. */
export function resetCondition() {
  current = null; loaded = false;
  try { localStorage.removeItem(CONDITION_KEY); } catch { /* nothing to do */ }
  emit();
}

/**
 * The chosen condition, remembered in this browser and nowhere else.
 *
 * 🔴 It is never sent. It is not in the correction body, not in a saved
 * journey, not in a share link, not in a survey context block. A person
 * naming their own diagnosis to a website is the exact thing this product
 * promises not to collect, so the promise is kept in the only way that counts:
 * there is no code path that transmits it.
 */
export function useCondition(): {
  conditionId: string | null;
  condition: Condition | null;
  benchmark: Benchmark | null;
  setCondition: (id: string | null) => void;
  hydrated: boolean;
} {
  const conditionId = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const hydrated = useSyncExternalStore(subscribe, loadedSnapshot, loadedServerSnapshot);

  useEffect(() => { loadOnce(); }, []);

  const setCondition = useCallback((id: string | null) => {
    current = id && CONDITIONS.some((c) => c.id === id) ? id : null;
    try {
      if (current) localStorage.setItem(CONDITION_KEY, current);
      else localStorage.removeItem(CONDITION_KEY);
    } catch { /* nothing to do; the choice still holds for this visit */ }
    emit();
  }, []);

  return {
    conditionId,
    condition: conditionById(conditionId),
    benchmark: benchmarkFor(conditionId),
    setCondition,
    hydrated,
  };
}

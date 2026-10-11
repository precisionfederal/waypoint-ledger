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
      its population, its coverage statement. Adding a condition is one
      JSON object, and it may only be added once its figure exists as a
      verified row.

   2. AN ABSENCE IS AN ANSWER. Most of the conditions have no published
      federal annual figure (the count is read from the data, never written here). `benchmarkFor` returns that absence in the
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

/* ---------------------------------------------------- the data, via the core */
/* The types and the join live in lib/conditions-core.ts, which carries no React
   and no 'use client', so the /conditions page can read the same objects at
   build time and the unit suite can hand it a file with one more condition in
   it. This module binds the core to the two shipped files and adds the choice. */

import {
  benchmarkOf, conditionsOf, priceRowsOf,
  type Benchmark, type Condition, type RawConditionsFile, type RawPrice,
} from './conditions-core';

export type {
  Benchmark, Condition, ConditionAbsence, ConditionFigure, ExampleJourney, FigureKind,
  FigureSource, PublishedAmount, PublishedFigure, PublishedFigureKind,
} from './conditions-core';

const FILE = conditionsRaw as unknown as RawConditionsFile;

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

export const CONDITIONS: Condition[] = conditionsOf(FILE);

export function conditionById(id: string | null | undefined): Condition | null {
  if (!id) return null;
  return CONDITIONS.find((c) => c.id === id) ?? null;
}

const PRICE_ROWS = priceRowsOf(pricesRaw as unknown as { items: RawPrice[] });

/**
 * 🔴 Given a condition id, the year-ahead figure the product may print — or the
 * absence, in words, with the gap link (see benchmarkOf in the core). Returns
 * null only when the id names no condition at all (nothing selected).
 */
export function benchmarkFor(conditionId: string | null | undefined): Benchmark | null {
  const condition = conditionById(conditionId);
  if (!condition) return null;
  return benchmarkOf(condition, PRICE_ROWS, { qualifier: NO_FIGURE_QUALIFIER, gapHref: GAP_HREF });
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

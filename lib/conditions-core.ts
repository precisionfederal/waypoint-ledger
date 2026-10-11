/* ==========================================================================
   THE CONDITION, AS DATA — the pure half of lib/conditions.ts.

   Everything here is a function of two files: data/conditions.json and
   data/prices.json. There is no React in this module and no 'use client', so
   the same code runs in the browser (the chips and the year-ahead card), at
   build time (the /conditions page), and in the unit suite, where a condition
   that exists only in a test fixture is appended to the file and has to come
   out the other end with no code changed. That test is the claim "adding a
   condition is data" made checkable.

   Two rules, unchanged from the day the conditions became data:

   1. NO YEAR-AHEAD FIGURE LIVES IN conditions.json. `price_row_id` points at a
      row already in data/prices.json, and the card renders whatever that row
      says.
   2. AN ABSENCE IS AN ANSWER. A condition with no row returns the absence in
      words, with a link to /gap.

   One addition (2026-09-30): `published_figures`. A federal agency, or a study
   written by federal scientists, sometimes publishes a figure about a condition
   that is NOT a year for one person: how many people have it, what a reported
   case cost from start to finish, what it costs the country. Each one is
   carried with two sources, the exact sentence from each, and a plain
   statement of what it measures. It is shown apart and is never added to a
   ledger, compared with a ledger's total as if it were the same kind of
   number, or used to price anything. data/verify_conditions.py re-reads every
   quoted sentence in both of its sources.
   ========================================================================== */

/* ------------------------------------------------------------------ types */

export type FigureKind = 'excess' | 'condition_attributed';

/** The kinds of published figure a condition may carry beside its card. */
export type PublishedFigureKind = 'per_case_cost' | 'prevalence' | 'national_cost' | 'incidence';

export interface FigureSource {
  publisher: string;
  title: string;
  url: string;
  /** the sentence or table cell, exactly as the source prints it */
  quote: string;
  readOn: string;
}

export interface PublishedFigure {
  id: string;
  kind: PublishedFigureKind;
  /** the figure as a person reads it, e.g. "about 1 in 100 people" */
  headline: string;
  /** what the number counts, in one plain sentence */
  measures: string;
  population: string;
  year: string;
  isGovernmentPublication: boolean;
  publisherNote: string;
  /** the published mean and median, where the figure is a per-person cost */
  valueUsd: number | null;
  medianUsd: number | null;
  /** the year the dollars are stated in, where it is a cost */
  dollarsYear: number | null;
  /** true for the figure a composed journey is set beside on /conditions */
  compareWithJourney: boolean;
  /** why this figure and a priced journey are not the same number, in plain sentences */
  differsFromJourney: string[];
  sources: FigureSource[];
}

/** A sentence written the way a person talks, run through the same reader and
 *  table as anything typed on the home page. It is ours, never anyone's record. */
export interface ExampleJourney {
  sentence: string;
  /** why the sentence says what it says, and what it is not */
  composedFrom: string;
}

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
  /* R6 sense F5 / data F8: where the estimate is somebody's analysis OF a federal
     survey, the credit and the one sentence that has to sit on the FACE of the
     card. One word ("data") never read as "someone else's estimate". */
  figureAnalysisCredit: string | null;
  figureFaceProvenance: string | null;
  /** the companion row that publishes the out-of-pocket share of the same excess */
  outOfPocketRowId: string | null;
  /** why this row carries no median, where the source publishes none (R6 sense F12) */
  medianBlankReason: string | null;
  note: string | null;
  definitionCaveat: string | null;
  /* A national figure a federal agency publishes about the condition as a whole
     (round 4, ME/CFS: CDC's economic estimate). It is a total for the country,
     never a year for one person: it is printed apart from the absence, with its
     source, and nothing ever adds it, compares it or prices from it. */
  nationalContext: string | null;
  nationalContextSource: string | null;
  nationalContextUrl: string | null;
  /** figures about the condition that are not a year for one person; never summed */
  publishedFigures: PublishedFigure[];
  exampleJourney: ExampleJourney | null;
  /** a chip, or an entry in the 'another condition' list; presentation only */
  picker: 'chip' | 'list';
}

/** A published amount with the interval the source published around it. */
export interface PublishedAmount {
  point: number;
  low: number | null;
  high: number | null;
  /** false where the source itself says the estimate is not distinguishable from zero */
  significant: boolean | null;
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
  /** the ratio of mean to median, computed here so no page writes it in prose */
  meanOverMedian: number | null;
  /** the source's own reason for publishing no median, where it publishes none */
  medianBlankReason: string | null;
  /* R6 data F8: the excess is what was spent on a person's care by every payer.
     Where the same source publishes the split, the card prints it: most of this
     money is an insurer's, and the out-of-pocket share's interval crosses zero. */
  paidByInsurers: PublishedAmount | null;
  outOfPocket: PublishedAmount | null;
  /** the face sentence for a figure that is an analysis OF a federal survey */
  faceProvenance: string | null;
  analysisCredit: string | null;
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

interface RawSource { publisher?: string; title?: string; url?: string; quote?: string; read_on?: string }
interface RawPublishedFigure {
  id: string; kind: string; headline: string; measures: string; population: string; year: string;
  is_government_publication: boolean; publisher_note: string;
  value_usd?: number | null; median_usd?: number | null; dollars_year?: number | null;
  compare_with_journey?: boolean; differs_from_journey?: string[]; sources: RawSource[];
}

export interface RawCondition {
  id: string; label: string; also_called?: string[];
  icd10cm?: string | null; icd10cm_title?: string | null;
  icd10cm_billable?: boolean | null; icd10cm_billable_note?: string | null;
  icd10cm_first_effective?: string | null; icd10cm_source?: string | null;
  icd10cm_blank_reason?: string | null;
  price_row_id?: string | null; figure_kind?: string | null; figure_kind_label?: string | null;
  figure_is_government_publication?: boolean | null; figure_publisher_note?: string | null;
  figure_analysis_credit?: string | null; figure_face_provenance?: string | null;
  out_of_pocket_row_id?: string | null; median_blank_reason?: string | null;
  note?: string | null; definition_caveat?: string | null;
  national_context?: string | null; national_context_source?: string | null; national_context_url?: string | null;
  published_figures?: RawPublishedFigure[];
  example_journey?: { sentence: string; composed_from: string } | null;
  picker?: 'chip' | 'list';
  [k: string]: unknown;
}

export interface RawConditionsFile {
  _version?: string;
  _when_there_is_no_figure?: string;
  _gap_link?: string;
  _the_distinction_that_must_stay_on_the_face?: string;
  _no_code_is_not_an_oversight?: string;
  _icd10cm_source?: { browser_url?: string; verified_on?: string; why_two_years?: string;
                      checked_against?: { fiscal_year: number; in_effect: string }[] };
  conditions: RawCondition[];
  [k: string]: unknown;
}

export interface RawPrice {
  id: string; value_usd: number | null; value_range_usd?: number[]; year: string;
  geography?: string; population?: string; coverage_statement?: string;
  source_title?: string; source_url?: string; agency_display?: string;
  summable?: boolean; alternates?: Record<string, unknown> | null;
}

function toFigure(f: RawPublishedFigure): PublishedFigure {
  return {
    id: f.id,
    kind: f.kind as PublishedFigureKind,
    headline: f.headline,
    measures: f.measures,
    population: f.population,
    year: f.year,
    isGovernmentPublication: f.is_government_publication,
    publisherNote: f.publisher_note,
    valueUsd: typeof f.value_usd === 'number' ? f.value_usd : null,
    medianUsd: typeof f.median_usd === 'number' ? f.median_usd : null,
    dollarsYear: typeof f.dollars_year === 'number' ? f.dollars_year : null,
    compareWithJourney: f.compare_with_journey === true,
    differsFromJourney: f.differs_from_journey ?? [],
    sources: (f.sources ?? []).map((s) => ({
      publisher: s.publisher ?? '', title: s.title ?? '', url: s.url ?? '',
      quote: s.quote ?? '', readOn: s.read_on ?? '',
    })),
  };
}

/** One raw object from conditions.json, as the app reads it. */
export function toCondition(r: RawCondition): Condition {
  return {
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
    figureAnalysisCredit: r.figure_analysis_credit ?? null,
    figureFaceProvenance: r.figure_face_provenance ?? null,
    outOfPocketRowId: r.out_of_pocket_row_id ?? null,
    medianBlankReason: r.median_blank_reason ?? null,
    note: r.note ?? null,
    definitionCaveat: r.definition_caveat ?? null,
    nationalContext: r.national_context ?? null,
    nationalContextSource: r.national_context_source ?? null,
    nationalContextUrl: r.national_context_url ?? null,
    publishedFigures: (r.published_figures ?? []).map(toFigure),
    exampleJourney: r.example_journey
      ? { sentence: r.example_journey.sentence, composedFrom: r.example_journey.composed_from }
      : null,
    picker: r.picker === 'list' ? 'list' : 'chip',
  };
}

/** Every condition in a conditions file, in file order. */
export function conditionsOf(file: RawConditionsFile): Condition[] {
  return file.conditions.map(toCondition);
}

/** The price table's rows by id. */
export function priceRowsOf(prices: { items: RawPrice[] }): Map<string, RawPrice> {
  return new Map(prices.items.map((r) => [r.id, r]));
}

/**
 * 🔴 THE ONE FUNCTION THIS MODULE EXISTS FOR.
 *
 * Given a condition, return the year-ahead figure the product may print — or
 * the absence, in words, with the gap link. Never a guess, never the nearest
 * number: a condition with `price_row_id: null`, or one whose row has gone
 * missing from the price table, returns `kind: 'none'` and says why.
 */
export function benchmarkOf(
  condition: Condition,
  rows: Map<string, RawPrice>,
  opts: { qualifier: string; gapHref: string },
): Benchmark {
  const absence = (reason: string): ConditionAbsence => ({
    kind: 'none', condition, reason, qualifier: opts.qualifier, gapHref: opts.gapHref,
  });

  if (!condition.priceRowId) {
    return absence(condition.note
      ?? `No published federal figure prices a year of ${condition.label.toLowerCase()}.`);
  }

  const row = rows.get(condition.priceRowId);
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

  /* Every number below is read off a row of the price table. Nothing here is
     typed, derived or rounded into existence: a missing alternate renders as
     nothing at all rather than as a guess. */
  const amount = (point: unknown, ci: unknown, significant: boolean | null): PublishedAmount | null => {
    if (typeof point !== 'number') return null;
    const range = Array.isArray(ci) && ci.length === 2
      && typeof ci[0] === 'number' && typeof ci[1] === 'number' ? ci as number[] : null;
    return { point, low: range ? range[0] : null, high: range ? range[1] : null, significant };
  };
  const paidByInsurers = amount(
    row.alternates?.excess_paid_by_insurers_usd, row.alternates?.excess_paid_by_insurers_ci95, null);
  const oopRow = condition.outOfPocketRowId ? rows.get(condition.outOfPocketRowId) : undefined;
  /* The out-of-pocket row's own key says DO_NOT_RENDER_ALONE: the point estimate
     is meaningless without its interval and its p-value, so it is only ever
     handed out as an interval with the significance flag attached. */
  const outOfPocket = oopRow
    ? amount(oopRow.alternates?.point_estimate_usd_DO_NOT_RENDER_ALONE ?? oopRow.value_usd,
             oopRow.alternates?.ci95,
             typeof oopRow.alternates?.statistically_significant === 'boolean'
               ? (oopRow.alternates.statistically_significant as boolean) : null)
    : null;

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
    meanOverMedian: median && median > 0 ? row.value_usd / median : null,
    medianBlankReason: condition.medianBlankReason,
    paidByInsurers,
    outOfPocket,
    faceProvenance: condition.figureFaceProvenance,
    analysisCredit: condition.figureAnalysisCredit,
  };
}

/* ==========================================================================
   THE PUBLIC PRICING API — one pure function, no network, no environment.

   `priceRequest()` is what /api/price runs and what any other program gets
   when it POSTs a story. It is deliberately the SAME code path the browser
   runs: `parseJourney` maps words to a unit of care, `priceJourney` looks that
   unit up in the published table, `totals` adds only what may be added.

   🔴 THE RULE THIS FILE EXISTS TO KEEP: nothing here produces a dollar figure.
   Every number in the response came out of a row of the federal price table
   and carries that row's year, basis, population and source URL back to the
   caller, so a third party reusing this API cannot print a number they cannot
   show. A phrase we cannot map stays unpriced and is returned as unpriced.
   ========================================================================== */

import type { JourneyEntry, PriceItem } from './types';
import { extractCount, mapUtterance, parseJourney } from './mapper';
import { basisWarning, priceJourney, totals } from './pricing';
/* 🔴 The same fit module the browser runs. The API and the screen must answer
   the same question with the same code, or the reuse surface is a smaller
   product than the one we demonstrate. */
import {
  COVERAGE_OPTIONS, LOCALITIES, STATE_NAME, STATES,
  fitOf, localityFigure, localityOf, soleLocality, totalLabels,
} from './fit';
import type { Coverage, Ctx, Fit, FitVerdict } from './fit';

/** The sentence every consumer of this API is handed with the response. */
export const PRICE_METHOD =
  'A deterministic matcher maps words to a unit of care; a published federal table prices it. '
  + 'No model produces a dollar figure.';

export const MAX_STORY = 2000;
export const MAX_ITEMS = 60;
export const MAX_TIMES = 365;

/** Real costs the table deliberately refuses to price (data/unpriceable.json). */
export interface UnpriceableItem {
  id: string; label: string; synonyms: string[]; whyUnpriced: string; whatWouldFixIt: string;
}

export interface ConflictNote { keep: string; drop: string; reason: string }
export interface CombinationReport {
  conflicts: ConflictNote[]; nonSummable: string[]; bundlingRisk: boolean;
}

export interface PriceApiOptions {
  tableVersion?: string;
  /** Phrases that name a real cost with no honest published figure. */
  unpriceable?: UnpriceableItem[];
  /** lib/table.ts `checkCombination` — figures that must not be added together. */
  checkCombination?: (ids: string[]) => CombinationReport;
  /** lib/table.ts `bundlingNote` — visit figures that already contain the labs. */
  bundlingNote?: (ids: string[]) => string | null;
}

/* ==========================================================================
   WHO IS ASKING, AND WHERE THEY LIVE

   A figure only means something to a person once it is told who they are.
   The browser has always asked. Until now the API did not, so an agency that
   took us at our word got a national Medicare number and no warning that the
   `state` it sent was ignored. These types make the caller's context a
   first-class part of the request, and every unknown value an error with a
   sentence rather than a silent default.
   ========================================================================== */

export const COVERAGE_KEYS: Coverage[] = COVERAGE_OPTIONS.map((o) => o.key);

export interface ResolvedLocality {
  /** "IA-00" — the CMS state and locality number, the key of every locality figure. */
  key: string;
  /** The CMS locality name, title-cased: "Iowa", "Rest of Texas", "Manhattan". */
  name: string;
  state: string;
  stateName: string;
  /** The Medicare Administrative Contractor number CMS prices this locality under. */
  mac: string;
  workGpci: number;
  practiceExpenseGpci: number;
  malpracticeGpci: number;
}

export interface ResolvedContext {
  coverage: Coverage | null;
  locality: ResolvedLocality | null;
  /** How the locality was chosen: the caller named it, or it is the state's only one. */
  localityFrom: 'locality' | 'state' | null;
  /** What every schedule figure in this response is, in one sentence. */
  figureBasis: string;
}

/** The low and high of one row across all 109 CMS localities, with the places. */
export interface LocalityRange {
  nationalUsd: number;
  lowUsd: number;
  lowLocalityKey: string;
  lowLocalityName: string;
  highUsd: number;
  highLocalityKey: string;
  highLocalityName: string;
  localityCount: number;
  formula: string;
}

/** The fit verdict for one line, exactly as the ledger prints it. */
export interface SegmentFit {
  verdict: FitVerdict;
  why: string;
  /** The figure that describes THIS caller, or null when none published does. */
  figureUsd: number | null;
  figureNote: string;
  which: Fit['which'];
  /** true when the honest answer is "nothing published describes you here". */
  offerGap: boolean;
  /** figureUsd x times, or null when no figure describes them. */
  lineTotalUsd: number | null;
}

export interface FittedTotals {
  /** 🔴 The sum of the fitted lines that may be added — or NULL when no published
   *  figure describes this caller on any line. Null, never 0: a zero is a price
   *  and would be read as one. Medicaid is the case this exists for. */
  totalUsd: number | null;
  /** Why there is no total, when there is none. */
  suppressedReason: string | null;
  /** Lines where a published figure describes this caller. */
  describedCount: number;
  /** Lines where nothing published describes this caller. These are gaps, not zeroes. */
  notDescribedCount: number;
  /** Which kind of figure fed the total: locality, schedule (national) or charge. */
  figureKindsUsed: Fit['which'][];
  /** The heading the ledger puts over this number, and the smaller one under it. */
  labels: { primary: string; secondary: string | null };
  /** One count per verdict, the same four the ledger shows. */
  verdicts: { verdict: FitVerdict; lines: number }[];
  /** Set when two kinds of figure would have to be added to make this total. */
  basisWarning: string | null;
}

const LOCALITY_KEYS = new Set(LOCALITIES.map((l) => l.key));
const STATE_KEYS = new Set(LOCALITIES.map((l) => l.state));

function resolvedLocality(key: string): ResolvedLocality | null {
  const l = localityOf(key);
  if (!l) return null;
  return {
    key: l.key, name: l.displayName, state: l.state, stateName: STATE_NAME[l.state] ?? l.state,
    mac: l.mac, workGpci: l.pw, practiceExpenseGpci: l.pe, malpracticeGpci: l.mp,
  };
}

/**
 * Read `coverage`, `locality` and `state` off the request. Every unknown value
 * is an error a person can read, never a silent fallback to the national figure.
 */
export function resolveContext(b: Record<string, unknown>): { error: string } | { context: ResolvedContext } {
  let coverage: Coverage | null = null;
  if (b.coverage !== undefined && b.coverage !== null && b.coverage !== '') {
    if (typeof b.coverage !== 'string' || !COVERAGE_KEYS.includes(b.coverage as Coverage)) {
      return { error: `coverage must be one of: ${COVERAGE_KEYS.join(', ')}. Send no coverage at all and every line comes back as a reference price.` };
    }
    coverage = b.coverage as Coverage;
  }

  let locality: ResolvedLocality | null = null;
  let localityFrom: ResolvedContext['localityFrom'] = null;

  if (b.locality !== undefined && b.locality !== null && b.locality !== '') {
    if (typeof b.locality !== 'string') return { error: 'locality must be a string like "IA-00".' };
    const key = b.locality.trim().toUpperCase();
    if (!LOCALITY_KEYS.has(key)) {
      return { error: `No CMS locality has the key "${b.locality}". A key is the two-letter state and the two-digit CMS locality number, like "IA-00" or "TX-31". All 109 are published at /data/locality-prices.json.` };
    }
    locality = resolvedLocality(key);
    localityFrom = 'locality';
  }

  if (b.state !== undefined && b.state !== null && b.state !== '') {
    if (typeof b.state !== 'string') return { error: 'state must be a two-letter postal abbreviation like "IA".' };
    const code = b.state.trim().toUpperCase();
    if (!STATE_KEYS.has(code)) {
      const known = STATE_NAME[code];
      return {
        error: known
          ? `CMS does not publish a physician fee schedule locality for ${known} in this file, so no locality figure exists for it. Send no state and the response carries the national figure.`
          : `"${b.state}" is not a state CMS prices. Send a two-letter postal abbreviation like "IA".`,
      };
    }
    if (locality && locality.state !== code) {
      return { error: `state "${code}" and locality "${locality.key}" name different places. Send one of them.` };
    }
    if (!locality) {
      const sole = soleLocality(code);
      if (!sole) {
        const group = STATES.find((g) => g.code === code);
        const list = (group?.localities ?? []).map((l) => `${l.key} (${l.displayName})`).join(', ');
        return { error: `${STATE_NAME[code] ?? code} has more than one CMS payment locality, so a state is not enough to price a line. Send one of: ${list}.` };
      }
      locality = resolvedLocality(sole.key);
      localityFrom = 'state';
    }
  }

  const figureBasis = locality
    ? `Medicare allowed amounts for ${locality.name} (CMS locality ${locality.key}), CY2026 fee schedule formula`
    : 'United States, national (geographic practice cost indices set to 1.000)';

  return { context: { coverage, locality, localityFrom, figureBasis } };
}

/** What this row costs across every CMS locality. Pure; reads the built table only. */
export function localityRangeFor(item: PriceItem): LocalityRange | null {
  if (item.valueUsd === null) return null;
  let low: { usd: number; key: string; name: string } | null = null;
  let high: { usd: number; key: string; name: string } | null = null;
  let n = 0;
  for (const l of LOCALITIES) {
    const v = localityFigure(item.id, l.key);
    if (v === null) continue;
    n++;
    if (!low || v < low.usd) low = { usd: v, key: l.key, name: l.displayName };
    if (!high || v > high.usd) high = { usd: v, key: l.key, name: l.displayName };
  }
  if (!low || !high || !n) return null;
  return {
    nationalUsd: item.valueUsd,
    lowUsd: low.usd, lowLocalityKey: low.key, lowLocalityName: low.name,
    highUsd: high.usd, highLocalityKey: high.key, highLocalityName: high.name,
    localityCount: n,
    formula: '(work RVU x work GPCI + non-facility PE RVU x PE GPCI + MP RVU x MP GPCI) x 33.4009',
  };
}

export interface PriceSegment {
  raw: string;
  times: number;
  itemId: string;
  label: string;
  /** How the published figure itself is rated: VERIFIED, DERIVED, REPORTED. */
  confidence: string;
  /** The words in the table this phrase matched, and the matcher's score. */
  matchedOn: string | null;
  matchScore: number;
  /** The published figure for ONE unit. Never computed, never adjusted. */
  valueUsd: number;
  outOfPocketUsd: number | null;
  /** valueUsd x times. The only arithmetic in this API. */
  lineTotalUsd: number;
  basis: string;
  attribution: string;
  year: string;
  geography: string;
  population: string;
  /** Who this figure does and does not describe, in plain words. */
  coverage: string;
  sourceTitle: string;
  sourceUrl: string;
  code?: string;
  /** false when this row may not enter an itemized total at all. */
  summable: boolean;
  /** The locality figure for the place the caller named, or null. */
  localityUsd: number | null;
  localityName: string | null;
  /** The published national figure, always, so the two are never confused. */
  nationalUsd: number;
  /** Does this figure describe the caller — the same verdict the ledger prints. */
  fit: SegmentFit;
  /** What this row costs from the cheapest CMS locality to the dearest. */
  localityRange: LocalityRange | null;
}

export interface UnpricedSegment {
  raw: string;
  reason: string;
  kind: 'no-match' | 'known-unpriceable';
  unpriceableId?: string;
  whatWouldFixIt?: string;
  /** The counter care that did not happen belongs in. Counted, never priced. */
  gapCategory?: string | null;
  /** Whole months, when the phrase named a length of time rather than care. */
  months?: number | null;
}

export interface PriceResponse {
  ok: true;
  input: 'story' | 'items';
  segments: PriceSegment[];
  unpriced: UnpricedSegment[];
  totals: {
    totalUsd: number;
    outOfPocketUsd: number;
    outOfPocketReported: boolean;
    pricedCount: number;
    unpricedCount: number;
    basesUsed: string[];
  };
  basisWarning: string | null;
  conflicts: ConflictNote[];
  nonSummable: string[];
  /** Rows returned with their figure but deliberately kept out of the total. */
  excludedFromTotal: { itemId: string; reason: string }[];
  bundlingNote: string | null;
  tableVersion: string;
  method: string;
  /** Who the caller said they are and where they live, as the server read it. */
  context: ResolvedContext;
  /** The figure fitted to that person, line by line, and what it adds to. */
  fitted: FittedTotals;
}

/** A phrase that names a real cost we refuse to price. Same test the app uses. */
export function unpriceableFor(text: string, list: UnpriceableItem[]): UnpriceableItem | undefined {
  const t = text.toLowerCase();
  return list.find((u) => [u.label, ...u.synonyms].some((s) => t.includes(s.toLowerCase().slice(0, 12))));
}

function clampTimes(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_TIMES, n));
}

function segmentOf(entry: JourneyEntry, item: PriceItem, matchedOn: string | null, matchScore: number, summable: boolean, ctx: Ctx): PriceSegment {
  const f = fitOf(item, ctx);
  const localityUsd = ctx.locality ? localityFigure(item.id, ctx.locality) : null;
  const loc = localityOf(ctx.locality);
  return {
    raw: entry.raw,
    times: entry.times,
    itemId: item.id,
    label: item.label,
    confidence: item.confidence,
    matchedOn,
    matchScore,
    valueUsd: item.valueUsd as number,
    outOfPocketUsd: item.outOfPocketUsd,
    lineTotalUsd: +((item.valueUsd as number) * entry.times).toFixed(2),
    basis: item.basis,
    attribution: item.attribution,
    year: item.year,
    geography: item.geography,
    population: item.population,
    coverage: item.coverage,
    sourceTitle: item.sourceTitle,
    sourceUrl: item.sourceUrl,
    ...(item.code ? { code: item.code } : {}),
    summable,
    localityUsd,
    localityName: localityUsd !== null && loc ? loc.displayName : null,
    nationalUsd: item.valueUsd as number,
    fit: {
      verdict: f.verdict, why: f.why, figureUsd: f.figureUsd, figureNote: f.figureNote,
      which: f.which, offerGap: f.offerGap,
      lineTotalUsd: f.figureUsd === null ? null : +(f.figureUsd * entry.times).toFixed(2),
    },
    localityRange: localityRangeFor(item),
  };
}

/** The four verdicts in the order the ledger shows them, so a caller can render the same summary. */
const VERDICT_ORDER: FitVerdict[] = ['DESCRIBES YOU', 'REFERENCE PRICE', 'BILLED AGAINST THIS', 'NOT DESCRIBED'];

/* 🔴 A fitted total may never mix a billed charge with an allowed amount: they
   answer different questions. When both would have to be added, the total is
   still reported (each line is true) and the sentence says what happened. */
const KIND_WORD: Record<Fit['which'], string> = {
  locality: 'Medicare allowed amounts for the locality you named',
  schedule: 'published national fee-schedule amounts',
  charge: 'average submitted charges',
  none: 'nothing',
};

export function fittedTotalsOf(segments: PriceSegment[], ctx: Ctx): FittedTotals {
  const counted = segments.filter((s) => s.summable && s.fit.figureUsd !== null);
  const kinds = [...new Set(counted.map((s) => s.fit.which))];
  const verdicts = VERDICT_ORDER
    .map((v) => ({ verdict: v, lines: segments.filter((s) => s.fit.verdict === v).length }))
    .filter((r) => r.lines > 0);
  /* No line has a figure that describes this person. The honest answer is that
     nothing published describes them — not that their care was free. This keys
     on the FIGURE, never on what may be summed: a row kept out of the total
     because it cannot be added is still a figure that describes someone. */
  const nothingDescribes = segments.length > 0 && segments.every((s) => s.fit.figureUsd === null);
  return {
    totalUsd: nothingDescribes ? null : +counted.reduce((a, s) => a + (s.fit.lineTotalUsd as number), 0).toFixed(2),
    suppressedReason: nothingDescribes
      ? 'No published federal figure describes this person on any line here, so there is no total to report. '
        + 'This is a gap in the published data, not a cost of zero. The lines carry what each figure is and '
        + 'who it does describe, and every one of them can be counted at POST /api/gap.'
      : null,
    describedCount: segments.filter((s) => s.fit.figureUsd !== null).length,
    notDescribedCount: segments.filter((s) => s.fit.figureUsd === null).length,
    figureKindsUsed: kinds,
    labels: totalLabels(ctx),
    verdicts,
    basisWarning: kinds.length > 1
      ? `This total adds ${kinds.map((k) => KIND_WORD[k]).join(' and ')}. Those are different measures of the same care; read the lines, not the sum.`
      : null,
  };
}

/**
 * Price a story or an explicit list of units.
 * Returns `{ error }` for a bad request (the caller sends 400) or `{ result }`.
 */
export function priceRequest(
  body: unknown,
  table: PriceItem[],
  opts: PriceApiOptions = {},
): { error: string } | { result: PriceResponse } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Body must be a JSON object.' };
  const b = body as Record<string, unknown>;
  const hasStory = typeof b.story === 'string';
  const hasItems = Array.isArray(b.items);
  if (!hasStory && !hasItems) return { error: 'Send {"story":"..."} or {"items":[{"itemId":"...","times":1}]}.' };
  if (hasStory && hasItems) return { error: 'Send a story or a list of items, not both.' };

  /* Who is asking, and where. Resolved before a single line is priced, because
     the answer to "what does this cost" is different for each of them. */
  const resolved = resolveContext(b);
  if ('error' in resolved) return { error: resolved.error };
  const context = resolved.context;
  const ctx: Ctx = {
    ...(context.coverage ? { coverage: context.coverage } : {}),
    ...(context.locality ? { locality: context.locality.key } : {}),
  };

  const unpriceableList = opts.unpriceable ?? [];
  const entries: JourneyEntry[] = [];
  const matched: { on: string | null; score: number }[] = [];
  const unpriced: UnpricedSegment[] = [];
  let key = 0;

  if (hasStory) {
    const story = (b.story as string).trim();
    if (!story) return { error: 'The story is empty.' };
    if (story.length > MAX_STORY) return { error: `The story must be ${MAX_STORY} characters or fewer.` };
    for (const seg of parseJourney(story, table)) {
      const un = unpriceableFor(seg.raw, unpriceableList);
      if (un) {
        unpriced.push({ raw: seg.raw, kind: 'known-unpriceable', unpriceableId: un.id, reason: un.whyUnpriced, whatWouldFixIt: un.whatWouldFixIt });
        continue;
      }
      if (!seg.result.item) {
        unpriced.push({ raw: seg.raw, kind: 'no-match', reason: seg.result.reason ?? 'No unit of care in the published table matches this phrase, so it carries no figure. It stays on the journey unpriced rather than being forced onto the nearest row.', gapCategory: seg.result.gapCategory ?? null, months: seg.result.months ?? null });
        continue;
      }
      entries.push({ key: `s${key++}`, raw: seg.raw, item: seg.result.item, times: seg.times });
      matched.push({ on: seg.result.matchedOn, score: seg.result.score });
    }
  } else {
    const items = b.items as unknown[];
    if (!items.length) return { error: 'Send at least one item.' };
    if (items.length > MAX_ITEMS) return { error: `Send ${MAX_ITEMS} items or fewer.` };
    for (const rawItem of items) {
      if (!rawItem || typeof rawItem !== 'object') return { error: 'Each item must be an object like {"itemId":"cms-99213","times":2}.' };
      const it = rawItem as Record<string, unknown>;
      if (it.times !== undefined && !(Number.isInteger(Number(it.times)) && Number(it.times) >= 1 && Number(it.times) <= MAX_TIMES)) {
        return { error: `times must be a whole number from 1 to ${MAX_TIMES}.` };
      }
      const times = clampTimes(it.times ?? 1);
      const said = typeof it.raw === 'string' && it.raw.trim() ? it.raw.trim().slice(0, 200) : '';
      if (typeof it.itemId === 'string' && it.itemId) {
        const item = table.find((t) => t.id === it.itemId);
        if (!item) return { error: `No such unit of care: "${it.itemId}". GET /api/table lists every id.` };
        if (item.valueUsd === null) {
          unpriced.push({ raw: said || item.label, kind: 'no-match', reason: `"${item.label}" is in the table with no published figure, so it stays unpriced.` });
          continue;
        }
        entries.push({ key: `s${key++}`, raw: said || item.label, item, times });
        matched.push({ on: null, score: 100 });
        continue;
      }
      if (!said) return { error: 'Each item needs an itemId, or a raw phrase to map.' };
      const un = unpriceableFor(said, unpriceableList);
      if (un) { unpriced.push({ raw: said, kind: 'known-unpriceable', unpriceableId: un.id, reason: un.whyUnpriced, whatWouldFixIt: un.whatWouldFixIt }); continue; }
      const { text, times: found } = extractCount(said);
      const m = mapUtterance(text || said, table);
      if (!m.item) {
        unpriced.push({ raw: said, kind: 'no-match', reason: 'No unit of care in the published table matches this phrase, so it carries no figure.' });
        continue;
      }
      entries.push({ key: `s${key++}`, raw: said, item: m.item, times: it.times === undefined ? found : times });
      matched.push({ on: m.matchedOn, score: m.score });
    }
  }

  const ids = entries.map((e) => e.item?.id).filter((x): x is string => Boolean(x));
  const combo = opts.checkCombination ? opts.checkCombination(ids) : { conflicts: [], nonSummable: [], bundlingRisk: false };
  const nonSummable = new Set(combo.nonSummable);

  /* 🔴 A figure the table marks non-summable (a whole-year total, for one) is
     returned in full with its source, and kept OUT of the itemized total. Two
     true numbers can still be wrong when added; this is where that bites. */
  const inTotal = entries.filter((e) => !nonSummable.has((e.item as PriceItem).id));
  const lines = priceJourney(inTotal);
  const sum = totals(lines);

  const segments = entries.map((e, i) => segmentOf(e, e.item as PriceItem, matched[i].on, matched[i].score, !nonSummable.has((e.item as PriceItem).id), ctx));
  const excludedFromTotal = segments.filter((s) => !s.summable).map((s) => ({
    itemId: s.itemId,
    reason: 'This figure is published on a basis that cannot be added to per-event lines. It is reported beside the total, never inside it.',
  }));

  return {
    result: {
      ok: true,
      input: hasStory ? 'story' : 'items',
      segments,
      unpriced,
      totals: {
        totalUsd: +sum.totalUsd.toFixed(2),
        outOfPocketUsd: +sum.outOfPocketUsd.toFixed(2),
        outOfPocketReported: sum.outOfPocketReported,
        pricedCount: segments.length,
        unpricedCount: unpriced.length,
        basesUsed: sum.basesUsed,
      },
      basisWarning: basisWarning(sum.basesUsed),
      conflicts: combo.conflicts,
      nonSummable: combo.nonSummable,
      excludedFromTotal,
      bundlingNote: opts.bundlingNote ? opts.bundlingNote(ids) : null,
      tableVersion: opts.tableVersion ?? 'unknown',
      method: PRICE_METHOD,
      context,
      fitted: fittedTotalsOf(segments, ctx),
    },
  };
}

/** Validate a journey to be stored/shared. Same shape the browser saves. */
export interface JourneyEntryInput { raw: string; itemId: string | null; times: number }
export function validateJourney(body: unknown, table: PriceItem[]): { error: string } | { entries: JourneyEntryInput[]; title: string | null } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Body must be a JSON object.' };
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.entries)) return { error: 'Send {"entries":[{"raw":"...","itemId":"cms-99213","times":1}]}.' };
  if (!b.entries.length) return { error: 'A journey needs at least one line.' };
  if (b.entries.length > MAX_ITEMS) return { error: `A journey may hold ${MAX_ITEMS} lines or fewer.` };
  const entries: JourneyEntryInput[] = [];
  for (const raw of b.entries) {
    if (!raw || typeof raw !== 'object') return { error: 'Each entry must be an object.' };
    const e = raw as Record<string, unknown>;
    const said = typeof e.raw === 'string' ? e.raw.trim().slice(0, 200) : '';
    let itemId: string | null = null;
    if (e.itemId !== null && e.itemId !== undefined && e.itemId !== '') {
      if (typeof e.itemId !== 'string' || !table.some((t) => t.id === e.itemId)) return { error: `No such unit of care: "${String(e.itemId)}". GET /api/table lists every id.` };
      itemId = e.itemId;
    }
    if (!itemId && !said) return { error: 'Each entry needs an itemId or the words the person typed.' };
    const n = Number(e.times ?? 1);
    if (!Number.isInteger(n) || n < 1 || n > 99) return { error: 'times must be a whole number from 1 to 99.' };
    entries.push({ raw: said, itemId, times: n });
  }
  const title = typeof b.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 120) : null;
  return { entries, title };
}

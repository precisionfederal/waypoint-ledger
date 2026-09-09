/* ==========================================================================
   HL7 FHIR R4 EXPORT — a ledger, in the standard the rest of health IT reads.

   🔴 WHAT THIS FILE IS ALLOWED TO DO.
   It re-expresses lines that already exist. It never prices anything, never
   converts, never fills a blank and never invents a code system URI. Every
   dollar in the bundle is the figure lib/pricing.ts already put on the line,
   and every code is the string the row itself carries in `code`.

   THE THREE THINGS A REVIEWER SHOULD CHECK, and where they are:
   1. The figure and its arithmetic — ChargeItem.priceOverride, with the
      multiplication written out in ChargeItem.overrideReason.
   2. The federal file behind it — ChargeItem.definitionUri (the URL directly)
      and a Provenance whose entity points at a DocumentReference holding the
      same URL. definitionUri is FHIR's own slot for "the external source of
      pricing information for this code", which is exactly what we have.
   3. That nobody is identified — there is no Patient resource, no `identifier`
      element anywhere, and no date. Encounter.subject, Procedure.subject and
      ChargeItem.subject are display-only references, which FHIR allows and
      which say in words that no identity was recorded.

   WHAT IS DELIBERATELY LEFT OUT, and why (each of these is a place where it
   would have been easy to look more complete and be less true):
   - No Patient, no identifier, no birth date, no dates of service. The tool
     never asked for them, so asserting them would be fabrication.
   - No APC coding. CMS publishes an Ambulatory Payment Classification for two
     of our rows, and FHIR publishes no canonical system URI for APC. Inventing
     one would make a machine-readable claim we cannot stand behind, so the APC
     is returned in `codes[]` beside the bundle and stays out of it.
   - No second Procedure for a repeat. Where somebody said a test happened three
     times, the bundle carries one Procedure and a ChargeItem whose quantity is
     three. Three dated Procedures would be three assertions we were never told.
   - ChargeItem.status is `unknown` on every line, and that is the honest code:
     nobody here knows whether this care was billed, paid, denied or written
     off. The figure is a published federal reference price, not a bill.
   - Wage, mileage, deductible and whole-year survey rows are not care that a
     provider delivered, so they are not ChargeItems. They come back in
     `omitted[]` with the reason, rather than being dressed as clinical charges.

   Validated in tests/fhir.test.ts against the official R4 JSON schema
   (hl7.org/fhir/R4/fhir.schema.json.zip, cached under tests/fixtures).
   ========================================================================== */

import { categoryKey } from './categories';
import type { JourneyEntry, PriceItem } from './types';

/* --------------------------------------------------------------------------
   THE CODE SYSTEM URIs. Each was read at its publisher, not remembered:
   - CPT ....... HL7 FHIR R4 §4.4 "Using Code Systems", external code systems
                 table: http://hl7.org/fhir/R4/terminologies-systems.html
   - HCPCS ..... the code system US Core composes into us-core-procedure-code:
                 http://hl7.org/fhir/us/core/ValueSet-us-core-procedure-code.html
   - v3-ActCode  the system behind Encounter.class (ActEncounterCode value set)
   - provenance-participant-type  the system behind Provenance.agent.type
   A code system URI we could not verify at its publisher is not written here.
   -------------------------------------------------------------------------- */
export const FHIR_VERSION = '4.0.1';
export const CPT_SYSTEM = 'http://www.ama-assn.org/go/cpt';
export const HCPCS_SYSTEM = 'http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets';
export const ACT_CODE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';
export const PROVENANCE_AGENT_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/provenance-participant-type';

/** Our own namespace, for the one tag that is ours: which price table built it. */
export const WAYPOINT_BASE = 'https://waypoint-ledger.pages.dev';
export const TABLE_VERSION_SYSTEM = `${WAYPOINT_BASE}/fhir/CodeSystem/price-table-version`;

/* The sentence the site itself offers as an example, on the landing page and in
   the journey builder. GET /api/fhir/example prices this one, so the bundle a
   developer meets first is the same journey the product demonstrates. */
export const EXAMPLE_STORY =
  'saw my regular doctor three times, then a cardiologist, an echo and a Holter, then the ER once when my heart was racing';

/** Every subject reference in the bundle. It is a display, never a pointer. */
export const SUBJECT_DISPLAY = 'A person using Waypoint Ledger. No identity is recorded.';
export const AUTHOR_DISPLAY = 'Waypoint Ledger, Precision Federal';

/* ---------- the shapes we emit (only the elements we actually set) ---------- */
export interface FhirCoding { system?: string; code?: string; display?: string }
export interface FhirCodeableConcept { coding?: FhirCoding[]; text?: string }
export interface FhirReference { reference?: string; display?: string }
export interface FhirMoney { value: number; currency: string }
export interface FhirResource { resourceType: string; id: string; [key: string]: unknown }
export interface FhirBundleEntry { fullUrl: string; resource: FhirResource }
export interface FhirBundle {
  resourceType: 'Bundle';
  meta?: { source?: string; tag?: FhirCoding[] };
  type: 'collection';
  timestamp: string;
  entry: FhirBundleEntry[];
}

/* ---------- what the caller hands in, and what comes back ---------- */

/** Either a resolved ledger line (the browser's shape) or a raw one (the API's). */
export type FhirEntryInput =
  | JourneyEntry
  | { key?: string; raw: string; itemId: string | null; times: number };

/** A published federal file, named so a reader can open it. */
export interface FhirSource { url: string; title: string }

/** The figure the SCREEN is showing for this line, so the export never disagrees
 *  with it. `usd: null` means nothing published describes this person here, and
 *  the line keeps its clinical resource and gets no ChargeItem. Return
 *  `undefined` (or leave the hook off) to use the row's own national figure.
 *
 *  🔴 `source` decides what the ChargeItem claims about where the figure came
 *  from, and it is the one field here that can make the bundle lie:
 *  - omitted   -> the row's own source file. Right for the fee-schedule figure
 *                 and for the CMS locality figure, because both are computed
 *                 from the same release the row already cites.
 *  - null      -> we do not hold the file for this figure. The ChargeItem then
 *                 carries NO definitionUri and is NOT claimed by the row's
 *                 Provenance. This is the honest answer for the CY2024 average
 *                 submitted charge, which the table records as an alternate
 *                 figure without a file of its own.
 *  - a source  -> that file, cited on the line and given its own Provenance. */
export type FigureFor = (entry: JourneyEntry) =>
  | { usd: number | null; note?: string; source?: FhirSource | null }
  | undefined;

export interface FhirBundleOptions {
  /** Stamped as a tag so a reader can rebuild every figure from the same table. */
  tableVersion?: string;
  figureFor?: FigureFor;
  /** Injected in tests so the bundle is byte-for-byte reproducible. */
  now?: () => string;
  uuid?: () => string;
}

export interface FhirOmission { raw: string; itemId: string | null; reason: string }

/** The APC and anything else CMS publishes that FHIR has no system URI for.
 *  It rides beside the bundle so it is never lost and never faked inside it. */
export interface FhirCodeNote { itemId: string; code: string; apc: string | null }

export interface FhirExport {
  bundle: FhirBundle;
  omitted: FhirOmission[];
  codes: FhirCodeNote[];
  counts: {
    lines: number;
    encounters: number;
    procedures: number;
    chargeItems: number;
    sources: number;
    /** care that happened and that no published federal figure prices */
    clinicalLinesWithNoFigure: number;
    /** charges whose figure is published but whose file this table does not hold,
     *  so the line cites none rather than citing the wrong one */
    chargeItemsWithoutASourceFile: number;
  };
}

/* ---------- the row's `code` string, read rather than guessed ---------- */
export interface ParsedCode {
  system: string;
  /** 'CPT' or 'HCPCS', as the row wrote it */
  systemName: 'CPT' | 'HCPCS';
  code: string;
  /** CMS Ambulatory Payment Classification, when the row names one. Never emitted. */
  apc: string | null;
}

const CODE_RE = /^(CPT|HCPCS)\s+([A-Za-z0-9]{4,7})\b/;
const APC_RE = /\(APC\s+([0-9]{3,5})\)/;

/** "HCPCS G0463 (APC 5012)" -> system, G0463, apc 5012. Unreadable -> null. */
export function parseCode(code?: string | null): ParsedCode | null {
  if (!code) return null;
  const m = CODE_RE.exec(code.trim());
  if (!m) return null;
  const systemName = m[1].toUpperCase() as 'CPT' | 'HCPCS';
  const apc = APC_RE.exec(code);
  return {
    system: systemName === 'CPT' ? CPT_SYSTEM : HCPCS_SYSTEM,
    systemName,
    code: m[2].toUpperCase(),
    apc: apc ? apc[1] : null,
  };
}

/* ---------- which resource a line becomes ---------- */

/** Categories that are an encounter with a clinician. */
const ENCOUNTER_CATEGORIES = new Set(['visit', 'er']);
/** Categories that are a thing done to or for the person. */
const PROCEDURE_CATEGORIES = new Set(['lab', 'img', 'test', 'proc', 'mh']);

/** Why a line is not clinical care, written for the person who reads the report. */
const NOT_CLINICAL: Record<string, string> = {
  time: 'Lost earnings and caregiving time are valued at published wages. No provider delivered them, so they are not a charge and are left out of the bundle.',
  survey: 'This is a whole-encounter or whole-year survey average, not one service a provider delivered. It would double-count against the itemised lines, so it is left out of the bundle.',
  other: 'This row is a published rate or threshold rather than a unit of care a provider delivered, so it is left out of the bundle.',
};

export type FhirLineKind = 'Encounter' | 'Procedure' | 'none';

export function lineKindFor(item: PriceItem): FhirLineKind {
  const k = categoryKey(item);
  if (ENCOUNTER_CATEGORIES.has(k)) return 'Encounter';
  if (PROCEDURE_CATEGORIES.has(k)) return 'Procedure';
  return 'none';
}

/* ---------- helpers ---------- */

const round2 = (n: number): number => Math.round(n * 100) / 100;

function defaultUuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The agency exactly as the row prints it, never a guess from the id. */
const agencyDisplayOf = (item: PriceItem): string =>
  item.agencyDisplay || item.agency || item.sourceTitle || 'Source named on the line';

function resolve(e: FhirEntryInput, table: readonly PriceItem[]): JourneyEntry {
  if ('item' in e) return e;
  const item = e.itemId ? table.find((t) => t.id === e.itemId) ?? null : null;
  return { key: e.key ?? e.itemId ?? e.raw, raw: e.raw, item, times: e.times };
}

/** The sentence under every figure: the arithmetic, then what the figure is. */
function overrideReason(item: PriceItem, unit: number, times: number, figureNote: string): string {
  const money = (n: number) => `$${round2(n).toFixed(2)}`;
  const arithmetic = times === 1
    ? `${money(unit)}.`
    : `${times} x ${money(unit)} = ${money(unit * times)}.`;
  const note = figureNote
    || `${item.sourceTitle}, ${item.year}. Basis: ${item.basis}. Describes: ${item.population}.`;
  const what = /[.!?]$/.test(note.trim()) ? note.trim() : `${note.trim()}.`;
  return `${arithmetic} ${what} This is a published federal reference figure, not a bill: `
       + 'nobody here knows what this person was charged, what was paid, or what was denied.';
}

/* ==========================================================================
   THE EXPORT
   ========================================================================== */

export function toFhirBundle(
  entriesIn: readonly FhirEntryInput[],
  table: readonly PriceItem[],
  opts: FhirBundleOptions = {},
): FhirExport {
  const uuid = opts.uuid ?? defaultUuid;
  const nowIso = (opts.now ?? (() => new Date().toISOString()))();

  const entries = entriesIn.map((e) => resolve(e, table));
  const bundleEntries: FhirBundleEntry[] = [];
  const omitted: FhirOmission[] = [];
  const codes: FhirCodeNote[] = [];
  /** source URL -> the ChargeItem urns priced from it, and how to describe it */
  const bySource = new Map<string, { source: FhirSource; agency: string; targets: string[] }>();

  let encounters = 0;
  let procedures = 0;
  let chargeItems = 0;
  let clinicalLinesWithNoFigure = 0;
  let chargeItemsWithoutASourceFile = 0;

  const push = (resource: FhirResource): string => {
    const urn = `urn:uuid:${resource.id}`;
    bundleEntries.push({ fullUrl: urn, resource });
    return urn;
  };

  for (const entry of entries) {
    const item = entry.item;
    if (!item) {
      omitted.push({
        raw: entry.raw,
        itemId: null,
        reason: 'No unit of care in the published table matches these words, so there is no code and no figure to carry. It stays on the ledger, unpriced.',
      });
      continue;
    }

    const kind = lineKindFor(item);
    if (kind === 'none') {
      omitted.push({
        raw: entry.raw || item.label,
        itemId: item.id,
        reason: NOT_CLINICAL[categoryKey(item)] ?? NOT_CLINICAL.other,
      });
      continue;
    }

    const parsed = parseCode(item.code);
    if (item.code) codes.push({ itemId: item.id, code: item.code, apc: parsed?.apc ?? null });

    const concept: FhirCodeableConcept = {
      ...(parsed ? { coding: [{ system: parsed.system, code: parsed.code, display: item.label }] } : {}),
      text: item.label,
    };
    const subject: FhirReference = { display: SUBJECT_DISPLAY };
    /* The person's own words ride with the line. They are the whole point of the
       tool: the export a clinician reads should say what the person said. */
    const note = entry.raw ? [{ text: `The person described this as: "${entry.raw}"` }] : undefined;

    let clinicalUrn: string;
    if (kind === 'Encounter') {
      const emergency = categoryKey(item) === 'er';
      clinicalUrn = push({
        resourceType: 'Encounter',
        id: uuid(),
        status: 'finished',
        class: {
          system: ACT_CODE_SYSTEM,
          code: emergency ? 'EMER' : 'AMB',
          display: emergency ? 'emergency' : 'ambulatory',
        },
        type: [concept],
        subject,
      });
      encounters += 1;
    } else {
      clinicalUrn = push({
        resourceType: 'Procedure',
        id: uuid(),
        status: 'completed',
        code: concept,
        subject,
        ...(note ? { note } : {}),
      });
      procedures += 1;
    }

    /* ---- the money, or an honest blank ---- */
    const override = opts.figureFor ? opts.figureFor(entry) : undefined;
    const unit = override === undefined ? item.valueUsd : override.usd;
    if (unit === null) {
      clinicalLinesWithNoFigure += 1;
      continue;
    }

    /* 🔴 The file cited on the line is the file the FIGURE came from, never the
       file the row came from. When a caller hands in a different published
       figure and does not name its file, the line cites nothing. */
    const source: FhirSource | null = override && override.source !== undefined
      ? override.source
      : (item.sourceUrl ? { url: item.sourceUrl, title: item.sourceTitle } : null);

    const times = Math.max(1, Math.min(365, Math.floor(entry.times) || 1));
    const chargeUrn = push({
      resourceType: 'ChargeItem',
      id: uuid(),
      status: 'unknown',
      code: concept,
      subject,
      ...(kind === 'Encounter' ? { context: { reference: clinicalUrn } } : { service: [{ reference: clinicalUrn }] }),
      quantity: { value: times },
      priceOverride: { value: round2(unit * times), currency: 'USD' } as FhirMoney,
      overrideReason: overrideReason(item, unit, times, override?.note ?? ''),
      ...(source ? { definitionUri: [source.url] } : {}),
      ...(kind === 'Encounter' && note ? { note } : {}),
    });
    chargeItems += 1;

    if (!source) { chargeItemsWithoutASourceFile += 1; continue; }
    const bucket = bySource.get(source.url);
    if (bucket) bucket.targets.push(chargeUrn);
    else bySource.set(source.url, { source, agency: agencyDisplayOf(item), targets: [chargeUrn] });
  }

  /* ---- one DocumentReference + one Provenance per federal file ---- */
  for (const [, { source, agency, targets }] of bySource) {
    const docUrn = push({
      resourceType: 'DocumentReference',
      id: uuid(),
      status: 'current',
      type: { text: 'Published U.S. federal price file' },
      author: [{ display: agency }],
      content: [{ attachment: { url: source.url, title: source.title } }],
    });
    push({
      resourceType: 'Provenance',
      id: uuid(),
      target: targets.map((reference) => ({ reference })),
      recorded: nowIso,
      agent: [
        {
          type: { coding: [{ system: PROVENANCE_AGENT_TYPE_SYSTEM, code: 'author', display: 'Author' }] },
          who: { display: AUTHOR_DISPLAY },
        },
        {
          type: { coding: [{ system: PROVENANCE_AGENT_TYPE_SYSTEM, code: 'custodian', display: 'Custodian' }] },
          who: { display: agency },
        },
      ],
      entity: [{ role: 'source', what: { reference: docUrn, display: source.title } }],
    });
  }

  const bundle: FhirBundle = {
    resourceType: 'Bundle',
    ...(opts.tableVersion
      ? {
        meta: {
          source: `${WAYPOINT_BASE}/api/table`,
          tag: [{ system: TABLE_VERSION_SYSTEM, code: opts.tableVersion, display: 'The price table this bundle was built from' }],
        },
      }
      : {}),
    type: 'collection',
    timestamp: nowIso,
    entry: bundleEntries,
  };

  return {
    bundle,
    omitted,
    codes,
    counts: {
      lines: entries.length,
      encounters,
      procedures,
      chargeItems,
      sources: bySource.size,
      clinicalLinesWithNoFigure,
      chargeItemsWithoutASourceFile,
    },
  };
}

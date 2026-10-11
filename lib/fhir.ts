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
   - No APC *code system URI*. CMS publishes an Ambulatory Payment Classification
     for two of our rows, and FHIR publishes no canonical system URI for APC.
     Inventing one would make a machine-readable claim we cannot stand behind, so
     the APC is returned in `codes[]` beside the bundle and, on the line whose
     figure CONTAINS an APC payment, in the first sentence of overrideReason,
     which says the figure is two published rates added and names the APC (R6
     finding F10: a machine consumer read $544.54 as a professional fee for CPT
     99284, 4.6x the real PFS figure). Until 2026-10-01 the APC also rode in an
     extension of ours; the HL7 validator reports any extension it cannot load
     from a package as an error, whatever its URL serves (R3-fedexpert FX-11,
     re-run 2026-10-01: the definition served at its URL was never fetched), so
     the extension is gone and the bundle validates with 0 errors.
   - LOINC IS carried where the row has one. http://loinc.org is a canonical,
     published system URI, and 36 of our lab rows hold an NLM-confirmed code; a
     bundle that dropped them was dropping exactly what a health-IT reader needs
     (R6 finding F10, R5 finding #10).
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
import { paidArithmetic, paidFieldsIn, paidLineTotal } from './paid';

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
/** LOINC's own canonical system URI, as HL7 publishes it in the R4 systems table. */
export const LOINC_SYSTEM = 'http://loinc.org';

/** Our own namespace, for the one tag that is ours: which price table built it. */
export const WAYPOINT_BASE = 'https://waypointledger.org';
export const TABLE_VERSION_SYSTEM = `${WAYPOINT_BASE}/fhir/CodeSystem/price-table-version`;
/** Ours, and declared as ours: the CMS payment classification a figure contains. Retired from bundles 2026-10-01; the definition is still served for bundles built before. */
export const APC_EXTENSION_URL = `${WAYPOINT_BASE}/fhir/StructureDefinition/cms-apc`;
/* --------------------------------------------------------------------------
   THE TWO URLS OF OUR OWN RESOLVE (R3-fedexpert FX-11, 2026-10-01).

   The HL7 validator reported one error on every bundle with an ER line: the
   APC extension URL named a definition nobody could fetch (404). Bundles no
   longer carry that extension (see the header), but bundles already downloaded
   do, and a canonical URL of ours has to answer with the definition it names,
   so both are served, as FHIR JSON, from these objects by cf/functions/fhir/**:
     ${WAYPOINT_BASE}/fhir/StructureDefinition/cms-apc
     ${WAYPOINT_BASE}/fhir/CodeSystem/price-table-version
   Each says exactly what we put in the bundle and no more.
   -------------------------------------------------------------------------- */
export const FHIR_DEFINITIONS_DATE = '2026-10-01';

/** The StructureDefinition of the one extension the bundle carries. */
export const APC_EXTENSION_DEFINITION = {
  resourceType: 'StructureDefinition',
  id: 'cms-apc',
  url: APC_EXTENSION_URL,
  version: FHIR_DEFINITIONS_DATE,
  name: 'CmsApc',
  title: 'CMS Ambulatory Payment Classification contained in a figure',
  status: 'retired',
  experimental: false,
  date: FHIR_DEFINITIONS_DATE,
  publisher: 'Precision Federal (Waypoint Ledger)',
  description:
    'Retired 2026-10-01: bundles built from that day carry the APC only in ChargeItem.overrideReason and in the '
    + 'envelope codes[] of POST /api/fhir?envelope=1. Published so that bundles built before then still resolve. '
    + 'Waypoint Ledger put this on a ChargeItem only where the published figure is two CMS rates added: a hospital '
    + 'outpatient (OPPS) payment for an Ambulatory Payment Classification plus the physician fee for the CPT or HCPCS '
    + 'code in ChargeItem.code. The value is the APC as text, for example "APC 5024". FHIR publishes no code system '
    + 'URI for APC, so it is carried here as a string rather than as a coding. The first sentence of '
    + 'ChargeItem.overrideReason states the same addition in words.',
  fhirVersion: FHIR_VERSION,
  kind: 'complex-type',
  abstract: false,
  context: [{ type: 'element', expression: 'ChargeItem' }],
  type: 'Extension',
  baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Extension',
  derivation: 'constraint',
  differential: {
    element: [
      { id: 'Extension', path: 'Extension', short: 'The CMS APC a composed figure contains', definition: 'The CMS Ambulatory Payment Classification whose OPPS payment is one of the two published rates added to make this figure.', min: 0, max: '1' },
      { id: 'Extension.extension', path: 'Extension.extension', max: '0' },
      { id: 'Extension.url', path: 'Extension.url', fixedUri: APC_EXTENSION_URL },
      { id: 'Extension.value[x]', path: 'Extension.value[x]', short: '"APC " followed by the APC number', definition: 'The APC as CMS publishes it in OPPS Addendum B, prefixed with "APC ".', min: 1, type: [{ code: 'string' }] },
    ],
  },
} as const;

/** The CodeSystem behind Bundle.meta.tag: which price table built the bundle. */
export const TABLE_VERSION_CODESYSTEM = {
  resourceType: 'CodeSystem',
  id: 'price-table-version',
  url: TABLE_VERSION_SYSTEM,
  version: FHIR_DEFINITIONS_DATE,
  name: 'WaypointPriceTableVersion',
  title: 'Waypoint Ledger price table version',
  status: 'active',
  experimental: false,
  date: FHIR_DEFINITIONS_DATE,
  publisher: 'Precision Federal (Waypoint Ledger)',
  description:
    'The version of the Waypoint Ledger price table a bundle was built from, in the form YYYY-MM-DD.N (for example '
    + '2026-09-09.1). Each version is a published table of federal figures, served at /api/table with its own '
    + 'version, and every figure in it cites the federal file it was read from. Codes are not enumerated here: '
    + 'the code is the version string itself.',
  caseSensitive: true,
  content: 'not-present',
} as const;

/** Ours: a burden a person carried that no published federal file prices. */
export const BURDEN_CODE_TEXT = 'Burden with no published federal figure';
/** The Observation that carries what the person says they paid (patient-reported, never a charge). */
export const PAID_CODE_TEXT = 'Amount the person says they paid for this care (patient-reported)';
export const PAID_PERFORMER_DISPLAY = 'The person this ledger belongs to, reporting for themselves. No identity is recorded.';

/* The sentence the journey builder (/journey) offers as its example: the
   placeholder in its empty box and the text its Use an example link fills in
   (components/JourneyBuilder.tsx EXAMPLE, pinned equal in tests/fhir.test.ts).
   The home page's box is different since JUDGE-3 #14: it shows three lines of
   the full example ledger (app/page.tsx EXAMPLE and PREVIEW). GET
   /api/fhir/example prices this sentence, so the bundle a developer meets first
   is a journey the product itself offers. */
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
  | { key?: string; raw: string; itemId: string | null; times: number;
      months?: number | null; gapCategory?: string | null; paid?: number | null; paidEach?: boolean | null };

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
    /** burden lines carried as Observations — care and time no claims file records */
    burdenObservations: number;
    /** what the person said they paid, one patient-reported Observation per line that carries it */
    paidObservations: number;
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
  return { key: e.key ?? e.itemId ?? e.raw, raw: e.raw, item, times: e.times,
           months: e.months ?? null, gapCategory: e.gapCategory ?? null, ...paidFieldsIn(e) };
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
  let burdenObservations = 0;
  let paidObservations = 0;

  const push = (resource: FhirResource): string => {
    const urn = `urn:uuid:${resource.id}`;
    bundleEntries.push({ fullUrl: urn, resource });
    return urn;
  };

  /* 🔴 WHAT THE PERSON PAID RIDES AS THEIR OWN REPORT, NEVER AS A CHARGE (round 5).
     One Observation per line that carries an amount: the performer is the person
     (a display-only reference, like every subject here), the value is dollars in
     ISO 4217, `focus` points at the line's own resource, and the note says it is
     self-reported, unchecked and added to nothing. No ChargeItem is touched. */
  const pushPaid = (entry: JourneyEntry, focusUrn: string | null, what: string) => {
    const total = paidLineTotal(entry);
    if (total === null) return;
    const math = paidArithmetic(entry, (n) => `$${round2(n).toFixed(2)}`);
    push({
      resourceType: 'Observation',
      id: uuid(),
      status: 'final',
      code: { text: PAID_CODE_TEXT },
      subject: { display: SUBJECT_DISPLAY },
      performer: [{ display: PAID_PERFORMER_DISPLAY }],
      ...(focusUrn ? { focus: [{ reference: focusUrn }] } : {}),
      valueQuantity: { value: round2(total), unit: 'USD', system: 'urn:iso:std:iso:4217', code: 'USD' },
      note: [{
        text: `Reported by the person for "${what}"${math ? ` (${math})` : ''}. `
            + 'Typed on their own device; not a published federal figure, not checked by anyone, and not added to any ChargeItem or total.',
      }],
    });
    paidObservations += 1;
  };

  for (const entry of entries) {
    const item = entry.item;
    if (!item) {
      /* 🔴 R6 / edge finding #7. The ledger's own banner over these lines reads
         "The burden no claims file records" — and the export a health-IT person
         opened recorded exactly as much of it as a claims file does: nothing.
         "waited 8 months" left with no months in it. An Observation is the R4
         resource for a measured thing with no charge attached, so the wait, the
         trips and the lost days ride out of here as data, with the person's own
         words, and never as money. */
      const quantity = typeof entry.months === 'number' && entry.months > 0
        ? { value: entry.months, unit: 'months' }
        : (entry.times > 1 ? { value: Math.floor(entry.times), unit: 'times' } : null);
      const burdenUrn = push({
        resourceType: 'Observation',
        id: uuid(),
        status: 'final',
        code: { text: BURDEN_CODE_TEXT },
        subject: { display: SUBJECT_DISPLAY },
        ...(quantity ? { valueQuantity: quantity } : {}),
        note: [{
          text: `The person described this as: "${entry.raw}".`
              + (entry.gapCategory ? ` Category: ${entry.gapCategory}.` : '')
              + ' No published U.S. federal file prices this.',
        }],
      });
      burdenObservations += 1;
      pushPaid(entry, burdenUrn, entry.raw);
      omitted.push({
        raw: entry.raw,
        itemId: null,
        reason: 'No unit of care in the published table matches these words, so there is no code and no figure to carry. It stays on the ledger, unpriced, and rides out in the bundle as an Observation with what the person said and how much of it there was.',
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
      pushPaid(entry, null, entry.raw || item.label);
      continue;
    }

    const parsed = parseCode(item.code);
    if (item.code) codes.push({ itemId: item.id, code: item.code, apc: parsed?.apc ?? null });

    /* CPT/HCPCS first, then LOINC where the row carries one. Both are canonical
       published system URIs; nothing here is invented. */
    const coding: FhirCoding[] = [];
    if (parsed) coding.push({ system: parsed.system, code: parsed.code, display: item.label });
    if (item.loinc) {
      coding.push({ system: LOINC_SYSTEM, code: item.loinc, display: item.loincName || item.label });
    }
    const concept: FhirCodeableConcept = {
      ...(coding.length ? { coding } : {}),
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
    pushPaid(entry, clinicalUrn, entry.raw || item.label);

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
    /* 🔴 R6 F10. Where this row's figure IS two published rates added — a hospital
       APC payment plus the physician's fee — the bundle says so in its first
       sentence and names the APC there (and in the envelope's codes[]). Without it
       a machine reads $544.54 as a professional fee for CPT 99284, which is 4.6x the
       truth. */
    const hosp = item.componentHospitalFeeUsd;
    const phys = item.componentPhysicianFeeUsd;
    const composed = hosp !== undefined && phys !== undefined && item.valueUsd !== null
      && Math.abs(hosp + phys - item.valueUsd) < 0.005 && Math.abs(unit - item.valueUsd) < 0.005;
    const composition = composed
      ? `$${round2(unit).toFixed(2)} = $${round2(hosp!).toFixed(2)} hospital facility fee`
        + `${parsed?.apc ? ` (OPPS APC ${parsed.apc})` : ''} + $${round2(phys!).toFixed(2)} `
        + `${categoryKey(item) === 'er' ? 'emergency physician' : 'physician'} fee`
        + `${parsed ? ` (${parsed.systemName} ${parsed.code})` : ''}. `
        + 'Two published rates, added; the addition is ours. '
      : '';
    const chargeUrn = push({
      resourceType: 'ChargeItem',
      id: uuid(),
      status: 'unknown',
      code: concept,
      subject,
      ...(kind === 'Encounter' ? { context: { reference: clinicalUrn } } : { service: [{ reference: clinicalUrn }] }),
      quantity: { value: times },
      priceOverride: { value: round2(unit * times), currency: 'USD' } as FhirMoney,
      overrideReason: composition + overrideReason(item, unit, times, override?.note ?? ''),
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
      burdenObservations,
      paidObservations,
    },
  };
}

/* ==========================================================================
   MEDICARE CLAIMS → THE LEDGER.  Pure functions, no network, no state.

   A person on Medicare should never have to retype a diagnostic odyssey they
   already lived. CMS already holds the record: every claim Medicare processed
   for them, as FHIR R4 ExplanationOfBenefit resources, released to the person
   themselves through the Blue Button 2.0 API. This module turns that record
   into ledger lines.

   🔴 THE LINE THIS MODULE DOES NOT CROSS — it reads CARE, never MONEY.

   An ExplanationOfBenefit carries dollar amounts. This module deliberately
   drops every one of them, and that is the whole point:

     1. The app's one claim is that every dollar on screen is a row of a
        published federal table with its year, basis, population and source
        URL (data/prices.json). A claim amount has none of those. Putting it
        on the same screen as a table figure, in the same column, would blur
        the exact provenance line the product exists to hold.
     2. The amounts are genuinely ambiguous. A single institutional line in
        the CMS sample carries TWO adjudication entries both categorised
        `submitted` — one the revenue-centre rate, one the revenue-centre
        total charge. Choosing between them is an editorial act with no source
        behind it, so this module refuses to choose.

   So: Medicare tells us WHAT CARE HAPPENED and WHEN. The federal price table
   says what that unit of care is published at. The two never merge, and a
   reader can always see which is which.

   🔴 AND IT NEVER GUESSES A NAME. A line's description is the `display` the
   payload itself carried, or nothing. There is no free federal descriptor
   file that covers both CPT and HCPCS Level II, so an unmatched code is shown
   as the bare code with the plain sentence that CMS sent no description. A
   made-up label on a medical code is worse than no label.

   Fixture and provenance: data/test-fixtures/bluebutton/ (one verbatim search
   Bundle out of the API's own published OpenAPI specification, synthetic
   beneficiary data, with its SHA-256 pinned by tests/bluebutton.test.ts).
   ========================================================================== */

import type { JourneyEntry, PriceItem } from './types';

/* --------------------------------------------------------------------------
   The sandbox, verified live on 2026-09-09 against
   https://sandbox.bluebutton.cms.gov/.well-known/openid-configuration and
   https://sandbox.bluebutton.cms.gov/v2/fhir/.well-known/smart-configuration
   (fhirVersion 4.0.1; resources Patient, Coverage, ExplanationOfBenefit;
   grant type authorization_code; code_challenge_methods_supported ["S256"]).
   ONE definition — the Cloudflare functions import these, never a second copy.
   -------------------------------------------------------------------------- */
export const SANDBOX = {
  issuer: 'https://sandbox.bluebutton.cms.gov',
  /** Trailing slashes on purpose. The discovery document publishes these three
   *  without one and the server 301s to the slashed form — verified 2026-09-09,
   *  GET /v2/o/authorize returned 301 to /v2/o/authorize/. A 301 on a POST is
   *  how a token request quietly loses its body, so we ask for the real URL. */
  authorizeUrl: 'https://sandbox.bluebutton.cms.gov/v2/o/authorize/',
  tokenUrl: 'https://sandbox.bluebutton.cms.gov/v2/o/token/',
  revokeUrl: 'https://sandbox.bluebutton.cms.gov/v2/o/revoke_token/',
  fhirBase: 'https://sandbox.bluebutton.cms.gov/v2/fhir',
  eobPath: '/ExplanationOfBenefit/',
  /** Read-only, and only the two things a ledger needs. No Patient scope: this
   *  product never wants a name, and asking for one it does not use is a cost
   *  to the person for nothing. */
  scopes: ['patient/ExplanationOfBenefit.rs'],
} as const;

/** Code systems this module will read a service code out of. Anything else on
 *  a line — notably the data-absent-reason placeholder CMS puts on lines with
 *  no procedure code — is treated as "no code", never as a code. */
export const SERVICE_CODE_SYSTEMS: readonly string[] = [
  'https://bluebutton.cms.gov/resources/codesystem/hcpcs',
  'http://terminology.hl7.org/CodeSystem/HCPCS',
  'https://bluebutton.cms.gov/resources/variables/hcpcs_cd',
  'http://www.ama-assn.org/go/cpt',
  'urn:oid:2.16.840.1.113883.6.14',
  'urn:oid:2.16.840.1.113883.6.12',
];

const CLAIM_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/claim-type';
const EOB_TYPE_SYSTEM = 'https://bluebutton.cms.gov/resources/codesystem/eob-type';

/* -------------------------------------------------------------------------- */
/* Minimal structural types. Not a FHIR library — only the fields read here.   */
/* -------------------------------------------------------------------------- */

interface Coding { system?: string; code?: string; display?: string }
interface CodeableConcept { coding?: Coding[]; text?: string }
interface Period { start?: string; end?: string }
interface EobItem {
  sequence?: number;
  productOrService?: CodeableConcept;
  servicedDate?: string;
  servicedPeriod?: Period;
  quantity?: { value?: number };
  category?: CodeableConcept;
}
interface Eob {
  resourceType?: string;
  id?: string;
  type?: CodeableConcept;
  billablePeriod?: Period;
  item?: EobItem[];
}
export interface EobBundle {
  resourceType?: string;
  entry?: { resource?: Eob }[];
  link?: { relation?: string; url?: string }[];
}

/** How Medicare paid for the claim the line sits on. Drives the one
 *  disambiguation this module performs (see `pickRow`). */
export type ClaimKind = 'institutional' | 'professional' | 'pharmacy' | 'oral' | 'vision' | 'unknown';

export interface ClaimLine {
  /** ExplanationOfBenefit.id, so a person can look the line up at CMS. */
  eobId: string;
  /** ExplanationOfBenefit.item.sequence. (eobId, sequence) identifies a line. */
  sequence: number;
  /** The bare service code, upper-cased. null when the line carried none. */
  code: string | null;
  /** The system the code came from, kept so provenance survives the mapping. */
  codeSystem: string | null;
  /** Whatever description the payload carried. NEVER filled in by this code. */
  display: string | null;
  /** ISO date of service, from the line if present, else the claim's period. */
  servicedOn: string | null;
  claimKind: ClaimKind;
  /** The claim type as CMS labelled it, e.g. "Hospital Outpatient claim". */
  claimLabel: string | null;
  /** item.quantity.value as reported. Units are NOT occurrences — see below. */
  unitsReported: number | null;
}

export interface MatchedGroup {
  item: PriceItem;
  /** One per billed line. Each line is one billed occurrence of that unit. */
  lines: ClaimLine[];
  /** Earliest and latest service date across the lines, for the preview. */
  firstServicedOn: string | null;
  lastServicedOn: string | null;
}

export interface UnmatchedCode {
  code: string;
  /** The description CMS sent, or null. Never invented. */
  display: string | null;
  count: number;
  firstServicedOn: string | null;
  lastServicedOn: string | null;
  reason: 'no-row' | 'ambiguous';
  /** For `ambiguous`, the rows that share this code, so a person can choose. */
  candidates: { id: string; label: string }[];
}

export interface ImportResult {
  claimCount: number;
  lineCount: number;
  /** Lines CMS sent with no procedure code at all. Counted, never invented. */
  linesWithoutCode: number;
  matched: MatchedGroup[];
  unmatched: UnmatchedCode[];
  entries: JourneyEntry[];
  earliestServicedOn: string | null;
  latestServicedOn: string | null;
}

/* --------------------------------------------------------------------------
   THE CODE INDEX.

   data/prices.json writes a row's code the way a human reads it — "CPT 99213",
   "HCPCS G0463 (APC 5012)", "CPT 94729, add-on". A claim carries the bare code.
   This is the one place the two forms meet.
   -------------------------------------------------------------------------- */

/** CPT/HCPCS shapes: five digits · four digits + a letter (Cat II/III, e.g.
 *  0001U, 3006F) · a letter + four digits (HCPCS Level II, e.g. G0463). */
const CODE_SHAPE = /\b(\d{5}|\d{4}[A-Z]|[A-Z]\d{4})\b/;

/** The bare service code inside a table row's `code` field, or null. */
export function normalizeCode(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const m = CODE_SHAPE.exec(raw.toUpperCase());
  return m ? m[1] : null;
}

/** Every table row that carries a service code, grouped by that bare code. */
export function codeIndex(table: readonly PriceItem[]): Map<string, PriceItem[]> {
  const ix = new Map<string, PriceItem[]>();
  for (const item of table) {
    const code = normalizeCode(item.code);
    if (!code) continue;
    const list = ix.get(code);
    if (list) list.push(item); else ix.set(code, [item]);
  }
  return ix;
}

/* --------------------------------------------------------------------------
   THE ONE DISAMBIGUATION.

   An emergency-room visit is three true rows in this table: the hospital's
   half, the doctor's half, and the two added together. A claim knows which one
   it is — an institutional claim IS the hospital's half and a professional
   claim IS the doctor's half — so the claim, not this code, makes the choice.

   Where the claim cannot settle it, the line is NOT matched. It is listed as
   ambiguous with the rows it could be, and the person picks. Silently choosing
   the bigger number would be the single easiest way to inflate a total.
   -------------------------------------------------------------------------- */
const FACILITY_SUFFIX = '-facility-only';
const PHYSICIAN_SUFFIX = '-physician-only';

export function pickRow(rows: PriceItem[], kind: ClaimKind): PriceItem | null {
  if (rows.length === 1) return rows[0];
  const facility = rows.find((r) => r.id.endsWith(FACILITY_SUFFIX));
  const physician = rows.find((r) => r.id.endsWith(PHYSICIAN_SUFFIX));
  if (kind === 'institutional' && facility) return facility;
  if (kind === 'professional' && physician) return physician;
  return null;
}

/* -------------------------------------------------------------------------- */
/* Reading the bundle.                                                        */
/* -------------------------------------------------------------------------- */

function claimKindOf(eob: Eob): { kind: ClaimKind; label: string | null } {
  const coding = eob.type?.coding ?? [];
  const hl7 = coding.find((c) => c.system === CLAIM_TYPE_SYSTEM)?.code;
  const label =
    coding.find((c) => c.display && c.system !== CLAIM_TYPE_SYSTEM && c.system !== EOB_TYPE_SYSTEM)?.display
    ?? coding.find((c) => c.display)?.display
    ?? null;
  const kind: ClaimKind =
    hl7 === 'institutional' || hl7 === 'professional' || hl7 === 'pharmacy' || hl7 === 'oral' || hl7 === 'vision'
      ? hl7 : 'unknown';
  return { kind, label };
}

function serviceCodingOf(pos: CodeableConcept | undefined): Coding | null {
  for (const c of pos?.coding ?? []) {
    if (c.system && SERVICE_CODE_SYSTEMS.includes(c.system) && typeof c.code === 'string' && CODE_SHAPE.test(c.code.toUpperCase())) {
      return c;
    }
  }
  return null;
}

const isoDate = (v: string | undefined | null): string | null =>
  (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/** Flatten a Blue Button EOB Bundle to one row per billed line. */
export function extractLines(bundle: EobBundle | null | undefined): ClaimLine[] {
  const out: ClaimLine[] = [];
  for (const entry of bundle?.entry ?? []) {
    const eob = entry?.resource;
    if (!eob || eob.resourceType !== 'ExplanationOfBenefit') continue;
    const { kind, label } = claimKindOf(eob);
    const claimDate = isoDate(eob.billablePeriod?.start);
    const eobId = typeof eob.id === 'string' ? eob.id : '';
    for (const it of eob.item ?? []) {
      const coding = serviceCodingOf(it.productOrService);
      const units = typeof it.quantity?.value === 'number' && Number.isFinite(it.quantity.value)
        ? it.quantity.value : null;
      out.push({
        eobId,
        sequence: typeof it.sequence === 'number' ? it.sequence : out.length + 1,
        code: coding?.code ? coding.code.toUpperCase() : null,
        codeSystem: coding?.system ?? null,
        display: typeof coding?.display === 'string' && coding.display.trim()
          ? coding.display.trim()
          : (typeof it.productOrService?.text === 'string' && it.productOrService.text.trim()
            ? it.productOrService.text.trim() : null),
        servicedOn: isoDate(it.servicedDate) ?? isoDate(it.servicedPeriod?.start) ?? claimDate,
        claimKind: kind,
        claimLabel: label,
        unitsReported: units,
      });
    }
  }
  return out;
}

/** How many distinct claims the bundle held. */
export function claimCount(bundle: EobBundle | null | undefined): number {
  let n = 0;
  for (const e of bundle?.entry ?? []) if (e?.resource?.resourceType === 'ExplanationOfBenefit') n++;
  return n;
}

/** The `next` page link of a search Bundle, or null. */
export function nextPageUrl(bundle: EobBundle | null | undefined): string | null {
  const l = (bundle?.link ?? []).find((x) => x?.relation === 'next');
  return typeof l?.url === 'string' && l.url.startsWith(SANDBOX.issuer) ? l.url : null;
}

/* --------------------------------------------------------------------------
   THE MAPPING.

   🔴 `times` counts BILLED LINES, never reported units. `item.quantity` means
   something different on every kind of line — minutes on anaesthesia, doses on
   a drug, sessions on therapy — so multiplying a published price by it would
   invent a figure. Each billed line is one occurrence; the units CMS reported
   ride along on the line for the person to read, and change no number.
   -------------------------------------------------------------------------- */
export function mapClaims(bundle: EobBundle | null | undefined, table: readonly PriceItem[]): ImportResult {
  return mapLines(extractLines(bundle), table, claimCount(bundle));
}

/**
 * The same mapping, starting from lines that have already been extracted.
 *
 * 🔴 THIS SPLIT IS A PRIVACY DECISION, not a refactor. `extractLines` runs in
 * the Cloudflare Worker, so the raw ExplanationOfBenefit — which also carries
 * diagnoses, provider names, facility addresses and the beneficiary reference —
 * is read once, in memory, and dropped. What crosses to the browser is only
 * what a ledger needs: a service code, a date and which kind of claim it was.
 * The browser then maps those against the price table it already ships with.
 */
export function mapLines(
  lines: readonly ClaimLine[],
  table: readonly PriceItem[],
  claims?: number,
): ImportResult {
  const ix = codeIndex(table);

  const groups = new Map<string, MatchedGroup>();
  const misses = new Map<string, UnmatchedCode>();
  let linesWithoutCode = 0;
  let earliest: string | null = null;
  let latest: string | null = null;

  const stretch = (d: string | null) => {
    if (!d) return;
    if (!earliest || d < earliest) earliest = d;
    if (!latest || d > latest) latest = d;
  };

  for (const line of lines) {
    stretch(line.servicedOn);
    if (!line.code) { linesWithoutCode++; continue; }

    const rows = ix.get(line.code);
    const row = rows && rows.length ? pickRow(rows, line.claimKind) : null;

    if (row) {
      const g = groups.get(row.id) ?? { item: row, lines: [], firstServicedOn: null, lastServicedOn: null };
      g.lines.push(line);
      if (line.servicedOn) {
        if (!g.firstServicedOn || line.servicedOn < g.firstServicedOn) g.firstServicedOn = line.servicedOn;
        if (!g.lastServicedOn || line.servicedOn > g.lastServicedOn) g.lastServicedOn = line.servicedOn;
      }
      groups.set(row.id, g);
      continue;
    }

    const reason: UnmatchedCode['reason'] = rows && rows.length > 1 ? 'ambiguous' : 'no-row';
    const u = misses.get(line.code) ?? {
      code: line.code,
      display: line.display,
      count: 0,
      firstServicedOn: null,
      lastServicedOn: null,
      reason,
      candidates: (rows ?? []).map((r) => ({ id: r.id, label: r.label })),
    };
    u.count++;
    // Keep the first real description CMS sent for this code, if any turns up.
    if (!u.display && line.display) u.display = line.display;
    if (line.servicedOn) {
      if (!u.firstServicedOn || line.servicedOn < u.firstServicedOn) u.firstServicedOn = line.servicedOn;
      if (!u.lastServicedOn || line.servicedOn > u.lastServicedOn) u.lastServicedOn = line.servicedOn;
    }
    misses.set(line.code, u);
  }

  const matched = [...groups.values()].sort((a, b) => b.lines.length - a.lines.length);
  const unmatched = [...misses.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  return {
    claimCount: typeof claims === 'number' ? claims : new Set(lines.map((l) => l.eobId)).size,
    lineCount: lines.length,
    linesWithoutCode,
    matched,
    unmatched,
    entries: matched.map(toEntry),
    earliestServicedOn: earliest,
    latestServicedOn: latest,
  };
}

/** One ledger entry per matched row. `raw` is what the person will see as the
 *  line they "typed" — so it says plainly where the line came from. */
export function toEntry(group: MatchedGroup): JourneyEntry {
  const n = group.lines.length;
  const when = group.firstServicedOn && group.lastServicedOn && group.firstServicedOn !== group.lastServicedOn
    ? `${group.firstServicedOn} to ${group.lastServicedOn}`
    : group.firstServicedOn ?? 'date not given';
  return {
    key: `bb-${group.item.id}`,
    raw: `${group.item.label} — from ${n} Medicare claim line${n === 1 ? '' : 's'}, ${when}`,
    item: group.item,
    times: Math.max(1, Math.min(365, n)),
  };
}

/** A one-sentence, honest summary of what an import did. Used by the preview
 *  and by the report; no adjectives, no dollar figure. */
export function importSummary(r: ImportResult): string {
  const parts = [
    `${r.claimCount} Medicare claim${r.claimCount === 1 ? '' : 's'}`,
    `${r.lineCount} billed line${r.lineCount === 1 ? '' : 's'}`,
    `${r.matched.length} matched a published federal price row`,
    `${r.unmatched.length} code${r.unmatched.length === 1 ? '' : 's'} had no row in this table`,
  ];
  if (r.linesWithoutCode) parts.push(`${r.linesWithoutCode} line${r.linesWithoutCode === 1 ? '' : 's'} carried no procedure code`);
  return `${parts.join(', ')}.`;
}

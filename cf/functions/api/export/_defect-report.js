/* ==========================================================================
   THE CORRECTIONS EXPORT — a defect report a federal analyst can route without
   ever opening our site.

   Until now this file was six columns: received_at, price_id, verdict,
   believed_usd, table_version, row_hash. A data steward at CMS holding
   `cms-99213` could not act on it without joining back to a table we did not
   hand them, so the demand signal Dr. Honey asked for stopped at our edge.

   Every column below already exists somewhere in this repo. Nothing here is
   computed except the fit rate and the counts, and neither is a price:
     · the figure, its basis, year, geography and population   data/prices.json
     · the federal file, its URL, its SHA-256, the day we read it, and the
       line or derivation the figure was re-read from                data/AUDIT.json
     · the count of what the public said, per figure          the rows passed in
     · the permalink that renders one row as a paste-ready report  /api/citation/{id}

   🔴 No free text ever leaves the building. `note` is held and never exported.
   🔴 No dollar figure is ever produced here. `believed_usd` is what a person
      said they were billed — a demand signal about the published figure, never
      a price, and never summed.
   ========================================================================== */
import { csvOf } from './_csv.js';
import audit from '../../../../data/AUDIT.json' with { type: 'json' };
import { TABLE, TABLE_VERSION, rulesFor } from '../../../../lib/table.ts';
import { BASIS_LABEL, fitRate, publisherOf, documentOf } from '../../../../lib/register-cite.ts';

const ITEM = new Map(TABLE.map((i) => [i.id, i]));
const RESULT = new Map((audit.results || []).map((r) => [r.id, r]));
const SOURCE = audit.sources || {};

/** The audit's own line: how many rows reproduce, and when they last did. */
export const AUDIT_LINE = audit.version_line || '';
export const AUDITED_ON = audit.generated || '';

/** What kind of thing the figure was read from. A judge and an analyst both ask
 *  this before they ask anything else, and one of our rows is honestly not a
 *  federal file: the MEPS 2022 long-COVID analysis is a peer-reviewed article. */
function sourceKind(key) {
  if (!key) return 'not recorded';
  if (key === 'pmc') return 'peer-reviewed article (not a federal file)';
  const parts = key.split('+').map((k) => SOURCE[k]).filter(Boolean);
  const file = parts.map((s) => s.file || '').join(' + ');
  if (/\.(csv|xlsx)$/i.test(file)) return 'federal data file';
  if (/\.pdf$/i.test(file)) return 'federal publication';
  return 'federal web page';
}

const joinOf = (key, field) => (key || '').split('+').map((k) => (SOURCE[k] || {})[field] || '').filter(Boolean).join(' + ');

/** CPT 99213 -> ['CPT', '99213']; a row with no code -> ['', '']. */
function codeParts(code) {
  const m = /^\s*(CPT|HCPCS)\s+(\S+)\s*$/i.exec(code || '');
  if (m) return [m[1].toUpperCase(), m[2]];
  return code ? ['', String(code).trim()] : ['', ''];
}

/** The published columns, in the order they are published, each with what it means.
 *  This list is the contract: /api/export/corrections.json publishes it beside
 *  the rows so a consumer never has to guess, and tests/export.test.ts pins it. */
import { DEFECT_COLUMNS, DEFECT_HEADER } from '../../../../lib/defect-columns.js';
export { DEFECT_COLUMNS, DEFECT_HEADER };


/** The whole provenance of one figure, joined from the table and the audit. */
export function provenanceOf(priceId) {
  const item = ITEM.get(priceId);
  const res = RESULT.get(priceId) || {};
  const key = res.source_key || '';
  const alt = (item && rulesFor(priceId).alternates) || {};
  const [system, code] = codeParts(item && item.code);
  return {
    known: !!item,
    item, key, system, code,
    sourceFile: joinOf(key, 'file'),
    sourceFileUrl: joinOf(key, 'url'),
    sourceFileSha256: joinOf(key, 'sha256'),
    sourceFileRetrieved: joinOf(key, 'retrieved'),
    sourceKind: sourceKind(key),
    sourceLine: res.evidence || '',
    auditStatus: res.status || 'not audited',
    auditCheck: res.check || '',
    /* The CY2024 companion an uninsured person is billed against, where CMS
       publishes one for this code. Carried in the JSON export only. */
    cy2024: alt.cy2024_source_row ? {
      averageSubmittedChargeUsd: alt.cy2024_average_submitted_charge_usd ?? null,
      averageAllowedUsd: alt.cy2024_average_allowed_usd ?? null,
      file: alt.cy2024_source_file || '',
      fileUrl: alt.cy2024_source_file_url || '',
      fileSha256: alt.cy2024_source_file_sha256 || '',
      row: alt.cy2024_source_row || '',
      placeOfService: alt.cy2024_place_of_service || '',
      retrieved: alt.cy2024_retrieved || '',
      field: alt.cy2024_charge_field || '',
    } : null,
  };
}

/** Counts per figure, computed from the same rows this file publishes, so the
 *  denominator in the file is the denominator of the file. */
function tallies(rows) {
  const t = new Map();
  for (const r of rows) {
    const e = t.get(r.priceId) || { right: 0, wrong: 0 };
    if (r.verdict === 'wrong') e.wrong++; else e.right++;
    t.set(r.priceId, e);
  }
  return t;
}

const asOfOf = (opts) => (opts && opts.asOf) || new Date().toISOString().slice(0, 10);
const siteOf = (opts) => ((opts && opts.site) || '').replace(/\/$/, '');

/** One object per correction, every field resolved. The CSV and the JSON are
 *  both written from this, so they can never disagree. */
export function defectRows(rows, opts = {}) {
  const asOf = asOfOf(opts);
  const site = siteOf(opts);
  const t = tallies(rows);
  return rows.map((r) => {
    const p = provenanceOf(r.priceId);
    const c = t.get(r.priceId) || { right: 0, wrong: 0 };
    const i = p.item;
    return {
      received_at: r.receivedAt,
      price_id: r.priceId,
      code_system: p.system,
      code: p.code,
      loinc: (i && i.loinc) || '',
      label: i ? i.label : 'this identifier is not in the published table (kept, never dropped)',
      published_value_usd: i && typeof i.valueUsd === 'number' ? i.valueUsd : '',
      basis: i ? i.basis : '',
      basis_meaning: i ? (BASIS_LABEL[i.basis] || i.basis) : '',
      year: i ? i.year : '',
      geography: i ? i.geography : '',
      population: i ? i.population : '',
      agency: i ? (i.agencyDisplay || i.agency || publisherOf(i.sourceTitle)) : '',
      source_title: i ? i.sourceTitle : '',
      source_url: i ? i.sourceUrl : '',
      source_file: p.sourceFile,
      source_file_url: p.sourceFileUrl,
      source_file_sha256: p.sourceFileSha256,
      source_file_retrieved: p.sourceFileRetrieved,
      source_kind: i ? p.sourceKind : 'not recorded',
      source_line: p.sourceLine,
      audit_status: i ? p.auditStatus : 'not audited',
      audit_check: p.auditCheck,
      verdict: r.verdict,
      believed_usd: typeof r.believedValueUsd === 'number' ? r.believedValueUsd : '',
      figure_confirmed_right: c.right,
      figure_flagged_wrong: c.wrong,
      figure_responses: c.right + c.wrong,
      figure_fit_rate_pct: fitRate(c.right, c.wrong) ?? '',
      table_version: r.priceTableVersion || '',
      row_hash: r.rowHash || '',
      citation_url: `${site}/api/citation/${encodeURIComponent(r.priceId)}`,
      counted_as_of: asOf,
      /* JSON only — the document, and the charge an uninsured person is billed
         against where CMS publishes one. Never a CSV column. */
      _document: i ? documentOf(i.sourceTitle) : '',
      _cy2024: p.cy2024,
    };
  });
}

/** The one line above the header, so a file that has left our site still says
 *  which table it describes and when that table last reproduced. */
export function defectComment(asOf) {
  return `Waypoint Ledger — public corrections to published federal figures. Price table ${TABLE_VERSION}; `
    + `${AUDIT_LINE || 'audit line unavailable'}. Counted as of ${asOf}. `
    + 'Self-selected members of the public using a free tool; counts are reported exactly as entered — '
    + 'no weighting, no imputation, no extrapolation to a population. believed_usd is a demand signal '
    + 'about the published figure and is never a price. Column meanings: /api/export/corrections.json.';
}

export function correctionsDefectCsv(rows, opts = {}) {
  const asOf = asOfOf(opts);
  const out = defectRows(rows, { ...opts, asOf });
  return csvOf(DEFECT_HEADER, out.map((o) => DEFECT_HEADER.map((h) => o[h])),
    opts.comment === false ? undefined : defectComment(asOf));
}

/** The same file as JSON, shaped as the DCAT distribution /data.json describes. */
export function correctionsDefectJson(rows, opts = {}) {
  const asOf = asOfOf(opts);
  const site = siteOf(opts);
  const out = defectRows(rows, { ...opts, asOf });
  return {
    '@type': 'dcat:Distribution',
    title: 'Waypoint Ledger register: corrections to published federal figures',
    description: 'One row per correction, joined to the federal file the figure was read from: the file name, '
      + 'its URL, its SHA-256, the line the figure was re-read from, the audit verdict, and the count of what '
      + 'the public said about that figure. Free text is never published.',
    downloadURL: site ? `${site}/api/export/corrections.json` : '/api/export/corrections.json',
    mediaType: 'application/json',
    format: 'JSON',
    license: 'https://creativecommons.org/publicdomain/zero/1.0/',
    describedBy: site ? `${site}/data/dictionary.csv` : '/data/dictionary.csv',
    describedByType: 'text/csv',
    conformsTo: site ? `${site}/api/openapi.json` : '/api/openapi.json',
    tableVersion: TABLE_VERSION,
    auditLine: AUDIT_LINE,
    auditedOn: AUDITED_ON,
    countedAsOf: asOf,
    csvUrl: site ? `${site}/api/export/corrections.csv` : '/api/export/corrections.csv',
    methodUrl: site ? `${site}/method` : '/method',
    sample: 'Self-selected members of the public using a free tool. Counts are reported exactly as entered — '
      + 'no weighting, no imputation, no extrapolation to a population.',
    columns: DEFECT_COLUMNS.map(([name, type, note]) => ({ name, type, note })),
    n: out.length,
    rows: out.map(({ _document, _cy2024, ...row }) => ({
      ...row,
      source_document: _document,
      cy2024_companion: _cy2024,
    })),
  };
}

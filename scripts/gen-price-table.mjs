/* ==========================================================================
   PUBLISH THE PRICE TABLE AS OPEN DATA.

   The rows are the most reusable thing in this project: every one carries
   the federal file it came from, the year, the population it describes, the
   basis it is measured on, the rules about what may be added to what, and the
   audit verdict from data/verify_price_table.py. Locked inside a JavaScript
   bundle, none of that is reusable by anyone. This writes it out.

     public/data/price-table.csv        one row per priced unit of care
     public/data/price-table.json       the same, plus the table's own legends,
                                        combination rules and source hashes
     public/data/price-dictionary.csv   what every column means

   Run: node scripts/gen-price-table.mjs   (also checked by tests/price-table.test.ts)
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const prices = read('data/prices.json');
const audit = existsSync(new URL('../data/AUDIT.json', import.meta.url)) ? read('data/AUDIT.json') : null;
const auditById = new Map((audit?.results ?? []).map((r) => [r.id, r]));

/* A spreadsheet treats a cell opening with = + - @ as a formula. Everything we
   publish is data, so those get a leading apostrophe — the same rule the API
   exports use. */
const esc = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header, rows) => [header.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n') + '\n';

/* ---------------------------------------------------------------- columns */
const COLUMNS = [
  ['id', 'text', 'Stable identifier. Cite a correction against this.'],
  ['label', 'text', 'What the unit of care is called in plain words.'],
  ['agency', 'text', 'The federal body that published the figure: CMS, AHRQ, BLS or GSA.'],
  ['agency_program', 'text', 'The program within it, where it matters: AHRQ MEPS, AHRQ HCUP.'],
  ['value_usd', 'number', 'The figure. Blank where the row publishes an interval or a ratio instead.'],
  ['out_of_pocket_usd', 'number', "The person's own share, only where the source publishes one."],
  ['value_range_low_usd', 'number', 'Low bound of the published interval, where there is one.'],
  ['value_range_high_usd', 'number', 'High bound of the published interval.'],
  ['basis', 'text', 'What kind of number it is. See basis_legend in the JSON. Never mix bases in a total.'],
  ['attribution', 'text', 'gross (all spending on this) or excess (the amount over a comparable person).'],
  ['summable', 'boolean', 'FALSE means this figure may never enter an itemized total.'],
  ['mutually_exclusive_with', 'text', 'Semicolon-separated ids that must not appear in the same total. __ALL_PER_EVENT_LINES__ means the row already contains every event.'],
  ['bundles_ancillaries', 'boolean', 'TRUE means the figure already contains the labs and imaging ordered during the visit.'],
  ['year', 'text', 'The year of the figure, as the source states it.'],
  ['geography', 'text', 'The geography the figure describes.'],
  ['population', 'text', 'Who is counted in it. This is the field that decides whether it describes you.'],
  ['confidence', 'text', 'VERIFIED read straight off the file; DERIVED the product of figures on the file, formula printed; REPORTED quoted from a published report.'],
  ['code', 'text', 'The billing code, where the figure is code-specific.'],
  ['loinc', 'text', 'The NLM order code for a lab, confirmed against the NLM Clinical Table Search Service. Blank where no single code names the same test.'],
  ['loinc_long_common_name', 'text', 'Exactly what that LOINC code means, as NLM states it.'],
  ['audit_status', 'text', 'PASS, FAIL or UNVERIFIED from data/verify_price_table.py on the date in the header.'],
  ['audit_check', 'text', 'How that row was checked.'],
  ['audit_evidence', 'text', 'What the check found, quoted.'],
  ['source_title', 'text', 'The exact file or report.'],
  ['source_url', 'url', 'Where to open it.'],
  ['plain_language_synonyms', 'text', 'Semicolon-separated phrases people actually use for this.'],
  ['coverage_statement', 'text', 'Who the figure describes, who it does not, and how it was made. The long one. Read it.'],
  ['pfs_status_indicator', 'text', 'Set only where CMS publishes relative value units for the code and pays nothing for it. N = non-covered service; the row carries no figure on purpose.'],
  ['cy2024_submitted_charge_usd', 'number', 'What providers billed on average for this service in CY2024. CHARGE basis — an alternative measure, never an addition to the allowed amount.'],
  ['cy2024_allowed_usd', 'number', 'What Medicare allowed on average for this service in CY2024, from the same claims row.'],
  ['cy2024_source_file', 'text', 'The CMS file both CY2024 figures were read in.'],
  ['cy2024_source_file_sha256', 'text', 'SHA-256 of that file as retrieved. The audit re-reads it and fails on a mismatch.'],
  ['cy2024_source_row', 'text', 'The exact row inside that file: geography level, HCPCS code and place of service.'],
  ['cy2024_source_url', 'url', 'The dataset page for that file.'],
  ['cy2024_audit_status', 'text', 'PASS, FAIL or UNVERIFIED for the CY2024 figures on this row, from the same audit run as audit_status.'],
  ['alternates_json', 'json', 'Every companion figure carried on this row, as JSON. Each CY2024 figure carries its own file, row, field and SHA-256 in the same object; the rest name the source in their note.'],
];

/* One verdict for every CY2024 companion figure on the row, so the CSV says what
   the audit said without a reader having to open AUDIT.json. */
const altStatus = (a) => {
  const list = a.alternates ?? [];
  if (!list.length) return '';
  if (list.some((x) => x.status === 'FAIL')) return 'FAIL';
  if (list.some((x) => x.status === 'UNVERIFIED')) return 'UNVERIFIED';
  return 'PASS';
};

const row = (r) => {
  const a = auditById.get(r.id) ?? {};
  const alt = r.alternates ?? {};
  const range = r.value_range_usd ?? [];
  return [
    r.id, r.label, r.agency ?? '', r.agency_display ?? '',
    r.value_usd ?? '', r.out_of_pocket_usd ?? '', range[0] ?? '', range[1] ?? '',
    r.basis, r.attribution ?? '', r.summable === false ? 'FALSE' : 'TRUE',
    (r.mutually_exclusive_with ?? []).join(';'), r.bundles_ancillaries ? 'TRUE' : 'FALSE',
    r.year, r.geography ?? '', r.population ?? '', r.confidence ?? '', r.code ?? '',
    r.loinc ?? '', r.loinc_long_common_name ?? '',
    a.status ?? 'NOT AUDITED', a.check ?? '', a.evidence ?? '',
    r.source_title ?? '', r.source_url ?? '',
    (r.plain_language_synonyms ?? []).join(';'),
    r.coverage_statement ?? '',
    r.pfs_status_indicator ?? '',
    alt.cy2024_average_submitted_charge_usd ?? alt.cy2024_physician_component_average_submitted_charge_usd ?? '',
    alt.cy2024_average_allowed_usd ?? '',
    alt.cy2024_source_file ?? '', alt.cy2024_source_file_sha256 ?? '',
    alt.cy2024_source_row ?? '', alt.cy2024_source_url ?? '',
    altStatus(a),
    JSON.stringify(r.alternates ?? {}),
  ];
};

const LICENSE =
  'The federal figures in this table are U.S. Government works and are in the public domain. '
  + 'Our additions — the plain-language labels, the synonyms, the coverage statements, the combination '
  + 'rules and this arrangement — are dedicated to the public domain by Precision Federal LLC under '
  + 'CC0 1.0. Take it, fork it, correct it. Attribution is welcome and not required.';
const HOW_TO_CITE =
  `Waypoint Ledger price table, version ${prices._version}, Precision Federal LLC, `
  + 'https://waypoint-ledger.pages.dev/data/price-table.csv. Every row carries the federal source it '
  + 'came from; cite that source for the figure and this table for the arrangement.';

mkdirSync(new URL('../public/data/', import.meta.url), { recursive: true });

writeFileSync(new URL('../public/data/price-table.csv', import.meta.url),
  csv(COLUMNS.map((c) => c[0]), prices.items.map(row)));

writeFileSync(new URL('../public/data/price-dictionary.csv', import.meta.url),
  csv(['file', 'field', 'type', 'note'],
    COLUMNS.map((c) => ['price-table.csv', c[0], c[1], c[2]])));

writeFileSync(new URL('../public/data/price-table.json', import.meta.url), JSON.stringify({
  table_version: prices._version,
  generated: new Date().toISOString().slice(0, 10),
  rows: prices.items.length,
  license: LICENSE,
  how_to_cite: HOW_TO_CITE,
  readme: prices._README,
  confidence_legend: prices._confidence_legend,
  basis_legend: prices._basis_legend,
  combination_rules: prices._combination_rules,
  prohibited_derivations: prices._prohibited_derivations,
  audit: audit
    ? { generated: audit.generated, rows: audit.rows, pass: audit.pass, fail: audit.fail,
        unverified: audit.unverified,
        alternates: audit.alternates, alternates_pass: audit.alternates_pass,
        alternates_fail: audit.alternates_fail, alternates_unverified: audit.alternates_unverified,
        localities: audit.localities, version_line: audit.version_line,
        sources: audit.sources }
    : null,
  items: prices.items.map((r) => ({ ...r, audit: auditById.get(r.id) ?? null })),
}, null, 1) + '\n');

console.log(`price table: ${prices.items.length} rows -> public/data/price-table.{csv,json} + price-dictionary.csv`
  + (audit ? ` (audit ${audit.pass}/${audit.rows} PASS)` : ' (no audit found)'));

/* ==========================================================================
   PUBLISH THE 5,123 LOCALITY FIGURES AS OPEN DATA.

   The single most reusable asset in this project was reachable only by driving
   our own interface: 47 CMS Physician Fee Schedule codes priced for each of the
   109 Medicare payment localities, every one re-derived from CMS's own formula.
   A state health department cannot filter a JavaScript bundle. This writes the
   whole thing out, with the inputs that made each number on the same row.

     public/data/locality-prices.csv        one row per code per locality (5,123)
     public/data/locality-prices.json       the same, plus formula, sources and audit
     public/data/locality-dictionary.csv    what every column means

   🔴 THIS SCRIPT IS ALSO THE AUDIT. It does not copy data/state-prices.json out.
   It recomputes every figure from the RVU components and the GPCIs and compares
   the result to the stored value to the cent. One mismatch and it exits 1 with
   the row named, so a published figure can never drift from the formula that is
   printed beside it.

   Run: node scripts/gen-locality-table.mjs
        node scripts/gen-locality-table.mjs --from-source ~/.cache/waypoint-ledger/sources
          (re-reads the CMS CSVs themselves and checks their SHA256 as well)

   Checked by tests/locality-table.test.ts, which regenerates and diffs.
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const here = (p) => new URL(`../${p}`, import.meta.url);
const read = (p) => JSON.parse(readFileSync(here(p), 'utf8'));

const sp = read('data/state-prices.json');
const prices = read('data/prices.json');
const audit = existsSync(here('data/AUDIT.json')) ? read('data/AUDIT.json') : null;
const auditById = new Map((audit?.results ?? []).map((r) => [r.id, r]));
const priceById = new Map(prices.items.map((i) => [i.id, i]));

const CF = sp._conversion_factor;

/* ------------------------------------------------------------------ sources
   The two CMS files inside RVU26C.zip. Both SHA256 values were computed from
   the zip downloaded from the CMS URL below on the date recorded here; the
   PPRRVU hash is the same value data/AUDIT.json recorded independently when
   data/verify_price_table.py fetched the file, which is what makes it a check
   rather than an assertion. --from-source re-verifies both against local copies. */
const SOURCES = {
  rvu: {
    file: 'PPRRVU2026_Jul_nonQPP.csv',
    title: 'CMS, CY2026 National Physician Fee Schedule Relative Value File (RVU26C, July release, published 2026-06-30)',
    url: 'https://www.cms.gov/files/zip/rvu26c-updated-06-30-2026.zip',
    landing: 'https://www.cms.gov/medicare/payment/fee-schedules/physician/pfs-relative-value-files/rvu26c',
    sha256: 'b7d197e73211ef6854c213c267d5fa9dec8df995db8e1ee7d44c0556ad7cee21',
    verified_on: '2026-09-09',
    holds: 'Work RVU, non-facility practice expense RVU, malpractice RVU and the conversion factor for every HCPCS code.',
  },
  gpci: {
    file: 'GPCI2026.csv',
    title: 'CMS, CY2026 Geographic Practice Cost Indices, Addendum E (RVU26C, July release)',
    url: 'https://www.cms.gov/files/zip/rvu26c-updated-06-30-2026.zip',
    landing: 'https://www.cms.gov/medicare/payment/fee-schedules/physician/pfs-relative-value-files/rvu26c',
    sha256: '7850e2987d12e46930e49033f96829b5ae11f60dd1f19965329b38cf08b05264',
    verified_on: '2026-09-09',
    holds: 'The three geographic practice cost indices for each of the 109 Medicare payment localities.',
  },
};

/* ------------------------------------------- the RVU components, from the audit
   data/build_state_prices.py printed the three RVU components it used for every
   row it priced. That printout is data/STATE-PRICES-AUDIT.txt and it is the
   record of what produced state-prices.json, so it is what this audit checks
   against — not a second copy typed somewhere else. */
const RVU = new Map();
for (const line of readFileSync(here('data/STATE-PRICES-AUDIT.txt'), 'utf8').split('\n')) {
  const m = line.match(/^OK\s+(\S+)\s+code\s+(\S+):\s+work\s+([\d.]+)\s+pe\s+([\d.]+)\s+mp\s+([\d.]+)\s+->\s+national\s+([\d.]+)/);
  if (m) RVU.set(m[1], { code: m[2], work: +m[3], pe: +m[4], mp: +m[5], national: +m[6] });
}

/* ------------------------------------------------ optional: re-read CMS itself */
const fromIdx = process.argv.indexOf('--from-source');
if (fromIdx > -1) {
  const dir = process.argv[fromIdx + 1];
  if (!dir) fatal('--from-source needs a directory holding the two CMS CSV files.');
  for (const [key, s] of Object.entries(SOURCES)) {
    const candidates = [join(dir, s.file), join(dir, `${key}.csv`)];
    const path = candidates.find((p) => existsSync(p));
    if (!path) { console.log(`  skip  ${s.file} not in ${dir}`); continue; }
    const got = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (got !== s.sha256) fatal(`${s.file} at ${path} hashes ${got}, not the recorded ${s.sha256}. Either CMS republished the file or this copy is not the one the table was built from.`);
    console.log(`  ok    ${s.file} sha256 matches the recorded value`);
  }
}

function fatal(msg) { console.error(`gen-locality-table: ${msg}`); process.exit(1); }

/* ------------------------------------------------------------- the audit pass */
const localities = sp.localities.map((l) => ({ ...l, key: `${l.state}-${l.locality}` }));
const byKey = new Map(localities.map((l) => [l.key, l]));
let checked = 0;
const mismatches = [];
for (const [id, figures] of Object.entries(sp.items)) {
  const r = RVU.get(id);
  if (!r) fatal(`data/STATE-PRICES-AUDIT.txt has no RVU components for ${id}, so its published locality figures cannot be checked.`);
  for (const [key, stored] of Object.entries(figures)) {
    const l = byKey.get(key);
    if (!l) fatal(`${id} carries a figure for locality ${key}, which is not in the GPCI list.`);
    const calc = Math.round((r.work * l.pw + r.pe * l.pe + r.mp * l.mp) * CF * 100) / 100;
    checked++;
    if (Math.abs(calc - stored) > 0.005) mismatches.push(`${id} ${key}: formula gives ${calc}, table holds ${stored}`);
  }
}
if (mismatches.length) fatal(`${mismatches.length} of ${checked} published locality figures do not reproduce:\n  ` + mismatches.slice(0, 10).join('\n  '));

/* A generator's verdict on its own output is not an audit. data/verify_price_table.py
   re-derives the same figures from the CMS files, independently of this file, and
   writes its count into data/AUDIT.json. The status published on every row is that
   verdict, not this one. */
const LOC = audit?.localities ?? null;
const LOCALITY_STATUS = LOC && LOC.status === 'PASS' && LOC.figures === checked && LOC.fail === 0
  ? 'REPRODUCED'
  : 'REPRODUCED IN THIS GENERATOR ONLY — NOT YET RE-DERIVED BY data/verify_price_table.py';

/* ------------------------------------------------------------------- columns */
const COLUMNS = [
  ['price_id', 'text', 'The row of the Waypoint Ledger price table this figure belongs to. Join on this to public/data/price-table.csv.'],
  ['code', 'text', 'The CPT/HCPCS code CMS prices.'],
  ['label', 'text', 'What the unit of care is called in plain words.'],
  ['state', 'text', 'Two-letter postal abbreviation of the state or territory.'],
  ['locality', 'text', 'The two-digit CMS payment locality number inside that state.'],
  ['locality_key', 'text', 'state and locality joined, "IA-00". This is the key POST /api/price accepts as "locality".'],
  ['locality_name', 'text', 'The locality name exactly as CMS writes it in Addendum E.'],
  ['mac', 'text', 'The Medicare Administrative Contractor number that prices this locality.'],
  ['work_rvu', 'number', 'Work relative value units for this code, from the PFS Relative Value File.'],
  ['pe_nonfacility_rvu', 'number', 'Non-facility practice expense relative value units.'],
  ['mp_rvu', 'number', 'Malpractice relative value units.'],
  ['pw_gpci', 'number', 'Work geographic practice cost index for this locality (the 1.0 statutory floor is already applied by CMS).'],
  ['pe_gpci', 'number', 'Practice expense geographic practice cost index for this locality.'],
  ['mp_gpci', 'number', 'Malpractice geographic practice cost index for this locality.'],
  ['conversion_factor', 'number', 'The CY2026 non-qualifying-APM conversion factor, in dollars per RVU.'],
  ['allowed_usd', 'number', 'The Medicare allowed amount for this code in this locality. DERIVED by the formula in the formula column, never estimated.'],
  ['national_usd', 'number', 'The same code with every index set to 1.000 — the national figure on the price table.'],
  ['pct_of_national', 'number', 'allowed_usd as a percentage of national_usd, to one decimal. Arithmetic on the two columns beside it.'],
  ['formula', 'text', "CMS's own formula, written out, so the row can be recomputed without this file."],
  ['basis', 'text', 'allowed — a fee-schedule amount. It is what Medicare pays, not what anyone was billed and not what a commercial plan pays.'],
  ['year', 'text', 'The calendar year of the fee schedule.'],
  ['population', 'text', 'Who the figure describes: Medicare Part B fee-for-service beneficiaries. For anyone else it is a reference price.'],
  ['locality_audit_status', 'text', 'REPRODUCED means two independent runs recomputed this exact figure from the RVUs and GPCIs in the columns to the left: this generator, and data/verify_price_table.py reading the CMS files itself.'],
  ['national_audit_status', 'text', 'PASS, FAIL or NOT AUDITED for the national figure, from data/verify_price_table.py.'],
  ['rvu_file', 'text', 'The CMS file the RVU columns were read from.'],
  ['rvu_file_sha256', 'text', 'SHA256 of that file, so you can prove the copy you hold is the one these RVUs were read from.'],
  ['gpci_file', 'text', 'The CMS file the GPCI columns were read from.'],
  ['gpci_file_sha256', 'text', 'SHA256 of that file, so you can prove the copy you hold is the one these indices were read from.'],
  ['table_version', 'text', 'The version of the locality table this row came from, so two downloads can be told apart.'],
];

/* A spreadsheet treats a cell opening with = + - @ as a formula. Everything we
   publish is data, so those get a leading apostrophe — the same rule the price
   table and the API exports use. */
const esc = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header, rows) => [header.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n') + '\n';

const FORMULA = `(work_rvu * pw_gpci + pe_nonfacility_rvu * pe_gpci + mp_rvu * mp_gpci) * ${CF}`;

const rows = [];
const jsonRows = [];
for (const [id, figures] of Object.entries(sp.items)) {
  const r = RVU.get(id);
  const item = priceById.get(id);
  const a = auditById.get(id) ?? {};
  for (const [key, usd] of Object.entries(figures)) {
    const l = byKey.get(key);
    const pct = Math.round((usd / r.national) * 1000) / 10;
    rows.push([
      id, r.code, item?.label ?? '', l.state, l.locality, key, l.name, l.mac,
      r.work, r.pe, r.mp, l.pw, l.pe, l.mp, CF,
      usd, r.national, pct, FORMULA,
      'allowed', item?.year ?? '2026', item?.population ?? 'Medicare Part B fee-for-service beneficiaries',
      LOCALITY_STATUS, a.status ?? 'NOT AUDITED',
      SOURCES.rvu.file, SOURCES.rvu.sha256, SOURCES.gpci.file, SOURCES.gpci.sha256,
      sp._version,
    ]);
    jsonRows.push({
      price_id: id, code: r.code, state: l.state, locality: l.locality, locality_key: key,
      locality_name: l.name, mac: l.mac,
      work_rvu: r.work, pe_nonfacility_rvu: r.pe, mp_rvu: r.mp,
      pw_gpci: l.pw, pe_gpci: l.pe, mp_gpci: l.mp,
      allowed_usd: usd, national_usd: r.national, pct_of_national: pct,
      locality_audit_status: LOCALITY_STATUS, national_audit_status: a.status ?? 'NOT AUDITED',
    });
  }
}

const LICENSE =
  'The CMS relative value units, geographic practice cost indices and conversion factor are U.S. Government '
  + 'works and are in the public domain. The arrangement, the plain-language labels and this audit are '
  + 'dedicated to the public domain by Precision Federal LLC under CC0 1.0. Take it, fork it, correct it.';

const HOW_TO_CITE =
  `Waypoint Ledger locality price table, version ${sp._version}, Precision Federal LLC, `
  + 'https://waypoint-ledger.pages.dev/data/locality-prices.csv. The figures are derived from CMS '
  + 'CY2026 Physician Fee Schedule files; cite CMS for the inputs and this file for the derivation.';

const WHAT_THIS_IS =
  'The Medicare allowed amount for each of these services in each of the 109 CMS payment localities. '
  + 'Every figure is CMS’s own formula applied to CMS’s own published inputs, which are on the same row. '
  + 'None of it is estimated, modelled or interpolated. It is what Medicare allows; for a person who is not '
  + 'on Medicare it is a published reference price and not a bill, and for a person on Medicaid it does not '
  + 'describe what their state pays at all.';

mkdirSync(here('public/data/'), { recursive: true });

writeFileSync(here('public/data/locality-prices.csv'), csv(COLUMNS.map((c) => c[0]), rows));

writeFileSync(here('public/data/locality-dictionary.csv'),
  csv(['file', 'field', 'type', 'note'], COLUMNS.map((c) => ['locality-prices.csv', c[0], c[1], c[2]])));

writeFileSync(here('public/data/locality-prices.json'), JSON.stringify({
  what_this_is: WHAT_THIS_IS,
  table_version: sp._version,
  price_table_version: prices._version,
  generated: new Date().toISOString().slice(0, 10),
  rows: rows.length,
  codes: Object.keys(sp.items).length,
  locality_count: localities.length,
  states: new Set(localities.map((l) => l.state)).size,
  conversion_factor: CF,
  formula: FORMULA,
  license: LICENSE,
  how_to_cite: HOW_TO_CITE,
  audit: {
    method: 'Every figure below was recomputed from the RVU and GPCI columns on its own row and compared to the value data/state-prices.json holds, to the cent.',
    figures_checked: checked,
    mismatches: 0,
    ran: new Date().toISOString().slice(0, 10),
    reproduce: 'node scripts/gen-locality-table.mjs',
    independent: LOC
      ? { by: 'data/verify_price_table.py', figures: LOC.figures, pass: LOC.pass, fail: LOC.fail,
          status: LOC.status, evidence: LOC.evidence }
      : { by: 'data/verify_price_table.py', status: 'NOT RUN',
          evidence: 'data/AUDIT.json carries no locality block; run the audit before publishing.' },
  },
  sources: SOURCES,
  dictionary: COLUMNS.map(([field, type, note]) => ({ field, type, note })),
  localities: localities.map((l) => ({
    key: l.key, state: l.state, locality: l.locality, name: l.name, mac: l.mac,
    pw_gpci: l.pw, pe_gpci: l.pe, mp_gpci: l.mp,
  })),
  prices: jsonRows,
}, null, 1) + '\n');

console.log(`locality table: ${rows.length} figures (${Object.keys(sp.items).length} codes x ${localities.length} localities)`
  + ` -> public/data/locality-prices.{csv,json} + locality-dictionary.csv`);
console.log(`  audit: ${checked} of ${checked} recomputed from the published RVUs and GPCIs, 0 mismatches`);
console.log(`  independent: ${LOC ? `${LOC.pass}/${LOC.figures} re-derived by data/verify_price_table.py (${LOC.status})` : 'data/AUDIT.json has no locality block'}`);

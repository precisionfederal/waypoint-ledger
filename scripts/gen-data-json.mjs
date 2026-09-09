/* ==========================================================================
   /data.json — the DCAT-US v1.1 catalog, so a data.gov harvester finds us.

   R3's scale adversary: "we publish four open-data files and a register API and
   are invisible to the one catalog every federal and state data office actually
   uses." A catalog is how an agency's data steward discovers, cites and
   re-publishes a dataset without asking anyone's permission. This writes one.

   THE STANDARD, verified 2026-09-09:
     schema   https://resources.data.gov/schemas/dcat-us/v1.1/schema/catalog.json
              (identical bytes at https://project-open-data.cio.gov/v1.1/schema/…)
     guidance https://resources.data.gov/resources/dcat-us/
   The five federal-only fields (bureauCode, programCode, dataQuality,
   primaryITInvestmentUII, systemOfRecords) are deliberately absent. Verbatim
   from the guidance page above: "Non-federal data publishers are encouraged to
   make use of this schema, but these fields should not be seen as required and
   may not be relevant for those entities." We are a company, not an agency, and
   a made-up OMB Circular A-11 bureau code would be exactly the kind of invented
   federal number this whole product exists to refuse.

   Every number and date in the catalog is READ from the published files, never
   typed here, so the catalog cannot drift from what is actually on the site.
   tests/data-json.test.ts validates the output against the vendored schema.

   Run:  node scripts/gen-data-json.mjs        (also from cf/build-static.sh)
   ========================================================================== */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://waypoint-ledger.pages.dev';
const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
const PUBLISHER = { '@type': 'org:Organization', name: 'Precision Delivery Federal LLC' };
const CONTACT = { '@type': 'vcard:Contact', fn: 'Bo Peng', hasEmail: 'mailto:bo@precisionfederal.com' };

const read = (p) => JSON.parse(readFileSync(ROOT + p, 'utf8'));

const price = read('public/data/price-table.json');
const loc = read('public/data/locality-prices.json');
const dict = read('public/data/dictionary.json');

/* The federal files the price table actually cites, in the order they appear.
   When a builder adds a row from a new agency file, it lands here by itself. */
const sourceUrls = [...new Set(price.items.map((i) => i.source_url).filter(Boolean))];
const agencies = [...new Set(price.items.map((i) => i.agency_display || i.agency).filter(Boolean))];

/** A published file on this site. */
const dist = (path, mediaType, format, title, description) => ({
  '@type': 'dcat:Distribution',
  downloadURL: SITE + path,
  mediaType,
  format,
  title,
  description,
});
/** An endpoint rather than a file. */
const api = (path, title, description) => ({
  '@type': 'dcat:Distribution',
  accessURL: SITE + path,
  mediaType: 'application/json',
  format: 'JSON API',
  title,
  description,
  conformsTo: SITE + '/api/openapi.json',
});

const dataset = (d) => ({
  '@type': 'dcat:Dataset',
  accessLevel: 'public',
  license: CC0,
  publisher: PUBLISHER,
  contactPoint: CONTACT,
  language: ['en-US'],
  spatial: 'United States',
  theme: ['health'],
  accrualPeriodicity: 'irregular',
  landingPage: SITE + '/adopt',
  ...d,
});

const catalog = {
  '@context': 'https://project-open-data.cio.gov/v1.1/schema/catalog.jsonld',
  '@id': SITE + '/data.json',
  '@type': 'dcat:Catalog',
  conformsTo: 'https://project-open-data.cio.gov/v1.1/schema',
  describedBy: 'https://project-open-data.cio.gov/v1.1/schema/catalog.json',
  dataset: [
    dataset({
      identifier: SITE + '/data/price-table.csv',
      title: 'Waypoint Ledger price table: published U.S. federal figures for units of care',
      description:
        `${price.rows} rows. Each row is one unit of care — an office visit, a lab, an imaging study — `
        + 'carrying a single published federal dollar figure and, beside it, the file that figure was read '
        + 'from, the year, the basis (allowed amount, payment, charge, out-of-pocket, facility cost), the '
        + 'population the figure describes and the rules that say whether it may be added to another row. '
        + 'Nothing is estimated, modelled, inflated or interpolated: data/verify_price_table.py re-derives '
        + `every row from the file it cites and exits non-zero if one does not reproduce (${price.audit.pass} `
        + `of ${price.audit.rows} reproduced on ${price.audit.generated}). `
        + `Published by ${agencies.length} bodies, chiefly CMS and AHRQ. Table version ${price.table_version}.`,
      keyword: ['health care costs', 'price transparency', 'medicare', 'physician fee schedule',
        'clinical laboratory fee schedule', 'cost of illness', 'diagnostic odyssey', 'CPT', 'HCPCS',
        'open data', 'provenance'],
      modified: price.generated,
      issued: price.generated,
      describedBy: SITE + '/data/price-dictionary.csv',
      describedByType: 'text/csv',
      references: sourceUrls,
      distribution: [
        dist('/data/price-table.csv', 'text/csv', 'CSV', 'price-table.csv',
          'One row per unit of care, with its figure, basis, year, population and source URL.'),
        dist('/data/price-table.json', 'application/json', 'JSON', 'price-table.json',
          'The same rows with the confidence and basis legends, the combination rules and the verification audit.'),
        api('/api/table', 'GET /api/table',
          'The whole table with provenance, cacheable for an hour. Add ?locality=IA-00 or ?state=IA and every '
          + 'row comes back as the Medicare allowed amount for that CMS payment locality, with the three '
          + 'geographic indices and the formula that produced it.'),
      ],
    }),
    dataset({
      identifier: SITE + '/data/locality-prices.csv',
      title: `Medicare allowed amounts for ${loc.codes} services in all ${loc.locality_count} CMS payment localities`,
      description:
        `${loc.rows} figures: ${loc.codes} CPT/HCPCS codes priced for each of the ${loc.locality_count} Medicare `
        + `payment localities across ${loc.states} states and territories. Every figure is CMS's own formula — `
        + `${loc.formula} — applied to CMS's own published relative value units and geographic practice cost `
        + 'indices, which are printed on the same row together with the SHA-256 of each source file. The '
        + `generator is also the audit: it recomputed all ${loc.audit.figures_checked} figures on `
        + `${loc.audit.ran} and found ${loc.audit.mismatches} mismatches, and exits non-zero on one cent of `
        + 'drift. For a person who is not on Medicare this is a published reference price, not a bill; for a '
        + 'person on Medicaid it does not describe what their state pays at all.',
      keyword: ['medicare', 'physician fee schedule', 'geographic practice cost index', 'GPCI', 'RVU',
        'payment locality', 'health care prices', 'geography', 'open data', 'reproducible'],
      modified: loc.generated,
      issued: loc.generated,
      describedBy: SITE + '/data/locality-dictionary.csv',
      describedByType: 'text/csv',
      isPartOf: SITE + '/data/price-table.csv',
      references: [loc.sources.rvu.url, loc.sources.rvu.landing, loc.sources.gpci.url, loc.sources.gpci.landing]
        .filter(Boolean)
        .filter((u, i, a) => a.indexOf(u) === i),
      distribution: [
        dist('/data/locality-prices.csv', 'text/csv', 'CSV', 'locality-prices.csv',
          'One row per code per locality, with the RVUs, the GPCIs, the formula string and the audit status.'),
        dist('/data/locality-prices.json', 'application/json', 'JSON', 'locality-prices.json',
          'The same figures with the source file hashes and the audit block.'),
        api('/api/localities', 'GET /api/localities',
          'The index of all 109 localities with their Medicare Administrative Contractor and their three '
          + 'geographic indices; GET /api/localities/IA-00 for one.'),
      ],
    }),
    dataset({
      identifier: SITE + '/api/export/corrections.csv',
      title: 'Waypoint Ledger register: corrections to published federal figures',
      description:
        'Where a member of the public says a published federal figure does not describe them. One row per '
        + 'correction, bound to the price row it disputes and to the table version that was on screen, with '
        + 'the coverage and state context the person chose. Each row carries a hash chained to the row before '
        + 'it, so a reader can prove nothing was quietly changed or removed. Free text is never published. '
        + 'Counts under 11 in a named place are withheld, and the withholding is itself counted rather than '
        + 'hidden. This file is the demand signal a publishing agency can act on: /api/citation/{id} renders '
        + 'any one row as a paste-ready correction report naming the body that published the number.',
      keyword: ['data quality', 'public feedback', 'price transparency', 'corrections', 'crowdsourced',
        'health care costs', 'open data'],
      modified: price.generated,
      issued: price.generated,
      accrualPeriodicity: 'irregular',
      describedBy: SITE + '/data/dictionary.csv',
      describedByType: 'text/csv',
      landingPage: SITE + '/register',
      distribution: [
        dist('/api/export/corrections.csv', 'text/csv', 'CSV', 'corrections.csv',
          'Every published correction, with its row hash.'),
        api('/api/corrections', 'GET /api/corrections', 'The same records as counts per price row.'),
      ],
    }),
    dataset({
      identifier: SITE + '/api/export/gap.csv',
      title: 'Waypoint Ledger register: care that happened and no federal file prices',
      description:
        'Counted absences. Where a person names care they received, or a condition they live with, for which '
        + 'no published federal figure exists, the absence is recorded as a count in a named category rather '
        + 'than filled with the nearest available number. An absence you count is data; an absence you fill is '
        + 'a fabrication. Free text is never published and small cells are suppressed.',
      keyword: ['data gaps', 'cost of illness', 'unpriced care', 'invisible illness', 'public feedback',
        'open data'],
      modified: price.generated,
      issued: price.generated,
      accrualPeriodicity: 'irregular',
      describedBy: SITE + '/data/dictionary.csv',
      describedByType: 'text/csv',
      landingPage: SITE + '/register',
      distribution: [
        dist('/api/export/gap.csv', 'text/csv', 'CSV', 'gap.csv', 'Every published care-gap report.'),
        api('/api/gap', 'GET /api/gap', 'The same records as counts per category.'),
      ],
    }),
    dataset({
      identifier: SITE + '/api/export/survey.csv',
      title: 'Waypoint Ledger register: which burden weighed most, ranked by the people carrying it',
      description:
        'Responses to a published instrument that asks a person living with a long-undiagnosed illness to rank '
        + 'the kinds of burden — money spent, work lost, care never received, time — against each other. The '
        + 'point is the weighting: any total that combines kinds of burden needs a stated basis, and this is '
        + 'ours, published as a count with its N rather than asserted. Each response carries the channel it '
        + 'came through, so one community’s answers are separable from another’s by anyone reading the file. '
        + 'The exact wording of every question and every response option is in the dictionary. Free text is '
        + 'never published and small cells are suppressed.',
      keyword: ['patient reported', 'burden of illness', 'survey', 'weighting', 'community engagement',
        'invisible illness', 'open data'],
      modified: dict.generated || price.generated,
      issued: price.generated,
      accrualPeriodicity: 'irregular',
      describedBy: SITE + '/data/dictionary.csv',
      describedByType: 'text/csv',
      landingPage: SITE + '/register',
      distribution: [
        dist('/api/export/survey.csv', 'text/csv', 'CSV', 'survey.csv', 'Every published response.'),
        api('/api/survey', 'GET /api/survey', 'The rankings as counts, with the N.'),
      ],
    }),
    dataset({
      identifier: SITE + '/data/dictionary.csv',
      title: 'Waypoint Ledger data dictionary: every published column, and the instrument itself',
      description:
        'What each column in each published file means, in plain words, and the full text of the burden '
        + 'instrument — every question, every response option, every skip — so a reviewer can read the '
        + 'questions without running the site or trusting our description of them. Generated from the '
        + 'database schema and the write-path validators, not written by hand: a column with no plain-English '
        + 'line fails the build.',
      keyword: ['data dictionary', 'codebook', 'metadata', 'survey instrument', 'open data'],
      modified: dict.generated || price.generated,
      issued: price.generated,
      landingPage: SITE + '/privacy',
      distribution: [
        dist('/data/dictionary.csv', 'text/csv', 'CSV', 'dictionary.csv',
          'The instrument and the register columns.'),
        dist('/data/dictionary.json', 'application/json', 'JSON', 'dictionary.json', 'The same, as JSON.'),
        dist('/data/price-dictionary.csv', 'text/csv', 'CSV', 'price-dictionary.csv',
          'Column meanings for price-table.csv.'),
        dist('/data/locality-dictionary.csv', 'text/csv', 'CSV', 'locality-dictionary.csv',
          'Column meanings for locality-prices.csv, including the formula and the audit status.'),
      ],
    }),
  ],
};

writeFileSync(ROOT + 'public/data.json', JSON.stringify(catalog, null, 2) + '\n');

/* The licence a counsel reads has to be the licence in the tree — one file, two
   places, copied here so they cannot drift. tests/data-json.test.ts fails if
   they ever differ. */
for (const f of ['LICENSE', 'NOTICE']) {
  copyFileSync(ROOT + f, ROOT + `public/${f}`);
  copyFileSync(ROOT + f, ROOT + `public/${f}.txt`);
}

const n = catalog.dataset.length;
const d = catalog.dataset.reduce((a, s) => a + (s.distribution?.length ?? 0), 0);
console.log(`public/data.json — DCAT-US v1.1 catalog, ${n} datasets, ${d} distributions`);
console.log('public/LICENSE, public/NOTICE (+ .txt) copied from the tree');

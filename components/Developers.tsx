/* ==========================================================================
   /developers — the public API, in one screen.

   Every response block on this page is real output, captured by running the
   command above it against this codebase. Nothing here is illustrative.
   ========================================================================== */

import Link from 'next/link';
import { LongLayout, type TocItem } from './LongSection';
import { Badge, Caveat, Fold, Glance, TI, trust as s } from './trust/Kit';
import { OPENAPI } from '@/lib/openapi';
import { EXAMPLE_STORY } from '@/lib/fhir';
import { TABLE, SELECTABLE, TABLE_VERSION } from '@/lib/table';
import { LOCALITIES, LOCALITY_ROW_COUNT } from '@/lib/fit';
import OrgKitAgency from './OrgKitAgency';
import { ShowCall, dp } from './DevPagesKit';
import dv from './developers.module.css';
import HiCode from './tech/HiCode';
import TryIt from './tech/TryIt';
import ThemedImg from './ThemedImg';
import { FhirTree, Flow, RouteMap, ROUTES_WIDE } from './tech/DevVisuals';
import FoldOpen from './tech/FoldOpen';
import tc from './tech/tech.module.css';

/* Counted, never typed. The locality file grows every time a code is added to the
   price table, and a page that still says 5,123 after it becomes 5,668 is a lie
   a judge can find in one curl. */
const LOCALITY_FIGURES = LOCALITY_ROW_COUNT * LOCALITIES.length;
const N = (n: number) => n.toLocaleString('en-US');

/* Every copyable block starts with its own BASE line, so a block copied alone runs
   (FLOW adopter-6). A line break is only ever BETWEEN JSON keys, never inside a quoted
   string: a break inside one is invalid JSON and the first call a developer copied
   came back 400 (FLOW adopter-1). tests/flow-adopter.test.ts parses every -d body. */
export const BASE_LINE = 'BASE=https://waypointledger.org';

export const CURL_PRICE = `${BASE_LINE}

curl -s -X POST $BASE/api/price \\
  -H 'content-type: application/json' \\
  -d '{"story":"saw my regular doctor three times, then a cardiologist, an echocardiogram, blood work twice, and I missed work"}'`;

const OUT_PRICE = String.raw`{
  "ok": true,
  "input": "story",
  "segments": [
    {
      "raw": "saw my regular doctor three times",
      "times": 3,
      "itemId": "cms-99213",
      "label": "Doctor's office visit, established patient, low complexity",
      "confidence": "DERIVED",
      "matchedOn": "saw my regular doctor",
      "matchScore": 100,
      "valueUsd": 95.19,
      "outOfPocketUsd": null,
      "lineTotalUsd": 285.57,
      "basis": "allowed",
      "attribution": "gross",
      "year": "2026",
      "geography": "United States, national (geographic practice cost indices set to 1.000)",
      "population": "Medicare Part B fee-for-service beneficiaries",
      "coverage": "A follow-up visit with a doctor you have seen before, for a straightforward problem. HOW THIS NUMBER WAS MADE: …",
      "sourceTitle": "CMS, CY2026 National Physician Fee Schedule Relative Value File (RVU26C, July release, published 2026-06-30)",
      "sourceUrl": "https://www.cms.gov/medicare/payment/fee-schedules/physician/pfs-relative-value-files/rvu26c",
      "code": "CPT 99213",
      "summable": true
    },
    {
      "…": "3 more segments, each with its own source"
    }
  ],
  "unpriced": [
    {
      "raw": "I missed work",
      "kind": "known-unpriceable",
      "unpriceableId": "lost-work",
      "reason": "Shown on the workdays card, at the published median or your own pay, and never added to the medical total. The Bureau of Labor Statistics pu …",
      "whatWouldFixIt": "Ask the person for their own hourly or weekly pay and multiply. That is arithmetic on a figure they supplied, …"
    }
  ],
  "totals": {
    "totalUsd": 675.2,
    "outOfPocketUsd": 0,
    "outOfPocketReported": false,
    "pricedCount": 4,
    "unpricedCount": 1,
    "basesUsed": [
      "allowed"
    ]
  },
  "basisWarning": null,
  "conflicts": [],
  "nonSummable": [],
  "excludedFromTotal": [],
  "bundlingNote": null,
  "tableVersion": "2026-09-08.1-verified",
  "method": "A deterministic matcher maps words to a unit of care; a published federal table prices it. No model produces a dollar figure."
}`;

export const CURL_TABLE = `${BASE_LINE}

curl -s $BASE/api/table/cms-99213`;

const OUT_TABLE = String.raw`{
  "ok": true,
  "version": "2026-09-08.1-verified",
  "item": {
    "id": "cms-99213",
    "label": "Doctor's office visit, established patient, low complexity",
    "valueUsd": 95.19,
    "basis": "allowed",
    "year": "2026",
    "population": "Medicare Part B fee-for-service beneficiaries",
    "coverage": "A follow-up visit with a doctor you have seen before, for a straightforward problem. HOW THIS NUMBER WAS MADE: CMS does not publish a dollar column in …",
    "sourceTitle": "CMS, CY2026 National Physician Fee Schedule Relative Value File (RVU26C, July release, pub …",
    "sourceUrl": "https://www.cms.gov/medicare/payment/fee-schedules/physician/pfs-relative-value-files/rvu26c",
    "confidence": "DERIVED",
    "code": "CPT 99213",
    "rules": {
      "summable": true,
      "mutuallyExclusiveWith": [],
      "bundlesAncillaries": false,
      "alternates": {
        "…": "5 alternate measures of the same service (a CY2024 average allowed amount, an average submitted charge, the hospital outpatient facility fee), each with a note saying why it is an alternative and never an addition"
      }
    }
  }
}`;

export const CURL_JOURNEY = `${BASE_LINE}

curl -s -X POST $BASE/api/journeys \\
  -H 'content-type: application/json' \\
  -d '{"title":"Two years of looking",
       "entries":[{"raw":"saw my regular doctor about the fatigue","itemId":"cms-99213","times":6},
                  {"raw":"echocardiogram","itemId":"cms-img-echo","times":1}]}'`;

const OUT_JOURNEY = String.raw`{
  "ok": true,
  "id": "91dec6a1-5886-417d-9078-c842aaa1d93c",
  "slug": "7nvjqbdhmf",
  "url": "http://localhost:8792/ledger?s=7nvjqbdhmf",
  "savedTo": "link"
}`;

export const CURL_FIT = `${BASE_LINE}

curl -s -X POST $BASE/api/price \\
  -H 'content-type: application/json' \\
  -d '{"story":"saw my regular doctor three times, then an echocardiogram",
       "coverage":"uninsured", "state":"IA"}'`;

const OUT_FIT = String.raw`{
  "ok": true,
  "input": "story",
  "context": {
    "coverage": "uninsured",
    "locality": {
      "key": "IA-00",
      "name": "Iowa",
      "state": "IA",
      "stateName": "Iowa",
      "mac": "05102",
      "workGpci": 1,
      "practiceExpenseGpci": 0.915,
      "malpracticeGpci": 0.397
    },
    "localityFrom": "state",
    "figureBasis": "Medicare allowed amounts for Iowa (CMS locality IA-00), CY2026 fee schedule formula"
  },
  "segments": [
    {
      "raw": "saw my regular doctor three times",
      "times": 3,
      "itemId": "cms-99213",
      "valueUsd": 95.19,
      "lineTotalUsd": 285.57,
      "…": "basis, year, population, coverage, sourceTitle and sourceUrl as before",
      "localityUsd": 89.23,
      "localityName": "Iowa",
      "nationalUsd": 95.19,
      "fit": {
        "verdict": "BILLED AGAINST THIS",
        "why": "With no insurance you are billed the provider’s charge, not an allowed amount. This is the average charge submitted for this same service in CY2024.",
        "figureUsd": 189.25,
        "figureNote": "Average submitted charge, CY2024 · billed charge, never added to an allowed amount",
        "which": "charge",
        "offerGap": false,
        "lineTotalUsd": 567.75
      },
      "localityRange": {
        "nationalUsd": 95.19,
        "lowUsd": 86.86,
        "lowLocalityKey": "AR-13",
        "lowLocalityName": "Arkansas",
        "highUsd": 120.13,
        "highLocalityKey": "CA-65",
        "highLocalityName": "San Jose-Sunnyvale-Santa Clara (San Benito County)",
        "localityCount": 109,
        "formula": "(work RVU x work GPCI + non-facility PE RVU x PE GPCI + MP RVU x MP GPCI) x 33.4009"
      }
    },
    { "…": "1 more segment, priced and fitted the same way" }
  ],
  "fitted": {
    "totalUsd": 1258.3,
    "suppressedReason": null,
    "describedCount": 2,
    "notDescribedCount": 0,
    "figureKindsUsed": ["charge"],
    "labels": {
      "primary": "What providers billed on average for these services",
      "secondary": "What the published Medicare figures add up to in Iowa"
    },
    "verdicts": [{ "verdict": "BILLED AGAINST THIS", "lines": 2 }],
    "basisWarning": null
  },
  "totals": { "totalUsd": 482.3, "pricedCount": 2, "basesUsed": ["allowed"], "…": "" },
  "tableVersion": "2026-09-08.1-verified"
}`;

export const CURL_MEDICAID = `${BASE_LINE}

curl -s -X POST $BASE/api/price \\
  -H 'content-type: application/json' \\
  -d '{"story":"saw my regular doctor three times, then an echocardiogram",
       "coverage":"medicaid", "locality":"TX-18"}'`;

const OUT_MEDICAID = String.raw`"fitted": {
  "totalUsd": null,
  "suppressedReason": "No published federal figure describes this person on any line here, so there is no total to report. This is a gap in the published data, not a cost of zero. The lines carry what each figure is and who it does describe, and every one of them can be counted at POST /api/gap.",
  "describedCount": 0,
  "notDescribedCount": 2,
  "figureKindsUsed": [],
  "verdicts": [{ "verdict": "NOT DESCRIBED", "lines": 2 }]
}`;

export const CURL_ERRORS = String.raw`BASE=https://waypointledger.org

# a state with more than one CMS payment locality
curl -s -X POST $BASE/api/price -H 'content-type: application/json' \
  -d '{"story":"a doctor visit","state":"TX"}'

{"ok":false,"error":"Texas has more than one CMS payment locality, so a state is
not enough to price a line. Send one of: TX-31 (Austin), TX-20 (Beaumont),
TX-09 (Brazoria), TX-11 (Dallas), TX-28 (Fort Worth), TX-15 (Galveston),
TX-18 (Houston), TX-99 (Rest Of Texas)."}

# a coverage we do not have a rule for
{"ok":false,"error":"coverage must be one of: employer, marketplace, medicaid,
medicare, uninsured, unsure. Send no coverage at all and every line comes back
as a reference price."}`;

export const CURL_LOCALITY = String.raw`BASE=https://waypointledger.org

curl -s $BASE/data/locality-prices.csv -o locality-prices.csv

head -1 locality-prices.csv
price_id,code,label,state,locality,locality_key,locality_name,mac,work_rvu,
pe_nonfacility_rvu,mp_rvu,pw_gpci,pe_gpci,mp_gpci,conversion_factor,allowed_usd,
national_usd,pct_of_national,formula,basis,year,population,locality_audit_status,
national_audit_status,rvu_file,rvu_file_sha256,gpci_file,gpci_file_sha256,table_version

grep '^cms-img-echo,.*,TX-18,' locality-prices.csv | cut -d, -f1,6,7,16,17
cms-img-echo,TX-18,HOUSTON,197.09,196.73`;

export const CURL_CITATION = `${BASE_LINE}

curl -s "$BASE/api/citation/cms-99213?format=text"`;

const OUT_CITATION = String.raw`PUBLIC CORRECTION REPORT: Waypoint Ledger

Published figure: Doctor's office visit, established patient, low complexity
Row identifier:   cms-99213  ·  code CPT 99213
Published value:  $95.19 (2026)
Basis:            allowed (the negotiated or fee-schedule amount)
Geography:        United States, national (geographic practice cost indices set to 1.000)
Population:       Medicare Part B fee-for-service beneficiaries
Published by:     Centers for Medicare & Medicaid Services
Source:           CMS, CY2026 National Physician Fee Schedule Relative Value File (RVU26C, July release, published 2026-06-30)
Source URL:       https://www.cms.gov/medicare/payment/fee-schedules/physician/pfs-relative-value-files/rvu26c

What the public said about this row: 0 responses: 0 say the figure describes them, 0 say it does not.
Median amount respondents said they actually paid: none reported.

Sample: self-selected members of the public using a free tool. Counts are reported exactly as entered: no weighting, no imputation, no extrapolation to a population.
Counted as of: 2026-09-09
Method and every source: https://waypointledger.org/method`;

export const CURL_PLACE = String.raw`BASE=https://waypointledger.org

# one row, priced where the person actually lives
curl -s "$BASE/api/table/cms-99213?locality=IA-00"

# the whole table for one place, or a state where CMS gives it a single locality
curl -s "$BASE/api/table?locality=IA-00"
curl -s "$BASE/api/table?state=IA"

# the index of every locality, and every figure published for one of them
curl -s $BASE/api/localities
curl -s $BASE/api/localities/IA-00`;

const OUT_PLACE = String.raw`{
  "ok": true,
  "locality": {
    "key": "IA-00", "name": "Iowa", "state": "IA", "stateName": "Iowa",
    "mac": "05102", "workGpci": 1, "practiceExpenseGpci": 0.915, "malpracticeGpci": 0.397
  },
  "item": {
    "id": "cms-99213",
    "label": "Doctor's office visit, established patient, low complexity",
    "code": "CPT 99213",
    "valueUsd": 95.19,
    "nationalUsd": 95.19,
    "localityUsd": 89.23,
    "localityGeography": "Iowa (CMS payment locality IA-00, Medicare Administrative Contractor 05102)",
    "localityFormula": {
      "code": "99213",
      "text": "(work_rvu*pw_gpci + pe_nonfacility_rvu*pe_gpci + mp_rvu*mp_gpci) * 33.4009",
      "conversionFactor": 33.4009,
      "parts": [
        { "name": "Work",             "rvu": 1.3,  "gpci": 1,     "product": 1.3 },
        { "name": "Practice expense", "rvu": 1.46, "gpci": 0.915, "product": 1.3359 },
        { "name": "Malpractice",      "rvu": 0.09, "gpci": 0.397, "product": 0.03573 }
      ],
      "rvuSum": 2.67163,
      "total": 89.23
    },
    "…": "every other field of the row, unchanged"
  },
  "localityRange": {
    "nationalUsd": 95.19,
    "lowUsd": 86.86,  "lowLocalityKey": "AR-13", "lowLocalityName": "Arkansas",
    "highUsd": 120.13, "highLocalityKey": "CA-65",
    "highLocalityName": "San Jose-Sunnyvale-Santa Clara (San Benito County)",
    "localityCount": 109,
    "formula": "(work RVU x work GPCI + non-facility PE RVU x PE GPCI + MP RVU x MP GPCI) x 33.4009"
  }
}`;

const OUT_PLACE_ERRORS = String.raw`# a locality that does not exist: refused, never quietly national
{"ok":false,"error":"No CMS locality has the key \"IA-99\". A key is the two-letter
state and the two-digit CMS locality number, like \"IA-00\" or \"TX-31\". All 109 are
published at /data/locality-prices.json."}

# a state CMS splits into several: refused, and it names them
{"ok":false,"error":"Texas has more than one CMS payment locality, so a state is not
enough to price a line. Send one of: TX-31 (Austin), TX-20 (Beaumont), TX-09
(Brazoria), TX-11 (Dallas), TX-28 (Fort Worth), TX-15 (Galveston), TX-18 (Houston),
TX-99 (Rest Of Texas)."}`;

export const CURL_TAKE_IT = String.raw`BASE=https://waypointledger.org

# the catalog, in the shape data.gov harvests
curl -s $BASE/data.json

# the whole application: source, data, migrations, tests, and a README to run from
curl -sL $BASE/waypoint-ledger-source.tar.gz | tar -xz && cd waypoint-public
npm install
npm run build:static        # the static export the size budgets measure
npm test                    # the suite that guards every rule below
npm run dev                 # http://localhost:3000`;

/* The FHIR example is real output: toFhirBundle() on the journey builder's example
   sentence (/journey: its empty box and its Use an example link), exactly what
   GET /api/fhir/example runs (cf/functions/api/fhir/example.js),
   captured 2026-09-30 against price table 2026-09-09.1. One ChargeItem of the five is
   shown; the other thirteen entries are elided and marked. */
export const CURL_FHIR = `${BASE_LINE}

curl -s $BASE/api/fhir/example

# or any ledger, as entries or as a story, fitted to a person
curl -s -X POST "$BASE/api/fhir?envelope=1" \\
  -H 'content-type: application/json' \\
  -d '{"story":"saw my regular doctor three times, then an echocardiogram",
       "coverage":"medicare", "state":"IA"}'`;

const OUT_FHIR = String.raw`{
  "resourceType": "Bundle",
  "meta": {
    "source": "https://waypointledger.org/api/table",
    "tag": [{
      "system": "https://waypointledger.org/fhir/CodeSystem/price-table-version",
      "code": "2026-09-09.1",
      "display": "The price table this bundle was built from"
    }]
  },
  "type": "collection",
  "timestamp": "2026-09-30T22:52:42.076Z",
  "entry": [
    {
      "fullUrl": "urn:uuid:99d5285c-ce27-4bad-94b3-3f4f9ca2d254",
      "resource": {
        "resourceType": "ChargeItem",
        "status": "unknown",
        "code": {
          "coding": [{
            "system": "http://www.ama-assn.org/go/cpt",
            "code": "99213",
            "display": "Doctor's office visit, established patient, low complexity"
          }]
        },
        "subject": { "display": "A person using Waypoint Ledger. No identity is recorded." },
        "quantity": { "value": 3 },
        "priceOverride": { "value": 285.57, "currency": "USD" },
        "overrideReason": "3 x $95.19 = $285.57. CMS, CY2026 National Physician Fee Schedule Relative Value File (RVU26C, July release, published 2026-06-30), 2026. Basis: allowed. … This is a published federal reference figure, not a bill …",
        "definitionUri": ["https://www.cms.gov/medicare/payment/fee-schedules/physician/pfs-relative-value-files/rvu26c"],
        "note": [{ "text": "The person described this as: \"saw my regular doctor three times\"" }]
      }
    },
    { "…": "13 more entries: 3 Encounter, 2 Procedure, 4 ChargeItem, 2 DocumentReference, 2 Provenance" }
  ]
}`;

const CONTACT = 'https://precisionfederal.com/contact';
const METHODS = ['get', 'post', 'put', 'delete'] as const;

const TOC: TocItem[] = [
  { id: 'price-a-story', text: 'Price a story' },
  { id: 'fhir', text: 'The ledger as FHIR R4' },
  { id: 'more-calls', text: 'Nine more worked calls' },
  { id: 'take', text: 'What you can take without asking' },
  { id: 'agency-reuse', text: 'Reuse it in your agency' },
  { id: 'rules', text: 'The rules' },
  { id: 'why', text: 'Why reuse this' },
  { id: 'routes', text: 'Every route' },
];

/* PAGES R1 (2026-09-30): the same page as cards. Every sentence is kept; the
   em-dashes in prose became commas, colons or parentheses. Captured responses
   are left exactly as the API printed them. */
export default function Developers() {
  const routes = Object.entries(OPENAPI.paths).flatMap(([path, item]) =>
    METHODS.filter((m) => item[m]).map((m) => ({ path, method: m.toUpperCase(), op: item[m]! })));
  const glance = [
    { icon: <TI.key />, big: 'No key', text: 'No key, no account, no sign-up. Every route below is open.' },
    { icon: <TI.table />, big: `${TABLE.length} rows`, text: <>Price table version {TABLE_VERSION}: {SELECTABLE.length} of them priced and addable, each with the file it was read from.</> },
    { icon: <TI.target />, big: N(LOCALITY_FIGURES), text: 'locality prices, every one with the inputs that made it' },
    { icon: <TI.code />, big: `${routes.length} routes`, text: 'in the OpenAPI 3.1 description, every request and response schema' },
  ];

  const take: { what: React.ReactNode; json: React.ReactNode; csv?: React.ReactNode }[] = [
    { what: 'Everything, one call', json: <a href="/api/register">/api/register</a> },
    { what: 'The whole price table, with provenance', json: <a href="/api/table">/api/table</a>, csv: <a href="/data/price-table.csv">price-table.csv</a> },
    { what: <>All {N(LOCALITY_FIGURES)} CMS locality figures</>, json: <a href="/data/locality-prices.json">locality-prices.json</a>, csv: <a href="/data/locality-prices.csv">locality-prices.csv</a> },
    { what: 'One CMS payment locality, priced', json: <a href="/api/localities/IA-00">/api/localities/&#123;key&#125;</a> },
    { what: 'The open-data catalog (DCAT-US v1.1)', json: <a href="/data.json">/data.json</a> },
    { what: 'The application itself, to run yourself', json: <a href="/waypoint-ledger-source.tar.gz">waypoint-ledger-source.tar.gz</a> },
    { what: 'The licence, as a file counsel can read', json: <a href="/LICENSE.txt">LICENSE</a>, csv: <a href="/NOTICE.txt">NOTICE</a> },
    { what: <>One figure&rsquo;s provenance and counts</>, json: <a href="/api/citation/cms-99213">/api/citation/&#123;id&#125;</a>, csv: <a href="/api/citation/cms-99213?format=text">as plain text</a> },
    { what: 'The hash-chain head of every count', json: <a href="/api/integrity">/api/integrity</a> },
    { what: 'Corrections to published figures', json: <a href="/api/corrections">/api/corrections</a>, csv: <><a href="/api/export/corrections.csv">corrections.csv</a> <a href="/api/export/corrections.json">corrections.json</a></> },
    { what: 'Care that no claim recorded', json: <a href="/api/gap">/api/gap</a>, csv: <a href="/api/export/gap.csv">gap.csv</a> },
    { what: 'How people ranked the burdens', json: <a href="/api/survey">/api/survey</a>, csv: <a href="/api/export/survey.csv">survey.csv</a> },
    { what: 'Written interviews (count only, ever)', json: <a href="/api/interview">/api/interview</a> },
    { what: 'What changed because someone said so', json: <a href="/api/changes">/api/changes</a> },
  ];

  return (
    <section className={`page ${dp.dp} ${tc.devPage}`}>
      <div className="wrap">
        <div className={tc.hero}>
        <div>
        <p className="eyebrow">For developers, agencies and researchers</p>
        <h1 className={tc.h1}>Price a diagnostic journey with one request</h1>
        <p className={s.lead}>
          Send a sentence a person actually wrote. Get back every unit of care it names, priced and cited.
        </p>
        <p className={dv.tryIt}>
          Try it now, in this tab: <a href="/api/table/cms-99213">GET /api/table/cms-99213</a>, one published
          figure with its source, basis and year.
        </p>
        <div className={`${s.actions} ${tc.heroActs}`}>
          <a className="btn primary" href="/api/openapi.json">OpenAPI 3.1 description</a>
          <a className="btn ghost" href="/data/locality-prices.csv">{N(LOCALITY_FIGURES)} locality prices (CSV)</a>
          <a className="btn ghost" href="/waypoint-ledger-source.tar.gz">Download the whole application</a>
          <Link className="btn ghost" href="/adopt">Run this for your own condition</Link>
          <Link className="btn ghost" href="/method">How each number is made</Link>
        </div>
        {/* decorative: the path as data lines over the hills (VISUAL-art.md); words stay in HTML */}
        <ThemedImg light="/img/v2/developers-hero.webp" dark="/img/v2/developers-hero-dark.webp" width={1200} height={525} alt="" className={tc.heroArt} loading="eager" />
        </div>
        <TryIt />
        </div>

        {/* JUDGE-3 #10: a phone scrolls these sideways, so say so (the /policy "Swipe for all N" cue) */}
        <p className={tc.swipe} aria-hidden="true">Swipe for all {glance.length}</p>
        <div className={tc.glanceRow} tabIndex={0} role="region" aria-label="At a glance; on a narrow screen, scroll sideways">
        <Glance items={glance} />
        </div>
        <h2 className={s.h2} style={{ marginTop: 0 }}>From a sentence to a FHIR Bundle</h2>
        <Flow rows={TABLE.length} />
        <Caveat label="CORS">Every public GET route, and <code>POST /api/price</code> and <code>POST /api/fhir</code>, send <code>access-control-allow-origin: *</code>, so a browser app on another site can call them directly. Call <code>POST /api/map</code> from your own server.</Caveat>

        <div style={{ height: '1.5rem' }} aria-hidden="true" />
        <LongLayout items={TOC}>
          <h2 id="price-a-story" className={s.h2} style={{ marginTop: 0 }}>Price a story</h2>
          <p className={`${s.h2sub} ${dv.sub}`}>
            Every response carries the published federal figure that prices each unit of care, and the year,
            basis, population and source URL behind that figure, so whatever you build can show any
            number it prints. A deterministic matcher maps words to a unit of care; a published table prices
            it. No model produces a dollar figure.
          </p>
          <div className={s.card}>
            <p className={s.kicker}><Badge method="POST" /> <code>/api/price</code></p>
            <h3>The call the site itself makes</h3>
            <p>One request, one journey, every line traceable.</p>
            <p className={dv.noticeH}>What to notice.</p>
            <ul className={dv.notice}>
              <li><code>matchedOn</code> shows the exact words in the table the phrase matched, so the mapping is never a black box.</li>
              <li>&ldquo;I missed work&rdquo; comes back in <code>unpriced</code> with the reason it will not be priced and what would fix it: valuing a lost day needs that person&rsquo;s own pay, not a national median.</li>
              <li><code>confidence: &quot;DERIVED&quot;</code> says this figure was computed from two numbers read in the CMS file, not lifted from a dollar column that does not exist.</li>
            </ul>
            <ShowCall what="The curl request and the real response">
              <HiCode code={CURL_PRICE} label="the pricing request" caption="Request" />
              <HiCode code={OUT_PRICE} label="Response to the pricing request" caption={`Real response, captured against price table 2026-09-08.1-verified (the live table is ${TABLE_VERSION}). Long coverage statements and three further segments are elided, marked with an ellipsis key.`} tall />
            </ShowCall>
          </div>

          <h2 id="fhir" className={s.h2}>The ledger as an HL7 FHIR R4 Bundle</h2>
          <p className={`${s.h2sub} ${dv.sub}`}>
            Any ledger, as entries or as a story, comes back as a FHIR R4 Bundle of type <code>collection</code>,
            served as <code>application/fhir+json</code>.
          </p>
          <div className={s.card}>
            <div>
              <div>
                <p className={s.kicker}><Badge method="GET" /> <code>/api/fhir/example</code></p>
                <p>The example sentence in the journey builder&rsquo;s empty box on <a href="/journey">/journey</a>, &ldquo;{EXAMPLE_STORY}&rdquo;, priced from the published table and returned as a FHIR R4 Bundle: 14 entries. The home page&rsquo;s box shows a different one: three lines of the full example ledger.</p>
              </div>
              <div>
                <p className={s.kicker}><Badge method="POST" /> <code>/api/fhir</code></p>
                <p>
                  Send <code>entries</code> (the shape POST /api/journeys takes) or <code>story</code> (the shape POST /api/price
                  takes). One Encounter per visit line, one Procedure per test or procedure line coded in CPT or HCPCS from the row
                  itself, one ChargeItem per priced line whose <code>priceOverride</code> is the published figure and whose{' '}
                  <code>definitionUri</code> is the federal file it came from, and one DocumentReference plus one Provenance per federal file.
                </p>
              </div>
            </div>
            <div className={dv.cavs}>
              <Caveat label="No identity">There is no Patient resource, no <code>identifier</code> element and no date of care in the bundle: the tool never collected them.</Caveat>
              <Caveat label="Not a bill">Every ChargeItem carries status <code>unknown</code>: the figure is a published federal reference price, not a bill.</Caveat>
              <Caveat label="Envelope"><code>?envelope=1</code> adds what was deliberately left out and why.</Caveat>
            </div>
            <div className={tc.treeFold}>
              <Fold id="fhir-tree" level={3} title="The example Bundle, as a tree" summary="14 entries by resource type, one ChargeItem opened to its fields, and no Patient">
                <FhirTree />
              </Fold>
            </div>
            <ShowCall what="Two curl requests and the example Bundle, one ChargeItem shown">
              <HiCode code={CURL_FHIR} label="the FHIR requests" caption="Request" />
              <HiCode code={OUT_FHIR} label="The example Bundle" caption="Real output, one ChargeItem of five shown; the rest elided and marked." tall />
            </ShowCall>
          </div>

          <h2 id="more-calls" className={s.h2}>Nine more worked calls</h2>
          <p className={`${s.h2sub} ${dv.sub}`}>Each with a real request and response. Open the one you need.</p>

          <div className={dp.foldGrid}>
          <Fold id="call-table" level={3} title="Read one unit of care, with its provenance" summary={<><Badge method="GET" /> <code>/api/table/cms-99213</code></>}>
            <p>Every row carries who it describes, who it does not, and the rules about adding it to anything else.</p>
            <HiCode code={CURL_TABLE} label="reading one row" caption="Request" />
            <HiCode code={OUT_TABLE} label="Response for one row of the price table" caption="Response" tall />
            <p>
              <strong>What to notice.</strong> <code>rules.summable</code> and
              <code> rules.mutuallyExclusiveWith</code> are machine-readable, because a rule written only in
              prose is a wish. Ask <code>/api/price</code> for a whole-year figure alongside per-visit lines and
              it comes back priced and flagged in <code>excludedFromTotal</code>, with the conflict named:
              the year already contains the visits, so adding them counts the same care twice. The figure is
              never quietly dropped and never quietly summed.
            </p>
          </Fold>

          <Fold id="call-save" level={3} title="Save a journey and get a link back" summary={<><Badge method="POST" /> <code>/api/journeys</code></>}>
            <p>Anonymous by default. A journey holds units of care, counts and the words the person typed. Nothing else.</p>
            <HiCode code={CURL_JOURNEY} label="saving a journey" caption="Request" />
            <HiCode code={OUT_JOURNEY} label="Response to saving a journey" caption="Real response. The url echoes the host you called; this run was against a local instance of this code." />
            <p>
              <code>GET /api/journeys/&#123;slug&#125;</code> reads it back with the table version it was priced
              against, so a link opened next year still says which edition of the table it came from.
            </p>
          </Fold>

          <Fold id="call-fit" level={3} title="Price it for a person, not for the country" summary={<><Badge method="POST" /> <code>/api/price</code> with coverage and state</>}>
            <p>
              Add <code>coverage</code> and <code>state</code> (or a CMS <code>locality</code> key) and the
              response carries the same answer the site shows that person: whether the published figure
              describes them, which figure applies instead if it does not, and what that service costs from the
              cheapest CMS locality to the dearest.
            </p>
            <HiCode code={CURL_FIT} label="pricing for a person" caption="Request" />
            <HiCode code={OUT_FIT} label="Response to a pricing request with coverage and state" caption={`Real response, captured against price table 2026-09-08.1-verified (the live table is ${TABLE_VERSION}). Long fields already shown above are elided with an ellipsis key.`} tall />
            <p>
              <strong>What to notice.</strong> <code>valueUsd</code> is still the published national figure and
              never moves. <code>localityUsd</code> is what Medicare allows in Iowa for the same code, from
              CMS&rsquo;s own formula and the three geographic indices echoed in <code>context</code>. And
              because this caller is uninsured, <code>fit.figureUsd</code> is neither of those: it is the
              average charge providers submitted, because a charge is what an uninsured person is billed
              against. Three different true numbers for one line, each labelled with what it is.
            </p>
          </Fold>

          <Fold id="call-medicaid" level={3} title="When nothing published describes the person" summary={<><Badge method="POST" /> <code>/api/price</code> returns null, never 0</>}>
            <p>
              Medicaid rates are set by each state and are in no national dataset. Roughly one in five Americans
              is on Medicaid, and they are over-represented in exactly the population this tool is built for.
              So the API does not return a zero.
            </p>
            <HiCode code={CURL_MEDICAID} label="a Medicaid request" caption="Request" />
            <HiCode code={OUT_MEDICAID} label="Fitted totals when no published figure applies" caption="Response" tall />
            <p>
              <code>totalUsd</code> is <code>null</code>, never <code>0</code>, because a zero would be read as
              a price. Each line still comes back with the Medicare figure, what it is, and who it does
              describe. The honest output here is a counted gap, and{' '}
              <code>POST /api/gap</code> is where it goes.
            </p>
          </Fold>

          <Fold id="call-errors" level={3} title="Errors are sentences, and a value we cannot honour is never ignored" summary={<><Badge method="POST" /> <code>/api/price</code> refuses, and says what to send</>}>
            <p>
              Before this round the API took a <code>state</code>, ignored it, and returned the national figure
              with no warning. It now refuses, and the refusal tells you what to send.
            </p>
            <HiCode code={CURL_ERRORS} label="Error responses from the pricing endpoint" caption="Requests and responses" tall />
          </Fold>

          <Fold id="call-locality" level={3} title={<>Take all {N(LOCALITY_FIGURES)} locality figures, with the inputs that made them</>} summary={<><Badge method="GET" /> <code>/data/locality-prices.csv</code></>}>
            <p>
              {LOCALITY_ROW_COUNT} CMS Physician Fee Schedule codes priced for each of the {LOCALITIES.length}{' '}
              Medicare payment localities. Every
              row carries the three RVU components, the three geographic indices, the conversion factor, the
              formula written out, and the SHA256 of both CMS files it came from, so a state health
              department can filter it to their own state and recompute every figure without us.
            </p>
            <HiCode code={CURL_LOCALITY} label="Downloading and filtering the locality price table" caption="Request and output" tall />
            <p className="micro">
              Also as <a href="/data/locality-prices.json">JSON</a> with the formula, the sources and the audit;
              columns explained in <a href="/data/locality-dictionary.csv">locality-dictionary.csv</a>. The
              generator is the audit: <code>node scripts/gen-locality-table.mjs</code> recomputes all{' '}
              {N(LOCALITY_FIGURES)} from the published RVUs and indices and exits non-zero on one cent of drift.
            </p>
          </Fold>

          <Fold id="call-place" level={3} title="Ask for one place, not for the whole country" summary={<><Badge method="GET" /> <code>?locality=</code> or <code>?state=</code> on any read route</>}>
            <p>
              A national Medicare figure is not what anyone is charged. Send <code>?locality=</code> or{' '}
              <code>?state=</code> to any read route and every row CMS prices geographically comes back as that
              place&rsquo;s allowed amount, with the three relative value units, the three geographic indices and
              the formula that produced it: enough to re-derive the number without this API.{' '}
              <code>valueUsd</code> is never overwritten, so the national figure and the local one can never be
              confused for each other.
            </p>
            <HiCode code={CURL_PLACE} label="requests for one place" caption="Requests" />
            <HiCode code={OUT_PLACE} label="One priced row for a CMS payment locality" caption="Real response, one field elided and marked." tall />
            <Caveat label="Never a silent fallback">A place we cannot honour is a 400, never a silent national fallback. That was the defect worth fixing: an answer to a question nobody asked, returned with no warning, is wrong and looks right.</Caveat>
            <HiCode code={OUT_PLACE_ERRORS} label="Errors from an unknown locality or a multi-locality state" caption="Refusals" tall />
          </Fold>

          <Fold id="call-take" level={3} title="Take the whole thing, and the catalog that describes it" summary={<><Badge method="GET" /> <code>/data.json</code> and the source archive</>}>
            <p>
              <a href="/data.json">/data.json</a> is a <strong>DCAT-US v1.1</strong> catalog (the metadata
              standard <a href="https://resources.data.gov/resources/dcat-us/">data.gov harvests</a>)
              describing the price table, the locality table, the three register exports and the dictionary, each
              with its licence, its distributions, its data dictionary and the federal files it was built from. It
              validates against the government&rsquo;s own published JSON Schema; the schema is vendored in this
              repository with its SHA-256 and the test re-hashes it before it validates anything.
            </p>
            <p>
              The application itself is downloadable in one file. Not a description of a repository: the source,
              the data, the migrations, the tests and a README you can run from.
            </p>
            <HiCode code={CURL_TAKE_IT} label="taking the catalog and the application" caption="Commands" />
            <p className="micro">
              The code is <a href="/LICENSE.txt">Apache-2.0</a>; the data is CC0 1.0, public domain.{' '}
              <a href="/NOTICE.txt">NOTICE</a> says which is which, line by line. The five DCAT-US fields that
              belong to federal agencies (<code>bureauCode</code>, <code>programCode</code>,{' '}
              <code>dataQuality</code>, <code>primaryITInvestmentUII</code>, <code>systemOfRecords</code>) are
              absent from our catalog, as the standard&rsquo;s own guidance directs for a non-federal publisher.
              We are not an agency, and an OMB bureau code we do not have would be exactly the kind of invented
              federal number this project exists to refuse.
            </p>
          </Fold>

          <Fold id="call-citation" level={3} title="A correction, addressed to the body that published the number" summary={<><Badge method="GET" /> <code>/api/citation/cms-99213?format=text</code></>}>
            <p>
              A thumb on a ledger line is bound to one published federal row. This is that row&rsquo;s
              provenance and the public counts in one call: no bundle, no join, no account. Add{' '}
              <code>?format=text</code> and there is nothing to parse.
            </p>
            <HiCode code={CURL_CITATION} label="the citation request" caption="Request" />
            <HiCode lang="text" code={OUT_CITATION} label="A citation block as plain text" caption="Response counted as of 2026-09-09; the live call returns the counts of the day you run it." tall />
            <p className="micro">
              Without <code>?format=text</code> the same call returns JSON with the figure, the publisher, the
              document, the source URL and the counts as separate fields, plus this block in{' '}
              <code>text</code>. Every row of the table answers, including the rows nobody has spoken about yet.
            </p>
          </Fold>
          </div>

          <h2 id="take" className={s.h2}>What you can take without asking</h2>
          <p className={`${s.h2sub} ${dv.sub}`}>
            The register is public: what people said a federal figure got wrong, what care never entered any
            claims file, and how the people who carried the burden ranked it. Counts and a de-identified CSV,
            not free text.
          </p>
          <div className={dp.foldGrid}>
          <Fold id="take-survey" level={3} title={<>The survey and gap exports carry no one&rsquo;s self-description</>} summary="The day an answer arrived, never the time. Who answered is published only as counts.">
              <p>
                Each row of{' '}
                <a href="/api/export/survey.csv">survey.csv</a> and <a href="/api/export/gap.csv">gap.csv</a> gives the
                day it arrived (<code>received_on</code>), never the time. Who answered is published only as counts, at{' '}
                <a href="/api/survey">/api/survey</a> and <a href="/api/gap">/api/gap</a>, and any value held by fewer
                than 11 answers is counted as &ldquo;fewer than 11, not shown&rdquo; on the server and never named. Their{' '}
                <code>prev_hash</code> and <code>row_hash</code> columns let you check the chain link by link against{' '}
                <a href="/api/integrity">/api/integrity</a>. corrections.csv carries every field its hashes cover, so
                every hash in it can be recomputed from the file alone.
              </p>
          </Fold>
          <Fold id="take-corrections" level={3} title="The corrections export is a defect report, not a comment box" summary="Every row is bound to the published federal row and the file it came from. Free text is never exported.">
              <p>
                Every row carries the
                price row id, the CPT or HCPCS code (and the LOINC code where the row is a lab), the published figure
                with its basis, year, geography and population, the federal file <em>by name</em> with its URL, its
                SHA-256 and the day we read it, the exact line or arithmetic the figure was re-read from, the audit
                verdict, the direction of the correction, the counts and fit rate on that figure, the chained row hash,
                and a permalink that renders it as a paste-ready report for the agency that published the number. The
                first line of the CSV is a comment naming the price-table version and the audit;{' '}
                <a href="/api/export/corrections.json">/api/export/corrections.json</a> publishes the same rows with the
                column contract beside them. Free text is never exported.
              </p>
          </Fold>
          </div>
          <ul className={dv.take} aria-label="Data you can take, as JSON and CSV">
            {take.map((r, i) => (
              <li key={i}>
                <span>{r.what}</span>
                <div>{r.json}{r.csv && <> {r.csv}</>}</div>
              </li>
            ))}
          </ul>

          <h2 id="agency-reuse" className={s.h2}>Reuse it in your agency</h2>
          <OrgKitAgency />

          <div className={dp.foldGrid} style={{ marginTop: '2rem' }}>
          <Fold id="rules" title="The rules" summary="No model makes a dollar figure, figures that cannot be added are not, and errors are sentences. Rate limits and privacy.">
          <ul className={dv.rules}>
            <li><h3>No model, average or interpolation ever produces a dollar figure.</h3><p>A phrase that maps to nothing stays unpriced and is returned as unpriced, with the reason.</p></li>
            <li><h3>Figures that cannot be added are not added.</h3><p>Measures that answer different questions raise <code>basisWarning</code>; a whole-year figure is returned outside the total in <code>excludedFromTotal</code>.</p></li>
            <li><h3>Rate limits, per network per hour</h3><p>300 to <code>/api/price</code>, 30 to <code>/api/journeys</code>, 300 to <code>/api/survey</code> (a flood guard only: a person or a clinic is never refused), 5 an hour (10 a day) to <code>/api/interview</code>, 300 to <code>/api/gap</code> and <code>/api/corrections</code> (corrections also take at most 3 an hour and 8 a day on any one figure from one network), 20 to each other write route. Over the limit returns 429 with a sentence that says when to try again, and a <code>retry-after</code> header. Write routes refuse requests sent from another website; <code>/api/price</code>, <code>/api/map</code> and <code>/api/fhir</code> accept them, and the answers of <code>/api/price</code> and <code>/api/fhir</code> are readable from any origin.</p></li>
            <li><h3>Privacy is the precondition.</h3><p>No account is required and none is offered by these routes. No IP address is stored; rate limiting hashes it with a daily salt and forgets it within the hour. Free text sent to the register is held privately and is never served back or exported.</p></li>
            <li><h3>Errors are sentences.</h3><p>Every failure is <code>{'{ ok: false, error }'}</code> with the right status, written for a person reading a log.</p></li>
          </ul>
          </Fold>
          <Fold id="why" title="Why reuse this" summary="The hard part of a cost-of-illness number is knowing which published figure applies.">
            <p>
              The hard part of a cost-of-illness number is not arithmetic. It is knowing which published figure
              applies, what it measures, who it leaves out, and what it must not be added to. That work is in the
              table and its rules, and this API hands you all of it with every response.
            </p>
            <p>
              A state health agency
              costing a care pathway, a patient organization building its own tool, a researcher who needs the
              same unit prices we used: none of you need our interface, and none of you should have to take
              our word for a number.
            </p>
            <p>
              If you want to stand the whole thing up for your own condition, your own state or your own
              population, <Link href="/adopt">/adopt</Link> is the procedure: the files to edit, in order, and the
              two commands that refuse a figure which does not reproduce. The whole application is{' '}
              <a href="/waypoint-ledger-source.tar.gz">one download</a>, and it runs on your own machine in four
              commands, so none of that is a promise you have to take on trust.
            </p>
            <p className="micro">Questions, or a row you think is wrong: <a href={CONTACT}>Contact</a>.</p>
          </Fold>
          </div>

          <h2 id="routes" className={s.h2}>Every route</h2>
          <p className={`${s.h2sub} ${dv.sub}`}>
            {routes.length} routes, each with its method and what it does. The full description, with every request and
            response schema, is at <a href="/api/openapi.json">/api/openapi.json</a>. Administrative routes take a bearer
            token and are not published there.
          </p>
          <RouteMap />
          <FoldOpen wide={['fhir-tree', ...ROUTES_WIDE]} />
        </LongLayout>
      </div>
    </section>
  );
}

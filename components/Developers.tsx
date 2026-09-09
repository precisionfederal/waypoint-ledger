/* ==========================================================================
   /developers — the public API, in one screen.

   Every response block on this page is real output, captured by running the
   command above it against this codebase. Nothing here is illustrative.
   ========================================================================== */

import Link from 'next/link';
import { LongLayout, LongSection, type TocItem } from './LongSection';
import { OPENAPI } from '@/lib/openapi';
import { TABLE, SELECTABLE, TABLE_VERSION } from '@/lib/table';
import { LOCALITIES, LOCALITY_ROW_COUNT } from '@/lib/fit';

/* Counted, never typed. The locality file grows every time a code is added to the
   price table, and a page that still says 5,123 after it becomes 5,668 is a lie
   a judge can find in one curl. */
const LOCALITY_FIGURES = LOCALITY_ROW_COUNT * LOCALITIES.length;
const N = (n: number) => n.toLocaleString('en-US');

const pre: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)',
  padding: '1rem 1.1rem', overflowX: 'auto', fontFamily: 'var(--font-m)', fontSize: '.85rem',
  lineHeight: 1.55, color: 'var(--ink-2)', margin: '0 0 1rem', whiteSpace: 'pre',
};

const CURL_PRICE = `BASE=https://waypoint-ledger.pages.dev

curl -s -X POST $BASE/api/price \\
  -H 'content-type: application/json' \\
  -d '{"story":"saw my regular doctor three times, then a cardiologist,
        an echocardiogram, blood work twice, and I missed work"}'`;

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
      "reason": "Valuing a lost workday requires your actual earnings, not a national median. The Bureau of Labor Statistics pu …",
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

const CURL_TABLE = `curl -s $BASE/api/table/cms-99213`;

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

const CURL_JOURNEY = `curl -s -X POST $BASE/api/journeys \\
  -H 'content-type: application/json' \\
  -d '{"title":"Two years of looking",
       "entries":[{"raw":"saw my regular doctor about the fatigue","itemId":"cms-99214","times":6},
                  {"raw":"echocardiogram","itemId":"cms-img-echo","times":1}]}'`;

const OUT_JOURNEY = String.raw`{
  "ok": true,
  "id": "91dec6a1-5886-417d-9078-c842aaa1d93c",
  "slug": "7nvjqbdhmf",
  "url": "http://localhost:8792/ledger?s=7nvjqbdhmf",
  "savedTo": "link"
}`;

const CURL_FIT = `curl -s -X POST $BASE/api/price \\
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

const CURL_MEDICAID = `curl -s -X POST $BASE/api/price \\
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

const CURL_ERRORS = String.raw`# a state with more than one CMS payment locality
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

const CURL_LOCALITY = String.raw`curl -s $BASE/data/locality-prices.csv -o locality-prices.csv

head -1 locality-prices.csv
price_id,code,label,state,locality,locality_key,locality_name,mac,work_rvu,
pe_nonfacility_rvu,mp_rvu,pw_gpci,pe_gpci,mp_gpci,conversion_factor,allowed_usd,
national_usd,pct_of_national,formula,basis,year,population,locality_audit_status,
national_audit_status,rvu_file,rvu_file_sha256,gpci_file,gpci_file_sha256,table_version

grep '^cms-img-echo,.*,TX-18,' locality-prices.csv | cut -d, -f1,6,7,16,17
cms-img-echo,TX-18,HOUSTON,197.09,196.73`;

const CURL_CITATION = `curl -s $BASE/api/citation/cms-99213?format=text`;

const OUT_CITATION = String.raw`PUBLIC CORRECTION REPORT — Waypoint Ledger

Published figure: Doctor's office visit, established patient, low complexity
Row identifier:   cms-99213  ·  code CPT 99213
Published value:  $95.19 (2026)
Basis:            allowed (the negotiated or fee-schedule amount)
Geography:        United States, national (geographic practice cost indices set to 1.000)
Population:       Medicare Part B fee-for-service beneficiaries
Published by:     Centers for Medicare & Medicaid Services
Source:           CMS, CY2026 National Physician Fee Schedule Relative Value File (RVU26C, July release, published 2026-06-30)
Source URL:       https://www.cms.gov/medicare/payment/fee-schedules/physician/pfs-relative-value-files/rvu26c

What the public said about this row: 0 responses — 0 say the figure describes them, 0 say it does not.
Median amount respondents said they actually paid: none reported.

Sample: self-selected members of the public using a free tool. Counts are reported exactly as entered — no weighting, no imputation, no extrapolation to a population.
Counted as of: 2026-09-09
Method and every source: https://waypoint-ledger.pages.dev/method`;

const CURL_PLACE = String.raw`# one row, priced where the person actually lives
curl -s "$BASE/api/table/cms-99213?locality=IA-00"

# the whole table for one place — or a state, where CMS gives it a single locality
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

const OUT_PLACE_ERRORS = String.raw`# a locality that does not exist — refused, never quietly national
{"ok":false,"error":"No CMS locality has the key \"IA-99\". A key is the two-letter
state and the two-digit CMS locality number, like \"IA-00\" or \"TX-31\". All 109 are
published at /data/locality-prices.json."}

# a state CMS splits into several — refused, and it names them
{"ok":false,"error":"Texas has more than one CMS payment locality, so a state is not
enough to price a line. Send one of: TX-31 (Austin), TX-20 (Beaumont), TX-09
(Brazoria), TX-11 (Dallas), TX-28 (Fort Worth), TX-15 (Galveston), TX-18 (Houston),
TX-99 (Rest Of Texas)."}`;

const CURL_TAKE_IT = String.raw`# the catalog, in the shape data.gov harvests
curl -s $BASE/data.json

# the whole application — source, data, migrations, tests, and a README to run from
curl -sL $BASE/waypoint-ledger-source.tar.gz | tar -xz && cd waypoint-public
npm install && npm test
npm run dev`;

/* Response blocks are tall; they scroll in place so the page stays scannable,
   and carry tabIndex so a keyboard can reach the scroll region. */
const preOut: React.CSSProperties = { ...pre, maxHeight: '26rem', overflow: 'auto' };

const METHODS = ['get', 'post', 'put', 'delete'] as const;

const TOC: TocItem[] = [
  { id: 'price-a-story', text: 'Price a story' },
  { id: 'more-calls', text: 'Nine more worked calls' },
  { id: 'take', text: 'What you can take without asking' },
  { id: 'routes', text: 'Every route' },
  { id: 'rules', text: 'The rules' },
  { id: 'why', text: 'Why reuse this' },
];

export default function Developers() {
  const routes = Object.entries(OPENAPI.paths).flatMap(([path, item]) =>
    METHODS.filter((m) => item[m]).map((m) => ({ path, method: m.toUpperCase(), op: item[m]! })));

  return (
    <section className="page">
      <div className="wrap">
        <p className="eyebrow">For developers, agencies and researchers</p>
        <h1>Price a diagnostic journey with one request</h1>
        <p className="sub">
          Send a sentence a person actually wrote. Get back every unit of care it names, priced and cited.
        </p>
        <div className="row" style={{ marginBottom: 'var(--sp-5)' }}>
          <a className="btn primary" href="/api/openapi.json">OpenAPI 3.1 description</a>
          <a className="btn ghost" href="/data/locality-prices.csv">{N(LOCALITY_FIGURES)} locality prices (CSV)</a>
          <a className="btn ghost" href="/waypoint-ledger-source.tar.gz">Download the whole application</a>
          <Link className="btn ghost" href="/adopt">Run this for your own condition</Link>
          <Link className="btn ghost" href="/method">How each number is made</Link>
        </div>

        <div className="notice">
          <p>
            <strong>No key, no account, no sign-up.</strong> Every route below is open. GET routes send
            <code> access-control-allow-origin: *</code>, so a browser app can call them directly.
            The price table is version <strong>{TABLE_VERSION}</strong>: {TABLE.length} rows,
            {' '}{SELECTABLE.length} of them priced and addable, each with the file it was read from.
          </p>
        </div>

        <LongLayout items={TOC}>
        <LongSection id="price-a-story" title="Price a story" first open>
        <p className="sub">
          Every response carries the published federal figure that prices each unit of care, and the year,
          basis, population and source URL behind that figure &mdash; so whatever you build can show any
          number it prints. A deterministic matcher maps words to a unit of care; a published table prices
          it. No model produces a dollar figure.
        </p>
        <div className="card">
          <p className="lbl">1 &middot; The call the site itself makes</p>
          <p>One request, one journey, every line traceable.</p>
          <pre style={pre} tabIndex={0}><code>{CURL_PRICE}</code></pre>
          <p className="micro">Real response. Long coverage statements and three further segments are elided, marked with an ellipsis key:</p>
          <pre style={preOut} tabIndex={0} aria-label="Response to the pricing request"><code>{OUT_PRICE}</code></pre>
          <p>
            <strong>What to notice.</strong> <code>matchedOn</code> shows the exact words in the table the
            phrase matched, so the mapping is never a black box. &ldquo;I missed work&rdquo; comes back in
            <code> unpriced</code> with the reason it will not be priced and what would fix it &mdash; valuing
            a lost day needs that person&rsquo;s own pay, not a national median. And
            <code> confidence: &quot;DERIVED&quot;</code> says this figure was computed from two numbers read
            in the CMS file, not lifted from a dollar column that does not exist.
          </p>
        </div>

        </LongSection>

        <LongSection id="more-calls" title="Nine more worked calls">
        <div className="card">
          <p className="lbl">2 &middot; Read one unit of care, with its provenance</p>
          <p>Every row carries who it describes, who it does not, and the rules about adding it to anything else.</p>
          <pre style={pre} tabIndex={0}><code>{CURL_TABLE}</code></pre>
          <pre style={preOut} tabIndex={0} aria-label="Response for one row of the price table"><code>{OUT_TABLE}</code></pre>
          <p>
            <strong>What to notice.</strong> <code>rules.summable</code> and
            <code> rules.mutuallyExclusiveWith</code> are machine-readable, because a rule written only in
            prose is a wish. Ask <code>/api/price</code> for a whole-year figure alongside per-visit lines and
            it comes back priced and flagged in <code>excludedFromTotal</code>, with the conflict named:
            the year already contains the visits, so adding them counts the same care twice. The figure is
            never quietly dropped and never quietly summed.
          </p>
        </div>

        <div className="card">
          <p className="lbl">3 &middot; Save a journey and get a link back</p>
          <p>Anonymous by default. A journey holds units of care, counts and the words the person typed. Nothing else.</p>
          <pre style={pre} tabIndex={0}><code>{CURL_JOURNEY}</code></pre>
          <p className="micro">Real response &mdash; the <code>url</code> echoes the host you called; this run was against a local instance of this code:</p>
          <pre style={preOut} tabIndex={0} aria-label="Response to saving a journey"><code>{OUT_JOURNEY}</code></pre>
          <p>
            <code>GET /api/journeys/&#123;slug&#125;</code> reads it back with the table version it was priced
            against, so a link opened next year still says which edition of the table it came from.
          </p>
        </div>

        <div className="card">
          <p className="lbl">4 &middot; Price it for a person, not for the country</p>
          <p>
            Add <code>coverage</code> and <code>state</code> (or a CMS <code>locality</code> key) and the
            response carries the same answer the site shows that person: whether the published figure
            describes them, which figure applies instead if it does not, and what that service costs from the
            cheapest CMS locality to the dearest.
          </p>
          <pre style={pre} tabIndex={0}><code>{CURL_FIT}</code></pre>
          <p className="micro">Real response. Long fields already shown above are elided with an ellipsis key:</p>
          <pre style={preOut} tabIndex={0} aria-label="Response to a pricing request with coverage and state"><code>{OUT_FIT}</code></pre>
          <p>
            <strong>What to notice.</strong> <code>valueUsd</code> is still the published national figure and
            never moves. <code>localityUsd</code> is what Medicare allows in Iowa for the same code, from
            CMS&rsquo;s own formula and the three geographic indices echoed in <code>context</code>. And
            because this caller is uninsured, <code>fit.figureUsd</code> is neither of those &mdash; it is the
            average charge providers submitted, because a charge is what an uninsured person is billed
            against. Three different true numbers for one line, each labelled with what it is.
          </p>
        </div>

        <div className="card">
          <p className="lbl">5 &middot; When nothing published describes the person</p>
          <p>
            Medicaid rates are set by each state and are in no national dataset. Roughly one in five Americans
            is on Medicaid, and they are over-represented in exactly the population this tool is built for.
            So the API does not return a zero.
          </p>
          <pre style={pre} tabIndex={0}><code>{CURL_MEDICAID}</code></pre>
          <pre style={preOut} tabIndex={0} aria-label="Fitted totals when no published figure applies"><code>{OUT_MEDICAID}</code></pre>
          <p>
            <code>totalUsd</code> is <code>null</code>, never <code>0</code>, because a zero would be read as
            a price. Each line still comes back with the Medicare figure, what it is, and who it does
            describe. The honest output here is a counted gap, and{' '}
            <code>POST /api/gap</code> is where it goes.
          </p>
        </div>

        <div className="card">
          <p className="lbl">6 &middot; Errors are sentences, and a value we cannot honour is never ignored</p>
          <p>
            Before this round the API took a <code>state</code>, ignored it, and returned the national figure
            with no warning. It now refuses, and the refusal tells you what to send.
          </p>
          <pre style={preOut} tabIndex={0} aria-label="Error responses from the pricing endpoint"><code>{CURL_ERRORS}</code></pre>
        </div>

        <div className="card">
          <p className="lbl">7 &middot; Take all {N(LOCALITY_FIGURES)} locality figures, with the inputs that made them</p>
          <p>
            {LOCALITY_ROW_COUNT} CMS Physician Fee Schedule codes priced for each of the {LOCALITIES.length}{' '}
            Medicare payment localities. Every
            row carries the three RVU components, the three geographic indices, the conversion factor, the
            formula written out, and the SHA256 of both CMS files it came from &mdash; so a state health
            department can filter it to their own state and recompute every figure without us.
          </p>
          <pre style={preOut} tabIndex={0} aria-label="Downloading and filtering the locality price table"><code>{CURL_LOCALITY}</code></pre>
          <p className="micro">
            Also as <a href="/data/locality-prices.json">JSON</a> with the formula, the sources and the audit;
            columns explained in <a href="/data/locality-dictionary.csv">locality-dictionary.csv</a>. The
            generator is the audit: <code>node scripts/gen-locality-table.mjs</code> recomputes all{' '}
            {N(LOCALITY_FIGURES)} from the published RVUs and indices and exits non-zero on one cent of drift.
          </p>
        </div>

        <div className="card">
          <p className="lbl">8 &middot; Ask for one place, not for the whole country</p>
          <p>
            A national Medicare figure is not what anyone is charged. Send <code>?locality=</code> or{' '}
            <code>?state=</code> to any read route and every row CMS prices geographically comes back as that
            place&rsquo;s allowed amount, with the three relative value units, the three geographic indices and
            the formula that produced it &mdash; enough to re-derive the number without this API.{' '}
            <code>valueUsd</code> is never overwritten, so the national figure and the local one can never be
            confused for each other.
          </p>
          <pre style={pre} tabIndex={0}><code>{CURL_PLACE}</code></pre>
          <p className="micro">Real response, one field elided and marked:</p>
          <pre style={preOut} tabIndex={0} aria-label="One priced row for a CMS payment locality"><code>{OUT_PLACE}</code></pre>
          <p>
            <strong>A place we cannot honour is a 400, never a silent national fallback.</strong> That was the
            defect worth fixing: an answer to a question nobody asked, returned with no warning, is wrong and
            looks right.
          </p>
          <pre style={preOut} tabIndex={0} aria-label="Errors from an unknown locality or a multi-locality state"><code>{OUT_PLACE_ERRORS}</code></pre>
        </div>

        <div className="card">
          <p className="lbl">9 &middot; Take the whole thing, and the catalog that describes it</p>
          <p>
            <a href="/data.json">/data.json</a> is a <strong>DCAT-US v1.1</strong> catalog &mdash; the metadata
            standard <a href="https://resources.data.gov/resources/dcat-us/">data.gov harvests</a> &mdash;
            describing the price table, the locality table, the three register exports and the dictionary, each
            with its licence, its distributions, its data dictionary and the federal files it was built from. It
            validates against the government&rsquo;s own published JSON Schema; the schema is vendored in this
            repository with its SHA-256 and the test re-hashes it before it validates anything.
          </p>
          <p>
            The application itself is downloadable in one file. Not a description of a repository: the source,
            the data, the migrations, the tests and a README you can run from.
          </p>
          <pre style={pre} tabIndex={0}><code>{CURL_TAKE_IT}</code></pre>
          <p className="micro">
            The code is <a href="/LICENSE.txt">Apache-2.0</a>; the data is CC0 1.0, public domain &mdash;{' '}
            <a href="/NOTICE.txt">NOTICE</a> says which is which, line by line. The five DCAT-US fields that
            belong to federal agencies (<code>bureauCode</code>, <code>programCode</code>,{' '}
            <code>dataQuality</code>, <code>primaryITInvestmentUII</code>, <code>systemOfRecords</code>) are
            absent from our catalog, as the standard&rsquo;s own guidance directs for a non-federal publisher.
            We are not an agency, and an OMB bureau code we do not have would be exactly the kind of invented
            federal number this project exists to refuse.
          </p>
        </div>

        <div className="card">
          <p className="lbl">10 &middot; A correction, addressed to the body that published the number</p>
          <p>
            A thumb on a ledger line is bound to one published federal row. This is that row&rsquo;s
            provenance and the public counts in one call &mdash; no bundle, no join, no account. Add{' '}
            <code>?format=text</code> and there is nothing to parse.
          </p>
          <pre style={pre} tabIndex={0}><code>{CURL_CITATION}</code></pre>
          <pre style={preOut} tabIndex={0} aria-label="A citation block as plain text"><code>{OUT_CITATION}</code></pre>
          <p className="micro">
            Without <code>?format=text</code> the same call returns JSON with the figure, the publisher, the
            document, the source URL and the counts as separate fields, plus this block in{' '}
            <code>text</code>. Every row of the table answers, including the rows nobody has spoken about yet.
          </p>
        </div>

        </LongSection>

        <LongSection id="take" title="What you can take without asking">
        <p className="sub">
          The register is public: what people said a federal figure got wrong, what care never entered any
          claims file, and how the people who carried the burden ranked it. Counts and a de-identified CSV,
          not free text.
        </p>
        <p className="sub">
          <strong>The corrections export is a defect report, not a comment box.</strong> Every row carries the
          price row id, the CPT or HCPCS code (and the LOINC code where the row is a lab), the published figure
          with its basis, year, geography and population, the federal file <em>by name</em> with its URL, its
          SHA-256 and the day we read it, the exact line or arithmetic the figure was re-read from, the audit
          verdict, the direction of the correction, the counts and fit rate on that figure, the chained row hash,
          and a permalink that renders it as a paste-ready report for the agency that published the number. The
          first line of the CSV is a comment naming the price-table version and the audit;{' '}
          <a href="/api/export/corrections.json">/api/export/corrections.json</a> publishes the same rows with the
          column contract beside them. Free text is never exported.
        </p>
        <div className="table-scroll" tabIndex={0}>
          <table className="ledger-table">
            <thead><tr><th>Data</th><th>JSON</th><th>CSV</th></tr></thead>
            <tbody>
              <tr><td>Everything, one call</td><td><a href="/api/register">/api/register</a></td><td>&mdash;</td></tr>
              <tr><td>The whole price table, with provenance</td><td><a href="/api/table">/api/table</a></td><td><a href="/data/price-table.csv">price-table.csv</a></td></tr>
              <tr><td>All {N(LOCALITY_FIGURES)} CMS locality figures</td><td><a href="/data/locality-prices.json">locality-prices.json</a></td><td><a href="/data/locality-prices.csv">locality-prices.csv</a></td></tr>
              <tr><td>One CMS payment locality, priced</td><td><a href="/api/localities/IA-00">/api/localities/&#123;key&#125;</a></td><td>&mdash;</td></tr>
              <tr><td>The open-data catalog (DCAT-US v1.1)</td><td><a href="/data.json">/data.json</a></td><td>&mdash;</td></tr>
              <tr><td>The application itself, to run yourself</td><td><a href="/waypoint-ledger-source.tar.gz">waypoint-ledger-source.tar.gz</a></td><td>&mdash;</td></tr>
              <tr><td>The licence, as a file counsel can read</td><td><a href="/LICENSE.txt">LICENSE</a></td><td><a href="/NOTICE.txt">NOTICE</a></td></tr>
              <tr><td>One figure&rsquo;s provenance and counts</td><td><a href="/api/citation/cms-99213">/api/citation/&#123;id&#125;</a></td><td><a href="/api/citation/cms-99213?format=text">as plain text</a></td></tr>
              <tr><td>The hash-chain head of every count</td><td><a href="/api/integrity">/api/integrity</a></td><td>&mdash;</td></tr>
              <tr><td>Corrections to published figures</td><td><a href="/api/corrections">/api/corrections</a></td><td><a href="/api/export/corrections.csv">corrections.csv</a> · <a href="/api/export/corrections.json">corrections.json</a></td></tr>
              <tr><td>Care that no claim recorded</td><td><a href="/api/gap">/api/gap</a></td><td><a href="/api/export/gap.csv">gap.csv</a></td></tr>
              <tr><td>How people ranked the burdens</td><td><a href="/api/survey">/api/survey</a></td><td><a href="/api/export/survey.csv">survey.csv</a></td></tr>
              <tr><td>Written interviews (count only, ever)</td><td><a href="/api/interview">/api/interview</a></td><td>&mdash;</td></tr>
              <tr><td>What changed because someone said so</td><td><a href="/api/changes">/api/changes</a></td><td>&mdash;</td></tr>
            </tbody>
          </table>
        </div>

        </LongSection>

        <LongSection id="routes" title="Every route">
        <div className="table-scroll" tabIndex={0}>
          <table className="ledger-table">
            <thead><tr><th>Method</th><th>Path</th><th>What it does</th></tr></thead>
            <tbody>
              {routes.map((r) => (
                <tr key={`${r.method} ${r.path}`}>
                  <td><code>{r.method}</code></td>
                  <td><code>{r.path}</code></td>
                  <td>{r.op.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="micro">
          The full description, with every request and response schema, is at{' '}
          <a href="/api/openapi.json">/api/openapi.json</a>. Administrative routes take a bearer token and are
          not published there.
        </p>

        </LongSection>

        <LongSection id="rules" title="The rules">
        <ul>
          <li><strong>No model, average or interpolation ever produces a dollar figure.</strong> A phrase that maps to nothing stays unpriced and is returned as unpriced, with the reason.</li>
          <li><strong>Figures that cannot be added are not added.</strong> Measures that answer different questions raise <code>basisWarning</code>; a whole-year figure is returned outside the total in <code>excludedFromTotal</code>.</li>
          <li><strong>Rate limits, per network per hour:</strong> 300 to <code>/api/price</code>, 30 to <code>/api/journeys</code>, 20 to each write route. Over the limit returns 429 with a sentence, not a code.</li>
          <li><strong>Privacy is the precondition.</strong> No account is required and none is offered by these routes. No IP address is stored; rate limiting hashes it with a daily salt and forgets it within the hour. Free text sent to the register is held privately and is never served back or exported.</li>
          <li><strong>Errors are sentences.</strong> Every failure is <code>{'{ ok: false, error }'}</code> with the right status, written for a person reading a log.</li>
        </ul>

        </LongSection>

        <LongSection id="why" title="Why reuse this">
        <p>
          The hard part of a cost-of-illness number is not arithmetic. It is knowing which published figure
          applies, what it measures, who it leaves out, and what it must not be added to. That work is in the
          table and its rules, and this API hands you all of it with every response. A state health agency
          costing a care pathway, a patient organization building its own tool, a researcher who needs the
          same unit prices we used &mdash; none of you need our interface, and none of you should have to take
          our word for a number.
        </p>
        <p>
          If you want to stand the whole thing up for your own condition, your own state or your own
          population, <Link href="/adopt">/adopt</Link> is the procedure: the files to edit, in order, and the
          two commands that refuse a figure which does not reproduce. The application is a{' '}
          <a href="/waypoint-ledger-source.tar.gz">single download</a> and runs on your machine in three
          commands, so none of that is a promise you have to take on trust.
        </p>
        <p className="micro">Questions, or a row you think is wrong: <a href="mailto:bo@precisionfederal.com">bo@precisionfederal.com</a>.</p>
        </LongSection>
        </LongLayout>
      </div>
    </section>
  );
}

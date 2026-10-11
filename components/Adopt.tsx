/* ==========================================================================
   /adopt — what to edit to run this for another condition, state or population.

   /developers is the contract for a machine. This is the contract for the
   person who has to stand the thing up: file names, the order to touch them in,
   the command that refuses to let a wrong figure through, and the licence. No
   claim that an agency could adopt it — the procedure, so they can see for
   themselves how much of a week it is.

   Every path on this page is a real path in this repository and every command
   is one that runs. Nothing here is illustrative.
   ========================================================================== */

import Link from '@/components/IntentLink';
import { Caveat, Code, Fold, PageHero, TI, trust as s } from './trust/Kit';
import { ShowCall, dp } from './DevPagesKit';
import ad from './adopt.module.css';
import { AI, Chips, Head, Tiles, Ways, WithRail, adoptUi } from './adopt/parts';
import Reveal from './adopt/Reveal';
import { embedAnchor } from './OrgKitText';
import { WAYPOINT_BASE } from '@/lib/fhir';
import { TABLE, SELECTABLE, TABLE_VERSION } from '@/lib/table';
import { SOURCE_COMPOSITION } from '@/lib/source-composition';
import { LOCALITIES, LOCALITY_ROW_COUNT, STATES } from '@/lib/fit';
import conditions from '@/data/conditions.json';

const LOCALITY_FIGURES = LOCALITY_ROW_COUNT * LOCALITIES.length;
const CONDITIONS = (conditions as { conditions: { icd10cm: string | null; price_row_id: string | null }[] }).conditions;
const CONDITION_COUNT = CONDITIONS.length;
const CONDITION_CODED = CONDITIONS.filter((c) => c.icd10cm).length;
const CONDITION_PRICED = CONDITIONS.filter((c) => c.price_row_id).length;
/* Counted from the table, never typed: how many lab rows carry a LOINC code into the Bundle. */
const LAB_ROWS = TABLE.filter((t) => t.id.startsWith('cms-lab-'));
const LAB_LOINC = LAB_ROWS.filter((t) => t.loinc).length;

const ADD_CONDITION = `# 1. find or add the published figure, in data/prices.json
#    a row needs the file it came from, the year, the population it describes
#    and its basis. Nothing else may carry a dollar amount.

# 2. prove the row reproduces from the file it cites
python3 data/verify_price_table.py         # exits 1 if your row does not

# 3. name the condition, in data/conditions.json
{
  "id": "sickle-cell",
  "label": "Sickle cell disease",
  "icd10cm": "D57.1",
  "icd10cm_source": "CDC/NCHS, ICD-10-CM code descriptions, FY2026",
  "price_row_id": "your-new-row-id",     # or null, and the product says so
  "figure_kind": "condition_attributed", # or "excess"; they are not the same number
  "note": "…"
}

# 4. nothing else. The panel renders whatever that row says.`;

const ADD_STATE = `# every state is already priced. To check one:
grep '^cms-99213,.*,TX-31,' public/data/locality-prices.csv

# to add a service, add a row to data/prices.json with its CPT/HCPCS code,
# then re-derive every locality figure from the CMS files:
python3 data/build_state_prices.py <dir-with-PPRRVU2026_Jul_nonQPP.csv-and-GPCI2026.csv>
node    scripts/gen-locality-table.mjs      # recomputes all ${LOCALITY_FIGURES.toLocaleString('en-US')}, exits 1 on a cent of drift`;

const ADD_POPULATION = `// lib/fit.ts: fitOf() is the whole rule, in one function.
// Add the coverage to COVERAGE_OPTIONS, then add its branch:

case 'tricare':
  return base('REFERENCE PRICE',
    'TRICARE pays its own rates and they are not in this table. '
    + 'This is the federal reference figure for the same service.');

// A population with no published figure returns NOT DESCRIBED with
// offerGap: true. That is the honest answer and it is counted at /gap,
// never filled with the nearest number.`;

const RUN_IT = `# the whole application: source, data, migrations, tests, README
curl -sL https://waypointledger.org/waypoint-ledger-source.tar.gz | tar -xz
cd waypoint-public

npm install
npm run build:static        # the static export the size budgets measure
npm test                    # the suite that guards every rule below
npm run dev                 # http://localhost:3000

# the full stack, with the database, on your own Cloudflare account
npx wrangler d1 create waypoint-ledger        # put the id in cf/wrangler.toml
npx wrangler kv namespace create LEDGER       # put the id in cf/wrangler.toml
npm run db:migrate:local
npm run dev:full            # http://localhost:8788`;

const FIELD_IT = `https://waypointledger.org/survey?c=your-org-slug

# the slug keeps lowercase letters, digits and hyphens, 24 at most. A link
# typed as ?c=MEAction is read as meaction, and the person answering is told
# which slug their answer is counted under. It is published as the channel
# column of /api/export/survey.csv, so answers through your link are
# separable from everyone else's, by you and by anyone reading the export.
# Anyone who has the link can answer through it.`;


const CONTACT = 'https://precisionfederal.com/contact';

/* PAGES R1 (2026-09-30): the same procedure as a stepper. At a glance first,
   then the steps in order, then the files, the standards and the ask. Every
   sentence of the previous page is here; em-dashes became colons or
   parentheses, and the two honesty caveats are one labelled line each. */

function StartingFrom() {
  const files: { file: string; what: React.ReactNode; take: React.ReactNode }[] = [
    { file: 'data/prices.json', what: <>{TABLE.length} published figures: {TABLE.length - SOURCE_COMPOSITION.analysisRows} from federal files and {SOURCE_COMPOSITION.analysisRows} from a peer-reviewed analysis of a federal survey. {SELECTABLE.length} of them are priced and addable, each with its file, year, basis, population and combination rules. Version {TABLE_VERSION}.</>, take: <a href="/data/price-table.csv">price-table.csv</a> },
    { file: 'data/state-prices.json', what: <>{LOCALITY_FIGURES.toLocaleString('en-US')} figures: {LOCALITY_ROW_COUNT} CMS codes priced for each of the {LOCALITIES.length} Medicare payment localities in {STATES.length} states and territories, every one re-derived from CMS&rsquo;s own formula.</>, take: <a href="/data/locality-prices.csv">locality-prices.csv</a> },
    { file: 'data/conditions.json', what: <>{CONDITION_COUNT} conditions. {CONDITION_CODED} carry an ICD-10-CM code from the CDC/NCHS file; {CONDITION_PRICED} point at a published year-ahead figure and the rest carry an explicit null, because no federal file publishes one.</>, take: <a href="/api/table">/api/table</a> },
    { file: 'data/synonyms.json', what: <>Extra plain-language phrases that map to a unit of care, beyond the ones each price row already carries. This and the row synonyms are the whole matcher; there is no model behind it.</>, take: <a href="/data/dictionary.csv">dictionary.csv</a> },
    { file: 'public/data.json', what: <>A DCAT-US v1.1 catalog describing every open file here (the metadata standard data.gov harvests), validated against the government&rsquo;s own published JSON Schema. Point a harvester at it and these files appear in a catalog beside the federal files they came from.</>, take: <a href="/data.json">/data.json</a> },
    { file: 'cf/migrations/0001_init.sql', what: <>The whole schema: journeys, corrections, gap reports, survey responses, interviews, the change log. One file, no ORM.</>, take: <Link href="/privacy">what each column holds</Link> },
  ];
  return (
    <ul className={ad.files}>
      {files.map((f) => (
        <li key={f.file}>
          <code>{f.file}</code>
          <p>{f.what}</p>
          <div>{f.take}</div>
        </li>
      ))}
    </ul>
  );
}

/* VISUAL-4b (2026-09-30): the page opens as a product. A hero with its
   illustration, the three ways to adopt as choice cards with the effort each
   one takes (in the words the pages already use), what you get as tiles that
   link to the thing itself, and the standards as chips that link to their
   proof. The glance band's four facts moved into the tiles and the cards;
   below the chips the procedure is unchanged. */
const TOC = [
  { id: 'ways', text: 'Three ways to adopt' },
  { id: 'get', text: 'What you get' },
  { id: 'rule', text: 'The rule that survives' },
  { id: 'take-it', text: 'Take it, in four steps' },
  { id: 'starting-from', text: 'The six files' },
  { id: 'standards', text: 'Standards' },
  { id: 'tell-us', text: 'What we would want to know' },
];

export default function Adopt() {
  return (
    <section className={`page ${dp.dp} ${ad.page}`}>
      <Reveal />
      <div className="wrap">
        <PageHero
          eyebrow="For agencies, patient organizations and clinics"
          title="Run this for your condition, your state, your people"
          lead="The whole application is one download, and it runs on your own machine in four commands."
          art={{ light: '/img/v2/4b-adopt-hero.webp', dark: '/img/v2/4b-adopt-hero-dark.webp', width: 1600, height: 500, position: '50% 0%', mobilePosition: '50% 0%' }}
        >
          <div className={s.actions}>
            <a className="btn primary" href="/waypoint-ledger-source.tar.gz">Download the whole application</a>
            <a className="btn ghost" href="/data.json">The open-data catalog (DCAT-US)</a>
            <a className="btn ghost" href="/LICENSE.txt">Licence</a>
          </div>
        </PageHero>
      </div>
      <div className="wrap">
        <WithRail items={TOC}>

        <Head id="ways" title="Three ways to adopt" lead="Pick the one that fits. The first needs no code; the second is one line of HTML." />
        <Ways ways={[
          {
            id: 'kit', art: '/img/v2/4b-adopt-share.webp', artDark: '/img/v2/4b-adopt-share-dark.webp', who: 'A patient organization or a clinic',
            title: 'Share a survey link with your community',
            effort: 'No code, no account, nothing to install',
            text: <>Type your organization&rsquo;s name and get your own survey link, a QR code, a paragraph to paste, a one-page flyer and a page where your own count appears.</>,
            cta: { href: '/adopt/kit', label: 'Make your kit', primary: true },
          },
          {
            id: 'button', art: '/img/v2/4b-adopt-link.webp', artDark: '/img/v2/4b-adopt-link-dark.webp', who: 'A clinic, a patient organization or an agency site',
            title: 'Put a button on your website',
            effort: 'One line of plain HTML',
            text: <>A &ldquo;Price your diagnostic journey&rdquo; button that opens Waypoint Ledger in a new tab. No script, no cookie, any content security policy.</>,
            extra: (
              <ShowCall flat label="the line" what="The HTML to paste, with a copy button">
                <Code code={embedAnchor(WAYPOINT_BASE)} label="the button's HTML" caption="Paste into your page" />
              </ShowCall>
            ),
            cta: { href: '/developers#agency-reuse', label: 'See it on /developers' },
          },
          {
            id: 'copy', art: '/img/v2/4b-adopt-run.webp', artDark: '/img/v2/4b-adopt-run-dark.webp', who: 'An agency or a team',
            title: 'Run your own copy',
            effort: 'One download, four commands',
            text: <>Source, data, migrations, tests and a README, on your own machine. One Cloudflare account runs the full stack with its database.</>,
            cta: { href: '#take-it', label: 'Take it, in four steps' },
          },
        ]} />

        <Head id="get" title="What you get" lead="Every piece is open. Each tile opens the thing itself." />
        <Tiles label="What you get" items={[
          { icon: <TI.code />, title: 'Open source', text: 'The code is Apache-2.0. The data is CC0 1.0, public domain.', href: '/LICENSE.txt', go: 'Read the licence' },
          { icon: <AI.files />, title: 'Six data files', text: 'Every published figure with its file, year, basis and population.', href: '#starting-from', go: 'See the six files' },
          { icon: <TI.bundle />, title: 'An HL7 FHIR R4 Bundle', text: 'Every ledger downloads as an HL7 FHIR R4 Bundle.', href: '/api/fhir/example', go: 'Open an example' },
          { icon: <AI.catalog />, title: 'An open-data catalog', text: 'DCAT-US v1.1, the metadata standard data.gov harvests.', href: '/data.json', go: 'Open /data.json' },
          { icon: <AI.qr />, title: 'A QR code and flyer kit', text: 'A survey link, QR code and one-page flyer for your community.', href: '/adopt/kit', go: 'Make yours' },
          { icon: <TI.cloud />, title: '1 Cloudflare account', text: 'One D1 database and one KV namespace run the full stack.', href: '#take-it', go: 'How to run it' },
        ]} />

        {/* Each chip links to the page or file that proves it. Blue Button is named here
            only as written and switched off: its import stays off until CMS issues us
            credentials (GET /api/bluebutton/status: configured false, sandbox). */}
        <Chips title="Interoperability standards, and where each one stands today" groups={[
          { state: 'live', label: 'Standards it speaks today', chips: [
            { name: 'HL7 FHIR R4', note: 'Bundle export', href: '/api/fhir/example' },
            { name: 'USCDI', note: 'four data classes', href: '#standards' },
            { name: 'LOINC', note: `on ${LAB_LOINC} of ${LAB_ROWS.length} lab tests`, href: '/data/price-table.csv' },
            { name: 'CPT and HCPCS', note: 'service codes', href: '/data/price-table.csv' },
            { name: 'ICD-10-CM', note: `on ${CONDITION_CODED} conditions`, href: '/conditions' },
            { name: 'DCAT-US v1.1', note: 'open-data catalog', href: '/data.json' },
          ] },
          { state: 'off', label: 'Written, switched off', chips: [
            { name: 'Blue Button 2.0', note: 'sandbox only, off until CMS issues credentials', href: '/api/bluebutton/status' },
          ] },
          { state: 'none', label: 'Next on the roadmap', chips: [
            { name: 'TEFCA', href: '#standards' },
            { name: 'USCDI+', href: '#standards' },
            { name: 'CMS Interoperability Framework', note: 'two criteria already met', href: '#standards' },
          ] },
        ]} />

        <div id="rule" className={`${s.card} ${ad.rule} ${adoptUi.reveal}`} data-reveal="">
          <p className={s.kicker}><span style={{ color: 'var(--accent-ink)', display: 'inline-flex' }}><TI.shield /></span>The rule that has to survive the fork</p>
          <p>
            No model, average or interpolation in this codebase produces a dollar figure. Every priced line is a row of a published federal file, or the
            product of published federal figures with the formula printed, carrying its year, its basis and the population
            it describes.
          </p>
          <Caveat label="Long COVID">The two long COVID year-ahead rows are a peer-reviewed analysis of a federal survey: they are labelled as that, shown apart and never added to a total.</Caveat>
          <p><strong>If you keep one thing when you adapt this, keep that.</strong></p>
        </div>

        <h2 id="take-it" className={s.h2}>Take it, in four steps</h2>
        <p className={s.h2sub}>
          This page is the procedure, not the pitch: the files you change, the command that refuses a figure
          that does not reproduce, and what happens when no federal file describes the people you serve.
        </p>

        <ol className={s.stepper}>
          <li className={s.step}>
            <h3>Download it and run it</h3>
            <p>
              No account, no request, nothing to sign. The archive is the tree this site is built from, minus the
              build output and our own credentials: <strong>app/</strong>, <strong>components/</strong>,{' '}
              <strong>lib/</strong>, <strong>data/</strong>, <strong>cf/functions/</strong>,{' '}
              <strong>cf/migrations/</strong>, <strong>scripts/</strong>, <strong>tests/</strong>, and a README
              that is these commands with the reasons attached.
            </p>
            <ShowCall flat label="the commands" what="Download, test and run it, then the full stack with its database">
              <Code code={RUN_IT} label="the commands to download and run the application" caption="Download, test, run" />
            </ShowCall>
            <p className="micro">
              The Cloudflare configuration ships with placeholders rather than our project&rsquo;s identifiers, so
              a first run cannot point at somebody else&rsquo;s deployment. Nothing in the archive talks to us:
              take it offline and every figure on this page still reproduces from the published files it cites.
            </p>
          </li>

          <li className={s.step} id="commands">
            <h3>Prove every figure reproduces</h3>
            <p>The two commands that keep it honest, and the suite that guards every rule.</p>
            <ShowCall flat label="the two checks and the test suite" what="verify_price_table.py, gen-locality-table.mjs and npm test, and what each one refuses">
            <div className={ad.cmds}>
              <div>
                <Code code="python3 data/verify_price_table.py" label="the price table check" caption="Run" />
                <p>Re-downloads every federal file, hashes it, and re-derives every figure. Exits 1 if a row does not reproduce from the file it cites.</p>
              </div>
              <div>
                <Code code="node scripts/gen-locality-table.mjs" label="the locality table check" caption="Run" />
                <p>Recomputes all {LOCALITY_FIGURES.toLocaleString('en-US')} locality figures from the published RVUs and geographic indices. Exits 1 on one cent of drift, and names the row.</p>
              </div>
              <div>
                <Code code="npm test" label="the test suite" caption="Run" />
                <p>Runs the rules as tests, not as prose: that no code path can produce a dollar figure, that figures on different bases are never added, that the published catalog validates against the government&rsquo;s schema, and that the licence on the page is the licence in the tree.</p>
              </div>
            </div>
            </ShowCall>
          </li>

          <li className={s.step}>
            <h3>Point it at your people</h3>
            <p>Four kinds of change. Open the one you need.</p>
            <div className={dp.foldGrid}>

            <Fold id="condition" level={3} title="Another condition" summary="One object in data/conditions.json. No figure lives there.">
              <p>
                One object in <strong>data/conditions.json</strong>, pointing at a row that already exists in the
                price table. No figure lives in the conditions file, so adding a condition cannot introduce a
                number nobody checked.
              </p>
              <Code code={ADD_CONDITION} label="adding a condition" tall />
              <Caveat label="No published figure">
                Set <code>price_row_id</code> to null. The
                product then says, in its own voice, that no federal source publishes an annual figure for that
                condition, and sends the person to <Link href="/gap">the gap</Link> so the absence is counted.
                An absence you count is data. An absence you fill with the nearest number is a fabrication.
              </Caveat>
            </Fold>

            <Fold id="state" level={3} title="Another state" summary={`Nothing to edit. All ${LOCALITIES.length} CMS payment localities ship with the tool.`}>
              <p>
                Nothing to edit. All {LOCALITIES.length} CMS payment localities ship with the tool, so a person in
                any state sees their own locality&rsquo;s figure and the drawer shows the three geographic indices
                that produced it. What you change is what you build on top: hand the API your state and it
                reprices every line without the interface.
              </p>
              <Code code={ADD_STATE} label="checking or adding a state figure" tall />
              <p className="micro">
                One curl returns your state&rsquo;s figure with the arithmetic:{' '}
                <code>GET /api/table?locality=IA-00</code>, or{' '}
                <code>/api/localities/IA-00</code> for every figure published for one place.
              </p>
              <Caveat label="Refused, never guessed">A locality we cannot honour is refused with a sentence, never answered with the national number.</Caveat>
              <p className="micro">
                The generator is also the audit: it recomputes every one of the{' '}
                {LOCALITY_FIGURES.toLocaleString('en-US')} figures from the RVUs and the geographic indices on its
                own row and exits non-zero if a single one is off by a cent. A published number that drifts from
                the formula printed beside it cannot leave this repository.
              </p>
            </Fold>

            <Fold id="population" level={3} title="Another population" summary="lib/fit.ts holds the whole rule in one function.">
              <p>
                <strong>lib/fit.ts</strong> holds the whole rule in one function: given a published row and a
                person, does this figure describe them. It chooses between published figures and never computes
                one.
              </p>
              <Code code={ADD_POPULATION} label="adding a coverage rule" tall />
              <p>
                The API answers the same question as the screen, from the same module:{' '}
                <code>POST /api/price</code> with <code>coverage</code> and <code>state</code> returns the fitted
                figure and the verdict per line. See <Link href="/developers">the API</Link>.
              </p>
            </Fold>

            <Fold id="community" level={3} title="Your own community, counted separately" summary="Give your organization a channel slug on the survey link.">
              <p>
                The burden instrument takes a channel. Give your organization a slug and every answer through
                your link carries it, in the public export and in the channel counts on the register. The register
                prints the slug exactly as it arrived and never an organization&rsquo;s name, and anyone who has the
                link can answer through it, so read that count as answers through the link.
              </p>
              <Code code={FIELD_IT} label="your organization's survey link" tall />
              <Caveat label="Small cells">
                Small cells are suppressed on the server before anything is published: a self-description held
                by fewer than 11 answers is counted as &ldquo;fewer than 11, not shown&rdquo; and never named, and
                the export carries no self-description at all.
              </Caveat>
              <p className="micro">
                The instrument, its exact wording and
                every response option are in <a href="/data/dictionary.csv">dictionary.csv</a>, so a reviewer can
                read the questions without running the site.
              </p>
            </Fold>
            </div>
          </li>

          <li className={s.step} id="tell-us-step">
            <h3>Send back what your community finds</h3>
            <p>The corrections, and the care that never entered a claims file. <a href="#tell-us">What we would want to know</a> says why.</p>
          </li>
        </ol>

        <h2 id="starting-from" className={s.h2}>What you are starting from</h2>
        <p className={s.h2sub}>Six files hold everything. Each one has an open download.</p>
        <StartingFrom />
        <p className="micro" style={{ marginTop: '1rem' }}>
          Column meanings: <a href="/data/price-dictionary.csv">price-dictionary.csv</a> and{' '}
          <a href="/data/locality-dictionary.csv">locality-dictionary.csv</a>.{' '}
          <strong>The data is CC0 1.0</strong>: the federal figures are U.S. Government works and
          already public domain, and our arrangement of them is dedicated to the public domain too.{' '}
          <strong>The code is Apache-2.0.</strong> Both are files you can read, not sentences on a page:{' '}
          <a href="/LICENSE.txt">LICENSE</a> and <a href="/NOTICE.txt">NOTICE</a>, which says line by line
          which licence covers what.
        </p>
        <p className="micro">Every condition the tool reads, its published figures and their sources, and the schema for adding one: <a href="/conditions">Conditions</a>.</p>

        {/* ASKS rows 19-20: the challenge rules name CMS interoperability efforts, USCDI+, HL7 FHIR,
            TEFCA and Blue Button 2.0. One honest line each, checked 30 Sep 2026:
            - FHIR: GET /api/fhir/example on production returned a 14-entry R4 Bundle; tests/fhir.test.ts
              validates every bundle against the official R4 JSON schema.
            - USCDI: the classes are read off lib/fhir.ts (Encounter, Procedure with CPT/HCPCS and LOINC,
              Provenance with author and recorded time; no Patient, no dates, no identifiers, no
              meta.profile) against the USCDI v3 class list at isp.healthit.gov.
            - Blue Button: GET /api/bluebutton/status returned configured:false, environment sandbox.
            - CMS Interoperability Framework, TEFCA, USCDI+: described from cms.gov and healthit.gov,
              and never claimed as connections. */}
        <div style={{ height: '1.5rem' }} aria-hidden="true" />
        <Fold id="standards" title="Standards" open summary="HL7 FHIR R4 is live. Nothing listed is a connection we do not have.">
        <p>Where this tool stands against each standard the challenge names, today. Nothing on this list is a connection we do not have.</p>
        <div className="table-scroll" tabIndex={0}>
          <table className={`${s.tbl} ${s.std} ${ad.stdNext} standards-table`}>
            <thead><tr><th scope="col">Standard</th><th scope="col">Today</th><th scope="col">What that means here</th><th scope="col">Next step</th></tr></thead>
            <tbody>
              <tr>
                <th scope="row"><a href="https://hl7.org/fhir/R4/" target="_blank" rel="noopener noreferrer">HL7 FHIR R4</a></th>
                <td data-label="Today"><strong>Live</strong></td>
                <td data-label="What that means here" className={s.wide}>Every ledger downloads as an HL7 FHIR R4 Bundle, with CPT and HCPCS codes, and a LOINC code on {LAB_LOINC} of our {LAB_ROWS.length} lab tests. <a href="/api/fhir/example">/api/fhir/example</a> returns one. The test suite checks every Bundle against HL7&rsquo;s official R4 schema.</td>
                <td data-label="Next step" className={`${s.wide} ${ad.next}`}>Run the same HL7 validator against the US Core profiles and publish every gap, as was done for base R4 (<a href="/developers#agency-reuse">0 errors, 14 warnings</a>).</td>
              </tr>
              <tr>
                <th scope="row"><a href="https://isp.healthit.gov/united-states-core-data-interoperability-uscdi" target="_blank" rel="noopener noreferrer">USCDI</a></th>
                <td data-label="Today"><strong>Four data classes</strong></td>
                <td data-label="What that means here" className={s.wide}>The Bundle carries data from four USCDI classes and no others: Encounter Information (the kind of visit), Procedures (CPT and HCPCS codes), Laboratory (the test, by its LOINC code) and Provenance (who wrote the record, and when). It has no name, birth date, dates of care or other identifiers, because the tool never asks for them. It does not use the US Core profiles.</td>
                <td data-label="Next step" className={`${s.wide} ${ad.next}`}>Add a fifth class, Health Insurance Information, as the coverage type the person already picks on their own device, with no member or payer ID.</td>
              </tr>
              <tr>
                <th scope="row"><a href="https://bluebutton.cms.gov/" target="_blank" rel="noopener noreferrer">Blue Button 2.0</a></th>
                <td data-label="Today"><strong>Written, switched off</strong></td>
                <td data-label="What that means here" className={s.wide}>Blue Button lets a person with Medicare share their Part A, B and D claims with an app. Our import is written against the CMS sandbox and stays off until CMS issues us credentials. <a href="/api/bluebutton/status">/api/bluebutton/status</a> says so.</td>
                <td data-label="Next step" className={`${s.wide} ${ad.next}`}>Sandbox import built and tested on CMS's synthetic claims; switched on once Precision Federal accepts the CMS terms.</td>
              </tr>
              <tr>
                <th scope="row"><a href="https://www.cms.gov/initiatives/health-technology-ecosystem/overview/interoperability-framework" target="_blank" rel="noopener noreferrer">CMS Interoperability Framework</a></th>
                <td data-label="Today"><strong>Two criteria already met</strong></td>
                <td data-label="What that means here" className={s.wide}>CMS&rsquo;s voluntary criteria for health data networks and the apps that use them. We are not a CMS Aligned Network. Two of its criteria match choices already made here: lab codes in LOINC inside FHIR, and passkeys for sign-in. Price transparency is one of its newest use cases.</td>
                <td data-label="Next step" className={`${s.wide} ${ad.next}`}>Check this tool against each of the framework&rsquo;s criteria and publish the result, including one it does not meet: accepting a CMS-approved IAL2 digital credential at sign-in.</td>
              </tr>
              <tr>
                <th scope="row"><a href="https://healthit.gov/policy/tefca/" target="_blank" rel="noopener noreferrer">TEFCA</a></th>
                <td data-label="Today"><strong>Holds no records, by design</strong></td>
                <td data-label="What that means here" className={s.wide}>The nationwide framework HHS set up for sharing health records between providers, patients, payers and public health. This tool holds no health records and takes no part in it.</td>
                <td data-label="Next step" className={`${s.wide} ${ad.next}`}>By design: TEFCA moves patient data between hospitals, health systems and public health agencies, and this tool never asks for a name, birth date or record number (<a href="/privacy#store">what we store</a>).</td>
              </tr>
              <tr>
                <th scope="row"><a href="https://healthit.gov/standards-and-technology/uscdi-plus/" target="_blank" rel="noopener noreferrer">USCDI+</a></th>
                <td data-label="Today"><strong>Three candidate elements named</strong></td>
                <td data-label="What that means here" className={s.wide}>Lists of data elements that extend USCDI for a particular program or field. We use none today.</td>
                <td data-label="Next step" className={`${s.wide} ${ad.next}`}>Propose the elements this ledger uses (a billing code, its published price and the federal file behind it) on the <a href="https://uscdiplus.healthit.gov/" target="_blank" rel="noopener noreferrer">USCDI+ platform</a> when it opens a submission window for a fitting domain, as it has for public health use cases.</td>
              </tr>
            </tbody>
          </table>
        </div>
        </Fold>

        <Fold id="tell-us" title="What we would want to know" open summary="The corrections, not a thank-you.">
        <p>
          If you stand this up, the thing worth sending back is not a thank-you. It is the corrections: which
          published figure your community says does not describe them, and what care never entered a claims
          file at all. Each correction is bound to the row of the agency that published the number, so it can be
          handed to that agency.
        </p>
        <p>
          <a href="/api/citation/cms-99213">Here is what one of those looks like</a>: the provenance and
          the counts for a single row, in a form that needs nothing of ours to read.
        </p>
        <p className="micro">
          Questions, or a row you think is wrong: <a href={CONTACT}>Contact</a>.
        </p>
        </Fold>
        </WithRail>
      </div>
    </section>
  );
}

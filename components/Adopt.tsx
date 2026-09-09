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

import Link from 'next/link';
import { TABLE, SELECTABLE, TABLE_VERSION } from '@/lib/table';
import { LOCALITIES, LOCALITY_ROW_COUNT, STATES } from '@/lib/fit';
import conditions from '@/data/conditions.json';

const pre: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)',
  padding: '1rem 1.1rem', overflowX: 'auto', fontFamily: 'var(--font-m)', fontSize: '.85rem',
  lineHeight: 1.55, color: 'var(--ink-2)', margin: '0 0 1rem', whiteSpace: 'pre',
};

const LOCALITY_FIGURES = LOCALITY_ROW_COUNT * LOCALITIES.length;
const CONDITIONS = (conditions as { conditions: { icd10cm: string | null; price_row_id: string | null }[] }).conditions;
const CONDITION_COUNT = CONDITIONS.length;
const CONDITION_CODED = CONDITIONS.filter((c) => c.icd10cm).length;
const CONDITION_PRICED = CONDITIONS.filter((c) => c.price_row_id).length;

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
  "figure_kind": "condition_attributed", # or "excess" — they are not the same number
  "note": "…"
}

# 4. nothing else. The panel renders whatever that row says.`;

const ADD_STATE = `# every state is already priced. To check one:
grep '^cms-99213,.*,TX-31,' public/data/locality-prices.csv

# to add a service, add a row to data/prices.json with its CPT/HCPCS code,
# then re-derive every locality figure from the CMS files:
python3 data/build_state_prices.py <dir-with-PPRRVU2026_Jul_nonQPP.csv-and-GPCI2026.csv>
node    scripts/gen-locality-table.mjs      # recomputes all ${LOCALITY_FIGURES.toLocaleString('en-US')}, exits 1 on a cent of drift`;

const ADD_POPULATION = `// lib/fit.ts — fitOf() is the whole rule, in one function.
// Add the coverage to COVERAGE_OPTIONS, then add its branch:

case 'tricare':
  return base('REFERENCE PRICE',
    'TRICARE pays its own rates and they are not in this table. '
    + 'This is the federal reference figure for the same service.');

// A population with no published figure returns NOT DESCRIBED with
// offerGap: true. That is the honest answer and it is counted at /gap,
// never filled with the nearest number.`;

const RUN_IT = `# the whole application: source, data, migrations, tests, README
curl -sL https://waypoint-ledger.pages.dev/waypoint-ledger-source.tar.gz | tar -xz
cd waypoint-public

npm install
npm test                    # the suite that guards every rule below
npm run dev                 # http://localhost:3000

# the full stack, with the database, on your own Cloudflare account
npx wrangler d1 create waypoint-ledger        # put the id in cf/wrangler.toml
npx wrangler kv namespace create LEDGER       # put the id in cf/wrangler.toml
npm run db:migrate:local
npm run dev:full            # http://localhost:8788`;

const FIELD_IT = `https://waypoint-ledger.pages.dev/survey?c=your-org-slug

# the slug is validated /^[a-z0-9-]{1,24}$/ and published as the channel
# column of /api/export/survey.csv, so your community's responses are
# separable from everyone else's — by you, and by anyone reading the export.`;

export default function Adopt() {
  return (
    <section className="page">
      <div className="wrap">
        <p className="eyebrow">For an agency, a health department or another team</p>
        <h1>What to edit to run this for your condition, your state, your people</h1>
        <p className="sub">
          The whole application is one download and it runs on your own machine in three commands. This page is
          the procedure, not the pitch: the files you change, the command that refuses a figure that does not
          reproduce, and what happens when no federal file describes the people you serve.
        </p>
        <div className="row" style={{ marginBottom: 'var(--sp-5)' }}>
          <a className="btn primary" href="/waypoint-ledger-source.tar.gz">Download the whole application</a>
          <a className="btn ghost" href="/data.json">The open-data catalog (DCAT-US)</a>
          <a className="btn ghost" href="/LICENSE.txt">Licence</a>
        </div>

        <div className="notice">
          <p>
            <strong>The rule that has to survive the fork.</strong> No model, average or interpolation
            produces a dollar figure anywhere in this codebase. Every number on the screen is a row of a
            published federal file, carrying its year, its basis and the population it describes. If you keep
            one thing when you adapt this, keep that.
          </p>
        </div>

        <div className="card">
          <p className="lbl">0 &middot; Take it</p>
          <p>
            No account, no request, nothing to sign. The archive is the tree this site is built from, minus the
            build output and our own credentials: <strong>app/</strong>, <strong>components/</strong>,{' '}
            <strong>lib/</strong>, <strong>data/</strong>, <strong>cf/functions/</strong>,{' '}
            <strong>cf/migrations/</strong>, <strong>scripts/</strong>, <strong>tests/</strong>, and a README
            that is these commands with the reasons attached.
          </p>
          <pre style={pre}><code>{RUN_IT}</code></pre>
          <p className="micro">
            The Cloudflare configuration ships with placeholders rather than our project&rsquo;s identifiers, so
            a first run cannot point at somebody else&rsquo;s deployment. Nothing in the archive talks to us:
            take it offline and every figure on this page still reproduces from the federal files it cites.
          </p>
        </div>

        <h2>What you are starting from</h2>
        <div className="table-scroll">
          <table className="ledger-table">
            <thead><tr><th>File</th><th>What is in it</th><th>Take it</th></tr></thead>
            <tbody>
              <tr>
                <td>data/prices.json</td>
                <td>{TABLE.length} published federal figures, {SELECTABLE.length} of them priced and addable, each with its file, year, basis, population and combination rules. Version {TABLE_VERSION}.</td>
                <td><a href="/data/price-table.csv">price-table.csv</a></td>
              </tr>
              <tr>
                <td>data/state-prices.json</td>
                <td>{LOCALITY_FIGURES.toLocaleString('en-US')} figures: {LOCALITY_ROW_COUNT} CMS codes priced for each of the {LOCALITIES.length} Medicare payment localities in {STATES.length} states and territories, every one re-derived from CMS&rsquo;s own formula.</td>
                <td><a href="/data/locality-prices.csv">locality-prices.csv</a></td>
              </tr>
              <tr>
                <td>data/conditions.json</td>
                <td>{CONDITION_COUNT} conditions. {CONDITION_CODED} carry an ICD-10-CM code from the CDC/NCHS file; {CONDITION_PRICED} point at a published year-ahead figure and the rest carry an explicit null, because no federal file publishes one.</td>
                <td><a href="/api/table">/api/table</a></td>
              </tr>
              <tr>
                <td>data/synonyms.json</td>
                <td>Extra plain-language phrases that map to a unit of care, beyond the ones each price row already carries. This and the row synonyms are the whole matcher; there is no model behind it.</td>
                <td><a href="/data/dictionary.csv">dictionary.csv</a></td>
              </tr>
              <tr>
                <td>public/data.json</td>
                <td>A DCAT-US v1.1 catalog describing every open file here &mdash; the metadata standard data.gov harvests &mdash; validated against the government&rsquo;s own published JSON Schema. Point a harvester at it and these files appear in a catalog beside the federal files they came from.</td>
                <td><a href="/data.json">/data.json</a></td>
              </tr>
              <tr>
                <td>cf/migrations/0001_init.sql</td>
                <td>The whole schema: journeys, corrections, gap reports, survey responses, interviews, the change log. One file, no ORM.</td>
                <td><Link href="/privacy">what each column holds</Link></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="micro">
          Column meanings: <a href="/data/price-dictionary.csv">price-dictionary.csv</a> and{' '}
          <a href="/data/locality-dictionary.csv">locality-dictionary.csv</a>.{' '}
          <strong>The data is CC0 1.0</strong> &mdash; the federal figures are U.S. Government works and
          already public domain, and our arrangement of them is dedicated to the public domain too.{' '}
          <strong>The code is Apache-2.0.</strong> Both are files you can read, not sentences on a page:{' '}
          <a href="/LICENSE.txt">LICENSE</a> and <a href="/NOTICE.txt">NOTICE</a>, which says line by line
          which licence covers what.
        </p>

        <div className="card">
          <p className="lbl">1 &middot; Another condition</p>
          <p>
            One object in <strong>data/conditions.json</strong>, pointing at a row that already exists in the
            price table. No figure lives in the conditions file, so adding a condition cannot introduce a
            number nobody checked.
          </p>
          <pre style={pre}><code>{ADD_CONDITION}</code></pre>
          <p>
            <strong>When there is no published figure.</strong> Set <code>price_row_id</code> to null. The
            product then says, in its own voice, that no federal source publishes an annual figure for that
            condition, and sends the person to <Link href="/gap">the gap</Link> so the absence is counted.
            An absence you count is data. An absence you fill with the nearest number is a fabrication.
          </p>
        </div>

        <div className="card">
          <p className="lbl">2 &middot; Another state</p>
          <p>
            Nothing to edit. All {LOCALITIES.length} CMS payment localities ship with the tool, so a person in
            any state sees their own locality&rsquo;s figure and the drawer shows the three geographic indices
            that produced it. What you change is what you build on top: hand the API your state and it
            reprices every line without the interface.
          </p>
          <pre style={pre}><code>{ADD_STATE}</code></pre>
          <p className="micro">
            One curl returns your state&rsquo;s figure with the arithmetic:{' '}
            <code>GET /api/table?locality=IA-00</code>, or{' '}
            <code>/api/localities/IA-00</code> for every figure published for one place. A locality we cannot
            honour is refused with a sentence, never answered with the national number.
          </p>
          <p className="micro">
            The generator is also the audit: it recomputes every one of the{' '}
            {LOCALITY_FIGURES.toLocaleString('en-US')} figures from the RVUs and the geographic indices on its
            own row and exits non-zero if a single one is off by a cent. A published number that drifts from
            the formula printed beside it cannot leave this repository.
          </p>
        </div>

        <div className="card">
          <p className="lbl">3 &middot; Another population</p>
          <p>
            <strong>lib/fit.ts</strong> holds the whole rule in one function: given a published row and a
            person, does this figure describe them. It chooses between published figures and never computes
            one.
          </p>
          <pre style={pre}><code>{ADD_POPULATION}</code></pre>
          <p>
            The API answers the same question as the screen, from the same module:{' '}
            <code>POST /api/price</code> with <code>coverage</code> and <code>state</code> returns the fitted
            figure and the verdict per line. See <Link href="/developers">the API</Link>.
          </p>
        </div>

        <div className="card">
          <p className="lbl">4 &middot; Your own community, counted separately</p>
          <p>
            The burden instrument takes a channel. Give your organisation a slug and every response through
            your link carries it, in the public export as well as in your own reading of it.
          </p>
          <pre style={pre}><code>{FIELD_IT}</code></pre>
          <p className="micro">
            Small cells are suppressed before anything is published. The instrument, its exact wording and
            every response option are in <a href="/data/dictionary.csv">dictionary.csv</a>, so a reviewer can
            read the questions without running the site.
          </p>
        </div>

        <h2>The two commands that keep it honest</h2>
        <div className="table-scroll">
          <table className="ledger-table">
            <thead><tr><th>Command</th><th>What it refuses</th></tr></thead>
            <tbody>
              <tr>
                <td><code>python3 data/verify_price_table.py</code></td>
                <td>Re-downloads every federal file, hashes it, and re-derives every figure. Exits 1 if a row does not reproduce from the file it cites.</td>
              </tr>
              <tr>
                <td><code>node scripts/gen-locality-table.mjs</code></td>
                <td>Recomputes all {LOCALITY_FIGURES.toLocaleString('en-US')} locality figures from the published RVUs and geographic indices. Exits 1 on one cent of drift, and names the row.</td>
              </tr>
              <tr>
                <td><code>npm test</code></td>
                <td>Runs the rules as tests, not as prose: that no code path can produce a dollar figure, that figures on different bases are never added, that the published catalog validates against the government&rsquo;s schema, and that the licence on the page is the licence in the tree.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>What we would want to know</h2>
        <p>
          If you stand this up, the thing worth sending back is not a thank-you. It is the corrections: which
          published figure your community says does not describe them, and what care never entered a claims
          file at all. That signal is addressed to the agency that published the number, and it travels
          better with more than one community behind it.{' '}
          <a href="/api/citation/cms-99213">Here is what one of those looks like</a> &mdash; the provenance and
          the counts for a single row, in a form that needs nothing of ours to read.
        </p>
        <p className="micro">
          Questions, or a row you think is wrong: <a href="mailto:bo@precisionfederal.com">bo@precisionfederal.com</a>.
        </p>
      </div>
    </section>
  );
}

/* ==========================================================================
   /developers#agency-reuse — what another agency, a health system or a clinic
   can take today: the Bundle checked by HL7's own validator, a button for its
   own website, and the three steps to run its own copy.

   THE VALIDATION IS A DATED RECORD OF ONE RUN, NOT A BADGE. Every value in
   FHIR_VALIDATION was read off that run's own output (validator log and
   OperationOutcome). tests/org-kit.test.ts rebuilds the example Bundle from
   this commit and fails if its entry count or resource mix no longer matches
   the Bundle that was validated, so this section cannot keep describing a
   Bundle the site has stopped serving. The fix when it fails: rerun the two
   commands printed below and update the record.
   ========================================================================== */

import Link from '@/components/IntentLink';
import { EmbedCopy, EmbedSnippet, Reproduce } from './OrgKitAgencyLive';
import { ShowCall, dp } from './DevPagesKit';
import dv from './developers.module.css';
import { Fold, trust as t } from './trust/Kit';

export const FHIR_VALIDATION = {
  ranOn: '2026-09-30',
  validator: 'HL7 FHIR Validator 6.10.4',
  validatorBuild: 'Git 1b90fb13f77b, built 2026-09-04',
  jar: 'validator_cli.jar',
  jarSha256: '1106b9d58f9e363e47bea7c4fc065841e5fc91fe9d062775c3bfdd212bd653cc',
  releases: 'https://github.com/hapifhir/org.hl7.fhir.core/releases',
  java: 'OpenJDK 17.0.20.1',
  fhirVersion: '4.0.1',
  corePackage: 'hl7.fhir.r4.core#4.0.1',
  command: 'java -jar validator_cli.jar example.json -version 4.0.1 -tx n/a',
  entries: 14,
  resources: { Encounter: 3, ChargeItem: 5, Procedure: 2, DocumentReference: 2, Provenance: 2 } as Record<string, number>,
  errors: 0,
  warnings: 14,
  information: 6,
} as const;

/* The script version of the button is served at /embed.js. It is offered here
   only once the site sends it with a cross-origin resource policy that lets
   another website load it (cf/functions/_middleware.js sets same-site on every
   response today, which a browser enforces on a script from another site). */
export const EMBED_SCRIPT_CROSS_SITE = false;

export default function OrgKitAgency() {
  const V = FHIR_VALIDATION;

  return (
    <>
      <p className={`${t.h2sub} ${dv.sub}`}>
        Three things another agency, a health system or a clinic can take today, without asking us.
      </p>

      <div className={dv.agency}>
      <div className={t.card}>
        <h3 className={dv.agencyH}><span className={dv.stepNo} aria-hidden="true">1</span>The HL7 FHIR R4 Bundle, checked by HL7&rsquo;s own validator</h3>
        <p>
          On {new Date(`${V.ranOn}T12:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })} we ran the official <strong>{V.validator}</strong> ({V.jar}, {V.validatorBuild}, from{' '}
          <a href={V.releases} target="_blank" rel="noopener noreferrer">the org.hl7.fhir.core releases</a>) on
          the Bundle that <a href="/api/fhir/example">/api/fhir/example</a> returns: {V.entries} entries (
          {Object.entries(V.resources).map(([k, v], i) => <span key={k}>{i ? ', ' : ''}{v} {k}</span>)}), against
          FHIR {V.fhirVersion} ({V.corePackage}), on {V.java}.
        </p>
        <p data-testid="fhir-validation-result" className={dv.result}>
          <strong>Result:</strong>
          <span className={`${dv.resultN} ${dv.resultOk}`}><b>{V.errors}</b> errors</span><span className="sr-only">,</span>
          <span className={dv.resultN}><b>{V.warnings}</b> warnings</span><span className="sr-only">,</span>
          <span className={dv.resultN}><b>{V.information}</b> information notes</span><span className="sr-only">.</span>
        </p>
        <p className="micro">Separately, the test suite checks every Bundle we build against HL7&rsquo;s official R4 JSON schema on every run.</p>
        <ShowCall label="the run" what="What the warnings and notes say, and the two commands to check it yourself">
        <ul>
          <li>
            All {V.warnings} warnings are the same best-practice rule, dom-6: &ldquo;A resource should have narrative
            for robust management&rdquo;. The Bundle carries codes and figures, not a human-readable summary inside
            each resource.
          </li>
          <li>
            The {V.information} notes: five say the currency code USD was not checked, because we ran with no
            terminology server; one says the validator had not loaded our own code system for the price-table
            tag, which is served at <a href="/fhir/CodeSystem/price-table-version">/fhir/CodeSystem/price-table-version</a>.
          </li>
          <li>
            An earlier run the same day found one error: an extension whose definition could not be fetched.
            Bundles no longer carry that extension, and its definition is now served at{' '}
            <a href="/fhir/StructureDefinition/cms-apc">/fhir/StructureDefinition/cms-apc</a>.
          </li>
        </ul>
        <p className="micro">Check it yourself. The jar we ran has SHA-256 <span style={{ fontFamily: 'var(--font-m)', overflowWrap: 'anywhere' }}>{V.jarSha256}</span>. Each Bundle gets fresh identifiers, so its own hash differs every time; the entry count and the result do not.</p>
        <Reproduce command={V.command} />
        </ShowCall>
      </div>

      <div className={dp.foldGrid}>
      <Fold id="agency-button" level={3} title={<><span className={dv.stepNo} aria-hidden="true">2</span> A button for your own website</>} summary="One line of plain HTML. No script, no cookie, any content security policy.">
        <p>
          One line of plain HTML puts a &ldquo;Price your diagnostic journey&rdquo; button on a clinic, patient
          organization or agency page. It opens Waypoint Ledger in a new tab. It runs no code on your site, sets no
          cookie and passes any content security policy.
        </p>
        <p aria-hidden="true" style={{ margin: 'var(--sp-3) 0' }}>
          <span className="micro" style={{ display: 'block', marginBottom: 'var(--sp-2)' }}>How it looks:</span>
          <a href="/" target="_blank" rel="noopener" tabIndex={-1} style={{ display: 'inline-block', minHeight: 44, boxSizing: 'border-box', padding: '12px 20px', borderRadius: 999, background: '#0e2a3a', color: '#fff', font: '600 16px/1.2 system-ui,sans-serif', textDecoration: 'none' }}>Price your diagnostic journey</a>
        </p>
        <EmbedSnippet />
        <EmbedCopy script={EMBED_SCRIPT_CROSS_SITE} />
        <p className="micro">
          A patient organization that wants its own survey link, QR code and printable flyer can make them in a
          minute, with no code, at <Link href="/adopt/kit">/adopt/kit</Link>.
        </p>
      </Fold>

      <Fold id="agency-run" level={3} title={<><span className={dv.stepNo} aria-hidden="true">3</span> Run your own copy in three steps</>} summary="Download it, run the tests, deploy it on your own Cloudflare account.">
        <ol>
          <li><a href="/waypoint-ledger-source.tar.gz">Download the whole application</a>: source, data, migrations and tests, in one archive.</li>
          <li>Run <code>npm install</code>, <code>npm run build:static</code> and <code>npm test</code>. The suite checks, as tests, that no code path can produce a dollar figure.</li>
          <li>Create the database and deploy it on your own Cloudflare account with the commands on <Link href="/adopt#take-it">/adopt</Link>, then add your condition, state or population.</li>
        </ol>
        <p className="micro">The code is Apache-2.0 and the data is CC0 1.0. Nothing in the archive talks to us.</p>
      </Fold>
      </div>
      </div>
    </>
  );
}

/* ==========================================================================
   /developers, drawn (VISUAL tech, 2026-09-30 night). Server components:
   no JavaScript reaches the browser from this file.

   Flow      story → reader → federal table → ledger → FHIR R4, as five
             stations on one path. Every line under a station is a sentence
             the page already states; the row count is TABLE.length.
   FhirTree  the example Bundle as a tree. The resource counts are the
             validated record in OrgKitAgency (FHIR_VALIDATION, which
             tests/org-kit.test.ts rebuilds against the Bundle this commit
             serves); the ChargeItem fields are the captured output above.
   RouteMap  every route in the OpenAPI description, grouped by its own tag,
             with the tag's own description.
   ========================================================================== */

import type { ReactNode } from 'react';
import { OPENAPI } from '@/lib/openapi';
import { FHIR_VALIDATION } from '../OrgKitAgency';
import t from './tech.module.css';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const Ic = ({ children }: { children: ReactNode }) => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{children}</svg>;

export function Flow({ rows }: { rows: number }) {
  const steps: { k: string; h: string; p: ReactNode; ic: ReactNode; code?: string }[] = [
    { k: 'story', h: 'A story', p: 'A sentence a person actually wrote.', code: '"story"', ic: <><path d="M4 5.5h16v10H9l-5 4z" {...P} /><path d="M8 9.5h8M8 12.5h5" {...P} /></> },
    { k: 'reader', h: 'The reader', p: 'A deterministic matcher maps words to a unit of care. matchedOn shows the exact words it matched.', code: 'matchedOn', ic: <><circle cx="10.5" cy="10.5" r="5.5" {...P} /><path d="M15 15l5 5" {...P} /></> },
    { k: 'table', h: 'The federal table', p: <>{rows} rows, each with the file it was read from. A published table prices the unit; no model produces a dollar figure.</>, code: 'sourceUrl', ic: <><rect x="3.5" y="4" width="17" height="16" rx="2" {...P} /><path d="M3.5 9.5h17M3.5 14.5h17M10 9.5V20" {...P} /></> },
    { k: 'ledger', h: 'The ledger', p: 'Every line priced and cited. What cannot be priced comes back unpriced, with the reason.', code: 'unpriced', ic: <><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" {...P} /><path d="M9 8.5h6M9 12h6" {...P} /></> },
    { k: 'fhir', h: 'FHIR R4', p: 'The same ledger as an HL7 FHIR R4 Bundle of type collection.', code: 'Bundle', ic: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" {...P} /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" {...P} /></> },
  ];
  return (
    <figure className={t.flow}>
      <figcaption className="sr-only">How one request travels, in five steps</figcaption>
      <svg className={t.flowPath} viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="M0 20 C 125 4, 125 36, 250 20 S 375 4, 500 20 S 625 36, 750 20 S 875 4, 1000 20" />
      </svg>
      <p className={t.swipeFlow} aria-hidden="true">Swipe for all {steps.length}</p>
      <ol className={t.flowList} tabIndex={0} aria-label="Five steps; on a narrow screen, scroll sideways">
        {steps.map((s, i) => (
          <li key={s.k} className={t.flowStep} style={{ ['--i' as string]: i }}>
            <span className={t.flowDot} aria-hidden="true"><Ic>{s.ic}</Ic></span>
            <span className={t.flowN} aria-hidden="true">{i + 1}</span>
            <h3 className={t.flowH}>{s.h}</h3>
            <p className={t.flowP}>{s.p}</p>
            {s.code && <code className={t.flowCode}>{s.code}</code>}
          </li>
        ))}
      </ol>
    </figure>
  );
}

const MEANING: Record<string, string> = {
  Encounter: 'one per visit line',
  Procedure: 'one per test or procedure line, coded in CPT or HCPCS from the row itself',
  ChargeItem: 'one per priced line: priceOverride is the published figure, definitionUri the federal file',
  DocumentReference: 'one per federal file',
  Provenance: 'one per federal file',
};
const ORDER = ['Encounter', 'Procedure', 'ChargeItem', 'DocumentReference', 'Provenance'];

export function FhirTree() {
  const V = FHIR_VALIDATION;
  const kv = (k: string, v: ReactNode) => <li key={k}><span className={t.tk}>{k}</span><span className={t.tv}>{v}</span></li>;
  return (
    <figure className={t.tree}>
      <figcaption className={t.treeCap}>The example Bundle from <a href="/api/fhir/example">/api/fhir/example</a>, as a tree</figcaption>
      <ul className={t.tRoot}>
        <li>
          <div className={`${t.node} ${t.nodeRoot}`}>
            <span className={t.rt}>Bundle</span>
            <span className={t.meta}>type <b>collection</b></span>
            <span className={t.meta}><b>{V.entries}</b> entries</span>
            <span className={t.meta}>FHIR <b>{V.fhirVersion}</b></span>
          </div>
          <ul className={t.tKids}>
            {ORDER.filter((r) => V.resources[r]).map((r) => (
              <li key={r}>
                {r === 'ChargeItem' ? (
                  <details className={t.tOpen} open>
                    <summary className={t.node}>
                      <span className={t.rt}>{r}</span><span className={t.count}>&times;{V.resources[r]}</span>
                      <span className={t.mean}>{MEANING[r]}</span>
                    </summary>
                    <ul className={t.fields} aria-label="One ChargeItem, as served">
                      {kv('status', <code>unknown</code>)}
                      {kv('code', <><code>99213</code> Doctor&rsquo;s office visit, established patient, low complexity</>)}
                      {kv('quantity', <code>3</code>)}
                      {kv('priceOverride', <><code>285.57</code> USD, 3 x $95.19</>)}
                      {kv('definitionUri', <a href="https://www.cms.gov/medicare/payment/fee-schedules/physician/pfs-relative-value-files/rvu26c">cms.gov, RVU26C</a>)}
                      {kv('subject', 'A person using Waypoint Ledger. No identity is recorded.')}
                    </ul>
                  </details>
                ) : (
                  <div className={t.node}>
                    <span className={t.rt}>{r}</span><span className={t.count}>&times;{V.resources[r]}</span>
                    <span className={t.mean}>{MEANING[r]}</span>
                  </div>
                )}
              </li>
            ))}
            <li>
              <div className={`${t.node} ${t.nodeNone}`}>
                <span className={t.rt}>Patient</span><span className={t.count}>none</span>
                <span className={t.mean}>no Patient resource, no identifier, no date of care: the tool never collected them</span>
              </div>
            </li>
          </ul>
        </li>
      </ul>
    </figure>
  );
}

const METHODS = ['get', 'post', 'put', 'delete'] as const;
/* the groups a first-time reader opens first; the rest fold to one line with their count */
/* every group folds; on a wide screen the first three open (components/tech/FoldOpen) */
const OPEN = new Set<string>();
/** the groups that also open on a wide screen (components/tech/FoldOpen) */
export const ROUTES_WIDE = ['pricing', 'interoperability', 'open data'].map((n) => `routes-${n.replace(/\W+/g, '-')}`);

export function RouteMap() {
  const groups = OPENAPI.tags.map((tag) => ({
    tag,
    routes: Object.entries(OPENAPI.paths).flatMap(([path, item]) =>
      METHODS.filter((m) => item[m] && (item[m]!.tags?.[0] ?? '') === tag.name).map((m) => ({ path, method: m.toUpperCase(), summary: item[m]!.summary }))),
  })).filter((g) => g.routes.length);
  return (
    <div className={t.routeMap}>
      {groups.map((g) => (
        <details key={g.tag.name} className={t.rGroup} open={OPEN.has(g.tag.name)} data-sec={`routes-${g.tag.name.replace(/\W+/g, '-')}`}>
          <summary className={t.rHead}>
            <h3>{g.tag.name[0].toUpperCase() + g.tag.name.slice(1)}</h3>
            <span className={t.rN}>{g.routes.length} {g.routes.length === 1 ? 'route' : 'routes'}</span>
            <span className={t.rChev} aria-hidden="true" />
          </summary>
          <p className={t.rDesc}>{g.tag.description}</p>
          <ul className={t.rList}>
            {g.routes.map((r) => (
              <li key={`${r.method} ${r.path}`} className={t[`m${r.method}`]}>
                <span className={t.mB}>{r.method}</span>
                <span className={t.rBody}><code>{r.path}</code><span>{r.summary}</span></span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

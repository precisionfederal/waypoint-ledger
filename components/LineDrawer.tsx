'use client';
import { useEffect } from 'react';
import type { PriceItem } from '@/lib/types';
import { usd } from '@/lib/pricing';
import { categoryOf } from '@/lib/categories';
import {
  CONVERSION_FACTOR, MEDICAID_LINK_COUNT, agencyOf, allowedAlternateOf, chargeNoteOf,
  cy2024ProvenanceOf, fitOf, formulaParts, localityOf, medicaidFeeScheduleFor, submittedChargeOf,
  type Ctx,
} from '@/lib/fit';
import { Icon } from './Icons';
import Dialog from './Dialog';
import cs from './ContextBar.module.css';
import ds from './LineDrawer.module.css';

/* ==========================================================================
   THE COVERAGE WALL, BROKEN INTO THE THREE QUESTIONS IT ALREADY ANSWERS.

   Every price row carries one coverage statement of ~250 words with its labels
   set inline — "HOW THIS NUMBER WAS MADE: … Who this describes: … Who it does
   NOT describe: …". Rendered as prose that is one grey paragraph, and the best
   writing in the product is the least-read thing in it. Most rows carry at least
   one of these labels; the split is on the labels the data already has,
   the words are the data's own, and a row without them falls back to prose.
   ========================================================================== */
const SEG = /(HOW THIS NUMBER WAS MADE|Who this describes|Who it does NOT describe)\s*:\s*/gi;

export interface CoverageParts { intro: string[]; describes: string | null; notDescribes: string | null; how: string | null }

export function splitCoverage(text: string): CoverageParts {
  const clean = text.replace(/🔴|⚠️/g, '').trim();
  const out: CoverageParts = { intro: [], describes: null, notDescribes: null, how: null };
  const marks = [...clean.matchAll(SEG)];
  if (!marks.length) { out.intro = clean.split(/\n\n+/).filter(Boolean); return out; }
  const head = clean.slice(0, marks[0].index).trim();
  if (head) out.intro = head.split(/\n\n+/).filter(Boolean);
  marks.forEach((m, i) => {
    const from = (m.index ?? 0) + m[0].length;
    const to = i + 1 < marks.length ? marks[i + 1].index : clean.length;
    const body = clean.slice(from, to).trim();
    if (!body) return;
    const key = m[1].toLowerCase();
    if (key.startsWith('how')) out.how = body;
    else if (key.includes('not')) out.notDescribes = body;
    else out.describes = body;
  });
  return out;
}

export const BASIS_NAME: Record<PriceItem['basis'], string> = {
  allowed: 'Medicare allowed amount', payment: 'what all payers paid', out_of_pocket: 'paid by the patient',
  total_expenditure: 'total spending', charge: 'billed charge', wage: 'wage',
};

export default function LineDrawer({ item, ctx = {}, onClose }: { item: PriceItem | null; ctx?: Ctx; onClose: () => void }) {
  /* Esc, the top layer, the backdrop and inertness behind it all come from
     <Dialog>. What stays here is the one thing the platform leaves open: the
     page behind must not scroll under the drawer on a phone. */
  useEffect(() => {
    if (!item) return;
    document.body.classList.add('no-scroll');
    return () => { document.body.classList.remove('no-scroll'); };
  }, [item]);
  if (!item) return null;
  const cov = splitCoverage(item.coverage);
  const fit = fitOf(item, ctx);
  const loc = localityOf(ctx.locality);
  const formula = loc ? formulaParts(item.id, loc) : null;
  /* the big number in the drawer is the one this reader's line uses; the national sits under it */
  const shownUsd = fit.figureUsd;
  const nationalAside = shownUsd !== null && item.valueUsd !== null && Math.round(shownUsd) !== Math.round(item.valueUsd)
    ? ` · the national unadjusted figure is ${usd(item.valueUsd, true)}`
    : '';
  const charge = submittedChargeOf(item);
  const chargeNote = chargeNoteOf(item);
  const allowedAlt = allowedAlternateOf(item);
  const cy2024 = cy2024ProvenanceOf(item);

  /* 🔴 THE CAPTION MUST NAME THE FIGURE ABOVE IT, NOT THE ROW.
     When the person has no insurance the big number becomes the CY2024 average
     submitted charge — a different measure, from a different file, in a different
     year, read rather than derived. Printing the row's basis, the row's year and
     the row's confidence over it said "Medicare allowed amount · 2026 · derived"
     above a billed charge, and "open the source" opened a fee schedule that
     publishes no charges. Everything on this card is now chosen by which figure
     is actually being shown. */
  const showingCharge = fit.which === 'charge';
  const figCaption = showingCharge
    ? `Average submitted charge · CY2024${item.code ? ` · ${item.code}` : ''}`
    : `${BASIS_NAME[item.basis]} · ${item.year}${item.code ? ` · ${item.code}` : ''}`;
  const figConfidence = showingCharge
    ? 'Read in the source'
    : item.confidence === 'VERIFIED' ? 'Read in the source'
      : item.confidence === 'REPORTED' ? 'Reported' : 'Derived from the source';
  const figConfClass = showingCharge ? 'verified' : item.confidence.toLowerCase();
  /* The "open the source" button follows the same rule: the file that contains
     the figure on the card, never the file that contains a different one. */
  const openHref = showingCharge && cy2024 ? cy2024.url : item.sourceUrl;
  const openTitle = showingCharge && cy2024 ? cy2024.title : item.sourceTitle;
  /* The other published measure is whichever of the pair is not on the card. */
  const otherMeasure = showingCharge
    ? (allowedAlt !== null
        ? { usd: allowedAlt, what: 'average amount Medicare allowed for this service in CY2024, read in the same claims row' }
        : null)
    : (charge !== null
        ? { usd: charge, what: 'average charge submitted for this service in CY2024, carried on this row as an alternate measure' }
        : null);
  /* When nothing published describes this reader, the drawer must not put the
     Medicare figure where their figure goes. The blank keeps the position and
     the two published figures that bracket it sit underneath, each labelled. */
  const blank = shownUsd === null;
  const feeSchedule = ctx.coverage === 'medicaid' ? medicaidFeeScheduleFor(loc?.state) : null;
  return (
    <Dialog open onClose={onClose} label={item.label}>
      <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="eyebrow">{categoryOf(item).label}</p>
            <h2>{item.label}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon.X /></button>
        </div>
        <div className="drawer-body">
          <div className={`drawer-verdict ${fit.verdict === 'DESCRIBES YOU' ? 'cov-yes' : fit.verdict === 'NOT DESCRIBED' ? 'cov-no' : ''}`}>
            <span className="dv-g" aria-hidden="true">{fit.verdict === 'DESCRIBES YOU' ? '✓' : fit.verdict === 'NOT DESCRIBED' ? '✗' : fit.verdict === 'BILLED AGAINST THIS' ? '↑' : '≈'}</span>
            <p><strong>{fit.verdict}.</strong> {fit.why}</p>
          </div>
          <div className="fig-card">
            <p className="fig-num">{blank ? 'No published figure' : usd(shownUsd, true)}</p>
            <p className="fig-cap">{blank ? 'No published federal figure describes you here' : figCaption}</p>
            {!blank && <span className={`conf conf-${figConfClass}`}>{figConfidence}</span>}
          </div>
          {/* 🔴 TWO STANDARDS ON THE FACE, NOT ONE. A CPT code names what was billed;
              a LOINC code names what the lab actually measured, and it is the code a
              health-data professional recognises in a glance. 36 rows carry one,
              confirmed at NLM; the labs with no single matching LOINC stay blank and
              say why, because a plausible guess on a medical code is worse than a blank. */}
          {(item.loinc || item.pfsStatus) && (
            <p className={ds.standards}>
              {item.code && <><b>{item.code}</b>{item.loinc ? ' · ' : ''}</>}
              {item.loinc && (
                <>
                  <b>LOINC {item.loinc}</b>
                  {item.loincName ? ` — ${item.loincName}` : ''}
                  {item.loincSource ? <span className="micro"> Confirmed at {item.loincSource}</span> : null}
                </>
              )}
              {item.pfsStatus === 'N' && (
                <span className="micro">
                  CMS status indicator {item.pfsStatus} on the CY2026 fee schedule: a non-covered
                  service. The units are published; the payment is not.
                </span>
              )}
            </p>
          )}
          {!blank && fit.figureNote && (
            <p className="micro">{fit.figureNote}{nationalAside}</p>
          )}
          {blank && fit.reference && (
            <div className={cs.bracket}>
              {fit.reference.floorUsd !== null && (
                <p><b>{usd(fit.reference.floorUsd, true)}</b><span>{fit.reference.floorLabel}</span></p>
              )}
              {fit.reference.ceilingUsd !== null && fit.reference.ceilingLabel && (
                <p><b>{usd(fit.reference.ceilingUsd, true)}</b><span>{fit.reference.ceilingLabel}</span></p>
              )}
            </div>
          )}
          {blank && feeSchedule && (
            <p className={cs.nofigLink}>
              <a href={feeSchedule.url} target="_blank" rel="noopener noreferrer">
                Open the {feeSchedule.program} fee schedule <Icon.External />
              </a>
              <span className="micro">
                Medicaid rates are set by {feeSchedule.stateName}, not by the federal government, and
                are published there. Address checked {feeSchedule.verifiedOn}; {MEDICAID_LINK_COUNT}{' '}
                states are linked this way and a state we could not verify is left out rather than guessed.
              </span>
            </p>
          )}

          {/* 🔴 "SHOW ME THE SOURCE" IS ANSWERED IN ONE GLANCE.
              This link used to sit six sections down, under a File/Row/SHA table
              of raw CSV names, so the first screen of the drawer argued about
              provenance and never offered it. It now stands directly under the
              figure it opens and above every other measure. Nothing below was
              removed — the file, the row and the hash are still there for anyone
              who wants to check the check. */}
          {openHref && (
            <a className="btn ghost full" href={openHref} target="_blank" rel="noopener noreferrer">
              Open the source and check this number <Icon.External />
            </a>
          )}
          {showingCharge && cy2024 && (
            <p className="micro">
              That link opens {openTitle} — the file this charge is in, not the fee schedule the
              row&rsquo;s own figure comes from.
            </p>
          )}

          {formula && loc && (
            <section className={cs.formula}>
              <h3>How the figure for {loc.displayName} is made</h3>
              <p className="micro">CMS publishes no dollar column. It publishes these three relative value units, the three cost indices for your locality, and one conversion factor, and defines the payment as their product.</p>
              <table>
                <thead><tr><th scope="col">Component</th><th scope="col">RVU</th><th scope="col">Index</th><th scope="col">Product</th></tr></thead>
                <tbody>
                  {formula.parts.map((pt) => (
                    <tr key={pt.name}><th scope="row">{pt.name}</th><td>{pt.rvu.toFixed(2)}</td><td>{pt.gpci.toFixed(3)}</td><td>{pt.product.toFixed(4)}</td></tr>
                  ))}
                  <tr><th scope="row">Sum × ${CONVERSION_FACTOR.toFixed(4)}</th><td>{formula.sum.toFixed(4)}</td><td>—</td><td><strong>{usd(formula.total, true)}</strong></td></tr>
                </tbody>
              </table>
              <p className="micro">{formula.code} · CY2026 Physician Fee Schedule Relative Value File and Addendum E geographic practice cost indices. DERIVED: both inputs were read in the CMS files; the multiplication is ours, and you can redo it.</p>
            </section>
          )}

          {otherMeasure && (
            <section className="coverage">
              <h3>The other published measure of this same service</h3>
              <p>{usd(otherMeasure.usd, true)} — {otherMeasure.what}.</p>
              {chargeNote && <p className="micro">{chargeNote}</p>}
            </section>
          )}

          {/* Every CY2024 figure on this card says which file it is in, which row of
              that file, and what that file hashes to. data/verify_price_table.py
              re-reads the same row on every run and fails if the hash moved. */}
          {cy2024 && (charge !== null || allowedAlt !== null) && (
            <section className="coverage">
              <h3>Where the CY2024 figures come from</h3>
              <p>{cy2024.title}</p>
              <dl className="kv">
                <dt>File</dt><dd>{cy2024.file}</dd>
                <dt>Row</dt><dd>{cy2024.row}</dd>
                <dt>Setting</dt><dd>{cy2024.placeOfService}</dd>
                <dt>SHA-256</dt>
                <dd style={{ fontFamily: 'var(--font-m)', fontSize: '.75rem', wordBreak: 'break-all' }}>{cy2024.sha256}</dd>
                <dt>Retrieved</dt><dd>{cy2024.retrieved}</dd>
              </dl>
              {cy2024.method && <p className="micro">{cy2024.method}</p>}
            </section>
          )}

          <dl className="kv">
            <dt>Agency</dt><dd>{agencyOf(item)}</dd>
            <dt>Geography</dt><dd>{item.geography}</dd>
            <dt>Population</dt><dd>{item.population}</dd>
            <dt>Source</dt><dd>{item.sourceTitle}</dd>
            {item.loinc && (<><dt>LOINC</dt><dd>{item.loinc}{item.loincName ? ` — ${item.loincName}` : ''}</dd></>)}
          </dl>
          <section className="coverage">
            <h3>Who this number does and does not describe</h3>
            {cov.intro.map((t, i) => <p key={i}>{t}</p>)}
            <div className="cov-blocks">
              {cov.describes && (
                <div className="cov-b cov-yes">
                  <span className="cb-g" aria-hidden="true">✓</span>
                  <div><h4>Describes</h4><p>{cov.describes}</p></div>
                </div>
              )}
              {cov.notDescribes && (
                <div className="cov-b cov-no">
                  <span className="cb-g" aria-hidden="true">✗</span>
                  <div><h4>Does not describe</h4><p>{cov.notDescribes}</p></div>
                </div>
              )}
              {cov.how && (
                <details className="cov-b cov-how">
                  <summary>ƒ  How this number was made</summary>
                  <p>{cov.how}</p>
                </details>
              )}
            </div>
          </section>
        </div>
        <div className="drawer-foot">
          <button className="btn ghost full" type="button" onClick={onClose}>Close</button>
        </div>
      </aside>
      </div>
    </Dialog>
  );
}

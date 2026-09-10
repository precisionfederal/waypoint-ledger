'use client';
import { useEffect, useState } from 'react';
import type { PriceItem } from '@/lib/types';
import { usd } from '@/lib/pricing';
import { categoryOf } from '@/lib/categories';
import {
  CONVERSION_FACTOR, MEDICAID_LINK_COUNT, agencyOf, allowedAlternateOf, chargeNoteOf,
  cy2024ProvenanceOf, fitOf, formulaParts, localityOf, medicaidFeeScheduleFor, submittedChargeOf,
  type Ctx, type FitVerdict,
} from '@/lib/fit';
import { Icon } from './Icons';
import Dialog from './Dialog';
import cs from './ContextBar.module.css';
import ds from './LineDrawer.module.css';

/* ==========================================================================
   THE SOURCE DRAWER, IN SEVEN BLOCKS.

   Bo, 2026-09-09, looking at it in dark mode: "This part right here is so hard
   to read … hard to parse. Feels flat. Feels terrible UI." He was right twice.
   Hard to parse: eight kinds of thing — a verdict, a figure, two standards, a
   link, an RVU table, a provenance table, a 250-word paragraph — arrived in one
   column at one weight, so the eye had no way in. Flat: the panels behind them
   were within 1.09:1 of each other, which is no step at all.

   The fix is order and tone, never subtraction. Every fact that was on this
   card is still on it. What changed is that each one now sits in a block the
   eye can name, the blocks arrive in the order a person asks the questions —
   what is the number · can I check it · what is it · where is it from · who
   does it describe · what else is published — and each block is its own tone
   rather than another paragraph under another hairline.
   ========================================================================== */

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

/* ---------- reading the wall: sentences, not a slab ----------
   The coverage statement is one 250-word paragraph of seven or eight sentences.
   Nothing here rewrites a word of it; it is regrouped into short paragraphs so
   the eye has a place to rest, and the figures inside it — the $0 that is the
   most misleading number in the dataset, the charge, the multiple — are set in
   bold so a person scanning finds them without reading the slab. */

/** Sentence boundaries that survive "$7.77" and "CY2024 Q3". */
export function splitSentences(text: string): string[] {
  return text.replace(/\s+/g, ' ').trim()
    .split(/(?<=[.!?])\s+(?=[A-Z$“"(])/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Group into 3–5 paragraphs of one or two sentences. Word for word, regrouped. */
export function paragraphize(text: string, max = 5): string[] {
  const s = splitSentences(text);
  if (s.length <= 1) return s;
  const per = Math.max(1, Math.ceil(s.length / max));
  const out: string[] = [];
  for (let i = 0; i < s.length; i += per) out.push(s.slice(i, i + per).join(' '));
  return out;
}

/** The most a verdict may say beside the figure before it becomes a paragraph. */
export const LEAD_WORD_CAP = 30;

/** The verdict's first sentence goes beside the figure; the rest goes to block 6. */
export function splitWhy(why: string): { lead: string; rest: string } {
  const s = splitSentences(why || '');
  let lead = s[0] ?? '';
  let rest = s.slice(1).join(' ');
  const w = lead.split(' ').filter(Boolean);
  if (w.length > LEAD_WORD_CAP) {
    lead = `${w.slice(0, LEAD_WORD_CAP).join(' ')}…`;
    rest = `${w.slice(LEAD_WORD_CAP).join(' ')} ${rest}`.trim();
  }
  return { lead, rest };
}

const FIGURE_TOKEN = /\$\d[\d,]*(?:\.\d+)?|\b\d+(?:\.\d+)?\s+times\b/g;

/** Dollar figures and multiples, set bold, inside otherwise untouched prose. */
export function figureSpans(text: string): { t: string; b: boolean }[] {
  const out: { t: string; b: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(FIGURE_TOKEN)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ t: text.slice(at, i), b: false });
    out.push({ t: m[0], b: true });
    at = i + m[0].length;
  }
  if (at < text.length) out.push({ t: text.slice(at), b: false });
  return out;
}

function Prose({ text }: { text: string }) {
  return <>{figureSpans(text).map((s, i) => (s.b ? <b key={i}>{s.t}</b> : <span key={i}>{s.t}</span>))}</>;
}

/* ---------- the pill beside the figure ----------
   "NOT DESCRIBED" is a database word. Beside a dollar figure a person reads the
   pill as a claim about themselves, so it says so in their words. */
export const VERDICT_LABEL: Record<FitVerdict, string> = {
  'DESCRIBES YOU': 'DESCRIBES YOU',
  'REFERENCE PRICE': 'REFERENCE PRICE',
  'BILLED AGAINST THIS': 'BILLED AGAINST THIS',
  'NOT DESCRIBED': 'DOES NOT DESCRIBE YOU',
};

/* The label says CPT, so the value does not have to. `item.code` carries the
   standard's name inside the string ("CPT 85025") because it is printed inline
   elsewhere; in a label/value list that reads "CPT · CPT 85025". */

/** The row's LOINC provenance is one string with its URL in parentheses. */

export function loincLink(src: string): { text: string; url: string | null } {
  const m = src.match(/\((https?:\/\/[^)\s]+)\)\s*$/);
  return m ? { text: src.slice(0, m.index).trim(), url: m[1] } : { text: src.trim(), url: null };
}

/** A 64-character hash is not read; it is compared. Show enough to compare. */
export const HASH_CHIP_CHARS = 12;
export const shortHash = (sha: string) => sha.slice(0, HASH_CHIP_CHARS);

/** The full hash stays in the DOM for a screen reader and on the clipboard. */
function HashChip({ sha }: { sha: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className={ds.hash}>
      <code title={sha}>{shortHash(sha)}…</code>
      <span className="sr-only">{sha}</span>
      <button
        type="button"
        className={ds.copy}
        onClick={() => {
          navigator.clipboard?.writeText(sha).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1600); },
            () => { /* a browser that refuses the clipboard is not an error worth a dialog */ });
        }}
      >{done ? 'Copied' : 'Copy'}</button>
    </span>
  );
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
  const why = splitWhy(fit.why);
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
  const loincSrc = item.loincSource ? loincLink(item.loincSource) : null;
  const verdictTone = fit.verdict === 'DESCRIBES YOU' ? ds.pillYes : fit.verdict === 'NOT DESCRIBED' ? ds.pillNo : ds.pillRef;
  const showProvenance = Boolean(cy2024 && (charge !== null || allowedAlt !== null));
  return (
    <Dialog open onClose={onClose} label={item.label}>
      <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        {/* ---------- 1 · what this is a drawer about ---------- */}
        <div className="drawer-head">
          <div>
            <p className="eyebrow">{categoryOf(item).label}</p>
            <h2>{item.label}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon.X /></button>
        </div>
        <div className="drawer-body">

          {/* ---------- 2 · THE FIGURE ----------
              The one thing a person opened this for, at the size that says so,
              with the verdict beside it and one sentence under it. The rest of
              the verdict's paragraph is in block 6 with the rest of the prose. */}
          <section className={`${ds.block} ${ds.figure}`}>
            <div className={ds.figRow}>
              <p className={`fig-num ${ds.figNum}`}>{blank ? 'No published figure' : usd(shownUsd, true)}</p>
              <span className={`${ds.pill} ${verdictTone}`}>
                <span aria-hidden="true">{fit.verdict === 'DESCRIBES YOU' ? '✓' : fit.verdict === 'NOT DESCRIBED' ? '✗' : fit.verdict === 'BILLED AGAINST THIS' ? '↑' : '≈'}</span>
                {VERDICT_LABEL[fit.verdict]}
              </span>
            </div>
            {why.lead && <p className={ds.why}>{why.lead}</p>}
            <p className={`fig-cap ${ds.figCap}`}>{blank ? 'No published federal figure describes you here' : figCaption}</p>
            {!blank && <span className={`conf conf-${figConfClass}`}>{figConfidence}</span>}
            {!blank && fit.figureNote && (
              <p className={ds.figNote}>{fit.figureNote}{nationalAside}</p>
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
          </section>

          {/* ---------- 3 · THE ONE PRIMARY BUTTON ----------
              "Show me the source" is answered in one glance, directly under the
              figure it opens. It used to sit six sections down, under a File/Row/
              SHA table of raw CSV names. Nothing below was removed — the file,
              the row and the hash are still there for anyone who checks. */}
          {openHref && (
            <a className="btn primary full" href={openHref} target="_blank" rel="noopener noreferrer">
              Open the source and check this number <Icon.External />
            </a>
          )}
          {showingCharge && cy2024 && (
            <p className={ds.note}>
              That link opens {openTitle} — the file this charge is in, not the fee schedule the
              row&rsquo;s own figure comes from.
            </p>
          )}

          {/* ---------- 4 · WHAT IT IS ----------
              🔴 TWO STANDARDS ON THE FACE, NOT ONE. A CPT code names what was
              billed; a LOINC code names what the lab actually measured, and it is
              the code a health-data professional recognises in a glance. 36 rows
              carry one, confirmed at NLM; the labs with no single matching LOINC
              stay blank and say why, because a plausible guess on a medical code
              is worse than a blank. */}
          {(item.code || item.loinc || item.pfsStatus) && (
            <section className={ds.block}>
              <p className={ds.eyebrow}>What it is</p>
              <dl className={ds.dl}>
                {item.code && (<><dt>CPT</dt><dd className={ds.mono}>{item.code.replace(/^CPT\s+/, '')}</dd></>)}
                {item.loinc && (
                  <>
                    <dt>LOINC</dt>
                    <dd><span className={ds.mono}>{item.loinc}</span>{item.loincName ? ` — ${item.loincName}` : ''}</dd>
                  </>
                )}
                {loincSrc && (
                  <>
                    <dt>Confirmed at</dt>
                    <dd>{loincSrc.url
                      ? <a href={loincSrc.url} target="_blank" rel="noopener noreferrer">{loincSrc.text}</a>
                      : loincSrc.text}</dd>
                  </>
                )}
              </dl>
              {item.pfsStatus === 'N' && (
                <p className={ds.note}>
                  CMS status indicator {item.pfsStatus} on the CY2026 fee schedule: a non-covered
                  service. The units are published; the payment is not.
                </p>
              )}
            </section>
          )}

          {/* ---------- 5 · WHERE IT COMES FROM ----------
              Every CY2024 figure on this card says which file it is in, which row
              of that file, and what that file hashes to. data/verify_price_table.py
              re-reads the same row on every run and fails if the hash moved. */}
          <section className={ds.block}>
            <p className={ds.eyebrow}>Where it comes from</p>
            <dl className={ds.dl}>
              <dt>Agency</dt><dd>{agencyOf(item)}</dd>
              <dt>Source</dt><dd>{item.sourceTitle}</dd>
              <dt>Geography</dt><dd>{item.geography}</dd>
              <dt>Population</dt><dd>{item.population}</dd>
            </dl>
            {showProvenance && cy2024 && (
              <>
                <p className={ds.sub}>The CY2024 claims file behind the charge figures — {cy2024.title}</p>
                <dl className={ds.dl}>
                  <dt>File</dt><dd className={ds.mono}>{cy2024.file}</dd>
                  <dt>Row</dt><dd className={ds.mono}>{cy2024.row}</dd>
                  <dt>Setting</dt><dd>{cy2024.placeOfService}</dd>
                  <dt>SHA-256</dt><dd><HashChip sha={cy2024.sha256} /></dd>
                  <dt>Retrieved</dt><dd>{cy2024.retrieved}</dd>
                </dl>
                {cy2024.method && <p className={ds.note}>{cy2024.method}</p>}
              </>
            )}
            {formula && loc && (
              <div className={cs.formula}>
                <p className={ds.eyebrow}>How the figure for {loc.displayName} is made</p>
                <p className={ds.note}>CMS publishes no dollar column. It publishes these three relative value units, the three cost indices for your locality, and one conversion factor, and defines the payment as their product.</p>
                <table>
                  <thead><tr><th scope="col">Component</th><th scope="col">RVU</th><th scope="col">Index</th><th scope="col">Product</th></tr></thead>
                  <tbody>
                    {formula.parts.map((pt) => (
                      <tr key={pt.name}><th scope="row">{pt.name}</th><td>{pt.rvu.toFixed(2)}</td><td>{pt.gpci.toFixed(3)}</td><td>{pt.product.toFixed(4)}</td></tr>
                    ))}
                    <tr><th scope="row">Sum × ${CONVERSION_FACTOR.toFixed(4)}</th><td>{formula.sum.toFixed(4)}</td><td>—</td><td><strong>{usd(formula.total, true)}</strong></td></tr>
                  </tbody>
                </table>
                <p className={ds.note}>{formula.code} · CY2026 Physician Fee Schedule Relative Value File and Addendum E geographic practice cost indices. DERIVED: both inputs were read in the CMS files; the multiplication is ours, and you can redo it.</p>
              </div>
            )}
          </section>

          {/* ---------- 6 · WHO THIS NUMBER DOES AND DOES NOT DESCRIBE ----------
              The row's own words, not one of them changed, regrouped into short
              paragraphs at a line length a person reads, with the figures inside
              them set bold. This is the most careful writing in the product and
              it was the least-read thing in it. */}
          <section className={`${ds.block} ${ds.who}`}>
            <p className={ds.eyebrow}>Who this number does and does not describe</p>
            {why.rest && <p className={ds.p}><Prose text={why.rest} /></p>}
            {cov.intro.flatMap((t, i) => paragraphize(t).map((para, j) => (
              <p className={ds.p} key={`${i}-${j}`}><Prose text={para} /></p>
            )))}
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

          {/* ---------- 7 · THE OTHER PUBLISHED MEASURE ----------
              Last, because it is the answer to a question a person asks only
              after the first six. It is a second published figure for the same
              service, never a second opinion about the first. */}
          {otherMeasure && (
            <section className={ds.block}>
              <p className={ds.eyebrow}>The other published measure</p>
              <dl className={ds.dl}>
                <dt>Figure</dt><dd className={ds.otherNum}>{usd(otherMeasure.usd, true)}</dd>
                <dt>What it is</dt><dd>{otherMeasure.what}</dd>
                {cy2024 && (<><dt>Source</dt><dd>{cy2024.title}</dd></>)}
              </dl>
              {chargeNote && <p className={ds.note}>{chargeNote}</p>}
            </section>
          )}
        </div>
        <div className="drawer-foot">
          <button className="btn ghost full" type="button" onClick={onClose}>Close</button>
        </div>
      </aside>
      </div>
    </Dialog>
  );
}

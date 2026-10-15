'use client';
import { useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';
import type { PriceItem } from '@/lib/types';
import { usd } from '@/lib/pricing';
import { categoryOf } from '@/lib/categories';
import {
  CONVERSION_FACTOR, MEDICAID_LINK_COUNT, RVU, agencyOf, allowedAlternateOf, chargeNoteOf,
  cy2024ProvenanceOf, fitOf, formulaParts, localityOf, medicaidFeeScheduleFor, submittedChargeOf,
  blankCaption, verdictWords, type Ctx, type FitVerdict,
} from '@/lib/fit';
import { primarySourceOf } from '@/lib/primary-source';
import { Icon } from './Icons';
import Dialog from './Dialog';
import PrivateRange from './PrivateRange';
import cs from './ContextBar.module.css';
import ds from './LineDrawer.module.css';
import { coverageForReader } from '@/lib/coverage-words';

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

/** Bo 2026-09-10: the short answer is the first sentence; the rest waits
 *  under the fold. Splits at the first sentence end after ~40 characters. */
function shortAndRest(t: string | null | undefined): [string, string] {
  if (!t) return ['', ''];
  const m = /^(.{40,}?[.!?])(\s+.*)$/s.exec(t);
  if (!m) return [t, ''];
  return [m[1].trim(), m[2].trim()];
}

/** A spaced em dash in a short answer reads as a colon; the words are unchanged. */
export const calm = (t: string) => t.replace(/\s+\u2014\s+/g, ': ');

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

/* flow3-20: a parent answering for a child reads the card about the child, as the
   coverage heading already does. Only "you" changes; every other word is the same. */
export function verdictLabelFor(v: FitVerdict, forChild = false): string {
  return verdictWords(VERDICT_LABEL[v], forChild);
}
export { blankCaption };

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

export default function LineDrawer({ item, ctx = {}, onClose, forChild = false }: { item: PriceItem | null; ctx?: Ctx; onClose: () => void; forChild?: boolean }) {
  /* Esc, the top layer, the backdrop and inertness behind it all come from
     <Dialog>. What stays here is the one thing the platform leaves open: the
     page behind must not scroll under the drawer on a phone. */
  useEffect(() => {
    if (!item) return;
    document.body.classList.add('no-scroll');
    return () => { document.body.classList.remove('no-scroll'); };
  }, [item]);
  if (!item) return null;
  /* judge panel 15 Oct #2.4: Medicaid usually pays less than Medicare, not more (lib/coverage-words). */
  const cov = splitCoverage(coverageForReader(item.coverage));
  const fit = fitOf(item, ctx, forChild);
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
  /* 🔴 THE FILE, ROW AND HASH OF THE FIGURE ON THE CARD (R3 fedexpert FX-03). */
  const primary = fit.which === 'charge' ? [] : primarySourceOf(item, { locality: fit.which === 'locality' });

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
  /* 🔴 THE NAME COMES FROM THE HEADING THE PERSON CAN SEE (R6 edge #15).
     The dialog itself is the platform's: <Dialog> renders a real <dialog> and
     opens it with showModal(), so role=dialog and aria-modal=true are implicit
     and the focus trap is the browser's own (verified in this pass). What was
     missing was the tie to the visible title, so what a screen reader announces
     is the heading the person can see. */
  /* ---------- THE WORKED EQUATION (pages DETAIL, 2026-09-30) ----------
     Bo: "the detailed views are still hideously blocks of text." The math was a
     sentence inside the coverage wall. Where the figure on the card is a CMS fee
     schedule amount at national indices, the three published RVUs times the one
     conversion factor are set as an equation, and only when that product IS the
     figure on the card, to the cent. Anything else shows no equation at all. */
  const rvu = RVU[item.id];
  const rvuSum = rvu ? Math.round((rvu.work + rvu.peNonFacility + rvu.mp) * 100) / 100 : null;
  const nationalMath = !loc && fit.which === 'schedule' && item.basis === 'allowed' && rvu && rvuSum !== null
    && shownUsd !== null && Math.round(rvuSum * CONVERSION_FACTOR * 100) / 100 === Math.round(shownUsd * 100) / 100
    ? { rvu, sum: rvuSum } : null;
  const hasMath = Boolean(nationalMath || (formula && loc));
  const codeLabel = item.code ?? null;
  return (
    <Dialog open onClose={onClose} labelledBy="drawer-title" label={item.label}>
      <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        {/* ---------- 1 · what this is a drawer about ---------- */}
        <div className="drawer-head">
          <div>
            <p className="eyebrow">{categoryOf(item).label}</p>
            <h2 id="drawer-title">{item.label}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close this line"><Icon.X /></button>
        </div>
        <div className={`drawer-body ${ds.body}`}>

          {/* ---------- 2 · THE FIGURE, AS A DETAIL CARD ----------
              The one thing a person opened this for: the number big, the code
              as a badge, the verdict as a pill, one sentence under it. */}
          <section className={`${ds.block} ${ds.figure}`}>
            <div className={ds.badges}>
              {codeLabel && <span className={ds.codeBadge}>{codeLabel}</span>}
              <span className={`${ds.pill} ${verdictTone}`}>
                <span aria-hidden="true">{fit.verdict === 'DESCRIBES YOU' ? '✓' : fit.verdict === 'NOT DESCRIBED' ? '✗' : fit.verdict === 'BILLED AGAINST THIS' ? '↑' : '≈'}</span>
                {verdictLabelFor(fit.verdict, forChild)}
              </span>
            </div>
            <p className={`fig-num ${ds.figNum}`}>{blank ? 'No published figure' : usd(shownUsd, true)}</p>
            {why.lead && <p className={ds.why}>{why.lead}</p>}
            <div className={ds.capRow}>
              <p className={`fig-cap ${ds.figCap}`}>{blank ? blankCaption(forChild) : (codeLabel ? figCaption.replace(` · ${codeLabel}`, '') : figCaption)}</p>
              {!blank && <span className={`conf conf-${figConfClass}`}>{figConfidence}</span>}
            </div>
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
              figure it opens. The file, the row and the hash are in the fold. */}
          {openHref && (
            <a className="btn primary full" href={openHref} target="_blank" rel="noopener noreferrer">
              Open the source and check this number <Icon.External />
            </a>
          )}
          {showingCharge && cy2024 && (
            <p className={ds.note}>
              That link opens {openTitle}: the file this charge is in, not the fee schedule the
              row&rsquo;s own figure comes from.
            </p>
          )}
          {/* ---------- 4 · WHO THIS NUMBER DOES AND DOES NOT DESCRIBE ----------
              Two icon rows: a check for who the figure describes, a cross for who
              it does not. The first sentence of each; the rest is in the fold. */}
          <section className={`${ds.block} ${ds.who}`}>
            <p className={ds.eyebrow}>Who this number is about</p>
            <div className={`cov-blocks ${ds.whoRows}`}>
              {cov.describes && (
                <div className={`cov-b cov-yes ${ds.whoRow}`}>
                  <span className={`cb-g ${ds.whoIcon} ${ds.whoYes}`} aria-hidden="true"><Icon.Check /></span>
                  <div><h3 className="cov-h">Describes</h3><p>{calm(shortAndRest(cov.describes)[0])}</p></div>
                </div>
              )}
              {cov.notDescribes && (
                <div className={`cov-b cov-no ${ds.whoRow}`}>
                  <span className={`cb-g ${ds.whoIcon} ${ds.whoNo}`} aria-hidden="true"><Icon.X /></span>
                  <div><h3 className="cov-h">Does not describe</h3><p>{calm(shortAndRest(cov.notDescribes)[0])}</p></div>
                </div>
              )}
            </div>
          </section>

          {/* FLOW4 flow4-12: the link opens the agency's landing page, where the
              number is not. Say where in the file it is, from the fold's own fields.
              JUDGE-5 #8: it sits under "Who this number is about", not between
              the button and it, so on a 320 or 375 px phone the who block is
              not pushed under the Close bar. */}
          {openHref && !showingCharge && primary.length > 0 && (
            <p className={ds.note} data-testid="source-where">
              {primary.map((pt, i) => <span key={`${pt.file.key}-${pt.part ?? ''}`}>{i > 0 ? '; and in ' : 'The number is in '}the file <span className={ds.mono}>{pt.file.file}</span>, row <span className={ds.mono}>{pt.row}</span></span>)}.
              {' '}The codes and the math are in the fold below.
            </p>
          )}

          <PrivateRange item={item} ctx={ctx} />

          {/* ---------- THE FINE PRINT, ONE LINE AWAY (Bo 2026-09-10: "is my
              grandma going to read all this?") Nothing below was removed: the
              codes, the file, the row, the hash, the math and the other
              published measure are all still here, behind one line.
              🔴 OPENING IT VISIBLY OPENS IT (desktop F07): on open, its line
              scrolls to the top of the drawer. */}
          <details className="drawer-more" onToggle={revealMore}>
            <summary>Show the source, the codes and the math<span className={ds.chev} aria-hidden="true" /></summary>
            <div className={ds.fold}>
          {/* ---------- 5 · WHAT IT IS ----------
              🔴 TWO STANDARDS ON THE FACE, NOT ONE. A CPT code names what was
              billed; a LOINC code names what the lab actually measured. 36 rows
              carry one, confirmed at NLM; the labs with no single matching LOINC
              stay blank, because a plausible guess on a medical code is worse
              than a blank. The codes are badges, their meanings beside them. */}
          {(item.code || item.loinc || item.pfsStatus) && (
            <section className={ds.block}>
              <p className={ds.eyebrow}>What it is</p>
              <dl className={`${ds.dl} ${ds.codes}`}>
                {item.code && (<><dt>CPT</dt><dd><span className={ds.codeChip}>{item.code.replace(/^CPT\s+/, '')}</span></dd></>)}
                {item.loinc && (
                  <>
                    <dt>LOINC</dt>
                    <dd><span className={ds.codeChip}>{item.loinc}</span>{item.loincName ? <span className={ds.codeName}>{item.loincName}</span> : null}</dd>
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

          {/* ---------- 6 · THE MATH, AS A WORKED EQUATION ---------- */}
          {hasMath && (
            <section className={`${ds.block} ${ds.math}`}>
              <p className={ds.eyebrow}>{loc ? <>How the figure for {loc.displayName} is made</> : 'The math'}</p>
              {nationalMath && (
                <div className={ds.eq} data-testid="worked-equation">
                  <p className={ds.eqRow}><span>Work RVUs</span><span className={ds.op} /><b>{nationalMath.rvu.work.toFixed(2)}</b></p>
                  <p className={ds.eqRow}><span>Practice expense RVUs</span><span className={ds.op}>+</span><b>{nationalMath.rvu.peNonFacility.toFixed(2)}</b></p>
                  <p className={ds.eqRow}><span>Malpractice RVUs</span><span className={ds.op}>+</span><b>{nationalMath.rvu.mp.toFixed(2)}</b></p>
                  <p className={`${ds.eqRow} ${ds.eqSum}`}><span>Total RVUs</span><span className={ds.op}>=</span><b>{nationalMath.sum.toFixed(2)}</b></p>
                  <p className={ds.eqRow}><span>CY2026 conversion factor</span><span className={ds.op}>×</span><b>${CONVERSION_FACTOR.toFixed(4)}</b></p>
                  <p className={`${ds.eqRow} ${ds.eqTotal}`}><span>The figure on this card</span><span className={ds.op}>=</span><b>{usd(shownUsd, true)}</b></p>
                  <p className={ds.note}>CPT {nationalMath.rvu.code}, CY2026 Physician Fee Schedule, at national geographic indices of 1.000. Both inputs were read in the CMS file; the multiplication is ours, and you can redo it.</p>
                </div>
              )}
              {formula && loc && (
                <div className={`${cs.formula} ${ds.formula}`}>
                  <p className={ds.note}>CMS publishes no dollar column. It publishes these three relative value units, the three cost indices for your locality, and one conversion factor, and defines the payment as their product.</p>
                  <div className={ds.tableWrap}>
                  <table>
                    <thead><tr><th scope="col">Component</th><th scope="col">RVU</th><th scope="col">Index</th><th scope="col">Product</th></tr></thead>
                    <tbody>
                      {formula.parts.map((pt) => (
                        <tr key={pt.name}><th scope="row">{pt.name}</th><td>{pt.rvu.toFixed(2)}</td><td>{pt.gpci.toFixed(3)}</td><td>{pt.product.toFixed(4)}</td></tr>
                      ))}
                      <tr><th scope="row">Sum × ${CONVERSION_FACTOR.toFixed(4)}</th><td>{formula.sum.toFixed(4)}</td><td>–</td><td><strong>{usd(formula.total, true)}</strong></td></tr>
                    </tbody>
                  </table>
                  </div>
                  <p className={ds.note}>{formula.code} · CY2026 Physician Fee Schedule Relative Value File and Addendum E geographic practice cost indices. DERIVED: both inputs were read in the CMS files; the multiplication is ours, and you can redo it.</p>
                </div>
              )}
            </section>
          )}

          {/* ---------- 7 · WHERE IT COMES FROM ----------
              Every CY2024 figure on this card says which file it is in, which row
              of that file, and what that file hashes to. data/verify_price_table.py
              re-reads the same row on every run and fails if the hash moved. The
              file is a provenance card of its own: name, row, hash, download. */}
          <section className={ds.block}>
            <p className={ds.eyebrow}>Where it comes from</p>
            <dl className={ds.dl}>
              <dt>Agency</dt><dd>{agencyOf(item)}</dd>
              <dt>Source</dt><dd>{item.sourceTitle}</dd>
              <dt>Geography</dt><dd>{item.geography}</dd>
              <dt>Population</dt><dd>{item.population}</dd>
            </dl>
            {primary.length > 0 && (
              <>
                <p className={ds.sub}>The file this {shownUsd === null ? 'row’s figure' : usd(shownUsd, true)} comes from</p>
                {primary.map((pt) => (
                  <div className={ds.prov} key={`${pt.file.key}-${pt.part ?? ''}`}>
                    <dl className={`${ds.dl} ${ds.provDl}`} data-testid="primary-source">
                      {pt.part && (<><dt>Part</dt><dd>{pt.part}</dd></>)}
                      <dt>File</dt><dd className={ds.mono}>{pt.file.file}</dd>
                      <dt>Row</dt><dd className={ds.mono}>{pt.row}</dd>
                      <dt>Columns</dt><dd className={ds.mono}>{pt.fields}</dd>
                      <dt>SHA-256</dt><dd><HashChip sha={pt.file.sha256} /></dd>
                      <dt>Download</dt><dd><a href={pt.file.url} target="_blank" rel="noopener noreferrer">{pt.file.title}</a></dd>
                      <dt>Retrieved</dt><dd>{pt.file.retrieved}</dd>
                    </dl>
                  </div>
                ))}
              </>
            )}
            {showProvenance && cy2024 && (
              <div className={`${ds.prov} ${ds.provOther}`}>
                {/* Labelled one-liners, not a paragraph (Bo 2026-09-30: "hideously
                    blocks of text"). The header says which figure this file is
                    behind; the method's own words stay whole under "The full note". */}
                <p className={ds.provHead}>{showingCharge
                  ? <><b>The file this {usd(shownUsd, true)} comes from</b> <span>· CY2024 claims file</span></>
                  : <><b>Other published measure</b> <span>· CY2024 claims file (a different file, not the source of {shownUsd === null ? 'this row\u2019s figure' : usd(shownUsd, true)})</span></>}</p>
                <dl className={`${ds.dl} ${ds.provDl}`}>
                  <dt>Source</dt><dd>{cy2024.title}</dd>
                  <dt>File</dt><dd className={ds.mono}>{cy2024.file}</dd>
                  <dt>Row</dt><dd className={ds.mono}>{cy2024.row}</dd>
                  <dt>Setting</dt><dd>{cy2024.placeOfService}</dd>
                  <dt>SHA-256</dt><dd><HashChip sha={cy2024.sha256} /></dd>
                  <dt>Retrieved</dt><dd>{cy2024.retrieved}</dd>
                </dl>
                {cy2024.method && (
                  <>
                    <p className={ds.line}><b>How it&rsquo;s read:</b> copied from the row above, never averaged or adjusted.</p>
                    <p className={ds.line}><b>Check it:</b> open the file, filter to the row, same number.</p>
                    <details className={ds.mini}>
                      <summary>The full note</summary>
                      <p className={ds.note}>{cy2024.method}</p>
                    </details>
                  </>
                )}
              </div>
            )}
          </section>

          {/* ---------- 8 · THE OTHER PUBLISHED MEASURE ----------
              A second published figure for the same service, never a second
              opinion about the first. */}
          {otherMeasure && (
            <section className={ds.block}>
              <p className={ds.eyebrow}>The other published measure</p>
              <div className={ds.other}>
                <p className={ds.otherNum}>{usd(otherMeasure.usd, true)}</p>
                <dl className={ds.dl}>
                  <dt>What it is</dt><dd>{otherMeasure.what}</dd>
                  {cy2024 && (<><dt>Source</dt><dd>{cy2024.title}</dd></>)}
                </dl>
              </div>
              {chargeNote && <p className={ds.note}>{chargeNote}</p>}
            </section>
          )}

          {/* ---------- 9 · THE LONGER ANSWER ----------
              The row's own words, not one of them changed, regrouped into short
              paragraphs with the figures inside them set bold. Last, because a
              person reads it only after the figure, the codes and the file. */}
            <section className={`${ds.block} ${ds.longer}`}>
              <p className={ds.eyebrow}>The longer answer</p>
              {shortAndRest(cov.describes)[1] && <p className={ds.p}><b>Describes.</b> {shortAndRest(cov.describes)[1]}</p>}
              {shortAndRest(cov.notDescribes)[1] && <p className={ds.p}><b>Does not describe.</b> {shortAndRest(cov.notDescribes)[1]}</p>}
              {why.rest && <p className={ds.p}><Prose text={why.rest} /></p>}
              {cov.intro.flatMap((t, i) => paragraphize(t).map((para, j) => (
                <p className={ds.p} key={`${i}-${j}`}><Prose text={para} /></p>
              )))}
              {cov.how && <p className={ds.p}><b>How this number was made.</b> {cov.how}</p>}
            </section>
            </div>
          </details>
        </div>
        <div className="drawer-foot">
          <button className="btn ghost full" type="button" onClick={onClose}>Close</button>
        </div>
      </aside>
      </div>
    </Dialog>
  );
}

/** Scrolls an opened fold's summary to the top of the drawer's own scroll area. */
function revealMore(e: SyntheticEvent<HTMLDetailsElement>) {
  const d = e.currentTarget;
  if (!d.open) return;
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(() => d.querySelector('summary')?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }));
}

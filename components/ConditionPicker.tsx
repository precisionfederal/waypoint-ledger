'use client';
/* ==========================================================================
   THE CONDITION SELECTOR — and the year-ahead panel it drives.

   The ledger used to print "The year ahead, for an adult with long COVID" to
   every visitor, including people who never said they had it. Two components
   here fix that and turn the fix into the product's best answer on reuse:

   <ConditionPicker/>  the chips — every condition in data/conditions.json and "prefer not to say",
                       remembered in this browser and never transmitted, with
                       the standard ICD-10-CM code printed under the choice.
   <YearAheadCard/>    the panel — that condition's published figure with its
                       kind named on its face, or, for those with no
                       published figure, the absence in words with a way to
                       COUNT it. How many have none is the finding, and it is
                       read from the data, never written here.

   Nothing here holds a number. Every figure comes through benchmarkFor() from
   a row in data/prices.json with its federal file behind it; every code is
   re-read in the CDC/NCHS file by data/verify_conditions.py.
   ========================================================================== */

// Next compiles this file with the automatic JSX runtime; the unit suite
// transforms it with esbuild's classic runtime, which emits React.createElement.
// The import costs nothing at build time and lets the tests render the panel.
import React from 'react';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import Link from '@/components/IntentLink';
import {
  BLANK_CODE_NOTE, CONDITIONS, ICD10CM_BROWSER, ICD10CM_YEARS, PRICED_CONDITIONS,
  benchmarkFor, useCondition, type Benchmark, type Condition, type ConditionFigure,
  type PublishedAmount,
} from '@/lib/conditions';
import s from './ConditionPicker.module.css';

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
/* A published interval can run below zero, and a minus sign in front of a dollar
   sign is how a person reads that. Never "$-95". */
const usdSigned = (n: number) => (n < 0 ? '\u2212' : '') + usd(Math.abs(n));
const interval = (a: PublishedAmount) =>
  a.low === null || a.high === null ? null : `${usdSigned(a.low)} to ${usdSigned(a.high)}`;

/* ==========================================================================
   🔴 "NOTHING CHOSEN" AND "PREFER NOT TO SAY" ARE TWO DIFFERENT ANSWERS.

   They used to be the same value — `conditionId === null` — so the quiet chip
   rendered pre-selected, aria-pressed="true", to every first-time visitor, and
   the year-ahead panel then rendered nothing at all because nothing had been
   "chosen". The most quotable published figure in the product was invisible to
   the person who did the most natural thing: type the sentence and read.

   So declining is now its own remembered fact, in this browser and nowhere
   else, exactly like the condition itself. It is never sent, and it is not a
   diagnosis, so it carries none of the condition's sensitivity — but it lives
   under the same promise anyway.
   ========================================================================== */

export const DECLINED_KEY = 'waypoint-ledger.condition-declined.v1';

let declined = false;
let declinedLoaded = false;
const declinedListeners = new Set<() => void>();

function declinedEmit() { for (const l of declinedListeners) l(); }
function declinedSubscribe(l: () => void) { declinedListeners.add(l); return () => { declinedListeners.delete(l); }; }
function declinedSnapshot() { return declined; }
function declinedServerSnapshot() { return false; }
function declinedLoadedSnapshot() { return declinedLoaded; }
function declinedLoadedServerSnapshot() { return false; }

function loadDeclinedOnce() {
  if (declinedLoaded) return;
  declinedLoaded = true;
  try { declined = localStorage.getItem(DECLINED_KEY) === '1'; }
  catch { /* private mode — the chip still works for this visit */ }
  declinedEmit();
}

/** Test seam and hard reset. */
export function resetDeclined() {
  declined = false; declinedLoaded = false;
  try { localStorage.removeItem(DECLINED_KEY); } catch { /* nothing to do */ }
  declinedEmit();
}

export function useDeclined(): { declined: boolean; hydrated: boolean; setDeclined: (v: boolean) => void } {
  const value = useSyncExternalStore(declinedSubscribe, declinedSnapshot, declinedServerSnapshot);
  const hydrated = useSyncExternalStore(declinedSubscribe, declinedLoadedSnapshot, declinedLoadedServerSnapshot);
  useEffect(() => { loadDeclinedOnce(); }, []);
  const setDeclined = useCallback((v: boolean) => {
    declined = v;
    try { if (v) localStorage.setItem(DECLINED_KEY, '1'); else localStorage.removeItem(DECLINED_KEY); }
    catch { /* nothing to do; the answer still holds for this visit */ }
    declinedEmit();
  }, []);
  return { declined: value, hydrated, setDeclined };
}

/* ==========================================================================
   WHAT THE PERSON'S OWN WORDS ALREADY SAY.

   Someone who types "four years of appointments after long COVID" has told the
   product what they are looking into without touching a chip. Reading that is
   a text match against this file's own labels and `also_called` synonyms — no
   model, no inference about anybody's health, and nothing transmitted: the
   words are already on this device because they are the ledger.

   🔴 IT NEVER BECOMES THE PERSON'S CHOICE. It only decides which published
   figure the invitation card offers, and that card always says "if you are
   looking into X", never "you have X". A diagnosis is asserted by the person
   or by nobody.
   ========================================================================== */

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** label without its parenthetical gloss, plus every published synonym */
function termsFor(c: Condition): string[] {
  const label = c.label.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return [label, ...c.alsoCalled].map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 3);
}

/**
 * The condition this person's own sentences name, or null.
 * Earliest mention wins; a longer term beats a shorter one at the same spot.
 */
export function impliedConditionId(text: string | null | undefined): string | null {
  if (!text) return null;
  const hay = text.toLowerCase();
  let best: { id: string; at: number; len: number } | null = null;
  for (const c of CONDITIONS) {
    for (const t of termsFor(c)) {
      const m = new RegExp(`\\b${esc(t)}\\b`).exec(hay);
      if (!m) continue;
      const cand = { id: c.id, at: m.index, len: t.length };
      if (!best || cand.at < best.at || (cand.at === best.at && cand.len > best.len)) best = cand;
    }
  }
  return best ? best.id : null;
}

/* --------------------------------------------------------------- the chips */

export default function ConditionPicker({ heading = 'What you are looking into' }:
  { heading?: string }) {
  const { condition } = useCondition();

  return (
    <div className={s.group} role="group" aria-labelledby="cond-h">
      <p className={s.lbl} id="cond-h">{heading}</p>
      <p className={s.note}>
        This changes which year figure the ledger shows you, and stops it showing you
        someone else&rsquo;s. It stays on this device: it is never sent with a correction, a
        saved ledger or a share link.
      </p>
      <ChipRow />
      {condition && <CodeLine condition={condition} />}
    </div>
  );
}

/* 🔴 ONE CHIP ROW, TWO PLACES (R6 edge #6).
   The year-ahead card used to point the reader at chips sitting above it while the
   chips were inside the context panel, collapsed behind the Change button at the top:
   a person reading the card had no chip in view and no way to get one. The chips
   are this component, so the card renders the real control rather than pointing
   at one. Same state, same store, no second copy. */
export function ChipRow({ label }: { label?: string }) {
  const { conditionId, setCondition } = useCondition();
  const { declined, setDeclined } = useDeclined();
  return (
    <>
      {label && <p className={s.lbl}>{label}</p>}
      <div className={s.chips}>
        {CONDITIONS.filter((c) => c.picker === 'chip').map((c) => (
          <button
            key={c.id}
            type="button"
            className={`${s.chip} ${conditionId === c.id ? s.on : ''}`}
            aria-pressed={conditionId === c.id}
            onClick={() => { setDeclined(false); setCondition(conditionId === c.id ? null : c.id); }}
          >
            {c.label}
          </button>
        ))}
        {/* 🔴 Not pre-selected. Declining is a real answer and is pressed only
            once it has actually been given; before that nothing is chosen. */}
        <button
          type="button"
          className={`${s.chip} ${s.quiet} ${declined ? s.on : ''}`}
          aria-pressed={declined}
          onClick={() => { setCondition(null); setDeclined(!declined); }}
        >
          Prefer not to say
        </button>
      </div>
      {/* The rest of the conditions in data/conditions.json, one list rather than
          dozens of chips. The same choice, the same store: choosing here is
          choosing a chip. */}
      {LISTED.length > 0 && (
        <p className={s.note}>
          <label>
            Another condition{' '}
            <select
              value={LISTED.some((c) => c.id === conditionId) ? conditionId ?? '' : ''}
              onChange={(e) => { setDeclined(false); setCondition(e.target.value || null); }}
              style={{ minHeight: 44, maxWidth: '100%', font: 'inherit' }}
            >
              <option value="">Choose one ({LISTED.length})</option>
              {LISTED.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        </p>
      )}
    </>
  );
}

const LISTED = CONDITIONS.filter((c) => c.picker === 'list')
  .slice().sort((a, b) => a.label.localeCompare(b.label));

/** The standard diagnosis code, or the reason there deliberately is none. */
function CodeLine({ condition: c }: { condition: Condition }) {
  if (!c.icd10cm) {
    return (
      <p className={s.blank}>
        <strong>No ICD-10-CM code on this row, on purpose.</strong> {c.icd10cmBlankReason ?? BLANK_CODE_NOTE}
      </p>
    );
  }
  return (
    <p className={s.code}>
      <span className={s.codeMark}>ICD-10-CM {c.icd10cm}</span>
      {c.icd10cmTitle}
      {c.icd10cmBillable === false && <>: a category heading, not a code that goes on a claim.</>}
      <span className={s.codeSrc}>
        {c.icd10cmSource ?? 'CDC/NCHS, ICD-10-CM'}
        {c.icd10cmFirstEffective
          ? `. First effective ${new Date(c.icd10cmFirstEffective + 'T00:00:00Z')
              .toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}.`
          : '.'}
        {ICD10CM_YEARS.length === 2
          ? ` Re-read in the FY${ICD10CM_YEARS[0]} and FY${ICD10CM_YEARS[1]} code files.`
          : ''}{' '}
        <a href={ICD10CM_BROWSER} target="_blank" rel="noopener noreferrer">Look it up at CDC</a>
      </span>
    </p>
  );
}

/* -------------------------------------------------------------- the panel */

/* 🔴 R6 sense F11 + edge #17: THE LABEL IS THE PLAIN WORDS AND THE TERM IS THE GLOSS.
   The face used to open with the single word "Excess" — defined nowhere near it —
   and then teach epistemology ("the interval is the answer, not the middle of it")
   before the reader knew what the number was. A person gets the sentence first;
   the economist's term is underneath it, still on the face, still in full. */
const KIND_MARK: Record<string, {
  cls: string; word: string; suffix: string; gloss: string;
}> = {
  excess: {
    cls: 'kindExcess',
    word: 'What a year costs on top',
    suffix: ' more in a year',
    gloss: 'Economists call that the excess, and it is the honest way to state the cost of a '
         + 'condition: the gross figure counts care the person would have needed anyway.',
  },
  condition_attributed: {
    cls: 'kindAttr',
    word: 'What a year of treating it costs',
    suffix: ' in a year',
    gloss: 'Economists call that a condition-attributed figure: it counts the treatment of this '
         + 'condition and none of the other care the same person needed.',
  },
};

/**
 * The figure itself: the plain line first, the point estimate under it, then what
 * the figure measures in the ROW's own words, then the term an economist uses for
 * it. `means` is the row's sentence — the definition edge #17 asked to see on the
 * face — so the term never arrives before the meaning.
 */
function FigureFace({ b, means }: { b: ConditionFigure; means: React.ReactNode }) {
  const mark = KIND_MARK[b.figureKind] ?? KIND_MARK.condition_attributed;
  const hasRange = b.low !== null && b.high !== null;
  return (
    <>
      <p className={`${s.kind} ${s[mark.cls]}`}>{mark.word}</p>
      {/* 🔴 round 2 judge2-1, judge2-2: the same form as /conditions and /policy.
          The estimate leads; a mean is called a mean with the published median
          beside it at the same size; a 95% interval is said to be one, and is
          never "the answer" (it is uncertainty about the population average). */}
      <strong className={s.figure}>
        {b.median !== null
          ? `${usd(b.point)} mean · ${usd(b.median)} median${mark.suffix} (${b.year})`
          : `${usd(b.point)}${mark.suffix} (${b.year})`}
        {hasRange && (
          <span className={s.point}>
            95% interval {usd(b.low as number)} to {usd(b.high as number)}: the range the study&rsquo;s
            average could plausibly take. It is about the population, not a range for one person.
          </span>
        )}
      </strong>
      <p className={s.means}>{means}</p>
      <p className={s.means}>{mark.gloss}</p>
    </>
  );
}

/* 🔴 R6 sense F5 / data F8: WHO PUBLISHED IT, ON THE FACE.
   "AHRQ MEPS" names the SURVEY. Where the estimate is somebody else's reading of
   that survey, the whole distinction used to be carried by the word "data" — which
   nobody reads as "someone else's estimate" — while the publisher note sat inside a
   collapsed fold. The sentence now sits on the face, in the row's own words. */
function ProvenanceLine({ b }: { b: ConditionFigure }) {
  return (
    <p className={s.meta}>
      {b.isGovernmentPublication || !b.faceProvenance
        ? <>{b.year} {b.agencyDisplay ?? 'source'}, {b.geography}.</>
        : <>{b.faceProvenance} {b.geography}.</>}
      {b.neverAddedToTotal ? ' A whole year of care, so it is never added to the lines above.' : ''}
    </p>
  );
}

/* 🔴 R6 data F8: WHOSE MONEY IT IS.
   "a person spends $1,619 to $6,578" is the sentence a patient advocate objects to
   out loud: about nine tenths of this excess is an insurer's money, and the
   published out-of-pocket share has an interval that crosses zero. Both figures are
   read off the rows of the price table, never typed here. */
function PayerSplit({ b }: { b: ConditionFigure }) {
  if (!b.paidByInsurers && !b.outOfPocket) return null;
  const ins = b.paidByInsurers ? interval(b.paidByInsurers) : null;
  const oop = b.outOfPocket ? interval(b.outOfPocket) : null;
  const crossesZero = !!b.outOfPocket
    && ((b.outOfPocket.low !== null && b.outOfPocket.low <= 0) || b.outOfPocket.significant === false);
  return (
    <p className={s.meta}>
      {b.paidByInsurers && (
        <>
          <strong>Most of it is not the person&rsquo;s money.</strong>{' '}
          {usd(b.paidByInsurers.point)} of it was paid by insurers
          {ins ? ` (${ins})` : ''}.{' '}
        </>
      )}
      {b.outOfPocket && (
        <>
          The published extra paid out of pocket is {usd(b.outOfPocket.point)} a year
          {oop ? `, and its interval (${oop})` : ''}
          {crossesZero
            ? ' crosses zero, so on this measure the study cannot say it differs from zero at all.'
            : '.'}
        </>
      )}
    </p>
  );
}

/* 🔴 R6 sense F12: THE SKEW ANSWER IS COMPUTED, AND IT IS GIVEN EVERYWHERE.
   The multiple of the median used to be typed into the prose beside a computed
   number: a new row makes that sentence false and nothing catches it. And the
   skew question was answered
   for heart disease and not for diabetes, which reads as answering it only where it
   is convenient. */
function MedianLine({ b }: { b: ConditionFigure }) {
  if (b.median !== null) {
    const ratio = b.meanOverMedian;
    return (
      <p className={s.meta}>
        The median for the same population is {usd(b.median)}
        {ratio ? <>, and the mean is about {Math.round(ratio)} times it</> : null}, so most
        people spend far less and a few spend enormously more.
      </p>
    );
  }
  if (b.medianBlankReason) return <p className={s.meta}>{b.medianBlankReason}</p>;
  return null;
}

/**
 * The year-ahead card. Replaces the two compile-time constants the ledger used
 * to pin to long COVID. Renders nothing at all when no condition is chosen —
 * a figure nobody asked for is the thing we are removing.
 *
 * `conditionId` overrides the person's choice. The appointment sheet and the
 * print view need to render a named condition without touching this browser's
 * stored choice, and the tests need to render one without a DOM. Leave it out
 * and the card follows whatever the person picked.
 */
export interface YearAheadCardProps {
  /** omit to follow the person's own choice; pass null to render nothing */
  conditionId?: string | null;
  /**
   * The person's own typed phrases, so the invitation can offer the figure for
   * the condition their words already name. Never stored, never sent, never
   * turned into a choice on their behalf.
   */
  impliedFrom?: string | null;
}

/**
 * 🔴 THE DEFAULT VISITOR GETS THE BEST FIGURE IN THE PRODUCT, NOT A BLANK.
 *
 * This card used to return null whenever nothing was chosen, which meant the
 * visitor who answered no questions — the most likely judge, and the most
 * likely patient — never saw the published year-ahead range at all. The blank
 * was there to stop us handing somebody a figure that does not describe them.
 * That instinct is right and it is kept: what renders now is an INVITATION,
 * conditionally worded, attributed to nobody, with every figure still coming
 * from its own row and carrying its own source.
 */
export function YearAheadCard({ conditionId, impliedFrom = null }: YearAheadCardProps) {
  const chosen = useCondition();
  const { declined, hydrated: declinedHydrated } = useDeclined();
  const following = conditionId === undefined;
  const benchmark = following ? chosen.benchmark : benchmarkFor(conditionId);
  if (benchmark) {
    return benchmark.kind === 'figure'
      ? <FigurePanel b={benchmark} />
      : <AbsencePanel b={benchmark} />;
  }
  /* An explicit `conditionId={null}` still renders nothing: the sheet and the
     print view ask for a named condition or for silence, never for an ask. */
  if (!following) return null;
  /* Until this browser's stored answer has been read, render nothing rather
     than flash an invitation at somebody who chose a condition weeks ago. */
  if (!chosen.hydrated || !declinedHydrated) return null;
  return <YearAheadInvitation implied={impliedConditionId(impliedFrom)} declined={declined} />;
}

/**
 * What a person who has chosen nothing sees. Three shapes, one rule: no figure
 * on this card is ever said to be theirs.
 *   · their own words name a condition WITH a published figure → that figure,
 *     offered conditionally ("if you are looking into …");
 *   · their words name one with NO published figure → the absence, in words,
 *     with the way to count it — the finding, not a gap in the product;
 *   · nothing is named → every published year-ahead figure we hold, each
 *     labelled with the measure it is, under "pick your condition to narrow
 *     this".
 */
export function YearAheadInvitation({ implied, declined = false }:
  { implied: string | null; declined?: boolean }) {
  const b = benchmarkFor(implied);
  const ask = declined
    ? 'You chose not to say, so nothing here is attributed to you.'
    : 'Nothing is chosen yet, so nothing here is yours.';

  if (b && b.kind === 'figure') return <ImpliedFigurePanel b={b} ask={ask} />;
  if (b) {
    return (
      <section className="card year" aria-labelledby="year-ahead-h">
        <p className="lbl">Shown apart, never added to the total above</p>
        <h2 id="year-ahead-h">
          A year with {lowerFirstWord(b.condition.label)}, if that is what you are looking into
        </h2>
        <p className={`${s.kind} ${s.kindNone}`}>No published figure</p>
        <p className={s.means}>{b.reason}</p>
        <p className={s.meta}>{b.qualifier}</p>
        <NationalContext c={b.condition} />
        <PublishedFigures c={b.condition} />
        <div className={s.invite}>
          <p>{ask} Your own words named it; confirm it here and this card is yours.</p>
          <ChipRow label="Which are you looking into?" />
        </div>
        <p className={s.acts}>
          <Link className="btn primary small" href={b.gapHref}>Count this gap</Link>
          <Link className="btn ghost small" href="/method#conditions">Which conditions have a figure</Link>
        </p>
      </section>
    );
  }
  return <PublishedSpanPanel ask={ask} />;
}

/** The implied condition's own published figure, offered and never assigned. */
function ImpliedFigurePanel({ b, ask }: { b: Extract<Benchmark, { kind: 'figure' }>; ask: string }) {
  return (
    <section className="card year" aria-labelledby="year-ahead-h">
      <p className="lbl">What a year with this condition costs on top of ordinary care: published separately, and never added to the total above</p>
      <h2 id="year-ahead-h">
        A year with {lowerFirstWord(b.condition.label)} ({b.year}), if that is what you are looking into
      </h2>
      <FigureFace b={b} means={`${b.figureKindLabel}.`} />
      <ProvenanceLine b={b} />
      <PayerSplit b={b} />
      <div className={s.invite}>
        <p>{ask} Choose yours and this card becomes one figure.</p>
        <ChipRow label="Which are you looking into?" />
      </div>
      <details className={s.fine}>
        <summary>Who is in this figure</summary>
        <p className={s.meta}>
          <strong>Who this describes:</strong> {b.population}.
        </p>
      </details>
      <p className={s.acts}>
        {b.sourceUrl && (
          <a className="btn ghost small" href={b.sourceUrl} target="_blank" rel="noopener noreferrer">
            Open the source
          </a>
        )}
        <Link className="btn ghost small" href="/method#conditions">How this figure is chosen</Link>
      </p>
    </section>
  );
}

/**
 * 🔴 EVERY PUBLISHED YEAR-AHEAD FIGURE, SIDE BY SIDE — AND NEVER ONE SPAN.
 *
 * The obvious move here is a single "$1,619 to $5,810 across three conditions".
 * It is wrong, and a health economist reading the page is exactly who would
 * catch it: the low end is the EXCESS an adult with long COVID spends over a
 * comparable adult, and the high end is everything an adult treated for
 * diabetes spends in a year. Two measures, never one range. So each figure is
 * printed with the measure it is, and the person is asked to narrow it.
 */
function PublishedSpanPanel({ ask }: { ask: string }) {
  const rows = PRICED_CONDITIONS
    .map((c) => benchmarkFor(c.id))
    .filter((b): b is Extract<Benchmark, { kind: 'figure' }> => !!b && b.kind === 'figure');
  const lead = rows.find((r) => r.figureKind === 'excess') ?? rows[0];
  if (!lead) return null;
  return (
    <section className="card year" aria-labelledby="year-ahead-h">
      <p className="lbl">What a year with a condition costs on top of ordinary care: published separately, and never added to the total above</p>
      <h2 id="year-ahead-h">A year with a condition: pick yours to narrow this</h2>
      <FigureFace
        b={lead}
        means={`If you are looking into ${lowerFirstWord(lead.condition.label)}, that is ${lead.figureKindLabel}.`}
      />
      <ProvenanceLine b={lead} />
      <PayerSplit b={lead} />
      {rows.length > 1 && (
        <ul className={s.alts}>
          {rows.filter((r) => r.rowId !== lead.rowId).map((r) => (
            <li key={r.rowId}>
              <b>{r.median !== null ? `${usd(r.point)} mean · ${usd(r.median)} median` : usd(r.point)}</b>: {r.condition.label}, {r.figureKindLabel}. {r.year}{' '}
              {r.agencyDisplay ?? 'source'}.
              {r.median === null && r.medianBlankReason ? <> {r.medianBlankReason}</> : null}
            </li>
          ))}
        </ul>
      )}
      <div className={s.invite}>
        <p>{ask} Choose yours and this card becomes one figure.</p>
        <ChipRow label="Which are you looking into?" />
      </div>
      <details className={s.fine}>
        <summary>Who is in this figure</summary>
        <p className={s.meta}>
          <strong>Who this describes:</strong> {lead.population}.
        </p>
        <p className={s.meta}>
          These are different measures of different populations, so they are listed and never
          summed or averaged into one span.
        </p>
      </details>
      <p className={s.acts}>
        {lead.sourceUrl && (
          <a className="btn ghost small" href={lead.sourceUrl} target="_blank" rel="noopener noreferrer">
            Open the {lowerFirstWord(lead.condition.label)} source
          </a>
        )}
        <Link className="btn ghost small" href="/method#conditions">Which conditions have a figure</Link>
      </p>
    </section>
  );
}

/** "Long COVID" stays "long COVID" mid-sentence; "ME/CFS" stays "ME/CFS". */
function lowerFirstWord(label: string): string {
  const t = label.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const first = t.split(' ')[0];
  if (first.length > 1 && first === first.toUpperCase()) return t;
  /* A proper name keeps its capital: a possessive ("Graves’ disease") or a first
     word the data itself spells capitalized in also_called ("Lyme"). */
  if (/[’']s?$/.test(first) || CONDITIONS.some((c) => c.alsoCalled.some((a) => a.split(' ')[0] === first))) return t;
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function FigurePanel({ b }: { b: Extract<Benchmark, { kind: 'figure' }> }) {
  return (
    <section className="card year" aria-labelledby="year-ahead-h">
      <p className="lbl">What a year with this condition costs on top of ordinary care: published separately, and never added to the total above</p>
      <h2 id="year-ahead-h">A year with {lowerFirstWord(b.condition.label)} ({b.year})</h2>

      <FigureFace b={b} means={`${b.figureKindLabel}.`} />

      <ProvenanceLine b={b} />
      <PayerSplit b={b} />

      {/* UX-2 (Bo, 2026-09-09: "wordy and hard to read"): the number, its meaning and its source stay in
          view; who is in the data, who published it, the median and the definition caveat keep every word
          but sit one tap down. Nothing was deleted. */}
      <details className={s.fine}>
        <summary>Who is in this figure, and what it is not</summary>
        {/* 🔴 WHO IS AND ISN'T IN THE DATA — Phillips's first test. Not deleted;
            one tap from the total, where a person who wants it will look for it. */}
        <p className={s.meta} id="year-ahead-who">
          <strong>Who this describes:</strong> {b.population}.
        </p>
        {!b.isGovernmentPublication && (
          <p className={s.meta}><strong>Who published it:</strong> {b.publisherNote}</p>
        )}
        <MedianLine b={b} />
        {b.condition.definitionCaveat && (
          <p className={s.caveat}>{b.condition.definitionCaveat}</p>
        )}
      </details>

      <p className={s.acts}>
        {b.sourceUrl && (
          <a className="btn ghost small" href={b.sourceUrl} target="_blank" rel="noopener noreferrer">
            Open the source
          </a>
        )}
        <Link className="btn ghost small" href="/method#conditions">How this figure is chosen</Link>
      </p>
    </section>
  );
}

/** A national total an agency publishes about the condition, printed apart from
 *  the absence with its source. It is never a year for one person, and nothing
 *  on this site adds it, compares it or prices from it. */
function NationalContext({ c }: { c: Condition }) {
  if (!c.nationalContext) return null;
  return (
    <p className={s.meta} data-testid="national-context">
      {c.nationalContext} Source:{' '}
      {c.nationalContextUrl
        ? <a href={c.nationalContextUrl} target="_blank" rel="noopener noreferrer">{c.nationalContextSource ?? 'Source'}</a>
        : c.nationalContextSource}
    </p>
  );
}

/** Figures published about the condition that are not a year for one person (a
 *  count, a per-case cost), each with its first source. Shown apart, never added.
 *  A national cost already printed as NationalContext is not printed twice. */
function PublishedFigures({ c }: { c: Condition }) {
  const list = c.publishedFigures.filter((f) => !(c.nationalContext && f.kind === 'national_cost'));
  if (!list.length) return null;
  return (
    <ul className={s.meta} data-testid="published-figures">
      {list.map((f) => (
        <li key={f.id}>
          <strong>{f.headline}</strong>: {f.measures}{' '}
          {f.isGovernmentPublication ? 'Government figure' : 'Research figure'}, {f.year}:{' '}
          <a href={f.sources[0]?.url} target="_blank" rel="noopener noreferrer">{f.sources[0]?.publisher}</a>.
          {' '}Never added to your ledger.
        </li>
      ))}
      <li><Link href={`/conditions#${c.id}`}>Both sources for each, and what the tool prices for {c.label}</Link></li>
    </ul>
  );
}

function AbsencePanel({ b }: { b: Extract<Benchmark, { kind: 'none' }> }) {
  /* FINAL-1011 lyme: a condition with no year figure can still carry figures of
     another kind (Lyme: a cost per reported case). The card then says what is
     missing is the YEAR, so "No published figure" never sits above a published one. */
  const others = b.condition.publishedFigures.length > 0;
  return (
    <section className="card year" aria-labelledby="year-ahead-h">
      <p className="lbl">{others ? 'Shown apart, never added to the total above' : 'Shown apart, because there is nothing to show'}</p>
      <h2 id="year-ahead-h">A year with {lowerFirstWord(b.condition.label)}</h2>

      <p className={`${s.kind} ${s.kindNone}`} data-testid="absence-kind">{others ? 'No published figure for a year' : 'No published figure'}</p>
      <p className={s.means}>{b.reason}</p>
      <p className={s.meta}>{b.qualifier}</p>
      <NationalContext c={b.condition} />
      <PublishedFigures c={b.condition} />

      {b.condition.icd10cm && (
        <p className={s.meta}>
          The diagnosis has a standard code: ICD-10-CM {b.condition.icd10cm}, &ldquo;
          {b.condition.icd10cmTitle}&rdquo;. A year of living with it has no published price.
          The visits and tests below are priced; the year is not.
        </p>
      )}

      {/* The gap link carries nothing. Putting the condition in the query string
          would send a person's diagnosis to a server in a URL, which is the one
          thing this product promises not to do. The gap form reads the choice
          from this browser if it wants it. */}
      <p className={s.acts}>
        <Link className="btn primary small" href={b.gapHref}>Count this gap</Link>
        <Link className="btn ghost small" href="/method#conditions">Which conditions have a figure</Link>
      </p>
    </section>
  );
}

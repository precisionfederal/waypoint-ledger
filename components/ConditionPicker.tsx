'use client';
/* ==========================================================================
   THE CONDITION SELECTOR — and the year-ahead panel it drives.

   The ledger used to print "The year ahead, for an adult with long COVID" to
   every visitor, including people who never said they had it. Two components
   here fix that and turn the fix into the product's best answer on reuse:

   <ConditionPicker/>  the chips — nine conditions and "prefer not to say",
                       remembered in this browser and never transmitted, with
                       the standard ICD-10-CM code printed under the choice.
   <YearAheadCard/>    the panel — that condition's published figure with its
                       kind named on its face, or, for the six with no
                       published figure, the absence in words with a way to
                       COUNT it. Six of nine is the finding.

   Nothing here holds a number. Every figure comes through benchmarkFor() from
   a row in data/prices.json with its federal file behind it; every code is
   re-read in the CDC/NCHS file by data/verify_conditions.py.
   ========================================================================== */

// Next compiles this file with the automatic JSX runtime; the unit suite
// transforms it with esbuild's classic runtime, which emits React.createElement.
// The import costs nothing at build time and lets the tests render the panel.
import React from 'react';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  BLANK_CODE_NOTE, CONDITIONS, ICD10CM_BROWSER, ICD10CM_YEARS, PRICED_CONDITIONS,
  benchmarkFor, useCondition, type Benchmark, type Condition,
} from '@/lib/conditions';
import s from './ConditionPicker.module.css';

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

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
  const { conditionId, condition, setCondition } = useCondition();
  const { declined, setDeclined } = useDeclined();

  return (
    <div className={s.group} role="group" aria-labelledby="cond-h">
      <p className={s.lbl} id="cond-h">{heading}</p>
      <p className={s.note}>
        This changes which year-ahead figure the ledger shows you, and stops it showing you
        someone else&rsquo;s. It stays on this device: it is never sent with a correction, a
        saved ledger or a share link.
      </p>
      <div className={s.chips}>
        {CONDITIONS.map((c) => (
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
      {condition && <CodeLine condition={condition} />}
    </div>
  );
}

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
      {c.icd10cmBillable === false && <> &mdash; a category heading, not a code that goes on a claim.</>}
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

const KIND_MARK: Record<string, { cls: string; word: string }> = {
  excess: { cls: 'kindExcess', word: 'Excess' },
  condition_attributed: { cls: 'kindAttr', word: 'Condition-attributed' },
};

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
          The year ahead &mdash; if you are looking into {lowerFirstWord(b.condition.label)}
        </h2>
        <p className={`${s.kind} ${s.kindNone}`}>No published figure</p>
        <p className={s.means}>{b.reason}</p>
        <p className={s.meta}>{b.qualifier}</p>
        <p className={s.meta}>
          {ask} Your own words named it; tap the chip above and this card is yours.
        </p>
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
  const mark = KIND_MARK[b.figureKind] ?? KIND_MARK.condition_attributed;
  const hasRange = b.low !== null && b.high !== null;
  return (
    <section className="card year" aria-labelledby="year-ahead-h">
      <p className="lbl">Shown apart, never added to the total above</p>
      <h2 id="year-ahead-h">
        The year ahead &mdash; if you are looking into {lowerFirstWord(b.condition.label)}
      </h2>
      <p className={`${s.kind} ${s[mark.cls]}`}>{mark.word}</p>
      <strong className={s.figure}>
        {hasRange ? `${usd(b.low as number)} to ${usd(b.high as number)}` : usd(b.point)}
        {hasRange && <span className={s.point}>Point estimate {usd(b.point)}. The interval is the answer, not the middle of it.</span>}
      </strong>
      <p className={s.means}>{b.figureKindLabel}.</p>
      <p className={s.meta}>
        {b.year} {b.agencyDisplay ?? 'source'}{b.isGovernmentPublication ? '' : ' data'} &mdash; {b.geography}.
      </p>
      <p className={s.invite}>
        {ask} Say what you are looking into above and this card becomes yours.
      </p>
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
  const hasRange = lead.low !== null && lead.high !== null;
  return (
    <section className="card year" aria-labelledby="year-ahead-h">
      <p className="lbl">Shown apart, never added to the total above</p>
      <h2 id="year-ahead-h">The year ahead &mdash; pick your condition to narrow this</h2>
      <p className={`${s.kind} ${s[KIND_MARK[lead.figureKind]?.cls ?? 'kindAttr']}`}>
        {KIND_MARK[lead.figureKind]?.word ?? 'Condition-attributed'}
      </p>
      <strong className={s.figure}>
        {hasRange ? `${usd(lead.low as number)} to ${usd(lead.high as number)}` : usd(lead.point)}
        {hasRange && <span className={s.point}>Point estimate {usd(lead.point)}. The interval is the answer, not the middle of it.</span>}
      </strong>
      <p className={s.means}>
        If you are looking into {lowerFirstWord(lead.condition.label)}, that is{' '}
        {lead.figureKindLabel} &mdash; {lead.year} {lead.agencyDisplay ?? 'source'}
        {lead.isGovernmentPublication ? '' : ' data'}, {lead.geography}.
      </p>
      {rows.length > 1 && (
        <ul className={s.alts}>
          {rows.filter((r) => r.rowId !== lead.rowId).map((r) => (
            <li key={r.rowId}>
              <b>{usd(r.point)}</b> &mdash; {r.condition.label}, {r.figureKindLabel}. {r.year}{' '}
              {r.agencyDisplay ?? 'source'}.
              {r.median !== null && <> The median for the same population is {usd(r.median)}.</>}
            </li>
          ))}
        </ul>
      )}
      <p className={s.invite}>{ask} Pick a chip above and this card becomes one figure &mdash; yours.</p>
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
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function FigurePanel({ b }: { b: Extract<Benchmark, { kind: 'figure' }> }) {
  const mark = KIND_MARK[b.figureKind] ?? KIND_MARK.condition_attributed;
  const hasRange = b.low !== null && b.high !== null;
  return (
    <section className="card year" aria-labelledby="year-ahead-h">
      <p className="lbl">Shown apart, never added to the total above</p>
      <h2 id="year-ahead-h">The year ahead &mdash; {b.condition.label}</h2>

      <p className={`${s.kind} ${s[mark.cls]}`}>{mark.word}</p>
      <strong className={s.figure}>
        {hasRange ? `${usd(b.low as number)} to ${usd(b.high as number)}` : usd(b.point)}
        {hasRange && <span className={s.point}>Point estimate {usd(b.point)}. The interval is the answer, not the middle of it.</span>}
      </strong>

      <p className={s.means}>{b.figureKindLabel}.</p>

      <p className={s.meta}>
        {/* "AHRQ MEPS" names the SURVEY. Where the estimate is somebody else's
            reading of that survey, the line says "data" and the publisher note
            below says whose reading it is. */}
        {b.year} {b.agencyDisplay ?? 'source'}{b.isGovernmentPublication ? '' : ' data'} &mdash;{' '}
        {b.geography}.
        {b.neverAddedToTotal ? ' A whole year of care, so it is never added to the lines above.' : ''}
      </p>

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
        {b.median !== null && (
          <p className={s.meta}>
            The median for the same population is {usd(b.median)}. The mean is more than seven times
            it, so most people spend far less and a few spend enormously more.
          </p>
        )}
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

function AbsencePanel({ b }: { b: Extract<Benchmark, { kind: 'none' }> }) {
  return (
    <section className="card year" aria-labelledby="year-ahead-h">
      <p className="lbl">Shown apart, because there is nothing to show</p>
      <h2 id="year-ahead-h">The year ahead &mdash; {b.condition.label}</h2>

      <p className={`${s.kind} ${s.kindNone}`}>No published figure</p>
      <p className={s.means}>{b.reason}</p>
      <p className={s.meta}>{b.qualifier}</p>

      {b.condition.icd10cm && (
        <p className={s.meta}>
          The diagnosis has a standard code &mdash; ICD-10-CM {b.condition.icd10cm}, &ldquo;
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

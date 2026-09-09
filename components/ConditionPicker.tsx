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

/* --------------------------------------------------------------- the chips */

export default function ConditionPicker({ heading = 'What you are looking into' }:
  { heading?: string }) {
  const { conditionId, condition, setCondition } = useCondition();

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
            onClick={() => setCondition(conditionId === c.id ? null : c.id)}
          >
            {c.label}
          </button>
        ))}
        <button
          type="button"
          className={`${s.chip} ${s.quiet} ${conditionId === null ? s.on : ''}`}
          aria-pressed={conditionId === null}
          onClick={() => setCondition(null)}
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
}

export function YearAheadCard({ conditionId }: YearAheadCardProps) {
  const chosen = useCondition();
  const benchmark = conditionId === undefined ? chosen.benchmark : benchmarkFor(conditionId);
  if (!benchmark) return null;
  return benchmark.kind === 'figure'
    ? <FigurePanel b={benchmark} />
    : <AbsencePanel b={benchmark} />;
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
        {b.neverAddedToTotal
          ? ' It already contains every visit, test and scan a year holds, which is why it is shown here and never summed with the lines above.'
          : ''}
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

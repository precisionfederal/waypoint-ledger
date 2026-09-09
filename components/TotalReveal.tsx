'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usd } from '@/lib/pricing';

/**
 * THE REVEAL.
 *
 * A person who spent four years getting a diagnosis meets their total once. It
 * used to appear flat and instant under the label "ITEMIZED TOTAL, ALL PAYERS
 * COMBINED" — an accounting header for the most personal number in the product.
 *
 * This component does two things and nothing else:
 *   1. counts the number up over ~900 ms, unless the person asked for reduced
 *      motion, in which case it is simply there;
 *   2. labels it in a human sentence — what the published prices add up to.
 *
 * The one true comparison — the published year-ahead figure with its interval —
 * still renders inside the card when `yearAhead` is passed, and the ledger
 * instead composes it as <TotalComparison/>, a full-width band under the
 * summary grid. Nested in the dark card it made the first column four times the
 * height of its neighbours and set a 60-word sentence in grey on a gradient;
 * the band gives the same words, the same figures, a line long enough to read.
 *
 * It invents nothing. Every figure it prints arrives as a prop from a row of
 * the price table.
 */

export interface YearAhead {
  /** Point estimate, e.g. 4098 */
  point: number;
  /** Confidence interval from the published row, e.g. [1619, 6578] */
  low: number;
  high: number;
  /** Survey year of the published figure, e.g. 2022 */
  year: number;
  /** Who the published figure describes. */
  population?: string;
  /** Name of the file it comes from. */
  source?: string;
}

export interface TotalRevealProps {
  totalUsd: number;
  pricedCount: number;
  tableVersion: string;
  /** Overridable so a chosen locality or an uninsured view can say what it is. */
  label?: string;
  /** Optional second line under the number (e.g. "Medicare allowed amounts, Iowa"). */
  sublabel?: string | null;
  /** Omit or pass null to render the total with no comparison. */
  yearAhead?: YearAhead | null;
}

const EASE = (t: number) => 1 - Math.pow(1 - t, 3);
const DURATION_MS = 900;

export default function TotalReveal({
  totalUsd, pricedCount, tableVersion,
  label = 'What the published prices add up to',
  sublabel = null,
  yearAhead = null,
}: TotalRevealProps) {
  const [shown, setShown] = useState(totalUsd);
  const from = useRef(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !Number.isFinite(totalUsd)) { setShown(totalUsd); from.current = totalUsd; return; }
    const start = performance.now();
    const a = from.current;
    const b = totalUsd;
    if (a === b) { setShown(b); return; }
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      setShown(a + (b - a) * EASE(t));
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else { from.current = b; setShown(b); }
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); from.current = totalUsd; };
  }, [totalUsd]);

  return (
    <div className="sum-card main reveal">
      <p className="lbl">{label}</p>
      <p className="big-num" aria-hidden="true">{usd(Math.round(shown))}</p>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {label}: {usd(totalUsd)} across {pricedCount} priced {pricedCount === 1 ? 'line' : 'lines'}.
      </p>
      {sublabel && <p className="reveal-sub">{sublabel}</p>}
      <p className="micro">
        {pricedCount} priced {pricedCount === 1 ? 'line' : 'lines'} ·{' '}
        <Link href="/method" className="ver-link" title={`price table ${tableVersion}`}>how this is versioned</Link>
        <span className="sr-only"> — price table {tableVersion}</span>
      </p>
      {yearAhead && <Comparison total={totalUsd} y={yearAhead} />}
    </div>
  );
}

/**
 * THE COMPARISON, on its own line under the grid.
 *
 * Two published figures, set beside each other, never summed. The mark on the
 * left is the rule itself: shown apart.
 */
export function TotalComparison({ totalUsd, yearAhead, basisNote = null }: {
  /** null when there is no itemized total on the SAME basis to compare against */
  totalUsd: number | null;
  yearAhead: YearAhead | null;
  /** the one sentence that names the basis, when the two would otherwise be mixed */
  basisNote?: string | null;
}) {
  if (!yearAhead) return null;
  return (
    <div className="reveal-band">
      <span className="rb-mark">Shown apart</span>
      {totalUsd === null
        ? <NoComparison y={yearAhead} note={basisNote} />
        : <Comparison total={totalUsd} y={yearAhead} note={basisNote} />}
    </div>
  );
}

/**
 * 🔴 TWO BASES ARE NEVER COMPARED IN ONE SENTENCE.
 *
 * The published year-ahead figure is measured in expenditures. When the total
 * on the page is a stack of billed charges (the uninsured view) or has been
 * suppressed because nothing published describes this person (the Medicaid
 * view), there is no total on the same basis to set it beside — so the figure
 * is printed alone, with the reason. Saying less is the only honest move here,
 * and a health economist reading the page is exactly who would catch the
 * alternative.
 */
function NoComparison({ y, note }: { y: YearAhead; note: string | null }) {
  const { who, deferred } = subjectOf(y);
  const src = y.source ?? `${y.year} Medical Expenditure Panel Survey`;
  return (
    <p className="reveal-compare">
      For {who}, the published excess for the single year ahead is{' '}
      <b>{usd(y.low)} to {usd(y.high)}</b>.{' '}
      <span className="rc-note">
        {note ? `${note} ` : ''}Point estimate {usd(y.point)}, {src}, 95% interval. It already
        contains the visits and tests above, so it is shown apart and never added to them.
        <WhoLink show={deferred} />
      </span>
    </p>
  );
}

/* 🔴 THE MONEY SCREEN IS NOT WHERE A SURVEY'S METHODS SECTION GOES.
   `population` on the long COVID row is ninety words — coverage, respondent
   counts, the comparison group and the journal citation. Printed inline it was
   the second thing under the total, and people bounced off it. Nothing is
   deleted: over this many characters the band names the subject in a phrase and
   links to the year-ahead card, which now prints the population in full under
   "Who this describes". Phillips asked for one tap, not for a wall. */
const SUBJECT_MAX = 90;
const STANDING_SUBJECT = 'an adult reporting long COVID';

function subjectOf(y: YearAhead): { who: string; deferred: boolean } {
  const p = y.population;
  if (p && p.length <= SUBJECT_MAX) return { who: p, deferred: false };
  return { who: STANDING_SUBJECT, deferred: true };
}

/** The tap that carries the coverage statement, when it is too long to inline. */
function WhoLink({ show }: { show: boolean }) {
  if (!show) return null;
  return <> <a className="rc-who" href="#year-ahead-who">Who this describes &rarr;</a></>;
}

/**
 * Which way the two published figures actually sit, for this person's total.
 * Never asserts "larger" when the itemized total is bigger.
 */
export function relationTo(total: number, low: number, high: number): 'larger than' | 'smaller than' | 'overlaps' {
  if (low > total) return 'larger than';
  if (high < total) return 'smaller than';
  return 'overlaps';
}

/** One sentence. Two published figures, compared, never summed. */
function Comparison({ total, y, note = null }: { total: number; y: YearAhead; note?: string | null }) {
  const relation = relationTo(total, y.low, y.high);
  const { who, deferred } = subjectOf(y);
  const src = y.source ?? `${y.year} Medical Expenditure Panel Survey`;
  return (
    <p className="reveal-compare">
      For {who}, the published excess for the single year ahead is{' '}
      <b>{usd(y.low)} to {usd(y.high)}</b> — {relation === 'overlaps' ? 'which overlaps' : `${relation}`}{' '}
      {relation === 'overlaps' ? '' : 'the '}{usd(total)} itemized here.{' '}
      <span className="rc-note">
        {note ? `${note} ` : ''}Point estimate {usd(y.point)}, {src}, 95% interval. It already
        contains the visits and tests above, so it is shown apart and never added to them.
        <WhoLink show={deferred} />
      </span>
    </p>
  );
}

/* ==========================================================================
   FIGURES, SEEN (VISUAL data, 2026-09-30 night). Shared by /conditions and
   /policy. No hooks and no client state, so both pages stay static HTML.

   - KindBadge: whether a figure is a government publication or a research
     figure, as a badge with its own mark, in the words the pages already use.
   - RangeMarks: one figure drawn on a line from $0, with its median and its
     95% interval where the source publishes them. It is drawn beside the
     printed figure and repeats nothing the text does not say; screen readers
     read the text, so the drawing is hidden from them. Its words ("median",
     "mean", "$0") are drawn by the stylesheet from data-lab, never put in the
     page's text, so a copy, a reader view or a crawler gets the sentence beside
     it and not "$1,333 median mean $0" (FINAL-1011 lyme). Figures are never put
     on a shared scale with another condition's figure.
   ========================================================================== */
import type { ReactNode } from 'react';
import s from './FigureVisual.module.css';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function KindBadge({ gov, children, className = '' }: { gov: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={`${s.badge} ${gov ? s.gov : s.res} ${className}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {gov
          ? <><path d="M3 9.5 12 4l9 5.5" {...P} /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3.5 20.5h17" {...P} /></>
          : <><path d="M9 3h6M10 3v6.2L4.8 18.3A1.8 1.8 0 0 0 6.4 21h11.2a1.8 1.8 0 0 0 1.6-2.7L14 9.2V3" {...P} /><path d="M7.5 15h9" {...P} /></>}
      </svg>
      {children}
    </span>
  );
}

/** Display-time punctuation for strings that live in data files: the published
 *  string stays byte-identical in the data; the page prints no em-dash. */
export const plainDash = (t: string, sep = ', ') => t.replace(/ \u2014 /g, sep);
export const plainSentenceDash = (t: string) => t.replace(/ \u2014 (\w)/g, (_m, c: string) => `. ${c.toUpperCase()}`);

const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (100 * v) / max))}%`;

export function RangeMarks({ point, median = null, low = null, high = null, zero = true, words = true }: {
  point: number; median?: number | null; low?: number | null; high?: number | null;
  /** the "$0" at the start of the line; off where a bare "$0" beside a cost would mislead */
  zero?: boolean;
  /** the marks' own words; off where the sentence beside the drawing names each mark once, with its key */
  words?: boolean;
}) {
  if (!(point > 0)) return null;
  const hasRange = low !== null && high !== null && high > low;
  const max = Math.max(point, hasRange ? high! : 0, median ?? 0) * 1.08;
  return (
    <span className={`${s.rm}${hasRange ? ` ${s.hasBand}` : ''}`} aria-hidden="true">
      <span className={s.track} />
      {hasRange && <span className={s.band} style={{ left: pct(low!, max), width: `calc(${pct(high!, max)} - ${pct(low!, max)})` }} />}
      {median !== null && median > 0 && (
        <span className={`${s.mark} ${s.med}`} style={{ left: pct(median, max) }}>{words && <span className={s.lab} data-lab="median" />}</span>
      )}
      <span className={`${s.mark} ${s.pt}`} style={{ left: pct(point, max) }}>
        {words && <span className={s.lab} data-lab={median !== null ? 'mean' : hasRange ? 'estimate' : ''} />}
      </span>
      {hasRange && <span className={s.bandLab} style={{ left: pct(low!, max), width: `calc(${pct(high!, max)} - ${pct(low!, max)})` }} data-lab="95% interval" />}
      {zero && <span className={s.zero} data-lab="$0" />}
    </span>
  );
}

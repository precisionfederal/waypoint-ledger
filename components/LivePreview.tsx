'use client';
/* The live preview the home page and /journey share: the sentence read as it is
   typed, the chips, and the Add button's words. It lives apart from
   JourneyBuilder (PERF, 2026-10-01) so the home page loads this and not the whole
   builder (the condition picker, the context bar, the share card, the start-over
   controls); JourneyBuilder imports it back and re-exports it, unchanged. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ITEMS } from '@/lib/store';
import { parseJourney, parseJourneyWithModel, readOnPurpose, unpricedByName, type ParsedSegment } from '@/lib/mapper';
import { usd } from '@/lib/pricing';
import { monthsPhrase } from '@/lib/sheet';
import { saidQuote } from '@/lib/said-quote';

const COACH_EXAMPLES = ['an MRI of my brain', 'the ER once', 'blood work twice'];

/* ==========================================================================
   LIVE PARSE — the sentence becomes an itemized, cited ledger while they type.

   Nothing here prices anything: parseJourney maps words to units of care and
   the published table supplies the figure, exactly as it does after the button
   is pressed. The preview is the same computation, shown 250 ms earlier.
   ========================================================================== */

export interface LivePreview {
  segments: ParsedSegment[];
  matched: number;
  previewTotal: number;
  /** True while the debounce is still waiting on the current keystroke. */
  pending: boolean;
  /** The AI reader did not answer (busy, capped, offline): the lines shown are the rules' alone. */
  readerDown: boolean;
  /** access-9: the AI reader is still reading a phrase the rules left blank. */
  reading: boolean;
}

/** patient-13 / access-13: one wording for the Add button on home and on /journey,
 *  singular when it is one line. */
export function addLabel(n: number, matched?: number, reading?: boolean): string {
  /* access2-13: when the sentence has phrases but none of them carries a
     published figure (and the reader is not still on one), the button says what
     pressing it does: the lines go in unpriced. */
  if (n > 0 && matched === 0 && !reading) return n === 1 ? 'Add it unpriced' : `Add these ${n} unpriced`;
  return n === 1 ? 'Add this line' : n > 1 ? `Add these ${n}` : 'Add to my ledger';
}

/** A phrase the AI reader will be asked about: blank, and not read on purpose. */
function waitsForReader(s: ParsedSegment): boolean {
  const r = s.result;
  return !r.item && !r.gapCategory && r.months == null && !unpricedByName(r.reason) && !readOnPurpose(r.reason);
}

const DEBOUNCE_MS = 250;

/* flow3-1: one AI read per exact sentence, shared. The preview no longer aborts
   the request when the page moves on, so a read that lands after Add can still
   fill the lines it priced (store.applyRead). A stale answer is still ignored by
   the preview; only the newest few sentences are kept. */
type ModelReadResult = Awaited<ReturnType<typeof parseJourneyWithModel>>;
const READS = new Map<string, Promise<ModelReadResult>>();
export function sharedRead(story: string): Promise<ModelReadResult> {
  let p = READS.get(story);
  if (!p) {
    p = parseJourneyWithModel(story, ITEMS, fetch).then((r) => { if (!r.model) READS.delete(story); return r; });
    READS.set(story, p);
    while (READS.size > 4) READS.delete(READS.keys().next().value as string);
  }
  return p;
}

export function useLivePreview(story: string): LivePreview {
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(story), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [story]);

  /* The rules answer instantly. The AI reader answers a moment later, for the
     phrases the rules left blank, and only if the story has not changed since. */
  const [modelRead, setModelRead] = useState<{ story: string; segments: ParsedSegment[]; model: string | null } | null>(null);
  const [readerDown, setReaderDown] = useState(false);
  const [inFlight, setInFlight] = useState('');
  useEffect(() => {
    if (!debounced.trim()) { setReaderDown(false); setInFlight(''); return; }
    const ctl = new AbortController();
    setInFlight(debounced);
    sharedRead(debounced).then((r) => {
      if (ctl.signal.aborted) return;
      setInFlight('');
      if (r.model) { setModelRead({ story: debounced, ...r }); setReaderDown(false); }
      else setReaderDown(true);
    }).catch(() => { if (!ctl.signal.aborted) { setInFlight(''); setReaderDown(true); } });
    return () => ctl.abort();
  }, [debounced]);

  return useMemo(() => {
    const rules = debounced.trim() ? parseJourney(debounced, ITEMS) : [];
    const read = modelRead && modelRead.story === debounced ? modelRead.segments : rules;
    const segments = read.filter((s) => !s.absorbed);
    const reading = inFlight === debounced && !!debounced.trim() && modelRead?.story !== debounced && segments.some(waitsForReader);
    return { segments, ...previewTotals(segments), pending: debounced !== story, readerDown: readerDown && modelRead?.story !== debounced, reading };
  }, [debounced, story, modelRead, readerDown, inFlight]);
}

/** The preview's arithmetic: one published figure times the count in the phrase. */
export function previewTotals(segments: ParsedSegment[]): { matched: number; previewTotal: number } {
  let matched = 0;
  let previewTotal = 0;
  for (const s of segments) {
    if (!s.result.item) continue;
    matched++;
    previewTotal += (s.result.item.valueUsd ?? 0) * s.times;
  }
  return { matched, previewTotal };
}

/** A segment the matcher refused may carry its own reason; show that, never a guess. */
function blankReason(seg: ParsedSegment): string {
  const r = (seg.result as { reason?: unknown }).reason;
  return typeof r === 'string' && r.trim() ? r : 'no federal figure, kept blank';
}

/** The counter a refused phrase belongs in, read defensively. Null on a priced
 *  or ordinary unmatched line, so only real gaps take the gap style. */
function gapCategoryOf(seg: ParsedSegment): string | null {
  const g = (seg.result as { gapCategory?: unknown }).gapCategory;
  return typeof g === 'string' && g.trim() ? g : null;
}

/** FLOW4 flow4-7: the length of the search a blank line carries, as the chip
 *  says it ("2 years searching: counted, never priced"). Null when it carries
 *  none, or less than a month. */
export function spanChipText(seg: ParsedSegment): string | null {
  if (gapCategoryOf(seg) !== 'time-searching') return null;
  const m = (seg.result as { months?: unknown }).months;
  return typeof m === 'number' && m >= 1 ? `${monthsPhrase(m)} searching: counted, never priced` : null;
}

/** The matcher's own confidence, read defensively so a mapper change never breaks the chip. */
function confidenceOf(seg: ParsedSegment): string | null {
  const c = (seg.result as { confidence?: unknown }).confidence;
  return typeof c === 'string' ? c : null;
}

/** True while the list is taller than the box that holds it. A region that
 *  scrolls has to be reachable by keyboard (axe scrollable-region-focusable,
 *  R1 F03); one that does not scroll is not a tab stop of its own. */
function useScrolls(ref: React.RefObject<HTMLElement | null>, dep: unknown): boolean {
  const [scrolls, setScrolls] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setScrolls(el.scrollHeight > el.clientHeight + 1);
    check();
    // A new chip slides in 3 px from below, which counts as overflow until the
    // animation ends; check again then, and whenever the box changes size.
    el.addEventListener('animationend', check);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
    ro?.observe(el);
    return () => { el.removeEventListener('animationend', check); ro?.disconnect(); };
  }, [ref, dep]);
  return scrolls;
}

export function LivePreviewChips({ preview, onExample }: { preview: LivePreview; onExample?: (text: string) => void }) {
  const { segments, matched, previewTotal } = preview;
  const listRef = useRef<HTMLUListElement>(null);
  const scrolls = useScrolls(listRef, segments);
  if (!segments.length) return null;
  return (
    <div className="lp">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {matched === 0
          ? 'Nothing in that sentence matches a published figure yet. Name a visit, a scan or a test.'
          : <>{segments.length} {segments.length === 1 ? 'phrase' : 'phrases'} read, {matched} carrying a published figure{segments.length > matched ? ' and the rest shown blank and named' : ''},
            {' '}{usd(previewTotal)} from published figures so far.</>}
      </p>
      <ul className="lp-chips" ref={listRef} tabIndex={scrolls ? 0 : undefined} aria-label="What this sentence maps to so far" aria-busy={preview.reading || undefined}>
        {segments.map((s, i) => {
          const it = s.result.item;
          const low = confidenceOf(s) === 'low';
          return it ? (
            <li key={`${i}-${it.id}`} className={`lp-chip${low ? ' is-low' : ''}`}>
              <b>{it.label}</b>
              {s.source === 'model' && <span className="lp-ai" title={s.modelWhy ? `AI read this as ${it.label}: ${s.modelWhy}` : `AI read this as ${it.label}`}>AI read</span>}
              <span className="lp-x">×{s.times}</span>
              {s.countNote && <span className="lp-note">{s.countNote}</span>}
              {low && <span className="lp-low" title="A one-word match. Open the line and change it if this is not what you had.">worth a check</span>}
              {/* 🔴 TO THE CENT (R3 fedexpert FX-05): whole-dollar chips added up to
                  $1,305 beside a "So far" of $1,304, because each was rounded on its
                  own. The chip shows the cents; the total rounds once, from the cents. */}
              <span className="lp-amt">{usd((it.valueUsd ?? 0) * s.times, true)}</span>
            </li>
          ) : (() => {
            /* FLOW4 flow4-7: a line that carries the length of the search is
               the one number the chip holds, so it says it, in the neutral
               style; the red gap style is for care that did not happen. */
            const span = spanChipText(s);
            return (
              /* FLOW5 flow5-4: a span of unknown length ("it took months") is still time spent searching, never the red style. */
              <li key={`${i}-blank`} className={`lp-chip is-blank${span || gapCategoryOf(s) === 'time-searching' ? ' is-span' : gapCategoryOf(s) ? ' is-gap' : ''}`}>
                {/* JUDGE-6 #10 on the chips: the words are quoted as the ledger quotes them (lib/said-quote.ts). */}
                <b>{saidQuote(s.raw)}</b>
                <span className="lp-amt">{span ?? blankReason(s)}</span>
              </li>
            );
          })();
        })}
      </ul>
      {/* access-9: the rules' chips are up; the reader is still on a blank one.
          Add stays live (it takes what is on screen). */}
      {/* access2-12: the live region is always mounted and empty, and only its
          text changes, so a screen reader announces it the moment reading starts. */}
      <p className="micro lp-reading" aria-live="polite">{preview.reading ? 'Reading the rest of your sentence…' : ''}</p>
      {matched === 0 && (
        <p className="lp-coach">
          Nothing recognised yet. Name a visit, a scan or a test:{' '}
          {COACH_EXAMPLES.map((e, i) => (
            <span key={e}>
              {i > 0 && ' · '}
              <button type="button" className="link-btn" onClick={() => onExample?.(e)}>{e}</button>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

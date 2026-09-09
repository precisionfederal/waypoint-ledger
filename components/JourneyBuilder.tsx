'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ITEMS, UNPRICEABLE, useStore } from '@/lib/store';
import { search } from '@/lib/search';
import { parseJourney, parseJourneyWithModel, type ParsedSegment } from '@/lib/mapper';
import { CATEGORIES, categoryKey } from '@/lib/categories';
import { priceJourney, totals, usd } from '@/lib/pricing';
import { TABLE_VERSION } from '@/lib/table';
import type { PriceItem, PricedLine } from '@/lib/types';
import ShareCard, { type ShareCardData } from './ShareCard';
import ContextBar from './ContextBar';
import cs from './ContextBar.module.css';
import { gapSummary, odysseyClauses } from '@/lib/sheet';
import { siteOfServiceFinding } from '@/lib/site-of-service';
import { Icon } from './Icons';

const EXAMPLE = 'saw my regular doctor three times, then a cardiologist, an echo and a Holter, then the ER once when my heart was racing';
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
}

const DEBOUNCE_MS = 250;

export function useLivePreview(story: string): LivePreview {
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(story), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [story]);

  /* The rules answer instantly. The AI reader answers a moment later, for the
     phrases the rules left blank, and only if the story has not changed since. */
  const [modelRead, setModelRead] = useState<{ story: string; segments: ParsedSegment[]; model: string | null } | null>(null);
  useEffect(() => {
    if (!debounced.trim()) return;
    const ctl = new AbortController();
    parseJourneyWithModel(debounced, ITEMS, fetch, ctl.signal).then((r) => {
      if (!ctl.signal.aborted && r.model) setModelRead({ story: debounced, ...r });
    });
    return () => ctl.abort();
  }, [debounced]);

  return useMemo(() => {
    const rules = debounced.trim() ? parseJourney(debounced, ITEMS) : [];
    const read = modelRead && modelRead.story === debounced ? modelRead.segments : rules;
    const segments = read.filter((s) => !s.absorbed);
    return { segments, ...previewTotals(segments), pending: debounced !== story };
  }, [debounced, story, modelRead]);
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
  return typeof r === 'string' && r.trim() ? r : 'no federal figure — kept blank';
}

/** The counter a refused phrase belongs in, read defensively. Null on a priced
 *  or ordinary unmatched line, so only real gaps take the gap style. */
function gapCategoryOf(seg: ParsedSegment): string | null {
  const g = (seg.result as { gapCategory?: unknown }).gapCategory;
  return typeof g === 'string' && g.trim() ? g : null;
}

/** The matcher's own confidence, read defensively so a mapper change never breaks the chip. */
function confidenceOf(seg: ParsedSegment): string | null {
  const c = (seg.result as { confidence?: unknown }).confidence;
  return typeof c === 'string' ? c : null;
}

export function LivePreviewChips({ preview, onExample }: { preview: LivePreview; onExample?: (text: string) => void }) {
  const { segments, matched, previewTotal } = preview;
  if (!segments.length) return null;
  return (
    <div className="lp">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {segments.length} {segments.length === 1 ? 'phrase' : 'phrases'} read, {matched} carrying a published figure and the rest shown blank and named,
        {' '}{usd(previewTotal)} from published figures so far.
      </p>
      <ul className="lp-chips" aria-label="What this sentence maps to so far">
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
              <span className="lp-amt">{usd((it.valueUsd ?? 0) * s.times)}</span>
            </li>
          ) : (
            <li key={`${i}-blank`} className={`lp-chip is-blank${gapCategoryOf(s) ? ' is-gap' : ''}`}>
              <b>{s.raw}</b>
              <span className="lp-amt">{blankReason(s)}</span>
            </li>
          );
        })}
      </ul>
      {matched === 0 && (
        <p className="lp-coach">
          Nothing recognised yet — name a visit, a scan or a test.{' '}
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

export default function JourneyBuilder() {
  const st = useStore();
  const [story, setStory] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(CATEGORIES[0].key);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  /* One tab stop for the whole catalogue: Arrow keys move inside it, Tab leaves
     it. Before this, 40+ chips were 40+ stops between the sentence and the total. */
  const [chipAt, setChipAt] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLTextAreaElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const hits = useMemo(() => search(q, ITEMS, 8), [q]);
  const lines = useMemo(() => priceJourney(st.entries), [st.entries]);
  const sum = useMemo(() => totals(lines), [lines]);
  const preview = useLivePreview(story);
  const byCat = useMemo(() => {
    const m: Record<string, PriceItem[]> = {};
    for (const it of ITEMS) (m[categoryKey(it)] ||= []).push(it);
    return m;
  }, []);
  const cats = CATEGORIES.filter((c) => byCat[c.key]?.length);
  const appointments = st.entries.reduce((a, e) => a + e.times, 0);
  const card = useMemo(() => shareCardData(lines, st.entries.length, st.unpricedHits.length), [lines, st.entries.length, st.unpricedHits.length]);
  /* 🔴 A ZERO IS A CLAIM THAT THE CARE WAS FREE.
     The panel and the phone bar opened on "$0 · 0 appointments · 0 distinct
     lines" — three zeros where the product's promise belongs, and the same
     mistake the ledger refuses to make for a Medicaid visitor. Nothing has been
     counted yet, so the honest mark is a dash and the invitation to type. */
  const nothingYet = st.entries.length === 0 && preview.previewTotal === 0;

  /* 🔴 focus({ preventScroll: true }).
     Focusing the textarea used to scroll the browser 723 px down the page, which
     put the three questions this product exists to ask — coverage, state,
     condition — ABOVE where the person lands. Measured on the live site: the ask
     sat at y = -295. Nobody scrolls up on a page they just opened, so every
     first-time visitor answered nothing and met a Medicare-labelled total. The
     caret still lands in the box; the page stays where it opened. */
  useEffect(() => { if (!st.entries.length) storyRef.current?.focus({ preventScroll: true }); }, [st.entries.length]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function submitStory(e: React.FormEvent) {
    e.preventDefault();
    if (!story.trim()) return;
    // The chips she saw are the lines she gets: the preview's read (AI fills included) when it is
    // for this exact sentence, else the rules alone.
    const r = !preview.pending && preview.segments.length ? st.addSegments(preview.segments) : st.addStory(story);
    // "step" is the ledger's word for the SUM OF TIMES (11 steps, 6 distinct). What was
    // added here is lines, so the toast, the bar and the ledger card all count the same.
    st.toast(`${r.added} ${r.added === 1 ? 'line' : 'lines'} added · ${r.matched} priced from a published figure${r.added - r.matched ? ` · ${r.added - r.matched} kept unpriced` : ''}${r.unpriced ? ` · ${r.unpriced} named as a cost we will not price` : ''}`, r.matched === r.added && !r.unpriced ? 'ok' : 'info');
    setStory('');
    /* 🔴 THE FLOW ADVANCES ON ITS OWN.
       Pressing Add used to leave you on step 1 facing five controls with three
       different names — "Open my ledger", "See what it cost" twice, "My ledger
       5", "2 Your ledger" — all going to the same page. A sentence becoming a
       priced ledger is one gesture, so the add IS the navigation. Adding a
       single unit from the catalogue below does not navigate: that is
       refinement, not a step of the flow. */
    if (r.added > 0) router.push('/ledger');
  }
  function pick(it: PriceItem) { st.addItem(it, q.trim() && !/^\d/.test(q) ? q.trim() : undefined); setQ(''); setOpen(false); }
  function onKey(e: React.KeyboardEvent) {
    if (!open || !hits.length) { if (e.key === 'Enter') { e.preventDefault(); if (q.trim()) { st.addOne(q); setQ(''); } } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % hits.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + hits.length) % hits.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(hits[hi].item); }
    else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="builder">
      <div className="builder-main">
        <section className="card">
          <form onSubmit={submitStory} className="story-form">
            <label htmlFor="story" className="lbl">Tell it the way you remember it</label>
            <textarea id="story" ref={storyRef} rows={3} value={story} onChange={(e) => setStory(e.target.value)}
              placeholder={`e.g. ${EXAMPLE}`} />
            {/* Visible only to a keyboard, and only when it has focus. It jumps the
                catalogue and the per-line steppers and lands on the primary action. */}
            <a
              href="#see-what-it-cost"
              className="skip-inline"
              onClick={(e) => { e.preventDefault(); focusPrimary(); }}
            >
              Skip to your running total
            </a>
            <LivePreviewChips preview={preview} onExample={(t) => setStory((s) => (s.trim() ? `${s.replace(/[\s,]+$/, '')}, ${t}` : t))} />
            <div className="row between wrap-sm">
              <button type="button" className="link-btn" onClick={() => setStory(EXAMPLE)}>Use an example</button>
              {/* 🔴 THE PRIMARY IS NEVER A GREY PILL.
                  On an empty box this was the disabled button, so the only
                  live-looking control beside it was the ghost link — the person's
                  own action looked switched off. It now carries the primary style
                  at every moment; while the box is empty it puts the cursor in the
                  box instead of submitting nothing. */}
              {story.trim() ? (
                <button className="btn primary" type="submit">
                  {preview.segments.length ? `Add these ${preview.segments.length}` : 'Add everything'} <Icon.Arrow />
                </button>
              ) : (
                <button className="btn primary" type="button"
                        onClick={() => storyRef.current?.focus({ preventScroll: true })}>
                  Add everything <Icon.Arrow />
                </button>
              )}
            </div>
            {/* The honest version of the promise, kept where the typing happens.
                It used to be a paragraph above the box; the fact is unchanged. */}
            <p className="micro">What you type stays in this browser. It is sent to this site only if you press <strong>Save and share</strong>, and that save comes back with a code that deletes it.</p>
          </form>
        </section>

        {/* 🔴 ASKED UNDER THE BOX, NOT IN FRONT OF IT.
            The three questions that decide whether a federal figure describes
            this person are still asked before the number — but as one line that
            states the basis, with Change beside it. Every chip, every note and
            every stored answer is behind that one click, unchanged. */}
        <ContextBar variant="ask" />

        <section className="card">
          <p className="lbl">Or add one thing at a time</p>
          <label className="sr-only" htmlFor="unit-search">Search the federal price table for a visit, test or scan</label>
          <div className="search" ref={boxRef}>
            <span className="search-ic" aria-hidden="true"><Icon.Search /></span>
            <input id="unit-search" type="text" value={q} role="combobox" aria-expanded={open && hits.length > 0} aria-controls="hits" aria-autocomplete="list"
              aria-activedescendant={open && hits.length ? `hit-${hits[hi]?.item.id}` : undefined}
              onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
              placeholder="Search: MRI, blood work, cardiologist, ER, therapy…" />
            {q && <button className="icon-btn in-search" type="button" aria-label="Clear the search" onClick={() => setQ('')}><Icon.X /></button>}
            {open && hits.length > 0 && (
              <ul id="hits" className="hits" role="listbox">
                {hits.map((h, i) => (
                  <li key={h.item.id} id={`hit-${h.item.id}`} role="option" aria-selected={i === hi} className={i === hi ? 'is-hi' : ''}
                    onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(h.item); }}>
                    <span className="hit-l">{h.item.label}</span>
                    <span className="hit-r">{usd(h.item.valueUsd)}<small>{h.item.code ?? ''}</small></span>
                  </li>
                ))}
                {q.trim() && <li className="hit-foot">Press Enter to add “{q.trim()}” as you wrote it</li>}
              </ul>
            )}
          </div>

          <div className="tabs" role="tablist" aria-label="Categories of care">
            {cats.map((c, i) => (
              <button key={c.key} type="button" id={`tab-${c.key}`} role="tab" aria-selected={cat === c.key} aria-controls="cat-panel"
                tabIndex={cat === c.key ? 0 : -1} className={cat === c.key ? 'is-on' : ''}
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                  e.preventDefault();
                  const next = cats[(i + (e.key === 'ArrowRight' ? 1 : cats.length - 1)) % cats.length];
                  setCat(next.key);
                  setChipAt(0);
                  document.getElementById(`tab-${next.key}`)?.focus();
                }}
                onClick={() => { setCat(c.key); setChipAt(0); }}>{c.short}</button>
            ))}
          </div>
          {/* 🔴 ONE TAB STOP FOR THE WHOLE CATALOGUE.
              Every chip used to be its own stop, so reaching the total from the
              sentence took more than sixty Tab presses. The list is now a single
              stop with a roving tabindex: Arrow keys (and Home/End) move inside
              it, Tab leaves it. The panel itself is no longer a bare focusable
              DIV — it holds real controls, so it is not a stop of its own. */}
          <div className="chips" id="cat-panel" role="tabpanel" aria-labelledby={`tab-${cat}`} ref={chipsRef}
            onKeyDown={(e) => {
              const list = byCat[cat] ?? [];
              if (!list.length) return;
              const move = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
                : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
              let next = -1;
              if (move) next = (chipAt + move + list.length) % list.length;
              else if (e.key === 'Home') next = 0;
              else if (e.key === 'End') next = list.length - 1;
              if (next < 0) return;
              e.preventDefault();
              setChipAt(next);
              (chipsRef.current?.querySelectorAll('button.chip')[next] as HTMLElement | undefined)?.focus();
            }}>
            {(byCat[cat] ?? []).map((it, i) => (
              <button key={it.id} type="button" className="chip" tabIndex={i === chipAt ? 0 : -1}
                onFocus={() => setChipAt(i)}
                onClick={() => st.addItem(it)} aria-label={`Add ${it.label}, ${usd(it.valueUsd)}`}>
                <span>{it.label}</span><b aria-hidden="true">{usd(it.valueUsd)}</b>
              </button>
            ))}
          </div>
        </section>

        {st.entries.length > 0 && (
          <section className="card">
            <div className="row between">
              <p className="lbl">Your journey so far</p>
              <button className="link-btn danger" onClick={() => { if (confirm('Clear the whole journey?')) st.reset(); }}>Start over</button>
            </div>
            <ol className="journey">
              {lines.map((l) => {
                const en = l.entry;
                const alts = search(en.raw, ITEMS, 5).map((h) => h.item);
                return (
                  <li key={en.key} className={en.item ? '' : 'is-unpriced'}>
                    <div className="j-main">
                      <p className="j-raw">{en.raw}</p>
                      {en.item ? (
                        <select className="j-map" value={en.item.id} aria-label={`Unit of care for ${en.raw}`} onChange={(e) => st.remap(en.key, e.target.value || null)}>
                          {[en.item, ...alts.filter((a) => a.id !== en.item!.id)].map((a) => <option key={a.id} value={a.id}>{a.label} · {usd(a.valueUsd)}</option>)}
                          <option value="">No match — keep unpriced</option>
                        </select>
                      ) : (
                        <select className="j-map is-unpriced" value="" aria-label={`Choose a unit of care for ${en.raw}`} onChange={(e) => st.remap(en.key, e.target.value || null)}>
                          <option value="">No federal figure matched — choose one or leave unpriced</option>
                          {alts.map((a) => <option key={a.id} value={a.id}>{a.label} · {usd(a.valueUsd)}</option>)}
                        </select>
                      )}
                    </div>
                    <div className="j-side">
                      <div className="stepper-n" role="group" aria-label={`How many times: ${en.raw}`}>
                        <button type="button" aria-label={`One fewer ${en.raw}`} onClick={() => st.setTimes(en.key, en.times - 1)}><Icon.Minus /></button>
                        <input type="number" min={1} max={365} value={en.times} onChange={(e) => st.setTimes(en.key, Number(e.target.value))} aria-label={`Times: ${en.raw}`} />
                        <button type="button" aria-label={`One more ${en.raw}`} onClick={() => st.setTimes(en.key, en.times + 1)}><Icon.Plus /></button>
                      </div>
                      <span className={`j-amt ${l.priced ? '' : 'muted'}`}>{l.priced ? usd(l.totalUsd) : 'unpriced'}</span>
                      <button type="button" className="icon-btn" aria-label={`Remove ${en.raw}`} onClick={() => st.remove(en.key)}><Icon.X /></button>
                    </div>
                  </li>
                );
              })}
            </ol>
            {st.unpricedHits.length > 0 && (
              <div className="notice">
                <p><strong>Named, not priced:</strong> {st.unpricedHits.map((id) => UNPRICEABLE.find((u) => u.id === id)?.label ?? id).join(' · ')}. These are real costs with no defensible federal figure. They appear on your ledger as blank lines with the reason.</p>
              </div>
            )}
          </section>
        )}
      </div>

      <section className="builder-side" aria-label="Running total">
        <div className="card sticky">
          {nothingYet ? (
            <>
              <p className="lbl">Running total</p>
              {/* No figure at the reveal's size before anything has been counted:
                  a $0 is a claim and a 3.6rem dash reads as a redaction. The slot
                  waits in words until there is a published figure to put in it. */}
              <p className={cs.waitNote}>Nothing counted yet. Name a visit, a scan or a test in the box and the published figure lands here as you type.</p>
            </>
          ) : sum.totalUsd === 0 && preview.previewTotal > 0 ? (
            <>
              <p className="lbl">So far · from the sentence you are typing</p>
              <p className="big-num">{usd(preview.previewTotal)}</p>
              <p className="micro">{preview.matched} {preview.matched === 1 ? 'phrase' : 'phrases'} priced from published figures, all payers combined · press Add to keep them</p>
            </>
          ) : (
            <>
              <p className="lbl">Running total</p>
              <p className="big-num">{usd(sum.totalUsd)}</p>
              <p className="micro">{sum.pricedCount} priced {sum.pricedCount === 1 ? 'line' : 'lines'}{sum.unpricedCount ? ` · ${sum.unpricedCount} unpriced` : ''} · what the published figures add up to, all payers combined</p>
              {preview.previewTotal > 0 && (
                <p className="lp-ghost">+ {usd(preview.previewTotal)} from the sentence you are typing — not added yet</p>
              )}
            </>
          )}
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">Running total {usd(sum.totalUsd)} from {sum.pricedCount} priced {sum.pricedCount === 1 ? 'line' : 'lines'}{sum.unpricedCount ? `, ${sum.unpricedCount} unpriced` : ''}.</p>
          {st.entries.length
            ? <Link className="btn primary full" href="/ledger" id="see-what-it-cost" data-go="total">See what it cost <Icon.Arrow /></Link>
            : <button className="btn primary full is-disabled" type="button" data-go="total" disabled>See what it cost <Icon.Arrow /></button>}
          {st.entries.length > 0 && <ShareCard data={{ ...card, url: st.shareUrl(), tableVersion: TABLE_VERSION }} />}
          <p className="micro">Every line links to the federal source it came from. What you type stays in this browser unless you press Save.</p>
        </div>
      </section>

      <div className="mobile-bar">
        {/* One journey count, then its sub-line. The bar and the ledger count the same
            way: appointments is the sum of times, distinct lines is how many rows. */}
        {nothingYet ? (
          <div>
            <span className={cs.barWait}>Type what happened and it counts here</span>
          </div>
        ) : sum.totalUsd === 0 && preview.previewTotal > 0 ? (
          <div>
            <span className="mb-total">{usd(preview.previewTotal)}</span>
            <span className="mb-sub">so far, from the sentence you are typing</span>
            <span className="mb-sub mb-distinct">press Add to keep it</span>
          </div>
        ) : (
          <div>
            <span className="mb-total">{usd(sum.totalUsd)}</span>
            <span className="mb-sub">{appointments} {appointments === 1 ? 'appointment' : 'appointments'}</span>
            <span className="mb-sub mb-distinct">{st.entries.length} distinct {st.entries.length === 1 ? 'line' : 'lines'}</span>
          </div>
        )}
        {st.entries.length
          ? <Link className="btn primary" href="/ledger" data-go="total">See what it cost</Link>
          : <button className="btn primary is-disabled" type="button" data-go="total" disabled>See what it cost</button>}
      </div>
    </div>
  );
}

/** The visible primary action, whichever surface is showing it: the sidebar on a
 *  desktop, the bottom bar on a phone. Focus goes to it, so the next Enter acts. */
function focusPrimary(): void {
  const all = [...document.querySelectorAll<HTMLElement>('[data-go="total"]')];
  const on = all.find((e) => e.offsetParent !== null) ?? all[0];
  if (!on) return;
  on.scrollIntoView({ block: 'center' });
  on.focus();
}

/** The card carries only what the share link carries: units, counts, published figures. */
export function shareCardData(lines: PricedLine[], distinctCount: number, namedUnpriced: number): Omit<ShareCardData, 'url' | 'tableVersion'> {
  const sum = totals(lines);
  const byCat = new Map<string, number>();
  for (const l of lines) {
    if (!l.priced || !l.entry.item) continue;
    const k = categoryKey(l.entry.item);
    byCat.set(k, (byCat.get(k) ?? 0) + (l.totalUsd ?? 0));
  }
  const bars = CATEGORIES
    .map((c) => ({ label: c.label, total: byCat.get(c.key) ?? 0 }))
    .filter((b) => b.total > 0)
    .sort((a, b) => b.total - a.total);
  /* 🔴 THE CARD CARRIES THE STORY, NOT JUST THE SUM.
     The biggest number on the old card was the least remarkable thing about the
     journey. These clauses are the counts already in the store — months the
     mapper refused to price, appointments, and care that did not happen — and
     each one is dropped when its count is zero. Nothing here is a dollar figure
     and nothing here is typed text. */
  const entries = lines.map((l) => l.entry);
  const gaps = gapSummary(entries);
  const story = odysseyClauses({
    months: gaps.months,
    appointments: lines.reduce((a, l) => a + l.entry.times, 0),
    cats: gaps.cats,
  });
  /* One published, currently-true comparison line, or null. `siteOfServiceFinding`
     returns null unless both rows are present and both carry the current
     fee-schedule year, so the card can never post a stale ratio. */
  const sos = siteOfServiceFinding();
  return {
    totalUsd: sum.totalUsd,
    pricedCount: sum.pricedCount,
    stepCount: lines.reduce((a, l) => a + l.entry.times, 0),
    distinctCount,
    blankCount: sum.unpricedCount + namedUnpriced,
    bars,
    story,
    footnote: sos ? sos.line : null,
  };
}

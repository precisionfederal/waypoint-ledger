'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { saidQuote } from '@/lib/said-quote';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ITEMS, STORY_MAX, UNPRICEABLE, clearStoryDraft, readStoryDraft, saveStoryDraft, useStore } from '@/lib/store';
import { alternativesFor, search } from '@/lib/search';
import { StartOverButton } from './LineControls';
import { CATEGORIES, categoryKey } from '@/lib/categories';
import { JOURNEY_TOTAL_BASIS, priceJourney, totals, usd } from '@/lib/pricing';
import { TABLE_VERSION } from '@/lib/table';
import type { PriceItem, PricedLine } from '@/lib/types';
import ShareCard, { type ShareCardData } from './ShareCard';
import { detectState } from '@/lib/state-detect';
import ContextBar from './ContextBar';
import cs from './ContextBar.module.css';
import { NO_FIGURE, gapSummary, odysseyClauses } from '@/lib/sheet';
import { searchLength } from '@/lib/search-length';
import { siteOfServiceFinding } from '@/lib/site-of-service';
import { Icon } from './Icons';
import { LivePreviewChips, addLabel, useLivePreview } from './LivePreview';
export { LivePreviewChips, addLabel, previewTotals, sharedRead, useLivePreview, type LivePreview } from './LivePreview';

const EXAMPLE = 'saw my regular doctor three times, then a cardiologist, an echo and a Holter, then the ER once when my heart was racing';

export default function JourneyBuilder() {
  const st = useStore();
  const [story, setStory] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(CATEGORIES[0].key);
  const [open, setOpen] = useState(false);
  /* patient-2: -1 = nothing chosen yet, so Enter adds the words as typed (what the
     list's own footer says). Only an arrow key or the pointer chooses a hit. */
  const [hi, setHi] = useState(-1);
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
  /* 🔴 A PASTED STORY IS NEVER CUT IN SILENCE (R6 edge #11).
     cf/functions/api/map.js takes the first 2,000 characters. A 2,400-character
     account — the one a person has been writing for a year — lost its tail with
     no message. Nothing is truncated behind their back now: the box says how
     much it prices, the preview reads exactly what Add will price, and what is
     over stays in the box as the next journey. */
  const over = Math.max(0, story.length - STORY_MAX);
  const storyForPricing = over ? story.slice(0, STORY_MAX) : story;
  const preview = useLivePreview(storyForPricing);

  /* The typed sentence survives Back and a hard refresh (R6 edge #14). Read
     once on mount, held for this tab only, cleared when it becomes lines. */
  /* 🔴 A sentence typed or pasted before hydration is in the box but not in
     state (R1 UXM-06, S-05): it is read here, in the hydrating commit, before
     a re-render can write '' over it, and it wins over an older draft because
     it is what the person can see. */
  useLayoutEffect(() => {
    const typed = storyRef.current?.value;
    if (typed) { setStory(typed); return; }
    const draft = readStoryDraft(); if (draft) setStory(draft);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => saveStoryDraft(story), 500);
    return () => clearTimeout(t);
  }, [story]);
  /* 🔴 THE SENTENCE USUALLY SAYS WHERE. "I live in Houston" answers the second
     of the three questions before it is asked; reading it here means nobody has
     to find a 54-option select to repeat themselves. It is read in this browser,
     shown back in their own words, and one click changes it. */
  const place = useMemo(() => detectState(story), [story]);
  const byCat = useMemo(() => {
    const m: Record<string, PriceItem[]> = {};
    for (const it of ITEMS) (m[categoryKey(it)] ||= []).push(it);
    return m;
  }, []);
  const cats = CATEGORIES.filter((c) => byCat[c.key]?.length);
  /* POLISH judge2-12: one noun and one count with the ledger (components/Ledger.tsx
     careEntries): visits and tests are the times on lines WITH a unit of care. */
  const appointments = st.entries.reduce((a, e) => a + (e.item ? e.times : 0), 0);
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
  /* R1 UXM-13: on a phone the box is not focused on load, the same rule as the
     home hero: a keyboard that opens by itself covers half the page before the
     person has read it. */
  useEffect(() => {
    if (!st.entries.length && window.matchMedia?.('(min-width:900px) and (pointer:fine)').matches) storyRef.current?.focus({ preventScroll: true });
  }, [st.entries.length]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function submitStory(e: React.FormEvent) {
    e.preventDefault();
    if (!story.trim()) return;
    // The chips she saw are the lines she gets: the preview's read (AI fills included) when it is
    // for this exact sentence, else the rules alone.
    const r = !preview.pending && preview.segments.length ? st.addSegments(preview.segments, storyForPricing) : st.addStory(storyForPricing);
    // "step" is the ledger's word for the SUM OF TIMES (11 steps, 6 distinct). What was
    // added here is lines, so the toast, the bar and the ledger card all count the same.
    st.toast(`${r.added} ${r.added === 1 ? 'line' : 'lines'} added · ${r.matched} priced from a published figure${r.added - r.matched ? ` · ${r.added - r.matched} kept unpriced` : ''}${r.unpriced ? ` · ${r.unpriced} named as a cost we will not price` : ''}`, r.matched === r.added && !r.unpriced ? 'ok' : 'info');
    /* What was over the 2,000 the server prices stays in the box, named, so a
       long account is added in two passes instead of losing its tail. */
    const rest = over ? story.slice(STORY_MAX).replace(/^[\s,;.]+/, '') : '';
    setStory(rest);
    if (rest) { saveStoryDraft(rest); st.toast(`Priced the first ${STORY_MAX.toLocaleString()} characters. The rest of your story is still in the box. Press Add again and the ledger adds them together.`, 'info'); }
    else clearStoryDraft();
    /* 🔴 THE FLOW ADVANCES ON ITS OWN.
       Pressing Add used to leave you on step 1 facing five controls with three
       different names — "Open my ledger", "See what it cost" twice, "My ledger
       5", "2 Your ledger" — all going to the same page. A sentence becoming a
       priced ledger is one gesture, so the add IS the navigation. Adding a
       single unit from the catalogue below does not navigate: that is
       refinement, not a step of the flow. */
    if (r.added > 0 && !rest) router.push('/ledger');
  }
  function pick(it: PriceItem) { st.addItem(it, q.trim() && !/^\d/.test(q) ? q.trim() : undefined); setQ(''); setOpen(false); }
  function onKey(e: React.KeyboardEvent) {
    if (!open || !hits.length) { if (e.key === 'Enter') { e.preventDefault(); if (q.trim()) { st.addOne(q); setQ(''); } } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h < 0 ? 0 : (h + 1) % hits.length)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h < 0 ? hits.length - 1 : (h - 1 + hits.length) % hits.length)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (hits[hi]) pick(hits[hi].item);
      else if (q.trim()) { st.addOne(q); setQ(''); setOpen(false); }
    }
    else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="builder">
      <div className="builder-main">
        <section className="card">
          <form onSubmit={submitStory} className="story-form">
            <label htmlFor="story" className="lbl">Tell it the way you remember it</label>
            <textarea id="story" ref={storyRef} rows={3} value={story} onChange={(e) => setStory(e.target.value)}
              aria-describedby={story.length >= STORY_MAX - 500 ? 'story-count' : undefined}
              placeholder={`e.g. ${EXAMPLE}`} />
            {story.length >= STORY_MAX - 500 && (
              <p id="story-count" className={`micro story-count${over ? ' over' : ''}`} aria-live="polite">
                {story.length.toLocaleString()} / {STORY_MAX.toLocaleString()} characters
                {over ? `. This box prices the first ${STORY_MAX.toLocaleString()}. Press Add and the other ${over.toLocaleString()} stay in the box as a second journey; the ledger adds them together.` : ''}
              </p>
            )}
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
              {/* JUDGE-7 #10: one filled button at a time. Once the ledger holds a
                  line, "See what it cost" is the filled one and Add is the
                  secondary; before that, Add is filled and "See what it cost"
                  is switched off. */}
              {story.trim() ? (
                <button className={`btn ${st.entries.length ? 'ghost' : 'primary'}`} type="submit">
                  {addLabel(preview.segments.length, preview.matched, preview.reading)} <Icon.Arrow />
                </button>
              ) : (
                <button className={`btn ${st.entries.length ? 'ghost' : 'primary'}`} type="button"
                        onClick={() => storyRef.current?.focus({ preventScroll: true })}>
                  {addLabel(0)} <Icon.Arrow />
                </button>
              )}
            </div>
            {/* The honest version of the promise, kept where the typing happens.
                It used to be a paragraph above the box; the fact is unchanged. */}
            <p className="micro">While you type, your words are sent to this site to be read into units of care, and a phrase the rules cannot read goes, with at most a few words around it, to an AI reader (OpenAI). Leave out names. The ledger itself is kept in this browser until you press <strong>Save across devices</strong>, and that save comes back with a code that deletes it.</p>
          </form>
        </section>

        {/* 🔴 ASKED UNDER THE BOX, NOT IN FRONT OF IT.
            The three questions that decide whether a federal figure describes
            this person are still asked before the number — but as one line that
            states the basis, with Change beside it. Every chip, every note and
            every stored answer is behind that one click, unchanged. */}
        <ContextBar variant="ask" detected={place} />

        <section className="card">
          <p className="lbl">Or add one thing at a time</p>
          <label className="sr-only" htmlFor="unit-search">Search the federal price table for a visit, test or scan</label>
          <div className="search" ref={boxRef}>
            <span className="search-ic" aria-hidden="true"><Icon.Search /></span>
            <input id="unit-search" type="text" value={q} role="combobox" aria-expanded={open && hits.length > 0} aria-controls="hits" aria-autocomplete="list"
              aria-activedescendant={open && hits[hi] ? `hit-${hits[hi].item.id}` : undefined}
              onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(-1); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
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
                {q.trim() && <li className="hit-foot">{hits[hi] ? <>Press Enter to add “{hits[hi].item.label}”</> : <>Press Enter to add “{q.trim()}” as you wrote it</>}</li>}
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
              <StartOverButton />
            </div>
            <ol className="journey">
              {lines.map((l) => {
                const en = l.entry;
                const alts = alternativesFor(en.raw, ITEMS, 5);
                return (
                  <li key={en.key} className={en.item ? '' : 'is-unpriced'}>
                    <div className="j-main">
                      <p className="j-raw">{saidQuote(en.raw)}</p>
                      {en.item ? (
                        <select className="j-map" value={en.item.id} aria-label={`Unit of care for ${en.raw}`} onChange={(e) => st.remap(en.key, e.target.value || null)}>
                          {[en.item, ...alts.filter((a) => a.id !== en.item!.id)].map((a) => <option key={a.id} value={a.id}>{a.label} · {usd(a.valueUsd)}</option>)}
                          <option value="">No match: keep unpriced</option>
                        </select>
                      ) : (
                        <select className="j-map is-unpriced" value="" aria-label={`Choose a unit of care for ${en.raw}`} onChange={(e) => st.remap(en.key, e.target.value || null)}>
                          <option value="">No federal figure matched: choose one or leave unpriced</option>
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
                      <span className={`j-amt ${l.priced ? '' : 'muted'}`}>{l.priced ? usd(l.totalUsd, true) : 'unpriced'}</span>
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
              <p className="micro">{preview.matched} {preview.matched === 1 ? 'phrase' : 'phrases'} priced at {JOURNEY_TOTAL_BASIS} · press Add to keep them</p>
            </>
          ) : (
            <>
              <p className="lbl">Running total</p>
              <p className="big-num">{usd(sum.totalUsd)}</p>
              <p className="micro">{sum.pricedCount} priced {sum.pricedCount === 1 ? 'line' : 'lines'}{sum.unpricedCount ? ` · ${sum.unpricedCount} unpriced` : ''} · {JOURNEY_TOTAL_BASIS}</p>
              {preview.previewTotal > 0 && (
                <p className="lp-ghost">+ {usd(preview.previewTotal)} from the sentence you are typing, not added yet</p>
              )}
            </>
          )}
          {sum.totalUsd === 0 && preview.previewTotal > 0
            ? <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">So far {usd(preview.previewTotal)} from {preview.matched} priced {preview.matched === 1 ? 'phrase' : 'phrases'} in the sentence you are typing, not added yet.</p>
            : <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">Running total {usd(sum.totalUsd)} from {sum.pricedCount} priced {sum.pricedCount === 1 ? 'line' : 'lines'}{sum.unpricedCount ? `, ${sum.unpricedCount} unpriced` : ''}.</p>}
          {preview.readerDown && preview.segments.length > 0 && (
            <p className="micro">Our reader is busy. These lines came from the rules alone. Anything it could not read is listed as unpriced, and you can add it from the search box.</p>
          )}
          {st.entries.length
            ? <Link className="btn primary full" href="/ledger" id="see-what-it-cost" data-go="total">See what it cost <Icon.Arrow /></Link>
            : <button className="btn primary full is-disabled" type="button" data-go="total" disabled>See what it cost <Icon.Arrow /></button>}
          {st.entries.length > 0 && <ShareCard data={{ ...card, url: st.shareUrl(), tableVersion: TABLE_VERSION }} />}
          <p className="micro">Every line links to the federal source it came from. Your ledger is kept in this browser until you press Save across devices.</p>
        </div>
      </section>

      <div className="mobile-bar">
        {/* One journey count, then its sub-line. The bar and the ledger count the same
            way: appointments is the sum of times, and the lines are counted as the
            ledger counts them, "N priced lines" (JUDGE-7 #10). */}
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
            <span className="mb-sub">{appointments} {appointments === 1 ? 'visit or test' : 'visits and tests'}</span>
            <span className="mb-sub mb-distinct">{sum.pricedCount} priced {sum.pricedCount === 1 ? 'line' : 'lines'}</span>
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
export function shareCardData(lines: PricedLine[], _lineCount: number, namedUnpriced: number): Omit<ShareCardData, 'url' | 'tableVersion'> {
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
  /* 🔴 round 2 (c1): the card said "8 visits and tests" and "2 left blank"
     where the ledger said 6 and 1. The card now counts exactly what the
     ledger counts (components/Ledger.tsx): visits and tests are the times on
     lines WITH a unit of care, and "left blank" is the lines that happened with
     no figure plus the named costs we will not price. */
  const visits = lines.reduce((a, l) => a + (l.entry.item ? l.entry.times : 0), 0);
  const blank = (gaps.cats.find(([id]) => id === NO_FIGURE)?.[1].lines ?? 0) + namedUnpriced;
  const story = odysseyClauses({
    months: gaps.months,
    appointments: visits,
    cats: gaps.cats,
  });
  /* judge panel #6: the clinicians she named or counted travel with the card,
     right after how long it took; nothing when she named fewer than two. */
  const { cliniciansPhrase } = searchLength(entries);
  if (cliniciansPhrase) story.splice(gaps.months > 0 ? 1 : 0, 0, cliniciansPhrase);
  /* One published, currently-true comparison line, or null. `siteOfServiceFinding`
     returns null unless both rows are present and both carry the current
     fee-schedule year, so the card can never post a stale ratio. */
  const sos = siteOfServiceFinding();
  return {
    totalUsd: sum.totalUsd,
    pricedCount: sum.pricedCount,
    stepCount: visits,
    distinctCount: new Set(lines.flatMap((l) => (l.entry.item ? [l.entry.item.id] : []))).size,
    blankCount: blank,
    bars,
    story,
    footnote: sos ? sos.line : null,
  };
}

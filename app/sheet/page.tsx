'use client';

/* ==========================================================================
   THE APPOINTMENT SHEET — the act the ledger ends in.
   One printed page she hands to the clinician: what happened, what each line
   costs in the government's own published figures, where each figure comes
   from, and three questions worth asking. Nothing here is advice.
   ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TABLE } from '@/lib/table';
import { priceJourney, totals, usd } from '@/lib/pricing';
import { UNPRICEABLE, useStore } from '@/lib/store';
import { COVERAGE_LABEL, agencyOf, fitOf, localityOf, totalLabels, type Fit } from '@/lib/fit';
import { BASIS_NAME } from '@/components/LineDrawer';
import { EMPTY_BURDENS, burdenCards, loadBurdens, money, type BurdenCounts } from '@/lib/burdens';
import { fitTally, gapLabel, gapSummary, gapWhy, monthsPhrase } from '@/lib/sheet';
import type { JourneyEntry, PriceItem } from '@/lib/types';
import './print.css';

/* 🔴 THE SHEET LABELS THE FIGURE IT ACTUALLY PRINTED.
   The cell printed the fit-substituted figure against the ROW's basis and year:
   an uninsured reader saw "$189.25 (allowed, 2026)" while the sub-line one row
   down said "Average submitted charge, CY2024", and the footer claimed every
   figure was a CY2026 Iowa allowed amount on a sheet where none of them was.
   This is the one page a person hands a clinician, an HR office or a disability
   reviewer, so it cannot contradict itself.

   lib/fit already writes the true description of the substituted figure into
   `figureNote` ("Medicare allowed amount, Iowa, CY2026 formula" · "Average
   submitted charge, CY2024 · billed charge…"). The label is that sentence's
   first clause — one definition, so the sheet can never drift from the ledger.
   Only when the figure IS the row's own (which === 'schedule') does the row's
   basis and year describe it, and then they are used. */
function figureLabel(it: PriceItem, fit: Fit): string {
  const first = (fit.figureNote || '').split('·')[0].trim();
  if ((fit.which === 'locality' || fit.which === 'charge') && first) return first;
  return `${BASIS_NAME[it.basis] ?? it.basis.replace(/_/g, ' ')}, ${it.year}`;
}

export default function SheetPage() {
  const st = useStore();
  const [example, setExample] = useState(false);
  const [savedAt] = useState<string>(() => new Date().toISOString());
  useEffect(() => { setExample(new URLSearchParams(window.location.search).has('example')); }, []);
  const entries: JourneyEntry[] | null = !st.hydrated ? null : example ? exampleEntries() : st.entries;

  const [burdens, setBurdens] = useState<BurdenCounts>(EMPTY_BURDENS);
  useEffect(() => { setBurdens(loadBurdens()); }, []);

  const ctx = st.ctx;
  const loc = localityOf(ctx.locality);
  const fits = useMemo(() => {
    const m = new Map<string, Fit>();
    for (const e of entries ?? []) if (e.item) m.set(e.key, fitOf(e.item, ctx));
    return m;
  }, [entries, ctx]);
  const lines = useMemo(
    () => priceJourney(entries ?? [], (e) => (e.item ? fits.get(e.key)?.figureUsd ?? null : undefined)),
    [entries, fits],
  );
  const sum = useMemo(() => totals(lines), [lines]);
  const labels = useMemo(() => totalLabels(ctx), [ctx]);
  const sources = useMemo(() => {
    const seen = new Map<string, string>();
    for (const l of lines) if (l.priced && l.entry.item) seen.set(l.entry.item.sourceTitle, l.entry.item.sourceUrl);
    for (const c of burdenCards(burdens)) if (c.count > 0 && c.source.title) seen.set(c.source.title, c.source.url ?? '');
    return [...seen.entries()];
  }, [lines, burdens]);

  /* The four burdens, exactly as the ledger holds them: only the ones the
     person actually filled in, never summed with each other or with the total. */
  const burdenList = useMemo(() => burdenCards(burdens).filter((c) => c.count > 0), [burdens]);

  /* What was counted and never priced: care that did not happen, time spent
     searching, steps with no published figure, and costs we refuse to price. */
  const gaps = useMemo(
    () => gapSummary(entries ?? [], st.unpricedHits.map((id) => UNPRICEABLE.find((u) => u.id === id)?.label).filter((x): x is string => Boolean(x))),
    [entries, st.unpricedHits],
  );

  /* Whether each figure describes this person is the last column of the table;
     this is the same answer counted, so the reader sees it before the rows. */
  const tally = useMemo(() => fitTally([...fits.values()].map((f) => f.verdict)), [fits]);
  /* How many printed figures really are the locality ones — the footer says so
     only when it is true of at least one line. */
  const localityLines = useMemo(
    () => lines.filter((l) => l.priced && fits.get(l.entry.key)?.which === 'locality').length,
    [lines, fits],
  );

  if (entries === null) return <section className="step"><div className="wrap"><p className="sub">Loading your ledger…</p></div></section>;

  if (!entries.length) {
    return (
      <section className="step">
        <div className="wrap">
          <p className="eyebrow">Appointment sheet</p>
          <h1>There is no journey on this device yet</h1>
          <p className="sub">The sheet is built from the journey you describe on the home page. Nothing is stored anywhere but this browser.</p>
          <div className="step-actions"><Link className="btn primary" href="/">Describe your journey</Link></div>
        </div>
      </section>
    );
  }

  const date = new Date(savedAt || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <section className="step sheet">
      <div className="wrap">
        <div className="sheet-tools no-print">
          <p className="eyebrow">Appointment sheet</p>
          <div className="cta-row" style={{ margin: 0 }}>
            <button className="btn primary" onClick={() => window.print()}>Print or save as PDF</button>
            <Link className="btn ghost" href="/">Back to the ledger</Link>
          </div>
        </div>

        <header className="sheet-head">
          <h1>What my diagnostic search has cost</h1>
          <p className="sheet-meta">Prepared {date} with Waypoint Ledger · every figure is published U.S. federal data, cited below</p>
        </header>

        <div className="sheet-total">
          <div>
            <p className="total-label">{labels.primary}</p>
            <p className="total-num">{usd(sum.totalUsd)}</p>
          </div>
          <p className="sheet-total-note">
            {sum.pricedCount} priced {sum.pricedCount === 1 ? 'line' : 'lines'}
            {sum.unpricedCount ? ` · ${sum.unpricedCount} with no published federal figure` : ''}.
            {ctx.coverage || loc ? ` Priced for ${[ctx.coverage ? COVERAGE_LABEL[ctx.coverage].toLowerCase() + ' coverage' : null, loc ? loc.displayName : null].filter(Boolean).join(', ')}.` : ''}
            {' '}These are published prices for this pattern of care, not a bill and not a claim.
          </p>
        </div>

        {/* 🔴 THE NUMBER LEADS; THE SENTENCE FOLLOWS IT.
            This sentence used to be the total's own label, so the largest figure
            on a sheet a person hands a clinician arrived wearing an instruction.
            It is the same sentence, relocated under the number as small type. */}
        {!ctx.coverage && (
          <p className="sheet-fit">
            Medicare reference &middot; {loc ? loc.displayName : 'national'}. Say who pays for your care and
            every line will say whether that figure describes you.
          </p>
        )}

        {tally.length > 0 && (
          <p className="sheet-fit">
            <strong>Does the published figure describe you:</strong>{' '}
            {tally.map(([v, n]) => `${n} ${n === 1 ? 'line' : 'lines'} ${v.toLowerCase()}`).join(' · ')}.{tally.length > 1 ? ' Each line says which it is, under its own figure.' : ''}
          </p>
        )}

        <table className="sheet-table">
          <thead>
            <tr>
              <th scope="col">What happened</th>
              <th scope="col">Unit of care</th>
              <th scope="col" className="num">Times</th>
              <th scope="col" className="num">Published figure</th>
              <th scope="col" className="num">Line total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const it = l.entry.item;
              const fit = it ? fits.get(l.entry.key) : undefined;
              return (
                <tr key={l.entry.key}>
                  <td>{l.entry.raw}</td>
                  <td data-label="Unit of care">{it ? <>{agencyOf(it)} · {it.label}{it.code ? <span className="sheet-code"> {it.code}</span> : null}</> : <em>no federal figure exists</em>}</td>
                  <td className="num" data-label="Times">{l.entry.times}</td>
                  {/* 🔴 ONE CELL CARRIES THE FIGURE, ITS BASIS AND WHETHER IT
                      DESCRIBES THIS PERSON. A sixth column spent 14% of the paper
                      width printing one repeated word; the same answer now sits
                      under the figure it is about, where a clinician reads it —
                      and only when the lines differ. Where every line carries the
                      same answer, the counted line above the table says it once
                      and no word is repeated down the page. */}
                  <td className="num" data-label="Published figure">
                    {it && l.priced && fit ? `${usd(fit.figureUsd, true)} (${figureLabel(it, fit)})` : '—'}
                    {fit?.figureNote ? <><br /><span className="sheet-code">{fit.figureNote}</span></> : null}
                    {fit && tally.length > 1 ? <><br /><span className="sheet-verdict">{fit.verdict}</span></> : null}
                  </td>
                  <td className="num" data-label="Line total">{l.priced ? usd(l.totalUsd) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {(burdenList.length > 0 || !gaps.empty) && (
          <section className="sheet-burdens" aria-labelledby="sheet-burdens-h">
            <h2 id="sheet-burdens-h">Beside the money, never inside it</h2>

            {burdenList.length > 0 && (
              <div className="sb-grid">
                {burdenList.map((c) => (
                  <article key={c.kind}>
                    <h3>{c.title}</h3>
                    <p>
                      <span className="sb-count">{c.count} {c.unit}</span>
                      {c.valueUsd !== null ? <> · {money(c.valueUsd)}</> : <> · counted, no federal figure prices it</>}
                    </p>
                    {c.arithmetic ? <p className="sb-math">{c.arithmetic}</p> : null}
                    {c.source.title
                      ? <p className="sb-src">{c.source.title}{c.source.year ? ` · ${c.source.year}` : ''}</p>
                      : <p className="sb-why">{c.noFigureReason ?? c.method}</p>}
                  </article>
                ))}
              </div>
            )}

            {!gaps.empty && (
              <section className="sheet-gaps" aria-labelledby="sheet-gaps-h">
                <h3 id="sheet-gaps-h">Counted, never priced</h3>
                <ul>
                  {gaps.months > 0 && (
                    <li><span className="sb-count">{monthsPhrase(gaps.months)}</span> — {gapLabel('time-searching')}. {gapWhy('time-searching')}</li>
                  )}
                  {gaps.cats.map(([id, c]) => (
                    <li key={id}>
                      <span className="sb-count">{c.times}</span> — {gapLabel(id)}
                      {c.lines !== c.times ? ` (${c.lines} ${c.lines === 1 ? 'line' : 'lines'})` : ''}. {gapWhy(id)}
                    </li>
                  ))}
                  {gaps.named.length > 0 && (
                    <li><span className="sb-count">{gaps.named.length}</span> — real costs with no defensible federal figure: {gaps.named.join(' · ')}. Left blank rather than estimated.</li>
                  )}
                </ul>
              </section>
            )}

            <p className="sb-note">
              None of these is added to the total above, and none is added to another: a missed workday and an hour of
              someone else&rsquo;s time are different quantities, and adding them would be a weighting nobody published.
            </p>
            {burdenList.length === 0 && (
              <p className="micro no-print">
                Workdays, unpaid care hours, trips and dismissals are counted on <Link href="/ledger">your ledger</Link>; whatever you enter there prints here.
              </p>
            )}
          </section>
        )}

        <div className="sheet-cols">
          <section>
            <h2>Three questions worth asking today</h2>
            <ol className="sheet-q">
              <li>Which of these steps would you have ordered first, knowing what you know now?</li>
              <li>Is there a test on this list you would not repeat, and one that is still missing?</li>
              <li>If I bring this sheet to the next specialist, what should I add to it before I go?</li>
            </ol>
          </section>
          <section>
            <h2>Where every figure comes from</h2>
            <ol className="sheet-src">
              {/* the scheme adds a line per source on paper and nothing a reader needs */}
              {sources.map(([t, u]) => <li key={t}>{t}{u ? <> — <span className="sheet-url">{u.replace(/^https?:\/\//, '')}</span></> : null}</li>)}
            </ol>
          </section>
        </div>

        <p className="sheet-foot">
          {loc && localityLines > 0
            ? `${localityLines} of the ${lines.length} ${lines.length === 1 ? 'line' : 'lines'} here carry the CMS allowed amount CMS publishes for ${loc.displayName} under the CY2026 formula; the rest carry the figure named in their own row, and each says which.`
            : 'Each figure is labelled with what it is: a Medicare allowed amount, an average submitted charge, or a survey average across everyone in the source population. Nothing here is a bill.'}
          {' '}{tally.length > 1 ? 'Under each published figure' : 'The counted line above the table'} says whether the published figure describes this person, is a reference price, is what an uninsured person is billed against, or describes someone else entirely.
          Not a diagnosis, not treatment advice, not medical records. waypoint · Precision Federal.
        </p>
      </div>
    </section>
  );
}

function exampleEntries(): JourneyEntry[] {
  const pick = (id: string) => TABLE.find((t) => t.id === id) ?? null;
  return [
    { key: 'x1', raw: 'saw my regular doctor about the fatigue', item: pick('cms-99214'), times: 6 },
    { key: 'x2', raw: 'first visit with a cardiologist', item: pick('cms-99204'), times: 1 },
    { key: 'x3', raw: 'echocardiogram', item: pick('cms-img-echo'), times: 1 },
    { key: 'x4', raw: 'wore a heart monitor', item: pick('cms-test-holter'), times: 1 },
    { key: 'x5', raw: 'blood work each visit', item: pick('cms-lab-cmp'), times: 6 },
    { key: 'x6', raw: 'went to the ER when my heart was racing', item: pick('cms-ed-99284-complete'), times: 2 },
    { key: 'x7', raw: 'missed work', item: null, times: 4 },
  ];
}

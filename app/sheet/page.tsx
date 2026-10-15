'use client';

/* ==========================================================================
   THE APPOINTMENT SHEET — the act the ledger ends in.
   One printed page she hands to the clinician: what happened, what each line
   costs in the government's own published figures, where each figure comes
   from, and three questions worth asking. Nothing here is advice.
   ========================================================================== */

import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import Link from '@/components/IntentLink';
import { besideSentence, priceJourney, totals, usd } from '@/lib/pricing';
import { UNPRICEABLE, useStore } from '@/lib/store';
import { COVERAGE_LABEL, agencyOf, fitOf, localityOf, totalLabels, type Fit } from '@/lib/fit';
import { BASIS_NAME } from '@/components/LineDrawer';
import { EMPTY_BURDENS, burdenCards, loadBurdensWithWords, money, type BurdenCounts } from '@/lib/burdens';
import { searchLength, splitFrom } from '@/lib/search-length';
import { NO_FIGURE, SHARED_NO_FIGURE, fitTally, gapLabel, gapSummary, gapWhy, isCareLine, monthsPhrase, noteRowsOf } from '@/lib/sheet';
import { saidQuote } from '@/lib/said-quote';
import type { JourneyEntry, PriceItem } from '@/lib/types';
import HelpThatExists from '@/components/HelpThatExists';
import { gapPhrase, hasPaid, paidArithmetic, paidRowOf, paidSummary, signedMoney } from '@/lib/paid';
import SheetRail from '@/components/sheet/SheetRail';
import { figureLabel } from '@/components/sheet/sheet-size';
import { countedGaps } from '@/components/sheet/sheet-size';
import ThemedImg from '@/components/ThemedImg';
import JourneyStrip, { shortUnit, type Stop } from '@/components/sheet/JourneyStrip';
import { EXAMPLE_UNPRICED, exampleEntries } from '@/components/sheet/example';
import { sheetWho, stopWords, tallyPhrase } from '@/components/sheet/sheet-who';
import { hiddenCount, hiddenNote, shownEntries, toggled } from '@/components/sheet/redact';
import ListenButton from '@/components/ListenButton';
import { ledgerScript, spokenLineOf } from '@/lib/speech';
import { TABLE_VERSION } from '@/lib/table';
import './sheet.css';
import './print.css';

/* The ticks inside "Hide before sharing" load only when it is opened. */
const RedactList = lazy(() => import('@/components/sheet/RedactList'));

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

export default function SheetPage() {
  const st = useStore();
  const [example, setExample] = useState(false);
  const [savedAt] = useState<string>(() => new Date().toISOString());
  useEffect(() => { setExample(new URLSearchParams(window.location.search).has('example')); }, []);
  const allEntries: JourneyEntry[] | null = !st.hydrated ? null : example ? exampleEntries() : st.entries;
  /* HIDE BEFORE SHARING (components/sheet/redact.ts): lines the person hides, and
     their own words, are left off everything the page prints. Nothing hidden by
     default; held in this page only, never stored or sent. */
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [hideWords, setHideWords] = useState(false);
  const [redactOpen, setRedactOpen] = useState(false);
  const entries: JourneyEntry[] | null = allEntries === null ? null : shownEntries(allEntries, hidden);
  const nHidden = allEntries ? hiddenCount(allEntries, hidden) : 0;

  const [burdens, setBurdens] = useState<BurdenCounts>(EMPTY_BURDENS);
  useEffect(() => { setBurdens(loadBurdensWithWords()); }, []);

  const ctx = st.ctx;
  const loc = localityOf(ctx.locality);
  /* flow3-20 on the sheet: a parent answering for a child prints it about the child */
  const forChild = st.patient?.stratum === 'caregiver-child';
  /* JUDGE-7 #5: an adult child's sheet names the parent ("What my father's diagnostic
     search has cost"). The stratum and relation are read as optional strings: the
     store may not carry 'caregiver-adult' or a relation word yet, and then the words
     are exactly today's (components/sheet/sheet-who.ts). */
  const pt = st.patient as { stratum?: string; relation?: string } | null | undefined;
  const sw = sheetWho(pt?.stratum, pt?.relation);
  const who = sw.who;
  const fits = useMemo(() => {
    const m = new Map<string, Fit>();
    for (const e of entries ?? []) if (e.item) m.set(e.key, fitOf(e.item, ctx, forChild));
    return m;
  }, [entries, ctx, forChild]);
  const lines = useMemo(
    () => priceJourney(entries ?? [], (e) => (e.item ? fits.get(e.key)?.figureUsd ?? null : undefined)),
    [entries, fits],
  );
  const sum = useMemo(() => totals(lines), [lines]);
  /* 🔴 THE PERSON'S WORDS THAT ARE NOT CARE PRINT AS WORDS (R3 clinician C04). */
  /* A line the person said they paid for is a cost row, whatever its words. */
  const notes = useMemo(() => noteRowsOf(entries ?? []).filter((e) => !hasPaid(e)), [entries]);
  const rows = useMemo(() => lines.filter((l) => isCareLine(l.entry) || !l.entry.raw.trim() || hasPaid(l.entry)), [lines]);
  /* What I paid: its own column and its own total, only when a line carries one. */
  const paid = useMemo(() => paidSummary(lines), [lines]);
  /* 🔴 ONE LABEL IN THE HEADER, NOT ON EVERY ROW (R3 clinician C05). When every
     printed figure is the same kind ("Medicare allowed amount, 2026"), it is said
     once in the column header, and a 25-line journey fits on fewer pages. */
  const oneLabel = useMemo(() => {
    const set = new Set<string>();
    for (const l of lines) {
      const it = l.entry.item; const f = it ? fits.get(l.entry.key) : undefined;
      if (it && l.priced && f) set.add(figureLabel(it, f));
    }
    return set.size === 1 ? [...set][0] : null;
  }, [lines, fits]);
  /* The same for the agency: "CMS ·" printed on every row is said once. */
  const oneAgency = useMemo(() => {
    const set = new Set(lines.filter((l) => l.entry.item).map((l) => agencyOf(l.entry.item!)));
    return set.size === 1 ? [...set][0] : null;
  }, [lines]);
  const labels = useMemo(() => totalLabels(ctx), [ctx]);
  const sources = useMemo(() => {
    const seen = new Map<string, string>();
    for (const l of lines) if (l.priced && l.entry.item) seen.set(l.entry.item.sourceTitle, l.entry.item.sourceUrl);
    for (const c of burdenCards(burdens)) if (c.count > 0 && c.source.title) seen.set(c.source.title, c.source.url ?? '');
    return [...seen.entries()];
  }, [lines, burdens]);
  /* JUDGE-6 #8: the emergency visit's source names two files, and the second is
     source 1 word for word ("…Addendum B; CMS, CY2026 National Physician Fee
     Schedule…"). A part that repeats an earlier source in full is cited by its
     number instead; every file is still named in full once, with its address. */
  const sourceRows = useMemo(() => sources.map(([t, u], i) => {
    const refs: number[] = [];
    const parts = t.split('; ').filter((part, k) => {
      const j = k === 0 ? -1 : sources.findIndex(([o]) => o === part);
      if (j >= 0 && j < i) { refs.push(j + 1); return false; }
      return true;
    });
    return { key: t, title: parts.join('; '), refs, url: u.replace(/^https?:\/\/(www\.)?/, '') };
  }), [sources]);

  /* The four burdens, exactly as the ledger holds them: only the ones the
     person actually filled in, never summed with each other or with the total. */
  const burdenList = useMemo(() => burdenCards(burdens).filter((c) => c.count > 0), [burdens]);

  /* What was counted and never priced: care that did not happen, time spent
     searching, steps with no published figure, and costs we refuse to price. */
  const gaps = useMemo(
    () => gapSummary(entries ?? [], (example ? EXAMPLE_UNPRICED : st.unpricedHits).map((id) => UNPRICEABLE.find((u) => u.id === id)?.label).filter((x): x is string => Boolean(x))),
    [entries, example, st.unpricedHits],
  );
  /* 🔴 ONE COUNT, THE LEDGER'S (judge round 2026-09-30). Lines that happened
     with no figure PLUS the costs we name and will not price: exactly
     components/Ledger.tsx `blankLines`, so the sheet and the ledger never show
     two numbers for one journey (tests/sheet-count.test.ts). */
  /* JUDGE-6 #8: the counted line leaves out what the dismissal card already prints */
  const counted = useMemo(() => countedGaps(gaps, burdens), [gaps, burdens]);
  /* JUDGE-7 #4: missed work with its days on the workdays card is priced there, so it is not also counted here */
  const noFigureLines = (gaps.cats.find(([id]) => id === NO_FIGURE)?.[1].lines ?? 0) + counted.named.length;
  /* judge panel #6: the length of the search beside the total, from her words only. */
  const searched = useMemo(() => searchLength(entries ?? []).line, [entries]);

  /* Whether each figure describes this person is the last column of the table;
     this is the same answer counted, so the reader sees it before the rows. */
  const tally = useMemo(() => fitTally([...fits.values()].map((f) => f.verdict)), [fits]);
  /* How many printed figures really are the locality ones — the footer says so
     only when it is true of at least one line. */
  const localityLines = useMemo(
    () => lines.filter((l) => l.priced && fits.get(l.entry.key)?.which === 'locality').length,
    [lines, fits],
  );

  /* Holds a screen, like /ledger's placeholder, so the footer is never in view
     before the sheet or its empty state is (re-merge: CLS 0.35 at 1440 on an empty sheet). */
  if (entries === null) return <section className="step sheet-loading" aria-busy="true"><div className="wrap"><p className="sub">Loading your ledger…</p></div></section>;

  if (!allEntries || !allEntries.length) {
    /* PAGES DETAIL (2026-09-30): an empty sheet was a heading and a line on a
       900 px page. It is a real empty state now: an icon, the same two lines, a
       primary button to price a journey, and a sample sheet a person can see
       before they have one of their own. Re-merge (2026-10-01): the icon is now
       VISUAL's empty-sheet spot, light and dark, through ThemedImg. */
    return (
      <section className="step sheet-empty-wrap">
        <div className="wrap">
          <div className="sheet-empty">
            <ThemedImg light="/img/v2/empty-sheet.webp" dark="/img/v2/empty-sheet-dark.webp" width={480} height={435} alt="" className="sheet-empty-art" loading="eager" />
            <p className="eyebrow">Appointment sheet</p>
            <h1>There is no journey on this device yet</h1>
            <p className="sub">The sheet is built from the journey you describe on the home page. Nothing is stored anywhere but this browser.</p>
            <div className="sheet-empty-actions">
              <Link className="btn primary" href="/">Describe your journey</Link>
              <button
                type="button"
                className="btn ghost"
                onClick={() => { setExample(true); window.history.replaceState(null, '', '/sheet?example=1'); }}
              >See a sample sheet</button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const date = new Date(savedAt || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  /* The journey strip and the share bars read the same priced lines the table
     prints, in the same order: a picture of the rows, never a new number. */
  const stops: Stop[] = rows.map((l, i) => ({
    key: l.entry.key, n: i + 1, times: l.entry.times, priced: l.priced,
    label: l.entry.item ? shortUnit(l.entry.item.label)
      : (l.entry as JourneyEntry & { gapCategory?: string | null }).gapCategory ? 'Counted, never priced'
      : l.entry.raw === SHARED_NO_FIGURE ? 'No federal figure' : stopWords(saidQuote(l.entry.raw ?? ''), hideWords, 'No federal figure'),
  }));
  const share = (n: number) => (sum.totalUsd > 0 ? Math.max(1.5, Math.min(100, (n / sum.totalUsd) * 100)) : 0);

  return (
    <section className="step sheet">
      <div className="wrap sheet-desk">
        <SheetRail />

        <div className="sheet-stage">
        <details className="sheet-redact no-print" data-testid="sheet-redact" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) setRedactOpen(true); }}>
          <summary>Hide before sharing{nHidden > 0 || hideWords ? ` · ${[nHidden > 0 ? `${nHidden} ${nHidden === 1 ? 'line' : 'lines'} hidden` : null, hideWords ? 'your words hidden' : null].filter(Boolean).join(' · ')}` : ''}</summary>
          {redactOpen && (
            <Suspense fallback={<p className="rd-note">Loading your lines…</p>}>
              <RedactList entries={allEntries} hidden={hidden} onToggle={(k) => setHidden((h) => toggled(h, k))} hideWords={hideWords} onWords={setHideWords} />
            </Suspense>
          )}
        </details>
        {/* judge panel 15 Oct #2.2: the home example on the ledger is a sample sheet too. */}
        {(example || !!st.example) && (
          <p className="sheet-sample no-print">
            <b>Sample sheet.</b> An example journey, priced from the same published figures. <Link href="/">Describe your own</Link>
          </p>
        )}
        <article className="sheet-paper" aria-labelledby="sheet-h1">
        <header className="sheet-head">
          <p className="sheet-kicker"><span className="sheet-mark" aria-hidden="true" />Appointment sheet</p>
          {/* FLOW5 flow5-3: a child's sheet names the child, as the Brief does. */}
          <h1 id="sheet-h1">{sw.title}</h1>
          <p className="sheet-meta">Prepared {date} with Waypoint Ledger · every figure is published U.S. federal data, cited below</p>
          {/* FINAL-1011 listen: the sheet read aloud from the figures printed below (lib/speech.ts ledgerScript). */}
          <ListenButton what="this sheet" script={() => ledgerScript({
            label: labels.primary, totalUsd: sum.totalUsd, pricedCount: sum.pricedCount, searched,
            /* B-7 after B-1: the summable:false figure is said beside the total, as printed. */
            beside: besideSentence(sum.beside),
            lines: rows.filter((l) => !sum.beside.includes(l)).map((l) => {
              const gap = (l.entry as JourneyEntry & { gapCategory?: string | null }).gapCategory;
              return spokenLineOf(l, l.entry.item ? fits.get(l.entry.key) : undefined, { countedAs: gap ? gapLabel(gap) : null });
            }),
            searchingFor: counted.months > 0 ? monthsPhrase(counted.months) : null,
            namedUnpriced: counted.named,
            agencies: [...new Set(lines.filter((l) => l.entry.item).map((l) => agencyOf(l.entry.item!)))],
            tableVersion: TABLE_VERSION,
          })} />
        </header>

        <div className="sheet-total">
          <div className="st-main">
            <p className="total-label">{labels.primary}</p>
            <p className="total-num">{usd(sum.totalUsd)}</p>
            {/* judge panel 15 Oct #2.1: a summable:false figure is printed beside the total, never in it. */}
            {sum.beside.length > 0 && <p className="sheet-searched" data-testid="sheet-beside">{besideSentence(sum.beside)}.</p>}
            {searched && (() => { const [a, f, b] = splitFrom(searched); return <p className="sheet-searched">{a}{f && <span className="core-searched-from">{f}</span>}{b}</p>; })()}
          </div>
          <dl className="st-counts">
            <div><dt>Priced {sum.pricedCount === 1 ? 'line' : 'lines'}</dt><dd>{sum.pricedCount}</dd></div>
            {noFigureLines > 0 && <div><dt>No published price</dt><dd>{noFigureLines}</dd></div>}
            {nHidden > 0 && <div><dt>Hidden by you</dt><dd>{nHidden}</dd></div>}
          </dl>
          {nHidden > 0 && <p className="st-hidden" data-testid="sheet-hidden-note">{hiddenNote(nHidden)}</p>}
          {/* nothing missing is a statement, never a zero: the ledger's own words */}
          {noFigureLines === 0 && <p className="st-all">Every visit and test carries a published federal figure</p>}
          <p className="sheet-total-note">
            {ctx.coverage || loc ? `Priced for ${[ctx.coverage ? COVERAGE_LABEL[ctx.coverage].toLowerCase() + ' coverage' : null, loc ? loc.displayName : null].filter(Boolean).join(', ')}. ` : ''}
            These are published prices for this pattern of care, not a bill and not a claim.
          </p>
        </div>

        {/* 🔴 THE NUMBER LEADS; THE SENTENCE FOLLOWS IT.
            This sentence used to be the total's own label, so the largest figure
            on a sheet a person hands a clinician arrived wearing an instruction.
            It is the same sentence, relocated under the number as small type. */}
        {!ctx.coverage && (
          <p className="sheet-fit no-print">
            Medicare reference &middot; {loc ? loc.displayName : 'national'}. Say who pays for {sw.whose} care and
            every line will say whether that figure describes {who}.
          </p>
        )}

        {tally.length > 0 && (
          <p className="sheet-fit">
            <strong>Does the published figure describe {who}:</strong>{' '}
            {tally.map(([v, n]) => tallyPhrase(v, n, who)).join(' · ')}.{tally.length > 1 ? ' Each line says which it is, under its own figure.' : ''}
          </p>
        )}

        {notes.length > 0 && !hideWords && (
          <section className="sheet-words" aria-labelledby="sheet-words-h">
            <h2 id="sheet-words-h">In my own words</h2>
            <p className="sheet-words-note">Printed as I said it, in order. Not priced.</p>
            <ul>
              {notes.map((e) => <li key={e.key}>{e.raw}</li>)}
            </ul>
          </section>
        )}

        {stops.length > 1 && <JourneyStrip stops={stops} />}

        <table className="sheet-table">
          {/* the figure's basis, said once in full where the narrow header column cannot hold it;
              the header keeps it too, for a screen reader, so this line is not read twice */}
          {oneLabel && <caption className="sheet-basis" aria-hidden="true">Published figure: {oneLabel}</caption>}
          <thead>
            <tr>
              <th scope="col">What happened</th>
              <th scope="col">{oneAgency ? `Unit of care (${oneAgency})` : 'Unit of care'}</th>
              <th scope="col" className="num">Times</th>
              <th scope="col" className="num">{oneLabel ? <>Published figure <span className="th-sub">({oneLabel})</span></> : 'Published figure'}</th>
              <th scope="col" className="num">Line total</th>
              {paid.any && <th scope="col" className="num">What I paid</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((l, i) => {
              const it = l.entry.item;
              const fit = it ? fits.get(l.entry.key) : undefined;
              const gap = (l.entry as JourneyEntry & { gapCategory?: string | null }).gapCategory;
              const pr = paid.any ? paidRowOf(l) : null;
              const pMath = pr ? paidArithmetic(l.entry, (n) => usd(n, true)) : null;
              return (
                <tr key={l.entry.key}>
                  <td><span className="sheet-n" aria-hidden="true">{i + 1}</span>{hideWords ? <em>hidden by you</em> : l.entry.raw || <em>from a shared link</em>}</td>
                  <td data-label="Unit of care">{it ? <>{oneAgency ? '' : `${agencyOf(it)} · `}{it.label}{it.code ? <>{' '}<span className="sheet-code sheet-unit-code">{it.code}</span></> : null}</> : gap ? <em>{gapLabel(gap)}: counted, never priced</em> : <em>not matched to a federal figure</em>}</td>
                  <td className="num" data-label="Times">{l.entry.times}</td>
                  {/* 🔴 ONE CELL CARRIES THE FIGURE, ITS BASIS AND WHETHER IT
                      DESCRIBES THIS PERSON. A sixth column spent 14% of the paper
                      width printing one repeated word; the same answer now sits
                      under the figure it is about, where a clinician reads it —
                      and only when the lines differ. Where every line carries the
                      same answer, the counted line above the table says it once
                      and no word is repeated down the page. */}
                  <td className="num" data-label="Published figure">
                    {it && l.priced && fit ? (oneLabel ? usd(fit.figureUsd, true) : `${usd(fit.figureUsd, true)} (${figureLabel(it, fit)})`) : '–'}
                    {fit?.figureNote ? <><br /><span className="sheet-code">{fit.figureNote}</span></> : null}
                    {fit && tally.length > 1 ? <><br /><span className="sheet-verdict">{fit.verdict}</span></> : null}
                  </td>
                  <td className="num" data-label="Line total">{l.priced ? <>{usd(l.totalUsd, true)}<span className="sheet-bar" aria-hidden="true"><i style={{ width: `${share(l.totalUsd ?? 0)}%` }} /></span></> : '–'}</td>
                  {pr && (
                    <td className="num" data-label="What I paid">
                      {pr.paidUsd === null ? '–' : <>
                        {usd(pr.paidUsd, true)}
                        {pMath ? <><br /><span className="sheet-paid-sub">{pMath}</span></> : null}
                        <br /><span className="sheet-paid-sub">{pr.gapUsd === null ? 'no federal figure to compare' : gapPhrase(pr.gapUsd, pr.figureName, (n) => usd(n, true))}</span>
                      </>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {paid.any && (
          <section className="sheet-paid" aria-labelledby="sheet-paid-h">
            <h2 id="sheet-paid-h">What I paid, beside the published figures</h2>
            <p className="sheet-paid-total">
              <span><b>I paid {usd(paid.paidUsd, true)}</b> on {paid.paidLines} {paid.paidLines === 1 ? 'line' : 'lines'}.</span>
              {paid.compared > 0 && paid.gapUsd !== null && (
                <span> On the {paid.compared === 1 ? 'one line that also carries' : `${paid.compared} lines that also carry`} a published figure, I paid {usd(paid.comparedPaidUsd, true)} against {usd(paid.comparedFederalUsd, true)}: a difference from the {paid.figureName} of {signedMoney(paid.gapUsd, (n) => usd(n, true))}.</span>
              )}
              {paid.noFigureLines > 0 && <span> {usd(paid.noFigurePaidUsd, true)} was for care with no federal figure.</span>}
            </p>
            <table className="sheet-table sheet-paid-roll">
              <thead><tr><th scope="col">Kind of care</th><th scope="col" className="num">I paid</th><th scope="col" className="num">The {paid.figureName}</th><th scope="col" className="num">Difference</th></tr></thead>
              <tbody>
                {paid.groups.map((g) => (
                  <tr key={g.key}>
                    <td>{g.label} ({g.lines} {g.lines === 1 ? 'line' : 'lines'})</td>
                    <td className="num" data-label="I paid">{usd(g.paidUsd, true)}</td>
                    <td className="num" data-label={`The ${paid.figureName}`}>{g.compared ? usd(g.federalUsd, true) : 'none'}</td>
                    <td className="num" data-label="Difference">{g.gapUsd === null ? '–' : signedMoney(g.gapUsd, (n) => usd(n, true))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="sb-note">These are my own figures. They are not added to the published total above, and the difference is counted only on lines that carry both.</p>
          </section>
        )}

        {(burdenList.length > 0 || !counted.empty) && (
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

            {!counted.empty && (
              <section className="sheet-gaps" aria-labelledby="sheet-gaps-h">
                <h3 id="sheet-gaps-h">Counted, never priced</h3>
                <ul>
                  {counted.months > 0 && (
                    <li><span className="sb-count">{monthsPhrase(counted.months)}</span>: {gapLabel('time-searching')}. {gapWhy('time-searching')}</li>
                  )}
                  {counted.cats.map(([id, c]) => (
                    <li key={id}>
                      {id === NO_FIGURE
                        ? <><span className="sb-count">{c.lines}</span>: {gapLabel(id)}. {gapWhy(id)}</>
                        : <><span className="sb-count">{c.times}</span>: {gapLabel(id)}
                          {c.lines !== c.times ? ` (${c.lines} ${c.lines === 1 ? 'line' : 'lines'})` : ''}. {gapWhy(id)}</>}
                    </li>
                  ))}
                  {counted.named.length > 0 && (
                    <li><span className="sb-count">{counted.named.length}</span>: real costs with no defensible federal figure: {counted.named.join(' · ')}. Left blank rather than estimated.</li>
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
                Workdays, unpaid care hours, hours on the phone and paperwork, trips and dismissals are counted on <Link href="/ledger">your ledger</Link>; whatever you enter there prints here.
              </p>
            )}
          </section>
        )}

        <div className="sheet-cols">
          <section>
            {/* 🔴 MY QUESTIONS ABOUT WHAT COMES NEXT (R3 clinician C06). The old three
                asked the doctor to second-guess colleagues ("which would you have
                ordered first"), which puts a clinician on the defensive. */}
            <h2>Three questions I want to ask today</h2>
            <ol className="sheet-q">
              <li>What do my results so far rule out, and what is still open?</li>
              <li>What is the next step, and who should I see for it?</li>
              <li>What should I write down or bring before that next visit?</li>
            </ol>
          </section>
          <section>
            <h2>Where every figure comes from</h2>
            <ol className="sheet-src">
              {/* the scheme adds a line per source on paper and nothing a reader needs */}
              {sourceRows.map((r) => <li key={r.key}>{r.title}{r.refs.length ? ` (with source ${r.refs.join(', ')})` : ''}{r.url ? <>: <span className="sheet-url">{r.url}</span></> : null}</li>)}
            </ol>
          </section>
        </div>

        {/* Federal help the person may not know about (ASKS rows 11, 33, 35). No dollar
            figures; every sentence read in two federal sources. See components/HelpThatExists. */}
        <HelpThatExists />

        <p className="sheet-foot">
          {loc && localityLines > 0
            ? `${localityLines} of the ${lines.length} ${lines.length === 1 ? 'line' : 'lines'} here carry the CMS allowed amount CMS publishes for ${loc.displayName} under the CY2026 formula; the rest carry the figure named in their own row, and each says which.`
            : 'Each figure is labelled with what it is: a Medicare allowed amount, an average submitted charge, or a survey average across everyone in the source population. Nothing here is a bill.'}
          {' '}{tally.length > 1 ? 'Under each published figure' : 'The counted line above the table'} says whether the published figure describes this person, is a reference price, is what an uninsured person is billed against, or describes someone else entirely.
          Not a diagnosis, not treatment advice, not medical records. waypointledger.org · Precision Federal.
        </p>
        </article>
        </div>
      </div>
    </section>
  );
}

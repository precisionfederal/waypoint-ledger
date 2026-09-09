'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ITEMS, UNPRICEABLE, useStore } from '@/lib/store';
import { basisWarning, priceJourney, totals, usd } from '@/lib/pricing';
import { TABLE_VERSION, checkCombination, bundlingNote } from '@/lib/table';
import { CATEGORIES, categoryKey, categoryOf } from '@/lib/categories';
import type { PriceItem, PricedLine } from '@/lib/types';
import LineDrawer, { BASIS_NAME } from './LineDrawer';
import SiteOfService from './SiteOfService';
import ContextBar from './ContextBar';
import BurdenLedger from './BurdenLedger';
import TotalReveal, { TotalComparison } from './TotalReveal';
import ShareCard from './ShareCard';
import { shareCardData } from './JourneyBuilder';
import { forgetSavedJourney } from '@/lib/auth-client';
import { YearAheadCard } from './ConditionPicker';
import { useCondition } from '@/lib/conditions';
import { gapSummary, monthsPhrase, odysseyLine } from '@/lib/sheet';
import { siteOfServiceFinding } from '@/lib/site-of-service';
import { toFhirBundle } from '@/lib/fhir';
import { EMPTY_BURDENS, loadBurdens, type BurdenCounts } from '@/lib/burdens';
import { Icon } from './Icons';
import {
  LOCALITIES, MEDICAID_LINK_COUNT, agencyOf, agencyTally, everyLineUndescribed, fitOf,
  hasLocalityFigures, localityFigure, localityOf, medicaidFeeScheduleFor, medicaidProgramFor,
  noFigureCopy, scheduleFigureOf, totalLabels,
  type Fit, type FitVerdict, type MedicaidFeeSchedule, type NoFigureCopy,
} from '@/lib/fit';
import cs from './ContextBar.module.css';

/* One typographic mark per row, not three filled pills. The glyph carries the
   verdict at a glance and the words carry it exactly; both are the verdict's own
   colour, and neither is a badge. */
const FIT_MARK: Record<FitVerdict, { cls: string; glyph: string }> = {
  'DESCRIBES YOU': { cls: 'fm-you', glyph: '✓' },
  'REFERENCE PRICE': { cls: 'fm-ref', glyph: '≈' },
  'BILLED AGAINST THIS': { cls: 'fm-billed', glyph: '↑' },
  'NOT DESCRIBED': { cls: 'fm-none', glyph: '✗' },
};

/* What CMS publishes for this same code across all 109 localities. Read from the
   published locality file through lib/fit; nothing here is computed or averaged. */
function localityRange(itemId: string): { low: number; high: number } | null {
  if (!hasLocalityFigures(itemId)) return null;
  let low = Infinity, high = -Infinity;
  for (const l of LOCALITIES) {
    const v = localityFigure(itemId, l.key);
    if (v === null) continue;
    if (v < low) low = v;
    if (v > high) high = v;
  }
  return Number.isFinite(low) && high > low ? { low, high } : null;
}

/** The day an anonymous saved copy stops opening, in the reader's own locale. */
function expiryDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}


export default function Ledger() {
  const st = useStore();
  const [detail, setDetail] = useState<PriceItem | null>(null);
  const [askPaid, setAskPaid] = useState<string | null>(null);
  const [paid, setPaid] = useState('');
  const [copied, setCopied] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [savedCopied, setSavedCopied] = useState(false);
  /* Shown once, never stored on a server: the only key to this saved copy. */
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [savedExpires, setSavedExpires] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  /* 🔴 THE KEYBOARD GOES BACK WHERE IT CAME FROM.
     Dialog restores focus to the node it saved on open, guarded by
     document.contains — and the ledger row re-renders while the drawer is up,
     so that node is gone by the time it tries and focus falls to BODY. The
     ledger owns the trigger, so the ledger owns the restore: it remembers WHICH
     LINE was opened, not which DOM node, and focuses that line's button after
     the re-render has landed. */
  const openerKey = useRef<string | null>(null);
  const [burdens, setBurdens] = useState<BurdenCounts>(EMPTY_BURDENS);
  useEffect(() => { setBurdens(loadBurdens()); }, []);

  const ctx = st.ctx;
  const loc = localityOf(ctx.locality);
  /* One fit per line: which published figure describes THIS person, or none. */
  const fits = useMemo(() => {
    const m = new Map<string, Fit>();
    for (const e of st.entries) if (e.item) m.set(e.key, fitOf(e.item, ctx));
    return m;
  }, [st.entries, ctx]);
  const lines = useMemo(
    () => priceJourney(st.entries, (e) => (e.item ? fits.get(e.key)?.figureUsd ?? null : undefined)),
    [st.entries, fits],
  );
  const sum = useMemo(() => totals(lines), [lines]);
  /* When the person is uninsured the headline becomes the charge stack, and the
     allowed-amount stack is shown BESIDE it — never added to it. */
  const twoTotals = ctx.coverage === 'uninsured';
  const otherLines = useMemo(
    () => (twoTotals ? priceJourney(st.entries, (e) => (e.item ? scheduleFigureOf(e.item, ctx) : undefined)) : []),
    [twoTotals, st.entries, ctx],
  );
  const otherSum = useMemo(() => totals(otherLines), [otherLines]);
  const labels = useMemo(() => totalLabels(ctx), [ctx]);
  const notDescribed = useMemo(() => [...fits.values()].filter((f) => f.offerGap).length, [fits]);

  /* 🔴 MEDICAID IS NOT A $0 PRODUCT.
     When not one line carries a figure that describes this person, a total is a
     statement about our data, not about their care — so it is suppressed and the
     bracket takes its place. Both ends are published figures from the same rows,
     each shown only when EVERY line carries one, because half a stack compared
     with a whole one is the mistake this product exists to refuse. */
  const suppressed = useMemo(() => everyLineUndescribed([...fits.values()]), [fits]);
  const itemLines = useMemo(() => st.entries.filter((e) => e.item).length, [st.entries]);
  const noFig = useMemo(() => (suppressed ? noFigureCopy(ctx, itemLines) : null), [suppressed, ctx, itemLines]);
  const refLines = useMemo(
    () => (suppressed ? priceJourney(st.entries, (e) => (e.item ? fits.get(e.key)?.reference?.floorUsd ?? null : undefined)) : []),
    [suppressed, st.entries, fits],
  );
  const refSum = useMemo(() => totals(refLines), [refLines]);
  const ceilLines = useMemo(
    () => (suppressed ? priceJourney(st.entries, (e) => (e.item ? fits.get(e.key)?.reference?.ceilingUsd ?? null : undefined)) : []),
    [suppressed, st.entries, fits],
  );
  const ceilSum = useMemo(() => totals(ceilLines), [ceilLines]);
  const floorUsd = suppressed && refSum.pricedCount === itemLines && itemLines > 0 ? refSum.totalUsd : null;
  const ceilingUsd = suppressed && ceilSum.pricedCount === itemLines && itemLines > 0 ? ceilSum.totalUsd : null;
  const feeSchedule = useMemo(() => medicaidFeeScheduleFor(loc?.state), [loc]);
  const program = useMemo(() => medicaidProgramFor(loc?.state), [loc]);
  const [countingGaps, setCountingGaps] = useState(false);
  const [gapsCounted, setGapsCounted] = useState(false);

  /* 🔴 A LENGTH OF TIME IS NOT A UNIT OF CARE, AND CARE THAT DID NOT HAPPEN IS
     NEVER PRICED. The mapper refuses those phrases and returns the counter they
     belong in; this is where the ledger prints that answer instead of a dash.
     Read defensively: an older mapper simply yields no hint. */
  const gapHints = useMemo(
    () => new Map(st.gapHints.map((h) => [h.key, h])),
    [st.gapHints],
  );
  const agencies = useMemo(() => agencyTally(st.entries.map((e) => e.item)), [st.entries]);
  const localityLines = useMemo(() => [...fits.values()].filter((f) => f.which === 'locality').length, [fits]);
  const warn = useMemo(() => basisWarning(sum.basesUsed), [sum.basesUsed]);
  const ids = useMemo(() => st.entries.map((e) => e.item?.id).filter((x): x is string => !!x), [st.entries]);
  const combo = useMemo(() => checkCombination(ids), [ids]);
  const bundle = useMemo(() => bundlingNote(ids), [ids]);

  const groups = useMemo(() => {
    const m = new Map<string, PricedLine[]>();
    for (const l of lines) { const k = l.entry.item ? categoryKey(l.entry.item) : 'unmatched'; (m.get(k) ?? m.set(k, []).get(k)!).push(l); }
    return CATEGORIES.map((c) => ({ cat: c, lines: m.get(c.key) ?? [] })).filter((g) => g.lines.length)
      .concat(m.get('unmatched')?.length ? [{ cat: { key: 'unmatched', label: 'No federal figure matched', short: 'Unmatched', hint: '' }, lines: m.get('unmatched')! }] : []);
  }, [lines]);
  /* The same sentence under nine identical lines is noise, not information.
     A fit sentence is printed the first time it appears in the table and not again. */
  const showWhy = useMemo(() => {
    const seen = new Set<string>(); const keys = new Set<string>();
    for (const g of groups) for (const l of g.lines) {
      const w = fits.get(l.entry.key)?.why;
      if (!w || seen.has(w)) continue;
      seen.add(w); keys.add(l.entry.key);
    }
    return keys;
  }, [groups, fits]);
  const chart = useMemo(() => groups.filter((g) => g.cat.key !== 'unmatched').map((g) => ({ label: g.cat.label, total: g.lines.reduce((a, l) => a + (l.totalUsd ?? 0), 0), n: g.lines.reduce((a, l) => a + l.entry.times, 0) })).filter((r) => r.total > 0).sort((a, b) => b.total - a.total), [groups]);
  const max = Math.max(1, ...chart.map((c) => c.total));
  const wrong = Object.values(st.flags).filter((v) => v === 'wrong').length;
  /* 🔴 THE YEAR-AHEAD FIGURE IS THE ONE THIS PERSON CHOSE, AND ONLY WHEN IT CAN
     HONESTLY BE SET BESIDE AN ITEMIZED TOTAL. `excess` means spending over a
     comparable adult without the condition, which is what the band compares;
     a `condition_attributed` total already IS everything spent in the year and
     comparing it with an itemized stack is the two-bases error. That one still
     prints, alone, in the card below. Nothing is shown when nothing is chosen. */
  const yearAhead = useCondition().benchmark;
  const yearAheadFigure = yearAhead && yearAhead.kind === 'figure' && yearAhead.figureKind === 'excess'
    && yearAhead.low !== null && yearAhead.high !== null
    ? {
      point: yearAhead.point, low: yearAhead.low, high: yearAhead.high,
      year: Number(yearAhead.year), population: yearAhead.population, source: yearAhead.sourceTitle,
    } : null;
  /* The person's own words, joined, for the year-ahead invitation. Read on this
     device only: it is already what the ledger is made of, and it is not sent. */
  const typedWords = useMemo(() => st.entries.map((e) => e.raw).join(' · '), [st.entries]);
  /* The card people post carries exactly what the share link carries. */
  const card = useMemo(() => shareCardData(lines, st.entries.length, st.unpricedHits.length), [lines, st.entries.length, st.unpricedHits.length]);
  const appointments = st.entries.reduce((a, e) => a + e.times, 0);

  /* 🔴 THE ODYSSEY LEADS.
     The mapper already returns months: 48 for "four years of appointments" and
     refuses to price it; the sheet already prints it. The ledger threw it away
     and put a zero of our own — "Corrections you sent 0" — on the money screen
     instead. Four years of a person's life is the argument; $2,049 is the
     evidence. Every clause below is a real count and is dropped when it is
     zero, so this line is either true or absent. */
  const gaps = useMemo(
    () => gapSummary(st.entries, st.unpricedHits.map((id) => UNPRICEABLE.find((u) => u.id === id)?.label).filter((x): x is string => Boolean(x))),
    [st.entries, st.unpricedHits],
  );
  const odyssey = useMemo(
    () => odysseyLine({ months: gaps.months, appointments, cats: gaps.cats }),
    [gaps, appointments],
  );
  const sos = useMemo(() => siteOfServiceFinding(), []);
  const burdensEntered = burdens.workdays > 0 || burdens.careHours > 0 || burdens.trips > 0 || burdens.dismissed > 0;

  /* Three stat cards beside the total, in the order that argues: time first. */
  const stats: { lbl: string; val: string; sub: ReactNode }[] = [];
  if (gaps.months > 0) stats.push({ lbl: 'Time spent searching', val: monthsPhrase(gaps.months), sub: 'counted, never priced' });
  stats.push({ lbl: 'Steps in your journey', val: String(appointments), sub: `${st.entries.length} distinct` });
  stats.push({ lbl: 'Without a federal figure', val: String(sum.unpricedCount + st.unpricedHits.length), sub: 'shown blank, never guessed' });
  if (wrong > 0) stats.push({ lbl: 'Corrections you sent', val: String(wrong), sub: <Link href="/signal">see the running count</Link> });

  if (!st.hydrated) return <div className="wrap"><p className="micro">Loading your ledger…</p></div>;
  if (!st.entries.length) {
    return (
      <section className="empty card">
        <h2>Your ledger is empty</h2>
        <p>Describe your diagnostic journey in your own words and every step becomes a priced, cited line.</p>
        <div className="row"><Link className="btn primary" href="/journey">Price a journey <Icon.Arrow /></Link><button className="btn ghost" onClick={st.loadExample}>See a worked example</button></div>
      </section>
    );
  }

  async function saveAndShare() {
    const r = await st.saveJourney();
    if (r.ok && r.url) {
      setSavedUrl(r.url); setSavedCode(r.deleteToken ?? null); setSavedExpires(r.expiresAt ?? null); setSavedSlug(r.slug ?? null);
      void copyText(r.url).then((ok) => { if (ok) { setSavedCopied(true); setTimeout(() => setSavedCopied(false), 2000); } });
    }
  }
  async function copyCode() {
    if (!savedCode) return;
    if (await copyText(savedCode)) { setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }
    else st.toast('Copying is blocked in this browser. Select the code and copy it.', 'warn');
  }
  async function forgetSaved() {
    if (!savedSlug || !savedCode) return;
    try {
      await forgetSavedJourney(savedSlug, savedCode);
      setSavedUrl(null); setSavedCode(null); setSavedExpires(null); setSavedSlug(null);
      st.toast('That saved copy is gone. The link no longer opens anything.', 'ok');
    } catch {
      st.toast('Could not remove the saved copy. Nothing was changed.', 'warn');
    }
  }
  async function copySaved() {
    if (!savedUrl) return;
    if (await copyText(savedUrl)) { setSavedCopied(true); setTimeout(() => setSavedCopied(false), 2000); }
    else st.toast('Copying is blocked in this browser. Select the link and copy it.', 'warn');
  }
  async function share() {
    try { await navigator.clipboard.writeText(st.shareUrl()); setCopied(true); st.toast('Link copied. It carries only the units and counts, no names.', 'ok'); setTimeout(() => setCopied(false), 2000); }
    catch { st.toast(st.shareUrl(), 'info'); }
  }
  function csv() {
    const rows = [['what_you_said', 'unit_of_care', 'code', 'agency', 'times', 'national_figure_usd', 'figure_shown_usd', 'figure_shown_is', 'fit_verdict', 'reference_floor_usd', 'reference_ceiling_usd', 'counted_not_priced_as', 'basis', 'year', 'line_total_usd', 'source_title', 'source_url']];
    for (const l of lines) {
      const it = l.entry.item; const fit = fits.get(l.entry.key); const hint = gapHints.get(l.entry.key);
      rows.push([l.entry.raw, it?.label ?? '', it?.code ?? '', it ? agencyOf(it) : '', String(l.entry.times),
        it?.valueUsd?.toFixed(2) ?? '', fit?.figureUsd?.toFixed(2) ?? '', fit?.which ?? '', fit?.verdict ?? '',
        fit?.reference?.floorUsd?.toFixed(2) ?? '', fit?.reference?.ceilingUsd?.toFixed(2) ?? '', hint?.label ?? '',
        it?.basis ?? '', it?.year ?? '', l.totalUsd?.toFixed(2) ?? '', it?.sourceTitle ?? '', it?.sourceUrl ?? '']);
    }
    dl('waypoint-ledger.csv', rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  }
  function fhir() {
    const { bundle } = toFhirBundle(st.entries, ITEMS, {
      tableVersion: TABLE_VERSION,
      figureFor: (e) => {
        const f = e.item ? fits.get(e.key) : undefined;
        if (!f) return undefined;
        // The CY2024 submitted charge is published without a file of its own, so
        // that line cites none rather than citing the fee schedule it is not from.
        return { usd: f.figureUsd, note: f.figureNote, source: f.which === 'charge' ? null : undefined };
      },
    });
    dl('waypoint-ledger-fhir.json', JSON.stringify(bundle, null, 2), 'application/fhir+json');
  }
  function json() {
    dl('waypoint-ledger.json', JSON.stringify({
      generated: new Date().toISOString(),
      priceTableVersion: TABLE_VERSION,
      context: { coverage: ctx.coverage ?? null, locality: loc ? { key: loc.key, name: loc.displayName, state: loc.state } : null },
      totals: suppressed && noFig ? {
        label: noFig.headline, totalUsd: null, totalSuppressed: true,
        whySuppressed: noFig.body,
        referenceFloorUsd: floorUsd, referenceFloorIs: 'Medicare allowed amount for the same services — a reference, not this person\u2019s rate',
        referenceCeilingUsd: ceilingUsd, referenceCeilingIs: ceilingUsd !== null ? 'Average charge providers submitted for the same services, CY2024 — a ceiling, not this person\u2019s rate' : null,
        stateFeeSchedule: feeSchedule ? { state: feeSchedule.state, program: feeSchedule.program, url: feeSchedule.url, verifiedOn: feeSchedule.verifiedOn } : null,
        pricedLines: 0, unpricedLines: sum.unpricedCount, linesWithNoFigureForYou: notDescribed,
      } : {
        label: labels.primary, totalUsd: sum.totalUsd,
        ...(labels.secondary ? { secondLabel: labels.secondary, secondTotalUsd: otherSum.totalUsd } : {}),
        pricedLines: sum.pricedCount, unpricedLines: sum.unpricedCount, linesWithNoFigureForYou: notDescribed,
      },
      lines: lines.map((l) => {
        const f = fits.get(l.entry.key);
        return {
          said: l.entry.raw, times: l.entry.times, lineTotalUsd: l.totalUsd,
          agency: l.entry.item ? agencyOf(l.entry.item) : null,
          fit: f ? { verdict: f.verdict, why: f.why, figureUsd: f.figureUsd, figureIs: f.which, figureNote: f.figureNote } : null,
          unit: l.entry.item,
        };
      }),
    }, null, 2), 'application/json');
  }
  function brief() {
    const L = ['WHAT ONE DIAGNOSTIC SEARCH COST', 'Prepared with Waypoint Ledger. Every figure below is published federal data.', ''];
    for (const l of lines) {
      if (!l.priced) { L.push(`· ${l.entry.raw} ×${l.entry.times} — ${fits.get(l.entry.key)?.offerGap ? 'NO PUBLISHED FEDERAL FIGURE DESCRIBES THIS PERSON' : 'NO FEDERAL FIGURE EXISTS'}`); continue; }
      const it = l.entry.item!;
      const fit = fits.get(l.entry.key);
      L.push(`· ${agencyOf(it)} — ${it.label} ×${l.entry.times} — ${usd(l.totalUsd)} (${BASIS_NAME[it.basis]}, ${it.year})`,
        ...(fit?.figureNote ? [`    ${fit.figureNote}`] : []),
        `    ${it.sourceTitle}`, `    ${it.sourceUrl}`, '');
    }
    if (suppressed && noFig) {
      L.push(noFig.headline.toUpperCase(), noFig.body);
      if (floorUsd !== null) L.push(`REFERENCE FLOOR: ${usd(floorUsd)} — what Medicare allows for the same services. Not this person's rate.`);
      if (ceilingUsd !== null) L.push(`REFERENCE CEILING: ${usd(ceilingUsd)} — average charge providers submitted, CY2024. Not this person's rate.`);
      if (feeSchedule) L.push(`THE RATE IS PUBLISHED BY THE STATE: ${feeSchedule.program} — ${feeSchedule.url} (address checked ${feeSchedule.verifiedOn})`);
    } else {
      L.push(`${labels.primary.toUpperCase()}: ${usd(sum.totalUsd)}`);
      if (labels.secondary) L.push(`${labels.secondary.toUpperCase()}: ${usd(otherSum.totalUsd)} — shown beside it, never added.`);
    }
    L.push(`Priced lines: ${sum.pricedCount} · Lines with no federal figure: ${sum.unpricedCount}`, '', 'This is not a bill or a claim. It is what this pattern of care costs according to the', "federal government's own published data, itemized so every line can be checked.");
    dl('waypoint-brief.txt', L.join('\n'));
  }
  /* One tap files every undescribed line at once. Sequential, because each one
     is a separate row bound to its own published figure and the count refuses a
     second answer on the same figure from the same browser. */
  async function countAllGaps() {
    const seen = new Set<string>();
    const items: PriceItem[] = [];
    for (const e of st.entries) {
      if (!e.item || seen.has(e.item.id)) continue;
      if (!fits.get(e.key)?.offerGap) continue;
      seen.add(e.item.id); items.push(e.item);
    }
    if (!items.length) return;
    setCountingGaps(true);
    for (const it of items) await st.correct(it, 'wrong', null, 'not-described');
    setCountingGaps(false); setGapsCounted(true);
  }

  /* Open remembers the LINE; close focuses that line's button again, retrying
     across a few frames because the row re-renders underneath the drawer. */
  function openDetail(it: PriceItem, key: string) { openerKey.current = key; setDetail(it); }
  function closeDetail() {
    const k = openerKey.current;
    openerKey.current = null;
    setDetail(null);
    if (!k) return;
    let tries = 0;
    const land = () => {
      const el = [...document.querySelectorAll<HTMLElement>('[data-li-key]')].find((n) => n.dataset.liKey === k);
      if (el) { el.focus(); return; }
      if (tries++ < 3) requestAnimationFrame(land);
    };
    requestAnimationFrame(land);
  }

  function thumb(it: PriceItem, v: 'right' | 'wrong') {
    if (st.flags[it.id] === v) { st.clearFlag(it.id); setAskPaid(null); return; }
    if (v === 'wrong') { setAskPaid(it.id); setPaid(''); return; }
    void st.correct(it, 'right');
  }

  return (
    <div className="ledger">
      <ContextBar />

      <div className="sum-grid">
        {suppressed && noFig ? (
          <NoFigureTotal
            copy={noFig}
            lines={itemLines}
            floorUsd={floorUsd}
            ceilingUsd={ceilingUsd}
            feeSchedule={feeSchedule}
            program={program}
            askForState={ctx.coverage === 'medicaid' && !loc}
            busy={countingGaps}
            done={gapsCounted}
            onCountAll={countAllGaps}
          />
        ) : (
          <TotalReveal
            totalUsd={sum.totalUsd}
            pricedCount={sum.pricedCount}
            tableVersion={TABLE_VERSION}
            label={labels.primary}
          />
        )}
        {stats.slice(0, 3).map((c) => (
          <div className="sum-card" key={c.lbl}><p className="lbl">{c.lbl}</p><p className="mid-num">{c.val}</p><p className="micro">{c.sub}</p></div>
        ))}
      </div>

      {odyssey && <p className="odyssey" data-testid="odyssey">{odyssey}</p>}

      <TotalComparison
        totalUsd={suppressed ? null : twoTotals ? otherSum.totalUsd : sum.totalUsd}
        yearAhead={yearAheadFigure}
        basisNote={
          suppressed ? noFig?.insteadOfComparison ?? null
            : twoTotals
              ? `That ${usd(otherSum.totalUsd)} is the allowed-amount total for these lines. The ${usd(sum.totalUsd)} above is a stack of billed charges, and an excess measured in expenditures is never set beside a charge.`
              : null
        }
      />

      <div className={`ledger-strip ${cs.strip}`}>
        {loc && !twoTotals && (
          <p className="micro">Figures on this page are the CMS allowed amounts for {loc.displayName} under the CY2026 formula, wherever CMS publishes one for the code.</p>
        )}
        {labels.secondary && (
          <p className="micro"><strong>{usd(otherSum.totalUsd)}</strong> — {labels.secondary}. A charge and an allowed amount measure the same care two ways: shown side by side, never added.</p>
        )}
        {notDescribed > 0 && !suppressed && (
          <p className="micro">{notDescribed} {notDescribed === 1 ? 'line has' : 'lines have'} no published federal figure that describes you. Each one can be counted below.</p>
        )}
        {suppressed && (
          <p className="micro">No total is shown because no published federal figure describes any line on this page. The figures beside each line are references, and each says which.</p>
        )}
        {agencies.length > 0 && (
          <p className="micro">Sources in this ledger: {agencies.map((a) => `${a.agency} (${a.lines} ${a.lines === 1 ? 'line' : 'lines'})`).join(' · ')}</p>
        )}
        <p className="micro">Every line carries a thumb. What the public sends back is counted in the open — <Link href="/register">see the running count</Link>.</p>
      </div>

      <div className="apart-rule"><span>Beside the money · never added to it</span></div>

      {/* Four published rate tables before anyone has entered a count is a wall,
          not information. It opens by itself the moment there is a count in it. */}
      <details className="more-block" open={burdensEntered}>
        <summary>The burden no claims file records — missed workdays, unpaid care hours, trips, times you were dismissed</summary>
        <BurdenLedger />
      </details>

      {(warn || combo.conflicts.length || bundle) && (
        <div className="notice warn">
          {warn && <p>{warn}</p>}
          {combo.conflicts.map((c, i) => <p key={i}>{c.reason}</p>)}
          {bundle && <p>{bundle}</p>}
        </div>
      )}

      <div className="two-col">
        <section className="card">
          <p className="lbl" id="where-the-cost-sits">Where the cost sits</p>
          <div className="bars" role="list" aria-labelledby="where-the-cost-sits">
            {chart.map((c) => (
              <div key={c.label} className="bar-row" role="listitem">
                <span className="bar-l">{c.label}<small>{c.n} {c.n === 1 ? 'time' : 'times'}</small></span>
                <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${(c.total / max) * 100}%` }} /></span>
                <span className="bar-v">{usd(c.total)}</span>
              </div>
            ))}
          </div>
          <p className="micro">
            {loc
              ? `${localityLines} of these ${st.entries.length} ${st.entries.length === 1 ? 'line' : 'lines'} carry a figure CMS publishes for ${loc.displayName}. The rest use a national rate, and each says why on its own line.`
              : 'Medicare fee-schedule lines are allowed amounts. Choose your coverage and where you live above, and every line will say whether that figure describes you.'}
          </p>
        </section>
        {/* 🔴 A PAGE WITH AN END.
            Eight choices in one card is not generosity, it is an unfinished
            decision handed to the reader. One primary action, and everything
            else one click away and named. Nothing was deleted. */}
        <section className="card actions">
          <p className="lbl">Take it somewhere</p>
          <ShareCard data={{ ...card, url: st.shareUrl(), tableVersion: TABLE_VERSION, yearAhead: yearAheadFigure }} className="btn primary full" label="Save my card" />
          <p className="micro">An image drawn in this browser — the number, how long the search took, and where the cost sits. Nothing is uploaded to make it.</p>
          <details className="more-ways">
            <summary>More ways to use this</summary>
            <div className="mw-body">
          <Link className="btn ghost full" href="/sheet"><Icon.Sheet /> Make the appointment sheet</Link>
          <button className="btn ghost full" onClick={share}>{copied ? <Icon.Check /> : <Icon.Link />} {copied ? 'Copied' : 'Copy a share link'}</button>
          <button className="btn ghost full" onClick={saveAndShare} disabled={st.saving}>{st.saving ? 'Saving…' : <><Icon.Shield /> Save and share across devices</>}</button>
          {savedUrl && (
            <div className="saved-link">
              <label htmlFor="saved-url">Your saved ledger</label>
              <div className="row">
                <input id="saved-url" readOnly value={savedUrl} onFocus={(e) => e.currentTarget.select()} spellCheck={false} />
                <button className="btn small primary" type="button" onClick={copySaved}>{savedCopied ? 'Copied' : 'Copy'}</button>
              </div>
              <p className="micro">Opening this link anywhere loads these steps. It carries units and counts only — no name, no date, nothing you did not type.</p>
            </div>
          )}
          {savedCode && (
            <div className="saved-link">
              <label htmlFor="saved-code">Your delete code</label>
              <div className="row">
                <input id="saved-code" readOnly value={savedCode} onFocus={(e) => e.currentTarget.select()} spellCheck={false} />
                <button className="btn small" type="button" onClick={copyCode}>{codeCopied ? 'Copied' : 'Copy'}</button>
              </div>
              <p className="micro">
                Keep this delete code — it is the only way to remove this saved copy, and nobody here can look it up for you.
                {savedExpires ? ` It stops opening on its own on ${expiryDate(savedExpires)}.` : ''}
              </p>
              <button className="link-btn" type="button" onClick={forgetSaved}>Delete this saved copy now</button>
            </div>
          )}
          <div className="row"><button className="btn ghost" onClick={csv}><Icon.Download /> CSV</button><button className="btn ghost" onClick={json}><Icon.Download /> JSON</button><button className="btn ghost" onClick={fhir}><Icon.Download /> FHIR</button><button className="btn ghost" onClick={brief}><Icon.Download /> Brief</button></div>
          <Link className="link-btn" href="/journey">Edit my journey</Link>
            </div>
          </details>
        </section>
      </div>

      <section className="card table-card">
        <div className="table-scroll" tabIndex={0}>
          <table className="ledger-table">
            <caption className="sr-only">Every step of your journey, the unit of care it maps to, the published federal figure, the line total, and a control to say whether that figure describes you.</caption>
            <thead><tr><th scope="col">What happened</th><th scope="col" className="r">Times</th><th scope="col" className="r">Figure</th><th scope="col" className="r">Line total</th><th scope="col">Is this figure right?</th></tr></thead>
            {groups.map((g) => (
              <tbody key={g.cat.key}>
                <tr className="grp"><th colSpan={5} scope="colgroup">{g.cat.label}</th></tr>
                {g.lines.map((l) => {
                  const it = l.entry.item;
                  if (!it) {
                    const hint = gapHints.get(l.entry.key);
                    return (
                      <tr key={l.entry.key} className="is-unpriced">
                        <td>
                          <p className="li-name plain">{l.entry.raw}</p>
                          {hint ? (
                            <>
                              <p className="li-sub">{hint.reason}</p>
                              <p className={cs.why}>
                                It belongs in <b>{hint.label}</b>
                                {hint.months !== null && ` — ${hint.months} ${hint.months === 1 ? 'month' : 'months'}`}
                                , which is counted on the gap report and never priced.
                              </p>
                            </>
                          ) : (
                            <p className="li-sub">No published federal figure matched. <Link href="/journey">Choose a unit</Link> or leave it as a named, unpriced step.</p>
                          )}
                        </td>
                        <td className="r" data-label="Times">{l.entry.times}</td>
                        <td className="r" data-label="Figure">{hint ? <em>counted, never priced</em> : '—'}</td>
                        <td className="r total" data-label="Line total">—</td>
                        <td className="verdict">
                          {hint && <Link className={cs.gapBtn} href="/gap">Count it</Link>}
                        </td>
                      </tr>
                    );
                  }
                  const f = st.flags[it.id];
                  const fit = fits.get(l.entry.key);
                  return (
                    <tr key={l.entry.key}>
                      <td>
                        <button className="li-name" data-li-key={l.entry.key} onClick={() => openDetail(it, l.entry.key)}>{it.label}</button>
                        {fit && (
                          <span className={`fit-mark ${FIT_MARK[fit.verdict].cls}`}>
                            <span className="fm-g" aria-hidden="true">{FIT_MARK[fit.verdict].glyph}</span>{fit.verdict}
                          </span>
                        )}
                        <p className="li-sub"><span className={cs.agency}>{agencyOf(it)}</span>{' · '}<span className={`basis b-${it.basis}`}>{BASIS_NAME[it.basis]}</span>{' · '}you said “{l.entry.raw}” · {it.year}{it.code ? ` · ${it.code}` : ''} · {it.confidence === 'VERIFIED' ? 'read in the source' : 'derived from the source'}</p>
                        {fit && showWhy.has(l.entry.key) && <p className={cs.why}>{fit.why}</p>}
                        {fit?.offerGap && (
                          <button className={cs.gapBtn} type="button" onClick={() => { void st.correct(it, 'wrong', null, 'not-described'); }}>
                            Count this gap
                          </button>
                        )}
                      </td>
                      <td className="r" data-label="Times">{l.entry.times}</td>
                      <td className="r" data-label="Figure">
                        {fit && fit.figureUsd === null ? <em>No published federal figure describes you here</em> : usd(fit ? fit.figureUsd : it.valueUsd, true)}
                        {fit?.figureNote ? <span className={cs.subFig}>{fit.figureNote}</span> : null}
                        {fit?.reference && fit.reference.floorUsd !== null && (
                          <span className={cs.refFig}>
                            <b>{usd(fit.reference.floorUsd, true)}</b> — {fit.reference.floorLabel}
                            {fit.reference.ceilingUsd !== null && fit.reference.ceilingLabel && (
                              <><br /><b>{usd(fit.reference.ceilingUsd, true)}</b> — {fit.reference.ceilingLabel}</>
                            )}
                          </span>
                        )}
                        <LocalityRange itemId={it.id} loc={loc} shown={fit ? fit.figureUsd : it.valueUsd} which={fit?.which ?? 'schedule'} />
                      </td>
                      <td className="r total" data-label="Line total"><strong>{l.priced ? usd(l.totalUsd) : '—'}</strong></td>
                      <td className="verdict">
                        <div className="thumbs">
                          <button className={`thumb up ${f === 'right' ? 'on' : ''}`} aria-pressed={f === 'right'} aria-label={`This figure looks right for ${it.label}`} onClick={() => thumb(it, 'right')}><Icon.Up /> Right</button>
                          <button className={`thumb down ${f === 'wrong' ? 'on' : ''}`} aria-pressed={f === 'wrong'} aria-label={`This figure looks wrong for ${it.label}`} onClick={() => thumb(it, 'wrong')}><Icon.Down /> Wrong</button>
                        </div>
                        {askPaid === it.id && (
                          <form className="paid-form" onSubmit={(e) => { e.preventDefault(); const n = parseFloat(paid); void st.correct(it, 'wrong', Number.isFinite(n) && n >= 0 ? n : null); setAskPaid(null); }}>
                            <label htmlFor={`paid-${it.id}`}>What did you actually pay, if you know?</label>
                            <div className="row"><span className="cur">$</span><input id={`paid-${it.id}`} type="number" min={0} step="0.01" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0.00" autoFocus /><button className="btn small primary" type="submit">Send</button><button className="btn small ghost" type="button" onClick={() => { void st.correct(it, 'wrong', null); setAskPaid(null); }}>Skip</button></div>
                          </form>
                        )}
                        {st.queued[it.id] && f && <p className="micro">Waiting to send — it is held on this device until you are back online.</p>}
                        {st.sentOk[it.id] && !st.queued[it.id] && f && <p className="sent-ok"><Icon.Check /> Sent to the count</p>}
                        {st.tallies[it.id] && (
                          <p className="nth-back">
                            <span>You are the <b>{ordinal(st.tallies[it.id].n)}</b> person to answer on this figure.</span>
                            <span>{st.tallies[it.id].flaggedWrong} of {st.tallies[it.id].n} say it is wrong.</span>
                            <Link href="/register">See it on the register →</Link>
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      {st.unpricedHits.length > 0 && (
        <section className="card">
          <p className="lbl">Real costs with no defensible federal figure</p>
          <ul className="unpriced">
            {st.unpricedHits.map((id) => { const u = UNPRICEABLE.find((x) => x.id === id); if (!u) return null; return (
              <li key={id}><div><p className="li-name plain">{u.label}</p><p className="li-sub">{u.whyUnpriced}</p><p className="li-sub fix">What would fix it: {u.whatWouldFixIt}</p></div><span className="blank">blank</span></li>
            ); })}
          </ul>
        </section>
      )}

      {/* 🔴 The card no longer goes blank for a visitor who chose nothing. It is
          handed the person's own phrases so it can offer the published figure
          their words already name — conditionally worded, never assigned to
          them, and never written back as their choice. */}
      <YearAheadCard impliedFrom={typedWords} />

      {sos ? (
        <details className="more-block sos-fold">
          <summary>
            <b>{sos.line}</b> One code, CPT 99213, priced twice in the same year — open for both figures and what to ask.
          </summary>
          <SiteOfService />
        </details>
      ) : <SiteOfService />}

      <section id="act" className="acts-wrap">
        <p className="eyebrow">Step 3 of 3</p>
        <h2>A number nobody reads changes nothing</h2>
        <div className="acts">
          <article className="act-card"><span className="act-ic"><Icon.Sheet /></span><h3>Bring it to your next appointment</h3><p className="who">Your doctor · the next specialist</p><p>One printed page: every step so far, what each costs in the government&rsquo;s own figures, and three questions worth asking.</p><Link className="btn small primary" href="/sheet">Make the sheet</Link></article>
          <article className="act-card"><span className="act-ic"><Icon.Signal /></span><h3>Tell the government its figure is wrong</h3><p className="who">The agency that published the number</p><p>A correction is bound to the exact source row, so it can be routed to the agency that published it. <Link href="/signal">See the running count.</Link></p></article>
          <article className="act-card"><span className="act-ic"><Icon.Cite /></span><h3>Give it to your employer</h3><p className="who">HR · a benefits administrator · a leave request</p><p>An itemized, cited account of what a search for a diagnosis has cost is evidence in a conversation about accommodation or leave.</p><button className="btn small ghost" onClick={brief}>Build the brief</button></article>
          <article className="act-card"><span className="act-ic"><Icon.Shield /></span><h3>Count what no dataset counted</h3><p className="who">You, in two minutes</p><p>The care you needed and did not get produces no row in any federal file. Tell us how often, and rank which cost hurt most.</p><Link className="btn small ghost" href="/gap">Report the gap</Link></article>
        </div>
      </section>

      <LineDrawer item={detail} ctx={ctx} onClose={closeDetail} />

      <div className="mobile-bar">
        <div>
          <span className="mb-total">{suppressed ? 'No federal figure' : usd(sum.totalUsd)}</span>
          <span className="mb-sub">{appointments} {appointments === 1 ? 'appointment' : 'appointments'}</span>
          <span className="mb-sub mb-distinct">{st.entries.length} distinct {st.entries.length === 1 ? 'line' : 'lines'}</span>
        </div>
        <ShareCard data={{ ...card, url: st.shareUrl(), tableVersion: TABLE_VERSION, yearAhead: yearAheadFigure }} className="btn primary" label="Save my card" />
      </div>
    </div>
  );
}

/**
 * 🔴 WHAT STANDS WHERE THE TOTAL WOULD HAVE BEEN.
 *
 * Medicaid covers roughly 79 million people and is over-represented in exactly
 * the population this tool is built for. Every Medicare row comes back NOT
 * DESCRIBED for them, correctly — and the old page then printed "$0 across 0
 * priced lines", which reads as "your care was free" and is the single worst
 * sentence this product could show its largest audience.
 *
 * So the total is suppressed and this card takes the space: the reason, the two
 * published figures that bracket the answer (each shown only when every line
 * carries one), the person's own state fee schedule — which is where their rate
 * is actually published — and one control that files the whole gap at once.
 * Nothing here is a rate, and nothing here is summed into anything else.
 */
function NoFigureTotal({ copy, lines, floorUsd, ceilingUsd, feeSchedule, program, askForState, busy, done, onCountAll }: {
  copy: NoFigureCopy;
  lines: number;
  floorUsd: number | null;
  ceilingUsd: number | null;
  feeSchedule: MedicaidFeeSchedule | null;
  program: { stateName: string; program: string } | null;
  askForState: boolean;
  busy: boolean;
  done: boolean;
  onCountAll: () => void;
}) {
  return (
    <div className={`sum-card main ${cs.nofig}`}>
      <p className="lbl">{copy.headline}</p>
      <p className={cs.nofigBody}>{copy.body}</p>
      {(floorUsd !== null || ceilingUsd !== null) && (
        <div className={cs.bracket}>
          {floorUsd !== null && (
            <p><b>{usd(floorUsd)}</b><span>Reference price, not your rate — what Medicare allows for the same {lines} {lines === 1 ? 'line' : 'lines'}</span></p>
          )}
          {ceilingUsd !== null && (
            <p><b>{usd(ceilingUsd)}</b><span>What providers billed on average for the same care, CY2024 — a ceiling, not your rate</span></p>
          )}
        </div>
      )}
      {feeSchedule ? (
        <p className={cs.nofigLink}>
          <a href={feeSchedule.url} target="_blank" rel="noopener noreferrer">
            Open the {feeSchedule.program} fee schedule <Icon.External />
          </a>
          <span className="micro">
            Your rate is published by {feeSchedule.stateName}, not by the federal government. Address
            checked {feeSchedule.verifiedOn}; {MEDICAID_LINK_COUNT} states are linked this way and a
            state we could not verify is left out rather than guessed.
          </span>
        </p>
      ) : program ? (
        <p className="micro">
          Your rate is set and published by {program.program}, {program.stateName}&rsquo;s own Medicaid
          program, not by the federal government. Its fee schedule is on that program&rsquo;s site; we
          link an address only after fetching it, and this one answered no automated request.
        </p>
      ) : askForState ? (
        <p className="micro">Choose where you live above and this card will link your own state&rsquo;s published fee schedule.</p>
      ) : null}
      <button className="btn primary full" type="button" onClick={onCountAll} disabled={busy || done}>
        {done ? <><Icon.Check /> Counted</> : busy ? 'Counting…' : copy.action}
      </button>
      <p className="micro">A count is bound to the exact published row it answers, so it can be routed to the agency that published it.</p>
    </div>
  );
}

/**
 * "$X to $Y across localities · $Z where you live."
 *
 * CMS publishes one figure per code per locality; the spread between the
 * cheapest and the dearest place is the fact a national number hides. Both ends
 * are published rows read through lib/fit — nothing is averaged or estimated.
 */
function LocalityRange({ itemId, loc, shown, which }: {
  itemId: string;
  loc: { displayName: string } | null;
  shown: number | null;
  /** what the figure beside this range actually is, from lib/fit */
  which: Fit['which'];
}) {
  const range = useMemo(() => localityRange(itemId), [itemId]);
  if (!range || shown === null) return null;
  /* 🔴 "$189.25 IN IOWA" HAS TO BE AN IOWA FIGURE.
     The bracket is the locality-adjusted allowed range. The figure beside it is
     whatever lib/fit chose for this reader — which, for an uninsured person, is
     the NATIONAL CY2024 average submitted charge. Appending "in Iowa" to that
     made the page contradict its own sentence thirty rows down ("0 of these 7
     lines carry a figure CMS publishes for Iowa"). The place is named only when
     the figure is the locality one. */
  return (
    <span className="loc-range">
      <span className="lr-c"><b>{usd(range.low, true)}</b> to <b>{usd(range.high, true)}</b> across localities</span>
      {which === 'locality' && loc
        ? <span className="lr-c"> · <b>{usd(shown, true)}</b> in {loc.displayName}</span>
        : which === 'charge'
          ? <span className="lr-c"> · the figure shown is a national charge, not {loc ? `a ${loc.displayName} rate` : 'a local rate'}</span>
          : loc
            ? <span className="lr-c"> · CMS publishes no {loc.displayName} figure for this code; the national rate is shown</span>
            : <span className="lr-c"> · national figure shown</span>}
    </span>
  );
}

/** 1st, 2nd, 3rd, 11th — plain English for the count that comes back. */
function ordinal(n: number): string {
  const r100 = n % 100, r10 = n % 10;
  const suffix = r100 >= 11 && r100 <= 13 ? 'th' : r10 === 1 ? 'st' : r10 === 2 ? 'nd' : r10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function dl(name: string, text: string, type = 'text/plain;charset=utf-8') {
  const u = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

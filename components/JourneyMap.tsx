'use client';

/* ==========================================================================
   THE JOURNEY MAP: a person's ledger drawn as the path their care took.

   Every line of the ledger is a waypoint, in the order the person told it.
   The path climbs as the running total climbs: on a wide screen the height of
   each waypoint IS the running total at that step, so a flat stretch is a step
   that carries no published figure, and a steep one is an expensive step.

   The rules are the ledger's rules, and nothing here is new arithmetic:
   1. Every dollar is a line total from lib/pricing (a published figure times
      the count the person gave), priced through the same fit the ledger uses,
      so the summit equals the ledger's total to the cent.
   2. A line with no published figure is a hollow marker, named, with no dollar.
   3. Care a person went without is never priced. It sits OFF the path, faint.
   4. The picture a person can share carries no words the person typed unless
      they tick the box that puts them there.
   ========================================================================== */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from '@/components/IntentLink';
import { reasonOf, useStore } from '@/lib/store';
import { notReadAsCare } from '@/lib/mapper';
import { basisWarning, priceJourney, totals, usd } from '@/lib/pricing';
import { rulesFor } from '@/lib/table';
import { agencyOf, blankCaption, everyLineUndescribed, fitOf, noFigureCopy, totalLabels } from '@/lib/fit';
import type { Ctx, Fit } from '@/lib/fit';
import { SHARED_NO_FIGURE, TIME_SEARCHING, gapFieldsOf, gapLabel, monthsPhrase } from '@/lib/sheet';
import { FORGONE_CATEGORIES, forgoneEntered, forgoneRows, loadForgone } from '@/lib/forgone';
import type { ForgoneCounts } from '@/lib/forgone';
import type { JourneyEntry, PricedLine } from '@/lib/types';
import { Icon } from './Icons';
import s from './JourneyMap.module.css';

/* ---------------------------------------------------------------- model -- */

export interface MapStop {
  key: string;
  /** 1-based place on the path, in the order the person told it */
  n: number;
  /** what the screen prints: the unit's plain name, or the person's own words */
  name: string;
  /** true when `name` is free text the person typed */
  ownWords: boolean;
  /** what the picture prints when the person has not chosen to include their words */
  safeName: string;
  times: number;
  /** the agency that published the figure, when the line has a unit of care */
  agency: string | null;
  /** the line total, or null when no published figure prices it */
  lineUsd: number | null;
  /** the running total after this step: priced line totals added in order */
  runningUsd: number;
  /** why there is no dollar, in a few words, when there is none */
  blankWhy: string | null;
  /** the short form under the stop's name when there is no dollar */
  noneLabel: string;
  /** read by the AI reader rather than the rules (the price still came from the table) */
  ai: boolean;
}

export interface OffPathMark {
  key: string;
  label: string;
  count: number;
  unit: string;
}

export interface JourneyMapModel {
  stops: MapStop[];
  offPath: OffPathMark[];
  /** the ledger total: priced line totals added */
  totalUsd: number;
  pricedCount: number;
  blankCount: number;
  /** the longest length of searching the person named, in months; never priced */
  searchMonths: number;
}

const FORGONE_SET = new Set<string>(FORGONE_CATEGORIES);
const BLANK_NAME = 'A step with no federal figure';

/** The ledger's own pricing, line for line: the fit that describes this person, then lib/pricing. */
export function pricedLinesFor(entries: readonly JourneyEntry[], ctx: Ctx, forChild = false): { lines: PricedLine[]; fits: Map<string, Fit> } {
  const fits = new Map<string, Fit>();
  for (const e of entries) if (e.item) fits.set(e.key, fitOf(e.item, ctx, forChild));
  const lines = priceJourney([...entries], (e) => (e.item ? fits.get(e.key)?.figureUsd ?? null : undefined));
  return { lines, fits };
}

/**
 * Turns the priced ledger into waypoints. `lines` must be the ledger's own
 * priced lines, in the order the entries were told. `forgone` is what the person
 * entered in the ledger's "care you went without" band, which, when present,
 * replaces the counts read from their sentence for those two counters.
 */
/* flow3-20 on the map: forChild when a parent answers for a child, so the blank
   steps say "the child". flow3-6: a line that is not care ("im 19 now", a short
   fragment) is never a step (lib/mapper notReadAsCare); it stays on the ledger. */
export function buildJourneyModel(lines: readonly PricedLine[], forgone?: ForgoneCounts | null, forChild = false): JourneyMapModel {
  const stops: MapStop[] = [];
  const off = new Map<string, OffPathMark>();
  let running = 0;
  let searchMonths = 0;
  for (const l of lines) {
    const e = l.entry;
    const g = gapFieldsOf(e);
    if (!e.item && g.gapCategory === TIME_SEARCHING) {
      searchMonths = Math.max(searchMonths, Math.floor(g.months ?? 0));
      continue;
    }
    if (!e.item && g.gapCategory) {
      const at = off.get(g.gapCategory);
      const add = Math.max(1, e.times);
      if (at) at.count += add;
      else off.set(g.gapCategory, { key: g.gapCategory, label: cap(gapLabel(g.gapCategory)), count: add, unit: 'times' });
      continue;
    }
    if (!e.item && notReadAsCare({ raw: e.raw, item: e.item, gapCategory: g.gapCategory, months: g.months, reason: reasonOf(e) })) continue;
    /* judge panel 15 Oct #2.1: a summable:false figure keeps its own amount on its
       stop and never joins the running total, as on the ledger (lib/pricing totals). */
    const beside = !!e.item && rulesFor(e.item.id).summable === false;
    if (l.priced && l.totalUsd !== null && !beside) running += l.totalUsd;
    const raw = (e.raw || '').trim();
    const shared = !e.item && (raw === SHARED_NO_FIGURE || raw === '');
    const ownWords = !e.item && !shared;
    stops.push({
      key: e.key,
      n: stops.length + 1,
      name: e.item ? e.item.label : ownWords ? raw : BLANK_NAME,
      ownWords,
      safeName: e.item ? e.item.label : BLANK_NAME,
      times: e.times,
      agency: e.item ? agencyOf(e.item) : null,
      lineUsd: l.priced ? l.totalUsd : null,
      runningUsd: round2(running),
      blankWhy: l.priced ? null : e.item ? blankCaption(forChild) : 'No published federal figure',
      noneLabel: e.item ? `No figure describes ${forChild ? 'the child' : 'you'} here` : 'No federal figure',
      ai: e.source === 'model',
    });
  }
  /* The person's own numbers for the two forgone counters win over the sentence. */
  if (forgone && forgoneEntered(forgone) > 0) {
    for (const id of FORGONE_CATEGORIES) off.delete(id);
    for (const r of forgoneRows()) if (forgone[r.id] > 0) off.set(r.id, { key: r.id, label: r.label, count: forgone[r.id], unit: r.unit });
  }
  const offPath = [...off.values()].sort((a, b) => Number(FORGONE_SET.has(b.key)) - Number(FORGONE_SET.has(a.key)));
  /* Lines off the path have no unit of care, so they are never priced: this is the ledger's total. */
  const t = totals([...lines]);
  return {
    stops,
    offPath,
    totalUsd: round2(t.totalUsd),
    pricedCount: t.pricedCount,
    blankCount: stops.filter((x) => x.lineUsd === null).length,
    searchMonths,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const timesWord = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`;
/** "1 occasion", "2 occasions": the counter's own unit, singular when the count is one. */
export const countOf = (n: number, unit: string) => `${n} ${n === 1 && /s$/.test(unit) ? unit.slice(0, -1) : unit}`;

/* ------------------------------------------------------------- geometry -- */

export interface Pt { x: number; y: number }

/** A smooth path through every point (Catmull-Rom, drawn as cubic Beziers). */
export function smoothPath(pts: readonly Pt[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${f(pts[0].x)},${f(pts[0].y)}`;
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}
export const f = (n: number) => (Math.round(n * 10) / 10).toString();

/** Points between waypoints, pushed a little to one side and then the other, so the path winds. */
function meander(points: readonly Pt[], amp: number, axis: 'x' | 'y'): Pt[] {
  const out: Pt[] = [];
  points.forEach((p, i) => {
    out.push(p);
    const q = points[i + 1];
    if (!q) return;
    const side = i % 2 === 0 ? 1 : -1;
    const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    if (axis === 'y') m.y += amp * side; else m.x += amp * side;
    out.push(m);
  });
  return out;
}

/** The wide map's frame, in its own units. The last waypoint stops short of the
 *  right edge so its label has room and the path can run on to the summit flag. */
export const WIDE = { w: 1200, h: 316, left: 72, right: 890, base: 268, top: 84, flag: 980 } as const;
/** The most waypoints the wide map draws across; beyond this the path runs down the page. */
export const WIDE_MAX = 8;

export interface WideGeometry { pts: Pt[]; flag: Pt; road: string; ridge: string }

/** Across the page: x is the order told, y is the running total (higher on the page = more spent). */
export function wideGeometry(model: JourneyMapModel): WideGeometry {
  const n = model.stops.length;
  const span = WIDE.right - WIDE.left;
  const total = model.totalUsd;
  const pts = model.stops.map((st, i) => ({
    x: n === 1 ? (WIDE.left + WIDE.right) / 2 : WIDE.left + (span * i) / (n - 1),
    y: total > 0 ? WIDE.base - (st.runningUsd / total) * (WIDE.base - WIDE.top) : WIDE.base - 40,
  }));
  const last = pts[pts.length - 1] ?? { x: WIDE.w / 2, y: WIDE.base };
  const start = { x: 0, y: WIDE.h - 20 };
  const flag = { x: WIDE.flag, y: last.y - 6 };
  const end = { x: WIDE.w, y: last.y - 2 };
  const road = smoothPath(meander([start, ...pts, flag, end], 8, 'y'));
  const ridge = `${road} L${WIDE.w},${WIDE.h} L0,${WIDE.h} Z`;
  return { pts, flag, road, ridge };
}

/** Where each label sits across the wide map, as fractions of its width. Labels
 *  alternate above and below, so a label may run as far as the next one in its
 *  own row; each starts at its own leader line. */
export function wideLabelBoxes(xs: readonly number[]): { left: number; width: number }[] {
  const n = xs.length;
  return xs.map((x, i) => {
    const left = Math.max(0, x / WIDE.w - 0.012);
    const nextSame = xs[i + 2];
    const room = nextSame !== undefined ? nextSame / WIDE.w - 0.012 - left - 0.02 : 1 - left;
    return { left, width: Math.max(0.12, Math.min(n <= 2 ? 0.34 : 0.3, room)) };
  });
}

/** Down the page: x is the running total across the rail (further right = more spent). */
export function tallX(model: JourneyMapModel, i: number, rail: number): number {
  const lo = 20, hi = rail - 20;
  const st = model.stops[i];
  if (!st || model.totalUsd <= 0) return lo + 6;
  return lo + (st.runningUsd / model.totalUsd) * (hi - lo);
}

export function tallGeometry(xs: readonly number[], ys: readonly number[], height: number, rail: number): { road: string; ridge: string } {
  const pts = xs.map((x, i) => ({ x, y: ys[i] }));
  const first = pts[0] ?? { x: 26, y: 0 };
  const last = pts[pts.length - 1] ?? first;
  const road = smoothPath(meander([{ x: Math.max(14, first.x - 4), y: 0 }, ...pts, { x: Math.min(rail - 12, last.x + 4), y: height }], 10, 'x'));
  return { road, ridge: `${road} L0,${height} L0,0 Z` };
}

/* ------------------------------------------------------------- picture -- */

/* The saved picture (mapPictureSvg, renderMapPng) lives in
   components/JourneyMapPicture.ts and loads when the map is on screen, not with
   the page (PERF, 2026-10-01). The pin's outline is shared with it. */
/** The picture's code, fetched once and shared by the preload and the button. */
const loadPicture = () => import('./JourneyMapPicture');

export const PIN = 'M0,0 C-4,-8 -13,-14 -13,-24 A13,13 0 1 1 13,-24 C13,-14 4,-8 0,0Z';

/* ----------------------------------------------------------- component -- */

/** A waypoint that is not on the path: care a person went without. Faint, hollow, never numbered. */
function GhostPin() {
  return <svg className={s.pinSvg} width="22" height="30" viewBox="-16 -40 32 44" aria-hidden="true"><path d={PIN} className={s.ghost} /></svg>;
}

function Pin({ n, priced, size = 1 }: { n: number; priced: boolean; size?: number }) {
  return (
    <svg className={s.pinSvg} width={32 * size} height={44 * size} viewBox="-16 -40 32 44" aria-hidden="true">
      <path d={PIN} className={priced ? s.pinFill : s.pinHollow} />
      <text x="0" y="-19" textAnchor="middle" className={priced ? s.pinN : s.pinNHollow}>{n}</text>
    </svg>
  );
}

function useReducedMotion(): boolean {
  const [r, setR] = useState(false);
  useEffect(() => {
    const q = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!q) return;
    setR(q.matches);
    const on = () => setR(q.matches);
    q.addEventListener?.('change', on);
    return () => q.removeEventListener?.('change', on);
  }, []);
  return r;
}

/** Adds the "drawn" state once, the first time the map is on screen. */
function useDrawIn<T extends Element>(ready: boolean): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (!el || !ready || drawn) return;
    if (typeof IntersectionObserver === 'undefined') { setDrawn(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true))); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [el, ready, drawn]);
  return [setEl, drawn];
}

function StopLabel({ st }: { st: MapStop }) {
  return (
    <div className={`${s.lab} ${st.lineUsd === null ? s.labBlank : ''}`}>
      <p className={s.labName}>{st.ownWords ? <>“{st.name}”</> : st.name}</p>
      <p className={s.labMeta}>
        {st.lineUsd !== null
          ? <b className={s.labUsd}>{usd(st.lineUsd, true)}</b>
          : <em className={s.labNone}>{st.noneLabel}</em>}
        <span className={s.dot} aria-hidden="true" />
        <span>× {st.times}</span>
        {st.agency && <><span className={s.dot} aria-hidden="true" /><span>{st.agency}</span></>}
        {st.ai && <span className={s.ai} title="The AI reader placed this phrase. The price came from the table, never from the model.">AI read</span>}
      </p>
      <p className={s.labRun}>Running total <b>{usd(st.runningUsd, true)}</b></p>
    </div>
  );
}

function WideMap({ model, drawn, still, totalShown }: { model: JourneyMapModel; drawn: boolean; still: boolean; totalShown: number | null }) {
  const g = useMemo(() => wideGeometry(model), [model]);
  /* The path ends on the number: the total, beside the summit flag. */
  const tag = totalShown !== null ? `${usd(Math.round(totalShown))} so far` : null;
  const tagW = tag ? Math.round(tag.length * 10.2 + 28) : 0;
  const n = model.stops.length;
  const boxes = wideLabelBoxes(g.pts.map((p) => p.x));
  const ghosts = model.offPath.slice(0, 6);
  const placed = (i: number): CSSProperties => ({ marginLeft: `${(boxes[i].left * 100).toFixed(2)}%`, width: `${(boxes[i].width * 100).toFixed(2)}%` });
  return (
    <div className={`${s.wide} ${drawn || still ? s.drawn : ''} ${still ? s.still : ''}`} style={{ ['--n' as string]: n }} aria-hidden="true">
      <div className={`${s.labRow} ${s.labTop}`}>
        {model.stops.map((st, i) => (i % 2 === 0 ? <div key={st.key} className={s.slot} style={placed(i)}><span className={s.slotN}>{st.n}</span><StopLabel st={st} /></div> : null))}
      </div>
      <svg className={s.scene} viewBox={`0 0 ${WIDE.w} ${WIDE.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="jm-ridge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className={s.ridgeTop} />
            <stop offset="1" className={s.ridgeBot} />
          </linearGradient>
          <mask id="jm-reveal" maskUnits="userSpaceOnUse" x="0" y="0" width={WIDE.w} height={WIDE.h}>
            <path d={g.road} className={s.revealStroke} pathLength={1} />
          </mask>
        </defs>
        <circle cx="1110" cy="56" r="38" className={s.sun} />
        <g transform="scale(1,0.718)">
          <path className={s.hillA} d="M0,292 C200,226 380,246 560,266 C760,288 900,196 1200,186 L1200,440 L0,440Z" />
          <path className={s.hillB} d="M0,346 C180,298 420,326 640,318 C860,310 1000,256 1200,248 L1200,440 L0,440Z" />
        </g>
        <path className={s.far} d={g.ridge} transform="translate(46,-34)" />
        <path className={s.ridge} d={g.ridge} fill="url(#jm-ridge)" />
        <path className={s.front} transform="scale(1,0.958)" d="M0,330 L0,300 C150,281 320,296 470,315 C540,324 600,330 640,330Z" />
        {ghosts.map((m, k) => (
          <path key={m.key} d={PIN} transform={`translate(${150 + k * 74},${k % 2 ? 84 : 62}) scale(0.85)`} className={s.ghost} />
        ))}
        {model.stops.map((st, i) => (
          <line key={st.key} x1={g.pts[i].x} x2={g.pts[i].x} y1={i % 2 === 0 ? 0 : WIDE.h} y2={i % 2 === 0 ? g.pts[i].y - 40 : g.pts[i].y + 4}
            className={i % 2 === 0 ? s.leadSky : s.leadHill} />
        ))}
        <g mask="url(#jm-reveal)">
          <path d={g.road} className={s.road} />
          <path d={g.road} className={s.roadLine} />
        </g>
        {model.stops.map((st, i) => (
          <g key={st.key} className={s.mark} style={{ ['--i' as string]: i }} transform={`translate(${f(g.pts[i].x)},${f(g.pts[i].y)})`}>
            <ellipse cx="0" cy="1" rx="8" ry="3" className={s.shadow} />
            <path d={PIN} className={st.lineUsd !== null ? s.pinFill : s.pinHollow} />
            <text x="0" y="-19" textAnchor="middle" className={st.lineUsd !== null ? s.pinN : s.pinNHollow}>{st.n}</text>
          </g>
        ))}
        {n > 0 && tag && (
          <g className={s.flag} transform={`translate(${f(g.flag.x)},${f(g.flag.y + 2)})`}>
            <line x1="0" y1="0" x2="0" y2="-46" className={s.pole} />
            <path d="M0,-46 L28,-38 L0,-30Z" className={s.pennant} />
            <rect x="36" y="-60" width={tagW} height="32" rx="16" className={s.tag} />
            <text x={36 + tagW / 2} y="-38.5" textAnchor="middle" className={s.tagText}>{tag}</text>
          </g>
        )}
      </svg>
      <div className={`${s.labRow} ${s.labBottom}`}>
        {model.stops.map((st, i) => (i % 2 === 1 ? <div key={st.key} className={s.slot} style={placed(i)}><span className={s.slotN}>{st.n}</span><StopLabel st={st} /></div> : null))}
      </div>
    </div>
  );
}

const RAIL = 96;
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function TallMap({ model, drawn, still, onMeasured, totalShown }: { model: JourneyMapModel; drawn: boolean; still: boolean; onMeasured: (ok: boolean) => void; totalShown: number | null }) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const [geo, setGeo] = useState<{ road: string; ridge: string; h: number } | null>(null);
  const xs = useMemo(() => model.stops.map((_, i) => tallX(model, i, RAIL)), [model]);
  const measure = useCallback(() => {
    const ol = listRef.current;
    if (!ol || ol.offsetHeight === 0) return;
    const rows = [...ol.querySelectorAll<HTMLElement>('[data-pin]')];
    const base = ol.getBoundingClientRect().top;
    /* the path runs through each pin's tip, 40 px below the top of its 44 px box */
    const ys = rows.map((r) => r.getBoundingClientRect().top - base + 40);
    const h = ol.offsetHeight;
    const allX = rows.map((_, i) => xs[i] ?? xs[xs.length - 1] ?? 26);
    const g = tallGeometry(allX, ys, h, RAIL);
    setGeo({ ...g, h });
    onMeasured(true);
  }, [xs, onMeasured]);
  useIsoLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined' || !listRef.current) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(listRef.current);
    return () => ro.disconnect();
  }, [measure]);
  const endX = xs[xs.length - 1] ?? 26;
  return (
    <div className={`${s.tall} ${drawn || still ? s.drawn : ''} ${still ? s.still : ''}`} aria-hidden="true">
      <svg className={s.tallHills} viewBox="0 0 400 96" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <circle cx="330" cy="40" r="26" className={s.sun} />
        <path className={s.hillA} d="M0,62 C80,30 160,40 240,52 C310,62 350,34 400,30 L400,96 L0,96Z" />
        <path className={s.hillB} d="M0,80 C90,58 190,72 280,70 C340,68 370,58 400,56 L400,96 L0,96Z" />
      </svg>
      {model.offPath.length > 0 && (
        <svg className={s.tallGhosts} width="180" height="44" viewBox="0 0 180 44" aria-hidden="true" focusable="false">
          {model.offPath.slice(0, 6).map((m, k) => <path key={m.key} d={PIN} transform={`translate(${16 + k * 30},${k % 2 ? 40 : 34}) scale(0.75)`} className={s.ghost} />)}
        </svg>
      )}
      <div className={s.tallBody}>
        {geo && (
          <svg className={s.rail} width={RAIL} height={geo.h} viewBox={`0 0 ${RAIL} ${geo.h}`} aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="jm-ridge-v" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" className={s.ridgeBot} />
                <stop offset="1" className={s.ridgeTop} />
              </linearGradient>
              <clipPath id="jm-rail-clip"><rect x="0" y="0" width={RAIL} height={geo.h} rx="20" /></clipPath>
              <mask id="jm-reveal-v" maskUnits="userSpaceOnUse" x="0" y="0" width={RAIL} height={geo.h}>
                <path d={geo.road} className={s.revealStroke} pathLength={1} />
              </mask>
            </defs>
            <rect x="0" y="0" width={RAIL} height={geo.h} rx="20" className={s.railBg} />
            <path d={geo.ridge} fill="url(#jm-ridge-v)" className={s.ridge} clipPath="url(#jm-rail-clip)" />
            <g mask="url(#jm-reveal-v)">
              <path d={geo.road} className={s.road} />
              <path d={geo.road} className={s.roadLine} />
            </g>
          </svg>
        )}
        <ol className={s.tallList} ref={listRef}>
          {model.stops.map((st, i) => (
            <li key={st.key} className={s.tallRow}>
              <span className={`${s.tallPin} ${s.mark}`} data-pin="" style={{ left: `${xs[i] - 16}px`, ['--i' as string]: i }}>
                <Pin n={st.n} priced={st.lineUsd !== null} />
              </span>
              <StopLabel st={st} />
            </li>
          ))}
          {totalShown !== null && (
            <li className={`${s.tallRow} ${s.tallEnd}`}>
              <span className={`${s.tallPin} ${s.flagHtml}`} data-pin="" style={{ left: `${endX - 4}px` }}>
                <svg width="34" height="50" viewBox="-4 -48 34 50" aria-hidden="true"><line x1="0" y1="0" x2="0" y2="-46" className={s.pole} /><path d="M0,-46 L28,-38 L0,-30Z" className={s.pennant} /></svg>
              </span>
              <div className={s.lab}>
                <p className={s.endLbl}>Where the path reaches</p>
                <p className={s.endUsd}>{usd(totalShown, true)}</p>
              </div>
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}

export default function JourneyMap() {
  const st = useStore();
  const still = useReducedMotion();
  const [forgone, setForgone] = useState<ForgoneCounts | null>(null);
  useEffect(() => { setForgone(loadForgone()); }, []);
  const ctx = st.ctx;
  const forChild = st.patient?.stratum === 'caregiver-child';
  const { lines, fits } = useMemo(() => pricedLinesFor(st.entries, ctx, forChild), [st.entries, ctx, forChild]);
  const model = useMemo(() => buildJourneyModel(lines, forgone, forChild), [lines, forgone, forChild]);
  const labels = useMemo(() => totalLabels(ctx), [ctx]);
  /* The ledger's own rule: when not one line carries a figure that describes this
     person, no total is printed (lib/fit everyLineUndescribed). */
  const suppressed = useMemo(() => everyLineUndescribed([...fits.values()]), [fits]);
  const itemLines = useMemo(() => st.entries.filter((e) => e.item).length, [st.entries]);
  const noFig = suppressed ? noFigureCopy(ctx, itemLines, forChild) : null;
  const warn = useMemo(() => basisWarning(totals(lines).basesUsed), [lines]);
  const totalShown = suppressed || model.pricedCount === 0 ? null : model.totalUsd;

  const wideOk = model.stops.length > 0 && model.stops.length <= WIDE_MAX;
  const [measured, setMeasured] = useState(false);
  const onMeasured = useCallback((ok: boolean) => setMeasured(ok), []);
  const [drawRef, drawn] = useDrawIn<HTMLDivElement>(st.hydrated && (wideOk || measured));

  const anyOwn = model.stops.some((x) => x.ownWords);
  const [withWords, setWithWords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /* fetch the picture's code while the map is on screen, so Save starts at once */
  useEffect(() => {
    if (!st.hydrated) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
    const go = () => { void loadPicture().catch(() => { /* the button tries again */ }); };
    if (w.requestIdleCallback) { const id = w.requestIdleCallback(go); return () => w.cancelIdleCallback?.(id); }
    const t = setTimeout(go, 200);
    return () => clearTimeout(t);
  }, [st.hydrated]);

  async function savePicture() {
    setBusy(true); setErr(null);
    try {
      const { renderMapPng } = await loadPicture();
      const blob = await renderMapPng(model, {
        ownWords: withWords,
        basis: labels.primary,
        totalUsd: totalShown,
        noTotal: noFig?.headline,
      });
      const file = new File([blob], 'waypoint-journey-map.png', { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      const touch = window.matchMedia?.('(pointer: coarse)').matches;
      if (touch && nav.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Waypoint Ledger' }); setBusy(false); return; }
        catch (e) { if (/abort/i.test(e instanceof Error ? e.message : String(e))) { setBusy(false); return; } }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'waypoint-journey-map.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      setErr('The picture could not be made in this browser. Your ledger is unchanged.');
    }
    setBusy(false);
  }

  const head = (
    <div className={s.pageHead}>
      <Link className={s.crumb} href="/ledger"><Icon.Back /> Back to the ledger</Link>
      <p className="eyebrow">Your ledger, drawn</p>
      <h1>The path your care took</h1>
      <p className={`sub ${s.sub}`}>Each step you told us, in the order you told it, with the published federal figure for it.</p>
    </div>
  );

  if (!st.hydrated) return <div className={s.layout}>{head}<div className={s.loading} aria-busy="true"><p className="micro">Drawing your map…</p></div></div>;

  if (!model.stops.length) {
    return (
      <div className={s.layout}>
        {head}
        <section className={`card ${s.empty}`} aria-labelledby="jm-empty-h">
          {/* The ART lane's empty path (public/img/v2/journey-map-wide.webp): the road before it has a waypoint. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.emptyArt} src="/img/v2/journey-map-wide.webp" width={1600} height={600} alt="" aria-hidden="true" decoding="async" />
          <h2 id="jm-empty-h">Your map draws itself from your ledger</h2>
          <p>Tell the care you had, in your own words, and each visit and test becomes a waypoint here with its published federal figure.</p>
          <Link className="btn primary" href="/">Price my journey</Link>
        </section>
      </div>
    );
  }

  const searchLine = model.searchMonths > 0 ? `${monthsPhrase(model.searchMonths)} of searching, counted and never priced` : null;

  return (
    <div className={s.layout}>
      {head}
      <div className={s.save}>
        {anyOwn && (
          <label className={s.check}>
            <input type="checkbox" checked={withWords} onChange={(e) => setWithWords(e.target.checked)} />
            <span>Put the words I typed on the picture</span>
          </label>
        )}
        <button type="button" className="btn primary" onClick={savePicture} disabled={busy} data-testid="save-map">
          <Icon.Download /> {busy ? 'Drawing the picture…' : 'Share as a picture'}
        </button>
        {err && <p className={`micro ${s.err}`} role="alert">{err}</p>}
      </div>

      <figure className={`card ${s.card}`} aria-labelledby="jm-total-h" ref={drawRef}>
        <div className={s.head}>
          <div className={s.headL}>
            <p className={s.kicker}>From the first step to today</p>
            <p className={s.counts}>
              {model.stops.length} {model.stops.length === 1 ? 'step' : 'steps'} on the path
              {model.blankCount > 0 && <> · {model.blankCount} without a federal figure</>}
            </p>
            {searchLine && <p className={s.counts}>{searchLine}</p>}
          </div>
          <div className={s.headR}>
            {totalShown !== null ? (
              <>
                <h2 id="jm-total-h" className={s.total}><span className="sr-only">Where the path reaches: </span>{usd(Math.round(totalShown))}</h2>
                <p className={s.basis}>{labels.primary}</p>
              </>
            ) : (
              <h2 id="jm-total-h" className={s.noTotal}>{noFig?.headline ?? 'No published federal figure prices these lines'}</h2>
            )}
          </div>
        </div>

        {wideOk && <div className={s.onlyWide}><WideMap model={model} drawn={drawn} still={still} totalShown={totalShown} /></div>}
        <div className={wideOk ? s.onlyTall : ''}>
          <TallMap model={model} drawn={drawn} still={still} onMeasured={onMeasured} totalShown={totalShown} />
        </div>

        <figcaption className={s.key}>
          <span className={s.keyItem}><Pin n={1} priced size={0.7} /> Priced from a published federal figure</span>
          <span className={s.keyItem}><Pin n={2} priced={false} size={0.7} /> No published federal figure: named, never guessed</span>
          {model.offPath.length > 0 && <span className={s.keyItem}><GhostPin /> Off the path: counted, never priced</span>}
          <span className={s.keyItem}><svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M2,19 C8,17 10,9 20,4" className={s.keyClimb} /></svg> {wideOk ? <><span className={s.onlyWide}>The path climbs as the running total does</span><span className={s.onlyTall}>The path moves right as the running total grows</span></> : 'The path moves right as the running total grows'}</span>
        </figcaption>

        <ol className="sr-only" aria-label="Your journey, step by step">
          {model.stops.map((x) => (
            <li key={x.key}>
              {`Step ${x.n}: ${x.ownWords ? `in your words, “${x.name}”` : x.name}, ${timesWord(x.times)}${x.agency ? `, ${x.agency}` : ''}${x.ai ? ', AI read' : ''}. `}
              {x.lineUsd !== null ? `${usd(x.lineUsd, true)}. Running total ${usd(x.runningUsd, true)}.` : `${x.blankWhy}, so no dollar. Running total stays ${usd(x.runningUsd, true)}.`}
            </li>
          ))}
        </ol>
      </figure>

      {model.offPath.length > 0 && (
        <section className={`card ${s.off}`} aria-labelledby="jm-off-h">
          <h2 id="jm-off-h" className={s.offH}>Off the path</h2>
          <p className={s.offSub}>Counted, never priced: no federal file records care that did not happen.</p>
          <ul className={s.offList}>
            {model.offPath.map((m) => (
              <li key={m.key}>
                <GhostPin />
                <span>{m.label}</span>
                <b>{countOf(m.count, m.unit)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      {warn && <p className={`micro ${s.warn}`}>{warn}</p>}
      <p className={`micro ${s.foot}`}>Every dollar on this map is a line total from your ledger: a published federal figure times the count you gave. Nothing is estimated, and the picture is drawn in this browser.</p>
    </div>
  );
}

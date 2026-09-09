'use client';
import { useState } from 'react';
import { usd } from '@/lib/pricing';
import { Icon } from './Icons';

/**
 * THE ARTIFACT THAT LEAVES THE SITE.
 *
 * A share link is a string; a card is a thing people post. This draws one,
 * 1080×1350, entirely in the browser, from exactly what the share link already
 * carries: units, counts and published figures. No free text, no condition, no
 * name, no date, nothing typed. Nothing is uploaded to draw it — the canvas is
 * local and the PNG never leaves the device unless the person shares it.
 */

export interface ShareBar { label: string; total: number }
export interface ShareCardData {
  totalUsd: number;
  pricedCount: number;
  /** Appointments, i.e. counts summed. */
  stepCount: number;
  /** Distinct units of care. */
  distinctCount: number;
  /** Lines with no published federal figure. */
  blankCount: number;
  bars: ShareBar[];
  url: string;
  tableVersion: string;
  /** One published, currently-true comparison line, or null. Never a stale ratio. */
  footnote?: string | null;
  /** The odyssey, in clauses that are already real counts: "4 years of searching",
   *  "27 appointments", "1 time you were denied". Composed by lib/sheet's
   *  odysseyClauses, which drops any clause whose count is zero. */
  story?: string[];
  /** The published year-ahead figure with its interval, drawn in its own strip
   *  and marked SHOWN APART — never added to the total. Null when none applies. */
  yearAhead?: { low: number; high: number; point: number; year: number; population?: string; source?: string } | null;
}

export const CARD_W = 1080;
export const CARD_H = 1350;

const C = {
  band: '#0e2a3a', ground: '#f5f3ee', surface: '#ffffff', ink: '#121c26',
  ink2: '#3a4754', ink3: '#5b6874', accent: '#22c1b6', line: '#e3dfd6',
  /* the site's own accent, softened for a band a phone screenshot can read */
  soft: '#e4f2f0', softInk: '#0a5f59', apart: '#fdf3e3', apartInk: '#7a5312',
};

const D = (w: number, s: number) => `${w} ${s}px "Bricolage Grotesque", Helvetica, Arial, sans-serif`;
const B = (w: number, s: number) => `${w} ${s}px "Figtree", Helvetica, Arial, sans-serif`;

/** Pure: draws the card into a 1080×1350 canvas. Exported so a test can call it. */
export function drawShareCard(canvas: HTMLCanvasElement, d: ShareCardData): void {
  canvas.width = CARD_W; canvas.height = CARD_H;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('This browser did not give us a canvas to draw on.');

  const M = 72;                      // one margin, both sides
  const W = CARD_W - M * 2;
  const FOOT_H = 150;

  g.fillStyle = C.ground; g.fillRect(0, 0, CARD_W, CARD_H);

  // Header band. First person: it is the poster's search, not an institution's.
  g.fillStyle = C.band; g.fillRect(0, 0, CARD_W, 210);
  g.fillStyle = C.accent; g.font = D(800, 30); g.textBaseline = 'alphabetic';
  g.fillText('WAYPOINT LEDGER', M, 96);
  g.fillStyle = 'rgba(255,255,255,.86)'; g.font = B(500, 30);
  g.fillText('What did my diagnostic search actually cost?', M, 150);

  // The number
  g.fillStyle = C.ink3; g.font = D(700, 26);
  g.fillText('WHAT THE PUBLISHED PRICES ADD UP TO', M, 282);
  g.fillStyle = C.ink; g.font = D(800, 132);
  g.fillText(usd(d.totalUsd), M, 410);
  g.fillStyle = C.ink2; g.font = B(500, 32);
  g.fillText(
    `${d.stepCount} ${d.stepCount === 1 ? 'appointment' : 'appointments'}, ` +
    `${d.distinctCount} different ${d.distinctCount === 1 ? 'kind' : 'kinds'}` +
    (d.blankCount ? ` · ${d.blankCount} left blank, never guessed` : ''),
    M, 462);

  let y = 490;                        // the flowing cursor starts under the total

  /* THE STORY BAND — the part a person actually repeats out loud. Every clause
     arrives already counted; a clause with a zero never reaches this array, so
     the band is either true or absent. */
  const story = (d.story ?? []).filter((c) => c && c.trim());
  if (story.length) {
    g.font = B(600, 31);
    /* Two lines is the band. A journey with more clauses than that drops the
       least specific ones from the end — never shrinks the type to fit. */
    let lines = wrapLines(g, story.join(' · '), W - 56);
    for (let n = story.length; lines.length > 2 && n > 1; n--) {
      lines = wrapLines(g, story.slice(0, n - 1).join(' · '), W - 56);
    }
    const h = 26 + lines.length * 42 + 20;
    g.fillStyle = C.soft; roundRect(g, M, y, W, h, 24); g.fill();
    g.fillStyle = C.softInk;
    let ty = y + 26 + 31;
    for (const l of lines) { g.fillText(l, M + 28, ty); ty += 42; }
    y += h + 20;
  }

  /* THE YEAR AHEAD — a published figure on a different basis, so it gets its
     own strip and its own mark. It is never summed with anything above it. */
  if (d.yearAhead) {
    const ya = d.yearAhead;
    const who = ya.population ?? 'an adult reporting long COVID';
    const src = ya.source ?? `${ya.year} Medical Expenditure Panel Survey`;
    g.font = B(500, 25);
    const lines = wrapLines(g, `${usd(ya.low)} to ${usd(ya.high)} is the published excess for the single year ahead for ${who} — ${src}, 95% interval. It already contains the visits above, so it is never added to them.`, W - 56);
    const h = 66 + lines.length * 34 + 22;
    g.fillStyle = C.apart; roundRect(g, M, y, W, h, 24); g.fill();
    g.fillStyle = C.apartInk; g.font = D(800, 22);
    g.fillText('SHOWN APART · NEVER ADDED', M + 28, y + 44);
    g.fillStyle = C.ink2; g.font = B(500, 25);
    let ty = y + 66 + 25;
    for (const l of lines) { g.fillText(l, M + 28, ty); ty += 34; }
    y += h + 26;
  }

  /* THE CLOSING BLOCK is measured and PLACED before anything else competes for
     the room, because a card that overruns its own footer is not shippable.
     It carries up to three lines; when the bands above it have taken the room,
     it drops the least load-bearing line rather than spilling into the footer.
     Nothing here is ever set smaller to make it fit. */
  const CONTENT_BOTTOM = CARD_H - FOOT_H - 24;
  const headline = 'The care you needed and never got produces $0 in federal data.';
  const second = d.blankCount
    ? `${d.blankCount} ${d.blankCount === 1 ? 'line has' : 'lines have'} no published federal figure — shown blank, never guessed.`
    : 'Every line links to the published federal row it came from.';
  g.font = D(700, 38);
  const hLines = wrapLines(g, headline, W - 40);
  g.font = B(500, 27);
  const sLinesAll = wrapLines(g, second, W - 40);
  g.font = B(600, 25);
  const fLinesAll = d.footnote ? wrapLines(g, d.footnote, W - 40) : [];
  const blockH = (sN: number, fN: number) => 36 + hLines.length * 48 + sN * 34 + (fN ? 12 + fN * 32 : 0) + 32;
  const ROW_H = 80;
  const ranked = d.bars.filter((b) => b.total > 0);
  const barsFor = (sN: number, fN: number) =>
    Math.max(0, Math.min(4, Math.floor((CONTENT_BOTTOM - y - blockH(sN, fN) - 24 - 44) / ROW_H)));

  let sLines = sLinesAll, fLines = fLinesAll;
  /* A single bar reads as a mistake rather than a chart. When the room is that
     tight the card gives it up in this order: the comparison line first (it is
     the least load-bearing of the three), then the chart, never the claim. */
  if (ranked.length > 1 && barsFor(sLines.length, fLines.length) === 1 && fLines.length) fLines = [];
  if (y + 8 + blockH(sLines.length, fLines.length) > CONTENT_BOTTOM) fLines = [];
  if (y + 8 + blockH(sLines.length, fLines.length) > CONTENT_BOTTOM) sLines = [];
  const BLOCK_H = blockH(sLines.length, fLines.length);
  const maxBars = barsFor(sLines.length, fLines.length);
  const bars = ranked.slice(0, maxBars);

  if (maxBars > 0) {
    g.fillStyle = C.ink3; g.font = D(700, 24);
    g.fillText('WHERE THE COST SITS', M, y + 24);
    y += 44;
    const max = Math.max(1, ...ranked.map((b) => b.total));
    for (const b of bars) {
      g.fillStyle = C.ink; g.font = B(600, 30);
      g.fillText(b.label, M, y + 24);
      g.fillStyle = C.ink2; g.font = D(700, 30);
      g.textAlign = 'right'; g.fillText(usd(b.total), CARD_W - M, y + 24); g.textAlign = 'left';
      g.fillStyle = C.line; roundRect(g, M, y + 40, W, 14, 7); g.fill();
      g.fillStyle = C.band; roundRect(g, M, y + 40, Math.max(14, W * (b.total / max)), 14, 7); g.fill();
      y += ROW_H;
    }
    if (!ranked.length) {
      g.fillStyle = C.ink3; g.font = B(400, 30);
      g.fillText('No priced lines yet.', M, y + 24);
      y += ROW_H;
    } else if (ranked.length > bars.length) {
      const rest = ranked.slice(bars.length);
      const restTotal = rest.reduce((a, b) => a + b.total, 0);
      g.fillStyle = C.ink3; g.font = B(500, 26);
      g.fillText(`and ${rest.length} more ${rest.length === 1 ? 'kind' : 'kinds'} of care, ${usd(restTotal)}`, M, y + 20);
      y += 44;
    }
  }

  // The closing block sits on the floor of the content area, never floating.
  const by = Math.round(CONTENT_BOTTOM - BLOCK_H);
  g.fillStyle = C.surface; roundRect(g, 56, by, CARD_W - 112, BLOCK_H, 28); g.fill();
  g.strokeStyle = C.line; g.lineWidth = 2; roundRect(g, 56, by, CARD_W - 112, BLOCK_H, 28); g.stroke();
  let ty = by + 36 + 38;
  g.fillStyle = C.ink; g.font = D(700, 38);
  for (const l of hLines) { g.fillText(l, 92, ty); ty += 48; }
  ty += 2;
  g.fillStyle = C.ink3; g.font = B(500, 27);
  for (const l of sLines) { g.fillText(l, 92, ty); ty += 34; }
  if (fLines.length) {
    ty += 12;
    g.fillStyle = C.softInk; g.font = B(600, 25);
    for (const l of fLines) { g.fillText(l, 92, ty); ty += 32; }
  }

  /* THE FOOTER IS THE CALL TO ACTION. A card in someone else's feed has to say
     what to do next; only the host, because a share hash is unreadable here. */
  g.fillStyle = C.band; g.fillRect(0, CARD_H - FOOT_H, CARD_W, FOOT_H);
  g.fillStyle = '#ffffff'; g.font = D(800, 34);
  g.fillText(`Make yours · ${hostOf(d.url)}`, M, CARD_H - 84);
  g.fillStyle = 'rgba(255,255,255,.7)'; g.font = B(500, 25);
  g.fillText(`Every figure cited to a published federal file · price table ${d.tableVersion}`, M, CARD_H - 42);
}

/** A card shows where to go, not a 400-character journey hash. */
export function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url.replace(/^https?:\/\//, '').split(/[/#?]/)[0]; }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Measures the wrap without drawing it, so a block's height is known before
 *  anything is committed to the canvas. Same algorithm as `wrap`. */
function wrapLines(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) { out.push(line); line = w; }
    else line = test;
  }
  if (line) out.push(line);
  return out;
}

async function loadFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(D(800, 132)),
      document.fonts.load(D(700, 30)),
      document.fonts.load(B(500, 32)),
      document.fonts.load(B(600, 30)),
    ]);
    await document.fonts.ready;
  } catch { /* the card still draws in the fallback stack */ }
}

export async function renderShareCardBlob(d: ShareCardData): Promise<Blob> {
  await loadFonts();
  const canvas = document.createElement('canvas');
  drawShareCard(canvas, d);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('The card could not be turned into an image here.');
  return blob;
}

export default function ShareCard({ data, onDone, className = 'btn ghost full', label = 'Save my card' }: {
  data: ShareCardData;
  onDone?: (how: 'shared' | 'saved') => void;
  /** The bottom bar on a phone needs a button that sits in a row, not a full-width block. */
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const blob = await renderShareCardBlob(data);
      const file = new File([blob], 'waypoint-ledger.png', { type: 'image/png' });
      // The share sheet is the right gesture on a phone. On a desktop it is a
      // detour: Chrome reports it can share files there too, and a person who
      // pressed "Save" meant save. So the sheet is offered on touch only.
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
      if (touch && nav.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Waypoint Ledger', text: data.url });
          onDone?.('shared');
          setBusy(false);
          return;
        } catch (e) {
          // Cancelling the sheet is a decision, not a failure.
          if (/abort/i.test(e instanceof Error ? e.message : String(e))) { setBusy(false); return; }
        }
      }
      download(blob);
      onDone?.('saved');
    } catch {
      setErr('The card could not be made in this browser. The share link still works.');
    }
    setBusy(false);
  }

  function download(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'waypoint-ledger.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  return (
    <>
      <button className={className} type="button" onClick={save} disabled={busy} data-testid="save-card">
        <Icon.Sheet /> {busy ? 'Drawing your card…' : label}
      </button>
      {err && <p className="micro warn-txt">{err}</p>}
    </>
  );
}

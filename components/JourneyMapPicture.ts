/* ==========================================================================
   THE JOURNEY MAP'S SAVED PICTURE: one standalone SVG drawn onto a canvas and
   saved as a PNG on this device. Split from components/JourneyMap.tsx (PERF,
   2026-10-01) so the map page's own chunk carries only the map; JourneyMap
   loads this file once the map is on screen, before "Save the picture" is
   pressed. Nothing here prices anything, and nothing is uploaded.
   ========================================================================== */
import { usd } from '@/lib/pricing';
import { monthsPhrase } from '@/lib/sheet';
import { PIN, countOf, f, tallGeometry, tallX, type JourneyMapModel, type MapStop } from './JourneyMap';

export const PIC_W = 1080;
export const PICTURE_FOOT = 'Priced from published federal figures · waypointledger.org';

const PIC = {
  ground: '#f5f6f8', surface: '#ffffff', ink: '#111c27', ink2: '#364350', ink3: '#556170',
  line: '#e1e5ea', accent: '#0b7f76', accentInk: '#0a6c65', navy: '#0e2a3a',
  hillA: '#d3e7ef', hillB: '#c3e2dd', ridgeTop: '#2a9592', ridgeBot: '#175a70', road: '#eef8f5',
};

export interface PictureOptions {
  /** the person ticked the box to put their own words on the picture */
  ownWords: boolean;
  /** "Medicare allowed amounts", the basis line under the total */
  basis: string;
  /** null when no total may be printed (every line undescribed) */
  totalUsd: number | null;
  /** the sentence printed instead of a total, when there is none */
  noTotal?: string;
  /** measures a string in a CSS font; falls back to an estimate where there is no canvas */
  measure?: (text: string, font: string) => number;
  /** @font-face rules to embed, so the picture is set in the site's type */
  fontCss?: string;
}

export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function wrap(text: string, maxW: number, font: string, size: number, measure?: PictureOptions['measure'], maxLines = 3): string[] {
  const m = (t: string) => (measure ? measure(t, font) : t.length * size * 0.54);
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (m(next) <= maxW || !cur) cur = next;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  if (out.length > maxLines) {
    const kept = out.slice(0, maxLines);
    let lastLine = kept[maxLines - 1];
    while (lastLine.length > 1 && m(`${lastLine}…`) > maxW) lastLine = lastLine.slice(0, -1);
    kept[maxLines - 1] = `${lastLine.trimEnd()}…`;
    return kept;
  }
  return out;
}


/**
 * The picture, as one standalone SVG: total, path, waypoints, what sits off the
 * path, and the line saying where the figures come from. Pure, so a test can
 * read exactly what it would carry.
 */
export function mapPictureSvg(model: JourneyMapModel, o: PictureOptions): { svg: string; width: number; height: number } {
  const W = PIC_W, M = 72, rail = 220, textX = M + rail + 24, textW = W - textX - M;
  const D = (w: number, z: number) => `${w} ${z}px "Bricolage Grotesque", Helvetica, Arial, sans-serif`;
  const B = (w: number, z: number) => `${w} ${z}px Figtree, Helvetica, Arial, sans-serif`;
  const parts: string[] = [];
  let y = M;

  /* the brand, then the total */
  parts.push(`<g transform="translate(${M},${y}) scale(0.75)"><path d="M32 4C18.745 4 8 14.745 8 28c0 8 6 16 12 22l12 12 12-12c6-6 12-14 12-22C56 14.745 45.255 4 32 4Z" fill="${PIC.navy}"/><path d="M20 50h24L32 62Z" fill="${PIC.accent}"/><path d="M20 18h24v5H20zm0 10h20v5H20zm0 10h12v5H20z" fill="#fff"/></g>`);
  parts.push(`<text x="${M + 60}" y="${y + 34}" font-family="'Bricolage Grotesque', Helvetica, Arial, sans-serif" font-weight="700" font-size="30" fill="${PIC.ink}">Waypoint Ledger</text>`);
  y += 120;
  parts.push(`<text x="${M}" y="${y}" font-family="Figtree, Helvetica, Arial, sans-serif" font-weight="600" font-size="28" fill="${PIC.accentInk}">The path my care took</text>`);
  y += 112;
  if (o.totalUsd !== null) {
    parts.push(`<text x="${M - 4}" y="${y}" font-family="'Bricolage Grotesque', Helvetica, Arial, sans-serif" font-weight="800" font-size="112" letter-spacing="-3" fill="${PIC.ink}">${esc(usd(Math.round(o.totalUsd)))}</text>`);
    y += 50;
    for (const ln of wrap(o.basis, W - 2 * M, B(500, 28), 28, o.measure, 2)) {
      parts.push(`<text x="${M}" y="${y}" font-family="Figtree, Helvetica, Arial, sans-serif" font-weight="500" font-size="28" fill="${PIC.ink2}">${esc(ln)}</text>`);
      y += 38;
    }
  } else {
    for (const ln of wrap(o.noTotal ?? 'No published federal figure describes you on these lines', W - 2 * M, D(700, 44), 44, o.measure, 3)) {
      parts.push(`<text x="${M}" y="${y}" font-family="'Bricolage Grotesque', Helvetica, Arial, sans-serif" font-weight="700" font-size="44" fill="${PIC.ink}">${esc(ln)}</text>`);
      y += 54;
    }
  }
  const counts = [`${model.stops.length} ${model.stops.length === 1 ? 'step' : 'steps'} on the path`];
  if (model.blankCount) counts.push(`${model.blankCount} without a federal figure`);
  if (model.searchMonths > 0) counts.push(`${monthsPhrase(model.searchMonths)} of searching`);
  parts.push(`<text x="${M}" y="${y + 4}" font-family="Figtree, Helvetica, Arial, sans-serif" font-weight="500" font-size="26" fill="${PIC.ink3}">${esc(counts.join(' · '))}</text>`);
  y += 56;

  /* the path, down the page */
  const top = y;
  const rows: { y: number; h: number; lines: string[]; st: MapStop }[] = [];
  let ry = top + 40;
  for (const st of model.stops) {
    const name = st.ownWords && o.ownWords ? `“${st.name}”` : st.safeName;
    const lines = wrap(name, textW, B(600, 30), 30, o.measure, 3);
    const h = Math.max(128, 38 * lines.length + 92);
    rows.push({ y: ry, h, lines, st });
    ry += h;
  }
  const summitY = ry + 30;
  const pathH = summitY + 40 - top;
  const xs = rows.map((_, i) => M + tallX(model, i, rail));
  const ys = rows.map((r) => r.y + 26 - top);
  const g = tallGeometry(xs.map((x) => x - M), ys, pathH, rail);
  parts.push(`<g transform="translate(${M},${top})">`);
  parts.push(`<clipPath id="railClip"><rect x="0" y="0" width="${rail}" height="${pathH}" rx="28"/></clipPath>`);
  parts.push(`<rect x="0" y="0" width="${rail}" height="${pathH}" rx="28" fill="${PIC.hillA}" opacity="0.55"/>`);
  parts.push(`<path d="${g.ridge}" fill="url(#ridgeV)" clip-path="url(#railClip)"/>`);
  parts.push(`<path d="${g.road}" fill="none" stroke="${PIC.road}" stroke-width="16" stroke-linecap="round"/>`);
  parts.push(`<path d="${g.road}" fill="none" stroke="${PIC.accent}" stroke-width="2.5" stroke-dasharray="2 9" stroke-linecap="round" opacity="0.7"/>`);
  rows.forEach((r, i) => {
    const px = xs[i] - M, py = ys[i] + 14;
    parts.push(pinSvg(px, py, r.st.n, r.st.lineUsd !== null, 1.25));
  });
  const endX = (xs[xs.length - 1] ?? M + 26) - M;
  parts.push(`<g transform="translate(${endX},${summitY - top + 10})"><line x1="0" y1="0" x2="0" y2="-56" stroke="${PIC.navy}" stroke-width="4" stroke-linecap="round"/><path d="M0,-56 L34,-46 L0,-36Z" fill="${PIC.accent}"/></g>`);
  parts.push('</g>');

  for (const r of rows) {
    let ty = r.y + 18;
    for (const ln of r.lines) {
      parts.push(`<text x="${textX}" y="${ty}" font-family="Figtree, Helvetica, Arial, sans-serif" font-weight="600" font-size="30" fill="${PIC.ink}">${esc(ln)}</text>`);
      ty += 38;
    }
    const meta = [`× ${r.st.times}`, r.st.agency].filter(Boolean).join(' · ');
    parts.push(`<text x="${textX}" y="${ty + 2}" font-family="Figtree, Helvetica, Arial, sans-serif" font-weight="500" font-size="24" fill="${PIC.ink3}">${esc(meta)}</text>`);
    if (r.st.lineUsd !== null) {
      parts.push(`<text x="${W - M}" y="${ty + 2}" text-anchor="end" font-family="Figtree, Helvetica, Arial, sans-serif" font-weight="700" font-size="30" fill="${PIC.ink}">${esc(usd(r.st.lineUsd, true))}</text>`);
    } else {
      parts.push(`<text x="${W - M}" y="${ty + 2}" text-anchor="end" font-family="Figtree, Helvetica, Arial, sans-serif" font-style="italic" font-weight="500" font-size="24" fill="${PIC.ink3}">no federal figure</text>`);
    }
  }
  if (o.totalUsd !== null) {
    parts.push(`<text x="${textX}" y="${summitY + 4}" font-family="Figtree, Helvetica, Arial, sans-serif" font-weight="600" font-size="28" fill="${PIC.accentInk}">Where the path reaches</text>`);
    parts.push(`<text x="${W - M}" y="${summitY + 4}" text-anchor="end" font-family="'Bricolage Grotesque', Helvetica, Arial, sans-serif" font-weight="800" font-size="36" fill="${PIC.ink}">${esc(usd(o.totalUsd, true))}</text>`);
  }
  y = top + pathH + 40;

  /* off the path: counted, never priced */
  if (model.offPath.length) {
    parts.push(`<text x="${M}" y="${y + 20}" font-family="'Bricolage Grotesque', Helvetica, Arial, sans-serif" font-weight="700" font-size="32" fill="${PIC.ink}">Off the path</text>`);
    parts.push(`<text x="${M}" y="${y + 58}" font-family="Figtree, Helvetica, Arial, sans-serif" font-weight="500" font-size="24" fill="${PIC.ink3}">Counted, never priced: no federal file records care that did not happen.</text>`);
    y += 100;
    for (const m of model.offPath) {
      parts.push(`<g transform="translate(${M + 14},${y + 6}) scale(0.9)"><path d="${PIN}" fill="none" stroke="${PIC.ink3}" stroke-width="2.5" stroke-dasharray="3 4" opacity="0.6"/></g>`);
      parts.push(`<text x="${M + 44}" y="${y}" font-family="Figtree, Helvetica, Arial, sans-serif" font-weight="500" font-size="26" fill="${PIC.ink2}">${esc(`${m.label}: ${countOf(m.count, m.unit)}`)}</text>`);
      y += 44;
    }
    y += 10;
  }

  /* hills, then the line that says where every figure comes from */
  const hillsTop = y + 10;
  const H = hillsTop + 222;
  parts.push(`<path d="M0,${hillsTop + 90} C220,${hillsTop + 20} 420,${hillsTop + 60} 600,${hillsTop + 80} C780,${hillsTop + 100} 900,${hillsTop + 30} ${W},${hillsTop + 20} L${W},${H} L0,${H}Z" fill="${PIC.hillA}"/>`);
  parts.push(`<path d="M0,${hillsTop + 130} C240,${hillsTop + 90} 460,${hillsTop + 120} 680,${hillsTop + 110} C860,${hillsTop + 100} 980,${hillsTop + 70} ${W},${hillsTop + 70} L${W},${H} L0,${H}Z" fill="${PIC.hillB}"/>`);
  parts.push(`<path d="M0,${hillsTop + 150} C200,${hillsTop + 128} 420,${hillsTop + 138} 640,${hillsTop + 158} C760,${hillsTop + 168} 900,${hillsTop + 170} ${W},${hillsTop + 156} L${W},${H} L0,${H}Z" fill="${PIC.ridgeBot}"/>`);
  parts.push(`<text x="${W / 2}" y="${H - 26}" text-anchor="middle" font-family="Figtree, Helvetica, Arial, sans-serif" font-weight="600" font-size="26" fill="#ffffff">${esc(PICTURE_FOOT)}</text>`);

  const defs = `<defs>${o.fontCss ? `<style>${o.fontCss}</style>` : ''}<linearGradient id="ridgeV" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${PIC.ridgeBot}"/><stop offset="1" stop-color="${PIC.ridgeTop}"/></linearGradient></defs>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}<rect width="${W}" height="${H}" fill="${PIC.surface}"/>${parts.join('')}</svg>`;
  return { svg, width: W, height: H };
}

function pinSvg(x: number, y: number, n: number, priced: boolean, scale = 1): string {
  const body = priced
    ? `<path d="${PIN}" fill="${PIC.navy}"/><text x="0" y="-19" text-anchor="middle" font-family="Figtree, Helvetica, Arial, sans-serif" font-weight="700" font-size="14" fill="#ffffff">${n}</text>`
    : `<path d="${PIN}" fill="#ffffff" stroke="${PIC.navy}" stroke-width="2" stroke-dasharray="3 3"/><text x="0" y="-19" text-anchor="middle" font-family="Figtree, Helvetica, Arial, sans-serif" font-weight="700" font-size="14" fill="${PIC.navy}">${n}</text>`;
  return `<g transform="translate(${f(x)},${f(y)}) scale(${scale})">${body}</g>`;
}

/* The site's own type, read from this origin and embedded, so the picture is set
   in it. If a file cannot be read the picture falls back to Helvetica. */
async function fontCss(): Promise<string> {
  const files: [string, string, string][] = [
    ['Figtree', '/fonts/figtree-latin.woff2', '300 900'],
    ['Bricolage Grotesque', '/fonts/bricolage-grotesque-latin.woff2', '500 800'],
  ];
  const rules: string[] = [];
  for (const [family, url, weight] of files) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const b = new Uint8Array(await r.arrayBuffer());
      let bin = '';
      for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
      rules.push(`@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2')}`);
    } catch { /* the fallback stack draws it */ }
  }
  return rules.join('');
}

/** Draws the picture's SVG onto a canvas and returns the PNG. Nothing is uploaded. */
export async function renderMapPng(model: JourneyMapModel, o: Omit<PictureOptions, 'measure' | 'fontCss'>): Promise<Blob> {
  try {
    await Promise.all([document.fonts.load('600 30px Figtree'), document.fonts.load('800 112px "Bricolage Grotesque"')]);
  } catch { /* measured in the fallback stack */ }
  const probe = document.createElement('canvas').getContext('2d');
  const measure = probe ? (t: string, font: string) => { probe.font = font; return probe.measureText(t).width; } : undefined;
  const css = await fontCss();
  const { svg, width, height } = mapPictureSvg(model, { ...o, measure, fontCss: css });
  const img = new Image();
  img.decoding = 'async';
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  await new Promise((r) => setTimeout(r, 60));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('no canvas');
  g.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('no image');
  return blob;
}


#!/usr/bin/env node
/* ==========================================================================
   THE DARK THEME, MEASURED.

   Bo, 2026-09-09, on the source drawer in dark mode: "so hard to read … feels
   flat." Flat is a measurement, not a taste: secondary text sat at 3.9:1 on the
   drawer's own surface, and three greys in a row with no step between the
   panels behind them gave the eye nothing to separate one block from the next.

   This script reads the token blocks out of app/globals.css — the same file the
   browser reads, never a copy of the values — and computes the WCAG 2.1 contrast
   ratio for every pair in the table below. Dark pairs are enforced; the light
   theme is measured and printed, never enforced, because this lane does not own
   its values.
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = join(ROOT, 'app', 'globals.css');

/** Pull one `selector{ … }` declaration block out of the stylesheet. */
/** @param {string} css @param {string} marker @returns {string} */
export function blockAfter(css, marker) {
  const i = css.indexOf(marker);
  if (i === -1) throw new Error(`selector not found in globals.css: ${marker}`);
  const open = css.indexOf('{', i + marker.length - 1);
  let depth = 0;
  for (let j = open; j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}') { depth--; if (depth === 0) return css.slice(open + 1, j); }
  }
  throw new Error(`unterminated block for ${marker}`);
}

/** Every `--name:#hex` in a block. Non-colour tokens (gradients, shadows) are skipped.
 *  @param {string} block
 *  @returns {Record<string,string>} */
export function tokens(block) {
  /** @type {Record<string,string>} */
  const out = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*[;}]/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

/** @param {string} hex @returns {number[]} */
export function rgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** WCAG 2.1 relative luminance. */
/** @param {string} hex @returns {number} */
export function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** @param {string} fg @param {string} bg @returns {number} */
export function ratio(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------- the table ----------
   `min` is the floor this pair must clear. Body text is 7:1 (WCAG AAA for normal
   text); secondary text, links and status labels are 4.5:1 (AA). Every pair here
   is a place the drawer actually puts that colour on that background. */
export const PAIRS = [
  ['ink', 'ground', 7, 'body text on the page behind the drawer'],
  ['ink', 'surface', 7, 'the unit name and every heading in the drawer'],
  ['ink', 'surface-2', 7, 'text on a drawer block'],
  ['ink-2', 'ground', 7, 'secondary body text on ground'],
  ['ink-2', 'surface', 7, 'the caption under the figure'],
  ['ink-2', 'surface-2', 7, 'the coverage paragraphs — block 6'],
  ['ink-3', 'ground', 4.5, 'micro notes on ground'],
  ['ink-3', 'surface', 4.5, 'micro notes in the drawer body'],
  ['ink-3', 'surface-2', 4.5, 'the eyebrows and the READ-not-computed note'],
  ['ink-4', 'ground', 4.5, 'the faintest label on ground'],
  ['ink-4', 'surface', 4.5, 'the faintest label in the drawer'],
  ['ink-4', 'surface-2', 4.5, 'the faintest label on a block'],
  ['brand-3', 'ground', 4.5, 'a link on ground'],
  ['brand-3', 'surface', 4.5, 'the NLM link in the drawer'],
  ['brand-3', 'surface-2', 4.5, 'a link inside a block'],
  ['accent-ink', 'ground', 4.5, 'the category eyebrow on ground'],
  ['accent-ink', 'surface', 4.5, 'the category eyebrow in the drawer head'],
  ['accent-ink', 'surface-2', 4.5, 'an accent label on a block'],
  ['on-brand', 'brand-fill', 4.5, 'the primary button — "Open the source"'],
  ['good-ink', 'surface-2', 4.5, 'DESCRIBES YOU'],
  ['flag-ink', 'surface-2', 4.5, 'DOES NOT DESCRIBE YOU'],
  ['warn-ink', 'surface-2', 4.5, 'a caution label'],
  /* The inset tier the dark theme grew so a box inside a block still reads as a box. */
  ['ink-2', 'surface-3', 7, 'text on an inset — the codes box, the rank list'],
  ['ink-3', 'surface-3', 4.5, 'a label on an inset'],
];

/** Steps between the three panel tones. Flat is what Bo saw; this is the number. */
export const STEPS = [
  ['surface', 'ground', 1.12, 'the drawer must lift off the page'],
  ['surface-2', 'surface', 1.10, 'a block must lift off the drawer'],
  /* WCAG 1.4.11: a control's own fill must clear 3:1 against what is behind it. */
  ['brand-fill', 'ground', 3, 'the primary button as a shape, not as text'],
  ['surface-3', 'surface-2', 1.18, 'an inset must lift off the block it sits in'],
  /* A border a person can actually see. It was 1.23:1 against the drawer. */
  ['line', 'surface', 1.6, 'the line between two things must be visible'],
];

/** @param {Record<string,string>} map
 *  @param {{strict:boolean}} opts
 *  @returns {{fg:string,bg:string,min:number,why:string,r:number|null,pass:boolean,step?:boolean}[]} */
export function check(map, { strict }) {
  /** @type {{fg:string,bg:string,min:number,why:string,r:number|null,pass:boolean,step?:boolean}[]} */
  const rows = [];
  for (const [fg, bg, min, why] of PAIRS) {
    if (!map[fg] || !map[bg]) { rows.push({ fg, bg, min, why, r: null, pass: !strict }); continue; }
    const r = ratio(map[fg], map[bg]);
    rows.push({ fg, bg, min, why, r, pass: r >= min });
  }
  for (const [a, b, min, why] of STEPS) {
    const r = map[a] && map[b] ? ratio(map[a], map[b]) : null;
    rows.push({ fg: a, bg: b, min, why, r, pass: r === null ? !strict : r >= min, step: true });
  }
  return rows;
}

/** @param {string} name
 *  @param {ReturnType<typeof check>} rows
 *  @param {boolean} strict
 *  @returns {number} */
export function report(name, rows, strict) {
  const bad = rows.filter((x) => !x.pass);
  const lines = [`\n${name}${strict ? '' : '  (measured, not enforced)'}`];
  for (const x of rows) {
    const v = x.r === null ? '  n/a ' : x.r.toFixed(2).padStart(6);
    lines.push(`  ${x.pass ? 'ok  ' : 'FAIL'} ${v}:1  (min ${x.min})  --${x.fg} on --${x.bg}   ${x.why}`);
  }
  console.log(lines.join('\n'));
  return strict ? bad.length : 0;
}

/** @param {string} [css]
 *  @returns {{light:Record<string,string>,dark:Record<string,string>,darkMedia:Record<string,string>}} */
export function readThemes(css = readFileSync(CSS, 'utf8')) {
  return {
    light: tokens(blockAfter(css, '\n:root{')),
    dark: tokens(blockAfter(css, ':root[data-theme="dark"]')),
    darkMedia: tokens(blockAfter(css, ':root:not([data-theme="light"])')),
  };
}

if (process.argv[1] && process.argv[1].endsWith('contrast-check.mjs')) {
  const t = readThemes();
  let bad = 0;
  bad += report('DARK  :root[data-theme="dark"]', check(t.dark, { strict: true }), true);
  bad += report('DARK  @media (prefers-color-scheme: dark)', check(t.darkMedia, { strict: true }), true);
  report('LIGHT :root', check(t.light, { strict: false }), false);
  /* The two dark blocks are one theme written twice. A drift between them is a
     bug that only shows on someone else's machine. */
  const drift = Object.keys(t.dark).filter((k) => t.darkMedia[k] !== t.dark[k]);
  if (drift.length) { console.log(`\nFAIL the two dark blocks disagree on: ${drift.join(', ')}`); bad += drift.length; }
  console.log(bad ? `\n${bad} failing pair(s).` : '\nEvery enforced pair clears its floor.');
  process.exit(bad ? 1 : 0);
}

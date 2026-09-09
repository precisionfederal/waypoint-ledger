/* ==========================================================================
   SIZE BUDGETS — the bundle is allowed to grow, but never quietly.

   Nothing in this repo ever made the site slow on purpose. It gets slow the
   way every site gets slow: one import at a time, each of them reasonable,
   none of them measured. This file is the ratchet. Every number below was
   measured on 2026-09-09 against the real static export and set at that
   measurement plus ten percent, so ordinary churn passes and a step change
   fails with the name of the thing that stepped.

   Raw AND gzipped are both budgeted, because they answer different questions:
   raw is what the browser must parse and compile (the phone's CPU), gzip is
   what must cross the network (the phone's signal). A change can be cheap in
   one and expensive in the other.

   When a budget fails, the fix is one of three, in order of preference:
     1. the growth is accidental — a barrel import, a whole library for one
        helper, a data file that should be fetched instead of bundled. Undo it.
     2. the growth is real and earned — raise the number HERE, in the same
        commit, with the new measurement. The ratchet moves on purpose.
     3. the growth belongs behind a route split — move it out of first load.

   It measures a real artifact and refuses to measure nothing: a budget gate
   that skips when the export is missing is a gate in the shape of a pass, and
   this repo has been bitten by exactly that before.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* --- which artifact are we measuring ---------------------------------------
   cf/out is the tree the deploy publishes, so it is the truth when it exists.
   The lane builds (cf/out-<lane>) are the same export from the same commit and
   stand in when cf/out has not been built on this machine yet. */
function exportDir(): string {
  const fromEnv = process.env.WL_BUDGET_DIR;
  if (fromEnv) return fromEnv;
  const isExport = (d: string) => existsSync(join(d, '_next', 'static')) && existsSync(join(d, 'index.html'));
  const canonical = join(ROOT, 'cf', 'out');
  if (isExport(canonical)) return canonical;
  const cands = readdirSync(join(ROOT, 'cf'))
    .filter((n) => n.startsWith('out-'))
    .map((n) => join(ROOT, 'cf', n))
    .filter(isExport)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (cands.length) return cands[0];
  throw new Error(
    'no static export found under cf/. Run `npm run build:static` first.\n'
    + 'This gate deliberately fails instead of skipping: a size budget that passes '
    + 'when there is nothing to measure is worse than no budget at all.',
  );
}

const DIR = exportDir();
const html = readFileSync(join(DIR, 'index.html'), 'utf8');

const uniq = (xs: string[]) => [...new Set(xs)];
const refs = (re: RegExp) => uniq(html.match(re) || []).map((p) => join(DIR, p));
const bytes = (f: string) => statSync(f).size;
const gz = (f: string) => gzipSync(readFileSync(f), { level: 9 }).length;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const allJs = walk(join(DIR, '_next', 'static')).filter((f) => f.endsWith('.js'));
const allCss = walk(join(DIR, '_next', 'static')).filter((f) => f.endsWith('.css'));
const firstLoadJs = refs(/\/_next\/static\/chunks\/[^"]*\.js/g);
const firstLoadCss = refs(/\/_next\/static\/css\/[^"]*\.css/g);

/* Measured 2026-09-09 on cf/out at 3cf9f9328, then +10%. The comment on each
   line is the measurement, so the next person can see how much room is left
   without rebuilding. */
const BUDGET = {
  firstLoadJsRaw: 1_253_000,   // measured 1,138,963
  firstLoadJsGzip: 305_000,    // measured   276,950
  firstLoadCssRaw: 84_000,     // measured    76,326
  firstLoadCssGzip: 16_500,    // measured    15,002
  largestChunkRaw: 418_000,    // measured   379,707  (the price table ships with the client, by design)
  allJsRaw: 1_815_000,         // measured 1,649,774  (every route's chunk, not just first load)
  allCssRaw: 98_000,           // measured    88,912
  servedBytes: 4_379_000,      // measured 3,980,893  (the whole export minus data/ and the source tarball)
};

/* Per-route chunks, keyed on the route and not on the content hash, which
   changes every build. Anything not named here gets ROUTE_DEFAULT — that is
   the budget a NEW route starts with, and a new route that needs more than
   2.5 KB of its own JavaScript should say so here on the way in. */
const ROUTE_DEFAULT = 2_500;
const ROUTE_BUDGET: Record<string, number> = {
  '/ledger': 67_000,     // measured 60,942 — the table, the drawer, the share card
  '/admin': 16_800,      // measured 15,294
  '/survey': 12_300,     // measured 11,172
  '/': 12_150,           // measured 11,042
  '/sheet': 13_000,      // measured 10,528; 11,887 after the AI-reader chip fields (2026-09-09)
  '/interview': 10_000,  // measured  9,067
  '/gap': 9_900,         // measured  8,968
  '/integrity': 3_350,   // measured  3,036
  '/journey': 1_820,     // measured  1,646
};

function routeChunks(): { route: string; file: string; size: number }[] {
  const base = join(DIR, '_next', 'static', 'chunks', 'app');
  return walk(base)
    .filter((f) => /\/page-[^/]+\.js$/.test(f))
    .map((f) => ({
      route: '/' + f.slice(base.length + 1).replace(/\/?page-[^/]+\.js$/, ''),
      file: f,
      size: bytes(f),
    }))
    .map((r) => ({ ...r, route: r.route === '/' ? '/' : r.route.replace(/\/$/, '') }));
}

describe('size budgets — the export a stranger downloads', () => {
  it('measures a real export, and says which one', () => {
    expect(existsSync(join(DIR, 'index.html'))).toBe(true);
    expect(allJs.length).toBeGreaterThan(10);
    expect(firstLoadJs.length).toBeGreaterThan(3);
  });

  it('first-load JavaScript stays inside its budget, raw and gzipped', () => {
    const raw = sum(firstLoadJs.map(bytes));
    const zipped = sum(firstLoadJs.map(gz));
    expect(raw, `first-load JS raw ${raw} > ${BUDGET.firstLoadJsRaw} (${firstLoadJs.length} chunks in ${DIR})`).toBeLessThanOrEqual(BUDGET.firstLoadJsRaw);
    expect(zipped, `first-load JS gzip ${zipped} > ${BUDGET.firstLoadJsGzip}`).toBeLessThanOrEqual(BUDGET.firstLoadJsGzip);
  });

  it('first-load CSS stays inside its budget, raw and gzipped', () => {
    const raw = sum(firstLoadCss.map(bytes));
    const zipped = sum(firstLoadCss.map(gz));
    expect(raw, `first-load CSS raw ${raw} > ${BUDGET.firstLoadCssRaw}`).toBeLessThanOrEqual(BUDGET.firstLoadCssRaw);
    expect(zipped, `first-load CSS gzip ${zipped} > ${BUDGET.firstLoadCssGzip}`).toBeLessThanOrEqual(BUDGET.firstLoadCssGzip);
  });

  it('no single chunk grows past its budget', () => {
    const worst = allJs.map((f) => ({ f, n: bytes(f) })).sort((a, b) => b.n - a.n)[0];
    expect(worst.n, `largest chunk is ${worst.n} bytes: ${worst.f.slice(DIR.length + 1)}`).toBeLessThanOrEqual(BUDGET.largestChunkRaw);
  });

  it('every route chunk stays inside its own budget', () => {
    const over = routeChunks()
      .map((r) => ({ ...r, budget: ROUTE_BUDGET[r.route] ?? ROUTE_DEFAULT }))
      .filter((r) => r.size > r.budget);
    expect(over.map((r) => `${r.route} ${r.size} > ${r.budget}`), 'a route chunk grew past its budget').toEqual([]);
  });

  it('the whole JavaScript and CSS payload stays inside its budget', () => {
    const js = sum(allJs.map(bytes));
    const css = sum(allCss.map(bytes));
    expect(js, `all JS ${js} > ${BUDGET.allJsRaw}`).toBeLessThanOrEqual(BUDGET.allJsRaw);
    expect(css, `all CSS ${css} > ${BUDGET.allCssRaw}`).toBeLessThanOrEqual(BUDGET.allCssRaw);
  });

  it('the served tree stays inside its budget, data files aside', () => {
    /* data/ is the published evidence — CSVs a stranger downloads on purpose,
       and the source tarball is a deliberate 7 MB. Neither is on the critical
       path of a page load, so neither belongs in this number. */
    const served = walk(DIR).filter((f) => !f.includes(`${DIR}/data/`) && !f.endsWith('.tar.gz'));
    const total = sum(served.map(bytes));
    expect(total, `served bytes ${total} > ${BUDGET.servedBytes} across ${served.length} files in ${DIR}`).toBeLessThanOrEqual(BUDGET.servedBytes);
  });
});

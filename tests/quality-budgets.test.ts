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
/* RE-MEASURED 2026-09-30 (BUILD-2026-10-01-LIVED-EXPERIENCE). A fresh export of
   the UNTOUCHED commit 03d6ee91f (cf/out-base, built on this date before any
   change in this build) already failed six of these: first-load JS, the
   largest chunk, all JS, all CSS, served bytes and the '/' route. The growth predates
   this build (the price table and the locality figures ship with the client,
   and the 2026-09-19 lockfile update moved chunk sizes); cf/out had not been
   rebuilt on the main machine since 2026-09-09, so the gate measured a stale
   export. Each budget below that moved says so on its own line: the 03d6ee91f
   measurement, this build's measurement, and the new ceiling at +10%. */
const BUDGET = {
  firstLoadJsRaw: 1_798_000,   // measured 1,138,963; 1,634,718 at 03d6ee91f and unchanged by this build (2026-09-30)
  firstLoadJsGzip: 351_500,    // measured   276,950; 319,596 at 03d6ee91f, 319,595 after this build (2026-09-30)
  firstLoadCssRaw: 171_400,    // measured    76,326; 94,414 after DESIGN-2 (footer columns, section lists, context bar) 2026-09-09; 108,485 after beta-night round 2 (header sign-in, 44 px coarse-pointer targets, safe-area gutters, compact band, register strip, standards/help sections) 2026-09-30; 126,695 after DESIGN R1 (the light system block at the end of product.css) 2026-09-30, ceiling +10%; 148,187 with the paid view block and the PAGES shared kit (2026-09-30), ceiling +10%; 199,627 after PAGES round 2: Next's loose CSS chunking now groups LongSection/trust/devpages modules into a chunk the home page links (60,893 bytes). Accepted for the 10/1 demo; after it, try experimental.cssChunking 'strict' and put this back near 163,000 (2026-09-30); 155,812 with experimental.cssChunking 'strict' (the home page links only its own CSS: 4 stylesheets, the 60 KB page-kit chunk gone; the same tree in loose mode measured 223,424) (VISUAL-4b perf, export of the worktree at b1965d1c4d plus the in-progress theme CSS, 2026-09-30), ceiling +10%. cf/build-static.sh must carry the same setting or this fails on cf/out
  firstLoadCssGzip: 35_250,    // measured    15,002; raised with the raw figure 2026-09-09; 23,100 after beta-night round 2 (2026-09-30); 26,241 after DESIGN R1 (2026-09-30), ceiling +10%; 30,189 with the paid view block and the PAGES shared kit (2026-09-30), ceiling +10%; 39,698 after PAGES round 2 (the loose-chunking note on the raw figure applies; 2026-09-30); 32,024 with cssChunking 'strict' (44,363 loose, same tree) (VISUAL-4b perf, export of the worktree at b1965d1c4d plus the in-progress theme CSS, 2026-09-30), ceiling +10%
  largestChunkRaw: 942_000,    // measured   379,707; 856,709 at 03d6ee91f, unchanged by this build (the price table ships with the client, by design)
  allJsRaw: 2_867_491,         // measured 1,649,774; 2,205,873 at 03d6ee91f, 2,221,967 after this build (every route's chunk, not just first load); 2,495,762 with the scale pages and the PAGES redesign (2026-09-30), ceiling +10%; RE-MERGE 2026-10-01: 2,783,972 on the re-merged export (flow-core's mapper vocabulary +6.8 KB, the visual and 4b pages, the payer band), after cutting survey-def out of first load, ceiling +3%
  allCssRaw: 467_745,          // measured    88,912; 142,234 after DESIGN R1; 171,069 with the paid view and the first PAGES; 193,643 with the scale pages (conditions, policy, kit) and the PAGES redesign through integrity (2026-09-30), ceiling +10%; 239,590 with the register redesign and every PAGES stylesheet (2026-09-30), ceiling +10%; 264,830 after PAGES round 2 (2026-09-30), ceiling +10%; 330,993 after VISUAL-4b (method 33 KB, adopt, privacy, sheet, dark theme; identical in loose and strict mode) (VISUAL-4b perf, export of the worktree at b1965d1c4d plus the in-progress theme CSS, 2026-09-30), ceiling +10%
                               // PERF 2026-10-01: 437,362 on the merged export b99a08c06 (every lane merged: method 33 KB, privacy 39 KB, the register and conditions bundle 65 KB, the payer drawer's PrivateRange, the journey map 12 KB, a11y visuals); no rule repeats across files (98 duplicate bytes measured) and first-load CSS fell to 144,581, ceiling +3%
                               // RE-MERGE 2026-10-01: 454,121 on the re-merged export (4b stunning, visual, payer band, flow-core polish; PageHero's own module); first-load CSS 135,926 after ThemedImg's hide rules went global (184,924 before), ceiling +3%
  servedBytes: 10_997_633,      // measured 3,980,893; 4,761,999 at round 4; 5,362,217 across 131 files with /conditions (72), /policy, /adopt/kit, /register/preview and the PAGES redesign (2026-09-30), ceiling +10%; 6,704,745 across 154 files with the full PAGES redesign and the scale pages (2026-09-30), ceiling +10%; 8,695,543 across 181 files after VISUAL-4b (+858 KB of share cards in og/, +242 KB of art in img/v2, +395 KB of HTML and RSC text for the longer pages) (VISUAL-4b perf, export of the worktree at b1965d1c4d plus the in-progress theme CSS, 2026-09-30), ceiling +10%
                               // PERF 2026-10-01: 10,124,485 across 239 files on the merged export b99a08c06, after deleting 629 KB of unreferenced images (phones.png and the four 4b dark home files): the share cards in og/ (949 KB, already palette PNGs; a lossless re-encode saved nothing), the v2 art, and the longer pages' HTML and RSC text, ceiling +3%
                               // RE-MERGE 2026-10-01: 10,677,313 across 253 files: four new 1200x630 share cards (/policy, /integrity, /accessibility, /ledger/map; 325 KB), the Lyme night art, the empty-state spots and the merged lanes' pages, ceiling +3%
};

/* Per-route chunks, keyed on the route and not on the content hash, which
   changes every build. Anything not named here gets ROUTE_DEFAULT — that is
   the budget a NEW route starts with, and a new route that needs more than
   2.5 KB of its own JavaScript should say so here on the way in. */
const ROUTE_DEFAULT = 2_500;
const ROUTE_BUDGET: Record<string, number> = {
  '/ledger': 93_498,     // measured 60,942 — the table, the drawer, the share card; 64,890 at 03d6ee91f, 72,265 with the care-gone-without band, 74,838 at 687fc8dc64, 86,153 with the round-5 paid view (column, totals, roll-up, form) (2026-09-30), ceiling +5%; 90,499 at merge round 5 (616c001e24), 90,775 with the sheet card's one-page claim computed from the rows the sheet prints (lib/sheet.ts sheetFitsOnePage; dropping its burden-card dependency saved nothing, that code was already in the chunk) (rehearsal 2026-10-01), ceiling +3%
  '/admin': 22_350,      // measured 15,294; 16,010 at 03d6ee91f, 18,473 with change-log drafts and the larger instrument definition (2026-09-30); 20,313 already at 602dcedb72 before VISUAL-4b and unchanged by it (2026-09-30), ceiling +10%
  '/survey': 34_029,     // measured 11,172; 11,369 at 03d6ee91f, 13,357 with the caregiver path and onset question (2026-09-30); 15,749 after round 4 (thank-you interview offer, keyboard ranking), ceiling +10%; 20,549 already at 602dcedb72 (the FLOW lanes), 20,159 after VISUAL-4b (2026-09-30), ceiling +10% on the larger
    // PERF 2026-10-01 merged export b99a08c06: 31,972, ceiling +3%: ContribKit (rise, glide, waypoints, thank-you) and the IconsNew burden icons from the visual lane
    // FLOW3 2026-10-01: 33,038, ceiling +3%: flow3-9 (focus the thank-you heading) and flow3-11 ("Medicaid or CHIP" first for a child, the adult-child hint)
  '/': 21_933,           // measured 11,042; 13,312 at 03d6ee91f, 13,310 after this build (2026-09-30); 21,294 with the preview lines in cents summed from the shown lines and every Link cold until intent (rehearsal 2026-10-01), ceiling +3%
    // PERF 2026-10-01 merged export b99a08c06: 20,646, ceiling +3%: the live preview (components/LivePreview.tsx) now sits in the page chunk instead of a shared one, while first-load JS fell 51 KB gzip; plus ThemedImg for the dark art and an Icons copy webpack keeps per chunk group
  '/sheet': 33_684,      // measured 10,528; 11,887 after the AI-reader chip fields (2026-09-09); 14,013 after 'Help that already exists'; 15,759 at 687fc8dc64; 18,252 with the round-5 paid column and totals (2026-09-30), ceiling +5%; 19,107 at 602dcedb72, 22,005 after VISUAL-4b sheet (2026-09-30), ceiling +5%
    // PERF 2026-10-01 merged export b99a08c06: 30,205, ceiling +3%: the 4b sheet redesign (SheetRail, JourneyStrip, the paid column) and the per-chunk copies of lib/pricing and Icons
    // RE-MERGE 2 2026-10-01: 31,148 after cutting the child wording to one `who` (31,162 before), ceiling +3%: flow3-20 on the sheet (a parent answering for a child reads "the child") with FLOW3's sheet fixes
    // ROUND 7 2026-10-01 merged export 4d5ee50a7: 32,703, ceiling +3%: SHEET5 sheetWho ("What my father's diagnostic search has cost", a fixed relation list) and JUDGE-7 #4 (workdays counted once on the sheet)
  '/interview': 18_964,  // measured  9,067; 10,988 already at 602dcedb72 before VISUAL-4b and unchanged by it (2026-09-30), ceiling +10%
    // PERF 2026-10-01 merged export b99a08c06: 17,607, ceiling +3%: ContribKit shared with /survey, and the interview form fixes from the FLOW lanes
    // RE-MERGE 2026-10-01: 18,411, ceiling +3%: survey-def left the shared first-load chunk (lib/patient.ts no longer imports it), so its slice rides with this page
  '/gap': 29_900,        // FINAL-1011 susan: measured 28,965 with the seventh card (Care that made you worse), 29,030 with NEEDS.patch (GapMap seventh marker), ceiling +3%. Before: 28,706; measured  8,968; 10,430 after DESIGN-2 2026-09-09; 13,499 after the PAGES redesign (glance cards, even category cards; 2026-09-30), ceiling +10%
    // PERF 2026-10-01 merged export b99a08c06: 27,869, ceiling +3%: the gap drawing (app/gap/GapMap.tsx), DataVisual, the IconsNew card icons and the GapPanel round-2 fields
  '/privacy': 8_700,    // measured 5,019 after the PAGES redesign (glance figures, the words map, card rows; 2026-09-30), ceiling +10%; 7,895 after VISUAL-4b privacy (the visual components' CSS-module class maps and the PrivacyMotion observer; 5,432 at 602dcedb72; 2026-09-30), ceiling +10%
  '/adopt': 6_350,      // measured 2,815 after the PAGES redesign (stepper, glance cards; 2026-09-30), ceiling +10%; 3,553 after PAGES R2 (the Show rows and the two-up folds carry their CSS-module class names; 2026-09-30), ceiling +10%; 5,757 after VISUAL-4b adopt (the adopt/parts class map for the hero, ways, tiles, chips and rail, plus the 24-line reveal-once observer; 2026-09-30), ceiling +10%
  '/method': 2_800,     // measured 2,521 after the PAGES redesign (how-it-prices flow, folds; 2026-09-30), ceiling +10%
  '/accessibility': 5_313, // measured 2,890 after the PAGES redesign (glance and measurement cards; 2026-09-30), ceiling +10%
    // PERF 2026-10-01 merged export b99a08c06: 4,874, ceiling +3%: the fold-open control and the measurement visuals (components/tech/FoldOpen, a11y.module.css)
    // RE-MERGE 2026-10-01: 5,158, ceiling +3%: the dark-theme contrast board (vis-tech cd80493462, pinned in tests/tech-a11y.test.ts)
  '/integrity': 4_550,   // measured  3,036; 4,126 after the PAGES redesign (heads panel CSS module; 2026-09-30), ceiling +10%
  '/journey': 1_820,     // measured  1,646
  '/register': 50_000,   // measured 47,174 — the register (charts, tables, QR at N=0) became its own chunk in DESIGN-2 (2026-09-09)
  '/account': 14_750,    // measured  9,673 — the passkey + email flow is the page's own chunk since DESIGN-2 (2026-09-09); 11,251 after the PAGES redesign (sign-in card, dashboard; 2026-09-30), ceiling +10%; 13,382 already at 602dcedb72, 13,392 after VISUAL-4b (2026-09-30), ceiling +10%
  '/adopt/kit': 16_500,  // measured 14,943 — the organization kit: link, QR (lib/qr.ts), PNG/SVG download, flyer (2026-09-30), ceiling +10%
  '/conditions': 8_576,  // measured 4,658 after the PAGES2 redesign (condition cards, Details folds from the trust Kit; 2026-09-30), ceiling +10%; 8,326 with every Link cold until intent (rehearsal 2026-10-01), ceiling +3%
    // PERF 2026-10-01 merged export b99a08c06: 8,082, ceiling +3%: the condition filter (app/conditions/ConditionFilter.tsx) and the figure visuals
  '/policy': 6_026,      // measured   933 at the scale build; 4,121 after the PAGES2 redesign (figure cards, folds, open-every-fold-on-print; 2026-09-30), ceiling +10%
    // PERF 2026-10-01 merged export b99a08c06: 4,829, ceiling +3%: the FigureVisual and ThemedImg class maps
    // RE-MERGE 2026-10-01: 5,850, ceiling +3%: PolicyLive's Fold and the figure visual code now sit in this page's chunk rather than a shared one (the route's total JS moved with every other route's, +20 KB of shared mapper and lane code)
  '/register/channel': 19_362, // measured 6,140 — one link's own count (2026-09-30), ceiling +10%; RE-MERGE 2026-10-01: 18,798, ceiling +3%: vis-data's channel redesign (4fb73cf802: hero, count-up stat band, five-cost bars; 6.8 KB) and lib/survey-def (7.9 KB) now in this page's chunk instead of a shared one; cut from 22,003 by importing BURDENS from survey-def instead of lib/survey
  '/ledger/map': 32_807, // PERF 2026-10-01: 31,851 measured, ceiling +3%. The journey map (flow-core): the path, waypoints and off-path marks drawn from the ledger; the saved picture's code (JourneyMapPicture.ts) is split out and loads on idle
  '/account/journeys': 4_450, // PERF 2026-10-01: 4,320 measured, ceiling +3%. The saved-journeys list's icons: webpack keeps a copy of components/Icons.tsx in this chunk group
  '/developers': 18_850,  // measured 8,935 — the agency-reuse section (validated Bundle, embed button) is its first client code (2026-09-30), ceiling +10%; 11,685 after the PAGES redesign (route cards, copyable code) with the agency section (2026-09-30), ceiling +10%; 17,123 after PAGES round 2 (folded calls, sticky rail; 2026-09-30), ceiling +10%
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

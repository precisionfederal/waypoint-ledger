/* ==========================================================================
   /public/og.png — the picture a shared link shows.

   Renders a local HTML card with the product's own self-hosted type and
   screenshots it at exactly 1200×630. No external service, no font request:
   the @font-face rules point at the .woff2 files in public/fonts.

   Run:  node scripts/gen-og.mjs
   ========================================================================== */
import { chromium } from '/Users/bo/.nvm/versions/node/v25.3.0/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const FONTS = path.join(ROOT, 'public', 'fonts');
const OUT = path.join(ROOT, 'public', 'og.png');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Bricolage Grotesque';font-weight:500 800;src:url('${pathToFileURL(FONTS).href}/bricolage-grotesque-latin.woff2') format('woff2')}
@font-face{font-family:'Figtree';font-weight:400 700;src:url('${pathToFileURL(FONTS).href}/figtree-latin.woff2') format('woff2')}
@font-face{font-family:'JetBrains Mono';font-weight:400 500;src:url('${pathToFileURL(FONTS).href}/jetbrains-mono-latin.woff2') format('woff2')}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#0e2a3a;font-family:'Figtree',sans-serif;color:#fff;
  position:relative;overflow:hidden}
body::after{content:"";position:absolute;inset:auto -10% -55% 40%;height:90%;
  background:radial-gradient(50% 50% at 50% 50%,rgba(34,193,182,.38),transparent 70%)}
.pad{position:relative;z-index:2;padding:64px 72px;height:100%;display:flex;flex-direction:column;justify-content:space-between}
.mark{font-family:'Bricolage Grotesque';font-weight:800;font-size:26px;letter-spacing:.14em;color:#22c1b6}
h1{font-family:'Bricolage Grotesque';font-weight:700;font-size:72px;line-height:1.04;letter-spacing:-.02em;max-width:16ch}
.line{font-family:'Bricolage Grotesque';font-weight:700;font-size:27px;color:#22c1b6;margin-top:22px;max-width:30ch}
.rows{display:flex;gap:14px;margin-top:30px;flex-wrap:wrap}
.pill{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.2);border-radius:999px;
  padding:9px 18px;font-size:20px;font-weight:600}
.pill b{font-family:'Bricolage Grotesque';font-weight:800}
.foot{display:flex;align-items:baseline;justify-content:space-between;border-top:1px solid rgba(255,255,255,.18);padding-top:22px}
.foot p{font-size:22px;color:rgba(255,255,255,.82)}
.foot span{font-family:'JetBrains Mono';font-size:20px;color:rgba(255,255,255,.6)}
</style></head><body><div class="pad">
  <div>
    <p class="mark">WAYPOINT LEDGER</p>
    <h1 style="margin-top:26px">What did your diagnostic search actually cost?</h1>
    <p class="line">The care you needed and never got produces $0 in federal data.</p>
    <div class="rows">
      <span class="pill">CMS fee schedules</span>
      <span class="pill">MEPS</span>
      <span class="pill">HCUP</span>
      <span class="pill">BLS</span>
    </div>
  </div>
  <div class="foot">
    <p>Every figure cited to a published federal file. Never invented.</p>
    <span>waypoint-ledger.pages.dev</span>
  </div>
</div></body></html>`;

const tmp = path.join(ROOT, '.og.tmp.html');
fs.writeFileSync(tmp, html);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(tmp).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: OUT });
await browser.close();
fs.unlinkSync(tmp);
const { width, height } = pngSize(fs.readFileSync(OUT));
console.log(`wrote ${OUT} — ${width}x${height}, ${fs.statSync(OUT).size} bytes`);
if (width !== 1200 || height !== 630) { console.error('WRONG SIZE'); process.exit(1); }

function pngSize(buf) {
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/* ==========================================================================
   THE HOME PAGE'S AUDIT COUNT, written from data/AUDIT.json (judge panel 15 Oct B-5).

   /method prints "{pass} of {rows} rows reproduce from their source file" from
   data/AUDIT.json, the row-by-row audit data/verify_price_table.py writes. The
   home proof strip says the same count, and the audit file is 211 KB, so this
   writes its two numbers beside it at build time (cf/build-static.sh runs it),
   as gen-conditions-count.mjs does for the condition count.
   tests/proof-strip-1015.test.ts fails if the two ever disagree.

   Run: node scripts/gen-audit-count.mjs
   ========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const audit = JSON.parse(readFileSync(join(ROOT, 'data', 'AUDIT.json'), 'utf8'));
const out = { _from: 'data/AUDIT.json, by scripts/gen-audit-count.mjs', rows: audit.rows, pass: audit.pass, audited: audit.generated };
const path = join(ROOT, 'data', 'audit-count.json');
const next = JSON.stringify(out, null, 2) + '\n';
let prev = '';
try { prev = readFileSync(path, 'utf8'); } catch { /* first run */ }
if (prev !== next) writeFileSync(path, next);
console.log(`data/audit-count.json: ${out.pass} of ${out.rows} rows reproduce`);

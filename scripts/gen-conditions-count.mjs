/* ==========================================================================
   THE HOME PAGE'S CONDITION COUNT, written from data/conditions.json.

   The home page says "N conditions, and adding one changes no code". It used to
   import the whole condition file (about 116 KB before minifying) to read one
   length, which put the file on every visitor's first load. This writes that one
   number beside the file at build time (cf/build-static.sh runs it), so adding a
   condition to data/conditions.json still changes the count with no code
   changed. tests/perf-conditions-count.test.ts fails if the two ever disagree.

   Run: node scripts/gen-conditions-count.mjs
   ========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = JSON.parse(readFileSync(join(ROOT, 'data', 'conditions.json'), 'utf8'));
const out = { _from: 'data/conditions.json, by scripts/gen-conditions-count.mjs', conditions: file.conditions.length };
const path = join(ROOT, 'data', 'conditions-count.json');
const next = JSON.stringify(out, null, 2) + '\n';
let prev = '';
try { prev = readFileSync(path, 'utf8'); } catch { /* first run */ }
if (prev !== next) writeFileSync(path, next);
console.log(`data/conditions-count.json: ${out.conditions} conditions`);

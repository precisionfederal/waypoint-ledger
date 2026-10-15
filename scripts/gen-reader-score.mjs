/* ==========================================================================
   THE READER'S SCORE FOR /method, written from the files that record it
   (judge panel 15 Oct B-6).

   The rules-only F1 is the "rules only (no model)" row of
   data/test-fixtures/READER-EVAL.md (the 209-sentence corpus); the reader's F1
   and its wrong units are the 30 Sep run in the header of
   cf/functions/api/map.js, whose first row must be the model the reader calls
   first (OPENAI_MODELS[0]). The static build does not carry cf/, so the figures
   are written beside the eval at build time (cf/build-static.sh runs this), as
   gen-audit-count.mjs does for the audit. tests/reader-score-1015.test.ts fails
   if the file and the sources ever disagree.

   Run: node scripts/gen-reader-score.mjs
   ========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The score as both files say it, or null when either no longer says it in this shape. */
export function readerScore(evalMd, mapJs) {
  const corpus = /^Corpus: .*?(\d+) sentences/m.exec(evalMd);
  const rules = /^\| rules only \(no model\) \| [^|]+\| [^|]+\| \*\*([\d.]+%)\*\* \|/m.exec(evalMd);
  const run = /(\d{4}-\d{2}-\d{2}), one run, same conditions[^\n]*\n\s*([\w.-]+)\s+F1 ([\d.]+)\s.*?\s(\d+) wrong units added/.exec(mapJs);
  const first = /OPENAI_MODELS = \['([^']+)'/.exec(mapJs);
  if (!corpus || !rules || !run || !first || run[2] !== first[1]) return null;
  return {
    sentences: Number(corpus[1]),
    rulesF1: rules[1],
    readerF1: `${run[3]}%`,
    wrongUnitsAdded: Number(run[4]),
    scoredOn: run[1],
    model: run[2],
  };
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const score = readerScore(
    readFileSync(join(ROOT, 'data', 'test-fixtures', 'READER-EVAL.md'), 'utf8'),
    readFileSync(join(ROOT, 'cf', 'functions', 'api', 'map.js'), 'utf8'),
  );
  if (!score) { console.error('reader score: READER-EVAL.md or map.js no longer says it; /method shows no score card'); process.exit(1); }
  const out = { _from: 'data/test-fixtures/READER-EVAL.md and cf/functions/api/map.js, by scripts/gen-reader-score.mjs', ...score };
  const path = join(ROOT, 'data', 'reader-score.json');
  const next = JSON.stringify(out, null, 2) + '\n';
  let prev = '';
  try { prev = readFileSync(path, 'utf8'); } catch { /* first run */ }
  if (prev !== next) writeFileSync(path, next);
  console.log(`data/reader-score.json: F1 ${score.rulesF1} rules only, ${score.readerF1} with ${score.model}`);
}

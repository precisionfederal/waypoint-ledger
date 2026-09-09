#!/usr/bin/env node
/* ==========================================================================
   public/build.json — the build says what it is.

   Round 2's finding was not that a deploy failed. It was that nothing on the
   live site identified WHICH code was answering, so "we fixed that" and "the
   site does that" were two different claims with no way to join them. A judge
   loading the site on 22 October must be able to name the build in front of
   them, and so must we.

   Written before every build (npm run build:static, npm run deploy). It is
   committed as well, so a build from a checkout with no git present still
   serves the last known truth rather than a placeholder.
   ========================================================================== */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => {
  try { return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
};
const readJson = (p) => { try { return JSON.parse(readFileSync(join(ROOT, p), 'utf8')); } catch { return {}; } };

const commit = git('rev-parse', 'HEAD');
/* Dirty is judged against THIS app only: the repository around it carries other
   work, and a stamp that is always dirty tells nobody anything. */
const dirty = Boolean(git('status', '--porcelain', '--', ROOT));
const prices = readJson('data/prices.json');
const pkg = readJson('package.json');

/* One definition of the survey version: the instrument's own file. */
let surveyVersion = '';
try {
  const src = readFileSync(join(ROOT, 'lib/survey-def.js'), 'utf8');
  surveyVersion = (src.match(/SURVEY_VERSION\s*=\s*'([^']+)'/) || [])[1] || '';
} catch { surveyVersion = ''; }

const build = {
  commit: commit || 'unknown',
  shortCommit: commit ? commit.slice(0, 9) : 'unknown',
  dirty,
  builtAt: new Date().toISOString(),
  tableVersion: prices._version || 'unknown',
  publishedFigures: Array.isArray(prices.items) ? prices.items.length : 0,
  surveyVersion: surveyVersion || 'unknown',
  appVersion: pkg.version || '0.0.0',
};

/* A DEPLOY MAY NOT STAMP A TREE THAT MATCHES NO COMMIT.

   Round 3 read live /build.json as `a982b3bc4, dirty: true` while the round's
   work sat at a different commit thirty-eight minutes later: the published
   artifact matched nothing anybody could read. scripts/deploy.sh sets
   PF_REQUIRE_CLEAN=1, so the refusal lives here — at the one place that writes
   the stamp — and an ordinary local build still works on a dirty tree, which is
   what a dirty tree is for. ALLOW_DIRTY=1 is the deliberate override, and the
   stamp still says dirty:true so the site never lies about it. */
if (dirty && process.env.PF_REQUIRE_CLEAN === '1' && process.env.ALLOW_DIRTY !== '1') {
  console.error('build.json REFUSED: the working tree is dirty, so this build would match no commit.');
  console.error('Commit the changes, or run with ALLOW_DIRTY=1 to publish an unnamed build on purpose.');
  process.exit(1);
}

const out = join(ROOT, 'public/build.json');
writeFileSync(out, JSON.stringify(build, null, 2) + '\n');
console.log(`build.json  ${build.shortCommit}${build.dirty ? '+dirty' : ''}  table ${build.tableVersion}  ${build.builtAt}`);

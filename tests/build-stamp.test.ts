/* ==========================================================================
   THE BUILD SAYS WHAT IT IS, AND THE DEPLOY PROVES ITSELF.

   Round 2: the deploy was build → migrate → publish, with no test, no verify
   and nothing on the site identifying which code was answering. "We fixed
   that" and "the site does that" were two claims with no way to join them.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import build from '../public/build.json';
import { BUILD } from '../cf/functions/api/health.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('public/build.json', () => {
  it('names the commit, the moment and the price table', () => {
    expect(build.commit === 'unknown' || /^[0-9a-f]{40}$/.test(build.commit)).toBe(true);
    expect(build.shortCommit.length).toBeGreaterThanOrEqual(7);
    expect(build.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(build.tableVersion).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(build.surveyVersion).toMatch(/^\d{4}-\d{2}-\d{2}\./);
    expect(typeof build.dirty).toBe('boolean');
    expect(build.publishedFigures).toBeGreaterThan(50);
  });

  it('is what /api/health serves — one stamp, never a second copy', () => {
    expect(BUILD.commit).toBe(build.shortCommit);
    expect(BUILD.fullCommit).toBe(build.commit);
    expect(BUILD.tableVersion).toBe(build.tableVersion);
    expect(BUILD.publishedFigures).toBe(build.publishedFigures);
  });
});

describe('the deploy cannot finish red', () => {
  /* Round 3: the gate ran AFTER the upload, so a red light could only report on
     a site the public was already reading. The deploy is now one script, and
     these are its two load-bearing properties. Comment lines are stripped: the
     script's header quotes the old command verbatim so the next reader knows
     what was wrong with it. */
  const deploy: string = pkg.scripts.deploy;
  const sh: string = readFileSync(new URL('../scripts/deploy.sh', import.meta.url), 'utf8')
    .split('\n').filter((l: string) => !/^\s*#/.test(l)).join('\n');

  it('is one script, and nothing else in package.json can publish', () => {
    expect(deploy).toBe('bash scripts/deploy.sh');
    for (const [name, cmd] of Object.entries(pkg.scripts as Record<string, string>)) {
      if (name.startsWith('deploy')) continue;
      expect(cmd, `${name} must not publish`).not.toContain('pages deploy');
    }
  });

  it('runs the unit suite, builds, and proves the whole stack locally BEFORE it publishes', () => {
    const order = ['tsc --noEmit', 'npm test', 'build:static', 'verify-live.sh', 'shots2/e2e.mjs', 'db:migrate:remote', 'pages deploy'];
    let at = -1;
    for (const step of order) {
      const i = sh.indexOf(step);
      expect(i, `deploy.sh is missing "${step}"`).toBeGreaterThan(-1);
      expect(i, `deploy.sh runs "${step}" out of order`).toBeGreaterThan(at);
      at = i;
    }
  });

  it('stops on a red step instead of carrying on to the upload', () => {
    /* Every gate is `... || die`, and die() exits non-zero after saying that
       nothing was published. */
    expect(sh).toMatch(/die\(\)\s*\{[^}]*exit 1/s);
    expect((sh.match(/\|\| die/g) || []).length).toBeGreaterThanOrEqual(6);
    expect(sh).not.toContain('--commit-dirty');
  });

  it('stamps the build before it builds, so the site can name itself', () => {
    expect(pkg.scripts['build:static']).toContain('build:info');
    expect(pkg.scripts['build:info']).toContain('gen-build-json.mjs');
    expect(pkg.scripts['dev:full']).toContain('build:static');
  });

  it('verifies the write path as part of verifying the live site', () => {
    const live = readFileSync(new URL('../cf/verify-live.sh', import.meta.url), 'utf8');
    expect(live).toContain('verify-write.sh');
    const write = readFileSync(new URL('../cf/verify-write.sh', import.meta.url), 'utf8');
    expect(write).toContain('dry=1');
    expect(write).toContain('/api/health');
    expect(write).toMatch(/did not move|rowsLeftBehind/);
  });
});

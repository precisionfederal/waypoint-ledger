/* FLOW4 flow4-5 (2026-10-01): the /adopt steps are true end to end.
   On the published archive, the page's block ran npm install and npm test, and
   npm test exited 1: the size budgets need the static export (npm run
   build:static, missing from the block), and a gate test read shots2/ files the
   archive leaves out. The hero said "three commands" over a block of five. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../components/Adopt.tsx', import.meta.url), 'utf8');
const runIt = src.match(/const RUN_IT = `([\s\S]*?)`;/)![1];
const local = runIt.split('# the full stack')[0];
const npm = local.split('\n').map((l) => l.trim()).filter((l) => /^npm /.test(l)).map((l) => l.replace(/\s+#.*$/, ''));
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

describe('flow4-5 the /adopt run steps', () => {
  it('build the static export before the tests, as the README does', () => {
    expect(npm).toEqual(['npm install', 'npm run build:static', 'npm test', 'npm run dev']);
  });
  it('the hero and the card count the commands the block shows', () => {
    const n = WORDS[npm.length];
    expect(src).toContain(`it runs on your own machine in ${n} commands.`);
    expect(src).toContain(`effort: 'One download, ${n} commands'`);
  });
  it('the agency kit names the same steps', () => {
    const kit = readFileSync(new URL('../components/OrgKitAgency.tsx', import.meta.url), 'utf8');
    expect(kit).toContain('<code>npm install</code>, <code>npm run build:static</code> and <code>npm test</code>');
  });
  it('flow4-13: the second fold says what it holds, so no two folds claim "three commands"', () => {
    expect(src).toContain('<ShowCall flat label="the two checks and the test suite"');
    expect(src).not.toContain('three commands');
  });
});

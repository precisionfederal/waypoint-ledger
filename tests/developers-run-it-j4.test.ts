/* FLOW4 flow4-5, the /developers half: /adopt now runs the archive in four
   commands (npm install, build:static, test, dev; fix-flow4 0a4fd29b27). The
   /developers block showed "npm install && npm test" and the prose said three
   commands. Both now match /adopt word for word. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CURL_TAKE_IT } from '../components/Developers';

const src = readFileSync(new URL('../components/Developers.tsx', import.meta.url), 'utf8');
const npm = CURL_TAKE_IT.split('\n').map((l) => l.trim()).filter((l) => /^npm /.test(l));

describe('/developers runs the archive the way /adopt does', () => {
  it('shows the same four npm lines as /adopt, comments included', () => {
    expect(npm).toEqual([
      'npm install',
      'npm run build:static        # the static export the size budgets measure',
      'npm test                    # the suite that guards every rule below',
      'npm run dev                 # http://localhost:3000',
    ]);
  });
  it('counts four commands in the words /adopt uses', () => {
    expect(src.replace(/\s+/g, ' ')).toContain('it runs on your own machine in four commands');
    expect(src).not.toMatch(/three\s+commands/);
  });
});

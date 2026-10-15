/* QA sweep 15 Oct: /walkthrough was linked from nowhere on the site. It is now a plain
   link in the home hero and in the footer's "For you" list; no embed, no autoplay. */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const home = readFileSync('app/page.tsx', 'utf8');
const shell = readFileSync('components/Shell.tsx', 'utf8');
const page = readFileSync('app/walkthrough/page.tsx', 'utf8');

describe('the walkthrough is linked', () => {
  it('the page exists and carries a captions track, so the link may say so', () => {
    expect(existsSync('app/walkthrough/page.tsx')).toBe(true);
    expect(page).toMatch(/<track kind="captions"/);
  });
  it('home links it in the hero, as a link only', () => {
    expect(home).toContain('<Link href="/walkthrough">Watch the walkthrough, with captions</Link>');
    expect(home).not.toMatch(/<video\b|autoPlay/);
  });
  it('the footer\'s For you list links it', () => {
    const forYou = shell.slice(shell.indexOf("head: 'For you'"), shell.indexOf("head: 'For agencies and developers'"));
    expect(forYou).toContain("{ href: '/walkthrough', label: 'Watch the walkthrough, with captions', footerOnly: true }");
  });
});

describe('B-8: the walkthrough title matches the player (1:25)', () => {
  it('says under two minutes', () => {
    expect(page).toContain('Waypoint Ledger in under two minutes</h1>');
    expect(page).not.toContain('Waypoint Ledger in two minutes');
  });
});

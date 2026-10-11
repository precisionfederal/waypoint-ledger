/* JUDGE-3 #13: "Not a diagnostic device. Not medical, legal or financial advice."
   sat behind an unlabeled (i) under the theme switch on every page. It is one
   printed footer line now, outside the fold; the fold keeps the rest. Read from
   the source, the way shell-r2.test.ts pins the frame. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const shell = readFileSync(new URL('../components/Shell.tsx', import.meta.url), 'utf8');
const foot = shell.slice(shell.indexOf('function Footer()'), shell.indexOf('const INSTALL_DISMISSED'));
const LINE = 'Not a diagnostic device. Not medical, legal or financial advice.';

describe('JUDGE-3 #13: the safety line is visible in the footer', () => {
  it('is printed once, as its own paragraph, before the fold', () => {
    expect(foot.split(LINE).length - 1).toBe(1);
    const at = foot.indexOf(`<p className="micro">${LINE}</p>`);
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(foot.indexOf('<FinePrint'));
  });
  it('the fold keeps the rest, word for word', () => {
    const fold = foot.slice(foot.indexOf('<FinePrint'), foot.indexOf('</FinePrint>'));
    expect(fold).toContain('Built in the TOPx HHS Tech Sprint for AI and Invisible Illness, Cost of Illness track.');
    expect(fold).toContain('Your journey stays in your browser. A correction you choose to send contains no personal information.');
    expect(fold).not.toContain('Not a diagnostic device');
  });
});

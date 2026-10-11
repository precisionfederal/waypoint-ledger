/* ==========================================================================
   SHELL, round 2 (2026-09-30): the frame's promises, read from the source.

   The browser measurements live in the round-2 report (R2-shell.md); these
   pin the decisions so a later edit cannot quietly undo them.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import build from '../public/build.json';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const shell = read('components/Shell.tsx');
const account = read('components/Account.tsx');
const dashboard = read('components/AccountDashboard.tsx');
const layout = read('app/layout.tsx');
const sw = read('public/sw.js');
const css = read('app/globals.css');
const authClient = read('lib/auth-client.ts');

describe('Sign in is in the header on every page (R1 auth F2, desktop F11)', () => {
  it('the frame renders the account link beside the one button', () => {
    expect(shell).toMatch(/<div className="bar-right">[\s\S]*<AccountLink \/>[\s\S]*nav-cta/);
    expect(shell).toContain("'Sign in'");
    expect(shell).toContain("'Your account'");
  });
  it('reads the same signed-in hint auth-client writes, one key, two readers', () => {
    const key = /const HINT = '([^']+)'/.exec(authClient)?.[1];
    expect(key).toBeTruthy();
    expect(shell).toContain(`const SIGNED_IN_HINT = '${key}'`);
  });
  it('an anonymous visitor makes no request: /api/me is asked only when the hint is set', () => {
    expect(shell).toMatch(/if \(!readHint\(\)\) \{ setWho\(null\); return; \}[\s\S]*fetch\('\/api\/me'/);
  });
  it('/account tells the header when the user changes, so no reload is needed', () => {
    expect(account).toContain('new CustomEvent(AUTH_EVENT');
    expect(shell).toContain("export const AUTH_EVENT = 'wl:auth'");
  });
  it('the link does not pull the sign-in flow into every page', () => {
    expect(shell).not.toMatch(/from '\.\/Account'/);
    expect(shell).not.toMatch(/from '@\/lib\/auth-client'/);
  });
  it('section prefixes mark the header link current (UXM-20)', () => {
    expect(shell).toContain('path.startsWith(`${n.href}/`)');
  });
});

describe('/account opens on Sign in', () => {
  it('Sign in first, two tabs, the forgotten password as a link under the field', () => {
    expect(account).toContain("useState<Door>('signin')");
    expect(account).toContain("[['signin', 'Sign in'], ['signup', 'Create an account']]");
    expect(account).not.toContain("['recover', 'I forgot my password']");
    expect(account).toMatch(/className="link-btn" onClick=\{\(\) => \{ setDoor\('recover'\)/);
    expect(account).toContain('<h1>Sign in to keep your ledger on every device</h1>');
  });
  it('signed out, /account/journeys offers Sign in, not a red alert (desktop F23)', () => {
    expect(dashboard).toContain('Sign in to see the ledgers you saved');
    expect(dashboard).toMatch(/if \(u === null\) \{ setSignedOut\(true\)/);
  });
});

describe('the service worker changes with every build (UXM-24)', () => {
  it('the layout registers /sw.js with the build stamp from public/build.json', () => {
    expect(layout).toContain("import build from '@/public/build.json'");
    expect(layout).toContain("register('/sw.js?v=${SW_VERSION}')");
    expect(layout).toMatch(/build\.shortCommit[\s\S]*build\.builtAt/);
    expect(build.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it('the worker names its caches from that stamp, and activate drops every other wl- cache', () => {
    expect(sw).toContain("searchParams.get('v')");
    expect(sw).toMatch(/const VERSION = `wl-\$\{STAMP \|\|/);
    expect(sw).toContain("k.startsWith('wl-') && !MINE.includes(k)");
  });
});

describe('globals.css keeps the round-2 floors', () => {
  it('the hero glow and the CTA band route through --btn-shadow, so focus shows the ring (desktop F08)', () => {
    expect(css).toContain('.hero .btn.primary{background:var(--accent-2);color:#0e2a3a;box-shadow:var(--btn-shadow,');
    expect(css).toContain('.cta-band .btn.primary{background:#fff;color:var(--brand-fill);box-shadow:var(--btn-shadow,none)}');
  });
  it('44 px targets follow the pointer, not only the width (UXM-16)', () => {
    expect(css).toMatch(/@media \(pointer:coarse\)\{[\s\S]*\.btn\.small,\.btn\.sm\{min-height:44px\}/);
  });
  it('scroll padding, safe-area gutters and the wordmark rule are present (UXM-19, UXM-12, UXM-04)', () => {
    expect(css).toContain('html{scroll-padding-top:4.5rem}');
    expect(css).toContain('env(safe-area-inset-left)');
    expect(css).toContain('env(safe-area-inset-right)');
    expect(css).toMatch(/@media \(max-width:479px\)\{\s*header\.site \.brand \.name\{position:absolute/);
  });
  it('the checkbox is a 24 px box in a 44 px row (auth S4)', () => {
    expect(css).toContain('.check input{width:1.5rem;height:1.5rem');
    expect(css).toContain('.check label{flex:1 1 auto;min-height:44px');
  });
});

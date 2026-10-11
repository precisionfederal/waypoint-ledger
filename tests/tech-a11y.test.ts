/* VISUAL tech (2026-09-30 night): /accessibility draws its contrast figures
   from colour pairs (components/tech/A11yVisuals.tsx). The pairs must be the
   DESIGN R1 tokens they name, and each computed ratio must be the figure the
   page states in words, so the picture and the sentence never disagree. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { contrast, PAIRS, PAIRS_DARK, TOK, TOK_DARK } from '../components/tech/A11yVisuals';

const globals = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/accessibility/page.tsx', import.meta.url), 'utf8');
const root = globals.slice(globals.indexOf(':root{'), globals.indexOf('@media (prefers-color-scheme: dark)'));
const tok = (name: string, block = root) => (new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(block) ?? [])[1]?.toLowerCase();
/* the opt-in night theme block, the one the toggle sets (the OS-preference block carries the same values) */
const darkAt = globals.indexOf(':root[data-theme="dark"]{');
const dark = globals.slice(darkAt, globals.indexOf('}', darkAt));

describe('/accessibility: the drawn ratios are the measured ones', () => {
  it('each colour is the light token it names', () => {
    expect(TOK.ground).toBe(tok('ground'));
    expect(TOK.surface).toBe(tok('surface'));
    expect(TOK.ink).toBe(tok('ink'));
    expect(TOK.ink2).toBe(tok('ink-2'));
    expect(TOK.ink3).toBe(tok('ink-3'));
    expect(TOK.accentInk).toBe(tok('accent-ink'));
    expect(TOK.brandFill).toBe(tok('brand-fill'));
    expect(globals + readFileSync(new URL('../app/product.css', import.meta.url), 'utf8')).toContain(`border-color:${TOK.field}`);
  });
  it('each computed ratio is a figure the page states, and clears the rule it is drawn against', () => {
    const stated = ['15.93', '17.22', '9.36', '5.83', '5.80', '16.42', '5.80', '6.28', '3.26', '3.02'];
    PAIRS.forEach((p, i) => {
      const r = contrast(p.fg, p.bg);
      expect(r.toFixed(2), p.what).toBe(stated[i]);
      expect(page).toContain(`${stated[i]}:1`);
      expect(r).toBeGreaterThanOrEqual(p.need);
    });
    expect(contrast(TOK.fieldOld, TOK.surface).toFixed(2)).toBe('1.27');
  });
  it('says the stated ratios are the light theme\'s (JUDGE-2 #10: a dark theme switch exists)', () => {
    expect(page).toContain('The ratios in the cards below are for the light theme.');
    expect(page).toContain('running text on the page background, light theme');
    expect(page).toContain('In the light theme, running text is <strong>15.93:1</strong>');
  });
  it('the dark board is computed the same way, from the merged dark tokens (vis-tech cd80493462, re-merge)', () => {
    expect(TOK_DARK.ground).toBe(tok('ground', dark));
    expect(TOK_DARK.surface).toBe(tok('surface', dark));
    expect(TOK_DARK.ink).toBe(tok('ink', dark));
    expect(TOK_DARK.ink2).toBe(tok('ink-2', dark));
    expect(TOK_DARK.ink3).toBe(tok('ink-3', dark));
    expect(TOK_DARK.accentInk).toBe(tok('accent-ink', dark));
    expect(TOK_DARK.brandFill).toBe(tok('brand-fill', dark));
    expect(TOK_DARK.onBrand).toBe(tok('on-brand', dark));
    expect(TOK_DARK.ring).toBe(tok('accent-2', dark));
    expect(dark).toContain('--ring:0 0 0 2px var(--surface),0 0 0 4px var(--accent-2)');
    expect(readFileSync(new URL('../app/product.css', import.meta.url), 'utf8')).toContain(`select{border-color:${TOK_DARK.field}}`);
    const pinned = ['17.86', '14.61', '13.65', '9.51', '12.61', '8.27', '11.56', '9.45', '4.54', '5.55'];
    PAIRS_DARK.forEach((p, i) => {
      const r = contrast(p.fg, p.bg);
      expect(r.toFixed(2), p.what).toBe(pinned[i]);
      expect(r).toBeGreaterThanOrEqual(p.need);
      expect(p.what).toBe(i === 5 ? 'Dark text on the primary button' : PAIRS[i].what);
    });
    expect(page).toContain('<ContrastBoard pairs={PAIRS_DARK} theme="dark" />');
  });
});

/* UX-3 · the dark theme, enforced.

   "Feels flat" is a measurement. This wraps scripts/contrast-check.mjs — the
   same script a person runs by hand — so a token edit that drops a pair below
   its floor fails in `npm test` instead of on a judge's screen at the demo.
   The script reads app/globals.css itself; nothing here holds a copy of a value. */
import { describe, it, expect } from 'vitest';
import { PAIRS, STEPS, check, readThemes, ratio } from '../scripts/contrast-check.mjs';

const t = readThemes();

describe('UX-3 — the dark theme clears its floors', () => {
  for (const name of ['dark', 'darkMedia'] as const) {
    it(`${name}: every text pair and every tone step passes`, () => {
      const failing = check(t[name], { strict: true }).filter((r) => !r.pass)
        .map((r) => `--${r.fg} on --${r.bg} = ${r.r === null ? 'missing' : r.r.toFixed(2)}:1 (min ${r.min})`);
      expect(failing, failing.join('\n')).toEqual([]);
    });
  }

  it('the two dark blocks are the same theme, token for token', () => {
    const drift = Object.keys(t.dark).filter((k) => t.darkMedia[k] !== t.dark[k]);
    expect(drift, `these tokens disagree between the media query and [data-theme=dark]: ${drift.join(', ')}`).toEqual([]);
  });

  it('body text in the drawer clears AAA and secondary text clears AA', () => {
    expect(ratio(t.dark.ink, t.dark['surface-2'])).toBeGreaterThanOrEqual(7);
    expect(ratio(t.dark['ink-2'], t.dark['surface-2'])).toBeGreaterThanOrEqual(7);
    expect(ratio(t.dark['ink-3'], t.dark['surface-2'])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t.dark['ink-4'], t.dark['surface-2'])).toBeGreaterThanOrEqual(4.5);
  });

  it('the light theme carries the DESIGN R1 values (2026-09-30)', () => {
    /* This lane does not own the light values. DESIGN R1 re-set them on purpose
       (light, one cool off-white, ink navy text); the check is that they are the
       ones that redesign shipped, and every light text pair still clears AA. */
    expect(t.light.ground).toBe('#f5f6f8');
    expect(t.light.surface).toBe('#ffffff');
    expect(t.light.ink).toBe('#111c27');
    expect(t.light['ink-2']).toBe('#364350');
    expect(t.light['ink-3']).toBe('#556170');
    expect(t.light['ink-4']).toBe('#5c6876');
    const failing = check(t.light, { strict: false }).filter((r) => !r.pass && r.min >= 3)
      .map((r) => `--${r.fg} on --${r.bg} = ${r.r === null ? 'missing' : r.r.toFixed(2)}:1 (min ${r.min})`);
    expect(failing, failing.join('\n')).toEqual([]);
  });

  it('the table it enforces covers the drawer, not just the page', () => {
    const covered = PAIRS.map(([fg, bg]) => `${fg}|${bg}`);
    for (const need of ['ink-2|surface-2', 'ink-3|surface-2', 'brand-3|surface', 'on-brand|brand-fill']) {
      expect(covered).toContain(need);
    }
    expect(STEPS.length).toBeGreaterThanOrEqual(3);
  });
});

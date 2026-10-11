import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/* The dark theme's form-field edge is a non-text UI boundary, so WCAG 1.4.11 asks for 3:1 against
   every surface a field can sit on. The edge colour and the five dark tiers are read from the CSS
   itself, so a later token change that drops a pair below 3:1 fails here. */
const app = path.resolve(__dirname, '..');
const product = readFileSync(path.join(app, 'app/product.css'), 'utf8');
const globals = readFileSync(path.join(app, 'app/globals.css'), 'utf8');
const darkAt = globals.indexOf(':root[data-theme="dark"]{');
const dark = globals.slice(darkAt, globals.indexOf('}', darkAt));
const tok = (name: string) => {
  const m = dark.match(new RegExp(`--${name}:(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`dark token --${name} not found`);
  return m[1];
};
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('dark field edge (WCAG 1.4.11)', () => {
  const edge = product.match(/:root\[data-theme="dark"\] select\{border-color:(#[0-9a-fA-F]{6})\}/)?.[1];
  it('is set in product.css', () => { expect(edge).toBe('#77899c'); });
  for (const tier of ['surface-3', 'surface-2', 'surface', 'ground-2', 'ground']) {
    it(`clears 3:1 on --${tier}`, () => { expect(ratio(edge!, tok(tier))).toBeGreaterThanOrEqual(3); });
  }
  it('matches the ratios its comment states', () => {
    expect(ratio(edge!, tok('surface-3')).toFixed(2)).toBe('3.25');
    expect(ratio(edge!, tok('ground')).toFixed(2)).toBe('5.55');
  });
});

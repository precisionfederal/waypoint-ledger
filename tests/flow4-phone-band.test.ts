/* FLOW4 flow4-11 (2026-10-01): on a phone the "Time spent searching" band
   repeats the months already under the total, so it steps aside there. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('flow4-11 the duplicate band on a phone', () => {
  const tsx = readFileSync('components/Ledger.tsx', 'utf8');
  const css = readFileSync('components/Ledger.module.css', 'utf8');
  it('is marked only when the search line under the total carries the months', () => {
    expect(tsx).toContain("...(searched?.includes(' searching') ? { phoneDup: true as const } : {})");
    expect(tsx).toContain("${c.phoneDup ? ` ${ls.phoneDup}` : ''}");
  });
  it('is hidden under 480 px, outranking core.css .ledger-top>.ledger-figs>*', () => {
    expect(css).toMatch(/@media \(max-width:479\.98px\)\{\s*:global\(\.ledger-figs\)>\.phoneDup\.phoneDup\{display:none\}\s*\}/);
  });
});

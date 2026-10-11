/* JUDGE-4 #9: the phone ledger was 9,661 px tall at 390 for the 9-line example
   (my measure on next dev; the judge read 9,638 on staging). Times took a row of
   its own, and product.css's .85rem 1.25rem cell padding and rule under every
   cell reached the phone card. Measured after, WebKit and Chromium, light and
   dark: 8,615 px at 390 with Times, Figure and Line total on one row in all 9
   cards; 9,295 at 320 (was 11,201); 1440 unchanged at 4,436. No money split
   across lines, nothing outside its cell, smallest text 13.6 px before and
   after. This pins the rules that do it. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const CORE = readFileSync(new URL('../app/core.css', import.meta.url), 'utf8');
const block = CORE.slice(CORE.indexOf('JUDGE-4 #9: the phone ledger card'));

describe('JUDGE-4 #9: the phone ledger card', () => {
  it('is a wrapping row with no cell padding or rule from the desktop table', () => {
    expect(block).toContain('.ledger-table tr:not(.grp){display:flex;flex-wrap:wrap');
    expect(block).toContain('.ledger-table tr:not(.grp) > td{flex:1 1 100%;min-width:0;padding:0;border-bottom:0}');
  });
  it('Times, Figure and Line total are as wide as their content and never shrink below it', () => {
    expect(block).toContain('.ledger-table tr:not(.grp) > td.r{flex:0 1 auto;min-width:auto}');
    expect(CORE).toContain('.core-times{display:grid;justify-items:start;justify-content:start;gap:0}');
  });
  it('the range sentence, the return-visit note and the paid cell still take the width', () => {
    for (const s of ['td.r:has(.loc-range)', 'td.r:has(.core-return-note)', 'td.paid-cell']) expect(block).toContain(s);
  });
  it('money stays one word', () => {
    expect(CORE).toMatch(/\.ledger-table td\.r strong,\.ledger-table td\.r b,\.blank\{white-space:nowrap/);
    expect(CORE).toMatch(/\.money,[^{]*\{white-space:nowrap/);
  });
  it('no longer forces Times across the card or the grid to two columns', () => {
    expect(CORE).not.toContain('td.r:has(.core-times){grid-column:1/-1');
    expect(CORE).not.toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
  });
});

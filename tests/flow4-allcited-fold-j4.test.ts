/* FLOW4 flow4-11, the core.css half: on a phone "Every visit and test carries a
   published federal figure" folds into the (i) beside the line count, the band
   it leaves empty is not drawn, and the gap above the table tightens. Child
   celiac story, 390x664 (iPhone 13 WebKit; Chromium the same), first ledger row
   top: 799 px with neither half, 737 with fix-flow4's band half, 729 with this
   half alone, 653 with both. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const CORE = read('app/core.css');
const TR = read('components/TotalReveal.tsx');
const LEDGER = read('components/Ledger.tsx');

describe('flow4-11: the all-cited sentence on a phone', () => {
  it('the (i) carries the sentence only when every line has a figure', () => {
    expect(TR).toContain('{allCited && <p className="core-allcited-fp">Every visit and test carries a published federal figure.</p>}');
    expect(LEDGER).toContain('allCited={blankLines === 0}');
  });
  it('shows it in the (i) on a phone and in the band above 720 px, never both', () => {
    expect(CORE).toContain('.core-allcited-fp{display:none}');
    const phone = CORE.slice(CORE.indexOf('.core-allcited-fp{display:none}'));
    expect(phone).toMatch(/@media \(max-width:720px\)\{\s*\.ledger-top>\.ledger-figs>\.core-allcited\.core-allcited\{display:none\}\s*\.core-allcited-fp\{display:block\}/);
  });
  it('an emptied band is not drawn', () => {
    expect(CORE).toContain('.ledger-figs:not(:has(> :not(.core-allcited))){display:none}');
    expect(CORE).toContain('.ledger-figs:not(:has(> :not(.core-allcited):not([class*="phoneDup"]))){display:none}');
  });
});

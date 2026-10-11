/* JUDGE-5 #10: on the phone ledger, Right and Wrong took a line of their own
   under Remove. From 384 px Remove now sits at the card's bottom left, beside
   the thumbs (the card's last cell). Measured on the 9-line example, WebKit and
   Chromium, light and dark: 8,479 -> 8,083 px at 390 (table 3,199 -> 2,803),
   8,165 at 384; 375, 360, 320 and 1440 unchanged. Remove's top equals the
   thumbs' top on all 9 cards at 384, 390 and 600, and touches none of them. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const CORE = readFileSync(new URL('../app/core.css', import.meta.url), 'utf8');
const block = CORE.slice(CORE.indexOf('JUDGE-5 #10: Right and Wrong share a line with Remove'));

describe('JUDGE-5 #10: Remove beside Right and Wrong on the phone card', () => {
  it('applies from 384 px to the phone breakpoint only', () => {
    expect(block).toContain('@media (min-width:384px) and (max-width:720px){');
  });
  it('anchors Remove at the card padding (1rem 1.1rem), bottom left', () => {
    expect(block).toContain('.ledger-table tr:not(.grp):has(> td.verdict){position:relative}');
    expect(block).toContain('.core-times .core-remove{position:absolute;left:1.1rem;bottom:1rem;width:3.75rem;padding:0}');
    expect(readFileSync(new URL('../app/product.css', import.meta.url), 'utf8')).toContain('.ledger-table tr:not(.grp){padding:1rem 1.1rem}');
  });
  it('keeps Remove\'s width free in the thumbs cell and a 44 px line for it', () => {
    expect(block).toContain('.ledger-table tr:not(.grp) > td.verdict{min-height:44px;padding-left:4.35rem}');
  });
  it('puts Remove back under the stepper while the paid form is open', () => {
    expect(block).toContain(':has(> td.verdict .paid-form) .core-times .core-remove{position:static}');
    expect(block).toContain('td.verdict:has(.paid-form){padding-left:0}');
  });
});

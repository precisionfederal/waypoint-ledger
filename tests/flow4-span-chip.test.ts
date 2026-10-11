/* FLOW4 flow4-7 (2026-10-01): the chip that carries the length of the search
   says it, in the neutral style, instead of a red "name of a condition". */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseJourney } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';
import { spanChipText } from '../components/LivePreview';

describe('flow4-7 the span chip', () => {
  it('a parent\'s 2 years reads on the chip', () => {
    const [g] = parseJourney('my son had stomach pain for 2 years before they found celiac.', SELECTABLE);
    expect(spanChipText(g)).toBe('2 years searching: counted, never priced');
  });
  it('a gap with no months, or a priced line, keeps its own text', () => {
    expect(spanChipText(parseJourney('they refused to do the MRI', SELECTABLE)[0])).toBeNull();
    expect(spanChipText(parseJourney('saw my regular doctor', SELECTABLE)[0])).toBeNull();
  });
  it('the span chip takes the neutral class, not the red one', () => {
    const src = readFileSync('components/LivePreview.tsx', 'utf8');
    expect(src).toContain("span || gapCategoryOf(s) === 'time-searching' ? ' is-span' : gapCategoryOf(s) ? ' is-gap' : ''");
    expect(readFileSync('app/product.css', 'utf8')).toContain('.lp-chip.is-blank.is-span .lp-amt{color:var(--accent-ink)');
  });
});

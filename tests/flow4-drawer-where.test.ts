/* FLOW4 flow4-12 (2026-10-01): under "Open the source", one line says where in
   the file the number is, built from the same fields the fold prints. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { primarySourceOf } from '../lib/primary-source';
import { ITEMS } from '../lib/store';

describe('flow4-12 where the number is in the file', () => {
  const src = readFileSync('components/LineDrawer.tsx', 'utf8');
  /* JUDGE-5 #8: under the who block, so a small phone shows who the number is about first. */
  it('sits under the source button and the who block, never on a charge line', () => {
    const at = src.indexOf('data-testid="source-where"');
    expect(at).toBeGreaterThan(src.indexOf('Open the source and check this number'));
    expect(at).toBeGreaterThan(src.indexOf('Who this number is about'));
    expect(at).toBeLessThan(src.indexOf('<details className="drawer-more"'));
    expect(src).toContain('{openHref && !showingCharge && primary.length > 0 && (');
    expect(src).toContain('The codes and the math are in the fold below.');
  });
  it('the 99213 line names its file and row', () => {
    const it99213 = ITEMS.find((i) => i.id === 'cms-99213')!;
    const [pt] = primarySourceOf(it99213, { locality: false });
    expect(pt.file.file).toBe('PPRRVU2026_Jul_nonQPP.csv');
    expect(pt.row).toMatch(/99213/);
  });
});

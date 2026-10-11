/* FLOW4 flow4-14 (2026-10-01): the kit's form comes before the tiles that list
   what it makes, so typing a name changes the first screen. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('flow4-14 /adopt/kit order', () => {
  it('OrgKit sits above "What you get"', () => {
    const src = readFileSync('app/adopt/kit/page.tsx', 'utf8');
    expect(src.indexOf('<OrgKit />')).toBeGreaterThan(-1);
    expect(src.indexOf('<OrgKit />')).toBeLessThan(src.indexOf('id="you-get"'));
  });
});

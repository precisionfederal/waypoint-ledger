/* FLOW4 flow4-9 (2026-10-01): the Brief says what the sheet beside it says. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync('components/Ledger.tsx', 'utf8');
const brief = src.slice(src.indexOf('function briefHead()'), src.indexOf("dl('waypoint-brief.txt'"));

describe('flow4-9 the Brief', () => {
  it('brief() opens with the head', () => {
    expect(src).toMatch(/function brief\(\) \{\n\s+const L = briefHead\(\);/);
  });
  it('carries the date it was prepared', () => {
    expect(brief).toContain("toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })");
    expect(brief).toContain('`Prepared ${prepared} with Waypoint Ledger.');
  });
  it('carries the length of the search and the clinicians, from the same line the ledger shows', () => {
    expect(brief).toContain('...(searched ? [searched] : [])');
    expect(src).toContain('const searched = useMemo(() => searchLength(st.entries).line, [st.entries]);');
  });
  it('a child gets a child\'s title', () => {
    expect(brief).toContain("forChild ? 'WHAT ONE CHILD\\u2019S DIAGNOSTIC SEARCH COST' : 'WHAT ONE DIAGNOSTIC SEARCH COST'");
  });
  it('every priced line is printed to the cent, as the sheet prints it', () => {
    expect(brief).toContain('${usd(l.totalUsd, true)} (${BASIS_NAME[it.basis]}, ${it.year})');
    expect(brief).not.toMatch(/usd\(l\.totalUsd\)/);
  });
});

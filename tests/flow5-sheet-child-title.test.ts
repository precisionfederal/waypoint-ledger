/* FLOW5 flow5-3 (2026-10-01): a child's sheet names the child, as the Brief does. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sheetWho } from '../components/sheet/sheet-who';

describe('flow5-3 the sheet title for a child', () => {
  it('reads "What my child\'s diagnostic search has cost" for the caregiver-child stratum, "my" otherwise', () => {
    const src = readFileSync('app/sheet/page.tsx', 'utf8');
    expect(src).toContain("const forChild = st.patient?.stratum === 'caregiver-child';");
    /* JUDGE-7 #5: the words now come from components/sheet/sheet-who.ts; same meaning for a child and for oneself */
    expect(src).toContain('<h1 id="sheet-h1">{sw.title}</h1>');
    expect(sheetWho('caregiver-child').title).toBe('What my child\u2019s diagnostic search has cost');
    expect(sheetWho('adult-onset').title).toBe('What my diagnostic search has cost');
  });
  it('the Brief says a child too', () => {
    expect(readFileSync('components/Ledger.tsx', 'utf8')).toContain("forChild ? 'WHAT ONE CHILD\\u2019S DIAGNOSTIC SEARCH COST'");
  });
});

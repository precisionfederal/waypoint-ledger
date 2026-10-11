/* FLOW5 flow5-2 (2026-10-01): a named diagnosis is context, not an unpriced line. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseJourney, DIAGNOSIS_REASON } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';
import { gapSummary, isCareLine, noteRowsOf, NO_FIGURE } from '../lib/sheet';
import { isDiagnosisLine } from '../lib/diagnosis-line';
import type { JourneyEntry } from '../lib/types';

const entries = (s: string): JourneyEntry[] => parseJourney(s, SELECTABLE).map((g, i) => ({
  key: String(i), raw: g.raw, item: g.result.item, times: g.times, gapCategory: g.result.gapCategory, months: g.result.months,
  ...(!g.result.item && g.result.reason ? { reason: g.result.reason } : {}),
}) as JourneyEntry);

describe('flow5-2 "it was epilepsy" is the answer, not a line without a figure', () => {
  const es = entries('my wife had seizures for a year. she saw her regular doctor 4 times, a neurologist. it was epilepsy');
  const dx = es.find((e) => /epilepsy/.test(e.raw))!;
  it('reads as the diagnosis', () => {
    expect((dx as JourneyEntry & { reason?: string }).reason).toBe(DIAGNOSIS_REASON);
    expect(isDiagnosisLine(dx as never)).toBe(true);
  });
  it('is not a cost row and not counted without a figure (ledger and sheet share gapSummary)', () => {
    expect(isCareLine(dx)).toBe(false);
    expect(noteRowsOf(es).map((e) => e.raw)).toContain(dx.raw);
    expect(gapSummary(es).cats.find(([id]) => id === NO_FIGURE)).toBeUndefined();
  });
  it('a diagnosis said with the length of the search keeps its span line', () => {
    const [l] = entries('took me 3 years to find out it was lupus');
    expect(isDiagnosisLine(l as never)).toBe(false);
    expect(isCareLine(l)).toBe(true);
  });
  it('the ledger groups it as the diagnosis, the span lines as counted, and the Brief names it once in its head', () => {
    const src = readFileSync('components/Ledger.tsx', 'utf8');
    expect(src).toContain("isDiagnosisLine(e) ? 'diagnosis' : l.entry.gapCategory ? 'counted'");
    expect(src).toContain("label: 'The diagnosis, in your words'");
    expect(src).toContain("label: 'Counted, never priced'");
    expect(src).toContain('The diagnosis, in their words: ${named.join');
  });
});

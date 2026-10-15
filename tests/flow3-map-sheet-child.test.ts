/* flow3-6 (map half) and flow3-20 (map and sheet): the merged line only.
   - "im 19 now" and a short fragment with no care in it are never a map step;
     they stay on the ledger under "Not read as care" and are left off the Brief.
   - A parent answering for a child reads the map and the sheet about the child. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TABLE } from '../lib/table';
import { AGE_NOW_REASON } from '../lib/mapper';
import type { JourneyEntry } from '../lib/types';
import { buildJourneyModel, pricedLinesFor } from '../components/JourneyMap';

const item = (id: string) => { const it = TABLE.find((x) => x.id === id); if (!it) throw new Error(id); return it; };
const entries = (): JourneyEntry[] => [
  { key: 'age', raw: 'im 19 now', item: null, times: 1, reason: AGE_NOW_REASON } as JourneyEntry,
  { key: 'frag', raw: 'so yeah', item: null, times: 1 },
  { key: 'a', raw: 'saw my pediatrician six times', item: item('cms-99213'), times: 6 },
  { key: 'c', raw: 'they shocked my nerves and zapped me twice', item: null, times: 1 },
];

describe('flow3-6: the map leaves off what is not care', () => {
  it('no age and no short fragment becomes a step', () => {
    const m = buildJourneyModel(pricedLinesFor(entries(), {}).lines, null);
    expect(m.stops.map((s) => s.key)).toEqual(['a', 'c']);
    expect(m.stops.map((s) => s.n)).toEqual([1, 2]);
  });
  it('the Brief does the same', () => {
    const src = readFileSync(new URL('../components/Ledger.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/function brief\(\)[\s\S]{0,400}if \(!l\.entry\.item && notReadAsCare\(/);
  });
});

describe('flow3-20: a child\'s map and sheet say "the child"', () => {
  it('the map\'s blank step on Medicaid', () => {
    const child = buildJourneyModel(pricedLinesFor(entries(), { coverage: 'medicaid' }, true).lines, null, true);
    const a = child.stops.find((s) => s.key === 'a')!;
    expect(a.lineUsd).toBeNull();
    expect(a.blankWhy).toBe('No published federal figure describes the child here');
    expect(a.noneLabel).toBe('No figure describes the child here');
    const adult = buildJourneyModel(pricedLinesFor(entries(), { coverage: 'medicaid' }).lines, null);
    expect(adult.stops.find((s) => s.key === 'a')!.noneLabel).toBe('No figure describes you here');
    expect(pricedLinesFor(entries(), { coverage: 'medicaid' }, true).fits.get('a')!.why).toContain('what Medicaid pays for the child.');
  });
  it('the map and the sheet pass forChild for caregiver-child', () => {
    const map = readFileSync(new URL('../components/JourneyMap.tsx', import.meta.url), 'utf8');
    expect(map).toContain("const forChild = st.patient?.stratum === 'caregiver-child';");
    expect(map).toContain('pricedLinesFor(st.entries, ctx, forChild)');
    expect(map).toContain('noFigureCopy(ctx, itemLines, forChild)');
    expect(map).not.toContain("'No figure describes you here'");
    const sheet = readFileSync(new URL('../app/sheet/page.tsx', import.meta.url), 'utf8');
    expect(sheet).toContain('fitOf(e.item, ctx, forChild)');
    expect(sheet).toContain('Does the published figure describe {who}:');
    // Judge panel 15 Oct B-9: the tally is said through the sheet's own who ('the child' for a child).
    expect(sheet).toContain('tallyPhrase(v, n, who)');
  });
});

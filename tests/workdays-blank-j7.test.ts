/* JUDGE-7 #4: "missed 30 days of work" filled the workdays card ($7,506.00 at
   the published median) while the same ledger listed "Days of work you
   missed" under "Real costs with no defensible federal figure" and counted it
   under "Without a federal figure". A named cost whose card holds a count and
   a figure leaves that list and that count (lib/burdens.ts stillUnpriced). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EMPTY_BURDENS, burdenCards, stillUnpriced } from '../lib/burdens';
import { NO_FIGURE, gapSummary } from '../lib/sheet';
import unpriceableData from '../data/unpriceable.json';
import type { JourneyEntry } from '../lib/types';

const ALL = ['lost-work', 'caregiver-time', 'travel'];
const UNPRICEABLE: { id: string; label: string }[] = unpriceableData.items;
const labels = (ids: string[]) => ids.map((id) => UNPRICEABLE.find((u) => u.id === id)?.label).filter((x): x is string => Boolean(x));
/** The ledger's count (components/Ledger.tsx blankLines) and the sheet's (app/sheet/page.tsx noFigureLines): one formula. */
const blank = (entries: JourneyEntry[], hits: string[]) => { const g = gapSummary(entries, labels(hits)); return (g.cats.find(([id]) => id === NO_FIGURE)?.[1].lines ?? 0) + g.named.length; };
const CT: JourneyEntry = { key: 'ct', raw: 'a CT at the hospital they never billed', item: null, times: 1 };

describe('JUDGE-7 #4: a cost its card prices is not also left blank', () => {
  it('30 days at the published median: $7,506.00, and lost work leaves the blank list', () => {
    const b = { ...EMPTY_BURDENS, workdays: 30 };
    expect(burdenCards(b).find((c) => c.kind === 'workdays')!.valueUsd).toBe(7506);
    expect(stillUnpriced(ALL, b)).toEqual(['caregiver-time', 'travel']);
    expect(blank([CT], stillUnpriced(ALL, b))).toBe(3);
    expect(blank([CT], ALL)).toBe(4);
  });
  it('no days, or days with her own pay not typed, keeps it named as blank', () => {
    expect(stillUnpriced(ALL, EMPTY_BURDENS)).toEqual(ALL);
    const own = { ...EMPTY_BURDENS, workdays: 30, payBasis: 'own' as const, ownWeeklyPayUsd: null };
    expect(burdenCards(own).find((c) => c.kind === 'workdays')!.valueUsd).toBeNull();
    expect(stillUnpriced(ALL, own)).toEqual(ALL);
  });
  it('hours of care priced on the care card leave "Time someone spent caring for you" the same way', () => {
    const b = { ...EMPTY_BURDENS, careHours: 40 };
    expect(burdenCards(b).find((c) => c.kind === 'care-hours')!.valueUsd).not.toBeNull();
    expect(stillUnpriced(ALL, b)).toEqual(['lost-work', 'travel']);
  });
  it('travel has no card that prices it, so it stays', () => {
    expect(stillUnpriced(['travel'], { ...EMPTY_BURDENS, trips: 12, workdays: 5, careHours: 3 })).toEqual(['travel']);
  });
  it('the ledger takes its count, its list and its share card from stillUnpriced, and follows the cards as they change', () => {
    const src = readFileSync(new URL('../components/Ledger.tsx', import.meta.url), 'utf8');
    expect(src).toContain('const unpricedHits = useMemo(() => stillUnpriced(st.unpricedHits, burdens), [st.unpricedHits, burdens]);');
    expect(src).toContain('gapSummary(st.entries, unpricedHits.map(');
    expect(src).toContain('{unpricedHits.length > 0 && (');
    expect(src).toContain('shareCardData(lines, st.entries.length, unpricedHits.length)');
    expect(src.match(/st\.unpricedHits/g)).toHaveLength(2);
    expect(src).toContain('window.addEventListener(BURDENS_EVENT, follow);');
  });
  /* app/sheet/page.tsx is 4b's: its gapSummary call takes st.unpricedHits through
     stillUnpriced(…, burdens) (the sheet already holds burdens), and then the two
     counts are the one formula above on the same list. */
  it.todo('the sheet takes its named list from stillUnpriced (4b, app/sheet/page.tsx:121)');
});

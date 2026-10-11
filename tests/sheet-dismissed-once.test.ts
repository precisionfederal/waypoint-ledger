/* JUDGE-6 #8 (2026-10-01): the daughter story's sheet printed the dismissal
   twice: the "Times you were told it was nothing · 1 time" card, and "1:
   dismissed" again in "Counted, never priced". When the card prints, the
   counted line leaves "dismissed" out; the card keeps every caveat it carries. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { countedGaps, sheetSizeOf } from '../components/sheet/sheet-size';
import { gapSummary } from '../lib/sheet';
import { DISMISSED_CATEGORY, EMPTY_BURDENS, burdenCards, countDismissed } from '../lib/burdens';
import type { JourneyEntry } from '../lib/types';

const e = (key: string, raw: string, gapCategory: string | null, times = 1, months: number | null = null) =>
  ({ key, raw, item: null, times, gapCategory, months, source: 'rules', modelWhy: null }) as unknown as JourneyEntry;
const daughter = [
  e('a', 'they said it was anxiety.', DISMISSED_CATEGORY),
  e('b', 'they did a CT scan once.', null),
  e('c', 'All in all it took about four years.', 'time-searching', 1, 48),
];

describe('the dismissal count prints once', () => {
  it('with the card filled in, the counted line has no "dismissed" item; the others stay', () => {
    const g = gapSummary(daughter);
    expect(g.cats.map(([id]) => id)).toContain(DISMISSED_CATEGORY);
    const c = countedGaps(g, { ...EMPTY_BURDENS, dismissed: 1 });
    expect(c.cats.map(([id]) => id)).not.toContain(DISMISSED_CATEGORY);
    expect(c.cats.map(([id]) => id)).toContain('no-federal-figure');
    expect(c.months).toBe(48);
    expect(c.empty).toBe(false);
  });
  it('with no card, the counted line keeps "dismissed" exactly as before', () => {
    const g = gapSummary(daughter);
    expect(countedGaps(g, EMPTY_BURDENS)).toEqual(g);
  });
  it('a counted line that held only the dismissal is left off, so no empty heading prints', () => {
    const c = countedGaps(gapSummary([daughter[0]]), { ...EMPTY_BURDENS, dismissed: 1 });
    expect(c.empty).toBe(true);
  });
  it('the card still carries its count, "counted, never priced" and why no dataset records it', () => {
    const card = burdenCards({ ...EMPTY_BURDENS, dismissed: 1 }).find((x) => x.kind === 'dismissed')!;
    expect(card).toEqual(countDismissed(1));
    expect(card.title).toBe('Times you were told it was nothing');
    expect(card.valueUsd).toBeNull();
    expect(card.noFigureReason).toBe('No dataset records being dismissed. MEPS, HCUP and CMS files record care that was delivered and billed.');
    const src = readFileSync('app/sheet/page.tsx', 'utf8');
    expect(src).toContain('<> · counted, no federal figure prices it</>');
    expect(src).toContain('<p className="sb-why">{c.noFigureReason ?? c.method}</p>');
  });
  it('the sheet prints the counted line from countedGaps, and the size check counts it the same way', () => {
    const src = readFileSync('app/sheet/page.tsx', 'utf8');
    expect(src).toContain('const counted = useMemo(() => countedGaps(gaps, burdens), [gaps, burdens]);');
    expect(src).toContain('{counted.cats.map(([id, c]) => (');
    expect(src).not.toContain('{gaps.cats.map(');
    const g = gapSummary(daughter);
    const s = (dismissed: number) => sheetSizeOf({ entries: daughter, lines: [], fits: new Map(), gaps: g, burdens: { ...EMPTY_BURDENS, dismissed }, paid: false, locality: false });
    expect(s(0).gapItems).toBe(3);
    expect(s(1).gapItems).toBe(2);
  });
});

/* FLOW3 flow3-5: the times she said she was dismissed fill the "told it was nothing" card. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseJourney } from '../lib/mapper';
import { ITEMS } from '../lib/store';
import { dismissalsFromEntries, MAX } from '../lib/burdens';
import type { JourneyEntry } from '../lib/types';

const entriesOf = (s: string): JourneyEntry[] => parseJourney(s, ITEMS).filter((x) => !x.absorbed)
  .map((x, i) => ({ key: String(i), raw: x.raw, item: x.result.item, times: x.times, gapCategory: x.result.gapCategory, months: x.result.months }));

describe('flow3-5 the dismissal count comes from her words', () => {
  it.each([
    ['told it was anxiety by 3 diffrent doctors', 3],
    ['saw a cardiologist, then told it was anxiety by 3 diffrent doctors', 3],
  ])('%s', (s, n) => {
    const r = dismissalsFromEntries(entriesOf(s));
    expect(r.total).toBe(n);
    expect(r.said).toEqual([{ raw: 'told it was anxiety by 3 diffrent doctors', n }]);
  });
  it('a priced line or a line with no dismissal adds nothing', () => {
    expect(dismissalsFromEntries(entriesOf('saw my regular doctor three times, then the ER once')).total).toBe(0);
  });
  it('sums several and clamps to the card maximum', () => {
    const e = (raw: string, times: number): JourneyEntry => ({ key: raw, raw, item: null, times, gapCategory: 'dismissed' });
    expect(dismissalsFromEntries([e('told it was stress', 2), e('brushed off by 4 doctors', 4)]).total).toBe(6);
    expect(dismissalsFromEntries([e('told it was nothing', 9999)]).total).toBe(MAX.dismissed);
  });
  it('the card fills only while it is 0, says where the number came from, and never sends by itself', () => {
    const src = readFileSync('components/BurdenLedger.tsx', 'utf8');
    expect(src).toContain('setC((p) => (p.dismissed > 0 ? p : { ...p, dismissed: told.total }))');
    expect(src).toContain('Filled from what you typed: {told.said.map((d) => `“${d.raw}” (${d.n})`).join(\'; \')}. Change it if that is not right.');
    // the only call to sendDismissed is the button's click
    expect(src.match(/sendDismissed\(\)/g)?.length).toBe(2); // the definition and the click
    expect(src.match(/void sendDismissed\(\)/g)?.length).toBe(1);
  });
});

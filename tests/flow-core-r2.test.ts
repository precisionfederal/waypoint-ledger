/* FLOW round 2, fixer CORE (FLOW-FIX-core.md "Round 2"). One test per rule.
   Every figure below is read from data/prices.json through the table, never typed. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseJourney, mapUtterance, workdaysSaid, DIAGNOSIS_REASON, DISMISSAL_REASON, LOST_WORK_REASON,
} from '../lib/mapper';
import { alternativesFor } from '../lib/search';
import { SELECTABLE } from '../lib/table';
const ITEMS = SELECTABLE;
import { exampleLedger, EXAMPLE_LEDGER_STORY } from '../lib/store';
import { addLabel } from '../components/JourneyBuilder';

const read = (s: string) => parseJourney(s, SELECTABLE);
const ids = (s: string) => read(s).filter((x) => x.result.item).map((x) => x.result.item!.id);
const one = (s: string) => mapUtterance(s, SELECTABLE);

describe('c1-2: a diagnosis is not a test, a dismissal is not a psych eval', () => {
  it('"I have Lyme disease." prices nothing and says why', () => {
    const r = one('I have Lyme disease.');
    expect(r.item).toBeNull();
    expect(r.reason).toBe(DIAGNOSIS_REASON);
  });
  it('"I was told it was anxiety" is the told-it-was-nothing counter, unpriced', () => {
    const r = one('I was told it was anxiety');
    expect(r.item).toBeNull();
    expect(r.gapCategory).toBe('dismissed');
    expect(r.reason).toBe(DISMISSAL_REASON);
  });
  it('the care in a dismissal sentence still prices, and the dismissal is still counted', () => {
    const r = one('my regular doctor told me it was anxiety');
    expect(r.item?.id).toBe('cms-99213');
    expect(r.gapCategory).toBe('dismissed');
  });
});

describe('c1-3 / patient2-8: the plain doctor visit is 99213 everywhere (judge-7)', () => {
  for (const s of ['saw my doctor', 'doctor visit', 'went to the doc', 'my primary care visit', 'saw my internist', 'my regular doctor']) {
    it(`"${s}" → cms-99213`, () => expect(ids(s)).toEqual(['cms-99213']));
  }
  it('"3 doctor visits" is 99213 ×3', () => {
    const s = read('3 doctor visits').filter((x) => x.result.item);
    expect(s.map((x) => [x.result.item!.id, x.times])).toEqual([['cms-99213', 3]]);
  });
});

describe('c1-4: time and work in the person\'s own words', () => {
  it('"long covid since 2022" counts months searching, never a price', () => {
    const now = new Date();
    const seg = read('long covid since 2022')[0];
    expect(seg.result.item).toBeNull();
    expect(seg.result.gapCategory).toBe('time-searching');
    /* With no month said, the count starts at the end of 2022, the least it can be. */
    expect(seg.result.months).toBe((now.getFullYear() - 2022) * 12 + now.getMonth() - 11);
  });
  it('"I have had it for 3 years" is 36 months searching', () => {
    const seg = read('I have had it for 3 years')[0];
    expect(seg.result.item).toBeNull();
    expect(seg.result.months).toBe(36);
  });
  it('"I missed 3 weeks of work" is lost work, 15 workdays, unpriced', () => {
    const r = one('I missed 3 weeks of work');
    expect(r.item).toBeNull();
    expect(r.reason).toBe(LOST_WORK_REASON);
    expect(workdaysSaid('I missed 3 weeks of work')?.days).toBe(15);
    expect(workdaysSaid('took 4 days off work')?.days).toBe(4);
    expect(workdaysSaid('saw my doctor twice')).toBeNull();
  });
});

describe('c1-7: /journey suggestions follow the words', () => {
  it('"they put electrodes on my legs" suggests the EMG and NCS rows, never a splint', () => {
    const alts = alternativesFor('they put electrodes on my legs', ITEMS, 5).map((i) => i.id);
    expect(alts.length).toBeGreaterThan(0);
    for (const id of alts) expect(id).toMatch(/^cms-test-(emg|ncs)/);
  });
});

describe('c1-6: the brief asks for the detail instead of saying no figure exists', () => {
  it('Ledger.tsx writes the ask for an unpriced-until-said line', () => {
    const src = readFileSync('components/Ledger.tsx', 'utf8');
    expect(src).toContain('UNPRICED UNTIL ONE DETAIL IS SAID');
  });
});

describe('judge2-3: the example ledger is what the reader reads', () => {
  it('the example lines are exactly parseJourney of the example story', () => {
    const ex = exampleLedger().map((e) => [e.item?.id ?? null, e.times]);
    const reader = read(EXAMPLE_LEDGER_STORY).filter((s) => !s.absorbed).map((s) => [s.result.item?.id ?? null, s.times]);
    expect(ex).toEqual(reader);
    expect(ex).toContainEqual(['cms-99204', 1]);      // the neurologist, a new visit at the level the words support
    expect(ex).toContainEqual(['cms-lab-cbc', 6]);    // "blood work six times"
    expect(ex.map((x) => x[0])).not.toContain('cms-99205');
  });
});

describe('access2-13: the Add button says when nothing will be priced', () => {
  it('names the unpriced add, and keeps the plain label while the reader is still reading', () => {
    expect(addLabel(1, 0, false)).toBe('Add it unpriced');
    expect(addLabel(3, 0, false)).toBe('Add these 3 unpriced');
    expect(addLabel(3, 0, true)).toBe('Add these 3');
    expect(addLabel(1, 1, false)).toBe('Add this line');
    expect(addLabel(0)).toBe('Add to my ledger');
  });
});

import { keepKeys, savedRowsOf } from '../lib/store';
import type { JourneyEntry } from '../lib/types';

describe('patient2-5: one cap on the times of a line, everywhere', () => {
  it('the saved copy keeps 121, as the stepper, the share link and the server do', () => {
    const it121 = SELECTABLE.find((i) => i.id === 'cms-99213')!;
    const { rows } = savedRowsOf([{ key: 'a', raw: 'PT', item: it121, times: 121 } as JourneyEntry], []);
    expect(rows[0].times).toBe(121);
    const big = savedRowsOf([{ key: 'a', raw: 'PT', item: it121, times: 999 } as JourneyEntry], []);
    expect(big.rows[0].times).toBe(365);
  });
});

describe('patient2-4: another tab\'s copy replaces this one without resetting unchanged lines', () => {
  it('keeps the key of every line that is still there, and drops the removed one', () => {
    const a = SELECTABLE[0], b = SELECTABLE[1];
    const prev = [
      { key: 'k1', raw: 'one', item: a, times: 1 },
      { key: 'k2', raw: 'two', item: b, times: 2 },
    ] as JourneyEntry[];
    const next = [{ key: 'new', raw: 'two', item: b, times: 3 }] as JourneyEntry[];
    expect(keepKeys(prev, next).map((e) => [e.key, e.times])).toEqual([['k2', 3]]);
  });
  it('the store listens for the other tabs and never writes back what it just read', () => {
    const src = readFileSync('lib/store.tsx', 'utf8');
    expect(src).toContain("window.addEventListener('storage', onStorage)");
    expect(src).toContain('if (body === lastWritten.current) return;');
  });
});

describe('patient-20: the JSON download is in cents', () => {
  it('Ledger.tsx writes the ledger JSON through the cents replacer', () => {
    /* merge rehearsal: core's centsJson and PATIENT's ledgerJson were one rule; the merge keeps ledgerJson (lib/ledger-export.ts). */
    const src = readFileSync('components/Ledger.tsx', 'utf8');
    expect(src).toContain("dl('waypoint-ledger.json', ledgerJson({");
    expect(src).not.toMatch(/dl\('waypoint-ledger\.json', JSON\.stringify/);
  });
});

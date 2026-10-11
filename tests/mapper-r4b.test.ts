/* R4b, 2026-09-30: NEVER INVENT SPECIFICITY, for the nerve conduction study.

   CMS prices the conduction study under 95907-95913, one code per band of
   nerves tested (1-2, 3-4, 5-6, 7-8, 9-10, 11-12, 13 or more). R4 read
   "shocked the nerves" as the 3-4 band ($118.24) with no number said. The main
   session withdrew that: a band is chosen only when the person says how many
   nerves; otherwise the line is read by the rules and left unpriced BY NAME,
   and it is never sent to the AI reader to guess at. The needle EMG (95886) is
   its own row. The AI reader's prompt says the same thing, checked here on the
   text that actually leaves for the model. */
import { describe, it, expect } from 'vitest';
import { parseJourney, mapUtterance, NCS_COUNT_REASON, NCS_RANGE_REASON, BARE_SCAN_REASON, unpricedByName } from '../lib/mapper';
import { candidatesOf, SYSTEM_PROMPT } from '../lib/map-model';
import { phrasesForModel, PHRASE_SYSTEM_PROMPT } from '../cf/functions/api/map.js';
import { SELECTABLE } from '../lib/table';

const read = (story: string) => parseJourney(story, SELECTABLE);
const cents = (n: number) => Math.round(n * 100) / 100;
const total = (story: string) => cents(read(story).reduce((a, s) => a + (s.result.item?.valueUsd ?? 0) * s.times, 0));
const lines = (story: string) => read(story).map((s) => [s.result.item?.id ?? null, s.times]);
const priceOf = (id: string) => SELECTABLE.find((i) => i.id === id)!.valueUsd!;

describe('R4b · a nerve conduction study with no number of nerves is unpriced by name', () => {
  for (const s of [
    'they shocked the nerves',
    'shocked the nerves',
    'zapped my nerves',
    'nerve conduction test',
    'a nerve conduction study',
    'nerve test',
    'nerve testing',
    'electric shocks to test my nerves',
    'shocked my legs',
    'they tested my nerves',
  ]) {
    it(`"${s}" → one line, no row, the reason says the number of nerves was not said`, () => {
      const segs = read(s);
      expect(segs).toHaveLength(1);
      expect(segs[0].result.item).toBeNull();
      expect(segs[0].result.reason).toBe(NCS_COUNT_REASON);
      expect(segs[0].result.gapCategory).toBeNull();
      expect(total(s)).toBe(0);
      // Read by the rules, so the AI reader is never asked to put a row on it.
      expect(candidatesOf(segs)).toEqual([]);
    });
  }

  it('the reason is plain and names what would price it', () => {
    expect(NCS_COUNT_REASON).toMatch(/^nerve conduction study: the number of nerves tested wasn't said, and Medicare prices these by that number/);
    expect(NCS_COUNT_REASON).not.toMatch(/\$|\d{2,}/);
    expect(unpricedByName(NCS_COUNT_REASON)).toBe(true);
    expect(unpricedByName(BARE_SCAN_REASON)).toBe(true);
  });

  it('a count of studies is not a number of nerves: "nerve conduction studies twice" stays unpriced', () => {
    const segs = read('nerve conduction studies twice');
    expect(segs[0].result.item).toBeNull();
    expect(segs[0].result.reason).toBe(NCS_COUNT_REASON);
  });

  it('never the EMG row: "shocked the nerves" names no needle in a muscle', () => {
    for (const s of ['shocked the nerves', 'nerve conduction test', 'a nerve test']) {
      expect(mapUtterance(s, SELECTABLE).item?.id ?? null, s).toBeNull();
    }
  });
});

describe('R4b · the number of nerves, when said, picks the band', () => {
  const cases: [string, string][] = [
    ['they tested four nerves', 'cms-test-ncs-3-4'],
    ['they shocked 4 nerves in my legs', 'cms-test-ncs-3-4'],
    ['6 nerve studies', 'cms-test-ncs-5-6'],
    ['nerve conduction study of one or two nerves', 'cms-test-ncs-1-2'],
    ['nerve conduction on 3 nerves', 'cms-test-ncs-3-4'],
    ['a nerve conduction study of 8 nerves', 'cms-test-ncs-7-8'],
    ['nerve conduction study, they tested ten nerves', 'cms-test-ncs-9-10'],
    ['nerve conduction on 14 nerves', 'cms-test-ncs-13plus'],
  ];
  for (const [s, id] of cases) {
    it(`"${s}" → ${id} ×1 (the number is nerves, never visits)`, () => {
      const priced = read(s).filter((x) => x.result.item);
      expect(priced.map((x) => [x.result.item!.id, x.times])).toEqual([[id, 1]]);
      expect(total(s)).toBe(priceOf(id));
    });
  }

  it('a range across two bands is not a number the table can price', () => {
    const segs = read('they tested 2 or 3 nerves');
    expect(segs[0].result.item).toBeNull();
    expect(segs[0].result.reason).toBe(NCS_RANGE_REASON);
    expect(candidatesOf(segs)).toEqual([]);
  });
});

describe('R4b · the needle EMG and the conduction study are two lines', () => {
  it('"an EMG and nerve conduction study" → the EMG priced, the conduction study unpriced by name', () => {
    expect(lines('an EMG and nerve conduction study')).toEqual([['cms-test-emg', 1], [null, 1]]);
    expect(read('an EMG and nerve conduction study')[1].result.reason).toBe(NCS_COUNT_REASON);
    expect(total('an EMG and nerve conduction study')).toBe(99.87);
  });

  it('"EMG with nerve conduction" in one clause is still two lines', () => {
    expect(lines('EMG with nerve conduction')).toEqual([['cms-test-emg', 1], [null, 1]]);
  });

  it('"my neurologist did an EMG with nerve conduction on 6 nerves" → visit, EMG, the 5-6 band', () => {
    expect(lines('my neurologist did an EMG with nerve conduction on 6 nerves')).toEqual([
      ['cms-99204', 1], ['cms-test-emg', 1], ['cms-test-ncs-5-6', 1],
    ]);
    expect(total('my neurologist did an EMG with nerve conduction on 6 nerves')).toBe(cents(177.36 + 99.87 + priceOf('cms-test-ncs-5-6')));
  });

  it('a clinician beside an unpriced-by-name test keeps both lines: the visit never swallows the test', () => {
    expect(lines('the neurologist did a nerve conduction study')).toEqual([['cms-99204', 1], [null, 1]]);
    expect(lines('the neurologist ordered an MRI')).toEqual([['cms-99204', 1], [null, 1]]);
    expect(read('the neurologist ordered an MRI')[1].result.reason).toBe(BARE_SCAN_REASON);
  });

  it('the EMG is untouched: "needles in my muscles", "had an EMG", "nerve and muscle test"', () => {
    for (const s of ['needles in my muscles', 'had an EMG', 'nerve and muscle test']) expect(lines(s), s).toEqual([['cms-test-emg', 1]]);
  });

  it('"shocked" that is not about nerves is not a nerve study', () => {
    expect(read('I was shocked by the bill')[0].result.reason).not.toBe(NCS_COUNT_REASON);
  });
});

describe('R4b · the AI reader\'s prompt says the same thing (lib/map-model.ts SYSTEM_PROMPT, as sent)', () => {
  // What production sends is PHRASE_SYSTEM_PROMPT, derived from SYSTEM_PROMPT in cf/functions/api/map.js.
  for (const [name, text] of [['SYSTEM_PROMPT', SYSTEM_PROMPT], ['PHRASE_SYSTEM_PROMPT', PHRASE_SYSTEM_PROMPT]] as const) {
    it(`${name}: electrodes in the muscles are the needle EMG; shocks along the nerves take a conduction row only with a number`, () => {
      expect(text).toContain('"they put electrodes on my legs" is the needle EMG (cms-test-emg), also when the words around it say the nerves were shocked');
      expect(text).toContain('Electrodes or needles in the muscles of a limb are the needle EMG (cms-test-emg)');
      expect(text).toContain('Being shocked or zapped along the nerves is a nerve conduction study, which takes a cms-test-ncs-* row ONLY when the number of nerves is said');
      expect(text).toContain('with no number ("they shocked the nerves", "zapped my nerves", "a nerve conduction test") it is null, and it is never the EMG row');
      expect(text).toContain('{"i":0,"id":"cms-test-emg","why":"needle EMG, electrodes in the leg muscles"},{"i":1,"id":null,"why":"nerve conduction, number of nerves not said"}');
      expect(text).toContain('Phrase 0 is the EMG whether or not the words just after it mention the nerves.');
    });

    it(`${name}: a trip, and an MRI or CT with no body part, are null`, () => {
      expect(text).toContain('A clause that measures a trip (miles, each way, round trip, hours away, the drive) is null');
      expect(text).toContain('An MRI or a CT with no body part named ("an MRI", "a CT scan") is null');
    });

    it(`${name}: the withdrawn instruction is gone`, () => {
      expect(text).not.toContain('both halves take the EMG row');
      expect(text).not.toContain('same test, other half');
      expect(text).not.toContain('"they shocked the ' + 'nerves", "electrodes on my legs", "EMG and nerve conduction") is the complete nerve and muscle test');
      expect(text).not.toContain('the monitor I wore for two weeks');
      expect(text).toContain('NEVER INVENT SPECIFICITY');
      expect(text).toContain('Never mention money.');
    });
  }

  it('the demo sentence sends exactly one phrase, the EMG phrase, with "shocked the nerves" as its only after-context', () => {
    const DEMO =
      'saw my regular doctor three times, then a cardiologist, the heart ultrasound thing, then they put electrodes on my legs and shocked the nerves, then the ER once when my heart was racing';
    const segs = read(DEMO);
    const items = phrasesForModel(segs, candidatesOf(segs));
    expect(items).toEqual([{ phrase: 'they put electrodes on my legs', before: 'the heart ultrasound thing', after: 'shocked the nerves' }]);
  });
});

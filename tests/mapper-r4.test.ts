/* R4, 2026-09-30: THE READER MIS-PRICED WHAT REAL PEOPLE TYPE.

   Measured by the round-3 personas (R3-brainfog, R3-parent, R3-clinician,
   R3-c1-chrome, R3-fedexpert) on the rules the branch shipped (9bb2299806):
     "wore a heart monitor for 14 days"                → 48-hour Holter ×14, $986.72
     "we drove 60 miles each way to the cardiologist"  → new specialist ×60, $10,641.60
     "a video visit with a long covid clinic"          → two visits, $332.00
     "saw a physical therapist 8 times"                → psychotherapy ×8, $911.20
     "my son saw a cardiologist twice"                 → "did not happen to you"
     "a CT scan of my chest without contrast"          → the WITH-contrast chest CT
   Each is a published federal figure printed against words that do not say
   it. Every case the reports measured is below, with 20+ more sentences in
   the same families, written the way tired people and parents type. The
   demo sentence invariant at the bottom is the main session's R4b decision
   (NEVER INVENT SPECIFICITY), which replaced the one set on R3-fedexpert FX-02. */
import { describe, it, expect } from 'vitest';
import {
  parseJourney, SYMPTOM_REASON, DENIED_REASON, TRAVEL_REASON, MONITOR_GAP_REASON,
  BARE_SCAN_REASON, CONTRAST_GAP_REASON, NOT_YOURS_OR_NOT_YET_REASON, NCS_COUNT_REASON,
} from '../lib/mapper';
import { applyModel, candidatesOf } from '../lib/map-model';
import { SELECTABLE } from '../lib/table';

const read = (story: string) => parseJourney(story, SELECTABLE);
const priced = (story: string) => read(story).filter((s) => s.result.item).map((s) => s.result.item!.id);
const counts = (story: string) => read(story).filter((s) => s.result.item).map((s) => s.times);
const cents = (n: number) => Math.round(n * 100) / 100;
const total = (story: string) => cents(read(story).reduce((a, s) => a + (s.result.item?.valueUsd ?? 0) * s.times, 0));

/** [sentence, priced ids in order, their counts, total dollars] */
type Case = [string, string[], number[], number];
const check = (cases: Case[]) => {
  for (const [story, ids, times, dollars] of cases) {
    it(`"${story}" → ${ids.length ? ids.map((id, i) => `${id} ×${times[i]}`).join(' + ') : 'nothing priced'} = $${dollars}`, () => {
      expect(priced(story)).toEqual(ids);
      expect(counts(story)).toEqual(times);
      expect(total(story)).toBe(dollars);
    });
  }
};

describe('R4 · a duration is never a count', () => {
  check([
    // measured (brainfog BF-01, parent PAR-03, c1 C3)
    ['wore a heart monitor for 14 days', [], [], 0],
    ['wore a heart monitor for 30 days', ['cms-test-event-monitor'], [1], 169.68],
    ['a heart monitor for two days', ['cms-test-holter'], [1], 70.48],
    ['made me wear a monitor for 2 days', ['cms-test-holter'], [1], 70.48],
    ['physical therapy for 6 months', ['cms-pt-exercise-15'], [1], 29.06],
    ['saw a neurologist for 6 months', ['cms-99204'], [1], 177.36],
    // more, the way people type it
    ['had to wear a holter for like 3 days', [], [], 0],
    ['wore the heart monitor for 24 hours', ['cms-test-holter'], [1], 70.48],
    ['heart monitor for a month', ['cms-test-event-monitor'], [1], 169.68],
    // a frequency over a span still multiplies, and a count of days still counts
    ['went to PT twice a week for 6 weeks', ['cms-pt-exercise-15'], [12], 348.72],
  ]);

  it('says on the line why a stated length was counted once', () => {
    expect(read('a heart monitor for two days')[0].countNote).toContain('is how long it lasted, not how many');
  });

  it('"I missed about 20 days of work" is still 20: days missed are counted, days worn are not', () => {
    expect(read('I missed about 20 days of work')[0].times).toBe(20);
  });
});

describe('R4 · miles, hours, minutes, dollars and ages are never counts of care', () => {
  check([
    // measured (parent PAR-02)
    ['we drove 60 miles each way to the cardiologist', [], [], 0],
    ['drove her an hour each way to the cardiologist.', [], [], 0],
    // more
    ['drove 3 hours to see the rheumatologist', [], [], 0],
    ['paid 200 dollars for the neurologist', ['cms-99204'], [1], 177.36],
    ['spent 90 minutes in the waiting room at the cardiologist', ['cms-99204'], [1], 177.36],
    // FLOW patient-4: the same specialist twice is one new and one return visit (99204 + 99214).
    ['my 14 year old saw the cardiologist twice', ['cms-99204', 'cms-99214'], [1, 1], 312.97],
  ]);

  it('a trip to care is counted as a cost outside medicine, in her words, never priced', () => {
    const s = read('we drove 60 miles each way to the cardiologist')[0];
    expect(s.result.item).toBeNull();
    expect(s.result.gapCategory).toBe('life-lost');
    expect(s.result.reason).toBe(TRAVEL_REASON);
    expect(s.times).toBe(1);
  });

  it('the parent\'s two sentences: two visits priced, the drive counted, $312.97 (was $10,819.32; $354.72 before FLOW patient-4 priced the second visit as a return visit)', () => {
    const story = 'my son saw a cardiologist twice. we drove 60 miles each way to the cardiologist.';
    expect(priced(story)).toEqual(['cms-99204', 'cms-99214']);
    expect(counts(story)).toEqual([1, 1]);
    expect(total(story)).toBe(312.97);
  });

  it('a ride with no distance is not a trip: "my husband drove me to the ER" still prices the ER', () => {
    expect(priced('my husband drove me to the ER')).toEqual(['cms-ed-99284-complete']);
  });
});

describe('R4 · one telehealth visit is one line', () => {
  check([
    ['a video visit with a long covid clinic', ['cms-99213'], [1], 95.19],
    ['telehealth with the long covid clinic', ['cms-99213'], [1], 95.19],
    ['a zoom visit with my regular doc', ['cms-99213'], [1], 95.19],
  ]);
});

describe('R4 · physical therapy is not psychotherapy', () => {
  check([
    ['saw a physical therapist 8 times', ['cms-pt-exercise-15'], [8], 232.48],
    ['PT 8 times', ['cms-pt-exercise-15'], [8], 232.48],
    ['pt for my back 6 visits', ['cms-pt-exercise-15'], [6], 174.36],
    ['my physio 4 times', ['cms-pt-exercise-15'], [4], 116.24],
    ['physical therapist twice a week for 6 weeks', ['cms-pt-exercise-15'], [12], 348.72],
  ]);

  it('no therapy-session row appears for a physical therapist', () => {
    for (const s of ['saw a physical therapist 8 times', 'my physio 4 times', 'physical therapist twice a week for 6 weeks']) {
      expect(priced(s).some((id) => id.startsWith('cms-mh-'))).toBe(false);
    }
  });
});

describe('R4 · the names people use for their doctors, typos included', () => {
  check([
    // measured (c1 C2, brainfog BF-04, BF-14)
    ['went to my regular doc maybe 4 times?', ['cms-99213'], [4], 380.76],
    ['saw my gp like 6 times', ['cms-99213'], [6], 571.14],
    ['my gp 6 times', ['cms-99213'], [6], 571.14],
    ['the heart doc', ['cms-99204'], [1], 177.36],
    ['went to the heart doc', ['cms-99204'], [1], 177.36],
    ['saw the neuro', ['cms-99204'], [1], 177.36],
    ['saw a nuerologist', ['cms-99204'], [1], 177.36],
    ['saw a cardiologst', ['cms-99204'], [1], 177.36],
    ['saw a rhuematologist', ['cms-99204'], [1], 177.36],
    // more
    ['i saw a cardiologst and then a nuerologist', ['cms-99204', 'cms-99204'], [1, 1], 354.72],
    ['the cardiolgist wanted an echo', ['cms-99204', 'cms-img-echo'], [1, 1], 374.09],
  ]);

  it('a word that is not one edit from a clinician is left alone', () => {
    expect(priced('saw a nutritionist')).not.toContain('cms-99204');
  });
});

describe('R4 · a child is the patient, and a pediatrician is a doctor', () => {
  check([
    // measured (parent PAR-01, PAR-06)
    ['we saw her pediatrician about 8 times over three years', ['cms-99213'], [8], 761.52],
    ["my son's pediatrician", ['cms-99213'], [1], 95.19],
    ['took her to the pediatrician six times', ['cms-99213'], [6], 571.14],
    ['my son saw a cardiologist twice', ['cms-99204', 'cms-99214'], [1, 1], 312.97],
    ['my daughter had an endoscopy', ['cms-proc-egd-biopsy'], [1], 418.85],
    ['my son went to the ER twice', ['cms-ed-99284-complete'], [2], 1089.08],
    ['my daughter had a tilt table test', ['cms-test-tilt-table'], [1], 168.34],
    // more
    ['took my son to his peds doc 5 times', ['cms-99213'], [5], 475.95],
    ['my kid had an echo', ['cms-img-echo'], [1], 196.73],
    ["my daughter's EKG", ['cms-test-ecg'], [1], 15.36],
  ]);

  /* JUDGE-6 #3 (2026-10-01) changed this pin on purpose. It read a lone
     "my husband saw a cardiologist" as someone else's care. On a ledger a
     person fills in to add up a search, a story whose only patient is a
     relative is a carer adding up that relative's search; read as "did not
     happen to you" it made "my husband had a sleep study and an EEG" price the
     EEG and not the sleep study, two patients in one sentence. The rule this
     test exists for still holds: another adult's care never enters the
     writer's own ledger, so it is pinned on stories where the writer names
     care of their own. */
  it('another adult\'s care is still not priced beside the writer\'s own, and no visit is added to it', () => {
    expect(priced('I saw my regular doctor. my husband saw a cardiologist')).toEqual(['cms-99213']);
    expect(read('I saw my regular doctor. my husband saw a cardiologist')[1].result.reason).toBe(NOT_YOURS_OR_NOT_YET_REASON);
    expect(priced('I had a CT of my head and my sister had an MRI of her brain')).toEqual(['cms-img-ct-head-nc']);
  });
});

describe('R4 · denied, then done, is done: priced once', () => {
  check([
    // measured (parent PAR-07)
    ['the tilt table test that insurance denied at first, then did in March', ['cms-test-tilt-table'], [1], 168.34],
    // more
    ['insurance said no to the sleep study at first, then approved it', ['cms-test-sleep-study'], [1], 673.7],
    ['the brain MRI was denied at first but we appealed and she got it on appeal', ['cms-img-mri-brain-nc'], [1], 195.4],
    // and a denial with no turn is still counted, never priced
    ['insurance denied the tilt table test', [], [], 0],
  ]);

  it('the denial it went through is still counted, in her words', () => {
    const segs = read('the tilt table test that insurance denied at first, then did in March');
    expect(segs.map((s) => [s.raw, s.result.item?.id ?? null, s.result.gapCategory])).toEqual([
      ['the tilt table test', 'cms-test-tilt-table', null],
      ['insurance denied at first', null, 'care-denied'],
    ]);
    expect(segs[1].result.reason).toBe(DENIED_REASON);
  });
});

describe('R4 · the right row, or none: monitors, lupus, nerve studies', () => {
  check([
    // measured (clinician C08, brainfog BF-02, fedexpert FX-10)
    ['wore a heart monitor for two weeks', [], [], 0],
    ['i wore a heart monitor for 2 weeks', [], [], 0],
    ['Holter monitor for two weeks', [], [], 0],
    ['a 14 day heart monitor', [], [], 0],
    ['ran more blood work for lupus that came back negative', ['cms-lab-ana'], [1], 12.09],
    ['lupus blood work', ['cms-lab-ana'], [1], 12.09],
    ['the blood test for lupus came back fine', ['cms-lab-ana'], [1], 12.09],
    // fedexpert FX-02: the conduction half is not the EMG twice. R4b: with no number of
    // nerves said it takes no row (unpriced by name, tests/mapper-r4b.test.ts); the EMG prices.
    ['an EMG and nerve conduction study', ['cms-test-emg'], [1], 99.87],
  ]);

  it('a two-week monitor is unpriced BY NAME, never moved to the 48-hour or 30-day row', () => {
    const s = read('wore a heart monitor for two weeks')[0];
    expect(s.raw).toBe('wore a heart monitor for two weeks');
    expect(s.result.reason).toBe(MONITOR_GAP_REASON);
    expect(s.countNote).toBeNull();
  });
});

describe('R4 · onset, results and what a treatment did are never cost lines', () => {
  for (const s of [
    'my daughter got sick when she was 11.',
    'this all began when she was 9',
    'the meds made it worse',
  ]) {
    it(`"${s}" → no line at all`, () => expect(read(s)).toEqual([]));
  }
  /* judge panel #5c (2026-10-01): an onset that names its YEAR says how long the
     search has gone on. It is counted as Time spent searching and never priced,
     never a line of care; with no year it is still context and no line. */
  for (const s of [
    'symptoms started in 2021',
    'It started in March 2023 after covid.',
    'all of this started after covid in 2022',
  ]) {
    it(`"${s}" → one time-searching line, never priced`, () => {
      const segs = read(s);
      expect(segs).toHaveLength(1);
      expect(segs[0].result.item).toBeNull();
      expect(segs[0].result.gapCategory).toBe('time-searching');
      expect(segs[0].result.months).toBeGreaterThan(0);
    });
  }

  check([
    ['10 sessions of physical therapy that made the crashes worse', ['cms-pt-exercise-15'], [10], 290.6],
    // the same test named again to give its result is the same test
    ['a rheumatologist who ran more blood work for lupus. the lupus test was negative', ['cms-99204', 'cms-lab-ana'], [1, 1], 189.45],
    ['10 sessions of physical therapy. PT made the crashes worse', ['cms-pt-exercise-15'], [10], 290.6],
  ]);

  it('a standalone result still names its test, and a standalone symptom still says why', () => {
    expect(priced('the magnesium came back low')).toEqual(['cms-lab-magnesium']);
    expect(read('I was exhausted')[0].result.reason).toBe(SYMPTOM_REASON);
  });

  it('the fragments are gone from the line list: no "came back negative", no "made the crashes worse"', () => {
    const raws = read('ran more blood work for lupus that came back negative, 10 sessions of physical therapy that made the crashes worse').map((s) => s.raw);
    expect(raws).toEqual(['ran more blood work for lupus', '10 sessions of physical therapy']);
  });
});

describe('R4 · contrast and body part are read off the row\'s own name (fedexpert FX-01, FX-08, FX-09)', () => {
  check([
    ['a CT scan of my chest without contrast', ['cms-img-ct-chest-nc'], [1], 132.6],
    ['a chest CT without dye', ['cms-img-ct-chest-nc'], [1], 132.6],
    ['non-contrast CT of the chest', ['cms-img-ct-chest-nc'], [1], 132.6],
    ['scanned my chest with contrast', ['cms-img-ct-chest-c'], [1], 166.67],
    ['brain MRI with and without dye', ['cms-img-mri-brain-both'], [1], 316.97],
    ['CT angiogram of my chest', ['cms-img-cta-chest'], [1], 280.57],
    ['CT of my head with contrast', [], [], 0],
    ['brain MRI with contrast', [], [], 0],
    ['MRI of my knee with contrast', [], [], 0],
    ['an MRI', [], [], 0],
    ['a CT scan', [], [], 0],
  ]);

  it('a scan the table has no row for says so, by name', () => {
    expect(read('CT of my head with contrast')[0].result.reason).toBe(CONTRAST_GAP_REASON);
    expect(read('an MRI')[0].result.reason).toBe(BARE_SCAN_REASON);
  });
});

describe('R4 · blood work', () => {
  check([
    // fedexpert FX-08: the CBC was counted for the heading AND for "a CBC"
    ['blood work: a CBC, a metabolic panel and a lipid panel', ['cms-lab-cbc', 'cms-lab-cmp', 'cms-lab-lipid-panel'], [1, 1, 1], 31.72],
    ['labs: a1c and thyroid', ['cms-lab-a1c'], [1], 9.71],
    ['a bunch of blood tests', ['cms-lab-cbc'], [1], 7.77],
  ]);

  it('"a bunch of blood tests" says on the line that it is counted as one test (brainfog BF-13)', () => {
    expect(read('a bunch of blood tests')[0].countNote).toContain('names no single test');
  });
});

describe('R4 · the persona stories, whole', () => {
  it('clinician: one video visit, no Holter, the ANA for lupus, no context rows', () => {
    const story =
      "It started in March 2023 after covid. I saw my regular doctor about 8 times over three years, blood work almost every visit, they checked my thyroid twice, a chest x-ray, then a cardiologist, the heart ultrasound, wore a heart monitor for two weeks, a tilt table test, the ER twice when my heart was racing and I nearly fainted, a neurologist who ordered a brain MRI, a rheumatologist who ran more blood work for lupus that came back negative, a sleep study, 10 sessions of physical therapy that made the crashes worse, a video visit with a long covid clinic after waiting 7 months to get in, my insurance denied the MRI the first time, I skipped the GI referral because I couldn't afford it, 3 years of looking for an answer";
    const segs = read(story);
    const raws = segs.map((s) => s.raw);
    for (const gone of ['I nearly fainted', 'came back negative', 'made the crashes worse']) expect(raws).not.toContain(gone);
    // judge panel #5c: the onset with its year is counted as time searching, never as care
    expect(segs.find((s) => s.raw === 'It started in March 2023 after covid.')?.result).toMatchObject({ item: null, gapCategory: 'time-searching' });
    expect(priced(story)).not.toContain('cms-test-holter');
    expect(priced(story)).not.toContain('cms-99205');
    expect(segs.find((s) => s.raw === 'ran more blood work for lupus')?.result.item?.id).toBe('cms-lab-ana');
    expect(priced(story).filter((id) => id === 'cms-99213')).toHaveLength(2); // 8 regular-doctor visits + the one video visit
    expect(total(story)).toBe(4089.17);
  });

  it('parent: the pediatrician priced, the monitor once, the drive and the school counted, never priced', () => {
    const story =
      'my daughter got sick when she was 11. we saw her pediatrician about 8 times over three years, then a pediatric cardiologist twice, a GI doctor, she had an endoscopy, the ER twice when she passed out, lots of bloodwork, an EKG, a heart monitor for two days, and the tilt table test that insurance denied at first. I missed about 20 days of work and drove her an hour each way to the cardiologist. she missed most of 7th grade.';
    const segs = read(story);
    expect(segs.find((s) => s.result.item?.id === 'cms-test-holter')?.times).toBe(1);
    expect(segs.find((s) => /pediatrician/.test(s.raw))?.result.item?.id).toBe('cms-99213');
    expect(segs.find((s) => /each way/.test(s.raw))?.result.gapCategory).toBe('life-lost');
    expect(segs.find((s) => /7th grade/.test(s.raw))?.result.gapCategory).toBe('life-lost');
    expect(segs.some((s) => /got sick/.test(s.raw))).toBe(false);
    // 3063.48 until FLOW patient-4: "a pediatric cardiologist twice" is now one new visit
    // (99204, $177.36) and one return visit (99214, $135.61), $41.75 less, both table figures.
    expect(total(story)).toBe(3021.73);
  });

  it('c1: "my regular doc" priced ×4, the two-day monitor once', () => {
    const story =
      'ok so after covid i was tired all the time. went to my regular doc maybe 4 times? she did bloodwork twice. then a heart doctor, they did the ultrasound thing of the heart and made me wear a monitor for 2 days. neurologist once, brain MRI. ER once when i couldnt breathe. physical therapy like 8 visits. they wouldnt do the tilt table test';
    const segs = read(story);
    expect(segs[0].raw).toBe('went to my regular doc maybe 4 times?');
    expect([segs[0].result.item?.id, segs[0].times]).toEqual(['cms-99213', 4]);
    expect(segs.find((s) => s.result.item?.id === 'cms-test-holter')?.times).toBe(1);
    expect(total(story)).toBe(1990.65);
  });

  it('brainfog: the heart doc priced, the two-week monitor unpriced by name', () => {
    const story = 'saw my gp like 6 times, a bunch of blood tests, then the heart doc. they did a tilt table thing and i wore a heart monitor for 2 weeks. urgent care twice';
    expect(priced(story)).toEqual(['cms-99213', 'cms-lab-cbc', 'cms-99204', 'cms-test-tilt-table', 'cms-99203']);
    expect(total(story)).toBe(1159.75);
  });
});

/* The demo invariant, R4b (main session, 2026-09-30, NEVER INVENT SPECIFICITY):
   R4 read "shocked the nerves" as the 3-4 nerve conduction row (95908, $118.24)
   with no number of nerves said. Withdrawn. The conduction study is read by the
   rules and left unpriced by name; the needle EMG is the AI reader's. */
describe('R4b INVARIANT · the demo sentence: six chips, the conduction study unpriced by name', () => {
  const DEMO =
    'saw my regular doctor three times, then a cardiologist, the heart ultrasound thing, then they put electrodes on my legs and shocked the nerves, then the ER once when my heart was racing';

  it('rules only: six segments, four priced, exact ids, counts and reasons', () => {
    const segs = read(DEMO);
    expect(segs.map((s) => [s.raw, s.result.item?.id ?? null, s.times])).toEqual([
      ['saw my regular doctor three times', 'cms-99213', 3],
      ['a cardiologist', 'cms-99204', 1],
      ['the heart ultrasound thing', 'cms-img-echo', 1],
      ['they put electrodes on my legs', null, 1],
      ['shocked the nerves', null, 1],
      ['the ER once when my heart was racing', 'cms-ed-99284-complete', 1],
    ]);
    expect(segs[4].result.reason).toBe(NCS_COUNT_REASON);
    expect(segs[4].result.gapCategory).toBeNull();
    expect(segs[3].result.reason).not.toBe(NCS_COUNT_REASON);
  });

  it('rules only: $1,204.20 = 3 × $95.19 + $177.36 + $196.73 + $544.54', () => {
    const segs = read(DEMO);
    expect(segs.map((s) => s.result.item?.valueUsd ?? null)).toEqual([95.19, 177.36, 196.73, null, null, 544.54]);
    expect(cents(3 * 95.19 + 177.36 + 196.73 + 544.54)).toBe(1204.2);
    expect(total(DEMO)).toBe(1204.2);
  });

  it('the EMG phrase is the one phrase left for the AI reader; the conduction study is never sent', () => {
    expect(candidatesOf(read(DEMO))).toEqual([3]);
  });

  it('live, once the reader names the needle EMG: six chips, five priced, $1,304.07, nothing absorbed', () => {
    const segs = read(DEMO);
    const cands = candidatesOf(segs);
    const r = applyModel(segs, cands, [{ i: 0, id: 'cms-test-emg', why: 'needle EMG of the legs' }], SELECTABLE);
    expect(r.filled).toEqual([3]);
    expect(r.segments.some((s) => s.absorbed)).toBe(false);
    expect(r.segments.map((s) => [s.result.item?.id ?? null, s.times, s.source])).toEqual([
      ['cms-99213', 3, 'rules'],
      ['cms-99204', 1, 'rules'],
      ['cms-img-echo', 1, 'rules'],
      ['cms-test-emg', 1, 'model'],
      [null, 1, 'rules'],
      ['cms-ed-99284-complete', 1, 'rules'],
    ]);
    expect(r.segments.map((s) => s.result.item?.valueUsd ?? null)).toEqual([95.19, 177.36, 196.73, 99.87, null, 544.54]);
    expect(r.segments[4].result.reason).toBe(NCS_COUNT_REASON);
    expect(cents(3 * 95.19 + 177.36 + 196.73 + 99.87 + 544.54)).toBe(1304.07);
    expect(cents(r.segments.reduce((a, s) => a + (s.result.item?.valueUsd ?? 0) * s.times, 0))).toBe(1304.07);
  });
});

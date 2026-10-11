/* J4, 2026-09-30: THE READER PRICED CARE THAT NEVER HAPPENED.

   Measured on local POST /api/price, rules only, before this fix:
     "they wouldn't do the MRI"                       → cms-img-mri-brain-nc  $195.40
     "the neurologist wouldn't see me"                → cms-99204             $177.36
     "no neurologist would take me"                   → cms-99204             $177.36
     "on the waitlist for a neurologist for 6 months" → cms-99204             $177.36
   A judge who types their own refusal saw a federal figure for care that did
   not happen, on the page whose band says "Care you went without". A refusal
   said as a verb, a waitlist and "no one would" now land where "insurance
   denied the tilt table test" already landed: counted, never priced.

   The other half of this file matters as much. A refusal governs its own
   clause and nothing else: the ER visit the person went to instead still
   prices, and the demo sentence reads exactly as it did. */
import { describe, it, expect } from 'vitest';
import { parseJourney, DENIED_REASON, NOT_RECEIVED_REASON, NCS_COUNT_REASON } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const read = (story: string) => parseJourney(story, SELECTABLE);
const priced = (story: string) => read(story).filter((s) => s.result.item).map((s) => s.result.item!.id);
const total = (story: string) =>
  Math.round(read(story).reduce((a, s) => a + (s.result.item?.valueUsd ?? 0) * s.times, 0) * 100) / 100;

describe('J4: the four sentences the judge typed are counted, never priced', () => {
  const FOUR: [string, 'care-denied' | 'care-not-sought'][] = [
    ["they wouldn't do the MRI", 'care-denied'],
    ["the neurologist wouldn't see me", 'care-denied'],
    ['no neurologist would take me', 'care-denied'],
    ['on the waitlist for a neurologist for 6 months', 'care-not-sought'],
  ];
  for (const [story, cat] of FOUR) {
    it(`"${story}" → no unit, no figure, ${cat}`, () => {
      const segs = read(story);
      expect(segs).toHaveLength(1);
      expect(segs[0].result.item).toBeNull();
      expect(segs[0].result.gapCategory).toBe(cat);
      expect(segs[0].result.reason).toBe(cat === 'care-denied' ? DENIED_REASON : NOT_RECEIVED_REASON);
      expect(total(story)).toBe(0);
    });
  }
});

describe('J4: refusals, waitlists and "no one would", the way patients say them', () => {
  const REFUSED: string[] = [
    "they wouldn't do the MRI",
    "the neurologist wouldn't see me",
    'no neurologist would take me',
    'on the waitlist for a neurologist for 6 months',
    "my doctor won't order the sleep study",
    'the rheumatologist refused to see me without a referral',
    'nobody would see me for months',
    "I couldn't get an appointment with a neurologist",
    "I've been waitlisted for a sleep study since March",
    "I'm on a waitlist for the GI doctor",
    "the cardiologist wasn't taking new patients",
    'I never heard back about the MRI',
    "insurance wouldn't pay for the tilt table test",
    "my doctor didn't think I needed an MRI",
    "I couldn't find a neurologist who would take my insurance",
    "they said I didn't qualify for the sleep study",
    'not one doctor would order the Lyme test',
    'my GP would not refer me to a specialist',
    'the specialist declined to see me',
    "I can't get in to see a rheumatologist",
    "I wouldn't do the colonoscopy because I was scared",
    "they wouldn't even look at me at urgent care",
    'no one would take my insurance for physical therapy',
    "my insurance won't cover the sleep study",
    'they refused to run the Lyme test',
    "the dermatologist wouldn't book me without a referral",
    "I've been on the wait list for physical therapy since June",
    "the orthopedic office said they're not accepting new patients",
    "my doctor keeps saying she won't order an MRI until I lose weight",
    'nobody would take me seriously enough to order a sleep study',
    "I still can't get an appointment with a rheumatologist",
    "they said I didn't need an echo",
    'the GI office was booked out and put me on a waitlist',
  ];

  for (const story of REFUSED) {
    it(`prices nothing in "${story}"`, () => {
      const segs = read(story);
      expect(priced(story)).toEqual([]);
      expect(total(story)).toBe(0);
      // counted, in the person's words, never silently dropped
      expect(segs.some((s) => s.result.gapCategory === 'care-denied' || s.result.gapCategory === 'care-not-sought')).toBe(true);
      // and every line says why it carries no figure
      for (const s of segs) expect(s.result.reason).toBeTruthy();
      expect(segs.some((s) => (s.result.reason ?? '').includes('counted, never priced'))).toBe(true);
    });
  }

  it('holds at least twenty ways of saying it', () => {
    expect(REFUSED.length).toBeGreaterThanOrEqual(20);
  });

  it('"I wouldn\'t do it" is the person\'s own no: care not sought, not a denial', () => {
    expect(read("I wouldn't do the colonoscopy because I was scared")[0].result.gapCategory).toBe('care-not-sought');
    expect(read("they wouldn't do the MRI")[0].result.gapCategory).toBe('care-denied');
  });
});

describe('J4 near-misses: the care that DID happen still prices', () => {
  const STILL_PRICES: [string, string[], number][] = [
    // a refusal governs its own clause; the care the person got instead prices
    ["the neurologist wouldn't see me, so I went to the ER", ['cms-ed-99284-complete'], 544.54],
    ["the neurologist wouldn't see me so I went to the ER", ['cms-ed-99284-complete'], 544.54],
    ["I went to urgent care when my doctor wouldn't see me", ['cms-99203'], 117.57],
    // R4: "my regular doctor" is 99213 however it is said (brainfog BF-14); was 99214, $617.92
    // flow3-8: an EEG with no sleep said is the routine one (95816, $413.50), not awake-and-asleep ($482.31).
    ["the neurologist wouldn't see me but my regular doctor did an EEG", ['cms-99213', 'cms-test-eeg-awake-drowsy'], 508.69],
    ["the first neurologist wouldn't see me but I saw another neurologist", ['cms-99204'], 177.36],
    ["the ER sent me home and wouldn't do a CT", ['cms-ed-99284-complete'], 544.54],
    // a refusal that is only the time or the reason around care received
    // (R4: each MRI names its body part; a bare "MRI" is unpriced by name, fedexpert FX-08)
    ['they did the brain MRI after I refused the first date', ['cms-img-mri-brain-nc'], 195.4],
    ['I refused the sedation but they still did the colonoscopy', ['cms-proc-colonoscopy'], 378.1],
    ["insurance wouldn't pay so I paid out of pocket for the brain MRI", ['cms-img-mri-brain-nc'], 195.4],
    ['after six months on the waitlist I finally saw the neurologist', ['cms-99204'], 177.36],
    // the words of a refusal with no refusal of care in them
    ["the neurologist wouldn't take no for an answer and ordered an MRI of my brain", ['cms-99204', 'cms-img-mri-brain-nc'], 372.76],
    ["the pain wouldn't go away so I went to the ER", ['cms-ed-99284-complete'], 544.54],
    ["the brain MRI didn't take long", ['cms-img-mri-brain-nc'], 195.4],
    ["it wouldn't take long so they did the brain MRI that day", ['cms-img-mri-brain-nc'], 195.4],
    ["the ER wouldn't admit me", ['cms-ed-99284-complete'], 544.54],
    ["my doctor wouldn't stop talking but she did order blood work", ['cms-lab-cbc'], 7.77],
    ["the medicine didn't help so I saw a neurologist", ['cms-99204'], 177.36],
  ];

  for (const [story, ids, dollars] of STILL_PRICES) {
    it(`"${story}" → ${ids.join(' + ')} = $${dollars}`, () => {
      expect(priced(story)).toEqual(ids);
      expect(total(story)).toBe(dollars);
    });
  }

  it('holds at least ten near-misses', () => {
    expect(STILL_PRICES.length).toBeGreaterThanOrEqual(10);
  });

  it('the refused clause beside the priced one is still counted, in its own words', () => {
    const segs = read("the neurologist wouldn't see me, so I went to the ER");
    expect(segs.map((s) => [s.raw, s.result.item?.id ?? null, s.result.gapCategory])).toEqual([
      ["the neurologist wouldn't see me", null, 'care-denied'],
      ['so I went to the ER', 'cms-ed-99284-complete', null],
    ]);
  });
});

/* The demo sentence invariant, REPLACED 2026-09-30 R4b by the main session's
   decision (NEVER INVENT SPECIFICITY, lib/map-model.ts): "shocked the nerves" is
   the nerve conduction study, which CMS prices by the number of nerves
   (95907-95913); no number was said, so it is read by the rules and left
   UNPRICED BY NAME (NCS_COUNT_REASON), never sent to the AI reader. "they put
   electrodes on my legs" stays blank for the AI reader, which prices the needle
   EMG add-on, CPT 95886 (cms-test-emg, $99.87). Rules only: 4 priced lines,
   $1,204.20; live: 5 priced lines, $1,304.07. (R4 had priced the conduction
   study at the 3-4 nerve row, $118.24, with no number said: withdrawn.) The
   full invariant lives in tests/mapper-r4.test.ts; this block keeps the J4
   checks on it. */
describe('J4 invariant: the demo sentence, as a real bill reads it (R4b)', () => {
  const DEMO =
    'saw my regular doctor three times, then a cardiologist, the heart ultrasound thing, then they put electrodes on my legs and shocked the nerves, then the ER once when my heart was racing';

  it('same six segments; the conduction study is read by the rules and unpriced by name, the EMG phrase is left for the AI reader', () => {
    expect(read(DEMO).map((s) => [s.raw, s.result.item?.id ?? null, s.times])).toEqual([
      ['saw my regular doctor three times', 'cms-99213', 3],
      ['a cardiologist', 'cms-99204', 1],
      ['the heart ultrasound thing', 'cms-img-echo', 1],
      ['they put electrodes on my legs', null, 1],
      ['shocked the nerves', null, 1],
      ['the ER once when my heart was racing', 'cms-ed-99284-complete', 1],
    ]);
    expect(read(DEMO)[4].result.reason).toBe(NCS_COUNT_REASON);
  });

  it('$1,204.20 rules only, four priced lines, the office visit still $95.19', () => {
    expect(total(DEMO)).toBe(1204.2);
    expect(priced(DEMO)).toHaveLength(4);
    expect(read(DEMO)[0].result.item!.valueUsd).toBe(95.19);
  });

  it('the tilt-table variant adds one counted refusal and not one dollar', () => {
    const v = `${DEMO}, and insurance denied the tilt table test`;
    const segs = read(v);
    expect(segs).toHaveLength(7);
    expect(total(v)).toBe(1204.2);
    expect(segs[6].raw).toBe('insurance denied the tilt table test');
    expect(segs[6].result.item).toBeNull();
    expect(segs[6].result.gapCategory).toBe('care-denied');
  });
});

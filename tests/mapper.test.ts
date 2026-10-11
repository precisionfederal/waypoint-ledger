/* The mapping layer is allowed to be fuzzy. It is never allowed to produce a price,
   and it is never allowed to force a miss onto the nearest row — a wrong mapping
   prints a real federal figure for care that never happened. These tests hold both.

   They also hold the three things a real story does that a demo sentence does not:
   it counts ("twice a week for six months"), it packs two units of care into one
   breath ("a neurologist who ordered an MRI"), and it says how it felt
   ("I was exhausted"), which is true and is not a unit of care. */
import { describe, it, expect } from 'vitest';
import {
  parseJourney, splitJourney, extractCount, mapUtterance, suggestions, SYMPTOM_REASON,
  gapSignalFor, gapPrefill, NOT_RECEIVED_REASON, DENIED_REASON, DURATION_REASON, DISMISSAL_REASON,
  protectionsFor, clinicianMentions, NO_SECOND_VISIT_REASON, NOT_YOURS_OR_NOT_YET_REASON,
  NCS_COUNT_REASON, type GapCategory,
  SUPPLEMENT_REASON, EQUIPMENT_REASON, LOST_WORK_REASON, INSURANCE_REASON, COURSE_REASON, NO_MATCH_REASON,
  readOnPurpose, lostWorkPhrase,
} from '../lib/mapper';
import { mergeEntries, mergeToast } from '../lib/store';
import gapData from '../data/invisible-events.json';
import { SELECTABLE, TABLE, unknownSynonymIds } from '../lib/table';
import { search } from '../lib/search';
import extraSynonyms from '../data/synonyms.json';

const ids = (story: string) => parseJourney(story, SELECTABLE).map((s) => s.result.item?.id ?? null);
const times = (story: string) => parseJourney(story, SELECTABLE).map((s) => s.times);

/* --------------------------------------------------------------------------
   FORTY-FIVE SENTENCES IN THE WORDS PEOPLE ACTUALLY USE.
   Every expectation below was produced by running this code, not by guessing
   what it should do. A row that changes here is a change to what a person's
   own sentence is worth.
   -------------------------------------------------------------------------- */
const SENTENCES: [string, (string | null)[], number[]][] = [
  // the compound sentence, one count per event
  ['saw my regular doctor three times, then a cardiologist, an echo and a Holter',
    ['cms-99213', 'cms-99204', 'cms-img-echo', 'cms-test-holter'], [3, 1, 1, 1]],
  ['went to the ER twice when my heart was racing', ['cms-ed-99284-complete'], [2]],
  ['MRI of my brain x2', ['cms-img-mri-brain-nc'], [2]],
  ['blood work 6 times', ['cms-lab-cbc'], [6]],
  ['I saw a specialist once', ['cms-99204'], [1]],
  ['a couple of trips to the emergency room', ['cms-ed-99284-complete'], [2]],
  ['physical therapy 12 sessions', ['cms-pt-exercise-15'], [12]],
  // R4 2026-09-30 (fedexpert FX-08): a bare MRI or CT names no body part and stays unpriced by name; it was a guessed brain or chest scan.
  ['labs, then an EKG, then a CT scan', ['cms-lab-cbc', 'cms-test-ecg', null], [1, 1, 1]],
  ['labs, then an EKG, then a CT scan of my chest', ['cms-lab-cbc', 'cms-test-ecg', 'cms-img-ct-chest-nc'], [1, 1, 1]],
  ['x3 chest x-ray', ['cms-img-cxr'], [3]],
  ['the ER three times', ['cms-ed-99284-complete'], [3]],

  // 🔴 R1 bug: a duration ate the count and the line priced 10x low
  ['I spent four years in circles: my family doctor ten times', [null, 'cms-99213'], [1, 10]],
  // 🔴 R1 bug: six months of PT read as two sessions
  ['physical therapy twice a week for six months', ['cms-pt-exercise-15'], [52]],
  ['weekly for six months of physical therapy', ['cms-pt-exercise-15'], [26]],
  ['I saw my doctor every month for two years', ['cms-99213'], [24]],
  ['PT twice a week for 12 weeks', ['cms-pt-exercise-15'], [24]],
  ['six months of weekly therapy', ['cms-mh-therapy-45'], [26]],
  ['quarterly bloodwork', ['cms-lab-cbc'], [4]],
  ['quarterly bloodwork for two years', ['cms-lab-cbc'], [8]],
  ['a dozen appointments with my doctor', ['cms-99213'], [12]],
  ['four or five visits to the ER', ['cms-ed-99284-complete'], [4]],

  // 🔴 R1 bug: the second unit of care vanished in silence
  ['saw a neurologist who ordered an MRI of my brain', ['cms-99204', 'cms-img-mri-brain-nc'], [1, 1]],
  ['saw my cardiologist who ordered an echo and a Holter',
    ['cms-99204', 'cms-img-echo', 'cms-test-holter'], [1, 1, 1]],
  ['they scanned my heart and did bloodwork', ['cms-img-echo', 'cms-lab-cbc'], [1, 1]],
  ['blood work and an EKG', ['cms-lab-cbc', 'cms-test-ecg'], [1, 1]],
  ['sleep study and an EEG', ['cms-test-sleep-study', 'cms-test-eeg-awake-drowsy'], [1, 1]], // flow3-8: the EEG clause names no sleep
  ['endoscopy and a colonoscopy', ['cms-proc-egd-biopsy', 'cms-proc-colonoscopy'], [1, 1]],
  ['urgent care twice and a CT scan', ['cms-99203', null], [2, 1]],
  ['urgent care twice and a chest CT', ['cms-99203', 'cms-img-ct-chest-nc'], [2, 1]],
  ['saw a psychiatrist who said it was anxiety', ['cms-mh-psych-eval', null], [1, 1]],
  // one unit of care that happens to contain a joining word stays one line
  ['MRI with and without contrast', [null], [1]],
  ['brain MRI with and without contrast', ['cms-img-mri-brain-both'], [1]],
  ['CT of my abdomen and pelvis', ['cms-img-ct-abd-pelvis-c'], [1]],

  // 🔴 R1 bug: a count word poisoned the match and offered a nonsense row
  ['two rheumatologists', ['cms-99204'], [2]],
  ['three MRIs', [null], [3]],
  ['three MRIs of my brain', ['cms-img-mri-brain-nc'], [3]],
  ['two cardiologists and three MRIs of my brain', ['cms-99204', 'cms-img-mri-brain-nc'], [2, 3]],

  // 🔴 R1 bug: the most common first stop in any illness matched nothing
  ['urgent care', ['cms-99203'], [1]],
  ['went to urgent care twice', ['cms-99203'], [2]],
  ['walk-in clinic visit', ['cms-99203'], [1]],
  ['I had a stomach camera', ['cms-proc-egd-biopsy'], [1]],
  ['so much bloodwork', ['cms-lab-cbc'], [1]],
  ['a video visit with my doctor', ['cms-99213'], [1]],
  ['telehealth appointment', ['cms-99213'], [1]],
  ['second opinion with a specialist', ['cms-99204'], [1]],
  ['referral visit', ['cms-99204'], [1]],
  // R4b (main session, NEVER INVENT SPECIFICITY): a nerve test with no number of nerves is the conduction study, unpriced by name.
  ['nerve test', [null], [1]],
  ['tilt table test', ['cms-test-tilt-table'], [1]],
  ['sleep study', ['cms-test-sleep-study'], [1]],

  // things that are true and are not units of care
  ['I was exhausted', [null], [1]],
  ['brain fog', [null], [1]],
  ['my landlord would not fix the mold', [null], [1]],
  ['three nights in the hospital', [null], [3]],
];

describe('parseJourney — the sentences people actually type', () => {
  for (const [story, expectIds, expectTimes] of SENTENCES) {
    it(`maps "${story}"`, () => {
      expect(ids(story)).toEqual(expectIds);
      expect(times(story)).toEqual(expectTimes);
    });
  }

  it('covers more than forty sentences, because a demo sentence is not a story', () => {
    expect(SENTENCES.length).toBeGreaterThanOrEqual(40);
  });

  it('shows its arithmetic whenever a count took arithmetic', () => {
    const [pt] = parseJourney('physical therapy twice a week for six months', SELECTABLE);
    expect(pt.countNote).toBe('2 a week × 26 weeks = 52');
    const [q] = parseJourney('quarterly bloodwork', SELECTABLE);
    expect(q.countNote).toContain('counted over one year = 4');
    const [r] = parseJourney('four or five visits to the ER', SELECTABLE);
    expect(r.countNote).toContain('the lower of the two');
  });

  it('never invents a price: a segment carries a unit of care or nothing', () => {
    for (const seg of parseJourney('saw a neurologist who ordered an MRI, then two rheumatologists', SELECTABLE)) {
      expect(Object.keys(seg.result).sort()).toEqual(['confidence', 'gapCategory', 'item', 'matchedOn', 'months', 'reason', 'score']);
      expect(seg.result).not.toHaveProperty('valueUsd');
    }
  });

  it('returns nothing for an empty story', () => {
    expect(parseJourney('', SELECTABLE)).toEqual([]);
    expect(parseJourney('   ', SELECTABLE)).toEqual([]);
  });
});

describe('a symptom is not a unit of care', () => {
  const feelings = ['I was exhausted', 'brain fog', 'chest pain', 'I felt terrible for months', 'the fatigue was crushing'];
  for (const f of feelings) {
    it(`says why rather than guessing for "${f}"`, () => {
      const r = mapUtterance(f, SELECTABLE);
      expect(r.item).toBeNull();
      expect(r.reason).toContain('a symptom, not a unit of care');
      expect(r.confidence).toBe('none');
    });
  }
  it('still prices the care a symptom led to', () => {
    // flow3-8: no contrast said, so the plain brain MRI (70551), marked worth a check
    expect(mapUtterance('MRI for brain fog', SELECTABLE).item?.id).toBe('cms-img-mri-brain-nc');
    expect(mapUtterance('MRI for brain fog', SELECTABLE).confidence).toBe('low');
    expect(mapUtterance('went to the emergency room with chest pain', SELECTABLE).item?.id).toBe('cms-ed-99284-complete');
  });
  it('reports an ordinary miss with the ordinary reason, not the symptom one', () => {
    const r = mapUtterance('my landlord would not fix the mold', SELECTABLE);
    expect(r.item).toBeNull();
    expect(r.reason).not.toBe(SYMPTOM_REASON);
    expect(r.score).toBeLessThan(42); // the confidence floor
  });
});

describe('confidence is honest', () => {
  it('exact wording is high', () => {
    expect(mapUtterance('echocardiogram', SELECTABLE).confidence).toBe('high');
    expect(mapUtterance('urgent care', SELECTABLE).confidence).toBe('high');
  });
  it('a fuzzy multi-word match is medium', () => {
    expect(mapUtterance('an echo', SELECTABLE).confidence).toBe('medium');
  });
  it('one shared word is low, and never becomes a second line of its own', () => {
    expect(mapUtterance('two rheumatologists', SELECTABLE).confidence).toBe('low');
    // "a video visit with my doctor" leaves "with my doctor" behind; a single
    // shared word must not print the same office visit twice.
    expect(ids('a video visit with my doctor')).toEqual(['cms-99213']);
  });
  it('a miss carries no confidence at all', () => {
    expect(mapUtterance('my landlord would not fix the mold', SELECTABLE).confidence).toBe('none');
  });
});

describe('extractCount', () => {
  const cases: [string, number][] = [
    ['saw my doctor 4 times', 4], ['x3', 3], ['3x', 3], ['twice', 2], ['ten times', 10],
    ['a dozen', 12], ['half a dozen times', 6], ['a couple of trips', 2], ['several visits', 3],
    ['every month for two years', 24], ['weekly for six months', 26], ['quarterly', 4],
    ['monthly', 12], ['every other week for a year', 26], ['3 times a week for 8 weeks', 24],
    ['four or five', 4], ['two rheumatologists', 2], ['four years in circles', 1], ['one doctor', 1],
  ];
  for (const [phrase, n] of cases) {
    it(`reads "${phrase}" as ${n}`, () => expect(extractCount(phrase).times).toBe(n));
  }
  it('pulls a numeric count out and leaves the phrase', () => {
    expect(extractCount('saw my doctor 4 times').text).toBe('saw my doctor');
  });
  it('leaves an article-led phrase at one', () => {
    expect(extractCount('a doctor visit')).toEqual({ text: 'doctor visit', times: 1, note: null });
  });
  it('keeps the counted noun in the phrase so it can still be matched', () => {
    expect(extractCount('two rheumatologists').text).toBe('rheumatologists');
  });
  it('clamps to the 1..365 range', () => {
    expect(extractCount('blood work 900 times').times).toBe(365);
    expect(extractCount('blood work 0 times').times).toBe(1);
  });
  it('a duration is never mistaken for a count', () => {
    expect(extractCount('four years in circles').times).toBe(1);
    expect(extractCount('eighteen months of tests').times).toBe(1);
  });
});

describe('splitJourney', () => {
  it('splits on commas and on "then"', () => {
    expect(splitJourney('labs, then an EKG, then a CT scan')).toEqual(['labs', 'an EKG', 'a CT scan']);
  });
  it('splits on a colon, where people list what happened', () => {
    expect(splitJourney('four years of this: my doctor ten times'))
      .toEqual(['four years of this', 'my doctor ten times']);
  });
  it('never cuts a unit of care in half at its own joining word', () => {
    expect(splitJourney('MRI with and without contrast')).toEqual(['MRI with and without contrast']);
  });
  it('drops empty fragments', () => {
    expect(splitJourney(',,  ,')).toEqual([]);
  });
});

describe('mapUtterance', () => {
  it('never returns a price — only a unit of care, how it matched, and why not', () => {
    const r = mapUtterance('echocardiogram', SELECTABLE);
    expect(Object.keys(r).sort()).toEqual(['confidence', 'gapCategory', 'item', 'matchedOn', 'months', 'reason', 'score']);
    expect(r.item?.id).toBe('cms-img-echo');
    expect(r.reason).toBeNull();
  });
  it('returns null for empty input', () => {
    expect(mapUtterance('', SELECTABLE).item).toBeNull();
    expect(mapUtterance('   ', SELECTABLE).item).toBeNull();
  });
  it('draws suggestions only from priced rows of the real table', () => {
    const s = suggestions(SELECTABLE, 6);
    expect(s).toHaveLength(6);
    for (const phrase of s) expect(typeof phrase).toBe('string');
  });
});

/* --------------------------------------------------------------------------
   data/synonyms.json — the words people use, bound to rows that exist
   -------------------------------------------------------------------------- */
describe('the extra plain-language synonyms', () => {
  const syn = (extraSynonyms as { synonyms: Record<string, string[]> }).synonyms;
  const phrases = Object.values(syn).flat();

  it('names only rows that really exist in the published table', () => {
    expect(unknownSynonymIds()).toEqual([]);
  });

  it('adds more than 150 ways of saying something', () => {
    expect(phrases.length).toBeGreaterThan(150);
  });

  it('gives no phrase to two different rows', () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const [id, list] of Object.entries(syn)) {
      for (const p of list) {
        const k = p.toLowerCase();
        if (owner.has(k) && owner.get(k) !== id) clashes.push(`${p}: ${owner.get(k)} and ${id}`);
        owner.set(k, id);
      }
    }
    expect(clashes).toEqual([]);
  });

  // 30s: this walks every added phrase through the whole catalog, and the
  // matcher now reads each candidate both ways round.
  it('every added phrase maps back to its own row', { timeout: 30_000 }, () => {
    const misses: string[] = [];
    for (const [id, list] of Object.entries(syn)) {
      for (const p of list) {
        const got = mapUtterance(p, SELECTABLE).item?.id ?? 'NULL';
        if (got !== id) misses.push(`"${p}" → ${got}, expected ${id}`);
      }
    }
    expect(misses).toEqual([]);
  });

  it('is merged into the table, not into data/prices.json', () => {
    const urgent = TABLE.find((t) => t.id === 'cms-99203');
    expect(urgent?.synonyms).toContain('urgent care');
    // and the published file is untouched by the merge
    expect(JSON.stringify(syn['cms-99203'])).toContain('walk-in clinic');
  });
});

/* --------------------------------------------------------------------------
   THE TYPEAHEAD AND THE REMAP LIST — the product's second guess, in public
   -------------------------------------------------------------------------- */
describe('search never offers a nonsense alternative', () => {
  it('"an echo" leads with the echocardiogram and offers no lab at all', () => {
    const hits = search('an echo', SELECTABLE, 5);
    expect(hits[0]?.item.id).toBe('cms-img-echo');
    expect(hits.slice(0, 5).filter((h) => h.item.id.startsWith('cms-lab-'))).toEqual([]);
  });

  it('a count word never earns a match: "two rheumatologists" offers no chest x-ray', () => {
    const hits = search('two rheumatologists', SELECTABLE, 5).map((h) => h.item.id);
    expect(hits).not.toContain('cms-img-cxr');
    expect(hits).not.toContain('cms-test-holter');
  });

  it('still finds a row by the words that carry meaning', () => {
    expect(search('urgent care', SELECTABLE, 3)[0]?.item.id).toBe('cms-99203');
    expect(search('two views', SELECTABLE, 3)[0]?.item.id).toBe('cms-img-cxr');
    expect(search('stomach camera', SELECTABLE, 3)[0]?.item.id).toBe('cms-proc-egd-biopsy');
  });

  it('returns nothing for joining words alone', () => {
    expect(search('the', SELECTABLE)).toEqual([]);
    expect(search('and the of', SELECTABLE)).toEqual([]);
  });
});

/* ==========================================================================
   CARE THAT DID NOT HAPPEN IS NEVER PRICED

   The home page says the care you needed and never got produces $0 in federal
   data. Before this guard the product billed it: "I could not afford the
   specialist so I never went" came back as a $177 new-patient visit, and "four
   years of appointments" came back as a 15-minute physical-therapy unit. Both
   are the product contradicting its own headline. Every case below was run,
   not guessed, and each one is a sentence a person in a diagnostic odyssey
   really types.
   ========================================================================== */

const seg1 = (story: string) => {
  const segs = parseJourney(story, SELECTABLE);
  expect(segs.length).toBeGreaterThan(0);
  return segs[0];
};

describe('a refusal, a denial or a cancellation is counted, never priced', () => {
  const CASES: [string, GapCategory][] = [
    ['I could not afford the specialist so I never went', 'care-not-sought'],
    ['I never went to the specialist', 'care-not-sought'],
    ["I didn't go to the emergency room even though I should have", 'care-not-sought'],
    ['I could not afford the MRI', 'care-not-sought'],
    ['the colonoscopy was too expensive', 'care-not-sought'],
    ['I put it off for two years', 'care-not-sought'],
    ['I cancelled the colonoscopy', 'care-not-sought'],
    ['I never got the sleep study', 'care-not-sought'],
    ['I never had the endoscopy done', 'care-not-sought'],
    ['I skipped the follow-up MRI', 'care-not-sought'],
    ['I gave up and stopped going to the specialist', 'care-not-sought'],
    ['the specialist that I never saw', 'care-not-sought'],
    ['still waiting for the neurology appointment', 'care-not-sought'],
    ['I was denied the MRI', 'care-denied'],
    ['insurance turned down the referral', 'care-denied'],
    ['my doctor refused to order an MRI', 'care-denied'],
    ['prior authorization was denied for the sleep study', 'care-denied'],
    ['the echocardiogram was not covered', 'care-denied'],
    ['they turned me away at urgent care', 'care-denied'],
  ];

  for (const [story, cat] of CASES) {
    it(`refuses to price "${story}"`, () => {
      const s = seg1(story);
      expect(s.result.item).toBeNull();
      expect(s.result.gapCategory).toBe(cat);
      expect(s.result.confidence).toBe('none');
      expect(s.result.reason).toContain('counted, never priced');
    });
  }

  it('covers more than fifteen ways of saying it did not happen', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(15);
  });

  it('THE sentence that used to bill $177 for a visit that never happened', () => {
    // Reproduced live on 2026-09-09: this returned "First visit with a new
    // specialist ×1, $177" with no warning at all, and the primary button
    // added it to the total.
    const s = seg1('I could not afford the specialist so I never went');
    expect(s.result.item).toBeNull();
    expect(s.result.reason).toBe(NOT_RECEIVED_REASON);
    expect(s.result.reason).toContain('care you needed and did not get');
  });

  it('a denial says it was refused, not that it was skipped', () => {
    expect(seg1('I was denied the MRI').result.reason).toBe(DENIED_REASON);
    expect(seg1('I never went for the MRI').result.reason).toBe(NOT_RECEIVED_REASON);
  });

  it('a joining word cannot rescue a refusal into a priced line', () => {
    // "that" splits a segment into pieces, and "the specialist" on its own is a
    // perfect match for a $177 row. The whole segment is read first.
    const segs = parseJourney('the specialist that I never saw', SELECTABLE);
    expect(segs.map((x) => x.result.item?.id ?? null)).toEqual([null]);
  });

  it('care the person did get in the end still prices', () => {
    const s = seg1('I could not afford it so I finally paid to see a rheumatologist');
    expect(s.result.item).not.toBeNull();
    expect(s.result.gapCategory).toBeNull();
  });

  it('counts what the person counted: three refused referrals are three', () => {
    const s = seg1('I was denied three referrals');
    expect(s.result.item).toBeNull();
    expect(s.times).toBe(3);
  });

  it('the rest of the story still prices around a refusal', () => {
    const segs = parseJourney('blood work, then an EKG, but I never went to the specialist', SELECTABLE);
    const priced = segs.filter((x) => x.result.item).map((x) => x.result.item!.id);
    expect(priced).toEqual(['cms-lab-cbc', 'cms-test-ecg']);
    expect(segs.some((x) => x.result.gapCategory === 'care-not-sought')).toBe(true);
  });
});

describe('a length of time is not a unit of care', () => {
  const SPANS: [string, number][] = [
    ['Four years of appointments', 48],
    ['six months of waiting', 6],
    ['two years of waiting', 24],
    ['I spent four years in circles', 48],
    ['eighteen months of tests', 18],
    ['three years of appointments', 36],
    ['for eight months of scans', 8],
    ['twelve months of appointments', 12],
    ['30 months of searching', 30],
    ['two years of nothing', 24],
  ];

  for (const [story, months] of SPANS) {
    it(`reads "${story}" as ${months} months of searching, not as care`, () => {
      const s = seg1(story);
      expect(s.result.item).toBeNull();
      expect(s.result.gapCategory).toBe('time-searching');
      expect(s.result.months).toBe(months);
      expect(s.result.reason).toBe(DURATION_REASON);
    });
  }

  it('THE phrase that used to price four years as one 15-minute PT session', () => {
    // Reproduced live on 2026-09-09: "Four years of appointments" returned
    // "Physical therapy exercise session, 15 minutes ×1, $29".
    expect(seg1('Four years of appointments').result.item).toBeNull();
    expect(mapUtterance('Four years of appointments', SELECTABLE).item).toBeNull();
  });

  it('never swallows the care inside the span', () => {
    // Each of these names a real unit of care as well as a length of time, and
    // the count arithmetic must survive untouched.
    const keep: [string, string, number][] = [
      ['six months of weekly therapy', 'cms-mh-therapy-45', 26],
      ['physical therapy twice a week for six months', 'cms-pt-exercise-15', 52],
      ['PT twice a week for 12 weeks', 'cms-pt-exercise-15', 24],
      ['I saw my doctor every month for two years', 'cms-99213', 24],
      ['quarterly bloodwork for two years', 'cms-lab-cbc', 8],
    ];
    for (const [story, id, n] of keep) {
      const s = seg1(story);
      expect([story, s.result.item?.id, s.times]).toEqual([story, id, n]);
      expect(s.result.gapCategory).toBeNull();
    }
  });

  it('a duration inside a longer story is counted where it belongs', () => {
    const segs = parseJourney('I spent four years in circles: my family doctor ten times', SELECTABLE);
    expect(segs.map((x) => x.result.item?.id ?? null)).toEqual([null, 'cms-99213']);
    expect(segs[0].result.gapCategory).toBe('time-searching');
    expect(segs[0].result.months).toBe(48);
    expect(segs[1].result.gapCategory).toBeNull();
  });

  it('nights in hospital are a count of care, not a span of searching', () => {
    const s = seg1('three nights in the hospital');
    expect(s.times).toBe(3);
    expect(s.result.gapCategory).toBeNull();
  });
});

describe('being told it was nothing is counted beside the visit, not instead of it', () => {
  it('keeps the priced visit AND marks the dismissal', () => {
    // Reproduced live: this priced one 99214 at $136 with no flag and counted
    // no dismissal, while the product asked the same question two pages later.
    const s = seg1('My GP kept telling me it was anxiety for three years');
    // R4 (brainfog BF-14): "my GP" is the regular doctor, the demo's own 99213 row.
    expect(s.result.item?.id).toBe('cms-99213');
    expect(s.result.gapCategory).toBe('dismissed');
  });

  it('a dismissal that matches no row says why it carries no figure', () => {
    const r = mapUtterance('they said it was nothing', SELECTABLE);
    expect(r.item).toBeNull();
    expect(r.gapCategory).toBe('dismissed');
    expect(r.reason).toBe(DISMISSAL_REASON);
  });

  const TOLD = [
    'told me it was all in my head',
    'I was not taken seriously',
    'they said it was just stress',
    'the doctor brushed me off',
    'he told me to lose weight',
  ];
  for (const phrase of TOLD) {
    it(`counts the dismissal in "${phrase}"`, () => {
      expect(gapSignalFor(phrase)?.category).toBe('dismissed');
      expect(gapSignalFor(phrase)?.suppressesPrice).toBe(false);
    });
  }

  it('one sentence counts one dismissal, never two', () => {
    const segs = parseJourney('saw a psychiatrist who said it was anxiety', SELECTABLE);
    expect(segs.map((x) => x.result.item?.id ?? null)).toEqual(['cms-mh-psych-eval', null]);
    expect(segs.filter((x) => x.result.gapCategory === 'dismissed')).toHaveLength(1);
  });
});

describe('the counts the mapper hands to /gap', () => {
  it('adds occasions across lines', () => {
    const { counts } = gapPrefill([
      { raw: 'I never went to the specialist', times: 2 },
      { raw: 'I was denied the MRI', times: 1 },
      { raw: 'insurance turned down the referral', times: 1 },
    ]);
    expect(counts['care-not-sought']).toBe(2);
    expect(counts['care-denied']).toBe(2);
  });

  it('never adds two spans together — one search is one search', () => {
    const { counts } = gapPrefill([
      { raw: 'two years of waiting' },
      { raw: 'six months of waiting' },
    ]);
    expect(counts['time-searching']).toBe(24);
  });

  it('carries the phrase and the words that fired it, so nothing is a black box', () => {
    const { lines } = gapPrefill([{ raw: 'six months of waiting' }]);
    expect(lines).toEqual([{
      raw: 'six months of waiting', category: 'time-searching',
      amount: 6, unit: 'months', matchedOn: 'six months',
    }]);
  });

  it('counts a dismissal that was also priced', () => {
    const { counts } = gapPrefill([{ raw: 'My GP kept telling me it was anxiety', times: 1 }]);
    expect(counts.dismissed).toBe(1);
  });

  it('an ordinary journey contributes nothing to the gap counts', () => {
    const { counts, lines } = gapPrefill([
      { raw: 'saw my regular doctor', times: 3 },
      { raw: 'an echocardiogram', times: 1 },
    ]);
    expect(counts).toEqual({});
    expect(lines).toEqual([]);
  });

  it('is empty for an empty journey', () => {
    expect(gapPrefill([])).toEqual({ counts: {}, lines: [] });
  });

  it('only ever names a category that exists on /gap — one taxonomy, both sides', () => {
    const known = new Set((gapData.categories as { id: string }[]).map((c) => c.id));
    const probes = [
      'I never went to the specialist', 'I was denied the MRI', 'six months of waiting',
      'they said it was nothing', 'I cancelled the colonoscopy', 'still waiting for neurology',
    ];
    for (const p of probes) {
      const g = gapSignalFor(p);
      expect(g).not.toBeNull();
      expect(known.has(g!.category)).toBe(true);
    }
  });
});

describe('the gap guard never invents anything', () => {
  it('returns no signal for an ordinary unit of care', () => {
    for (const p of ['an echocardiogram', 'urgent care', 'MRI of my brain', 'blood work 6 times']) {
      expect(gapSignalFor(p)).toBeNull();
    }
  });
  it('returns no signal for empty input', () => {
    expect(gapSignalFor('')).toBeNull();
    expect(gapSignalFor('   ')).toBeNull();
  });
  it('a suppressed line still carries no price field of any kind', () => {
    const r = mapUtterance('I never went to the specialist', SELECTABLE);
    expect(r).not.toHaveProperty('valueUsd');
    expect(r.score).toBe(0);
    expect(r.matchedOn).toBeNull();
  });
  it('leaves a phrase that merely mentions a payer alone', () => {
    // "with and without contrast" contains a joining word and the word without.
    expect(gapSignalFor('MRI with and without contrast')).toBeNull();
    // R4: the body part is what prices it (fedexpert FX-08).
    expect(seg1('brain MRI with and without contrast').result.item?.id).toBe('cms-img-mri-brain-both');
  });
});

describe('a cost is a reason, not always an absence', () => {
  it('care the person says they DID get still prices, cost or no cost', () => {
    // "I went to the ER because I couldn't afford my regular doctor" is a
    // priced ER visit with a reason attached. Only the cost words are soft this
    // way: a denial or a "never went" is never softened by anything.
    const s = seg1("I went to the emergency room because I couldn't afford my regular doctor");
    expect(s.result.item?.id).toBe('cms-ed-99284-complete');
    expect(s.result.gapCategory).toBeNull();
  });
  it('but a cost with no care named is still a gap', () => {
    expect(seg1('I could not afford the MRI').result.gapCategory).toBe('care-not-sought');
    expect(seg1('the colonoscopy was too expensive').result.gapCategory).toBe('care-not-sought');
  });
  it('and a denial is never softened by having gone somewhere first', () => {
    const s = seg1('I went to urgent care but was turned away');
    expect(s.result.gapCategory).toBe('care-denied');
    expect(s.result.item).toBeNull();
  });
  it('a story that splits keeps both halves true: the visit and the refusal', () => {
    // "and" is a segment boundary, so this is two facts, and each is told
    // straight: urgent care happened, the referral after it did not.
    const segs = parseJourney('I went to urgent care and they turned down the referral', SELECTABLE);
    expect(segs.map((x) => x.result.item?.id ?? null)).toEqual(['cms-99203', null]);
    expect(segs[1].result.gapCategory).toBe('care-denied');
  });
});


/* --------------------------------------------------------------------------
   NOTHING THE PERSON TYPED IS SILENTLY REMOVED

   Four sentences, typed live on the deployed preview on 2026-09-09, each of
   which came back smaller than it went in — and in every case the counter said
   "N of N recognised", so the person was told nothing had been lost:

     "a rheumatologist ordered a nerve test"          1 of 1, $100  (no visit)
     "my primary care doctor sent me to a
      neurologist who did an MRI"                     2 of 2, $331  (no neurologist)
     "I saw four different specialists ..."           new specialist x1, not x4
     "I waited eight months for a gastroenterologist
      appointment and then had a colonoscopy"         the eight months not counted

   Every expectation below was produced by running this code, and the dollar
   figures are read from the published table in the test itself — never typed
   in by hand, so a table change moves the test with it.
   -------------------------------------------------------------------------- */
describe('nothing the person typed is silently removed', () => {
  const priceOf = (id: string) => SELECTABLE.find((i) => i.id === id)?.valueUsd ?? 0;
  const totalOf = (story: string) =>
    parseJourney(story, SELECTABLE).reduce((a, s) => a + (s.result.item?.valueUsd ?? 0) * s.times, 0);

  it('(a) a clinician and a procedure in one clause are both rows, never the test alone', () => {
    const story = 'a rheumatologist ordered an EMG';
    // BEFORE: ['cms-test-emg'] alone, $99.87. AFTER: the visit leads, as it did in life.
    expect(ids(story)).toEqual(['cms-99204', 'cms-test-emg']);
    expect(times(story)).toEqual([1, 1]);
    expect(totalOf(story)).toBeCloseTo(priceOf('cms-99204') + priceOf('cms-test-emg'), 2);
    // R4b: "a nerve test" names the conduction study with no number of nerves. It is
    // still a row of its own beside the visit, unpriced by name, never swallowed by it.
    const nerve = parseJourney('a rheumatologist ordered a nerve test', SELECTABLE);
    expect(nerve.map((x) => x.result.item?.id ?? null)).toEqual(['cms-99204', null]);
    expect(nerve[1].result.reason).toBe(NCS_COUNT_REASON);
  });

  it('(a) a referral chain is three rows: the PCP visit, the specialist visit and the scan', () => {
    const story = 'my primary care doctor sent me to a neurologist who did an MRI of my brain';
    // BEFORE: ['cms-99214', 'cms-img-mri-brain-nc'], $331.01 — the neurologist was dropped. Round 2 judge-7: the plain primary-care visit is 99213, the level the words support.
    expect(ids(story)).toEqual(['cms-99213', 'cms-99204', 'cms-img-mri-brain-nc']);
    expect(totalOf(story)).toBeCloseTo(
      priceOf('cms-99213') + priceOf('cms-99204') + priceOf('cms-img-mri-brain-nc'), 2,
    );
  });

  it('(a) the visit is never invented out of a bare procedure', () => {
    // No clinician named, no visit added. The guard against the opposite failure.
    expect(ids('an MRI of my brain')).toEqual(['cms-img-mri-brain-nc']);
    expect(ids('blood work 6 times')).toEqual(['cms-lab-cbc']);
  });

  it('(b) a cardinal before a plural clinician noun is the line count', () => {
    // BEFORE: x1 on every one of these.
    expect(times('I saw four different specialists')).toEqual([4]);
    expect(times('three doctors')).toEqual([3]);
    expect(times('12 specialists')).toEqual([12]);
    expect(times('two different neurologists')).toEqual([2]);
    const story = 'I saw four different specialists and none of them found anything';
    expect(ids(story)).toEqual(['cms-99204', null]);
    expect(times(story)).toEqual([4, 1]);
    expect(totalOf(story)).toBeCloseTo(priceOf('cms-99204') * 4, 2);
  });

  it('(b) a number in front of a time word is still a span, never a count of doctors', () => {
    expect(seg1('Four years of appointments').result.months).toBe(48);
    expect(seg1('Four years of appointments').times).toBe(1);
  });

  it('(c) a wait said mid-sentence is months of searching, exactly like a leading one', () => {
    const story = 'I waited eight months for a gastroenterologist appointment and then had a colonoscopy';
    const segs = parseJourney(story, SELECTABLE);
    // BEFORE: two rows, both priced, and the eight-month wait counted nowhere.
    expect(segs.map((x) => x.result.item?.id ?? null)).toEqual([null, 'cms-99204', 'cms-proc-colonoscopy']);
    expect(segs[0].result.gapCategory).toBe('time-searching');
    expect(segs[0].result.months).toBe(8);
    expect(segs[0].result.reason).toBe(DURATION_REASON);
    expect(segs[0].raw).toBe('waited eight months');
    // The care in the same breath still prices, in full.
    expect(totalOf(story)).toBeCloseTo(priceOf('cms-99204') + priceOf('cms-proc-colonoscopy'), 2);
  });

  it('(c) weeks become months at 4.33 to the month, to one decimal', () => {
    const segs = parseJourney('I waited six weeks for an MRI of my brain', SELECTABLE);
    const span = segs.find((x) => x.result.gapCategory === 'time-searching');
    expect(span?.result.months).toBe(1.4);
    expect(segs.some((x) => x.result.item?.id === 'cms-img-mri-brain-nc')).toBe(true);
    expect(seg1('six weeks of waiting').result.months).toBe(1.4);
  });

  it('(c) the wait a person states rides into the /gap counts unchanged', () => {
    // The chip's own words must read back as the same span, or the page and the
    // chip disagree about how long somebody searched.
    const segs = parseJourney('I spent two years and then took six weeks to get in', SELECTABLE);
    const span = segs.find((x) => x.result.gapCategory === 'time-searching');
    expect(span).toBeTruthy();
    const { counts } = gapPrefill([{ raw: span!.raw }]);
    expect(counts['time-searching']).toBe(span!.result.months);
  });

  it('(d) a clinician the reader will not price a second visit for is named, never dropped', () => {
    const story = 'a rheumatologist sent me to a neurologist';
    const segs = parseJourney(story, SELECTABLE);
    expect(segs.map((x) => x.result.item?.id ?? null)).toEqual(['cms-99204', null]);
    expect(segs[1].raw).toBe('rheumatologist');
    expect(segs[1].result.reason).toBe(`rheumatologist: ${NO_SECOND_VISIT_REASON}`);
    // Blank means blank: a named chip never carries a figure.
    expect(segs[1].result.item).toBeNull();
  });

  it('(d) every clinician a phrase names is found, in the order they were said', () => {
    expect(clinicianMentions('my primary care doctor sent me to a neurologist').map((m) => m.noun))
      .toEqual(['primary care doctor', 'neurologist']);
    // The long name is never found as the short one inside it.
    expect(clinicianMentions('my primary care doctor').map((m) => m.noun)).toEqual(['primary care doctor']);
    expect(clinicianMentions('I was exhausted for months')).toEqual([]);
  });

  it('(e) the counter can never read n of n while a clause was dropped', () => {
    // The counter's denominator is parseJourney's own output, so the invariant
    // that makes it honest is this one: every clause the splitter produced comes
    // back as at least one segment. Checked across every sentence in this file.
    const stories = [
      ...SENTENCES.map(([story]) => story),
      'a rheumatologist ordered a nerve test',
      'my primary care doctor sent me to a neurologist who did an MRI',
      'I saw four different specialists and none of them found anything',
      'I waited eight months for a gastroenterologist appointment and then had a colonoscopy',
    ];
    for (const story of stories) {
      const clauses = splitJourney(story, protectionsFor(SELECTABLE));
      const segs = parseJourney(story, SELECTABLE);
      expect([story, segs.length >= clauses.length]).toEqual([story, true]);
    }
  });

  it('(e) a phrase that carries no figure is still one of the phrases read', () => {
    const story = 'I waited eight months for a gastroenterologist appointment and then had a colonoscopy';
    const segs = parseJourney(story, SELECTABLE);
    const priced = segs.filter((x) => x.result.item).length;
    // 3 phrases read, 2 carrying a published figure — never "2 of 2".
    expect([segs.length, priced]).toEqual([3, 2]);
    expect(segs.every((x) => x.raw.trim().length > 0)).toBe(true);
  });
});

/* --------------------------------------------------------------------------
   THE FOUR FAMILIES OF WRONG UNIT, 2026-09-10.

   With gpt-5.5 as the reader, all 50 false positives left on the 209-sentence
   eval (data/test-fixtures/READER-EVAL.md) were RULES answers — the model added
   none, because it may only fill a phrase the rules left blank. Every sentence
   below is quoted verbatim from that file. A wrong unit here is not a style
   problem: it prints a published federal figure for care that never happened.
   -------------------------------------------------------------------------- */
const setOf = (story: string) => [...new Set(parseJourney(story, SELECTABLE).map((s) => s.result.item?.id).filter(Boolean))].sort();

describe('1 — care that never happened, is planned, or was someone else\'s is never priced', () => {
  const NOTHING: [string, string][] = [
    ['my doctor suggested physical therapy and I never went', 'the refusal is in the other half of the sentence'],
    ['they never ran the Lyme test even though I asked', 'a refusal said as a verb, not as one of the fixed phrases'],
    ['no one ever ordered an EMG for me', 'nobody ever + a verb'],
    ['I read online that a tilt table test might explain it', 'read about, not had'],
    ['I want to ask about an EEG at my next appointment', 'still to come'],
    ['the mammogram is booked for next month', 'booked, not had'],
    ['my sister had an MRI and hers showed something', 'not this person'],
  ];
  for (const [story, why] of NOTHING) {
    it(`prices nothing in "${story}" (${why})`, () => {
      expect(setOf(story)).toEqual([]);
    });
  }

  it('says why, in the person\'s terms, rather than going silent', () => {
    const planned = parseJourney('the mammogram is booked for next month', SELECTABLE);
    expect(planned[0].result.reason).toBe(NOT_YOURS_OR_NOT_YET_REASON);
    // a refusal is still a counted gap, because the person did need the care
    const refused = parseJourney('no one ever ordered an EMG for me', SELECTABLE);
    expect(refused[0].result.gapCategory).toBe('care-not-sought');
  });

  it('still prices the care in a sentence that turns', () => {
    expect(setOf('I put it off for a year and finally had the brain MRI')).toContain('cms-img-mri-brain-nc');
  });
});

describe('2 — whole words, and the whole term', () => {
  const CASES: [string, string[]][] = [
    ['the magnesium came back low', ['cms-lab-magnesium']],
    ['they dipped my urine and then looked at it under the microscope', ['cms-lab-urinalysis']],
    ['they numbed my throat, put the scope down and pinched off a piece of tissue', ['cms-proc-egd-biopsy']],
    ['a picture of my lungs with the flat plate against my back', ['cms-img-cxr']],
    ['a nuclear stress test with the injection and the pictures', ['cms-img-nuclear-stress']],
    ['the test for damage to the heart muscle came back normal', ['cms-lab-troponin']],
    ['a bone density scan of my hips and spine', ['cms-img-dexa']],
    ['sleap study at the hospital', ['cms-test-sleep-study']],
    ['two hours in the waiting room before anybody called my name', []],
    ['the hospital sent a second bill just for using their clinic room', ['cms-g0463-hospital-clinic-fee']],
    ['family therapy with my husband in the room', ['cms-mh-family-therapy']],
    ['they scanned my head in the tunnel with no dye at all', ['cms-img-mri-brain-nc']],
    ['I was frightened it really was all in my head', []],
    ['the brain fog got so bad I forgot my own address', []],
    ['an hour with a psychologist doing memory and attention puzzles', ['cms-test-neuropsych-1h']],
    ['a first hour with a physical therapist who measured everything I could do', ['cms-pt-eval-low']],
    ['an hour long session with my therapist', ['cms-mh-therapy-60']],
    ['thirty minutes with my therapist', ['cms-mh-therapy-30']],
    ['physcial therapy for my neck twice a week', ['cms-pt-exercise-15']],
    ['I filled in the little questionnaire about my mood in the waiting room', ['cms-96127']],
  ];
  for (const [story, expected] of CASES) {
    it(`"${story}" → ${expected.join(', ') || 'nothing'}`, () => {
      expect(setOf(story)).toEqual([...expected].sort());
    });
  }
});

describe('3 — the row whose full term the clause names wins', () => {
  const CASES: [string, string[]][] = [
    ['the urine sample I gave went off to the lab to be grown', ['cms-lab-urine-culture']],
    ['a second confirming Lyme test after the first one', ['cms-lab-lyme-confirm']],
    ['the high sensitivity version of the inflammation test', ['cms-lab-hscrp']],
    ['a home sleep test with a belt round my chest and a probe on my finger', ['cms-test-home-sleep-full']],
    ['the breathing test again after they gave me the inhaler', ['cms-test-spirometry-bronchodilator']],
    ['an echo done through my throat with the probe', ['cms-img-tee']],
    ['a colonoscopy where they took out a polyp', ['cms-proc-colonoscopy-polyp']],
    ['a scan of my lower back inside the tunnel machine', ['cms-img-mri-lumbar-nc']],
    ['they scanned my belly with the jelly and the wand', ['cms-img-us-abdomen']],
  ];
  for (const [story, expected] of CASES) {
    it(`"${story}" → ${expected.join(', ')}`, () => {
      expect(setOf(story)).toEqual([...expected].sort());
    });
  }

  it('and the plainest row still wins when the person named no qualifier', () => {
    expect(setOf('a colonoscopy')).toEqual(['cms-proc-colonoscopy']);
    expect(setOf('an upper endoscopy with a biopsy')).toEqual(['cms-proc-egd-biopsy']);
    expect(setOf('a CT of the belly with dye')).toEqual(['cms-img-ct-abd-pelvis-c']);
  });

  it('one test named twice is one test, not two figures', () => {
    // "high sensitivity version" + the residual "inflammation test" are the same draw
    expect(setOf('the high sensitivity version of the inflammation test')).toEqual(['cms-lab-hscrp']);
    // and a result is never a second unit of care
    expect(setOf('the magnesium came back low')).toEqual(['cms-lab-magnesium']);
  });
});

describe('4 — a visit does not swallow the tests it ordered', () => {
  it('"my pcp ordered an a1c and lipids" prices the visit AND both labs', () => {
    // R4 (brainfog BF-14): "my pcp" is the regular doctor, 99213, like the demo.
    expect(setOf('my pcp ordered an a1c and lipids')).toEqual(['cms-99213', 'cms-lab-a1c', 'cms-lab-lipid-panel'].sort());
  });

  it('a one-word test left over from a visit is still a test', () => {
    expect(setOf('my pcp ordered a1c')).toEqual(['cms-99213', 'cms-lab-a1c'].sort());
    expect(setOf('the neurologist ordered an MRI of my brain')).toEqual(['cms-99204', 'cms-img-mri-brain-nc'].sort());
  });

  it('and the clinician is still counted where the sentence names only tests', () => {
    expect(setOf('three years, eleven doctors, and the only tests were a CBC and a metabolic panel'))
      .toEqual(['cms-lab-cbc', 'cms-lab-cmp']);
  });
});

/* --------------------------------------------------------------------------
   FLOW patient walk, 2026-09-30: a woman with long COVID typing on a phone.
   Each rule below came from a sentence she typed and what it printed.
   -------------------------------------------------------------------------- */
describe('FLOW patient: supplements are bought, not tested', () => {
  it('"I take magnesium and vitamin D supplements" prices no blood test, and says why', () => {
    const segs = parseJourney('I take magnesium and vitamin D supplements', SELECTABLE);
    expect(segs.map((s) => s.result.item)).toEqual([null, null]);
    for (const s of segs) expect(s.result.reason).toBe(SUPPLEMENT_REASON);
    expect(readOnPurpose(SUPPLEMENT_REASON)).toBe(true); // never sent to the AI reader
  });
  it('a level that was tested still prices', () => {
    expect(ids('they checked my vitamin D level')).toEqual(['cms-lab-vitamin-d']);
    expect(ids('the magnesium came back low')).toEqual(['cms-lab-magnesium']);
    expect(ids('a vitamin D test')).toEqual(['cms-lab-vitamin-d']);
  });
  it('a camera pill is a capsule endoscopy, not a supplement', () => {
    expect(ids('a camera pill for my small bowel')).toEqual(['cms-test-capsule-endoscopy']);
  });
});

describe('FLOW patient: counts she said are the counts she gets', () => {
  it('"3 neurologist visits" is three visits: one new, two return (CMS new vs established)', () => {
    const segs = parseJourney('3 neurologist visits', SELECTABLE);
    expect(segs.map((s) => [s.result.item?.id, s.times])).toEqual([['cms-99204', 1], ['cms-99214', 2]]);
    expect(segs[1].countNote).toContain('established patient, CPT 99214');
  });
  it('the number may sit two words from its unit', () => {
    expect(extractCount('5 PT sessions').times).toBe(5);
    expect(extractCount('two MRI scans').times).toBe(2);
    expect(extractCount('6 weeks PT sessions').times).toBe(1); // a span is never a count
  });
  it('"2 more neurologist visits" and "saw the cardiologist again" are return visits', () => {
    expect(parseJourney('2 more neurologist visits', SELECTABLE).map((s) => [s.result.item?.id, s.times])).toEqual([['cms-99214', 2]]);
    expect(ids('saw the cardiologist again')).toEqual(['cms-99214']);
  });
  it('several different specialists are each a first visit', () => {
    expect(parseJourney('two rheumatologists', SELECTABLE).map((s) => [s.result.item?.id, s.times])).toEqual([['cms-99204', 2]]);
    expect(parseJourney('four different specialists', SELECTABLE).map((s) => [s.result.item?.id, s.times])).toEqual([['cms-99204', 4]]);
  });
  it('"lots of doctor visits" is counted once and the line asks how many', () => {
    const s = parseJourney('lots of doctor visits over two years', SELECTABLE)[0];
    expect(s.times).toBe(1);
    expect(s.countNote).toMatch(/you said “lots”, which is not a number/);
  });
});

describe('FLOW patient: typed tired, on a phone', () => {
  it('"saw my primry dr like 5 tims" and "blood wrk" price', () => {
    const segs = parseJourney('saw my primry dr like 5 tims then blood wrk', SELECTABLE);
    expect(segs[0].result.item?.id).toMatch(/^cms-9921[34]$/);
    expect(segs[0].times).toBe(5);
    expect(segs[1].result.item?.id).toBe('cms-lab-cbc');
  });
  it('"b12 levles" and "thryoid test" price', () => {
    expect(ids('b12 levles')).toEqual(['cms-lab-b12']);
    expect(ids('thryoid test')).toEqual(['cms-lab-tsh']);
  });
  it('a real word one letter from a care word is left alone', () => {
    expect(mapUtterance('an infection', SELECTABLE).item?.id ?? '').not.toMatch(/inject/);
    expect(mapUtterance('the emergence of symptoms', SELECTABLE).item?.id ?? null).not.toBe('cms-ed-99284-complete');
  });
  it('an unknown phrase says it is unpriced, then what to do', () => {
    expect(NO_MATCH_REASON).toMatch(/^not in the federal price table, so it stays unpriced\. Check the spelling/);
  });
});

describe('FLOW patient: "I never got better" is how it went, not care she went without', () => {
  it('is not counted as care not received', () => {
    const s = parseJourney('I never got better.', SELECTABLE)[0];
    expect(s.result.item).toBeNull();
    expect(s.result.gapCategory).toBeNull();
    expect(s.result.reason).toBe(COURSE_REASON);
    expect(gapSignalFor('I never got better')).toBeNull();
  });
  it('a real refusal is still counted', () => {
    expect(gapSignalFor('I never got the MRI')?.category).toBe('care-not-sought');
    expect(gapSignalFor('never got an appointment')?.category).toBe('care-not-sought');
  });
});

describe('FLOW patient: her largest costs are named for what they are', () => {
  it('lost work, equipment and lost insurance each carry their own reason and no figure', () => {
    const segs = parseJourney('I lost my job as a teacher and my health insurance with it, bought a wheelchair, compression socks', SELECTABLE);
    expect(segs.every((s) => s.result.item === null)).toBe(true);
    expect(segs.map((s) => s.result.reason)).toEqual([LOST_WORK_REASON, INSURANCE_REASON, EQUIPMENT_REASON, EQUIPMENT_REASON]);
    expect(segs[1].result.gapCategory).toBe('life-lost');
    expect(lostWorkPhrase('I lost my job as a teacher')).toBe(true);
    expect(lostWorkPhrase('the meds stopped helping')).toBe(false);
  });
});

describe('FLOW patient: adding again joins the line already there', () => {
  const it99 = TABLE.find((t) => t.id === 'cms-img-mri-brain-nc')!;
  const line = (raw: string, times: number, paid?: number) => ({ key: raw, raw, item: it99, times, ...(paid ? { paid } : {}) });
  it('same unit, later batch: one line, the count raised, both sets of words kept', () => {
    const r = mergeEntries([line('an MRI of my brain', 1)], [line('another brain MRI', 1)]);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].times).toBe(2);
    expect(r.entries[0].raw).toBe('an MRI of my brain; another brain MRI');
    expect(mergeToast(r.merged)).toMatch(/added 1 to MRI of the brain/);
  });
  it('lines in one batch, and a line with a paid amount, are never joined', () => {
    expect(mergeEntries([], [line('a', 1), line('b', 1)]).entries).toHaveLength(2);
    expect(mergeEntries([line('a', 1, 300)], [line('b', 1)]).entries).toHaveLength(2);
  });
});

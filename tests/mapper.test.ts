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
  type GapCategory,
} from '../lib/mapper';
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
  ['labs, then an EKG, then a CT scan', ['cms-lab-cbc', 'cms-test-ecg', 'cms-img-ct-chest-nc'], [1, 1, 1]],
  ['x3 chest x-ray', ['cms-img-cxr'], [3]],
  ['the ER three times', ['cms-ed-99284-complete'], [3]],

  // 🔴 R1 bug: a duration ate the count and the line priced 10x low
  ['I spent four years in circles: my family doctor ten times', [null, 'cms-99214'], [1, 10]],
  // 🔴 R1 bug: six months of PT read as two sessions
  ['physical therapy twice a week for six months', ['cms-pt-exercise-15'], [52]],
  ['weekly for six months of physical therapy', ['cms-pt-exercise-15'], [26]],
  ['I saw my doctor every month for two years', ['cms-99214'], [24]],
  ['PT twice a week for 12 weeks', ['cms-pt-exercise-15'], [24]],
  ['six months of weekly therapy', ['cms-mh-therapy-45'], [26]],
  ['quarterly bloodwork', ['cms-lab-cbc'], [4]],
  ['quarterly bloodwork for two years', ['cms-lab-cbc'], [8]],
  ['a dozen appointments with my doctor', ['cms-99214'], [12]],
  ['four or five visits to the ER', ['cms-ed-99284-complete'], [4]],

  // 🔴 R1 bug: the second unit of care vanished in silence
  ['saw a neurologist who ordered an MRI of my brain', ['cms-99204', 'cms-img-mri-brain-nc'], [1, 1]],
  ['saw my cardiologist who ordered an echo and a Holter',
    ['cms-99204', 'cms-img-echo', 'cms-test-holter'], [1, 1, 1]],
  ['they scanned my heart and did bloodwork', ['cms-img-echo', 'cms-lab-cbc'], [1, 1]],
  ['blood work and an EKG', ['cms-lab-cbc', 'cms-test-ecg'], [1, 1]],
  ['sleep study and an EEG', ['cms-test-sleep-study', 'cms-test-eeg'], [1, 1]],
  ['endoscopy and a colonoscopy', ['cms-proc-egd-biopsy', 'cms-proc-colonoscopy'], [1, 1]],
  ['urgent care twice and a CT scan', ['cms-99203', 'cms-img-ct-chest-nc'], [2, 1]],
  ['saw a psychiatrist who said it was anxiety', ['cms-mh-psych-eval', null], [1, 1]],
  // one unit of care that happens to contain a joining word stays one line
  ['MRI with and without contrast', ['cms-img-mri-brain-both'], [1]],
  ['CT of my abdomen and pelvis', ['cms-img-ct-abd-pelvis-c'], [1]],

  // 🔴 R1 bug: a count word poisoned the match and offered a nonsense row
  ['two rheumatologists', ['cms-99204'], [2]],
  ['three MRIs', ['cms-img-mri-brain-nc'], [3]],
  ['two cardiologists and three MRIs', ['cms-99204', 'cms-img-mri-brain-nc'], [2, 3]],

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
  ['nerve test', ['cms-test-emg'], [1]],
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
    expect(mapUtterance('MRI for brain fog', SELECTABLE).item?.id).toBe('cms-img-mri-brain-both');
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

  it('every added phrase maps back to its own row', () => {
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
      ['I saw my doctor every month for two years', 'cms-99214', 24],
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
    expect(segs.map((x) => x.result.item?.id ?? null)).toEqual([null, 'cms-99214']);
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
    expect(s.result.item?.id).toBe('cms-99214');
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
    expect(seg1('MRI with and without contrast').result.item?.id).toBe('cms-img-mri-brain-both');
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

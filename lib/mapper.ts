/* ==========================================================================
   MAPPING LAYER — plain language → a unit of care

   This module is allowed to be fuzzy, probabilistic, and one day model-driven.
   It is NOT allowed to produce a price. It returns a unit of care or null.
   Everything downstream of it is a table lookup.

   Swapping the deterministic matcher below for an LLM changes this file only.
   That is the entire reason the two layers are split.

   Three rules this file holds, because breaking any of them shows up as a
   dollar figure that is wrong:
     1. A count the person stated is read the way they said it — "ten times",
        "twice a week for six months", "every month for two years" — and the
        arithmetic is handed back so it can be shown and edited, never hidden.
     2. Nothing typed disappears. "Saw a neurologist who ordered an MRI" is two
        units of care, and both are emitted.
     3. A symptom is not a unit of care. "I was exhausted" maps to nothing and
        says why, instead of landing on the nearest row that shares a word.
   ========================================================================== */

import type { PriceItem } from './types';
import { placeOnlyPhrase } from './state-detect';
import { DIAGNOSED_REASON, DIAGNOSIS_REASON, isDiagnosisLine } from './diagnosis-line';
import { COMMON_WORDS } from './common-words';
import { TABLE as FULL_TABLE } from './table';

/** How sure the match is. Reported to the person; never used to invent a figure. */
export type MatchConfidence = 'high' | 'medium' | 'low' | 'none';

export interface MapResult {
  item: PriceItem | null;
  score: number;
  /** Shown to the user so the mapping is never a black box. */
  matchedOn: string | null;
  /** honest: exact wording = high · several words = medium · one word = low */
  confidence: MatchConfidence;
  /** Why nothing matched, in the person's terms. null when something did. */
  reason: string | null;
  /** The count on /gap this phrase belongs to, when it names something no
   *  federal file prices. Null for an ordinary unit of care. A category can
   *  ride along WITH a priced item (being told it was nothing happened at a
   *  visit that really was billed). */
  gapCategory: GapCategory | null;
  /** Whole months, when the phrase named a length of time rather than care.
   *  Null otherwise. Named `months` because lib/sheet.ts reads the same field
   *  off the stored entry — one name, or the sheet and the mapper disagree. */
  months: number | null;
}

const STOP = new Set([
  'the', 'a', 'an', 'my', 'i', 'me', 'to', 'at', 'in', 'on', 'for', 'of', 'and',
  'was', 'were', 'had', 'have', 'has', 'went', 'saw', 'got', 'did', 'do', 'some',
  'they', 'them', 'it', 'that', 'this', 'with', 'about',
  /* FLOW4 blocker, 2026-10-01: "took" and "out" are the verbs of a whole sentence,
     never the name of care. "it took months to find out" cleared the match bar
     on two of "took out a polyp"'s three words and priced a $500 colonoscopy.
     The care word ("polyp", "x rays", "sleep test") still carries the match. */
  'took', 'take', 'taken', 'taking', 'out',
]);

/** Short forms people actually say, expanded before matching. Words only, never prices. */
const ALIASES: [RegExp, string][] = [
  [/\b(?:er|a&e|emergency|emergency dept|emergency department)\b/g, 'emergency room'],
  [/\bekg\b/g, 'ecg'],
  /* JUDGE-7 #8: "Saw rheumatology 4x, neurology 2x, GI 3x" priced $0. A
     specialty said for the visit is that specialist's visit, the same unit
     "saw a rheumatologist 4x" prices, when the specialty is the whole phrase
     or follows saw/see/went to ("waited five months for neurology" is a wait,
     never a visit). "GI" alone, or after saw/see, is the gastroenterologist;
     "GI bleed" and "GI doctor" are left as they are. */
  [/^(?:(saw|see|seen|seeing|went to|go to) )?(?:the )?(rheumat|neur|cardi|gastroenter|endocrin|dermat|pulmon|hemat|nephr|ur|allerg|immun)ology$/g, '$1 $2ologist'],
  [/\b(saw|see|seen|seeing|went to) (?:the )?(rheumat|neur|cardi|gastroenter|endocrin|dermat|pulmon|hemat|nephr|ur|allerg|immun)ology\b/g, '$1 $2ologist'],
  [/^gi$/g, 'gastroenterologist'],
  [/\b(saw|see|seen|seeing|sees) gi\b/g, '$1 gastroenterologist'],
  [/\bpcp\b/g, 'regular doctor'],
  [/\bgp\b/g, 'regular doctor'],
  [/\bcat scan\b/g, 'ct scan'],
  [/\bbloods\b/g, 'blood work'],
  [/\blabs\b/g, 'blood work'],
  [/\bbloodwork\b/g, 'blood work'],
  [/\blab work\b/g, 'blood work'],
  [/\bphysio(?:therapy|therapists?|s)?\b/g, 'physical therapy'],
  [/\btelehealth\b/g, 'video visit'],
  [/\btelemedicine\b/g, 'video visit'],
  /* R4, 2026-09-30 (R3 brainfog BF-03/04, c1 C2, parent PAR-06): the names tired
     people and parents actually type. "a physical therapist 8 times" was a
     psychotherapy session ×8 ($911), "my regular doc 4 times" and "the heart
     doc" came back unpriced. A physical therapist is physical therapy, never
     psychotherapy. */
  [/\bphysical therapists?\b/g, 'physical therapy'],
  [/\bdocs\b/g, 'doctors'],
  // "my primary doctor" (and "my primary dr", corrected above) is a primary care doctor.
  [/\bprimary (doctor|doctors|physician|provider)\b/g, 'primary care $1'],
  [/\bdoc\b/g, 'doctor'],
  [/\b(heart|lung|brain|gut|skin|kidney|blood|sleep|pain|hormone|nerve|stomach) (?:guy|lady|person|dude|man|woman)\b/g, '$1 doctor'],
  [/\bstomach doctor\b/g, 'gi doctor'],
  [/\bneuro\b(?!\s+(?:psych\w*|exam\w*|test\w*|check\w*|ophth\w*|rehab\w*|surg\w*|muscular|behavior\w*|cognitive|feedback|imaging|consult\w*))/g, 'neurologist'],
  [/\bcardio doctor\b/g, 'cardiologist'],
  [/\brheumy\b/g, 'rheumatologist'],
  [/\bpulmo\b/g, 'pulmonologist'],
  [/\bpeds\b/g, 'pediatric'],
  [/\b(?:kids|childrens|children s|child s) doctor\b/g, 'pediatrician'],
  /* judge panel #5 (2026-10-01): "two cardiology visits", "a rheumatology
     appointment". The specialty said as an adjective is the same specialist. */
  // Not after a wait: "six months of waiting for the neurology appointment" is a wait.
  [/(?<!\bwait(?:ing|ed)? (?:for |on )?(?:a |an |the |my |her |his )?)\b(rheumat|neur|cardi|gastroenter|endocrin|pulmon|dermat|nephr|hemat|haemat|onc|immun|ur|gynec|ophthalm|otolaryng)ology (appointments?|visits?|consults?|consultations?|follow ups?|followups?|clinic|office)\b/g, '$1ologist $2'],
  /* JUDGE-5 #4 (2026-10-01): "the doctor saw me 5 times", "her doctor saw her 5
     times" and "saw the doctor 5 times" stayed $0 with "check the spelling"
     while "saw my doctor 5 times" priced 99213 x5. The clinician as the subject
     of "saw me" is the visit said the other way round; "the", "her", "his",
     "their" and "our" doctor is the regular doctor, as "my doctor" is. Read on
     the matcher's words only (normalize), never on flat(), so who the story is
     about is still read from what she typed. */
  [/\b(?:(?:my|the|her|his|their|our) )?((?:regular |family |own )?(?:doctor|[a-z]+ologist|pediatrician|specialist|internist|physician)) (?:saw|sees|seen|has seen|had seen) (?:me|her|him|them|us)\b/g, 'saw my $1'],
  [/\b(?:the|her|his|their|our) ((?:regular |family |own )?doctor)\b/g, 'my $1'],
];

/* 🔴 ONE-LETTER TYPOS IN A CLINICIAN'S NAME (R4, brainfog BF-04): "nuerologist",
   "cardiologst", "rhuematologist". A word of nine letters or more that ends
   like a clinician and sits one edit (a swap, a dropped, added or changed
   letter) from exactly one clinician noun is read as that noun. Short words
   are never corrected: at five letters one edit is a different word. */
const CLINICIAN_WORDS = [
  'rheumatologist', 'neurologist', 'cardiologist', 'gastroenterologist', 'endocrinologist',
  'pulmonologist', 'dermatologist', 'nephrologist', 'hematologist', 'haematologist', 'oncologist',
  'immunologist', 'allergist', 'urologist', 'psychiatrist', 'otolaryngologist', 'ophthalmologist',
  'orthopedist', 'orthopaedist', 'gynecologist', 'pediatrician', 'paediatrician', 'internist',
  'specialist', 'physician', 'practitioner',
];
const CLINICIAN_WORD_SET = new Set(CLINICIAN_WORDS);

/** Damerau-Levenshtein distance, capped: returns 2 as soon as it is over 1. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const diff: number[] = [];
    for (let i = 0; i < a.length && diff.length < 3; i++) if (a[i] !== b[i]) diff.push(i);
    if (diff.length === 1) return true;
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < s.length && s[i] === l[i]) i++;
  return s.slice(i) === l.slice(i + 1);
}

const TYPO_CACHE = new Map<string, string>();
function fixClinicianTypo(w: string): string {
  if (w.length < 9 || CLINICIAN_WORD_SET.has(w)) return w;
  const hit = TYPO_CACHE.get(w);
  if (hit !== undefined) return hit;
  const plural = w.endsWith('s') && !w.endsWith('ss');
  const stem = plural ? w.slice(0, -1) : w;
  let out = w;
  /* flow3-21: "pediatrican" (the i before the a dropped) ends in -ican, not -ian. */
  if (/(?:ist|ian|ion|ogst|gist|cian|tion|trian|tian|ologst|logist|olgist|ican|tican|trican)$/.test(stem) || /olog/.test(stem)) {
    const near = CLINICIAN_WORDS.filter((n) => withinOneEdit(stem, n));
    if (near.length === 1) out = plural ? `${near[0]}s` : near[0];
  }
  TYPO_CACHE.set(w, out);
  return out;
}

/* 🔴 TYPED TIRED, ON A PHONE (FLOW patient-5, 2026-09-30): "saw my primry dr
   like 5 tims" and "blood wrk" came back unpriced, the commonest care she had.
   Two passes, both before any matching and both symmetric (the catalog's own
   words go through the same normalize):
     1. COMMON_TYPOS: short words that are always the care word they look like
        ("dr", "wrk", "tims"). A short word is never corrected by distance: at
        four letters one edit is a different word.
     2. CARE_WORDS: a word of five letters or more one edit (a swap, a dropped,
        added or changed letter) from exactly one of these longer care words.
        NOT_A_TYPO holds the real English words that sit one edit from a care
        word ("infection" is not "injection", "emergence" is not "emergency");
        it was built by checking every word below against a full English word
        list, and a new care word needs the same check. */
const COMMON_TYPOS: Record<string, string> = {
  dr: 'doctor', drs: 'doctors', dctr: 'doctor', docter: 'doctor', doctr: 'doctor', doctro: 'doctor', dcotor: 'doctor',
  docotr: 'doctor', docters: 'doctors', doctrs: 'doctors',
  wrk: 'work', wrok: 'work', blod: 'blood', bllod: 'blood', bloood: 'blood', blodd: 'blood',
  tims: 'times', tiems: 'times', timse: 'times', tmes: 'times',
  vist: 'visit', vsit: 'visit', visti: 'visit', vists: 'visits', vsits: 'visits',
  appt: 'appointment', appts: 'appointments', ofice: 'office', offce: 'office',
  xray: 'x ray', xrays: 'x rays',
};
const CARE_WORDS = [
  'primary', 'regular', 'physical', 'therapy', 'appointment', 'appointments', 'emergency', 'ultrasound',
  'hospital', 'bloodwork', 'colonoscopy', 'endoscopy', 'mammogram', 'echocardiogram', 'neurology',
  'cardiology', 'rheumatology', 'gastroenterology', 'endocrinology', 'dermatology', 'physiotherapy',
  'infusion', 'injection', 'injections', 'acupuncture', 'chiropractor', 'psychologist', 'therapist',
  'counselor', 'counseling', 'referral', 'surgery', 'doctors', 'levels', 'thyroid', 'allergy', 'vitamin',
];
const CARE_WORD_SET = new Set(CARE_WORDS);
const NOT_A_TYPO = new Set([
  'primacy', 'primar', 'regula', 'tegular', 'emergence', 'bloodworm', 'bloodwort', 'colonoscope', 'endoscope',
  'necrology', 'physicotherapy', 'infection', 'infections', 'insection', 'invection', 'psychologism', 'deferral',
  'purgery', 'doctor', 'appointment', 'injection', 'level', 'levers', 'athyroid', 'theroid', 'thyreoid', 'thyrsoid',
]);
const CARE_TYPO_CACHE = new Map<string, string>();
function fixCareTypo(w: string): string {
  const short = COMMON_TYPOS[w];
  if (short) return short;
  if (w.length < 5 || CARE_WORD_SET.has(w) || NOT_A_TYPO.has(w) || /\d/.test(w)) return w;
  const hit = CARE_TYPO_CACHE.get(w);
  if (hit !== undefined) return hit;
  const near = CARE_WORDS.filter((n) => withinOneEdit(w, n));
  const out = near.length === 1 ? near[0] : w;
  CARE_TYPO_CACHE.set(w, out);
  return out;
}

/* normalize() is pure and is called on the same catalog words thousands of
   times a story; the typo pass above made each call dearer, so results are
   remembered (bounded: cleared at 50,000 entries). */
const NORM_CACHE = new Map<string, string>();
function normalize(s: string): string {
  const hit = NORM_CACHE.get(s);
  if (hit !== undefined) return hit;
  const out = normalizeUncached(s);
  if (NORM_CACHE.size > 50000) NORM_CACHE.clear();
  NORM_CACHE.set(s, out);
  return out;
}
/* JUDGE-6 #7: "2 mri's of my brain" read x1 while "2 MRIs" read x2, and "3 CTs"
   or "2 EKGs" priced nothing. People write an acronym's plural with an
   apostrophe, and a three-letter plural like "cts" is too short for
   singular(). The apostrophe comes off here, for the count reader and the
   matcher alike, and the matcher then folds the acronym plural to its
   singular so the alias table ("ekg" to "ecg") still sees it. */
const ACRONYM_CARE = 'mri|ct|pet|ekg|ecg|eeg|emg|echo|x-?ray|x ray|xray';
const APOSTROPHE_PLURAL = new RegExp(`\\b(${ACRONYM_CARE})['\u2019\u2018\`]s\\b`, 'gi');
const ACRONYM_PLURAL = /\b(mri|ct|ekg|ecg|eeg|emg|xray|x ray)s\b/g;
export function foldApostrophePlurals(s: string): string {
  return s.replace(APOSTROPHE_PLURAL, '$1s');
}

function normalizeUncached(s: string): string {
  let t = foldApostrophePlurals(s)
    .toLowerCase()
    .replace(/[^a-z0-9&\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(ACRONYM_PLURAL, '$1');
  t = t.split(' ').map(fixCareTypo).join(' ');
  if (/[a-z]{9}/.test(t)) t = t.split(' ').map(fixClinicianTypo).join(' ');
  for (const [re, to] of ALIASES) t = t.replace(re, to);
  return t.replace(/&/g, ' ').replace(/\s+/g, ' ').trim();
}

/* --------------------------------------------------------------------------
   COUNTS, DURATIONS AND FREQUENCIES
   -------------------------------------------------------------------------- */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, once: 1, two: 2, twice: 2, three: 3, thrice: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
};

/** Longest-first so "seventeen" is never read as "seven". */
const NUM = ['\\d{1,3}', ...Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length)].join('|');

/** Things a person counts. "years" is deliberately NOT here — a duration is not a count. */
const COUNT_UNITS = 'times|visits|appointments|sessions|trips|scans|tests|rounds|courses|cycles|treatments|referrals|days|nights';

/** Calendar arithmetic, so "six months" and "26 weeks" are the same span. */
const SPAN_DAYS: Record<string, number> = { day: 1, night: 1, week: 7, month: 30.4375, year: 365.25, decade: 3652.5 };

/** Every-so-often words, as a rate per day. */
const FREQ_ADVERB: Record<string, number> = {
  daily: 1, nightly: 1, weekly: 1 / 7, biweekly: 1 / 14, fortnightly: 1 / 14,
  monthly: 1 / 30.4375, bimonthly: 1 / 60.875, quarterly: 1 / 91.3125,
  yearly: 1 / 365.25, annually: 1 / 365.25,
};

/** The calendar unit each of those words is naturally shown in, so the
 *  arithmetic on the line reads "1 a week × 26 weeks", not "4.35 a month". */
const ADVERB_SPAN: Record<string, string> = {
  daily: 'day', nightly: 'day', weekly: 'week', biweekly: 'week', fortnightly: 'week',
  monthly: 'month', bimonthly: 'month', quarterly: 'year', yearly: 'year', annually: 'year',
};

/** Words that describe how often or how many. They are counted, then kept out of
 *  the matching so "two rheumatologists" cannot land on "Chest X-ray, two views".
 *  Exported because the typeahead in lib/search.ts must drop the same words —
 *  one definition, or the two halves of the product disagree on screen. */
export const COUNT_NOISE = new Set([
  ...Object.keys(NUMBER_WORDS), ...Object.keys(FREQ_ADVERB),
  'couple', 'few', 'several', 'every', 'each', 'per', 'about', 'almost', 'nearly',
  'around', 'roughly', 'more', 'another', 'again', 'spent', 'lasting', 'spanning',
]);

function toNum(s: string): number {
  const t = s.trim().toLowerCase();
  const n = parseInt(t, 10);
  if (Number.isFinite(n)) return n;
  return NUMBER_WORDS[t] ?? 1;
}

/** English plurals, crudely but symmetrically: applied to both sides of a comparison. */
function singular(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  // 'sis' guards analysis/diagnosis; plain '...is' does not, or "MRIs" never becomes "MRI".
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('sis')) return w.slice(0, -1);
  return w;
}

/* 🔴 THE TWO-LETTER WORDS THE CATALOG ITSELF DEPENDS ON.

   tokens() dropped every word of two characters. That silently collapsed
   "chest CT" to "chest", "PT visit" to "visit" and "PT test" to "test" — and
   because the one surviving word was then 100% of what was left of the
   candidate, it scored as a full match. So any sentence with the word chest
   matched a CT of the chest, and any sentence with the word visit matched a
   physical therapy session, at a score well above the confidence floor.

   Measured 2026-09-09 over data/test-fixtures/map-eval.json: 39 published
   candidates collapsed to a single common token this way, and it produced 11
   of the 13 wrong units in that run. The filter is symmetric — it runs over
   the person's words and over the candidate alike — so a real "CT" still
   matches and a bare "chest" no longer does. */
const SHORT_TOKENS = new Set(['ct', 'pt', 'gi', 'hs', 'pe', 'ck', 'nt', 't4', '2d']);

function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((w) => (w.length > 2 || SHORT_TOKENS.has(w)) && !STOP.has(w) && !COUNT_NOISE.has(w))
    .map(singular);
}

/* --------------------------------------------------------------------------
   A SYMPTOM IS NOT A UNIT OF CARE
   "I was exhausted" and "brain fog" are the truest things in a diagnostic
   odyssey and the least priceable. They are told the truth rather than matched
   onto whichever row happens to share a word.
   -------------------------------------------------------------------------- */

const SYMPTOM_PHRASES = [
  'brain fog', 'post exertional malaise', 'shortness of breath', 'short of breath',
  'sore throat', 'joint pain', 'muscle pain', 'muscle aches', 'body aches', 'chest pain',
  'heart racing', 'racing heart', 'pins and needles', 'hair loss', 'weight loss',
  'weight gain', 'night sweats', 'all in my head', 'stomach pain', 'back pain',
  'couldn t think', 'could not think', 'feeling awful', 'feeling terrible',
];

const SYMPTOM_WORDS = new Set([
  'exhausted', 'exhaustion', 'tired', 'tiredness', 'fatigue', 'fatigued', 'fog', 'foggy',
  'dizzy', 'dizziness', 'lightheaded', 'faint', 'fainting', 'fainted', 'blacked', 'collapsed', 'nausea', 'nauseous', 'nauseated',
  'vomiting', 'pain', 'painful', 'ache', 'aching', 'sore', 'soreness', 'headache',
  'migraine', 'palpitation', 'breathless', 'insomnia', 'sleepless', 'anxious', 'panic',
  'depressed', 'depression', 'hopeless', 'scared', 'frightened', 'frustrated', 'angry',
  'alone', 'ignored', 'dismissed', 'gaslit', 'unwell', 'sick', 'ill', 'suffering',
  'struggling', 'bedridden', 'housebound', 'weak', 'weakness', 'numb', 'numbness',
  'tingling', 'burning', 'cramp', 'cramping', 'bloated', 'bloating', 'rash', 'itchy',
  'itching', 'fever', 'chill', 'sweat', 'cough', 'coughing', 'wheezing', 'shaky',
  'shaking', 'tremor', 'crashed', 'crash', 'flare', 'flaring', 'malaise', 'symptom',
  'reflux', 'heartburn', 'constipation', 'diarrhea', 'brainfog', 'worse', 'worsening',
  'awful', 'terrible', 'miserable', 'feel', 'feeling', 'felt', 'hurt', 'hurting', 'hurts',
  'body', 'whole', 'everything', 'everywhere', 'constantly', 'always',
  'crushing', 'debilitating', 'relentless', 'constant', 'unbearable', 'draining', 'endless',
]);

export const SYMPTOM_REASON =
  'a symptom, not a unit of care. The visit or test it led to is what carries a published figure';
/* FLOW patient-15: one long sentence read as "we did not understand you". Two
   short ones now: what happened, then what to do about it. */
export const NO_MATCH_REASON =
  'not in the federal price table, so it stays unpriced. Check the spelling, or say it another way (“blood work”, “my regular doctor”) and it will price';
/* JUDGE-5 #5: the same answer for a phrase whose every word is everyday
   English (or the catalog's own): there is nothing to spell differently. */
/* JUDGE-6 #5: care the table holds under other words, with no word that looks
   misspelled: say it another way, never "check the spelling". */
export const SAY_IT_REASON =
  'not in the federal price table as said, so it stays unpriced. Say it another way (“blood work”, “my regular doctor”) and it will price';
/* JUDGE-6 #5: a night or more in the hospital. Medicare pays a stay per stay,
   under a file this table does not hold, so no figure here describes it. */
export const HOSPITAL_STAY_REASON =
  'a hospital stay. Medicare pays a stay as one amount per stay, from a file this table does not hold, so it stays unpriced here';
/* JUDGE-6 #5: an ultrasound, like an MRI or a CT, is priced by the part. */
export const BARE_ULTRASOUND_REASON =
  'an ultrasound is priced by the part of the body scanned. Say which part (belly, pelvis, neck, thyroid, kidneys, breast…) and it will price; until then it stays unpriced';
export const PLAIN_WORDS_REASON =
  'not read as care: no visit, test or scan is named here. Name one (“blood work”, “my regular doctor”) and it will price';

/** True when everything left in the phrase is how the person felt. */
function isSymptomOnly(raw: string): boolean {
  const q = normalize(raw);
  if (!q) return false;
  let t = ` ${q} `;
  let removed = false;
  for (const p of SYMPTOM_PHRASES) {
    if (t.includes(` ${p} `)) { t = t.split(` ${p} `).join(' '); removed = true; }
  }
  // "for months", "all year" — how long it went on does not make it care.
  const TIME_NOUNS = new Set(['day', 'night', 'week', 'month', 'year', 'time', 'while', 'age', 'all', 'the', 'and']);
  const rest = t.split(' ')
    .filter((w) => w.length > 2 && !STOP.has(w) && !COUNT_NOISE.has(w))
    .map(singular)
    .filter((w) => !TIME_NOUNS.has(w));
  const hasSymptom = removed || rest.some((w) => SYMPTOM_WORDS.has(w));
  return hasSymptom && rest.every((w) => SYMPTOM_WORDS.has(w));
}

/* --------------------------------------------------------------------------
   CARE THAT DID NOT HAPPEN IS NEVER PRICED

   The home page says the care you needed and never got produces $0 in federal
   data. Until this guard existed the product billed it: "I could not afford
   the specialist so I never went" came back as a $177 new-patient visit, and
   "four years of appointments" came back as a 15-minute physical-therapy unit.
   Both are the product contradicting its own headline in front of a judge.

   A refusal, a denial, a cancellation or a bare length of time is a real event
   with no billing code. It comes back with no unit of care, the reason in the
   person's own words, and the /gap category it belongs to, so the count opens
   already carrying it. Nothing in this section produces a figure and nothing
   in it is ever added to a total.

   The categories are the six in data/invisible-events.json. One taxonomy, or
   the mapper and the counter disagree about what a person just told us.
   -------------------------------------------------------------------------- */

export type GapCategory =
  | 'care-not-sought'
  | 'care-denied'
  | 'dismissed'
  | 'wrong-track'
  | 'time-searching'
  | 'life-lost';

export interface GapSignal {
  category: GapCategory;
  /** The person's own words that fired it. Shown on the line, never hidden. */
  matchedOn: string;
  /** Whole months, when the phrase named a length of time. Null otherwise. */
  months: number | null;
  /** True when the phrase describes care that did not happen. Such a phrase can
   *  never carry a price, whatever else in the sentence looks priceable. */
  suppressesPrice: boolean;
  /** FLOW4 flow4-3: the line's own reason, when it is not the category's. */
  reason?: string;
}

export const NOT_RECEIVED_REASON =
  'care you needed and did not get: counted, never priced. No federal file records it.';
export const DENIED_REASON =
  'care you asked for and were refused: counted, never priced. No federal file records it.';
export const DURATION_REASON =
  'a length of time, not a unit of care. Tell us the visits and tests inside it';
export const DISMISSAL_REASON =
  'being told it was nothing is a real event with no billing code: counted, never priced';

/** Apostrophes dropped, everything else collapsed to single spaces, padded both
 *  ends. A cue is written once and matches "didn't", "didn’t" and "did not". */
function flat(s: string): string {
  return ` ${s.toLowerCase().replace(/['‘’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

/** How the illness went: "never got better", "didn't get any better", "never
 *  felt well again", "haven't been the same". Never a refusal of care. */
const COURSE_ONLY = / (?:never|didnt|did not|havent|have not|hasnt|has not|not|wasnt|was not|isnt|is not)(?: really| ever| yet| fully| quite)? (?:(?:got|get|gotten|getting|felt|feel|feeling|been)(?: any| much| all that| a lot| a bit)? (?:better|well|over it|back to normal|back to myself|my life back|the same)|recovered|improved)(?= )/;
const NOT_BETTER = new RegExp(COURSE_ONLY.source, 'g');
export const COURSE_REASON =
  'how your illness went, not a unit of care. The visits and tests along the way are what carry a published figure';

/** Care the person needed and did not get: they never went, could not pay for
 *  it, put it off, cancelled it, or gave up on it. */
const NOT_SOUGHT = [
  'never went', 'never gone', 'didnt go', 'did not go', 'couldnt go', 'could not go',
  'never made it', 'never showed up', 'no showed',
  'couldnt afford', 'could not afford', 'cant afford', 'cannot afford', 'can not afford',
  'couldnt pay', 'could not pay', 'too expensive', 'priced out', 'out of my price range',
  'put it off', 'put off', 'putting it off', 'postponed', 'kept postponing', 'delayed it',
  'cancelled', 'canceled', 'called it off', 'never rescheduled',
  'never got', 'never had', 'never scheduled', 'never booked', 'never made the appointment',
  'did not have it done', 'didnt have it done', 'never had it done',
  'didnt get', 'did not get', 'couldnt get', 'could not get', 'couldnt book', 'could not book',
  'skipped', 'stopped going', 'quit going', 'gave up', 'given up',
  'never followed up', 'didnt follow up', 'did not follow up',
  'never saw', 'never see', 'never met', 'didnt see', 'did not see',
  'couldnt see', 'could not see', 'couldnt get in', 'could not get in',
  'still waiting', 'still havent', 'still have not', 'waiting list', 'wait list',
  'went without', 'did without', 'no money', 'ran out of money', 'i refused',
  // A waitlist is care the person is owed and has not had (J4, 2026-09-30: "on
  // the waitlist for a neurologist for 6 months" priced a $177.36 visit).
  'waitlist', 'waitlisted', 'wait listed', 'on a list for', 'on the list for',
  'waiting on a referral', 'waiting for a referral', 'waiting on the referral', 'waiting for the referral',
  'waiting on approval', 'waiting for approval', 'waiting on authorization', 'waiting for authorization',
  'cant get in', 'can not get in', 'cannot get in', 'cant get an appointment', 'cannot get an appointment',
  'can not get an appointment', 'cant get a referral', 'cannot get a referral', 'cant get seen',
  'no appointments', 'no openings', 'no availability',
  'not taking new patients', 'wasnt taking new patients', 'was not taking new patients',
  'werent taking new patients', 'were not taking new patients', 'not accepting new patients',
  'never heard back', 'never called me back', 'never called back', 'never got back to me',
  'nobody called me back', 'no one called me back', 'no one ever called',
];

/** Care the person asked for and was refused, by a clinician or by a payer. */
const DENIED = [
  'denied', 'was denied', 'were denied', 'been denied', 'denial',
  'turned down', 'turned me down', 'turned me away', 'turned away',
  'refused', 'refused to', 'they refused', 'was refused', 'were refused', 'refused me',
  'wouldnt refer', 'would not refer', 'wouldnt order', 'would not order',
  'wouldnt approve', 'would not approve', 'wouldnt authorize', 'would not authorize',
  'wouldnt cover', 'would not cover', 'not covered', 'wasnt covered', 'was not covered',
  'prior authorization', 'prior auth', 'rejected', 'declined my', 'declined the',
  'said no', 'told me no', 'no referral',
  'wont cover', 'will not cover', 'wouldnt pay for', 'would not pay for', 'wont pay for', 'will not pay for',
  'didnt think i needed', 'did not think i needed', 'said i didnt need', 'said i did not need',
  'said i dont need', 'said i do not need', 'didnt qualify', 'did not qualify', 'dont qualify',
  'do not qualify', 'not eligible', 'wasnt eligible', 'was not eligible',
];

/* 🔴 A REFUSAL SAID AS AN ORDINARY VERB (J4, measured 2026-09-30 on local
   /api/price, rules only): "they wouldn't do the MRI" priced a $195.40 brain
   MRI, "the neurologist wouldn't see me" and "no neurologist would take me"
   priced a $177.36 new-patient visit. The fixed phrases above never saw them,
   because the refusal sits in the verb. Each pattern needs a refusing word AND a
   verb of care, so "the pain wouldn't go away" and "it wouldn't stop" are not
   read as a refusal. */
const REFUSE_VERBS =
  'see|seen|take(?!\\s+(?:no|long|forever|time|a while|much|more|that long|very long))|accept|treat|touch|' +
  'order|refer|book|schedule|test|check|scan|examine|' +
  'look at|look into|approve|authorize|cover|write|prescribe|operate|give|sign off on';
/** Verbs so general they only count when the object is a thing that is done:
 *  "wouldn't do the MRI", never "wouldn't do what I asked". */
const REFUSE_DO = '(?:do|run|perform|get|redo|repeat)\\s+(?:the|a|an|my|any|it|that|this|one|another|anything|surgery|more)\\b';
const REFUSE_WORD =
  'wouldnt|would not|wont|will not|refused to|refuse to|refuses to|declined to|' +
  'didnt want to|did not want to|wasnt willing to|was not willing to|werent willing to|were not willing to';
const DENIED_PATTERNS: RegExp[] = [
  // "they wouldn't do the MRI", "the neurologist wouldn't see me", "my doctor won't order it"
  new RegExp(`\\b(?:${REFUSE_WORD})\\s+(?:even\\s+|ever\\s+|just\\s+|actually\\s+)?(?:(?:${REFUSE_VERBS})\\b|${REFUSE_DO})`),
  // "no neurologist would take me", "nobody would see me", "not one doctor would order it"
  new RegExp(`\\b(?:no|not one|not a single|none of the|nobody|no one|noone)\\s+(?:\\w+\\s+){0,2}?(?:would|will|could|was willing to|were willing to|wanted to)\\s+(?:even\\s+|ever\\s+)?(?:(?:${REFUSE_VERBS})\\b|${REFUSE_DO})`),
  // "couldn't find a neurologist who would take me", "couldn't find anyone to see me"
  /\b(?:couldnt|could not|cant|cannot|can not)\s+find\s+(?:a|an|any|anyone|anybody|someone|somebody|one)\b(?:\s+\w+){0,3}?\s+(?:who|that|to|willing)\b/,
];

/** A refusal whose subject is not a person — "it wouldn't take long", "there
 *  won't be any charge" — is not a refusal of care. */
const NOT_A_REFUSER = / (?:it|there|this) $/;

/** Being told it was nothing. This one does NOT suppress a price: the visit
 *  really was billed. It rides along with the priced line so the count and the
 *  figure come from the same sentence the person typed. */
const DISMISSED = [
  'it was nothing', 'it was all nothing', 'there was nothing',
  'nothing wrong with me', 'nothing was wrong', 'nothing showed up',
  'it was anxiety', 'it was just anxiety', 'just anxiety', 'only anxiety',
  'it was stress', 'it was just stress', 'just stress', 'it was depression',
  'all in my head', 'psychosomatic', 'to lose weight',
  'dismissed me', 'was dismissed', 'brushed me off', 'brushed off',
  'not taken seriously', 'wasnt taken seriously', 'was not taken seriously',
  'didnt believe me', 'did not believe me', 'didnt take me seriously',
  'said i was fine', 'told me i was fine', 'gaslit', 'gaslighting',
];

/* 🔴 A DISMISSAL SAID IN ITS OWN WORDS (round 2, c1: "I was told it was anxiety"
   priced a psychiatric diagnostic evaluation, $173.35). Being told it was
   nothing is counted on its own counter and never priced; the visit it
   happened at prices only when the clause names that visit ("went back to my
   regular doctor and was told it was all anxiety"). What they called it is
   never the care. */
const DISMISS_RE = / (?:(?:was|were|got|been|kept being|keep being|kept getting) )?(?:told|said|thought|decided|insisted|claimed|blamed it on|chalked it up to|put it down to|wrote it off as)(?: me| us| her| him| them)?(?: that)?(?: it was| it is| its| i was| i am| im| she was| he was| it was all| this was| i just had| i had| she had| he had)?(?: all| just| only| probably| simply| likely| purely| mostly)?(?: a| an)? (?:anxiety|stress|depression|nothing|in my head|all in my head|in her head|in his head|psychosomatic|panic attacks?|panic|hormones|hormonal|my weight|her weight|his weight|weight|my age|age|being a woman|normal|fine|a virus|viral|growing pains|attention seeking|faking it|faking|lazy|conversion disorder|functional|burnout|burned out|burnt out)(?= )/;
const DISMISS_RE_G = new RegExp(DISMISS_RE.source, 'g');
/** The clause with the dismissal taken out, so only the care it happened at is matched. */
function stripDismissal(raw: string): string {
  let h = flat(raw).replace(DISMISS_RE_G, ' ');
  for (const cue of DISMISSED) h = h.split(` ${cue} `).join(' ');
  return h.replace(/ (?:and|but|then|who|which|where) (?:was|were|got)?\s*$/, ' ').replace(/\s+/g, ' ').trim();
}

/** Cost cues, the loosest of the refusal words. "I could not afford it" can
 *  explain why someone went somewhere ELSE, so these alone never cancel care the
 *  person says in the same breath that they received. */
const COST_CUES = new Set([
  'couldnt afford', 'could not afford', 'cant afford', 'cannot afford', 'can not afford',
  'couldnt pay', 'could not pay', 'too expensive', 'priced out', 'out of my price range',
  'no money', 'ran out of money',
]);

/** Care the person states they did receive, in their own words. */
const DID_RECEIVE = [
  'i went to', 'went to the', 'i had', 'i saw', 'i got', 'ended up at', 'ended up in',
];

/** They did go in the end. A sentence that turns is not a gap, and the care it
 *  ends in must still price: "I put it off for a year and finally had the MRI". */
const WENT_ANYWAY = [
  'finally', 'eventually', 'ended up', 'in the end', 'until i', 'so i went',
  'then i went', 'i did go', 'i did have', 'did end up', 'out of pocket',
  // "I refused the sedation but they still did the colonoscopy"
  'still did', 'still had', 'still got', 'still ran', 'went ahead', 'but they did', 'but they still',
  // R4 (parent PAR-07): denied, then done. "the tilt table test that insurance
  // denied at first, then did in March" is a test she had, priced once.
  'at first', 'on appeal', 'appealed', 'got it approved', 'finally approved', 'approved it',
  'then did', 'then they did', 'then she had', 'then he had', 'then i had', 'then we got',
];

/* 🔴 CARE THAT NEVER HAPPENED, IS PLANNED, OR HAPPENED TO SOMEONE ELSE.

   The fixed phrases above catch "never went" and "could not afford". They do
   not catch a refusal written as an ordinary verb — "they never ran the Lyme
   test", "no one ever ordered an EMG" — and they say nothing at all about care
   that is booked for next month, wondered about after reading online, or that a
   sister had. Measured 2026-09-09 over data/test-fixtures/map-eval.json: seven
   sentences of that kind put a published federal figure on the page for care
   the person never received. A wrong unit here is the worst thing this file can
   do, so each of these three families is read before anything is matched. */

/** A refusal said as a verb rather than as one of the NOT_SOUGHT phrases. The
 *  gap between the word and the verb allows "never once ran", "never actually
 *  ordered", "no one ever bothered to order". */
const NEVER_VERBS =
  'ran|run|ordered|order|did|done|performed|got|gotten|had|took|taken|tested|checked|' +
  'scheduled|booked|sent|referred|offered|gave|given|looked|examined|went|saw|seen|repeated|followed';
const NEVER_PATTERNS: RegExp[] = [
  new RegExp(`\\b(?:never|not once)\\s+(?:\\w+\\s+){0,2}?(?:${NEVER_VERBS})\\b`),
  new RegExp(`\\b(?:no one|nobody|noone|not one doctor|not a single doctor)\\s+(?:ever\\s+)?(?:\\w+\\s+){0,2}?(?:${NEVER_VERBS})\\b`),
  new RegExp(`\\b(?:was|were|is|are|has been|have been|had been)\\s+never\\s+(?:\\w+\\s+){0,1}?(?:${NEVER_VERBS})\\b`),
];

/** Care that has not happened yet: booked, planned, wondered about, asked for
 *  at a visit still to come. */
const NOT_YET_PATTERNS: RegExp[] = [
  /\b(?:is|are|was|were|gets|getting|get)\s+(?:all\s+)?(?:booked|scheduled|set up|lined up|penciled in|pencilled in)\b/,
  /\bbooked (?:me )?(?:in )?for\b/,
  /\bscheduled (?:me )?for\b/,
  /\bnext (?:month|week|year|appointment|visit|time|one)\b/,
  /\bcoming up\b/,
  /\b(?:want|wants|wanted|would like|hoping|hope|plan|planning)\s+to\s+(?:ask|get|have|book|schedule|try|request|see|do)\b/,
  /\b(?:want|wants|wanted)\s+me\s+to\s+(?:get|have|do|see|try|book)\b/,
  /\bsupposed to (?:get|have|see|do|be)\b/,
  /\bgoing to (?:get|have|see|do|book)\b/,
  /\bmight (?:explain|be|help|show|find|catch)\b/,
  /\bread (?:online|about it|somewhere|on a forum|in a group)\b/,
  /\bwonder(?:ing)? (?:if|about|whether)\b/,
  /\bthinking about (?:getting|having|asking|booking)\b/,
  /\bshould i (?:get|have|ask)\b/,
  /* FINAL-1011 reader: "waiting on a spinal tap" is care still to come. A result
     waited for is the end of care that happened ("waiting on the biopsy
     results"), and "I was waiting for the MRI" said in the past is not this. */
  /(?<!\b(?:was|were|had been) )\bwaiting (?:on|for) (?:a|an|the|my) (?!(?:\w+ ){0,3}?(?:results?|call|callback|report|bill)\b)/,
];

/** Someone else's care. A relative or a friend as the subject of the verb, or a
 *  possessive on the care itself ("my dad's MRI"). */
/* 🔴 A SON OR A DAUGHTER IS THE PATIENT (R4, parent PAR-01). On a tool a parent
   uses to add up a child's diagnostic search, "my son saw a cardiologist twice"
   is the search itself; it was being told "did not happen to you". A child is
   never read as someone else's care. Every other relative still is. */
const SOMEONE_ELSE_NOUNS =
  'sister|brother|mother|father|mom|mum|dad|husband|wife|friend|partner|' +
  'aunt|uncle|cousin|grandmother|grandfather|grandma|grandpa|neighbour|neighbor|' +
  'coworker|colleague|roommate|boyfriend|girlfriend';
const SOMEONE_ELSE_PATTERNS: RegExp[] = [
  /* JUDGE-6 #3: "my mom took me to the pediatrician" is the writer's own care:
     the relative is the subject, "me" or "us" is the patient. */
  new RegExp(`\\b(?:my|his|her|their|our)\\s+(?:${SOMEONE_ELSE_NOUNS})s?\\s+(?:\\w+\\s+){0,2}?(?:had|has|got|gets|went|goes|saw|sees|needed|needs|was|were|is|are|took|takes|gets)\\b(?!\\s+(?:me|us)\\b)`),
  new RegExp(`\\b(?:my|his|her|their|our)\\s+(?:${SOMEONE_ELSE_NOUNS})s\\b`),
];

/** What a result sounds like. "came back low", "was normal", "showed nothing"
 *  is the end of a test, never a second test — and "came back low" was landing
 *  on a low-back scan. */
const RESULT_WORDS = new Set([
  'came', 'come', 'back', 'result', 'results', 'showed', 'show', 'shows', 'read',
  'normal', 'abnormal', 'low', 'high', 'positive', 'negative', 'clear', 'clean',
  'fine', 'elevated', 'raised', 'borderline', 'inconclusive', 'unremarkable',
  'nothing', 'ok', 'okay', 'good', 'bad', 'again', 'value', 'number', 'level',
  // FLOW5 flow5-4: "they found nothing" is the result of the care before it.
  'found', 'find', 'anything', 'wrong',
]);

/** True when every word left in the phrase is about a RESULT rather than about
 *  care. Read like isSymptomOnly(): the truest words in a journey, and the
 *  least priceable. */
function isResultOnly(raw: string): boolean {
  const rest = tokens(raw);
  if (!rest.length) return false;
  return rest.every((w) => RESULT_WORDS.has(w));
}

export const NOT_YOURS_OR_NOT_YET_REASON =
  'did not happen to you, or has not happened yet';

/** The first pattern that fires, and the words it fired on — shown on the line,
 *  because a person must always see why their own sentence carries no figure. */
function firstPattern(hay: string, patterns: readonly RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(hay);
    if (m) return m[0].trim();
  }
  return null;
}

/** True when the phrase describes care that is not this person's, or not yet
 *  theirs. Never a gap: nothing was lost, it simply has not happened. */
export function notYoursOrNotYet(raw: string): string | null {
  const hay = flat(raw);
  return firstPattern(hay, NOT_YET_PATTERNS) ?? someoneElse(hay);
}

/* FLOW4 flow4-10 (2026-10-01): A SPOUSE'S STORY IS THE SEARCH. "my wife had
   seizures for a year. she saw her regular doctor 4 times…" opened with "did not
   happen to you", and the year was lost, on a tool a carer uses to add up the
   search of the person they care for. When a story names a relative as its
   subject and says no care of the writer's own anywhere, that relative is the
   patient, as a son or a daughter already is (JUDGE-6 #3: for the whole story,
   see relativeAsPatient). "my sister had an MRI and I had a CT" still
   reads the sister's MRI as someone else's: the writer named care of their
   own. Set for one parseJourney call only. */
export const PATIENT_RELATIVES = 'husband|wife|partner|spouse|mom|mum|mother|dad|father|sister|brother|boyfriend|girlfriend|grandma|grandmother|grandpa|grandfather';
/* JUDGE-6 #3: the story's patient is the first relative it names as the
   subject of being ill or of care, wherever that clause sits. */
const STORY_RELATIVE = new RegExp(` (?:my|our) (${PATIENT_RELATIVES}) (?:\\w+ ){0,2}?(?:had|has|have|got|gets|went|goes|saw|sees|needed|needs|was|were|is|are|been|took|takes|kept|spent|ended up)(?= )(?! (?:me|us) )`);
const OWN_CARE_SUBJECT = / (?:i|me|im|ive|my (?:doctor|gp|pcp|regular doctor|own doctor)) /;
let patientRelative: string | null = null;

/** The relative a story is about, when it is about one and not the writer. */
export function relativeAsPatient(story: string, segs: readonly string[]): string | null {
  const m = STORY_RELATIVE.exec(flat(story));
  if (!m) return null;
  for (const seg of segs) {
    const hay = flat(seg);
    if (OWN_CARE_SUBJECT.test(hay) && CARE_NAMED.test(hay)) return null;
  }
  /* JUDGE-6 #3: ONE STORY IS ONE PATIENT. Until 2026-10-01 a story about a
     relative was theirs only when it went on about them ("…she saw…") or named
     no care; a lone "my wife saw a neurologist twice" was "did not happen to
     you", and "my husband had a sleep study and an EEG" priced the EEG and not
     the sleep study, so one sentence held two patients. A story that names a
     relative as its patient and no care of the writer's own is a carer adding
     up that person's search: all of its care counts for them. A story where the
     writer names care of their own still keeps a relative's care out of it. */
  return m[1];
}

/** SOMEONE_ELSE_PATTERNS, less the relative this story is about. */
function someoneElse(hay: string): string | null {
  for (const re of SOMEONE_ELSE_PATTERNS) {
    const g = new RegExp(re.source, 'g');
    for (let m = g.exec(hay); m; m = g.exec(hay)) {
      if (patientRelative && new RegExp(`\\b${patientRelative}s?\\b`).test(m[0])) continue;
      return m[0].trim();
    }
  }
  return null;
}

/** Words that are ways of counting or of waiting, never a unit of care.
 *  Singular, because the residual is singularised the same way tokens() is. */
const TIME_FILLER = new Set([
  ...COUNT_UNITS.split('|').map(singular),
  'week', 'month', 'year', 'hour', 'minute', 'decade',
  'waiting', 'wait', 'waited', 'searching', 'search', 'searched',
  // The verbs a wait is said with. Without these, "took six weeks" reads as
  // care and "spent two years" reads as care — see waitSpan() below, which
  // needs its own phrase to come back through gapSignalFor() unchanged.
  'took', 'take', 'taking', 'spend', 'spending', 'sat', 'stuck', 'lost',
  'looking', 'looked', 'chasing', 'chased', 'circle', 'limbo', 'runaround',
  'run', 'around', 'back', 'forth', 'nothing', 'answer', 'nowhere', 'anywhere',
  'everywhere', 'thi', 'these', 'those',
]);

/** The first cue in `cues` that appears in the already-flattened phrase. */
function firstCue(hay: string, cues: readonly string[]): string | null {
  for (const c of cues) if (hay.includes(` ${c} `)) return c;
  return null;
}

/**
 * A span of time in months, for the one stat card this product leads with.
 *
 * Weeks are converted at 4.33 weeks to the month and kept to one decimal:
 * rounding a six-week wait to "1 month" throws away 40 percent of somebody's
 * wait on a page whose headline is TIME SPENT SEARCHING. Months and years are
 * exact, so nothing that already reads as a whole number stops doing so.
 */
function monthsOfSpan(n: number, unit: string): number {
  if (unit === 'decade') return n * 120;
  if (unit === 'year') return n * 12;
  if (unit === 'month') return n;
  if (unit === 'week') return Math.round((n / 4.33) * 10) / 10;
  return Math.round((n / SPAN_DAYS.month) * 10) / 10;
}

/**
 * A phrase that is only a length of time.
 *
 * "Four years of appointments" and "six months of waiting" name how long the
 * search took. They are not care, and the mapper used to price them at whatever
 * row happened to share a word. The duration is read, the rest of the phrase is
 * checked for anything that is a real unit of care, and only when nothing is
 * left does this fire — so "six months of weekly therapy" still prices therapy.
 */
/* FLOW4 flow4-3 (2026-10-01): HOW LONG SHE WAS ILL IS HOW LONG SHE SEARCHED.
   "sick for 4 years", "had dizzy spells for 4 years", "I was sick for 4 years
   before anyone listened": the plainest way the length of the search is said,
   and each one read as a symptom (or as "check the spelling") with no months.
   A span of months, years or a decade, where every other word is how she felt
   or the few words around it, is time spent searching. A span of days or weeks
   is how long a symptom lasted, not a search, and stays the symptom it was. */
const ILL_SPAN_WORDS = new Set([
  'been', 'being', 'spell', 'episode', 'attack', 'bout', 'really', 'very', 'pretty',
  'just', 'still', 'kept', 'getting', 'before', 'anyone', 'anybody', 'listened',
  'believed', 'constantly', 'on', 'off',
  // flow4-10: who was ill, when the story is about someone the writer cares for.
  'son', 'daughter', 'child', 'kid', 'baby', 'husband', 'wife', 'partner', 'spouse',
  'mom', 'mum', 'mother', 'dad', 'father', 'sister', 'brother', 'she', 'he', 'his',
  'her', 'our',
  // JUDGE-6 #5: "ive been sick", "i've been", "im sick", as normalize leaves them.
  've', 'ive', 'im', 'm', 'been', 'since',
]);
/** The words of being ill that carry an illness span: every symptom word, and a
 *  few a person says of an illness that is not a feeling. */
const SPAN_ILL = new Set([...SYMPTOM_WORDS, 'seizure', 'convulsion', 'blackout']);
function illnessSpan(raw: string): { months: number; said: string } | null {
  const dur = readDuration(` ${raw} `, true);
  if (!dur || !['month', 'year', 'decade'].includes(dur.unit)) return null;
  const rest = ` ${raw} `.replace(dur.said, ' ');
  const left = normalize(rest)
    .split(' ')
    .filter((w) => w && !STOP.has(w) && !COUNT_NOISE.has(w))
    .map(singular)
    .filter((w) => !TIME_FILLER.has(w));
  if (!left.length) return null;
  const symptom = isSymptomOnly(rest)
    || (left.some((w) => SPAN_ILL.has(w)) && left.every((w) => SPAN_ILL.has(w) || ILL_SPAN_WORDS.has(w)));
  return symptom ? { months: monthsOfSpan(dur.n, dur.unit), said: dur.said } : null;
}

function durationOnly(raw: string): { months: number; said: string } | null {
  const dur = readDuration(` ${raw} `, true);
  if (!dur) return null;
  const rest = ` ${raw} `.replace(dur.said, ' ');
  // Deliberately NOT tokens(): that drops words of two letters, and "PT twice a
  // week for 12 weeks" would lose its "PT" and read as a bare span.
  const left = normalize(rest)
    .split(' ')
    .filter((w) => w && !STOP.has(w) && !COUNT_NOISE.has(w))
    .map(singular)
    .filter((w) => !TIME_FILLER.has(w));
  if (left.length) return null;
  return { months: monthsOfSpan(dur.n, dur.unit), said: dur.said };
}

/**
 * A wait said in the middle of a sentence: "waited eight months for a
 * gastroenterologist appointment", "it took six weeks", "spent two years".
 *
 * A leading "for four years:" was already read as a span by durationOnly. The
 * same fact said mid-clause was read as nothing at all — measured on the
 * deployed preview 2026-09-09, an eight-month wait vanished from a sentence on
 * a product whose own headline stat card is TIME SPENT SEARCHING. This finds it
 * beside the care in the same clause, so the visit still prices and the wait is
 * still counted. The phrase it hands back is the person's own words, and it is
 * written so that gapSignalFor() reads it back as the same span — one
 * definition of what a length of time is, or /gap and the chip disagree.
 */
const WAIT_VERBS = 'waited|waiting|wait|spent|spend|spending|took|takes|taking|sat|stuck|lost';

function waitSpan(raw: string): { months: number; said: string } | null {
  const q = ` ${normalize(raw)} `;
  const hedge = '(?:about|almost|nearly|around|roughly|over|more than|another)\\s+';
  // FLOW4 flow4-3: "took me 3 years", "took us 2 years", "took her a year".
  const m = q.match(new RegExp(`\\s(${WAIT_VERBS})\\s+(?:(?:me|us|her|him|them)\\s+)?(?:${hedge})?(${NUM}|a|an)\\s+(week|month|year)s?\\b`, 'i'));
  if (!m) return null;
  const n = /^(a|an)$/i.test(m[2]) ? 1 : toNum(m[2]);
  return { months: monthsOfSpan(n, m[3].toLowerCase()), said: m[0].trim() };
}

/* FLOW5 flow5-4 (2026-10-01): A WAIT AND WHAT IT WAS FOR, AND NOTHING ELSE.
   "it took 6 years to get a diagnosis" gave 72 months AND a second line, "it
   took 6 years to get a diagnosis · check the spelling". "it took months to
   find out what was wrong" gave no span at all. When the whole clause is a
   wait and the answer it waited for, it is one line, time spent searching, in
   her words. "months" or "years" with no number is a span of unknown length:
   counted, with no months, never a number made up for it. */
const SEARCH_FOR = /\s(?:(?:trying|tried|waiting|looking|struggling)\s+)?(?:to|until|before)\s+(?:(?:they|we|i|anyone|someone|a doctor)\s+)?(?:get|got|find|found|figure|figured|work|worked|give|gave|have|had|know|knew|listened|listen|believed|believe|helped|help|noticed|took)(?:\s+(?:out|me|us|her|him|them|a|an|the|what|it|was|is|wrong|diagnosis|diagnosed|answer|answers|name|for|right|real|proper|actual|one))*\s*$/;
const VAGUE_WAIT = new RegExp(`\\s(${WAIT_VERBS})\\s+(?:(?:me|us|her|him|them)\\s+)?(?:(?:many\\s+|several\\s+|some\\s+|a\\s+few\\s+|so\\s+many\\s+)?(?:months|years)|a\\s+while|forever|ages|so\\s+long|a\\s+long\\s+time)\\b`, 'i');
function waitWhole(raw: string): { months: number | null; said: string } | null {
  const q = ` ${normalize(raw)} `;
  const span = waitSpan(raw);
  const vague = span ? null : VAGUE_WAIT.exec(q);
  const said = span ? span.said : vague ? vague[0].trim() : null;
  if (!said) return null;
  const rest = q.replace(` ${said} `, ' ').replace(SEARCH_FOR, ' ');
  const left = rest.split(' ')
    .filter((w) => w && !STOP.has(w) && !COUNT_NOISE.has(w))
    .map(singular)
    .filter((w) => !TIME_FILLER.has(w) && !JOIN_WORDS.has(w));
  if (left.length) return null;
  return { months: span ? span.months : null, said };
}

/* FINAL-1011 reader (c): "I went from doctor to doctor for 5 years" is the
   search itself, and the five years were read as nothing at all. The clause is
   Time spent searching, with the months when a length is said and none when it
   is not ("bounced from doctor to doctor": counted, no number made up). Only
   when nothing else is named: "went doctor to doctor and had an MRI" keeps its
   MRI. */
const DOC_TO_DOC = /\s(?:(?:went|go|going|goes|bounced|bouncing|bounce|ran|running|run|passed|passing|shuffled|shuffling|sent|getting sent|got sent|jumped|jumping|hopped|hopping)\s+)?(?:around\s+)?(?:from\s+)?(doctor|specialist|provider|clinic|hospital)s?\s+to\s+\1s?\b/;
function doctorToDoctor(raw: string): { months: number | null; said: string } | null {
  const q = ` ${normalize(raw)} `;
  const m = DOC_TO_DOC.exec(q);
  if (!m) return null;
  const dur = readDuration(q, true);
  let rest = q.replace(m[0], ' ');
  if (dur) rest = rest.replace(dur.said, ' ');
  const left = rest.split(' ')
    .filter((w) => w && !STOP.has(w) && !COUNT_NOISE.has(w))
    .map(singular)
    .filter((w) => !TIME_FILLER.has(w) && !JOIN_WORDS.has(w) && !SPAN_FILLER.has(w) && !/^\d+$/.test(w)
      && !['spent', 'went', 'just', 'kept', 'keep', 'like', 'basically', 'literally', 'all', 'over'].includes(w));
  if (left.length) return null;
  return { months: dur && /^(?:month|year|decade)$/.test(dur.unit) ? monthsOfSpan(dur.n, dur.unit) : null, said: m[0].trim() };
}

/** The first refusal said as a verb, unless its subject is "it", "there" or
 *  "this". Read on the flattened phrase. */
function refusalVerb(hay: string): string | null {
  for (const re of DENIED_PATTERNS) {
    const g = new RegExp(re.source, 'g');
    for (let m = g.exec(hay); m; m = g.exec(hay)) {
      if (!NOT_A_REFUSER.test(hay.slice(0, m.index))) return m[0].trim();
    }
  }
  return null;
}

/** Care the person says they received, with the refusal after it only as its
 *  time: "they did the MRI after I refused the first date". The refusal is
 *  background there, and the care before it is real and prices. Only the
 *  words of time turn it: "I went back because they never ran the Lyme test"
 *  is still a test that never ran. */
const RECEIVED_THEN_WHEN =
  /\b(?:did|had|got|ran|took|gave|performed|done|saw|seen|finally)\b(?!\s+to\b).*\s(?:after|once|when)\s(?:\w+\s)?$/;
function receivedBefore(head: string): boolean {
  return RECEIVED_THEN_WHEN.test(head);
}

/* FINAL-1011 face (B): "I saw 6 doctors" names how many clinicians, and no kind
   of care: not which doctors, not a first visit or a return. It was six lines of
   "No federal figure matched". It is the clinician count the total card prints
   ("6 clinicians, as counted", lib/search-length.ts), counted with the search
   and never priced, because we do not know what any of the six visits was. Only
   the whole phrase: a count with a named clinician or any care beside it ("saw
   6 doctors including a cardiologist", "6 doctors ordered MRIs") is read as
   before. "specialists" is not here: four specialists are four first visits.
   Built on first use: NUM and COUNT_ADJECTIVES are declared further down. */
let bareClinicianCount: RegExp | null = null;
export const CLINICIAN_COUNT_REASON =
  'a number of clinicians, with no kind of visit named: counted beside your total as clinicians seen, never priced. Name a visit (“a neurologist”, “my regular doctor”) and it prices';

/**
 * Read a phrase for the counts no federal file holds.
 *
 * Returns null for an ordinary unit of care — the overwhelming majority. When
 * it returns a signal with `suppressesPrice`, the caller must not price the
 * phrase at all, however well it matches a row.
 */
export function gapSignalFor(raw: string): GapSignal | null {
  /* "I never got better" is how the illness went, not care she needed and did
     not get (FLOW patient-6): it fed the "care you went without" count with a
     claim she never made. The phrase is taken out before any cue is read. */
  const hay = flat(raw).replace(NOT_BETTER, ' ');
  if (hay.trim().length === 0) return null;

  const refusedAsVerb = refusalVerb(hay);
  // "I wouldn't do the MRI" is the person's own no: care not sought, not denied.
  const ownRefusal = refusedAsVerb && hay.slice(0, hay.indexOf(` ${refusedAsVerb} `) + 1).endsWith(' i ') ? refusedAsVerb : null;
  const notSought = firstCue(hay, NOT_SOUGHT) ?? firstPattern(hay, NEVER_PATTERNS) ?? ownRefusal;
  const denied = firstCue(hay, DENIED) ?? (ownRefusal ? null : refusedAsVerb);
  const cue = notSought ?? denied;
  if (cue) {
    // "I put it off for a year and finally had the MRI" is not a gap. Only a
    // turn AFTER the refusal counts; "finally gave up" is still a gap.
    const at = hay.indexOf(` ${cue} `);
    // "she won't order an MRI until I lose weight" is a condition still to be
    // met, not a turn: a refusal in the present tense is not rescued by "until".
    const stillRefusing = /^(?:wont|will not|refuses to|refuse to|cant|cannot|can not)\b/.test(cue);
    const turned = WENT_ANYWAY.some((w) => {
      if (stillRefusing && w === 'until i') return false;
      const i = hay.indexOf(` ${w} `);
      return i > -1 && i > at;
    }) || receivedBefore(hay.slice(0, at + 1));
    // "I went to the ER because I couldn't afford my regular doctor" is a
    // priced ER visit with a reason attached, not care that never happened.
    // Only the cost cues are soft this way; a denial or a "never went" is not.
    const wentFirst = COST_CUES.has(cue) && DID_RECEIVE.some((w) => {
      const i = hay.indexOf(` ${w} `);
      return i > -1 && i < at;
    });
    if (!turned && !wentFirst) {
      const span = durationOnly(raw);
      return {
        category: notSought ? 'care-not-sought' : 'care-denied',
        matchedOn: cue,
        months: span ? span.months : null,
        suppressesPrice: true,
      };
    }
  }

  const trip = TRAVEL.exec(hay);
  if (trip) return { category: 'life-lost', matchedOn: trip[0].trim(), months: null, suppressesPrice: true };
  // "she missed most of 7th grade" (parent PAR-10): school lost to the search.
  const school = SCHOOL_LOST.exec(hay);
  if (school) return { category: 'life-lost', matchedOn: school[0].trim(), months: null, suppressesPrice: true };

  const span = durationOnly(raw);
  if (span) {
    return { category: 'time-searching', matchedOn: span.said, months: span.months, suppressesPrice: true };
  }
  const ill = illnessSpan(raw);
  if (ill) {
    return { category: 'time-searching', matchedOn: ill.said, months: ill.months, suppressesPrice: true, reason: SYMPTOM_REASON };
  }
  const whole = waitWhole(raw);
  if (whole) {
    return { category: 'time-searching', matchedOn: whole.said, months: whole.months, suppressesPrice: true };
  }
  const rounds = doctorToDoctor(raw);
  if (rounds) {
    return { category: 'time-searching', matchedOn: rounds.said, months: rounds.months, suppressesPrice: true };
  }
  bareClinicianCount ??= new RegExp(
    '^ (?:(?:i|we|she|he|they|(?:my|our|her|his) \\w+) )?(?:(?:have|had|has|ive|weve|shes|hes|theyve) )?(?:(?:already|also|now) )?'
    + '(?:(?:seen|saw|see|seeing|visited|consulted|tried|gone to|went to|been to|go to|have been to) )?'
    + '(?:(?:at least|over|about|around|like|almost|nearly|more than|probably) )?'
    + `(${NUM}) (?:(?:${COUNT_ADJECTIVES}) )*(?:doctors|physicians|providers|clinicians|practitioners|docs|drs|mds)`
    + '(?: (?:so far|in total|total|in all|altogether|over the years|since then|by then|now))? $');
  const bare = bareClinicianCount.exec(hay);
  if (bare && cliniciansSaid(raw).counted > 0) {
    return { category: 'time-searching', matchedOn: bare[0].trim(), months: null, suppressesPrice: true, reason: CLINICIAN_COUNT_REASON };
  }

  const told = firstCue(hay, DISMISSED) ?? (DISMISS_RE.exec(hay)?.[0].trim() || null);
  if (told) return { category: 'dismissed', matchedOn: told, months: null, suppressesPrice: false };

  return null;
}

/* 🔴 A TRIP TO CARE IS NOT CARE (R4, parent PAR-02). "we drove 60 miles each
   way to the cardiologist" was 60 new-specialist visits, $10,641.60, and
   "drove her an hour each way to the cardiologist" a second visit. A clause
   that measures the trip (miles, each way, a round trip, hours away) is about
   the drive: counted as what the search cost outside of medicine, never
   priced. The visit it went to is priced where the person named the visit.
   A bare "my husband drove me to the ER" names no distance and still prices. */
const TRAVEL = new RegExp(
  ' (?:each way|both ways|round trip|roundtrip|there and back)' +
  `| (?:${NUM}|a|an|half an?|a couple of|a few|several) (?:miles?|mi|kilometers?|kilometres?|km|kms)(?= )` +
  ' | miles? (?:away|each|from|round|there|to get)' +
  ' | (?:hours?|hrs?|minutes?|mins?) (?:away|drive|each way|round trip|in the car|on the bus|on the train|to get there)(?= )' +
  ' | (?:drove|drive|driving|flew|fly|flying|flight|bus|train) (?:\\w+ ){0,4}?(?:hours?|miles?|states?|across the state)(?= )',
);
const SCHOOL_LOST =
  / (?:missed|missing|miss|lost|out of|pulled (?:her|him|them) out of|dropped out of|left) (?:\w+ ){0,3}?(?:school|class|classes|grade|semester|term|college|kindergarten|preschool)(?= )| homeschooled| homebound(?= )/;
export const LIFE_LOST_REASON =
  'what the search cost outside of medicine: counted, never priced. No federal file records it.';
export const TRAVEL_REASON =
  'a trip to care, not a unit of care. Counted, never priced. The miles belong on the Trips card.';

/** The reason a suppressed phrase carries, in the person's own terms. */
function gapReason(category: GapCategory, matchedOn = ''): string {
  if (category === 'life-lost') return TRAVEL.test(` ${matchedOn} `) ? TRAVEL_REASON : LIFE_LOST_REASON;
  if (category === 'time-searching') return DURATION_REASON;
  if (category === 'dismissed') return DISMISSAL_REASON;
  if (category === 'care-denied') return DENIED_REASON;
  return NOT_RECEIVED_REASON;
}

/** The whole result for a phrase the mapper refuses to price. */
function gapResult(signal: GapSignal): MapResult {
  return {
    item: null,
    score: 0,
    matchedOn: null,
    confidence: 'none',
    reason: signal.reason ?? gapReason(signal.category, signal.matchedOn),
    gapCategory: signal.category,
    months: signal.months,
  };
}

export interface GapPrefillLine {
  raw: string;
  category: GapCategory;
  /** Occasions for every category except time-searching, which is months. */
  amount: number;
  unit: 'occasions' | 'months';
  matchedOn: string;
}

export interface GapPrefillResult {
  /** Category id → the number to put in that box on /gap. */
  counts: Record<string, number>;
  lines: GapPrefillLine[];
}

/**
 * What the person already told us, turned into the counts /gap asks for.
 *
 * Occasions add up across lines. Months do not: two mentions of the same search
 * are one search, so the longest span stated is used rather than their sum.
 * Every number here is editable on the page — this fills the boxes, it never
 * decides for the person.
 */
export function gapPrefill(entries: readonly { raw: string; times?: number }[]): GapPrefillResult {
  const counts: Record<string, number> = {};
  const lines: GapPrefillLine[] = [];
  for (const e of entries) {
    const g = gapSignalFor(e.raw);
    if (!g) continue;
    if (g.category === 'time-searching') {
      const m = g.months ?? 0;
      if (m <= 0) continue;
      counts[g.category] = Math.max(counts[g.category] ?? 0, m);
      lines.push({ raw: e.raw, category: g.category, amount: m, unit: 'months', matchedOn: g.matchedOn });
      continue;
    }
    const n = Math.max(1, Math.floor(e.times ?? 1));
    counts[g.category] = (counts[g.category] ?? 0) + n;
    lines.push({ raw: e.raw, category: g.category, amount: n, unit: 'occasions', matchedOn: g.matchedOn });
  }
  return { counts, lines };
}

/* --------------------------------------------------------------------------
   A CLINICIAN IS A UNIT OF CARE, AND SO IS THE TEST THEY ORDERED

   "A rheumatologist ordered a nerve test" is two things that happened: a visit
   and a test. Until this section existed that sentence came back as the test
   alone, at $99.87, and the preview said "1 of 1 phrase recognised" — so the
   person was told nothing had been lost while $177.36 of published figure was
   removed from their own journey in silence. Measured on the deployed preview
   on 2026-09-09; three more sentences did the same thing, including "my primary
   care doctor sent me to a neurologist who did an MRI", which dropped the
   neurologist.

   Nothing here invents a figure. The visit is priced at the row the published
   table already carries for it, found by asking the matcher for the words the
   table itself uses, so a change to data/prices.json moves this with it and no
   id is written down in this file.

   The third rule at the top of this file — nothing typed disappears — is what
   this enforces. Where a clinician is recognised and a second visit is NOT
   priced, the phrase still comes back, named, with the reason on its face.
   -------------------------------------------------------------------------- */

export type ClinicianKind = 'specialist' | 'pcp';

/** Specialty names people say. Every one of them is the same billed unit — a
 *  first visit with a new specialist — which is exactly what data/synonyms.json
 *  records under cms-99204: "the figure does not change by specialty". */
const SPECIALIST_NOUNS = [
  'specialist', 'rheumatologist', 'neurologist', 'cardiologist', 'gastroenterologist',
  'endocrinologist', 'pulmonologist', 'dermatologist', 'nephrologist', 'hematologist',
  'haematologist', 'oncologist', 'immunologist', 'allergist', 'urologist', 'psychiatrist',
  'otolaryngologist', 'ophthalmologist', 'orthopedist', 'orthopaedist', 'gynecologist',
  'rheumatology doctor', 'infectious disease doctor', 'sleep doctor', 'pain doctor',
  'gi doctor', 'lung doctor', 'heart doctor', 'brain doctor', 'kidney doctor',
  'skin doctor', 'gut doctor', 'hormone doctor', 'blood doctor', 'ent',
];

/** The doctor a person starts with. Their visit is the established-patient unit
 *  the rules already land on — "saw my regular doctor" — not a new-patient one.
 *  ALIASES has already turned "PCP" and "GP" into "regular doctor" by the time
 *  these are looked for. */
const PCP_NOUNS = [
  'regular doctor', 'primary care doctor', 'primary care physician', 'primary care provider',
  'family doctor', 'family physician', 'general practitioner', 'internist',
  'nurse practitioner', 'physician assistant',
  // R4 (parent PAR-06): a child's regular doctor. ALIASES has already turned
  // "kids doctor" and "children's doctor" into "pediatrician".
  'pediatrician', 'paediatrician', 'pediatric doctor', 'pediatric nurse practitioner',
];

/** Longest first, so "primary care doctor" is never found as "care doctor" and
 *  "infectious disease doctor" is never found as "doctor". */
const CLINICIAN_NOUNS: { noun: string; kind: ClinicianKind }[] = [
  ...SPECIALIST_NOUNS.map((noun) => ({ noun, kind: 'specialist' as ClinicianKind })),
  ...PCP_NOUNS.map((noun) => ({ noun, kind: 'pcp' as ClinicianKind })),
].sort((a, b) => b.noun.length - a.noun.length);

/** Words a person puts between the number and the clinician. They are emphasis,
 *  never a unit of care: "four DIFFERENT specialists" is still four visits. */
const COUNT_ADJECTIVES = 'different|separate|other|another|various|new|more|additional|assorted|unrelated';

/** Every way of saying more than one clinician, longest first. Generic words are
 *  included because "three doctors" is a count of visits too. */
const CLINICIAN_PLURALS = [
  ...CLINICIAN_NOUNS.map((c) => c.noun),
  'doctor', 'physician', 'provider', 'clinician', 'practitioner', 'surgeon', 'consultant',
]
  .map((n) => `${n}s`)
  .sort((a, b) => b.length - a.length)
  .join('|');

export interface ClinicianMention {
  /** The noun as the table and this file spell it, singular. */
  noun: string;
  kind: ClinicianKind;
  /** Where it sits in the normalised phrase, so a chip can be shown in the
   *  order the person said things. */
  at: number;
}

/** Every clinician a phrase names, in the order they were said, each found once. */
export function clinicianMentions(raw: string): ClinicianMention[] {
  const q = ` ${normalize(raw)} `;
  const claimed: boolean[] = new Array(q.length).fill(false);
  const found: ClinicianMention[] = [];
  for (const { noun, kind } of CLINICIAN_NOUNS) {
    // Plural first: "specialists" must not be claimed as "specialist" + a stray "s".
    for (const form of [`${noun}s`, noun]) {
      const needle = ` ${form} `;
      for (let i = q.indexOf(needle); i > -1; i = q.indexOf(needle, i + 1)) {
        const end = i + needle.length - 1;
        let free = true;
        for (let k = i + 1; k < end; k++) if (claimed[k]) { free = false; break; }
        if (!free) continue;
        for (let k = i + 1; k < end; k++) claimed[k] = true;
        found.push({ noun, kind, at: i });
      }
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

/** judge panel #6: the clinicians a phrase says were seen, read only from the
 *  words: the specific clinicians named ("a neurologist", "my regular doctor"),
 *  and a number said in front of a plural ("8 different doctors"). A plural
 *  with no number is not counted; nothing is defaulted. */
export function cliniciansSaid(raw: string): { named: string[]; counted: number } {
  const q = ` ${normalize(raw)} `;
  const named = clinicianMentions(raw)
    .filter((m) => m.kind === 'pcp' || m.noun !== 'specialist')
    .map((m) => (m.kind === 'pcp' ? 'pcp' : m.noun));
  const m = q.match(new RegExp(`\\s(${NUM})\\s+(?:(?:${COUNT_ADJECTIVES})\\s+)*(${CLINICIAN_PLURALS})\\b`, 'i'));
  return { named, counted: m ? Math.max(0, Math.min(365, toNum(m[1]))) : 0 };
}

/** How many of that clinician the person said: "four different specialists" is
 *  four visits, "a neurologist" is one. Only a plural can carry a count. */
function clinicianCount(q: string, noun: string): number {
  const m = q.match(new RegExp(`\\s(${NUM})\\s+(?:(?:${COUNT_ADJECTIVES})\\s+)*${noun}s\\b`, 'i'));
  if (!m) return 1;
  return Math.max(1, Math.min(365, toNum(m[1])));
}

interface ClinicianUnits {
  unit: Record<ClinicianKind, PriceItem | null>;
  ids: Record<ClinicianKind, Set<string>>;
}

/** The table's own words for each kind of visit. Asked of the matcher rather
 *  than written here as an id, so this file still holds no price and no code. */
const KIND_PHRASES: Record<ClinicianKind, string[]> = {
  specialist: ['saw a new specialist', 'first visit with a specialist', 'specialist appointment', 'specialist consult'],
  pcp: ['saw my regular doctor', 'primary care visit', 'appointment with my doctor', 'saw my internist'],
};

const CLINICIAN_UNIT_CACHE = new WeakMap<object, ClinicianUnits>();

function clinicianUnits(table: PriceItem[]): ClinicianUnits {
  const cached = CLINICIAN_UNIT_CACHE.get(table as unknown as object);
  if (cached) return cached;
  const unit = {} as Record<ClinicianKind, PriceItem | null>;
  const ids = {} as Record<ClinicianKind, Set<string>>;
  for (const kind of ['specialist', 'pcp'] as ClinicianKind[]) {
    const hits = KIND_PHRASES[kind]
      .map((phrase) => mapUtterance(phrase, table).item)
      .filter((i): i is PriceItem => Boolean(i));
    unit[kind] = hits[0] ?? null;
    ids[kind] = new Set(hits.map((i) => i.id));
  }
  const v: ClinicianUnits = { unit, ids };
  CLINICIAN_UNIT_CACHE.set(table as unknown as object, v);
  return v;
}

/** The row for a visit with THIS clinician: the specialty's own words first, so
 *  a table that one day prices a neurologist differently is followed, and the
 *  kind's ordinary row when it does not. */
function visitUnitFor(m: ClinicianMention, table: PriceItem[]): PriceItem | null {
  const units = clinicianUnits(table);
  const said = mapUtterance(m.kind === 'pcp' ? `saw my ${m.noun}` : `saw a ${m.noun}`, table).item;
  if (said && units.ids[m.kind].has(said.id)) return said;
  return units.unit[m.kind];
}

/** True when the clinician was named before the words the rows matched on, so
 *  the visit chip is shown where the person said it: you see the doctor, then
 *  they order the test. */
function namedFirst(q: string, at: number, rows: readonly ParsedSegment[]): boolean {
  let first = Number.POSITIVE_INFINITY;
  for (const r of rows) {
    for (const w of tokens(r.result.matchedOn ?? '')) {
      const i = q.indexOf(` ${w}`);
      if (i > -1 && i < first) first = i;
    }
  }
  return at < first;
}

export const NO_SECOND_VISIT_REASON = 'counted, no separate visit priced';
/** The words of a visit that name no clinician: "follow-up appointment", "office visit". */
const GENERIC_VISIT_WORDS = new Set(['follow', 'up', 'followup', 'visit', 'appointment', 'appt', 'office', 'return', 'checkup', 'check']);

/* 🔴 ONE SPECIALIST SEEN THREE TIMES IS ONE NEW VISIT AND TWO RETURN VISITS
   (FLOW patient-4). CMS's own descriptors split the office visit by whether
   the patient is new or established: 99204 is "Office o/p new mod 45 min",
   99214 "Office o/p est mod 30 min" (PPRRVU2026_Jul_nonQPP.csv), the same
   moderate level of decision making. "3 neurologist visits" priced three
   first visits; the second and third are, by that rule, established-patient
   visits. So the count splits into one new-patient line and the rest at the
   established code of the SAME level, read off the table by its CPT code
   (the last digit is the level), never written here as an id or a figure.
   Several DIFFERENT specialists ("two rheumatologists", "four different
   specialists") are each a first visit and are left as they are. */
const SPECIALIST_PLURAL = new RegExp(`\\b(?:${SPECIALIST_NOUNS.map((n) => `${n}s`).join('|')}|doctors|physicians|providers|clinicians|surgeons|consultants)\\b`);
const MANY_DIFFERENT = new RegExp(`\\b(?:${COUNT_ADJECTIVES})\\b`);
export const RETURN_VISIT_NOTE = (who: string, code: string, n = 2) =>
  `${n === 1 ? 'a return visit' : 'return visits'} to the ${who}: a patient the specialist has seen before is billed as an established patient, ${code}, the same level as the first visit`;
/** "2 more neurologist visits", "saw the cardiologist again", "a follow-up with
 *  the rheumatologist": every visit said is a return visit. */
const RETURN_WORDS = /\b(?:more|again|return|returned|follow ?up|followup|follow ups|went back|go back|back to)\b/;
function splitReturnVisits(row: ParsedSegment, table: PriceItem[]): ParsedSegment[] {
  const it = row.result.item;
  if (!it || !it.code) return [row];
  if (!clinicianUnits(table).ids.specialist.has(it.id)) return [row];
  const q = ` ${normalize(row.raw)} `;
  /* FINAL-1011 face: "saw 6 doctors including a cardiologist" counts the doctors,
     not the cardiologist. The one specialist named, said once, is one visit; the
     six are the clinicians count beside the total (lib/search-length.ts). */
  const named = clinicianMentions(row.raw).filter((m) => m.kind === 'specialist');
  if (row.times > 1 && named.length === 1 && clinicianCount(q, named[0].noun) === 1
    && cliniciansSaid(row.raw).counted === row.times) return [{ ...row, times: 1, countNote: null }];
  if (SPECIALIST_PLURAL.test(q) || (MANY_DIFFERENT.test(q) && !/\bmore\b/.test(q))) return [row];
  const allReturn = RETURN_WORDS.test(q);
  if (row.times < 2 && !allReturn) return [row];
  const m = /^CPT 9920([2-5])$/.exec(it.code);
  if (!m) return [row];
  const est = table.find((t) => t.code === `CPT 9921${m[1]}` && t.valueUsd !== null);
  if (!est) return [row];
  const who = clinicianMentions(row.raw).find((c) => c.kind === 'specialist')?.noun ?? 'specialist';
  if (allReturn) {
    return [{ ...row, result: { ...row.result, item: est, confidence: 'medium' }, countNote: row.countNote ?? RETURN_VISIT_NOTE(who, est.code ?? '', row.times) }];
  }
  const rest = row.times - 1;
  return [
    { ...row, times: 1, countNote: row.countNote ?? `first visit to the ${who}, billed as a new patient (${it.code}); the ${rest === 1 ? 'return visit is' : `${rest} return visits are`} on the next line` },
    {
      raw: row.raw,
      times: rest,
      result: { ...row.result, item: est, matchedOn: row.result.matchedOn, confidence: 'medium' },
      countNote: RETURN_VISIT_NOTE(who, est.code ?? '', rest),
      source: row.source,
    },
  ];
}

/**
 * The rows for one piece of a clause, with the clinician visits it named.
 *
 * Three outcomes per clinician, and none of them is silence:
 *   · the rows already priced that very clinician → nothing to add;
 *   · the kind of visit is not on this piece yet → the visit is priced, at the
 *     table's own row, with the count the person stated;
 *   · the kind is already priced here → a named, blank chip saying so, because
 *     a person who typed a word must see that word come back.
 */
function withClinicianVisits(
  piece: string,
  rows: ParsedSegment[],
  table: PriceItem[],
  pricedKinds: Set<ClinicianKind>,
): ParsedSegment[] {
  const mentions = clinicianMentions(piece);
  if (!mentions.length) return rows;
  // "my husband saw a cardiologist" is his visit, not hers: no visit is added
  // to a piece the rules already read as someone else's care, or care to come.
  if (rows.some((r) => r.result.reason === NOT_YOURS_OR_NOT_YET_REASON)) return rows;
  const q = ` ${normalize(piece)} `;
  const units = clinicianUnits(table);

  // Which clinician each priced row already IS, and which kinds are covered.
  const alreadyNamed = new Set<string>();
  for (const r of rows) {
    const it = r.result.item;
    if (!it) continue;
    const on = ` ${normalize(r.result.matchedOn ?? '')} `;
    for (const m of mentions) if (on.includes(` ${m.noun} `) || on.includes(` ${m.noun}s `)) alreadyNamed.add(m.noun);
    for (const kind of ['specialist', 'pcp'] as ClinicianKind[]) if (units.ids[kind].has(it.id)) pricedKinds.add(kind);
  }

  /* 🔴 The piece named ONE clinician and no row, so the visit IS the piece (R4,
     parent PAR-06: "took her to the pediatrician six times" was one priced
     "pediatrician" chip ×1 beside an unpriced chip holding the ×6). The visit
     takes the person's own words and the count they said. */
  const lone = rows.length === 1 && !rows[0].result.item && !rows[0].result.gapCategory && rows[0].result.months == null
    && !unpricedByName(rows[0].result.reason)
    && new Set(mentions.map((m) => m.noun)).size === 1 && !pricedKinds.has(mentions[0].kind)
    && clinicianCount(q, mentions[0].noun) === 1 ? rows[0] : null;
  if (lone) {
    const m = mentions[0];
    const item = visitUnitFor(m, table);
    if (item) {
      pricedKinds.add(m.kind);
      return [{
        raw: lone.raw,
        times: lone.times,
        result: { item, score: 60, matchedOn: m.noun, confidence: 'medium', reason: null, gapCategory: null, months: null },
        countNote: lone.countNote ?? null,
      }];
    }
  }

  /* FINAL-1011 reader (a): "5 follow-up appointments with my neurologist" took
     the primary-care row on the words "follow-up appointment" ×5 and then added
     a sixth, new-patient neurologist visit beside it. When the only row is a
     generic visit word and the piece names one specialist, the visit is that
     specialist's, with the count she said; splitReturnVisits then reads the
     follow-ups as return visits. */
  const generic = rows.length === 1 && rows[0].result.item && units.ids.pcp.has(rows[0].result.item.id)
    && normalize(rows[0].result.matchedOn ?? '').split(' ').filter(Boolean).every((w) => GENERIC_VISIT_WORDS.has(singular(w)))
    ? rows[0] : null;
  const specialists = [...new Set(mentions.filter((x) => x.kind === 'specialist').map((x) => x.noun))];
  if (generic && specialists.length === 1 && new Set(mentions.map((x) => x.noun)).size === 1 && clinicianCount(q, specialists[0]) === 1) {
    const m = mentions[0];
    const item = visitUnitFor(m, table);
    if (item) {
      pricedKinds.add(m.kind);
      return [{ ...generic, result: { ...generic.result, item, matchedOn: m.noun, confidence: 'medium' } }];
    }
  }

  const head: ParsedSegment[] = [];
  const tail: ParsedSegment[] = [];
  const done = new Set<string>();
  for (const m of mentions) {
    if (done.has(m.noun)) continue;
    done.add(m.noun);
    if (alreadyNamed.has(m.noun)) continue;

    if (!pricedKinds.has(m.kind)) {
      const item = visitUnitFor(m, table);
      if (!item) continue;
      pricedKinds.add(m.kind);
      const result: MapResult = {
        item,
        score: 60,
        matchedOn: m.noun,
        // The person named the clinician; the level of the visit is the table's
        // ordinary row for it, not something they said. Medium, never high.
        confidence: 'medium',
        reason: null,
        gapCategory: null,
        months: null,
      };
      const seg: ParsedSegment = { raw: m.noun, times: clinicianCount(q, m.noun), result, countNote: null };
      (namedFirst(q, m.at, rows) ? head : tail).push(seg);
      continue;
    }

    const result: MapResult = {
      item: null,
      score: 0,
      matchedOn: null,
      reason: `${m.noun}: ${NO_SECOND_VISIT_REASON}`,
      confidence: 'none',
      gapCategory: null,
      months: null,
    };
    tail.push({ raw: m.noun, times: 1, result, countNote: null });
  }
  return [...head, ...rows, ...tail];
}

/* --------------------------------------------------------------------------
   MATCHING
   -------------------------------------------------------------------------- */

type MatchKind = 'none' | 'exact' | 'contains' | 'contained' | 'overlap';

/** The same words, singularised one by one, so a whole-word test still matches
 *  "nerve conduction studies" against "nerve conduction study". tokens() already
 *  does this on both sides; the containment tests must too, or a plural silently
 *  moves a person's words onto a different row. */
function wordwise(s: string): string {
  return normalize(s).split(' ').map(singular).join(' ');
}

/** "Without dye", "no biopsy", "unenhanced" — the qualifier that makes two rows
 *  opposites rather than siblings. A candidate that carries it must not win a
 *  clause that does not, or an upper endoscopy WITH a biopsy lands on the row
 *  for one without. */
const NEGATIVE_QUALIFIER =
  /\bwithout\b|\bunenhanced\b|\bnoncontrast\b|\bnon contrast\b|\bno (?:dye|contrast|biopsy|sedation|sample|samples|iv)\b/;

/* 🔴 CONTRAST IS READ OFF THE ROW'S OWN NAME, BOTH WAYS (R4, fedexpert FX-01,
   FX-09). "a CT scan of my chest without contrast" was priced as the chest CT
   WITH contrast ($166.67, CPT 71260) because a synonym of that row shares
   "CT" and "contrast"; "CT of my head with contrast" and "MRI of my knee with
   contrast" were priced as the scans without it, and "brain MRI with contrast"
   as the study done both ways. When the person says with, without, or both,
   and the published row's LABEL says something else, that row cannot take
   the line. No row left means the line stays unpriced by name, never moved to
   the nearest scan. */
type ContrastState = 'with' | 'without' | 'both' | null;
const CONTRAST_WORD = '(?:contrast|dye|gadolinium|injection|iv contrast)';
function contrastState(padded: string): ContrastState {
  const said = (re: RegExp) => re.test(padded);
  const both = said(/\bwith and without\b|\bwith (?:and|or) without\b|\bbefore and after (?:the )?(?:contrast|dye)\b/);
  const without = said(new RegExp(`\\bwithout (?:any |the |iv )?${CONTRAST_WORD}\\b|\\bno ${CONTRAST_WORD}\\b|\\bnon ?contrast\\b|\\bunenhanced\\b|\\bwithout it\\b|\\bplain film\\b`));
  const withIt = said(new RegExp(`\\b(?:with|w) (?:the |some |iv |a |an )?${CONTRAST_WORD}\\b|\\bcontrast enhanced\\b|\\b(?:ran|put|pushed|injected) (?:the |some )?(?:contrast|dye)\\b|\\bdye (?:in|into)\\b`));
  if (both || (without && withIt)) return 'both';
  if (without) return 'without';
  if (withIt) return 'with';
  return null;
}
const LABEL_CONTRAST = new WeakMap<object, ContrastState>();
function labelContrast(item: PriceItem): ContrastState {
  if (LABEL_CONTRAST.has(item as unknown as object)) return LABEL_CONTRAST.get(item as unknown as object) ?? null;
  const s = contrastState(` ${normalize(item.label)} `);
  LABEL_CONTRAST.set(item as unknown as object, s);
  return s;
}
const ANGIO_WORD = /\b(?:angiogram|angiography|angio|cta|ctpa|mra)\b/;

/* 🔴 A BARE "MRI" OR "CT" NAMES NO PART OF THE BODY (R4, fedexpert FX-08).
   "an MRI" was priced as a brain MRI and "a CT scan" as a chest CT: a guess
   printed as a federal figure. Every MRI and CT row in the table is one part
   of the body, so a scan said without one stays unpriced, by name, and says
   what would price it. */
const BODY_CLASS: Record<string, string[]> = {
  head: ['brain', 'brian', 'head', 'skull', 'pituitary'],
  neck: ['neck', 'cervical', 'throat', 'thyroid'],
  back: ['back', 'lumbar', 'spine', 'spinal', 'thoracic', 'tailbone', 'sacrum', 'lumbosacral'],
  chest: ['chest', 'lung', 'heart', 'cardiac', 'coronary', 'clot', 'embolism', 'pulmonary'],
  abdomen: ['abdomen', 'abdominal', 'belly', 'stomach', 'tummy', 'pelvi', 'pelvis', 'pelvic', 'bowel', 'gut',
    'colon', 'liver', 'kidney', 'renal', 'urinary', 'stone', 'bladder', 'appendix', 'gallbladder', 'pancrea',
    'pancreas', 'prostate', 'hip'],
  leg: ['knee', 'ankle', 'foot', 'feet', 'leg', 'hip', 'thigh', 'toe'],
  arm: ['shoulder', 'elbow', 'wrist', 'hand', 'arm', 'finger'],
  face: ['sinus', 'sinuse', 'face', 'facial', 'jaw', 'orbit', 'eye', 'maxillofacial'],
};
const BODY_OF = new Map<string, Set<string>>();
for (const [cls, words] of Object.entries(BODY_CLASS)) for (const w of words) {
  if (!BODY_OF.has(w)) BODY_OF.set(w, new Set());
  BODY_OF.get(w)!.add(cls);
}
/** The parts of the body a phrase names, as classes ("belly" and "abdomen" are one). */
function bodyClasses(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of normalize(text).split(' ').map(singular)) for (const c of BODY_OF.get(w) ?? []) out.add(c);
  return out;
}
const BODY_CLASS_CACHE = new WeakMap<object, Set<string>>();
function labelBody(item: PriceItem): Set<string> {
  let v = BODY_CLASS_CACHE.get(item as unknown as object);
  if (!v) { v = bodyClasses(item.label); BODY_CLASS_CACHE.set(item as unknown as object, v); }
  return v;
}
export const CONTRAST_GAP_REASON =
  'the published table has no row for this scan done the way you said (with, without, or both ways with contrast), so it stays unpriced rather than priced as a different scan';
export const BARE_SCAN_REASON =
  'an MRI or a CT is priced by the part of the body scanned. Say which part (head, chest, lower back, knee…) and it will price; until then it stays unpriced';
function isScanRow(id: string): boolean {
  return /^cms-img-(?:mri|ct|cta)(?:-|$)/.test(id);
}
function namesBodyPart(raw: string): boolean {
  return bodyClasses(raw).size > 0 || /\b(?:whole body|full body|angiogram|angiography|cta|mra)\b/.test(normalize(raw));
}

/* 🔴 A NERVE CONDUCTION STUDY IS PRICED BY THE NUMBER OF NERVES, OR NOT AT ALL
   (R4b, main session's decision on R3 fedexpert FX-02). CMS pays the
   conduction study under 95907-95913, one code per band of nerves tested
   (1-2, 3-4, ... 13 or more). "They shocked the nerves" names the study and
   no number, so choosing a band would be inventing specificity: the line
   stays unpriced, by name, with the reason. When the person says the number
   ("they tested four nerves", "6 nerve studies") the band it falls in is the
   row. A number that straddles two bands ("two or three nerves") is not a
   number of nerves the table can price, so it stays unpriced too. The rules
   still READ the phrase, so it is never sent to the AI reader to guess at.
   The needle EMG (95886) is a separate row and is not decided here. */
export const NCS_COUNT_REASON =
  "nerve conduction study: the number of nerves tested wasn't said, and Medicare prices these by that number. Say how many (\"they tested four nerves\") and it will price; until then it stays unpriced";
export const NCS_RANGE_REASON =
  'nerve conduction study: Medicare prices these by the number of nerves tested, in bands of two (1-2, 3-4, 5-6 and so on), and the number you said falls in two bands. Say the number and it will price; until then it stays unpriced';
const CONDUCTION_WORDS = new RegExp(
  [
    '\\bnerve conduction\\b',
    '\\bconduction (?:study|studies|test|tests|testing|velocity|velocities)\\b',
    '\\b(?:ncs|ncv|ncvs)\\b',
    '\\bnerve (?:test|tests|testing|study|studies)\\b',
    '\\b(?:shock|shocks|shocked|shocking|zap|zaps|zapped|zapping)(?: [a-z0-9]+){0,3} (?:nerve|nerves|leg|legs|arm|arms)\\b',
    '\\b(?:electric|electrical) (?:shock|shocks|impulse|impulses|pulse|pulses|current)(?: [a-z0-9]+){0,4} nerves?\\b',
    '\\bnerves? (?:were |was |got |being )?(?:shocked|zapped|tested)\\b',
    '\\b(?:tested|testing|checked|measured)(?: [a-z0-9]+){0,3} nerves?\\b',
  ].join('|'),
);
/** The needle half: EMG named outright, or needles/electrodes in the muscles. */
const NEEDLE_EMG_WORDS = /\b(?:emg|emgs|electromyogram|electromyography|needles? (?:in|into) (?:my |the |her |his )?muscles?)\b/;
function namesConduction(raw: string): boolean {
  const q = normalize(raw);
  return CONDUCTION_WORDS.test(q) && !/\bnerve and muscle\b/.test(q);
}
/** The number of nerves the person said, or null. A range inside one band is
 *  that band ("one or two nerves", "3 to 4 studies"); a range across two bands
 *  is null. `said` is the words, so they can be kept out of the visit count. */
function nervesSaid(raw: string): { n: number; said: string } | null {
  const q = ` ${normalize(raw)} `;
  const re = new RegExp(
    `\\s(${NUM})(?:\\s(?:or|to|and)\\s(${NUM})|\\s(${NUM}))?\\s(?:(?:of\\s(?:my|the|her|his)\\s)?(?:different|separate|motor|sensory|major)\\s)?(?:nerves?|(?:nerve\\s|conduction\\s)?studies)\\b`,
    'i',
  );
  const m = q.match(re);
  if (!m) return null;
  const lo = toNum(m[1]);
  const hiRaw = m[2] ?? m[3];
  const hi = hiRaw ? toNum(hiRaw) : lo;
  if (!(lo >= 1) || !(hi >= 1)) return null;
  if (ncsBand(lo) !== ncsBand(hi)) return { n: -1, said: m[0].trim() };
  return { n: Math.max(lo, hi), said: m[0].trim() };
}
function ncsBand(n: number): string {
  if (n >= 13) return '13plus';
  const top = Math.ceil(n / 2) * 2;
  return `${top - 1}-${top}`;
}
/** The row a stated number of nerves prices at, from the table's own ids. */
function ncsRowFor(n: number, table: PriceItem[]): PriceItem | null {
  if (!(n >= 1)) return null;
  const id = `cms-test-ncs-${ncsBand(n)}`;
  return table.find((i) => i.id === id && i.valueUsd !== null) ?? null;
}
/** Read a phrase that names a conduction study and not the needle EMG. Null
 *  when the phrase is not about a conduction study at all. */
/** A result that is the conduction study: one of its rows, or unpriced for want of the number. */
function isConductionRow(r: MapResult): boolean {
  return r.item ? r.item.id.startsWith('cms-test-ncs-') : r.reason === NCS_COUNT_REASON || r.reason === NCS_RANGE_REASON;
}
/** The conduction study named beside the needle EMG in one clause, as its own line. */
function conductionBeside(raw: string, table: PriceItem[]): ParsedSegment | null {
  const q = normalize(raw);
  if (!NEEDLE_EMG_WORDS.test(q)) return null;
  const m = q.match(CONDUCTION_WORDS);
  if (!m || /\bnerve and muscle\b/.test(q)) return null;
  const said = nervesSaid(raw);
  const row = said ? ncsRowFor(said.n, table) : null;
  const result: MapResult = row
    ? { item: row, score: 100, matchedOn: said!.said, confidence: 'high', reason: null, gapCategory: null, months: null }
    : { item: null, score: 0, matchedOn: null, confidence: 'none', reason: said ? NCS_RANGE_REASON : NCS_COUNT_REASON, gapCategory: null, months: null };
  return { raw: m[0], times: 1, result, countNote: null };
}
/** Lines the rules deliberately left unpriced BY NAME: the phrase names a unit
 *  of care the table prices only with a detail the person did not give (which
 *  body part, which contrast, how long a monitor was worn, how many nerves).
 *  They are read, not blank: no visit swallows them, and the AI reader is never
 *  asked to fill them (lib/map-model.ts candidatesOf). */
export function unpricedByName(reason: string | null | undefined): boolean {
  return !!reason && (reason === INVASIVE_CPET_REASON || reason === UNCARRIED_TREATMENT_REASON || reason === PUSH_THROUGH_REASON || reason === NCS_COUNT_REASON || reason === NCS_RANGE_REASON || reason === BARE_SCAN_REASON || reason === BARE_ULTRASOUND_REASON || reason === CONTRAST_GAP_REASON || reason === MONITOR_GAP_REASON);
}
function conductionResult(raw: string, table: PriceItem[], carried: { gapCategory: GapCategory | null; months: number | null }): MapResult | null {
  if (!namesConduction(raw) || NEEDLE_EMG_WORDS.test(normalize(raw))) return null;
  const said = nervesSaid(raw);
  const row = said ? ncsRowFor(said.n, table) : null;
  if (row) return { item: row, score: 100, matchedOn: said!.said, confidence: 'high', reason: null, ...carried };
  return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: said ? NCS_RANGE_REASON : NCS_COUNT_REASON, ...carried };
}

/** Words most of the catalog shares. They are real words a person says, but a
 *  row that only adds one of them to the match has not earned the line off a
 *  more specific sibling — "nerve conduction study" is not more specific than
 *  "nerve conduction", while "colonoscopy with the polyp out" genuinely is. */
const GENERIC_TOKENS = new Set([
  'test', 'scan', 'study', 'exam', 'examination', 'check', 'visit', 'appointment',
  'sample', 'level', 'complete', 'fee', 'physician', 'doctor', 'hospital',
  'clinic', 'room', 'care', 'thing', 'part', 'reading', 'result', 'lab',
  'first', 'time', 'again', 'new', 'full', 'procedure', 'done',
]);

/** FLOW4 flow4-1 (2026-10-01): words that join a sentence together and never
 *  name care. A row's phrase can hold one ("colonoscopy where they took
 *  samples"), but the person saying "where" or "found" is not evidence of that
 *  row. They stay in the phrase's word count, so a sentence that shares only
 *  one care word with a long phrase still falls short of the floor. */
/** FLOW4 flow4-15: the taking verbs flow4-1 set aside (STOP). */
const TAKING_VERB = / (?:took|take|taken|taking|out) /;

const JOIN_WORDS = new Set([
  'where', 'when', 'here', 'there', 'then', 'but', 'because', 'find', 'found',
  'figure', 'figured', 'get', 'gets', 'getting', 'takes', 'what', 'wrong',
  // JUDGE-7 #3: "in the hospital for 5 days after a fall" cleared the floor on
  // "follow-up after the hospital" with "after" as one of its two hits.
  'after', 'before',
]);

interface RowMatch {
  item: PriceItem | null;
  score: number;
  matchedOn: string | null;
  kind: MatchKind;
  hits: number;
}

/** The catalog lookup on its own, with no reading of whether the care happened.
 *  Split out of mapUtterance so a clause can be asked "do you name any unit of
 *  care at all?" without that question producing a priced line. */
function matchRow(raw: string, table: PriceItem[], ignoreContrast = false): RowMatch {
  const q = normalize(raw);
  const qt = tokens(raw);
  let best: PriceItem | null = null;
  let bestScore = 0;
  let bestOn: string | null = null;
  let bestKind: MatchKind = 'none';
  let bestHits = 0;

  /* 🔴 WHOLE WORDS, BOTH WAYS. A plain substring test read "magnesium" as a
     lower BACK scan, "microscope" and "colonoscopy" as the same scope, and
     "picture of my lungs" as photographs of a retina — 20 of the 52 wrong units
     measured on data/test-fixtures/map-eval.json on 2026-09-09. Padding both
     sides with a space makes every containment test a word-boundary test, which
     is also why the length floor can come down to three: "a1c", "esr" and "ecg"
     are safe as whole words and were unreachable before. */
  const qPad = ` ${wordwise(q)} `;
  const qNegative = NEGATIVE_QUALIFIER.test(qPad);
  const qContrast = ignoreContrast ? null : contrastState(` ${q} `);
  const qAngio = ANGIO_WORD.test(q);
  const qBody = bodyClasses(q);

  /* 🔴 A SYMPTOM IS NOT EVIDENCE OF CARE, even when a row's own words contain
     it. The catalog says "MRI for brain fog" and "told me it was all in my
     head", which is right for a person who types those phrases whole — and it
     put a brain MRI on "the brain fog got so bad I forgot my own address". So
     the words of a symptom the person is describing are taken out of the pool a
     loose word-overlap may draw on. The phrase-level tests above are untouched:
     typing the row's own words still finds the row. */
  const symptomWords = new Set<string>();
  for (const phrase of SYMPTOM_PHRASES) if (qPad.includes(` ${wordwise(phrase)} `)) for (const w of tokens(phrase)) symptomWords.add(w);
  const qtCare = symptomWords.size ? qt.filter((w) => !symptomWords.has(w)) : qt;

  /* Every candidate that cleared the floor, with the words of the PERSON'S
     sentence it accounted for. The winner is the highest score, and then the
     rule below: a row that explains strictly more of what they said wins. */
  const clearing: { item: PriceItem; on: string; score: number; kind: MatchKind; hits: number; covered: Set<string> }[] = [];

  for (const item of table) {
    // The person said with, without or both, and the row's own name says otherwise.
    if (qContrast) {
      const rowState = labelContrast(item);
      if (rowState && rowState !== qContrast) continue;
    }
    // "CT angiogram" is its own study; a plain chest CT row cannot take it.
    if (qAngio && isScanRow(item.id) && !ANGIO_WORD.test(normalize(item.label))) continue;
    // "CT of my head" is never the chest CT, whatever words the two share.
    if (qBody.size && isScanRow(item.id)) {
      const rowBody = labelBody(item);
      if (rowBody.size && ![...rowBody].some((c) => qBody.has(c))) continue;
    }
    const candidates = [item.label, ...item.synonyms];
    for (const cand of candidates) {
      const c = normalize(cand);
      const cPad = ` ${wordwise(c)} `;
      // Deduplicated, because an alias can expand a word into a phrase that
      // repeats one the candidate already had ("emergency" → "emergency room"),
      // and a repeat used to count twice and lift a one-word overlap over the
      // floor. Computed once, and only when a branch actually needs it: this
      // runs over every row's every phrase on every keystroke.
      let ctCache: string[] | null = null;
      const ct = (): string[] => (ctCache ??= [...new Set(tokens(cand))]);
      let score = 0;
      let kind: MatchKind = 'none';
      let hits = 0;

      if (q === c) {
        score = 100; kind = 'exact';
      } else if (c.length >= 3 && qPad.includes(cPad)) {
        score = 70 + Math.min(c.length, 25); kind = 'contains';
      } else if (q.length >= 4 && qt.length >= 2 && cPad.includes(qPad)) {
        // The person said less than the row's own name. Every extra word in the
        // row is a qualifier they never said — "moderate complexity", "with
        // polyp removal" — so the plainest row wins over the qualified one.
        // Two content words at least: one word inside a long row name is a
        // fragment, not a request ("the wand" is not a transvaginal ultrasound).
        const extra = ct().filter((w) => !qt.includes(w)).length;
        score = 62 + Math.min(q.length, 25) - extra * 4; kind = 'contained';
      } else if (ct().length && (ct().length > 1 || !TAKING_VERB.test(cPad))) {
        /* FLOW4 flow4-15: a phrase that keeps only one word once its taking verb
           is set aside ("took my blood" is "blood") matches only when it is said
           whole, above. Its one word on its own is not it: "oxygen into my
           blood" is not a blood draw. */
        const shared = ct().filter((w) => qtCare.includes(w) && !JOIN_WORDS.has(w));
        hits = shared.length;
        // Words most rows share — "test", "visit", "first", "time", "doctor" —
        // cannot carry a match on their own. "eleven doctors" is not an office
        // visit and "for the first time" is not a new specialist.
        // FLOW4 flow4-1: a joining word ("where", "found", "what") the person
        // shares with a row's phrase is not a hit either.
        if (hits && shared.some((w) => !GENERIC_TOKENS.has(w))) {
          // proportion of the candidate matched, scaled
          score = Math.round((hits / ct().length) * 55) + hits * 6;
          kind = 'overlap';
        } else {
          hits = 0;
        }
      }

      // A row that says "without" against a clause that does not is the wrong
      // row, however many words it shares.
      const negativeMismatch = !qNegative && NEGATIVE_QUALIFIER.test(cPad);
      if (negativeMismatch && kind !== 'exact') score -= 25;

      if (score >= FLOOR && !negativeMismatch) {
        const covered = new Set(ct().filter((w) => qt.includes(w)));
        if (kind === 'contained') for (const w of qt) covered.add(w);
        clearing.push({ item, on: cand, score, kind, hits, covered });
      }
      if (score > bestScore) {
        bestScore = score; best = item; bestOn = cand; bestKind = kind; bestHits = hits;
      }
    }
  }

  /* 🔴 MOST SPECIFIC FIRST. Two rows can both be true of one clause: a
     colonoscopy and a colonoscopy with the polyp taken out, an echo and an echo
     down the throat, a urine test and a urine culture. The person named the
     second one; the first only wins on being a shorter word. So when another
     row accounts for every word of theirs that the leader did AND more, it
     takes the line. Ten wrong units on 2026-09-09 were this and nothing else. */
  if (best && clearing.length > 1) {
    const leader = clearing.find((x) => x.item === best && x.on === bestOn && x.score === bestScore);
    if (leader && leader.covered.size) {
      let promoted = leader;
      for (const cand of clearing) {
        if (cand.item.id === promoted.item.id) continue;
        if (cand.covered.size < promoted.covered.size) continue;
        if (cand.covered.size === promoted.covered.size && (promoted === leader || cand.score <= promoted.score)) continue;
        if (![...promoted.covered].every((w) => cand.covered.has(w))) continue;
        // The extra words must say something: a row that adds only "study" or
        // "test" to the match is a sibling, not the more specific row.
        const added = [...cand.covered].filter((w) => !promoted.covered.has(w));
        if (!added.some((w) => !GENERIC_TOKENS.has(w))) continue;
        promoted = cand;
      }
      if (promoted !== leader) {
        best = promoted.item; bestOn = promoted.on; bestKind = promoted.kind; bestHits = promoted.hits;
        bestScore = Math.max(promoted.score, bestScore);
      }
    }
  }

  return { item: best, score: bestScore, matchedOn: bestOn, kind: bestKind, hits: bestHits };
}

/** True when the clause names no unit of care at all — used to tell a bare
 *  "and I never went" from "and I never went back to the neurologist". */
function namesNoCare(raw: string, table: PriceItem[]): boolean {
  const m = matchRow(raw, table);
  return !m.item || m.score < FLOOR;
}

/** Confidence floor. Below this we report a miss rather than guess. */
const FLOOR = 42;

/* --------------------------------------------------------------------------
   🔴 REAL COSTS THAT ARE NOT A UNIT OF CARE, NAMED FOR WHAT THEY ARE (FLOW
   patient-3, patient-7). "I take magnesium and vitamin D supplements" priced
   two blood tests she never had. "I lost my job", "a wheelchair" and "my
   health insurance" got the sentence for words we could not read, although
   they are her largest costs. Each now comes back unpriced, with the reason in
   her terms and where it is counted. None of them is ever given a figure, and
   none is sent to the AI reader (a model asked to fill "I take magnesium"
   would find the magnesium test again).
   -------------------------------------------------------------------------- */
const RX_ROW = 'meps2018-retail-rx-out-of-pocket';
/** Given in a vein, a drip or a shot: not a retail prescription, so not the pharmacy figure. */
const NOT_RETAIL_RX = / (?:iv|i v|intravenous|infusions?|drips?|injections?|injected|shots?)(?= )/;
const RX_CLASS = / (?:antidepressants?|ssris?|snris?|antibiotics?|antivirals?|antibiotic|painkillers?|pain (?:meds|medications?|medicines?|killers?|relievers?)|opioids?|steroids?|prednisone|anti ?anxiety (?:meds|medications?)|anti ?inflammator(?:y|ies)(?: (?:meds|medications?|drugs?))?|muscle relaxants?|sleeping pills?|sleep (?:meds|medications?)|birth control|blood pressure (?:meds|medications?|pills?)|antihistamines?|inhalers?|insulin|mood stabili[sz]ers?|antipsychotics?|beta blockers?|anticonvulsants?|migraine (?:meds|medications?)|(?:a |the |my |her |his )?prescriptions?|prescribed (?:meds|medications?|drugs?|pills?|me (?:meds|medications?|pills?))|meds) /;
const SUPPLEMENT_CUE = / (?:supplements?|supplementing|vitamins|multivitamins?|pills?|capsules?|tablets?|gummies|softgels?|over the counter|otc|\d+ ?(?:mg|mcg|iu)) /;
const TAKE_CUE = / (?:take|takes|taking|took|started on|start on|on|bought|buy|buying|using|use) /;
const TEST_CUE = / (?:level|levels|test|tests|tested|testing|blood|lab|labs|panel|checked|check|drawn|draw|measured|came back|result|results|low|high|deficient|deficiency) /;
export const SUPPLEMENT_REASON =
  'a supplement you buy, not a test. It is a real cost and no federal fee schedule prices it. If the level was tested, say so (“a vitamin D test”) and the test will price';
const EQUIPMENT =
  / (?:wheel ?chairs?|walkers?|rollators?|canes?|crutches|shower (?:chair|stool|seat|bench)s?|bath (?:chair|seat|bench)s?|grab bars?|commodes?|braces?|splints?|compression (?:socks|stockings|sleeves?|garments?|wear)|mobility (?:scooter|aid)s?|scooters?|hospital beds?|cpap (?:machine|mask)s?|nebuli[sz]ers?|glucose (?:meter|monitor)s?|blood pressure (?:cuff|monitor)s?|pulse ox(?:imeter)?s?|heating pads?|tens units?|cooling vests?|orthotics?|insoles?) /;
export const EQUIPMENT_REASON =
  'equipment you bought or rented: a real cost, kept on your journey by name. This table has no figure for equipment, so it stays unpriced';
const LOST_WORK =
  / (?:lost|lose|losing|quit|left|leave|gave up|give up) (?:my|her|his|our|the) (?:\w+ )?(?:job|jobs|work|career|position|income|business|pay|paycheck|wages?)(?= )| (?:laid off|let go|out of work|unable to work|cant work|could not work|couldnt work|cannot work|can not work|stopped working|went on disability|on disability|medical leave|sick leave|unpaid leave|cut (?:my|her|his) hours|reduced hours|went part time|missed work|time off work|days off work|off work|out of work)(?= )| (?:missed|lost|took|take|taking|miss) (?:\w+ ){0,3}?(?:(?:days?|weeks?|months?|shifts?) )?(?:of|off|from|at) (?:work|my job|her job|his job)(?= )/;
export const LOST_WORK_REASON =
  'work you lost: a real cost, counted under Days of work you missed, and the days you said go on the workdays card. It is priced only from your own pay or a published weekly wage, never folded into this total';
const INSURANCE = / (?:health |medical )?(?:insurance|coverage|medicaid|medicare|cobra)(?= )/;
const INSURANCE_LOST = / (?:lost|lose|losing|dropped|cancel+ed|ended|ran out|kicked off|no longer|without|uninsured|gone|with it)(?= )/;
export const INSURANCE_REASON =
  'health insurance, not a unit of care. Losing it is a real cost with no federal price, counted with what the search cost you outside of medicine';
export const INSURANCE_NOTE_REASON =
  'health insurance, not a unit of care. If you lost it, say so (“lost my insurance”) and it is counted with what the search cost you outside of medicine';

/** True when the words say work was lost. One definition, read by the mapper
 *  for its reason and by lib/price-api.ts unpriceableFor, so the chip that says
 *  "counted on its own line, Days of work you missed" and the line that lands
 *  there can never disagree. */
export function lostWorkPhrase(raw: string): boolean {
  return LOST_WORK.test(flat(raw));
}

/* --------------------------------------------------------------------------
   🔴 A DIAGNOSIS IS NOT A TEST (round 2, c1: "I have Lyme disease." priced a
   Lyme screening test, $17.03). A clause that only says what she has, or what
   it turned out to be, names no care: it comes back unpriced and says so. Said
   with care ("diagnosed with lupus after an ANA test"), the condition's name
   is taken out before matching, so the care prices and the name does not.
   "since 2022" and "for 3 years" on such a clause are counted as time
   searching, never priced.
   -------------------------------------------------------------------------- */
const CONDITION_NAME = new RegExp(' (?:long covid|post covid|covid(?: 19)?|lyme(?: disease)?|lupus|sle|fibromyalgia|fibro|me cfs|mecfs|cfs|chronic fatigue(?: syndrome)?|pots|dysautonomia|ehlers danlos(?: syndrome)?|heds|eds|hypermobility|mcas|mast cell activation(?: syndrome)?|multiple sclerosis|ms|rheumatoid arthritis|arthritis|celiac(?: disease)?|crohns(?: disease)?|ulcerative colitis|colitis|ibs|endometriosis|pcos|hashimotos|graves(?: disease)?|sjogrens(?: syndrome)?|diabetes|anemia|neuropathy|small fiber neuropathy|migraines?|epilepsy|cancer|lymphoma|leukemia|sarcoidosis|vasculitis|myasthenia gravis|parkinsons|asthma|copd|sleep apnea|narcolepsy|gastroparesis|interstitial cystitis|\\w+itis|\\w+ syndrome|\\w+ disease|\\w+ disorder)(?= )', 'g');
/* FLOW4 flow4-6 (2026-10-01): "it was lupus", "they found lupus", "it was
   celiac" and "took me 3 years to find out it was lupus" told a person to check
   the spelling of her own diagnosis. The answer said plainly is a diagnosis too:
   "it was", "it s", "found", "find out", "figure out", "figured out". These
   only count beside a condition's name, and only where no care is named. */
const DIAG_STRONG = / (?:diagnosed|diagnosis|dx|turned out|it was finally|finally found out|found out|living with|live with|suffer from|suffering from|struggling with|dealing with|it was|it s|found|find out|figure out|figured out)(?= )/;
const DIAG_WEAK = / (?:i|ive|she|shes|he|hes|we|they|you|my (?:son|daughter|kid|child|husband|wife|partner|mom|dad)) (?:have|has|had|got|developed|caught|been sick with|got sick with)(?= )/;
/** Any word that names care. A clause holding one is never a bare diagnosis. */
/* JUDGE-6 #5: plurals too ("a couple of ultrasounds", "echos", "biopsies",
   "x rays"): a care word said twice is still a care word. */
const CARE_NAMED = / (?:ultrasounds|echos|echoes|ecgs|ekgs|emgs|eegs|cts|biopsies|x rays|xrays|scopes|surgeries|procedures|studies|therapies|monitors|injections|infusions|shots|screens|screenings|panels|consults|referrals|clinics|colonoscopies|endoscopies|physicians|pediatricians|specialists|admissions|test|tests|tested|testing|screen|screening|screened|scan|scans|mri|mris|ct|x ray|xray|ultrasound|echo|ecg|ekg|emg|eeg|biopsy|blood|lab|labs|panel|level|levels|visit|visits|saw|see|seen|appointment|appointments|consult|referral|referred|er|emergency|hospital|admitted|urgent care|surgery|procedure|therapy|session|sessions|infusion|injection|shot|study|monitor|holter|scope|colonoscopy|endoscopy|doctor|doctors|specialist|\w+ologist|\w+ologists|\w+ology|dialysis|cath|caths|catheterization|chemo|chemotherapy|radiation|hida|pediatrician|physician|clinic|pt|physio)(?= )/;
/* FLOW5 flow5-2: the two diagnosis reasons live in lib/diagnosis-line.ts, so
   the sheet can read them without this module. Same strings, one definition. */
export { DIAGNOSED_REASON, DIAGNOSIS_REASON } from './diagnosis-line';
/* flow3-6: "im 19 now", "shes 13 now": how old someone is. Not a step of the
   search and never a price; the onset age is read from its own clause. */
export const AGE_NOW_REASON = 'an age, not a unit of care. It is never priced';
const AGE_NOW = /^ (?:and |but |now )?(?:im|i am|shes|she is|hes|he is|theyre|they are|my (?:son|daughter|child|kid|boy|girl|dad|father|mom|mum|mother|husband|wife|partner|grandma|grandpa|grandmother|grandfather) is|(?:i|she|he) turned)(?: now| just)? (\d{1,3})(?: (?:now|years old|year old|yrs old|yrs|yo|today|this year))* $/;

/** flow3-6: a line the person typed that is not care, and too short to be a
 *  step: an age, or three words or fewer with no word for care in them. It
 *  stays on the ledger (under "Not read as care") and is left off the map and
 *  the Brief, so neither opens on "im 19 now". */
export function notReadAsCare(e: { raw: string; item?: unknown; gapCategory?: string | null; months?: number | null; reason?: string | null }): boolean {
  if (e.item || e.gapCategory || e.months != null) return false;
  if (e.reason === AGE_NOW_REASON) return true;
  // FLOW5 flow5-2: a named diagnosis is context, never a blank line of care.
  if (isDiagnosisLine(e)) return true;
  if (e.reason && (unpricedByName(e.reason) || readOnPurpose(e.reason))) return false;
  const hay = flat(e.raw);
  return hay.trim().split(/\s+/).filter(Boolean).length <= 3 && !CARE_NAMED.test(hay);
}

function sinceMonths(hay: string, now = new Date()): { months: number; said: string } | null {
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const m = hay.match(/ since (?:(january|february|march|april|may|june|july|august|september|october|november|december) )?((?:19|20)\d\d)(?= )/);
  if (!m) return null;
  const y = Number(m[2]);
  /* With no month said, the span is counted from the END of that year: the
     least it can be, never rounded up into more than she said. */
  const mo = m[1] ? MONTHS.indexOf(m[1]) : 11;
  const months = (now.getFullYear() - y) * 12 + (now.getMonth() - mo);
  return months >= 1 && months <= 1200 ? { months, said: m[0].trim() } : null;
}

/* --------------------------------------------------------------------------
   judge panel #5c (2026-10-01): THE LENGTH OF THE SEARCH, SAID ANY WAY A
   PERSON SAYS IT. Each form reads only numbers the person typed:
     "from 2015 to 2022", "between 2019 and 2023"           -> the years between
     "got sick at 12 ... diagnosed at 19"                     -> the ages between
     "it started in 2016", "symptoms began in March 2019"     -> to now, counted
        from the END of that year when no month is said (the least it can be),
        or to the year she says it was diagnosed, when she says one
   A span is counted under Time spent searching and never priced.
   -------------------------------------------------------------------------- */
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const YEAR = '((?:19|20)\\d\\d)';
const YEAR_RANGE = new RegExp(` (?:from|between) (?:(${MONTH_NAMES.join('|')}) )?${YEAR} (?:to|and|until|till|through|thru) (?:(${MONTH_NAMES.join('|')}) )?${YEAR}(?= )`);
// JUDGE-6 #5: "sick since I was 12" is an onset age too.
const AGE_AT = '(?:at|age|aged|at age|(?:when|since) (?:i|she|he|they|we) (?:was|were)|when (?:i|she|he) turned)';
const ONSET_WORDS = '(?:sick|ill|symptoms?|started|began|begun|onset|first noticed|came on|it hit|got it|developed)';
const ANSWER_WORDS = '(?:diagnosed|diagnosis|dx|an answer|a name|answers|found out|figured out|finally knew|got a name)';
/** Ages, onset first and answer second, in one clause or across a full stop. */
export const AGE_SPAN = new RegExp(`\\b${ONSET_WORDS}\\b[^.;!?]{0,40}?\\b${AGE_AT} (\\d{1,2})\\b[^;!?]{0,80}?\\b${ANSWER_WORDS}\\b[^.;!?]{0,30}?\\b(?:${AGE_AT}|until|by) (\\d{1,2})\\b`, 'i');
/* flow3-17: the onset age, then how old she is NOW: "got sick at 12 and im 19
   now", "got sick when she was 9, shes 13 now". Read on the raw story (the
   apostrophe optional) and on flat() text alike. The span runs to today, so it
   is the least the search can have been only while it goes on; a diagnosis age
   said in the same words (AGE_SPAN) is read first and wins. */
const NOW_AGE = "(?:i[’']?m|i am|she[’']?s|she is|he[’']?s|he is|they[’']?re|they are|my (?:son|daughter|child|kid) is)";
export const AGE_NOW_SPAN = new RegExp(`\\b${ONSET_WORDS}\\b[^.;!?]{0,40}?\\b${AGE_AT} (\\d{1,2})\\b[^;!?]{0,60}?\\b${NOW_AGE} (?:now )?(\\d{1,2})\\b`, 'i');
const ONSET_YEAR = new RegExp(` (?:started|starts|began|begun|beginning|onset|got sick|fell ill|became ill|came on|first noticed|first got sick)(?: \\w+){0,3}? in (?:(${MONTH_NAMES.join('|')}) )?${YEAR}(?= )`);
const DIAG_YEAR = new RegExp(` (?:diagnosed|diagnosis|dx|got a name|found out)(?: \\w+){0,4}? in (?:(${MONTH_NAMES.join('|')}) )?${YEAR}(?= )`);

/** Months between two (month, year) points. Two bare years are the years
 *  between them ("2015 to 2022" is 7 years). When only one month is said, the
 *  missing one is read so the span is the least it can be: a start at the END
 *  of its year, an end at the START of its year. Null outside 1 month to 100 years. */
function monthsBetween(m1: string | undefined, y1: number, m2: string | undefined, y2: number): number | null {
  const bare = !m1 && !m2;
  const a = y1 * 12 + (m1 ? MONTH_NAMES.indexOf(m1) : bare ? 0 : 11);
  const b = y2 * 12 + (m2 ? MONTH_NAMES.indexOf(m2) : 0);
  const n = b - a;
  return n >= 1 && n <= 1200 ? n : null;
}

/** A span of the search said as two years, two ages or an onset year. `hay`
 *  is flat(); `story` (optional) is the whole account, read for the year of the
 *  diagnosis so an onset year is not counted to today when she said when it ended. */
export function searchSpan(hay: string, now = new Date(), story = ''): { months: number; said: string } | null {
  const r = YEAR_RANGE.exec(hay);
  if (r) {
    const n = monthsBetween(r[1], Number(r[2]), r[3], Number(r[4]));
    if (n) return { months: n, said: r[0].trim() };
  }
  const a = AGE_SPAN.exec(hay);
  if (a) {
    const y = Number(a[2]) - Number(a[1]);
    if (y >= 1 && y <= 80) return { months: y * 12, said: a[0].trim() };
  }
  const an = AGE_NOW_SPAN.exec(hay);
  if (an) {
    const y = Number(an[2]) - Number(an[1]);
    if (y >= 1 && y <= 80) return { months: y * 12, said: an[0].trim() };
  }
  const o = ONSET_YEAR.exec(hay);
  if (o) {
    const d = DIAG_YEAR.exec(flat(story || hay));
    const n = d
      ? monthsBetween(o[1], Number(o[2]), d[1], Number(d[2]))
      : monthsBetween(o[1], Number(o[2]), MONTH_NAMES[now.getMonth()], now.getFullYear());
    if (n) return { months: n, said: o[0].trim() };
  }
  return null;
}

/** judge panel #5b: "they said POTS", "the neurologist said it was MS", "my
 *  doctor thinks it is lupus". Who said it is not a visit; the clause is the
 *  name of a condition and nothing else. */
const SAID_DIAG = new RegExp(`^ (?:(?:they|he|she|doctors?|the doctors?|my doctors?|the specialists?|my specialist|the \\w+ologists?|my \\w+ologist|my \\w+ologists|the er|everyone) )?(?:finally |eventually |then |now )?(?:said|say|says|called it|decided|thought|think|thinks|suspected|suspect|suspects|told me|told us|told her|told him)(?: (?:it was|it is|it s|its|i had|i have|she had|she has|he had|he has|i might have|it might be|maybe|probably|that it was|that i had|me i had|her she had))?(?: an?)?${CONDITION_NAME.source}(?: (?:finally|in the end|eventually|at last))? $`);

/** "diagnosed in 2025", "finally got a diagnosis at 19": the moment of the
 *  answer, with no condition named and no care. A marker, never a line of care. */
const DIAG_ONLY = /^ (?:(?:i|she|he|we|they|was|were|got|finally|eventually|then|and|it|when|until|i was|she was|he was) )*(?:diagnosed|got a diagnosis|got diagnosed|got a name for it|got an answer|was diagnosed)(?: (?:in|at|age|when|by|after|finally|with it)(?: \w+){0,4})? $/;

function diagnosisResult(raw: string, table: PriceItem[]): { result: MapResult } | { strip: string } | null {
  const hay = flat(raw);
  if (DIAG_ONLY.test(hay) && !CARE_NAMED.test(hay)) {
    return { result: { item: null, score: 0, matchedOn: null, confidence: 'none', reason: DIAGNOSED_REASON, gapCategory: null, months: null } };
  }
  return diagnosisNamed(raw, hay, table);
}

function diagnosisNamed(raw: string, hay: string, table: PriceItem[]): { result: MapResult } | { strip: string } | null {
  const named = new RegExp(CONDITION_NAME.source).test(hay);
  if (!named) return null;
  if (SAID_DIAG.test(hay)) {
    return { result: { item: null, score: 0, matchedOn: null, confidence: 'none', reason: DIAGNOSIS_REASON, gapCategory: null, months: null } };
  }
  const strong = DIAG_STRONG.test(hay);
  const care = CARE_NAMED.test(hay);
  if (care) {
    if (!strong) return null;
    const rest = hay.replace(CONDITION_NAME, ' ').replace(DIAG_STRONG, ' ').replace(/\s+/g, ' ').trim();
    return rest ? { strip: rest } : null;
  }
  const weak = DIAG_WEAK.test(hay) || / since /.test(hay) || /^ (?:\w+ ){0,1}(?:long covid|lyme(?: disease)?|lupus|fibromyalgia|me cfs|pots) /.test(hay);
  if (!strong && !weak) return null;
  if (!namesNoCare(raw.replace(new RegExp(CONDITION_NAME.source.replace(/^ /, '\\b'), 'gi'), ' '), table)) return null;
  const dur = readDuration(hay);
  // FLOW4 flow4-6: "took me 3 years to find out it was lupus" is 36 months, on this one line.
  /* FINAL-1011 reader (c): "finally got a diagnosis of endometriosis after 9
     years" is nine years of searching, on this one line. Only years and decades:
     "diagnosed after 2 weeks in hospital" is not the search. */
  const after = hay.match(new RegExp(` after (?:about |almost |nearly |more than |over )?(${NUM}|a|an)( and a half)? (year|decade)s?( and a half)?(?= )`));
  const afterSpan = after ? { months: monthsOfSpan((/^(a|an)$/.test(after[1]) ? 1 : toNum(after[1])) + (after[2] || after[4] ? 0.5 : 0), after[3]), said: after[0].trim() } : null;
  const span = sinceMonths(hay) ?? searchSpan(hay) ?? (dur ? { months: monthsOfSpan(dur.n, dur.unit), said: dur.said } : null) ?? waitSpan(raw) ?? afterSpan;
  return { result: { item: null, score: 0, matchedOn: null, confidence: 'none', reason: DIAGNOSIS_REASON, gapCategory: span ? 'time-searching' : null, months: span ? span.months : null } };
}

/** Workdays a phrase says were missed: "I missed 3 weeks of work" is 15 (the
 *  five-day week lib/burdens.ts divides weekly pay by). Months are not turned
 *  into days: the person says how many. Null when no number of days is said. */
export function workdaysSaid(raw: string): { days: number; said: string; note: string } | null {
  if (!lostWorkPhrase(raw)) return null;
  const hay = ` ${normalize(raw)} `;
  const m = hay.match(new RegExp(`\\s(?:about\\s+|almost\\s+|nearly\\s+|over\\s+|around\\s+|like\\s+|maybe\\s+|roughly\\s+)?(${NUM}|a|an|a couple of|couple of|a few|several)\\s+(day|week|shift)s?\\b`, 'i'));
  if (!m) return null;
  const w = m[1].toLowerCase();
  const n = /^(?:a|an)$/.test(w) ? 1 : /couple/.test(w) ? 2 : /few|several/.test(w) ? 3 : toNum(w);
  const unit = m[2].toLowerCase();
  const days = unit === 'week' ? n * 5 : n;
  if (days < 1 || days > 3650) return null;
  return { days, said: m[0].trim(), note: unit === 'week' ? `${n} ${n === 1 ? 'week' : 'weeks'} × 5 workdays = ${days}` : `${days} ${days === 1 ? 'day' : 'days'}` };
}

/** A reason the rules gave ON PURPOSE: the phrase was read, and it is not a
 *  unit of care. Never blank, so the AI reader is never asked to fill it. */
export function readOnPurpose(reason: string | null | undefined): boolean {
  return !!reason && (reason === COURSE_REASON || reason === SUPPLEMENT_REASON || reason === EQUIPMENT_REASON
    || reason === LOST_WORK_REASON || reason === INSURANCE_REASON || reason === INSURANCE_NOTE_REASON || reason === DIAGNOSIS_REASON || reason === DIAGNOSED_REASON
    || reason === AGE_NOW_REASON || reason === HOSPITAL_STAY_REASON);
}

function notCareResult(raw: string, table: PriceItem[]): MapResult | null {
  const hay = flat(raw);
  const none = (reason: string, gapCategory: GapCategory | null = null): MapResult =>
    ({ item: null, score: 0, matchedOn: null, confidence: 'none', reason, gapCategory, months: null });
  if (COURSE_ONLY.test(hay) && namesNoCare(raw.replace(/\b(?:better|well|worse)\b/gi, ' '), table)) return none(COURSE_REASON);
  /* A supplement is refused only where the words would otherwise land on a lab
     test, or on nothing: "a camera pill for my small bowel" is a capsule
     endoscopy and still prices. */
  if (SUPPLEMENT_CUE.test(hay) && !TEST_CUE.test(hay)) {
    const m = matchRow(raw, table);
    if (!m.item || m.score < FLOOR || m.item.id.startsWith('cms-lab-')) return none(SUPPLEMENT_REASON);
  }
  if (EQUIPMENT.test(hay) && namesNoCare(raw.replace(EQUIPMENT_STRIP, ' '), table)) return none(EQUIPMENT_REASON);
  if (LOST_WORK.test(hay) && namesNoCare(raw, table)) return none(LOST_WORK_REASON);
  if (INSURANCE.test(hay) && namesNoCare(raw, table)) return INSURANCE_LOST.test(hay) ? none(INSURANCE_REASON, 'life-lost') : none(INSURANCE_NOTE_REASON);
  return null;
}
const EQUIPMENT_STRIP = new RegExp(EQUIPMENT.source.trim().replace(/^ /, ''), 'gi');

/**
 * Map a plain-language utterance onto a unit of care.
 * Returns null below the confidence floor — a miss is reported honestly rather
 * than forced onto the nearest item, because a wrong mapping produces a real
 * price for something that never happened.
 */
/* 🔴 flow3-8: THE PLAIN VARIANT IS THE DEFAULT. The same words priced at
   different variants: "4 brain MRIs" read without contrast ($195.40), "an MRI
   of her brain" with and without ($316.97), and any EEG the dearest one, awake
   and asleep ($482.31). When the person names no contrast, an MRI of the brain
   is the plain one (CPT 70551); when she names no sleep, an EEG is the routine
   one, awake and drowsy (CPT 95816). Either is marked low confidence, so the
   chip says "worth a check" and she can change it. Said details still win. */
const MRI_BRAIN_BOTH = 'cms-img-mri-brain-both', MRI_BRAIN_PLAIN = 'cms-img-mri-brain-nc';
const EEG_FULL = 'cms-test-eeg', EEG_ROUTINE = 'cms-test-eeg-awake-drowsy';
const SAYS_CONTRAST = / (?:contrast|dye|gadolinium|gad|with and without|with & without|w wo|w o)(?= )/;
const SAYS_SLEEP = / (?:asleep|sleep|sleeping|slept|overnight|sleep deprived|complete|long|extended|ambulatory|24 hour|48 hour|72 hour|video)(?= )/;
const SAYS_NO_CONTRAST = / (?:without contrast|no contrast|without dye|no dye|non contrast|noncontrast|plain)(?= )/;
const SAYS_ROUTINE = / (?:routine|awake|drowsy|standard|regular)(?= )/;
function plainVariant(r: MapResult, said: string, table: PriceItem[]): MapResult {
  const id = r.item?.id;
  if (id !== MRI_BRAIN_BOTH && id !== EEG_FULL && id !== MRI_BRAIN_PLAIN && id !== EEG_ROUTINE) return r;
  const hay = flat(said);
  const mri = id === MRI_BRAIN_BOTH || id === MRI_BRAIN_PLAIN;
  const said_ = mri ? SAYS_CONTRAST.test(hay) : SAYS_SLEEP.test(hay);
  if (said_) return r; // a said detail wins, as matched
  const plainSaid = mri ? SAYS_NO_CONTRAST.test(hay) : SAYS_ROUTINE.test(hay);
  const item = table.find((t) => t.id === (mri ? MRI_BRAIN_PLAIN : EEG_ROUTINE));
  if (!item) return r;
  return { ...r, item, confidence: plainSaid ? r.confidence : 'low' };
}

/* JUDGE-5 #5: every word the reader knows. Everyday English (lib/common-words),
   this file's own word lists, and every word of the catalog's labels and
   phrases. Cached per table: built once, read on every keystroke. */
const KNOWN_CACHE = new WeakMap<object, Set<string>>();
function knownWords(table: PriceItem[]): Set<string> {
  const hit = KNOWN_CACHE.get(table as unknown as object);
  if (hit) return hit;
  const known = new Set<string>([
    ...COMMON_WORDS.map(singular), ...STOP, ...COUNT_NOISE, ...TIME_FILLER, ...JOIN_WORDS, ...GENERIC_TOKENS,
    ...SYMPTOM_WORDS, ...RESULT_WORDS, ...ILL_SPAN_WORDS, ...CLINICIAN_WORDS,
  ]);
  for (const it of table) for (const ph of [it.label, ...it.synonyms]) for (const w of normalize(ph).split(' ')) if (w) known.add(singular(w));
  KNOWN_CACHE.set(table as unknown as object, known);
  return known;
}
/** True when every word of the phrase is one the reader knows: a phrase that
 *  names no care, never a misspelling. A number is a known word. */

/* JUDGE-6 #5: WHY A PHRASE MISSED, SAID TRUTHFULLY.
   "Check the spelling" only when a word in it is one the reader does not know
   AND sits within two letters of a word in the catalog ("colonscopy",
   "ultrasond"). A hospital stay and an ultrasound with no part say what they
   are. Care the table holds under other words says so. Everything else names
   no care, in plain words. */
/* JUDGE-7 #3: also "in the hospital for 5 days", "3 nights in the ICU", "the ICU",
   "a week in the hospital". */
/* JUDGE-7 #9: named analytes, each to its own catalog row. */
const GENERIC_LAB_SAID = / (?:labs?|lab work|labwork|blood ?work|blood tests?|blood panel|panels?|levels?)(?= )/;
const ANALYTE_ROWS: [RegExp, string][] = [
  [/ thyroid(?= )/, 'cms-lab-tsh'],
  [/ tsh(?= )/, 'cms-lab-tsh'],
  [/ ana(?= )/, 'cms-lab-ana'],
  [/ a1c(?= )/, 'cms-lab-a1c'],
  [/ b12(?= )/, 'cms-lab-b12'],
  [/ vitamin d(?= )/, 'cms-lab-vitamin-d'],
  [/ ferritin(?= )/, 'cms-lab-ferritin'],
  [/ (?:cholesterol|lipids?)(?= )/, 'cms-lab-lipid-panel'],
  [/ (?:sed rate|esr)(?= )/, 'cms-lab-esr'],
];

const HOSPITAL_STAY = / (?:admitted|admission|hospitali[sz]ed|inpatient|overnight stay|stayed (?:overnight|in (?:the )?(?:hospital|icu))|kept (?:me|her|him|them|us) (?:overnight|in)|in (?:the )?(?:hospital|icu|intensive care|picu|nicu) for|(?:days?|nights?|weeks?) in (?:the )?(?:hospital|icu|intensive care|picu|nicu)|icu|intensive care unit|picu|nicu)(?= )/;
const CATALOG_WORDS = new WeakMap<object, string[]>();
function catalogWords(table: PriceItem[]): string[] {
  let w = CATALOG_WORDS.get(table as unknown as object);
  if (!w) {
    const set = new Set<string>();
    for (const it of table) for (const ph of [it.label, ...it.synonyms]) for (const x of normalize(ph).split(' ')) if (x.length >= 4) set.add(x);
    w = [...set];
    CATALOG_WORDS.set(table as unknown as object, w);
  }
  return w;
}
/** Levenshtein distance, stopping early once it passes `max`. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}
/** True when some word of the phrase is unknown and two letters or fewer from a catalog word. */
/* JUDGE-7 #7: correctly spelled care the table does not hold drew "check the
   spelling" ("dialysis", "a heart cath", "neurology 2x", "a HIDA scan"). Those
   words are skipped, and a word under seven letters must sit one letter, not
   two, from a catalog word before the advice is given. */
const SPELLED_RIGHT = new Set([
  'dialysis', 'cath', 'caths', 'catheter', 'catheterization', 'hida', 'neurology', 'rheumatology', 'cardiology',
  'gastroenterology', 'endocrinology', 'dermatology', 'pulmonology', 'hematology', 'oncology', 'urology', 'nephrology',
  'gynecology', 'obgyn', 'ent', 'missed', 'miss', 'work', 'job', 'chemo', 'chemotherapy', 'radiation', 'stent', 'pacemaker',
]);
function looksMisspelled(raw: string, table: PriceItem[]): boolean {
  const known = knownWords(table);
  const words = catalogWords(table);
  for (const w of normalize(raw).split(' ')) {
    if (w.length < 4 || /\d/.test(w) || known.has(w) || known.has(singular(w)) || SPELLED_RIGHT.has(w) || SPELLED_RIGHT.has(singular(w))) continue;
    const max = w.length < 7 ? 1 : 2;
    if (words.some((c) => c !== w && within(w, c, max))) return true;
  }
  return false;
}
function missReason(raw: string, table: PriceItem[]): string {
  const hay = flat(raw);
  if (HOSPITAL_STAY.test(hay)) return HOSPITAL_STAY_REASON;
  if (/ ultrasounds? /.test(hay)) return BARE_ULTRASOUND_REASON;
  if (looksMisspelled(raw, table)) return NO_MATCH_REASON;
  if (CARE_NAMED.test(hay)) return SAY_IT_REASON;
  return PLAIN_WORDS_REASON;
}

export function mapUtterance(said: string, table: PriceItem[]): MapResult {
  return plainVariant(mapUtteranceRules(said, table), said, table);
}

function mapUtteranceRules(said: string, table: PriceItem[]): MapResult {
  let raw = said;
  let q = normalize(raw);
  if (!q) return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: 'there is nothing here to match', gapCategory: null, months: null };

  /* 🔴 Before anything is matched: care that did not happen, and a bare length
     of time, are never priced. This runs first because a refused specialist
     visit matches the specialist row perfectly. */
  const gap = gapSignalFor(raw);
  if (gap?.suppressesPrice) return gapResult(gap);
  const carried = { gapCategory: gap?.category ?? null, months: gap?.months ?? null };

  /* 🔴 Care that is booked for next month, only read about, or that a sister
     had. No gap category fits — nothing was lost — so the line comes back blank
     with the plain reason, and never with a figure. */
  /* flow3-6: an age is read before anything else is tried on it. */
  if (AGE_NOW.test(flat(raw))) return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: AGE_NOW_REASON, gapCategory: null, months: null };
  /* JUDGE-7 #3: a hospital stay is counted, never priced as a different
     service. "He was in the hospital for 5 days after a fall" priced
     Transitional care after a hospital stay (99495), a post-discharge service
     nobody described, because the stay was only tested after a match had
     already won. It is tested here, before any match. */
  /* JUDGE-7 #9: "thyroid labs" priced a complete blood count ($7.77) while
     "TSH test" priced the TSH ($16.80), and "labs (ANA" became a second CBC.
     A named analyte beside a generic lab word ("labs", "bloodwork", "levels")
     is that analyte's own row, read before the generic labs-to-CBC match. */
  {
    const h = flat(raw);
    if (GENERIC_LAB_SAID.test(h)) {
      const hits = ANALYTE_ROWS.filter(([re]) => re.test(h));
      const row = hits.length === 1 ? table.find((it) => it.id === hits[0][1]) : undefined;
      if (row) return { item: row, score: 100, matchedOn: (h.match(hits[0][0]) ?? [''])[0].trim(), confidence: 'high', reason: null, gapCategory: carried.gapCategory, months: carried.months };
    }
  }
  /* An ER visit in the same words ("kept me in the ER") is still the ER visit. */
  if (HOSPITAL_STAY.test(flat(raw)) && !/ (?:er|ed|emergency|urgent care) /.test(flat(raw))) return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: HOSPITAL_STAY_REASON, gapCategory: null, months: null };
  /* flow3-6: "they said it might be lupus" names a condition; the "might" is
     theirs, about the answer, not care that has not happened yet. */
  if (new RegExp(CONDITION_NAME.source).test(flat(raw)) && SAID_DIAG.test(flat(raw))) {
    return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: DIAGNOSIS_REASON, gapCategory: null, months: null };
  }

  const notMine = notYoursOrNotYet(raw);
  if (notMine) return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: NOT_YOURS_OR_NOT_YET_REASON, gapCategory: null, months: null };

  const notCare = notCareResult(raw, table);
  if (notCare) return notCare;

  const diag = diagnosisResult(raw, table);
  if (diag && 'result' in diag) return diag.result;
  if (diag && 'strip' in diag) { raw = diag.strip; q = normalize(raw); }
  /* A dismissal rides along with the visit it happened at; what they called
     it ("anxiety") is never matched as care. */
  if (gap?.category === 'dismissed') {
    const rest = stripDismissal(raw);
    if (!rest || namesNoCare(rest, table)) return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: DISMISSAL_REASON, ...carried };
    raw = rest; q = normalize(raw);
  }

  if (isSymptomOnly(raw)) return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: SYMPTOM_REASON, ...carried };
  if (isResultOnly(raw)) return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: RESULT_REASON, ...carried };

  /* FINAL-1011 (susan): an invasive exercise test (iCPET) is a different test
     from the standard CPET row, and no single published federal figure covers
     the whole procedure. Named, never priced, never the ordinary CPET. */
  if (INVASIVE_CPET.test(flat(raw))) return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: INVASIVE_CPET_REASON, ...carried };
  /* 10/13 interview (postpartum depression): "I was hospitalized and had ECT"
     read as no care. ECT and TMS are real treatments with fee schedule codes
     this table does not carry yet: named, never priced, never dropped. */
  if (UNCARRIED_TREATMENT.test(flat(raw))) return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: UNCARRIED_TREATMENT_REASON, ...carried };

  /* FINAL-1011 (main): "told to push through" is advice, not an IV push. The
     fuzzy match read it as cms-proc-iv-push; a push through a line, a vein or an
     IV, or a pushed drug, still prices. */
  if (PUSH_THROUGH_ADVICE.test(flat(raw)) && !IV_WORDS.test(flat(raw))) return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: PUSH_THROUGH_REASON, ...carried };

  // A nerve conduction study takes a row only when the number of nerves is said.
  const ncs = conductionResult(raw, table, carried);
  if (ncs) return ncs;

  const m = matchRow(raw, table);
  const { item: best, score: bestScore, matchedOn: bestOn, kind: bestKind, hits: bestHits } = m;

  /* "I take magnesium": a lab analyte named with a taking word and no test word
     is the supplement, not the blood test (FLOW patient-3). Read off the match
     already made, so no phrase is matched twice. */
  if (best && bestScore >= FLOOR && best.id.startsWith('cms-lab-')) {
    const hay = flat(raw);
    if (TAKE_CUE.test(hay) && !TEST_CUE.test(hay)) return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: SUPPLEMENT_REASON, gapCategory: null, months: null };
  }

  if ((bestScore < FLOOR || !best) && contrastState(` ${q} `)) {
    const loose = matchRow(raw, table, true);
    if (loose.item && loose.score >= FLOOR && isScanRow(loose.item.id)) {
      return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: CONTRAST_GAP_REASON, ...carried };
    }
  }
  /* 10/13 interview (postpartum depression): "an antidepressant" read as no care,
     so five years of medication left nothing on the ledger. A named drug class
     that matched no row takes the one published prescriptions figure, which
     says on its face that it is a yearly median and never joins the sum. */
  if ((bestScore < FLOOR || !best) && !gap && RX_CLASS.test(flat(raw)) && !NOT_RETAIL_RX.test(flat(raw))) {
    /* judge4 #6: the live ledger maps against SELECTABLE (summable rows only), which
       leaves this yearly survey row out; it is read from the full table, and the
       ledger shows it under Survey figures, beside the total, never in it. */
    const rx = table.find((x) => x.id === RX_ROW) ?? FULL_TABLE.find((x) => x.id === RX_ROW);
    if (rx) return { item: rx, score: FLOOR, matchedOn: 'prescriptions', confidence: 'medium', reason: null, ...carried };
  }
  if (bestScore < FLOOR || !best) {
    // A dismissal that matched no row still says why it carries no figure.
    return { item: null, score: bestScore, matchedOn: null, confidence: 'none', reason: gap ? gapReason(gap.category) : missReason(raw, table), ...carried };
  }
  if (isScanRow(best.id) && !namesBodyPart(raw)) {
    return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: BARE_SCAN_REASON, ...carried };
  }
  return { item: best, score: bestScore, matchedOn: bestOn, confidence: confidenceOf(bestKind, bestOn, bestHits), reason: null, ...carried };
}

function confidenceOf(kind: MatchKind, on: string | null, hits: number): MatchConfidence {
  if (kind === 'exact') return 'high';
  if (kind === 'contains' || kind === 'contained') {
    const words = tokens(on ?? '').length;
    return words >= 2 || (on ?? '').length >= 8 ? 'high' : 'medium';
  }
  if (kind === 'overlap') return hits >= 2 ? 'medium' : 'low';
  return 'none';
}

/** Suggestions shown under the input, drawn from the real table only. */
export function suggestions(table: PriceItem[], limit = 6): string[] {
  return table
    .filter((i) => i.valueUsd !== null)
    .slice(0, limit)
    .map((i) => i.synonyms[0] || i.label);
}

/* ==========================================================================
   WHOLE-SENTENCE PARSING — "saw my regular doctor three times, then a
   cardiologist, an echo and a Holter" → four segments, each with its own count,
   each mapped separately. Still deterministic. Still never a price.
   ========================================================================== */

export interface ParsedSegment {
  raw: string;
  times: number;
  result: MapResult;
  /** Who read the phrase: the deterministic rules, or the AI reader filling a blank the rules left. */
  source?: 'rules' | 'model';
  /** The model's one-line reason, shown on the chip. Null for a rules match. */
  modelWhy?: string | null;
  /** The arithmetic behind a count, in words, when the count was not simply stated.
   *  e.g. "twice a week × 26 weeks = 52". Shown on the line; never hidden. */
  countNote?: string | null;
  /** True when this fragment is the tail of the phrase beside it and names the same unit the
   *  AI reader already filled there ("they put electrodes on my legs" … "and shocked the nerves").
   *  One clause, one line: it is neither shown nor counted, and never priced twice. */
  absorbed?: boolean;
}

export interface CountResult {
  text: string;
  times: number;
  /** How the count was arrived at, when it took arithmetic. */
  note: string | null;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** Rate per day for a frequency phrase, with the words the person used. */
function readFrequency(text: string): { perDay: number; said: string; span: string } | null {
  // "twice a week", "three times per month", "2x a week", "4 times each year"
  let m = text.match(new RegExp(`\\s(${NUM})\\s*(?:x|times)?\\s+(?:a|an|per|each|every)\\s+(day|week|month|year)s?\\b`, 'i'));
  if (m) {
    const n = toNum(m[1]);
    return { perDay: n / SPAN_DAYS[m[2].toLowerCase()], said: m[0].trim(), span: m[2].toLowerCase() };
  }
  // "twice weekly", "three times monthly"
  m = text.match(new RegExp(`\\s(${NUM})\\s*(?:x|times)?\\s+(daily|weekly|monthly|yearly)\\b`, 'i'));
  if (m) {
    const n = toNum(m[1]);
    return { perDay: n * FREQ_ADVERB[m[2].toLowerCase()], said: m[0].trim(), span: ADVERB_SPAN[m[2].toLowerCase()] };
  }
  // "every month", "every other week", "every three months", "every 6 weeks"
  m = text.match(new RegExp(`\\s(?:every|each)\\s+(other\\s+)?(?:(${NUM})\\s+)?(day|week|month|year)s?\\b`, 'i'));
  if (m) {
    const every = m[1] ? 2 : (m[2] ? toNum(m[2]) : 1);
    return { perDay: 1 / (every * SPAN_DAYS[m[3].toLowerCase()]), said: m[0].trim(), span: m[3].toLowerCase() };
  }
  // bare "weekly", "monthly", "quarterly"
  m = text.match(new RegExp(`\\s(${Object.keys(FREQ_ADVERB).join('|')})\\b`, 'i'));
  if (m) {
    const w = m[1].toLowerCase();
    return { perDay: FREQ_ADVERB[w], said: w, span: ADVERB_SPAN[w] };
  }
  return null;
}

/** Length of time, in days, for "for six months" / "over two years". With
 *  `loose`, a bare span counts too — "six months of weekly therapy" says the
 *  same thing as "weekly for six months", and a person writes it both ways.
 *  Loose is used only once a frequency has been found and cut out, so the
 *  "a week" inside "twice a week" can never be read as the duration. */
function readDuration(text: string, loose = false): { days: number; said: string; unit: string; n: number } | null {
  const lead = '(?:for|over|across|during|spanning|lasting)\\s+';
  const hedge = '(?:about\\s+|almost\\s+|nearly\\s+|around\\s+|roughly\\s+|the\\s+past\\s+|the\\s+last\\s+)?';
  /* judge panel #5: "two and a half years", "a year and a half", "a decade". */
  const half = '(\\s+and\\s+a\\s+half)?';
  /* JUDGE-6 #5: "7 yrs", "a yr", "6 wks", "3 mos" are years, weeks and months. */
  const tail = `(${NUM}|a|an)${half}\\s+(day|week|month|year|decade|yr|wk|mo)s?${half}\\b`;
  const m = text.match(new RegExp(`\\s${lead}${hedge}${tail}`, 'i'))
        ?? (loose ? text.match(new RegExp(`\\s${hedge}(${NUM}|a|an)${half}\\s+(year|decade|month|yr)s?${half}\\b`, 'i')) : null)
        ?? (loose ? text.match(new RegExp(`\\s${hedge}(${NUM})${half}\\s+(day|week|month|year|decade|yr|wk)s?${half}\\b`, 'i')) : null);
  if (!m) return null;
  const n = (/^(a|an)$/i.test(m[1]) ? 1 : toNum(m[1])) + (m[2] || m[4] ? 0.5 : 0);
  const unit = ({ yr: 'year', wk: 'week', mo: 'month' } as Record<string, string>)[m[3].toLowerCase()] ?? m[3].toLowerCase();
  return { days: n * SPAN_DAYS[unit], said: m[0].trim(), unit, n };
}

/**
 * Pull a count out of a phrase and return the phrase without it.
 *
 * Everything here reads what the person actually wrote. Where it takes
 * arithmetic ("twice a week for six months"), the arithmetic comes back in
 * `note` so the line can show its work and the person can correct the count.
 */
/** JUDGE-7 #8: one "label: number" list item ("Dr. visits: 12", "Labs: 8"). */
const LIST_ITEM = /(?<=^|[.;\n]\s*)(?:(?:dr|drs)\.\s*)?[a-z][a-z' ]{1,30}:\s*\d{1,3}(?=\s*(?:[.;,\n]|$))/gim;
const LIST_COUNT = /^\s*((?:(?:dr|drs)\.?\s*)?[a-z][a-z' ]{1,30}):\s*(\d{1,3})\s*[.;,]?\s*$/i;

export function extractCount(phrase: string): CountResult {
  const listed = LIST_COUNT.exec(phrase);
  if (listed && toNum(listed[2]) > 0) {
    return { text: listed[1].replace(/^(dr|drs)\.?\s*/i, 'doctor ').trim(), times: Math.min(365, toNum(listed[2])), note: null };
  }
  let text = ` ${foldApostrophePlurals(phrase).trim().replace(/\s+/g, ' ')} `;
  let times = 0;
  let note: string | null = null;
  let heldDuration: string | null = null;
  const cut = (s: string) => { text = text.replace(s, ' '); };

  // 1. A RANGE — "four or five", "3 to 5". Take the LOWER number: a person's own
  //    uncertainty is never rounded up into more care than they said they had.
  const range = text.match(new RegExp(`\\s(${NUM})\\s*(?:or|to|-)\\s*(${NUM})\\b`, 'i'));
  if (range) {
    const lo = Math.min(toNum(range[1]), toNum(range[2]));
    const hi = Math.max(toNum(range[1]), toNum(range[2]));
    times = lo;
    note = `you said ${range[1]} or ${range[2]}, counted as ${lo}, the lower of the two (change it if ${hi} is right)`;
    cut(range[0]);
  }

  // 2. HOW OFTEN, FOR HOW LONG — "twice a week for six months" → 52.
  if (!times) {
    const freq = readFrequency(text);
    const dur = freq ? readDuration(text.replace(freq.said, ' '), true) : null;
    if (freq && dur) {
      times = Math.max(1, Math.round(freq.perDay * dur.days));
      // The arithmetic goes on the face of the line: "2 a week × 26 weeks = 52".
      const spanUnit = freq.span in SPAN_DAYS ? freq.span : dur.unit;
      const spans = Math.round(dur.days / SPAN_DAYS[spanUnit]) || 1;
      const per = Math.round(freq.perDay * SPAN_DAYS[spanUnit] * 100) / 100;
      note = `${per} a ${spanUnit} × ${plural(spans, spanUnit)} = ${times}`;
      cut(freq.said); cut(dur.said);
    } else if (freq && freq.perDay <= 1 / 28) {
      // A frequency with no end date. Counted over one year, and it says so, for
      // monthly-or-rarer care only — "twice a week" with no duration is unbounded
      // and is left at the single visit the person named.
      times = Math.max(1, Math.round(freq.perDay * 365.25));
      note = `${freq.said}, counted over one year = ${times}. Change the count if that is not your year`;
      cut(freq.said);
    }
  }

  // "a dozen", "half a dozen" — read before the number words, or "half a dozen
  //  times" loses its "half".
  if (!times) {
    const dozen = text.match(/\s(half\s+a\s+|a\s+)?dozen\b/i);
    if (dozen) { times = /half/i.test(dozen[0]) ? 6 : 12; cut(dozen[0]); }
  }

  /* 🔴 2b. A DURATION IS NEVER A COUNT (R4, brainfog BF-01, parent PAR-03, c1
     C3). "wore a heart monitor for 14 days" was a 48-hour Holter ×14 ($987),
     "a heart monitor for two days" ×2, because "days" is a thing people count
     ("three nights in the hospital", "20 days of work") and the count below
     read it. Said after "for", "over", "lasting" and the like, a length of
     time is how long something went on. It is cut out before any count is
     read, so "3 times over 2 days" is still 3, and the line says why. */
  if (!times) {
    const lasted = text.match(new RegExp(
      `\\s(?:for|over|across|during|lasting|spanning|within|through)\\s+(?:about\\s+|almost\\s+|nearly\\s+|around\\s+|roughly\\s+|like\\s+|maybe\\s+|a\\s+full\\s+|the\\s+(?:past|last|next)\\s+)?(${NUM}|a|an)\\s+(hour|day|night|week|month|year)s?\\b`, 'i'));
    if (lasted) {
      // Held out of the count, kept for the match: "the average of my blood
      // sugar over three months" is the A1c's own name.
      heldDuration = lasted[0];
      text = text.replace(lasted[0], ' ~~D~~ ');
      if (/^(?:day|night)$/i.test(lasted[2]) && !/^(?:a|an|one)$/i.test(lasted[1])) {
        note = `“${lasted[0].trim()}” is how long it lasted, not how many, so it is counted once (change the count if it happened more than once)`;
      }
    }
  }

  // 3. A STATED COUNT — "x3", "3x", "6 times", "ten times". Scanned across the
  //    whole phrase, so "four years in circles, my doctor ten times" reads 10.
  if (!times) {
    const numeric = text.match(new RegExp(`\\s(?:x\\s?(\\d{1,3})|(\\d{1,3})\\s?x|(\\d{1,3})\\s+(?:${COUNT_UNITS}))\\b`, 'i'));
    if (numeric) {
      times = parseInt(numeric[1] || numeric[2] || numeric[3], 10);
      cut(numeric[0]);
    }
  }
  /* 3b. A NUMBER, THE THING, THEN THE UNIT (FLOW patient-4): "3 neurologist
         visits", "two MRI scans", "5 PT sessions". The number and the unit sat
         one or two words apart, so neither rule above saw them and the line
         read x1. A time word after the number is a span, never this
         ("6 weeks PT sessions" is how long, not how many). */
  if (!times) {
    const spaced = text.match(new RegExp(`\\s(${NUM})\\s+((?:[a-z]+(?:-[a-z]+)*\\s+){1,2}?)(${COUNT_UNITS})\\b`, 'i'));
    if (spaced && !/^(?:years?|months?|weeks?|days?|nights?|hours?|minutes?|miles?|of|or|to|and)\s/i.test(spaced[2])) {
      times = toNum(spaced[1]);
      text = text.replace(spaced[0], ` ${spaced[2]}${spaced[3]} `);
    }
  }
  if (!times) {
    const worded = new RegExp(`\\s(${Object.keys(NUMBER_WORDS).join('|')})(?:\\s+(?:${COUNT_UNITS}|more))?\\b`, 'gi');
    for (const m of Array.from(text.matchAll(worded))) {
      const w = m[1].toLowerCase();
      // "one doctor" is not a count; "once" / "twice" / "three times" are.
      const standalone = /^(once|twice|thrice)$/.test(w) || new RegExp(`\\s(?:${COUNT_UNITS}|more)\\b`, 'i').test(m[0]);
      if (standalone) { times = NUMBER_WORDS[w]; cut(m[0]); break; }
    }
  }
  /* 4a. A NUMBER IN FRONT OF A PLURAL CLINICIAN — "four different specialists",
         "three doctors", "12 specialists". Rule 4 below reads a number in front
         of any plural, but only when the two words touch, so the adjective in
         "four different specialists" hid the count and the line read x1 —
         about $531 of published figure, measured on the deployed preview
         2026-09-09. The clinician noun stays in the phrase so it still matches
         a row; only the number and the adjective come out. */
  if (!times) {
    const clinicians = text.match(new RegExp(`\\s(${NUM})\\s+(?:(?:${COUNT_ADJECTIVES})\\s+)*(${CLINICIAN_PLURALS})\\b`, 'i'));
    if (clinicians) {
      times = toNum(clinicians[1]);
      text = text.replace(clinicians[0], ` ${clinicians[2]} `);
    }
  }

  // 4. A NUMBER IN FRONT OF A PLURAL — "two rheumatologists", "three MRIs".
  //    The number is a count; the noun is what was counted, and it stays in the
  //    phrase so it can still be matched. Time words are excluded: "four years"
  //    is how long the search took, not how many appointments there were.
  if (!times) {
    const plurals = text.match(new RegExp(`\\s(${NUM})\\s+([a-z]{3,}s|cts)\\b`, 'i'));
    // R4 (parent PAR-02): "drove 60 miles each way" was 60 specialist visits
    // ($10,642). Distances, money, ages and clock time are never care.
    if (plurals && !/^(years|months|weeks|days|nights|hours|hrs|minutes|mins|seconds|decades|seasons|miles|kilometers|kilometres|kms|blocks|dollars|bucks|cents|pounds|lbs|kilos|kgs|degrees|percents|points|olds|stairs|steps)$/i.test(plurals[2])) {
      times = toNum(plurals[1]);
      text = text.replace(plurals[0], ` ${plurals[2]} `);
    }
  }

  /* 4b. A NUMBER, SOME WORDS OF HOW IT FELT, THEN THE PLURAL (judge panel #5a):
         "4 expensive brain MRIs", "10 awful physical therapy sessions", "four
         costly MRIs of my brain". Up to three words may sit between; none of
         them may be a time, a measure or a joining word. */
  if (!times) {
    const adj = text.match(new RegExp(`\\s(${NUM})\\s+((?:[a-z]+(?:-[a-z]+)*\\s+){1,3}?)([a-z]{3,}s)\\b`, 'i'));
    const between = adj ? adj[2].trim().split(/\s+/) : [];
    const blocked = /^(?:years?|months?|weeks?|days?|nights?|hours?|hrs?|minutes?|mins?|seconds?|decades?|miles?|kilometers?|kilometres?|kms?|dollars?|bucks|cents?|pounds?|lbs|kilos?|kgs?|degrees?|percent|points?|old|olds|of|or|to|and|than|per|a|an|the|my|her|his|their|our|in|at|for|from|with|by|on|was|were|is|are|i|she|he|we|they|it)$/i;
    const pluralBlocked = /^(years|months|weeks|days|nights|hours|hrs|minutes|mins|seconds|decades|seasons|miles|kilometers|kilometres|kms|blocks|dollars|bucks|cents|pounds|lbs|kilos|kgs|degrees|percents|points|olds|stairs|steps|kids|children|sons|daughters|siblings|pills|meds|medications|supplements)$/i;
    if (adj && between.length && !between.some((w) => blocked.test(w) || new RegExp(`^(?:${NUM})$`, 'i').test(w)) && !pluralBlocked.test(adj[3])) {
      times = toNum(adj[1]);
      text = text.replace(adj[0], ` ${adj[2]}${adj[3]} `);
    }
  }

  const leading = text.match(/^\s*(?:a couple of|couple of|a few|several)\s/i);
  if (leading) { times = leading[0].toLowerCase().includes('couple') ? 2 : 3; text = text.replace(leading[0], ' '); }
  text = text.replace(/^\s*(?:then|and|plus|also|after that|later)\s+/i, ' ');
  text = text.replace(/^\s*(?:a|an|the)\s+/i, ' ');
  if (heldDuration) text = text.replace('~~D~~', heldDuration);
  /* 🔴 "LOTS OF VISITS" IS NOT A NUMBER (FLOW patient-4). It is counted once,
     never guessed upward, and the line asks for the number in her own word. */
  /* JUDGE-6 #9: "over and over" says it happened again and again, with no
     number. It was cut at its "and" and left a chip that read "over". It is
     held whole by spanProtects, taken out of the words the matcher sees, and
     counted once with the same plain ask as "lots of visits". */
  if (!times && !note) {
    const repeated = text.match(/\s(over\s+and\s+over(?:\s+again)?|again\s+and\s+again|time\s+and\s+time\s+again|time\s+after\s+time)\b/i);
    if (repeated) {
      note = `you said “${repeated[1].toLowerCase().replace(/\s+/g, ' ')}”, which is not a number, so it is counted once: change the count to how many there were`;
      text = text.replace(repeated[0], ' ');
    }
  }
  if (!times && !note) {
    const vague = text.match(/\s(lots of|lots|a lot of|so many|many|tons of|loads of|countless|numerous|multiple|a bunch of|endless|too many)\s/i);
    if (vague) note = `you said “${vague[1].toLowerCase().replace(/ of$/, '')}”, which is not a number, so it is counted once: change the count to how many there were`;
  }
  const clamped = Math.max(1, Math.min(365, times || 1));
  if (note && times > 365) note = `${note} (held at the 365 ceiling)`;
  return { text: text.replace(/\s+/g, ' ').trim(), times: clamped, note };
}

/* --------------------------------------------------------------------------
   SPLITTING — one sentence, several events, without cutting a name in half
   -------------------------------------------------------------------------- */

const SPLIT = /\n|[,;:]|\s+(?:then|and then|plus|after that|followed by|and)\s+|\s\/\s|\.\s+/i;

/** Phrases that contain a joining word and must survive the split. */
const PROTECTED_BASE = [
  'with and without contrast', 'with and without dye', 'with and without',
  'abdomen and pelvis', 'nerve and muscle', 'liver and kidney', 'head and neck',
  'antigen and antibody', 'ct and mri',
];

const PROTECT_CACHE = new WeakMap<object, string[]>();

/** Every "<word> and <word>" that the published table itself uses. Derived from
 *  the table so a new row can never be split down the middle by this file. */
export function protectionsFor(table: PriceItem[]): string[] {
  const cached = PROTECT_CACHE.get(table as unknown as object);
  if (cached) return cached;
  const found = new Set(PROTECTED_BASE);
  for (const item of table) {
    for (const cand of [item.label, ...item.synonyms]) {
      const words = normalize(cand).split(' ');
      for (let i = 1; i < words.length - 1; i++) {
        if (/^(and|then|plus)$/.test(words[i])) found.add(`${words[i - 1]} ${words[i]} ${words[i + 1]}`);
      }
    }
  }
  const list = [...found].sort((a, b) => b.length - a.length);
  PROTECT_CACHE.set(table as unknown as object, list);
  return list;
}

/** Split a story into the events it contains. */
export function splitJourney(story: string, protect: string[] = PROTECTED_BASE): string[] {
  let s = story.replace(/\r/g, '');
  const held: string[] = [];
  protect.forEach((p) => {
    const re = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    s = s.replace(re, (hit) => { held.push(hit); return ` ~~P${held.length - 1}~~ `; });
  });
  return s
    .split(SPLIT)
    // The pad the hold added never lands before a full stop: "over and over." stays as typed.
    .map((seg) => seg.replace(/~~P(\d+)~~ (?=[.,;:!?])/g, (_, i) => held[Number(i)] ?? '').replace(/~~P(\d+)~~/g, (_, i) => held[Number(i)] ?? '').replace(/\s+/g, ' ').trim())
    .filter((seg) => seg.length > 1);
}

/* --------------------------------------------------------------------------
   NOTHING THE PERSON TYPED DISAPPEARS
   "saw a neurologist who ordered an MRI of my brain" is two units of care.
   After a phrase matches, whatever it did not use is scanned again.
   -------------------------------------------------------------------------- */

const LEAD_NOISE = /^\s*(?:who|whom|which|that|where|when|and|then|plus|also|later|after|before|so|to|for|the|a|an|of|my|i|was|were|had|have|got|did|ordered|order|sent|send|referred|refer|asked|ask|me|us|it|they|them|he|she)\s+/i;

function stripLead(s: string): string {
  let t = ` ${s.trim()} `.replace(/\s+/g, ' ');
  let before = '';
  while (before !== t) { before = t; t = t.replace(LEAD_NOISE, ' ').replace(/^\s+/, ' '); }
  return t.trim();
}

/** The catalog's own grouping, taken from the shape of its ids: cms-lab-hscrp
 *  and cms-lab-esr are two labs, cms-lab-a1c and cms-99214 are a lab and a
 *  visit. No row is named here — only the shape the file itself uses. */
function family(id: string): string {
  const parts = id.split('-');
  return parts.length > 2 ? parts.slice(0, 2).join('-') : id;
}

/** Every office, new-patient and telehealth visit row (the E/M codes 99202-99215). */
const OFFICE_VISIT = /^cms-99(?:20[1-5]|21[1-5])$/;

/** What is left of a phrase after the words the match already used. */
function residualAfter(text: string, matchedOn: string | null): string {
  if (!matchedOn) return '';
  const used = new Set(tokens(matchedOn));
  if (!used.size) return '';
  const kept = text.replace(/\bphysical therapists?\b/gi, 'physical therapy').split(/\s+/).filter((w) => {
    const t = tokens(w);
    return t.length === 0 || !t.every((x) => used.has(x));
  });
  return stripLead(kept.join(' '));
}

/* JUDGE-6 #10: a residual line quotes the words it came from, cut on a word
   that carries meaning. "A GI doctor finally did an endoscopy" prices the
   endoscopy, and the specialist visit found in what was left kept the
   leftover itself, "GI doctor finally did an", as the words she said. The
   leftover still goes to the matcher whole; the line stores the run of her
   own words with the joining words (articles, prepositions, helping verbs)
   and the time fillers ("finally", "then") taken off both ends, so the
   stored words are already clean before any screen shows them. */
const QUOTE_EDGE = /^(?:a|an|the|of|to|for|with|and|or|but|so|did|do|does|had|has|have|got|get|gets|was|were|is|are|be|been|my|her|his|their|our|your|its|some|any|at|by|from|into|in|on|who|whom|which|that|where|when|then|finally|eventually|later|also|just|even|ever|again|actually|first|ordered|order|sent|referred|ran|run|me|us|him|them|it|i|she|he|we|they)$/i;
function residualQuote(rest: string): string {
  const words = rest.trim().split(/\s+/).filter(Boolean);
  const bare = (w: string) => w.replace(/[^A-Za-z0-9']/g, '');
  while (words.length && QUOTE_EDGE.test(bare(words[words.length - 1]))) words.pop();
  while (words.length && QUOTE_EDGE.test(bare(words[0]))) words.shift();
  const quote = words.join(' ').replace(/^[,;:\s]+|[,;:\s]+$/g, '');
  return contentful(quote) ? quote : rest.trim();
}

function contentful(s: string): boolean {
  return tokens(s).length > 0;
}

/** Joining words that hide a second unit of care inside one phrase:
 *  "saw a neurologist WHO ORDERED an MRI of my brain" is two units, and the
 *  MRI used to vanish in silence. */
const CONNECTORS = /\s+(?:who|whom|which|that|where|and had|and got)\s+/gi;

function connectorPieces(seg: string): string[] {
  CONNECTORS.lastIndex = 0;
  if (!CONNECTORS.test(seg)) return [seg];
  CONNECTORS.lastIndex = 0;
  return seg.split(CONNECTORS).map((p) => p.trim()).filter((p) => p.length > 1);
}

/** One sentence at a time, so a refusal at the end of a sentence governs the
 *  clauses inside it and nothing beyond it. */
const SENTENCE_SPLIT = /(?<=[.!?])\s+|\n+/;

/** A clause that says only that care was RECOMMENDED. It prices when the person
 *  went, and it must not price when the same sentence says they never did:
 *  "my doctor suggested physical therapy and I never went" is one fact, and the
 *  joining word must not turn it into a physical therapy bill. */
const RECOMMENDED = /\b(?:suggested|recommended|referred me (?:to|for)|told me to (?:get|see|have|try)|wanted me to (?:get|see|have|try)|said i should|gave me a referral|wrote me a referral|put me on the (?:wait ?list|waiting list))\b/;

/** True when a clause in this sentence is a bare refusal — it says care did not
 *  happen and names no care of its own, so it is talking about the care its
 *  neighbours name. */
function bareRefusal(seg: string, table: PriceItem[]): boolean {
  const g = gapSignalFor(seg);
  if (!g?.suppressesPrice || g.category !== 'care-not-sought') return false;
  return namesNoCare(seg, table);
}

/** The words that join a refusal to the care the person got instead, inside
 *  one clause: "the neurologist wouldn't see me so I went to the ER", "I went
 *  to urgent care when my doctor wouldn't see me". */
const TURN_SPLIT = /\s+(?:so|but|and so|because|since|after|once|when|instead|which is why)\s+/i;

/** Only the refusal words the person says about care, not about money: "I
 *  couldn't afford it so I went to urgent care" stays one clause, whose cost
 *  cue is the reason for the visit (see COST_CUES). */
function hardRefusal(seg: string): boolean {
  const g = gapSignalFor(seg);
  return !!g?.suppressesPrice && g.category !== 'time-searching' && !COST_CUES.has(g.matchedOn);
}

/**
 * 🔴 A REFUSAL GOVERNS ITS OWN CLAUSE, NOT THE CARE BESIDE IT.
 *
 * "the neurologist wouldn't see me, so I went to the ER" splits at the comma
 * already. Said without the comma it was one clause, and either the refusal
 * swallowed the ER visit, or the turn ("so I went") rescued the neurologist
 * into a priced line. When one side is a refusal that names care of its own and
 * the other side names care that happened, they are two lines: the refusal
 * counted and unpriced, the care priced. Anything less clear stays whole, and
 * the rules in gapSignalFor() decide it as before.
 */
function refusalApart(seg: string, table: PriceItem[]): string[] {
  const m = TURN_SPLIT.exec(seg);
  if (!m) return [seg];
  const left = seg.slice(0, m.index).trim();
  const right = seg.slice(m.index + m[0].length).trim();
  if (!left || !right) return [seg];
  const pricesAlone = (x: string) => !gapSignalFor(x)?.suppressesPrice && !!mapUtterance(x, table).item;
  const refusedCare = (x: string) => hardRefusal(x) && !namesNoCare(x, table);
  if (refusedCare(left) && pricesAlone(right)) return [left, ...refusalApart(right, table)];
  if (pricesAlone(left) && refusedCare(right)) return [left, right];
  return [seg];
}

/* --------------------------------------------------------------------------
   🔴 CONTEXT IS NOT A COST LINE (R4: clinician C04, brainfog BF-19, c1 C7,
   parent PAR-16). "It started in March 2023 after covid.", "symptoms started
   in 2021", "came back negative" and "made the crashes worse" were each
   printed on the sheet as a step of care with "no federal figure exists", and
   counted as steps that "happened". When the search began, what a test showed
   and what a treatment did are the person's story, not care: like a clause
   that only says where she lives, they are never a line.
   -------------------------------------------------------------------------- */

/** When it began. Only when the clause names no care of its own. */
const ONSET =
  /\b(?:started|starts|began|begun|beginning|onset|got sick|fell ill|came on|kicked in|first noticed|first got|since i got|ever since)\b|\bafter (?:i had |i got |getting |catching |having )?(?:covid|the virus|the flu|an infection|my infection|the vaccine|the baby|giving birth|pregnancy)\b/;
/** A time and nothing else: "then did in March", "in 2021", "last spring". */
const TIME_ONLY_WORDS = new Set([
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'spring', 'summer', 'fall', 'autumn', 'winter', 'year', 'month', 'week', 'day', 'ago', 'later', 'earlier',
  'last', 'next', 'then', 'finally', 'eventually', 'did', 'done', 'had', 'got', 'it', 'one', 'time', 'too',
  'early', 'late', 'mid', 'end', 'start', 'since', 'after', 'before', 'during', 'around', 'yrs', 'yr',
  // and the words of a turn that name no care: "then approved it", "she got it on appeal"
  'approved', 'appealed', 'appeal', 'agreed', 'covered', 'paid', 'she', 'he', 'we', 'they', 'them',
  'finally', 'so', 'well', 'anyway', 'ok', 'okay', 'yes', 'also', 'again',
]);
/** What a test showed or what a treatment did. */
const EFFECT =
  / (?:made (?:\w+ ){0,3}(?:worse|better)|didnt help|did not help|helped|did nothing|made no difference|no help|(?:was|were|came back|is|are) (?:all )?(?:negative|positive|normal|abnormal|fine|clear|inconclusive|unremarkable|high|low)|came back|showed (?:nothing|something|a|an|some|that))(?= )/;
export const RESULT_REASON = 'a result, not a unit of care. Tell us the test it came from';

function contextOnly(seg: string, table: PriceItem[]): boolean {
  const hay = flat(seg);
  if (clinicianMentions(seg).length) return false;
  if (ONSET.test(hay) && namesNoCare(seg.replace(/\b(?:after|since) (?:i had |getting |catching )?covid\b/gi, ' '), table)) return true;
  // What a treatment did, with no care named: "the meds made it worse".
  if (EFFECT.test(hay) && namesNoCare(seg, table) && !isResultOnly(seg)) return true;
  const words = hay.trim().split(' ').filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w));
  return words.length > 0 && words.every((w) => TIME_ONLY_WORDS.has(w));
}

/** "blood work", "labs", "blood tests": the words of a draw, naming no test. */
const GENERIC_LAB_WORDS = new Set([
  'blood', 'work', 'test', 'lab', 'draw', 'drawn', 'bloodwork', 'panel', 'routine', 'basic', 'usual',
  'bunch', 'lot', 'load', 'ton', 'much', 'more', 'some', 'run', 'ran', 'check', 'checked', 'like',
  'she', 'he', 'her', 'him', 'his', 'their', 'our', 'we', 'you', 'done', 'drew', 'visit', 'also', 'then',
]);
function genericLab(raw: string): boolean {
  const t = tokens(raw);
  return t.length > 0 && (t.includes('blood') || t.includes('lab')) && t.every((w) => GENERIC_LAB_WORDS.has(w));
}

/* 🔴 A HEART MONITOR'S LENGTH PICKS ITS ROW, OR NONE (R4, brainfog BF-02,
   clinician C08, fedexpert FX-10). "wore a heart monitor for two weeks" was
   the 48-hour Holter, labelled "worn for 48 hours" beside her own words. The
   table has a 48-hour row and a 30-day row and nothing between them (the 3 to
   15 day patch codes are not in it), so a monitor worn longer than two days
   and shorter than a month stays unpriced, by name. It is never moved to the
   nearest row. */
function isWornMonitor(item: PriceItem): 'short' | 'month' | null {
  const l = item.label.toLowerCase();
  if (!/heart (?:event )?monitor|holter/.test(l)) return null;
  if (/48 hours|holter/.test(l)) return 'short';
  if (/30 days?/.test(l)) return 'month';
  return null;
}
function monitorDays(raw: string): { days: number; said: string } | null {
  const q = ` ${normalize(raw).replace(/\b(\d+) ?(day|week|month|hour)s?\b/g, '$1 $2')} `;
  const m = q.match(new RegExp(`\\s(${NUM}|a|an|a couple of|a few|couple of|half a)\\s+(hour|day|night|week|month)s?\\b`, 'i'));
  if (!m) return null;
  const w = m[1].toLowerCase();
  const n = /^(?:a|an)$/.test(w) ? 1 : /couple/.test(w) ? 2 : /few/.test(w) ? 3 : /half/.test(w) ? 0.5 : toNum(w);
  const unit = m[2].toLowerCase();
  const days = unit === 'hour' ? n / 24 : n * (SPAN_DAYS[unit] ?? 1);
  return { days, said: m[0].trim() };
}
/** FINAL-1011 (susan): iCPET, invasive CPET, an invasive cardiopulmonary exercise test. */
const PUSH_THROUGH_ADVICE = / push(?:ed|ing|es)? (?:myself |yourself |herself |himself |themselves |it |on )?through(?= )/;
const IV_WORDS = / (?:iv|i v|intravenous|drip|infusion|line|vein|port|drug|medication|medicine|med|meds|injection|shot)(?= )/;
export const PUSH_THROUGH_REASON =
  'advice to push through is not a unit of care, so it carries no published figure. If it left you worse off, count it under Care that made you worse.';
const INVASIVE_CPET = / (?:icpet|i cpet|invasive (?:cpet|exercise (?:test|testing|stress test)|cardio ?pulmonary exercise (?:test|testing|stress test))|(?:cpet|cardio ?pulmonary exercise test(?:ing)?) with (?:a |an )?(?:right heart )?cath(?:eter|eterization)?)(?= )/;
const UNCARRIED_TREATMENT = / (?:ect|e c t|electroconvulsive(?: therapy| treatments?)?|electro ?shock(?: therapy| treatments?)?|tms|transcranial magnetic stimulation)(?= )/;
export const UNCARRIED_TREATMENT_REASON =
  'a treatment with its own Medicare fee schedule code that this price table does not carry yet, so it stays on the ledger by name, unpriced';
export const INVASIVE_CPET_REASON =
  'invasive exercise test: no single published federal figure for the whole procedure, and the standard exercise test row is not the same test, so this line stays unpriced';
export const MONITOR_GAP_REASON =
  'a heart monitor worn for this long has no row in the published table: it carries one for 48 hours (Holter) and one for 30 days (event monitor), and none in between, so this line stays unpriced';

function monitorByLength(raw: string, r: MapResult, table: PriceItem[]): MapResult {
  if (!r.item) return r;
  const kind = isWornMonitor(r.item);
  if (!kind) return r;
  const d = monitorDays(raw);
  if (!d) return r;
  const want: 'short' | 'month' | null = d.days <= 2 ? 'short' : d.days >= 28 && d.days <= 31 ? 'month' : null;
  if (want === kind) return r;
  const other = want ? table.find((i) => isWornMonitor(i) === want && i.valueUsd !== null) : undefined;
  if (other) return { ...r, item: other, matchedOn: d.said, confidence: 'medium' };
  return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: MONITOR_GAP_REASON, gapCategory: r.gapCategory, months: r.months };
}

/** Phrases that hold a joining word and are one span: "two and a half years",
 *  "a year and a half", "between 2019 and 2023". Found in the person's own
 *  words so the split keeps them whole (judge panel #5c). */
function spanProtects(sentence: string): string[] {
  const res = [
    /\b(?:between|from)\s+(?:[a-z]+\s+)?(?:19|20)\d\d\s+(?:and|to|until|till|through|thru)\s+(?:[a-z]+\s+)?(?:19|20)\d\d\b/gi,
    /\b(?:[a-z]+|\d{1,3})\s+and\s+a\s+half\s+(?:years?|months?|decades?)\b/gi,
    /\ban?\s+(?:year|month|decade)\s+and\s+a\s+half\b/gi,
    // JUDGE-6 #9: a repeat said in words is one phrase, never two clauses.
    /\b(?:over\s+and\s+over|again\s+and\s+again|time\s+and\s+time\s+again)\b/gi,
  ];
  return res.flatMap((re) => sentence.match(re) ?? []);
}

/** Words that may sit around a span of the search without being care. */
const SPAN_FILLER = new Set([
  'sick', 'ill', 'symptom', 'started', 'start', 'began', 'begun', 'onset', 'first', 'noticed', 'came', 'on',
  'diagnosed', 'diagnosis', 'dx', 'finally', 'answer', 'name', 'found', 'figured', 'out', 'knew', 'got',
  'when', 'was', 'were', 'age', 'aged', 'at', 'turned', 'until', 'by', 'it', 'all', 'this', 'thi', 'that',
  'searching', 'looking', 'trying', 'figure', 'what', 'wrong', 'year', 'month', 'old', 'still', 'getting',
  'my', 'her', 'his', 'their', 'daughter', 'son', 'kid', 'child', 'she', 'he', 'they', 'we', 'i', 'me',
  'with', 'and', 'from', 'to', 'between', 'in', 'since', 'then', 'after', 'having', 'had', 'have',
]);

const SINCE_ILL = / (?:sick|ill|unwell|symptoms?|searching|looking for answers|struggling|suffering|going on|been like this|started|began|this|it all) (?:\w+ ){0,2}?since /;

/** A clause that is ONLY a span of the search: the span is read, and what is
 *  left names neither care nor anything else (a condition's name is allowed). */
function spanOnly(seg: string, table: PriceItem[], story: string): { months: number; said: string } | null {
  const hay = flat(seg);
  /* FINAL-1011 reader (c): "sick since 2022", "been searching since March 2021"
     is the search to today, counted from the END of that year when no month is
     said. Only beside a word of being ill or of searching: "on gabapentin since
     2022" is how long a medicine was taken, never the search. */
  const span = searchSpan(hay, new Date(), story) ?? (SINCE_ILL.test(hay) ? sinceMonths(hay) : null);
  if (!span) return null;
  const rest = hay.replace(` ${span.said} `, ' ').replace(new RegExp(CONDITION_NAME.source, 'g'), ' ');
  const left = rest.split(' ').filter((w) => w && !STOP.has(w) && !COUNT_NOISE.has(w) && !/^\d+$/.test(w)).map(singular)
    .filter((w) => !TIME_FILLER.has(w) && !SPAN_FILLER.has(w));
  if (left.length && !namesNoCare(left.join(' '), table)) return null;
  if (left.length > 3) return null;
  return span;
}

/** A span said beside care in the same clause: "between 2019 and 2023 I saw a
 *  rheumatologist 4 times", "saw 8 different doctors over 7 years". The care
 *  is read as before; the span is counted beside it. Only years and decades
 *  said after "over", "across" or "spanning" count this way, so "a heart
 *  monitor for two weeks" stays how long the monitor was worn. */
function spanBeside(seg: string, story: string): { months: number; said: string } | null {
  const hay = flat(seg);
  const span = searchSpan(hay, new Date(), story);
  if (span) return span;
  const m = hay.match(new RegExp(` (?:over|across|spanning) (?:the (?:past|last) )?(?:about |almost |nearly |more than |around )?(${NUM}|a|an)( and a half)? (year|decade)s?( and a half)?(?= )`));
  if (!m) return null;
  const n = (/^(a|an)$/.test(m[1]) ? 1 : toNum(m[1])) + (m[2] || m[4] ? 0.5 : 0);
  return { months: monthsOfSpan(n, m[3]), said: m[0].trim() };
}

/** JUDGE-5 #5: true when a phrase holds only joining, counting and time words. */
function fillerOnly(text: string): boolean {
  return normalize(text).split(' ').filter(Boolean).map(singular)
    .every((w) => STOP.has(w) || COUNT_NOISE.has(w) || TIME_FILLER.has(w) || JOIN_WORDS.has(w) || FILLER_EXTRA.has(w) || /^\d+$/.test(w));
}
const FILLER_EXTRA = new Set(['all', 'in', 'then', 'more', 'just', 'so', 'really', 'even', 'like', 'total', 'altogether', 'overall', 'basically', 'anyway', 'some']);

/* FLOW4 flow4-4 (2026-10-01): A COUNT SAID AFTER A COMMA. "my GP kept saying
   stress, maybe 8 visits" priced the GP once and left "maybe 8 visits ×8" as a
   line with no figure: 7 of her 8 visits gone. When a clause is only a hedge, a
   number and a visit word, and the clause before it in the same sentence names
   care and says no count of its own, the two are read as one clause, in her own
   words, and the line says where its count came from. */
const BARE_COUNT = new RegExp(`^(?:(?:maybe|about|around|like|probably|roughly|approximately|almost|nearly|over|at least)\\s+)?(${NUM})\\s+(?:visits?|times|appointments?)[.!?]?$`, 'i');
/* JUDGE-6 #9: "physical therapy for 6 weeks, 2x a week" read x1 and left a
   chip "2x a week", while "2x a week for 6 weeks" read x12. A clause that is
   only how often ("2x a week", "twice a week", "weekly"), after a clause that
   names care for a length of time and says no count of its own, is the same
   rate times span said in the other order. The two are read as one clause and
   the count reader puts its own arithmetic on the line. */
function bareFrequency(seg: string): boolean {
  const t = ` ${seg.trim().replace(/[.!?]$/, '')} `;
  const f = readFrequency(t);
  if (!f) return false;
  return /^(?:\s|about|around|roughly|maybe|like|usually|then|and|so|at|least|most|first|after|that)*$/i.test(t.replace(f.said, ' ').replace(/\s+/g, ' '));
}

function countAfterComma(segs: string[], table: PriceItem[]): { segs: string[]; notes: Map<string, string> } {
  const notes = new Map<string, string>();
  const outSegs: string[] = [];
  for (const seg of segs) {
    const m = BARE_COUNT.exec(seg.trim());
    const prev = outSegs[outSegs.length - 1];
    if (!m && prev !== undefined && bareFrequency(seg) && readDuration(` ${prev} `, true) && !readFrequency(` ${prev} `)) {
      const own = extractCount(prev);
      if (own.times === 1 && !gapSignalFor(prev)?.suppressesPrice && !namesNoCare(own.text || prev, table)) {
        outSegs[outSegs.length - 1] = `${prev.replace(/[,;:]\s*$/, '')}, ${seg.trim()}`;
        continue;
      }
    }
    if (m && prev !== undefined) {
      const own = extractCount(prev);
      if (own.times === 1 && !own.note && !gapSignalFor(prev)?.suppressesPrice && !namesNoCare(own.text || prev, table)) {
        const joined = `${prev.replace(/[,;:]\s*$/, '')}, ${seg.trim()}`;
        outSegs[outSegs.length - 1] = joined;
        notes.set(joined, `${toNum(m[1])}, from “${seg.trim().replace(/[.!?]$/, '')}”`);
        continue;
      }
    }
    outSegs.push(seg);
  }
  return { segs: outSegs, notes };
}

export function parseJourney(story: string, table: PriceItem[]): ParsedSegment[] {
  const before = patientRelative;
  patientRelative = relativeAsPatient(String(story ?? ''), String(story ?? '').split(/[.!?;,\n]+/));
  try {
    return parseJourneyRead(story, table);
  } finally {
    patientRelative = before;
  }
}

function parseJourneyRead(story: string, table: PriceItem[]): ParsedSegment[] {
  const out: ParsedSegment[] = [];
  const protect = protectionsFor(table);
  // Units already priced earlier in the story: "the lupus test was negative"
  // after "blood work for lupus" is the same test, restated, not a second one.
  const storyPriced = new Set<string>();
  /* judge panel #5c: an age span is often said across a full stop ("I got sick
     when I was 12. Diagnosed at 19."). It is held as one piece before the story
     is cut into sentences, and the words come back unchanged. */
  const ageHeld: string[] = [];
  const hold = (hit: string) => { ageHeld.push(hit); return `zzagespan${ageHeld.length - 1}zz`; };
  /* JUDGE-7 #8: a list typed as "Dr. visits: 12. Labs: 8. MRIs: 2." was cut at
     "Dr." and at each colon into junk chips ("Dr.", "visits", "12."). Each
     "label: number" item is held whole, its "Dr." with it, and read by
     extractCount as the label ×number. */
  const told = String(story ?? '')
    .replace(LIST_ITEM, hold)
    // "Dr. Smith" is a name, never the end of a sentence.
    .replace(/\b(?:[Dd]rs?|[Mm]rs?|[Mm]s)\.(?=\s+[A-Z])/g, hold)
    .replace(new RegExp(AGE_SPAN.source, 'gi'), hold).replace(new RegExp(AGE_NOW_SPAN.source, 'gi'), hold);
  const unhold = (x: string) => x.replace(/zzagespan(\d+)zz/g, (_, i) => ageHeld[Number(i)] ?? '').replace(/\s+/g, ' ').trim();
  for (const sentence of told.split(SENTENCE_SPLIT)) {
  const { segs, notes: countNotes } = countAfterComma(
    splitJourney(sentence, [...spanProtects(sentence), ...protect]).map(unhold).filter((x) => x.length > 1).flatMap((x) => refusalApart(x, table)),
    table,
  );
  const abandoned = segs.some((x) => bareRefusal(x, table));
  const sentenceStart = out.length;
  const sentencePriorPriced = new Set(storyPriced);
  for (const seg of segs) {
    // A clause that only says WHERE the person lives is context for the fit, never a line on the
    // journey (state lane, 2026-09-09: "I live in Houston." was printing as an unpriced chip).
    // Nor is one that only says WHEN it began (R4).
    /* judge panel #5c: a clause that only says how long the search went
       ("from 2015 to 2022", "got sick at 12, diagnosed at 19", "it started in
       2016") is Time spent searching, counted and never priced. */
    const spanned = spanOnly(seg, table, story);
    if (spanned) {
      out.push({ raw: seg, times: 1, result: gapResult({ category: 'time-searching', matchedOn: spanned.said, months: spanned.months, suppressesPrice: true }), countNote: null });
      continue;
    }
    if (placeOnlyPhrase(seg) || contextOnly(seg, table)) continue;

    /* 🔴 Recommended care, in a sentence that also says they never went. The
       clause is counted as care not received and never priced. */
    if (abandoned && RECOMMENDED.test(flat(seg))) {
      const c = extractCount(seg);
      const cue = RECOMMENDED.exec(flat(seg));
      out.push({
        raw: seg,
        times: c.times,
        result: gapResult({ category: 'care-not-sought', matchedOn: cue ? cue[0] : 'never went', months: null, suppressesPrice: true }),
        countNote: c.note,
      });
      continue;
    }
    /* 🔴 The whole segment is read for a refusal, a denial or a bare span BEFORE
       it is cut at its joining words. Otherwise "the specialist that I never
       saw" splits into "the specialist" and prices a visit that never happened,
       which is the exact contradiction of the home page's own headline. */
    const segGap = gapSignalFor(seg);
    if (segGap?.suppressesPrice) {
      const c = extractCount(seg);
      out.push({ raw: seg, times: c.times, result: gapResult(segGap), countNote: c.note });
      continue;
    }
    const startedAt = out.length;
    const pieces = connectorPieces(seg);
    const read = (p: string) => {
      /* A number of nerves is not a number of visits: "they tested four nerves"
         is one study of four nerves, never four studies. The number is read by
         the conduction rule and kept out of the count. */
      const nerves = namesConduction(p) ? nervesSaid(p) : null;
      if (nerves) {
        const c = extractCount(` ${normalize(p)} `.replace(` ${nerves.said} `, ' '));
        const result = mapUtterance(p, table);
        return { raw: p, ...c, note: result.item ? c.note : null, result };
      }
      const c = extractCount(p);
      const result = monitorByLength(p, mapUtterance(c.text || p, table), table);
      // A monitor with no row carries no count note: there is nothing to count.
      return { raw: p, ...c, note: result.reason === MONITOR_GAP_REASON ? null : c.note, result };
    };
    let parsed = pieces.map(read);
    if (pieces.length > 1 && !parsed.some((p) => p.result.item)) {
      // The joining word hid nothing. Keep the person's phrase whole.
      parsed = [read(seg)];
    } else if (pieces.length > 1 && parsed.filter((p) => p.result.item).length === 1) {
      /* 🔴 "a colonoscopy where they took out a polyp" is ONE unit of care, and
         it is the one with the polyp in it. Cutting at "where" first hid the
         polyp from the matcher and priced the plain scope. So the whole clause
         is read too, and it takes the line when it finds a DIFFERENT row than
         the piece did. The pieces that named nothing stay, unpriced: nothing
         typed ever disappears. */
      const only = parsed.find((x) => x.result.item)!;
      const whole = read(seg);
      if (whole.result.item && whole.result.item.id !== only.result.item!.id) {
        parsed = [whole, ...parsed.filter((x) => !x.result.item && contentful(x.raw))];
      }
    }
    if (pieces.length > 1 && parsed.length > 1) {
      /* 🔴 Two pieces of one clause that name the same KIND of unit are one
         unit said twice: "a colonoscopy where they took out a polyp" cut into
         "a colonoscopy" and "they took out a polyp" priced two procedures. Read
         whole, the clause names the one with the polyp in it. */
      const found = parsed.filter((x) => x.result.item);
      const families = new Set(found.map((x) => family(x.result.item!.id)));
      if (found.length > 1 && families.size < found.length) {
        const whole = read(seg);
        if (whole.result.item) parsed = [whole, ...parsed.filter((x) => !x.result.item && contentful(x.raw))];
      }
      // Drop the fragments that are only joining words. A fragment carrying the
      // person's own words stays, priced or not — nothing typed disappears.
      if (parsed.length > 1) parsed = parsed.filter((p) => p.result.item || tokens(p.raw).length > 0);
    }

    const seen = new Set<string>();
    const pricedKinds = new Set<ClinicianKind>();
    for (const p of parsed) {
      const rows: ParsedSegment[] = [{ raw: p.raw, times: p.times, result: p.result, countNote: p.note }];
      if (p.result.item) {
        seen.add(p.result.item.id);

        // Whatever the match did not use, scanned again — up to three more units.
        // A second line is only worth printing when it is a different unit of care,
        // matched on more than one shared word, from a phrase with something left
        // in it. Anything weaker is a guess, and a guess here prints a real
        // federal figure for care that never happened.
        /* 🔴 A VISIT DOES NOT SWALLOW THE TESTS IT ORDERED. "my pcp ordered
           a1c" left the residual "a1c" — one token — and the old floor of two
           tokens dropped it, so the person saw an office visit and no test.
           One word is enough when the match is not a guess: the confidence
           check below still refuses anything that landed on a single shared
           word rather than on the term itself. */
        let rest = residualAfter(p.text || p.raw, p.result.matchedOn);
        for (let i = 0; i < 3 && rest && tokens(rest).length >= 1; i++) {
          const more = extractCount(rest);
          /* flow3-8: the rules' own confidence decides; the plain-variant default comes after. */
          const m0 = mapUtteranceRules(more.text || rest, table);
          if (!m0.item || m0.confidence === 'low') break;
          const m = plainVariant(m0, more.text || rest, table);
          if (!m.item || seen.has(m.item.id)) break;
          /* 🔴 One test, named twice, is one test. "the high sensitivity version
             of the inflammation test" left the residual "inflammation test",
             which is the same test's plain name — and printed a second federal
             figure beside the first. A residual only prints when it names a
             different KIND of unit than the line it came from, read off the
             catalog's own id families rather than off any row named here. */
          if (family(m.item.id) === family(p.result.item.id)) break;
          /* 🔴 One visit is one visit (R4, clinician C01): "a video visit with a
             long covid clinic" priced 99213 AND 99205 from its own residual,
             because the office-visit codes do not share an id prefix. Every
             office or new-patient visit row is one kind here. */
          if (OFFICE_VISIT.test(m.item.id) && OFFICE_VISIT.test(p.result.item.id)) break;
          seen.add(m.item.id);
          rows.push({ raw: residualQuote(rest), times: more.times, result: m, countNote: more.note });
          rest = residualAfter(more.text || rest, m.matchedOn);
        }
        /* 🔴 "an EMG with nerve conduction" is two services in one clause: the
           needle EMG and the conduction study. The EMG took the line; the
           conduction study is its own line, priced only when the number of
           nerves was said, otherwise shown unpriced by name. */
        const conduction = rows.some((r) => isConductionRow(r.result)) ? null : conductionBeside(p.raw, table);
        if (conduction) rows.push(conduction);
      }

      /* 🔴 The clinician the person named is a visit, and the test they ordered
         is a test. Both, or the sentence comes back smaller than it was typed.
         `pricedKinds` carries across the pieces of one clause, so "my primary
         care doctor sent me to a neurologist who did an MRI" prices the PCP
         visit once, the specialist visit once, and the MRI once. */
      for (const row of withClinicianVisits(p.raw, rows, table, pricedKinds).flatMap((r) => splitReturnVisits(r, table))) {
        if (row.result.item) seen.add(row.result.item.id);
        out.push(row);
      }
    }

    /* One sentence, one dismissal. A residual line repeats the person's words,
       and counting "they said it was anxiety" twice would inflate the one count
       no federal file holds. The first line of the segment keeps it. */
    let held = false;
    for (let i = startedAt; i < out.length; i++) {
      const r = out[i].result;
      if (!r.gapCategory) continue;
      if (held) out[i] = { ...out[i], result: { ...r, gapCategory: null, months: null } };
      held = true;
    }

    /* 🔴 A wait said in the middle of a clause that also names real care: the
       care prices, and the wait is counted beside it. It is added AFTER the
       rule above, which keeps one gap per sentence — a dismissal and a wait are
       two different facts and the sentence holds both. */
    // "took 2 weeks off work" is work lost, counted on the workdays card, not a wait.
    const wait = lostWorkPhrase(seg) ? null : (waitSpan(seg) ?? spanBeside(seg, story));
    const alreadySpanned = out.slice(startedAt).some((x) => x.result.gapCategory === 'time-searching');
    /* JUDGE-5 #5: the wait took the clause's only content. A line left beside
       it that holds no unit and only joining or time words ("it took 2 years
       all in all") is the same words again with "not read as care"; it goes,
       and the wait line carries her whole clause. */
    const echo = wait && !alreadySpanned
      && out.slice(startedAt).every((x) => !x.result.item && !x.result.gapCategory)
      && fillerOnly(` ${normalize(seg)} `.replace(` ${normalize(wait.said)} `, ' '));
    if (echo) out.splice(startedAt);
    if (wait && !alreadySpanned) {
      const waited: ParsedSegment = {
        raw: echo ? seg : wait.said,
        times: 1,
        result: gapResult({ category: 'time-searching', matchedOn: wait.said, months: wait.months, suppressesPrice: true }),
        countNote: null,
      };
      const q = ` ${normalize(seg)} `;
      const at = q.indexOf(` ${normalize(wait.said)} `);
      if (namedFirst(q, at < 0 ? 0 : at, out.slice(startedAt))) out.splice(startedAt, 0, waited);
      else out.push(waited);
    }
  }

  /* JUDGE-5 #5: a fragment of only joining or time words ("and then some
     more") beside other lines of the same sentence is not a line of its own. */
  {
    const here0 = out.slice(sentenceStart);
    if (here0.length > 1) {
      const kept = here0.filter((x) => x.result.item || x.result.gapCategory || x.result.months != null || !fillerOnly(x.raw));
      if (kept.length && kept.length < here0.length) out.splice(sentenceStart, here0.length, ...kept);
    }
  }
  /* 🔴 Once a sentence has priced care, the fragments beside it that only
     say how she felt, what a test showed or what a treatment did are the
     story around that care, never a line of their own (R4, context above).
     A standalone "I was exhausted" still comes back, with its reason. And a
     test named again only to give its result is the same test. */
  const here = out.slice(sentenceStart);
  if (here.some((x) => x.result.item)) {
    const keep: ParsedSegment[] = [];
    for (let i = 0; i < here.length; i++) {
      const x = here[i];
      const r = x.result;
      const said = flat(x.raw);
      if (!r.item && !r.gapCategory && r.months == null) {
        if (r.reason === SYMPTOM_REASON || r.reason === RESULT_REASON) continue;
        /* "the tilt table test that insurance denied at first, then did in
           March": the test prices once, and the denial it went through is
           still counted, in her words, never priced (parent PAR-07). */
        const refused = firstCue(said, DENIED) ?? refusalVerb(said);
        if (refused && namesNoCare(x.raw, table)) {
          keep.push({ ...x, result: gapResult({ category: 'care-denied', matchedOn: refused, months: null, suppressesPrice: true }) });
          continue;
        }
        if (EFFECT.test(said) && namesNoCare(x.raw.replace(/\b(?:crash|crashes|pain|symptoms?|fatigue)\b/gi, ' '), table)) continue;
      }
      if (r.item && !r.gapCategory && EFFECT.test(said) && sentencePriorPriced.has(r.item.id)) continue;
      if (r.item && !r.gapCategory && EFFECT.test(said) && keep.some((k) => k.result.item?.id === r.item!.id)) continue;
      /* "blood work: a CBC, a metabolic panel and a lipid panel" named the
         tests after a colon; the words before it are their heading, and a CBC
         counted for the heading AND for "a CBC" was one test priced twice
         (fedexpert FX-08). */
      const next = here[i + 1];
      if (r.item && genericLab(x.raw) && next?.result.item && next.result.item.id.startsWith('cms-lab-')
        && new RegExp(`${x.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:\u2014\u2013-]`, 'i').test(sentence)) continue;
      keep.push(x);
    }
    out.splice(sentenceStart, out.length - sentenceStart, ...keep);
  }
  for (const x of out.slice(sentenceStart)) {
    const fromComma = countNotes.get(x.raw);
    if (fromComma && x.result.item && !x.countNote) x.countNote = fromComma;
    if (x.result.item && genericLab(x.raw) && !x.countNote && x.result.item.id.startsWith('cms-lab-')) {
      x.countNote = `“${x.raw.trim()}” names no single test, so it is counted as one ${x.result.item.label.toLowerCase()}, the most common one. Add the tests you remember`;
    }
    if (x.result.item) storyPriced.add(x.result.item.id);
  }
  }
  return out;
}



/* ── The AI reader, from the browser ─────────────────────────────────────────
   POST /api/map runs these same rules on the server, then lets a model fill
   only the phrases the rules left blank, only with an id the catalog holds.
   Offline, or on any error, the rules' answer stands. Prices never travel:
   the reply carries ids and this side prices them from the same table. */
export interface ModelRead { segments: ParsedSegment[]; model: string | null }

export async function parseJourneyWithModel(
  story: string,
  table: PriceItem[],
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ModelRead> {
  const local = parseJourney(story, table);
  if (!story.trim()) return { segments: local, model: null };
  try {
    const r = await fetchImpl('/api/map', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ story }),
      signal,
    });
    if (!r.ok) return { segments: local, model: null };
    const data = (await r.json()) as { ok?: boolean; model?: string | null; segments?: import('./map-model').WireSegment[] };
    if (!data.ok || !Array.isArray(data.segments)) return { segments: local, model: null };
    const { fromWire } = await import('./map-model');
    return { segments: fromWire(data.segments, table), model: data.model ?? null };
  } catch {
    return { segments: local, model: null };
  }
}

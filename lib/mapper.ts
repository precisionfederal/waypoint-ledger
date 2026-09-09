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
]);

/** Short forms people actually say, expanded before matching. Words only, never prices. */
const ALIASES: [RegExp, string][] = [
  [/\b(?:er|a&e|emergency|emergency dept|emergency department)\b/g, 'emergency room'],
  [/\bekg\b/g, 'ecg'],
  [/\bpcp\b/g, 'regular doctor'],
  [/\bgp\b/g, 'regular doctor'],
  [/\bcat scan\b/g, 'ct scan'],
  [/\bbloods\b/g, 'blood work'],
  [/\blabs\b/g, 'blood work'],
  [/\bbloodwork\b/g, 'blood work'],
  [/\blab work\b/g, 'blood work'],
  [/\bphysio(?:therapy)?\b/g, 'physical therapy'],
  [/\btelehealth\b/g, 'video visit'],
  [/\btelemedicine\b/g, 'video visit'],
];

function normalize(s: string): string {
  let t = s
    .toLowerCase()
    .replace(/[^a-z0-9&\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
const SPAN_DAYS: Record<string, number> = { day: 1, night: 1, week: 7, month: 30.4375, year: 365.25 };

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
  'dizzy', 'dizziness', 'lightheaded', 'faint', 'fainting', 'nausea', 'nauseous', 'nauseated',
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
  'a symptom, not a unit of care — the visit or test it led to is what carries a published figure';
export const NO_MATCH_REASON =
  'no unit of care in the published table matches these words, so this line stays on the journey unpriced';

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
}

export const NOT_RECEIVED_REASON =
  'care you needed and did not get — counted, never priced. No federal file records it.';
export const DENIED_REASON =
  'care you asked for and were refused — counted, never priced. No federal file records it.';
export const DURATION_REASON =
  'a length of time, not a unit of care — tell us the visits and tests inside it';
export const DISMISSAL_REASON =
  'being told it was nothing is a real event with no billing code — counted, never priced';

/** Apostrophes dropped, everything else collapsed to single spaces, padded both
 *  ends. A cue is written once and matches "didn't", "didn’t" and "did not". */
function flat(s: string): string {
  return ` ${s.toLowerCase().replace(/['‘’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

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
];

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
];

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
  const m = q.match(new RegExp(`\\s(${WAIT_VERBS})\\s+(?:${hedge})?(${NUM}|a|an)\\s+(week|month|year)s?\\b`, 'i'));
  if (!m) return null;
  const n = /^(a|an)$/i.test(m[2]) ? 1 : toNum(m[2]);
  return { months: monthsOfSpan(n, m[3].toLowerCase()), said: m[0].trim() };
}

/**
 * Read a phrase for the counts no federal file holds.
 *
 * Returns null for an ordinary unit of care — the overwhelming majority. When
 * it returns a signal with `suppressesPrice`, the caller must not price the
 * phrase at all, however well it matches a row.
 */
export function gapSignalFor(raw: string): GapSignal | null {
  const hay = flat(raw);
  if (hay.trim().length === 0) return null;

  const notSought = firstCue(hay, NOT_SOUGHT);
  const denied = firstCue(hay, DENIED);
  const cue = notSought ?? denied;
  if (cue) {
    // "I put it off for a year and finally had the MRI" is not a gap. Only a
    // turn AFTER the refusal counts; "finally gave up" is still a gap.
    const at = hay.indexOf(` ${cue} `);
    const turned = WENT_ANYWAY.some((w) => {
      const i = hay.indexOf(` ${w} `);
      return i > -1 && i > at;
    });
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

  const span = durationOnly(raw);
  if (span) {
    return { category: 'time-searching', matchedOn: span.said, months: span.months, suppressesPrice: true };
  }

  const told = firstCue(hay, DISMISSED);
  if (told) return { category: 'dismissed', matchedOn: told, months: null, suppressesPrice: false };

  return null;
}

/** The reason a suppressed phrase carries, in the person's own terms. */
function gapReason(category: GapCategory): string {
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
    reason: gapReason(signal.category),
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
      reason: `${m.noun} — ${NO_SECOND_VISIT_REASON}`,
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

/**
 * Map a plain-language utterance onto a unit of care.
 * Returns null below the confidence floor — a miss is reported honestly rather
 * than forced onto the nearest item, because a wrong mapping produces a real
 * price for something that never happened.
 */
export function mapUtterance(raw: string, table: PriceItem[]): MapResult {
  const q = normalize(raw);
  if (!q) return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: 'there is nothing here to match', gapCategory: null, months: null };

  /* 🔴 Before anything is matched: care that did not happen, and a bare length
     of time, are never priced. This runs first because a refused specialist
     visit matches the specialist row perfectly. */
  const gap = gapSignalFor(raw);
  if (gap?.suppressesPrice) return gapResult(gap);
  const carried = { gapCategory: gap?.category ?? null, months: gap?.months ?? null };

  if (isSymptomOnly(raw)) return { item: null, score: 0, matchedOn: null, confidence: 'none', reason: SYMPTOM_REASON, ...carried };

  const qt = tokens(raw);
  let best: PriceItem | null = null;
  let bestScore = 0;
  let bestOn: string | null = null;
  let bestKind: MatchKind = 'none';
  let bestHits = 0;

  for (const item of table) {
    const candidates = [item.label, ...item.synonyms];
    for (const cand of candidates) {
      const c = normalize(cand);
      let score = 0;
      let kind: MatchKind = 'none';
      let hits = 0;

      if (q === c) {
        score = 100; kind = 'exact';
      } else if (c.length >= 4 && q.includes(c)) {
        score = 70 + Math.min(c.length, 25); kind = 'contains';
      } else if (q.length >= 4 && c.includes(q)) {
        score = 62 + Math.min(q.length, 25); kind = 'contained';
      } else {
        const ct = tokens(cand);
        if (ct.length) {
          hits = ct.filter((w) => qt.includes(w)).length;
          if (hits) {
            // proportion of the candidate matched, scaled
            score = Math.round((hits / ct.length) * 55) + hits * 6;
            kind = 'overlap';
          }
        }
      }

      if (score > bestScore) {
        bestScore = score; best = item; bestOn = cand; bestKind = kind; bestHits = hits;
      }
    }
  }

  // Confidence floor. Below this we report a miss rather than guess.
  const FLOOR = 42;
  if (bestScore < FLOOR || !best) {
    // A dismissal that matched no row still says why it carries no figure.
    return { item: null, score: bestScore, matchedOn: null, confidence: 'none', reason: gap ? gapReason(gap.category) : NO_MATCH_REASON, ...carried };
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
  const tail = `(${NUM}|a|an)\\s+(day|week|month|year)s?\\b`;
  const m = text.match(new RegExp(`\\s${lead}${hedge}${tail}`, 'i'))
        ?? (loose ? text.match(new RegExp(`\\s${hedge}(${NUM})\\s+(day|week|month|year)s?\\b`, 'i')) : null);
  if (!m) return null;
  const n = /^(a|an)$/i.test(m[1]) ? 1 : toNum(m[1]);
  const unit = m[2].toLowerCase();
  return { days: n * SPAN_DAYS[unit], said: m[0].trim(), unit, n };
}

/**
 * Pull a count out of a phrase and return the phrase without it.
 *
 * Everything here reads what the person actually wrote. Where it takes
 * arithmetic ("twice a week for six months"), the arithmetic comes back in
 * `note` so the line can show its work and the person can correct the count.
 */
export function extractCount(phrase: string): CountResult {
  let text = ` ${phrase.trim().replace(/\s+/g, ' ')} `;
  let times = 0;
  let note: string | null = null;
  const cut = (s: string) => { text = text.replace(s, ' '); };

  // 1. A RANGE — "four or five", "3 to 5". Take the LOWER number: a person's own
  //    uncertainty is never rounded up into more care than they said they had.
  const range = text.match(new RegExp(`\\s(${NUM})\\s*(?:or|to|-)\\s*(${NUM})\\b`, 'i'));
  if (range) {
    const lo = Math.min(toNum(range[1]), toNum(range[2]));
    const hi = Math.max(toNum(range[1]), toNum(range[2]));
    times = lo;
    note = `you said ${range[1]} or ${range[2]} — counted as ${lo}, the lower of the two (change it if ${hi} is right)`;
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
      note = `${freq.said}, counted over one year = ${times} — change the count if that is not your year`;
      cut(freq.said);
    }
  }

  // "a dozen", "half a dozen" — read before the number words, or "half a dozen
  //  times" loses its "half".
  if (!times) {
    const dozen = text.match(/\s(half\s+a\s+|a\s+)?dozen\b/i);
    if (dozen) { times = /half/i.test(dozen[0]) ? 6 : 12; cut(dozen[0]); }
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
    const plurals = text.match(new RegExp(`\\s(${NUM})\\s+([a-z]{3,}s)\\b`, 'i'));
    if (plurals && !/^(years|months|weeks|hours|minutes|decades|seasons)$/i.test(plurals[2])) {
      times = toNum(plurals[1]);
      text = text.replace(plurals[0], ` ${plurals[2]} `);
    }
  }

  const leading = text.match(/^\s*(?:a couple of|couple of|a few|several)\s/i);
  if (leading) { times = leading[0].toLowerCase().includes('couple') ? 2 : 3; text = text.replace(leading[0], ' '); }
  text = text.replace(/^\s*(?:then|and|plus|also|after that|later)\s+/i, ' ');
  text = text.replace(/^\s*(?:a|an|the)\s+/i, ' ');
  const clamped = Math.max(1, Math.min(365, times || 1));
  if (note && clamped !== times) note = `${note} (held at the 365 ceiling)`;
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
    .map((seg) => seg.replace(/~~P(\d+)~~/g, (_, i) => held[Number(i)] ?? '').replace(/\s+/g, ' ').trim())
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

/** What is left of a phrase after the words the match already used. */
function residualAfter(text: string, matchedOn: string | null): string {
  if (!matchedOn) return '';
  const used = new Set(tokens(matchedOn));
  if (!used.size) return '';
  const kept = text.split(/\s+/).filter((w) => {
    const t = tokens(w);
    return t.length === 0 || !t.every((x) => used.has(x));
  });
  return stripLead(kept.join(' '));
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

export function parseJourney(story: string, table: PriceItem[]): ParsedSegment[] {
  const out: ParsedSegment[] = [];
  for (const seg of splitJourney(story, protectionsFor(table))) {
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
    const read = (p: string) => { const c = extractCount(p); return { raw: p, ...c, result: mapUtterance(c.text || p, table) }; };
    let parsed = pieces.map(read);
    if (pieces.length > 1 && !parsed.some((p) => p.result.item)) {
      // The joining word hid nothing. Keep the person's phrase whole.
      parsed = [read(seg)];
    } else if (pieces.length > 1) {
      // Drop the fragments that are only joining words. A fragment carrying the
      // person's own words stays, priced or not — nothing typed disappears.
      parsed = parsed.filter((p) => p.result.item || tokens(p.raw).length > 0);
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
        let rest = residualAfter(p.text || p.raw, p.result.matchedOn);
        for (let i = 0; i < 3 && rest && tokens(rest).length >= 2; i++) {
          const more = extractCount(rest);
          const m = mapUtterance(more.text || rest, table);
          if (!m.item || m.confidence === 'low' || seen.has(m.item.id)) break;
          seen.add(m.item.id);
          rows.push({ raw: rest, times: more.times, result: m, countNote: more.note });
          rest = residualAfter(more.text || rest, m.matchedOn);
        }
      }

      /* 🔴 The clinician the person named is a visit, and the test they ordered
         is a test. Both, or the sentence comes back smaller than it was typed.
         `pricedKinds` carries across the pieces of one clause, so "my primary
         care doctor sent me to a neurologist who did an MRI" prices the PCP
         visit once, the specialist visit once, and the MRI once. */
      for (const row of withClinicianVisits(p.raw, rows, table, pricedKinds)) {
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
    const wait = waitSpan(seg);
    const alreadySpanned = out.slice(startedAt).some((x) => x.result.gapCategory === 'time-searching');
    if (wait && !alreadySpanned) {
      const waited: ParsedSegment = {
        raw: wait.said,
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

/* ==========================================================================
   READING THE PLACE OUT OF THE STORY — lib/state-detect.ts

   A federal figure is only "yours" if it is priced where you live. CMS pays a
   different allowed amount in Houston than in Rest of Texas, and the ledger
   already knows all 109 localities. The gap was that a person had to find a
   54-option select and answer a question they had no reason to care about,
   while their own sentence usually said it already: "I live in Houston",
   "we moved to Iowa in 2023", "the neurologist in Boston".

   So the story is read for a place, exactly the way it is read for a visit:
   deterministically, in the browser, with the matched phrase kept so the
   person can see WHY the ledger says Texas and change it in one click.

   THREE LAWS THIS FILE KEEPS
   1. NEVER ASSUME WHEN THE WORD IS GENUINELY TWO PLACES. "in Washington" is
      the state or it is the capital; the honest move is to ask, and this
      returns an `ask` instead of a state. Same for Kansas City, Springfield,
      Charleston, Columbia.
   2. A TWO-LETTER CODE IS ONLY A STATE WHEN IT CANNOT BE A WORD. "I was ok"
      is not Oklahoma and "it was in me" is not Maine. A code that is also an
      English word must be UPPERCASE and carry a residence cue or a ZIP.
   3. A CITY NAMES A CMS LOCALITY ONLY WHEN THE PUBLISHED FILE SAYS SO. The
      locality for a city is looked up in data/state-prices.json by name at
      module load — never typed here — so a city maps to a locality key only
      when exactly one CMS locality in that state carries that city's name.
      Everything else narrows the picker to the state and lets the person pick.

   Nothing here produces a dollar figure. It produces a state code and, at
   most, a locality key that already exists in the published table.
   ========================================================================== */

import { LOCALITIES, STATE_NAME, soleLocality } from './fit';

export type StateMatchKind = 'name' | 'postal' | 'city';

export interface StateMatch {
  /** two-letter postal code, always one CMS prices */
  code: string;
  stateName: string;
  /** the exact substring of the story that named it — shown back to the person */
  phrase: string;
  kind: StateMatchKind;
  /** where the phrase starts in the story */
  index: number;
  /** a CMS locality key ("TX-18") when the published file names exactly one locality for this city */
  locality?: string;
  /** 3 = "I live in …", 2 = a place of care, 1 = a bare mention */
  weight: number;
}

export interface StateAsk {
  phrase: string;
  why: string;
  candidates: { code: string; stateName: string; locality?: string }[];
}

export interface StateDetection {
  /** the one place the ledger will fit to, or null when nothing certain was said */
  state: StateMatch | null;
  /** a question to put to the person instead of a guess */
  ask: StateAsk | null;
  /** every place the story named, best first — for tests and for the drawer */
  all: StateMatch[];
}

/* ---------- which CMS locality a city names, read from the published file ---------- */

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* Cities whose CMS locality is NOT decided by the city's name. New York City
   spans four localities (Manhattan, Queens, NYC Suburbs, Rest of New York) and
   "REST OF NEW YORK" is the only published name carrying the words "New York",
   which would read as a match and be wrong. Declining to guess is the rule. */
const NO_CITY_LOCALITY = new Set(['new york', 'new york city', 'nyc', 'upstate ny',
  'brooklyn', 'the bronx', 'staten island', 'bay area', 'the bay area', 'silicon valley',
  'socal', 'twin cities', 'the twin cities']);

/** The CMS locality whose published NAME is this city — only when exactly one is. */
export function localityForCity(city: string, code: string): string | undefined {
  const key = city.trim().toLowerCase();
  if (NO_CITY_LOCALITY.has(key)) return undefined;
  const target = city.trim().toUpperCase();
  if (target === (STATE_NAME[code] ?? '').toUpperCase()) return undefined;
  const inState = LOCALITIES.filter((l) => l.state === code);
  const bare = (n: string) => n.toUpperCase().replace(/^(?:METROPOLITAN|GREATER)\s+/, '');
  const exact = inState.filter((l) => bare(l.name) === target);
  if (exact.length === 1) return exact[0].key;
  if (exact.length > 1) return undefined;
  const word = new RegExp(`(^|[^A-Z])${escapeRe(target)}([^A-Z]|$)`);
  const near = inState.filter((l) => !/^REST OF\b/i.test(l.name) && word.test(l.name.toUpperCase()));
  return near.length === 1 ? near[0].key : undefined;
}

/** The locality a bare state code should land on: its only one, when it has only one. */
export function localityForState(code: string): string | undefined {
  return soleLocality(code)?.key;
}

/* ---------- the phrases ---------- */

/** Extra ways people write a state's name. The plain names come from fit.ts. */
const NAME_ALIASES: Record<string, string[]> = {
  DC: ['washington, d.c.', 'washington d.c.', 'washington, dc', 'washington dc', 'd.c.',
       'district of columbia', 'the district of columbia'],
  WA: ['washington state', 'state of washington', 'wash.'],
  CA: ['calif.', 'cali'],
  MA: ['mass.'],
  TX: ['tex.'],
  FL: ['fla.'],
  AZ: ['ariz.'],
  CO: ['colo.'],
  CT: ['conn.'],
  MN: ['minn.'],
  WI: ['wis.'],
  MI: ['mich.'],
  PA: ['penn.', 'penna.'],
  NY: ['n.y.', 'new york state', 'upstate new york'],
  NJ: ['n.j.'],
  NM: ['n.m.'],
  NH: ['n.h.'],
  NC: ['n.c.'],
  SC: ['s.c.'],
  ND: ['n.d.'],
  SD: ['s.d.'],
  RI: ['r.i.'],
  WV: ['w. va.', 'w.va.'],
  VA: ['va.'],
  IL: ['ill.'],
  IA: ['ia.'],
  KY: ['ky.'],
  LA: ['la.'],
  MD: ['md.'],
  MO: ['mo.'],
  MS: ['miss.'],
  MT: ['mont.'],
  NE: ['neb.'],
  NV: ['nev.'],
  OK: ['okla.'],
  OR: ['ore.'],
  TN: ['tenn.'],
  VT: ['vt.'],
  AL: ['ala.'],
  AR: ['ark.'],
  GA: ['ga.'],
  DE: ['del.'],
  IN: ['ind.'],
  KS: ['kan.'],
  ME: ['me.'],
  OH: ['ohio state university'],
  UT: ['utah'],
  WY: ['wyo.'],
  HI: ['hawaiʻi'],
};

/** City -> state. Every one of the 60 largest U.S. cities, plus every state's
 *  best-known city, plus the boroughs CMS prices on their own. */
const CITIES: [string, string][] = [
  // the 60 largest, in order of population
  ['new york city', 'NY'], ['new york', 'NY'], ['nyc', 'NY'],
  ['los angeles', 'CA'], ['chicago', 'IL'], ['houston', 'TX'], ['phoenix', 'AZ'],
  ['philadelphia', 'PA'], ['philly', 'PA'], ['san antonio', 'TX'], ['san diego', 'CA'],
  ['dallas', 'TX'], ['jacksonville', 'FL'], ['austin', 'TX'], ['fort worth', 'TX'],
  ['san jose', 'CA'], ['columbus', 'OH'], ['charlotte', 'NC'], ['indianapolis', 'IN'],
  ['san francisco', 'CA'], ['seattle', 'WA'], ['denver', 'CO'], ['oklahoma city', 'OK'],
  ['nashville', 'TN'], ['el paso', 'TX'], ['las vegas', 'NV'], ['boston', 'MA'],
  ['detroit', 'MI'], ['portland', 'OR'], ['louisville', 'KY'], ['memphis', 'TN'],
  ['baltimore', 'MD'], ['milwaukee', 'WI'], ['albuquerque', 'NM'], ['fresno', 'CA'],
  ['tucson', 'AZ'], ['sacramento', 'CA'], ['mesa', 'AZ'], ['atlanta', 'GA'],
  ['omaha', 'NE'], ['colorado springs', 'CO'], ['raleigh', 'NC'], ['virginia beach', 'VA'],
  ['long beach', 'CA'], ['miami', 'FL'], ['oakland', 'CA'], ['minneapolis', 'MN'],
  ['bakersfield', 'CA'], ['tulsa', 'OK'], ['tampa', 'FL'], ['arlington', 'TX'],
  ['wichita', 'KS'], ['aurora', 'CO'], ['new orleans', 'LA'], ['cleveland', 'OH'],
  ['anaheim', 'CA'], ['henderson', 'NV'], ['honolulu', 'HI'], ['riverside', 'CA'],
  ['santa ana', 'CA'], ['corpus christi', 'TX'],
  // the rest of the top 100 and every state's best-known city
  ['st. louis', 'MO'], ['saint louis', 'MO'], ['st louis', 'MO'],
  ['pittsburgh', 'PA'], ['cincinnati', 'OH'], ['orlando', 'FL'], ['st. paul', 'MN'],
  ['saint paul', 'MN'], ['newark', 'NJ'], ['jersey city', 'NJ'], ['buffalo', 'NY'],
  ['rochester', 'NY'], ['albany', 'NY'], ['syracuse', 'NY'],
  ['salt lake city', 'UT'], ['boise', 'ID'], ['des moines', 'IA'], ['ames', 'IA'],
  ['cedar rapids', 'IA'], ['iowa city', 'IA'], ['little rock', 'AR'], ['birmingham', 'AL'],
  ['montgomery', 'AL'], ['huntsville', 'AL'], ['charleston', 'SC'], ['providence', 'RI'],
  ['manchester', 'NH'], ['burlington', 'VT'], ['wilmington', 'DE'], ['dover', 'DE'],
  ['sioux falls', 'SD'], ['fargo', 'ND'], ['bismarck', 'ND'], ['billings', 'MT'],
  ['missoula', 'MT'], ['cheyenne', 'WY'], ['casper', 'WY'], ['anchorage', 'AK'],
  ['fairbanks', 'AK'], ['juneau', 'AK'], ['bridgeport', 'CT'], ['hartford', 'CT'],
  ['new haven', 'CT'], ['stamford', 'CT'], ['brooklyn', 'NY'], ['queens', 'NY'],
  ['manhattan', 'NY'], ['the bronx', 'NY'], ['staten island', 'NY'],
  ['stockton', 'CA'], ['chula vista', 'CA'], ['san bernardino', 'CA'], ['modesto', 'CA'],
  ['oxnard', 'CA'], ['fontana', 'CA'], ['fremont', 'CA'], ['irvine', 'CA'],
  ['santa clarita', 'CA'], ['san mateo', 'CA'], ['berkeley', 'CA'], ['palo alto', 'CA'],
  ['lexington', 'KY'], ['greensboro', 'NC'], ['durham', 'NC'], ['winston-salem', 'NC'],
  ['fayetteville', 'NC'], ['plano', 'TX'], ['lubbock', 'TX'], ['garland', 'TX'],
  ['irving', 'TX'], ['laredo', 'TX'], ['amarillo', 'TX'], ['galveston', 'TX'],
  ['beaumont', 'TX'], ['mcallen', 'TX'], ['lincoln', 'NE'], ['toledo', 'OH'],
  ['akron', 'OH'], ['dayton', 'OH'], ['chandler', 'AZ'], ['scottsdale', 'AZ'],
  ['glendale', 'AZ'], ['gilbert', 'AZ'], ['tempe', 'AZ'], ['flagstaff', 'AZ'],
  ['madison', 'WI'], ['green bay', 'WI'], ['baton rouge', 'LA'], ['shreveport', 'LA'],
  ['lafayette', 'LA'], ['reno', 'NV'], ['north las vegas', 'NV'], ['chesapeake', 'VA'],
  ['norfolk', 'VA'], ['richmond', 'VA'], ['arlington, va', 'VA'], ['alexandria', 'VA'],
  ['roanoke', 'VA'], ['charlottesville', 'VA'], ['hialeah', 'FL'], ['fort lauderdale', 'FL'],
  ['ft. lauderdale', 'FL'], ['st. petersburg', 'FL'], ['tallahassee', 'FL'],
  ['gainesville', 'FL'], ['spokane', 'WA'], ['tacoma', 'WA'], ['bellevue', 'WA'],
  ['vancouver, wa', 'WA'], ['eugene', 'OR'], ['salem, or', 'OR'], ['bend', 'OR'],
  ['boulder', 'CO'], ['fort collins', 'CO'], ['pueblo', 'CO'], ['grand rapids', 'MI'],
  ['ann arbor', 'MI'], ['lansing', 'MI'], ['flint', 'MI'], ['duluth', 'MN'],
  ['rochester, mn', 'MN'], ['knoxville', 'TN'], ['chattanooga', 'TN'], ['jackson', 'MS'],
  ['gulfport', 'MS'], ['biloxi', 'MS'], ['oxford, ms', 'MS'], ['fayetteville, ar', 'AR'],
  ['bentonville', 'AR'], ['norman', 'OK'], ['topeka', 'KS'], ['overland park', 'KS'],
  ['columbia, mo', 'MO'], ['springfield, mo', 'MO'], ['springfield, il', 'IL'],
  ['springfield, ma', 'MA'], ['peoria', 'IL'], ['naperville', 'IL'], ['rockford', 'IL'],
  ['evanston', 'IL'], ['worcester', 'MA'], ['cambridge, ma', 'MA'], ['springfield, or', 'OR'],
  ['portland, me', 'ME'], ['bangor', 'ME'], ['augusta, me', 'ME'], ['charleston, wv', 'WV'],
  ['morgantown', 'WV'], ['huntington, wv', 'WV'], ['fort wayne', 'IN'], ['south bend', 'IN'],
  ['bloomington, in', 'IN'], ['evansville', 'IN'], ['allentown', 'PA'], ['erie', 'PA'],
  ['harrisburg', 'PA'], ['scranton', 'PA'], ['bethlehem', 'PA'], ['paterson', 'NJ'],
  ['trenton', 'NJ'], ['camden', 'NJ'], ['atlantic city', 'NJ'], ['santa fe', 'NM'],
  ['las cruces', 'NM'], ['provo', 'UT'], ['ogden', 'UT'], ['idaho falls', 'ID'],
  ["coeur d'alene", 'ID'], ['savannah', 'GA'], ['augusta, ga', 'GA'], ['macon', 'GA'],
  ['athens, ga', 'GA'], ['columbia, sc', 'SC'], ['greenville', 'SC'], ['myrtle beach', 'SC'],
  ['hilo', 'HI'], ['pearl city', 'HI'], ['kailua', 'HI'],
  // the regions people say instead of a city
  ['the bay area', 'CA'], ['bay area', 'CA'], ['silicon valley', 'CA'], ['socal', 'CA'],
  ['the twin cities', 'MN'], ['twin cities', 'MN'], ['upstate ny', 'NY'],
];

/** Words that are two places at once. The product asks; it never picks. */
const AMBIGUOUS: { phrase: string; why: string; candidates: string[] }[] = [
  { phrase: 'washington', why: 'Washington is a state and it is also the capital.', candidates: ['WA', 'DC'] },
  { phrase: 'kansas city', why: 'Kansas City sits on both sides of a state line.', candidates: ['MO', 'KS'] },
  { phrase: 'springfield', why: 'Springfield is a city in several states.', candidates: ['IL', 'MO', 'MA'] },
  { phrase: 'charleston', why: 'Charleston is a city in two states.', candidates: ['SC', 'WV'] },
  { phrase: 'columbia', why: 'Columbia is a city in two states.', candidates: ['SC', 'MO'] },
  { phrase: 'portland', why: 'Portland is a city in two states.', candidates: ['OR', 'ME'] },
];
const AMBIGUOUS_PHRASES = new Set(AMBIGUOUS.map((a) => a.phrase));

/** Two-letter codes that are also ordinary English words. These need shouting AND a cue. */
const WORD_CODES = new Set(['AL', 'DE', 'HI', 'ID', 'IN', 'LA', 'MA', 'ME', 'MI', 'MO', 'MS', 'OH', 'OK', 'OR', 'PA']);

/** A state name followed by one of these is a thing, not a place you live. */
const NOT_A_PLACE_AFTER = /^\s+(?:river|jones|jonesing|post|times|tech|avenue|ave\.?|street|st\.?|road|rd\.?|boulevard|blvd\.?|drive|dr\.?|lane|way|turnpike|pike|bay|sound|valley|delta|gorge|trail|peach(?:es)?|pacific|railroad|railway|o'keeffe)\b/i;

/** A name in front of a state name or a city name means it is a person. */
const A_PERSON_BEFORE = /\b(?:named|called|sister|brother|daughter|son|mother|father|aunt|uncle|cousin|friend|niece|nephew|grandma|grandmother|grandpa|grandfather|neighbou?r|dr\.?|doctor|nurse|therapist|mr\.?|mrs\.?|ms\.?|miss)\s+$/i;

/* ---------- the searchable phrase table, longest first ---------- */

interface Phrase { text: string; code: string; kind: StateMatchKind; ambiguous?: boolean }

const PHRASES: Phrase[] = (() => {
  const out: Phrase[] = [];
  for (const [code, name] of Object.entries(STATE_NAME)) {
    out.push({ text: name.toLowerCase(), code, kind: 'name' });
  }
  for (const [code, aliases] of Object.entries(NAME_ALIASES)) {
    if (!STATE_NAME[code]) continue;
    for (const a of aliases) out.push({ text: a, code, kind: 'name' });
  }
  for (const [city, code] of CITIES) {
    out.push({ text: city, code, kind: 'city', ambiguous: AMBIGUOUS_PHRASES.has(city) });
  }
  for (const a of AMBIGUOUS) {
    if (!out.some((p) => p.text === a.phrase)) out.push({ text: a.phrase, code: a.candidates[0], kind: 'city', ambiguous: true });
  }
  // "washington" the bare word must be an ask, never the state
  for (const p of out) if (AMBIGUOUS_PHRASES.has(p.text)) p.ambiguous = true;
  return out.sort((a, b) => b.text.length - a.text.length || a.text.localeCompare(b.text));
})();

const PHRASE_BY_TEXT = new Map(PHRASES.map((p) => [p.text, p]));

const PHRASE_RE = new RegExp(
  `(^|[^A-Za-z])(${PHRASES.map((p) => escapeRe(p.text)).join('|')})(?![A-Za-z])`, 'gi');

/* ---------- how much the sentence means it ---------- */

const RESIDENCE = /\b(?:liv(?:e|ed|es|ing)|resid(?:e|ed|es|ing)|based|home|mov(?:e|ed|ing)|relocated|grew up|stay(?:s|ed|ing)?|i'?m in|we'?re in|from)\b[^.!?;]{0,24}$/i;
const CARE = /\b(?:clinic|hospital|doctor|physician|specialist|neurologist|cardiologist|seen|saw|visit|visited|went|going|go|treated|care|er|urgent care|lab|imaging|referred)\b[^.!?;]{0,28}$/i;

function weightAt(story: string, index: number): number {
  const before = story.slice(Math.max(0, index - 60), index);
  if (RESIDENCE.test(before)) return 3;
  if (CARE.test(before)) return 2;
  return 1;
}

/* ---------- the postal-code pass ---------- */

const ZIP_FORM = /(^|[^A-Za-z])([A-Za-z]{2})\.?,?\s+\d{5}(?![0-9])/g;
const COMMA_FORM = /,\s*([A-Za-z]{2})(?![A-Za-z])/g;
const CUE_FORM = /\b(?:in|from|to|near|around|outside|throughout|across)\s+([A-Za-z]{2})(?![A-Za-z])/gi;
const STRONG_CUE = /\b(?:liv(?:e|ed|es|ing)|resid(?:e|ed|es|ing)|based|mov(?:e|ed|ing)|relocated|home)\b[^.!?;]{0,20}$/i;

function pushPostal(story: string, code: string, phrase: string, index: number, out: StateMatch[], seen: Set<string>) {
  if (!STATE_NAME[code]) return;
  const key = `${index}:${code}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({
    code, stateName: STATE_NAME[code], phrase, kind: 'postal', index,
    locality: localityForState(code), weight: weightAt(story, index),
  });
}

function postalMatches(story: string): StateMatch[] {
  const out: StateMatch[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;

  // "Ames, IA 50010" — a ZIP right after two letters is a state, whatever the case.
  ZIP_FORM.lastIndex = 0;
  while ((m = ZIP_FORM.exec(story))) {
    const idx = m.index + m[1].length;
    pushPostal(story, m[2].toUpperCase(), m[2], idx, out, seen);
  }

  // "Houston, TX" — a comma then SHOUTED letters.
  COMMA_FORM.lastIndex = 0;
  while ((m = COMMA_FORM.exec(story))) {
    const raw = m[1];
    if (raw !== raw.toUpperCase()) continue;
    const idx = m.index + m[0].length - raw.length;
    pushPostal(story, raw.toUpperCase(), raw, idx, out, seen);
  }

  // "in TX" — a location cue then the letters. A code that is also a word
  // ("ok", "in", "me") must be shouted AND carry a residence cue, so
  // "I was ok" and "it was in me" are never a state.
  CUE_FORM.lastIndex = 0;
  while ((m = CUE_FORM.exec(story))) {
    const raw = m[1];
    const code = raw.toUpperCase();
    if (!STATE_NAME[code]) continue;
    const idx = m.index + m[0].length - raw.length;
    const shouted = raw === raw.toUpperCase();
    if (WORD_CODES.has(code)) {
      if (!shouted) continue;
      if (!STRONG_CUE.test(story.slice(Math.max(0, idx - 60), idx))) continue;
    } else if (!shouted && !STRONG_CUE.test(story.slice(Math.max(0, idx - 60), idx))) {
      continue;
    }
    pushPostal(story, code, raw, idx, out, seen);
  }
  return out;
}

/* ---------- the one entry point ---------- */

export function detectState(raw: string | null | undefined): StateDetection {
  const empty: StateDetection = { state: null, ask: null, all: [] };
  if (!raw || !raw.trim()) return empty;
  // A phone turns ' into ’ on its own. Same characters, same length, so every
  // index below still points at the person's own text.
  const story = raw.replace(/[\u2018\u2019]/g, "'");

  const matches: StateMatch[] = [];
  const asks: { phrase: string; index: number; why: string; candidates: string[]; weight: number }[] = [];

  PHRASE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PHRASE_RE.exec(story))) {
    const idx = m.index + m[1].length;
    const raw = m[2];
    const p = PHRASE_BY_TEXT.get(raw.toLowerCase());
    if (!p) continue;
    const after = story.slice(idx + raw.length);
    if (NOT_A_PLACE_AFTER.test(after)) continue;
    if (A_PERSON_BEFORE.test(story.slice(Math.max(0, idx - 40), idx))) continue;
    if (p.ambiguous) {
      const a = AMBIGUOUS.find((x) => x.phrase === raw.toLowerCase());
      if (a) { asks.push({ phrase: raw, index: idx, why: a.why, candidates: a.candidates, weight: weightAt(story, idx) }); continue; }
    }
    matches.push({
      code: p.code,
      stateName: STATE_NAME[p.code] ?? p.code,
      phrase: raw,
      kind: p.kind,
      index: idx,
      locality: p.kind === 'city' ? localityForCity(raw.replace(/,.*$/, '').trim(), p.code) ?? localityForState(p.code)
                                  : localityForState(p.code),
      weight: weightAt(story, idx),
    });
    // a match consumes its span, so "west virginia" never also reads as "virginia"
    PHRASE_RE.lastIndex = idx + raw.length;
  }

  matches.push(...postalMatches(story));

  // Best first: how much the sentence meant it, then an explicit state over a city,
  // then whichever came first.
  const rank = (x: StateMatch) => (x.kind === 'city' ? 0 : 1);
  const all = [...matches].sort((a, b) => b.weight - a.weight || rank(b) - rank(a) || a.index - b.index);

  if (!all.length) {
    if (!asks.length) return empty;
    const a = asks[0];
    return {
      state: null,
      all: [],
      ask: {
        phrase: a.phrase, why: a.why,
        candidates: a.candidates.map((c) => ({
          code: c, stateName: STATE_NAME[c] ?? c,
          locality: localityForCity(a.phrase.replace(/,.*$/, '').trim(), c) ?? localityForState(c),
        })),
      },
    };
  }

  const winner = { ...all[0] };
  // "I live in Texas, at a clinic in Houston" — the state is settled; take the
  // sharper locality any other phrase for the SAME state carries.
  if (!winner.locality || localityForState(winner.code) === winner.locality) {
    const sharper = all.find((x) => x.code === winner.code && x.locality && x.locality !== localityForState(x.code));
    if (sharper) winner.locality = sharper.locality;
  }

  /* An ambiguous word is only a question when it is the place the sentence meant.
     "I live in Iowa, my sister is in Washington" settles on Iowa and asks nothing;
     "I live in Washington and flew to Dallas once" asks, because the word that
     carried the residence is the ambiguous one. */
  const stillAsking = asks.find((a) => !a.candidates.includes(winner.code) && a.weight >= winner.weight);
  return {
    state: winner,
    all,
    ask: stillAsking
      ? {
          phrase: stillAsking.phrase, why: stillAsking.why,
          candidates: stillAsking.candidates.map((c) => ({
            code: c, stateName: STATE_NAME[c] ?? c,
            locality: localityForCity(stillAsking.phrase.replace(/,.*$/, '').trim(), c) ?? localityForState(c),
          })),
        }
      : null,
  };
}

/* ---------- a sentence that only says where ---------- */

/* Words a sentence may carry and still be saying nothing but WHERE. Anything
   outside this list — a doctor, a scan, a symptom, a number of visits — means
   the sentence is about care and belongs on the ledger. */
const PLACE_FRAME_WORDS = new Set([
  'i', "i'm", 'im', 'we', "we're", 'my', 'our', 'me', 'us',
  'am', 'is', 'was', 'were', 'are', 'be', 'been', 'have', 'has', 'had', 'do', 'did',
  'live', 'lives', 'lived', 'living', 'reside', 'resides', 'resided', 'residing',
  'based', 'stay', 'stays', 'stayed', 'staying', 'move', 'moves', 'moved', 'moving',
  'relocate', 'relocated', 'grew', 'grow', 'growing', 'raised', 'born',
  'from', 'in', 'at', 'near', 'out', 'back', 'here', 'there', 'up', 'to', 'into',
  'over', 'around', 'outside', 'of', 'the', 'a', 'an', 'and', 'but', 'then', 'also',
  'since', 'now', 'still', 'currently', 'today', 'whole', 'entire', 'life', 'lifetime',
  'time', 'year', 'years', 'month', 'months', 'ago', 'all', 'most', 'this', 'that',
  'city', 'town', 'area', 'county', 'state', 'part', 'side', 'north', 'south', 'east', 'west',
]);

/**
 * True when a phrase says only WHERE the person is and names no care.
 *
 * "I live in Houston." is a person answering the second of the three questions.
 * It is context, not a thing that happened to them, and carrying it onto a
 * ledger as an unpriced line puts a non-event where the itemised care goes.
 * Anything that also names care ("I saw a doctor in Houston") is false.
 */
export function placeOnlyPhrase(phrase: string | null | undefined): boolean {
  if (!phrase || !phrase.trim()) return false;
  const d = detectState(phrase);
  if (!d.all.length && !d.ask) return false;
  /* Cut out EVERY place the sentence named, by position — "in Ames, IA 50010"
     names the city and the code, and leaving either behind reads as a word. */
  let left = phrase.replace(/[\u2018\u2019]/g, "'");
  for (const m of [...d.all].sort((a, b) => b.index - a.index)) {
    left = left.slice(0, m.index) + ' ' + left.slice(m.index + m.phrase.length);
  }
  if (d.ask) left = left.replace(new RegExp(`(^|[^A-Za-z])${escapeRe(d.ask.phrase)}(?![A-Za-z])`, 'gi'), ' ');
  const rest = left
    .replace(/\b\d{4,5}\b/g, ' ')          // a year, or the ZIP beside the state
    .replace(/[^A-Za-z']+/g, ' ')
    .trim()
    .toLowerCase();
  if (!rest) return true;
  return rest.split(/\s+/).every((w) => PLACE_FRAME_WORDS.has(w));
}

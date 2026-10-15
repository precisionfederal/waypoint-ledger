/**
 * LISTEN INSTEAD OF READ, SPEAK INSTEAD OF TYPE.
 *
 * A patient advocate at the 1 October Beta demo: "I've been flaring really
 * badly this week, so I literally can't read… is there audio way", and she
 * asked to give the story without typing it. This file holds both halves:
 *
 *  - ledgerScript() turns the ledger's own figures into plain sentences. It is
 *    handed the SAME numbers the page renders (the ledger's `sum`, its priced
 *    lines and its fits) and formats them with the SAME usd() the page uses, so
 *    the voice can never say a different number from the screen
 *    (tests/speech.test.ts holds it to that).
 *  - createReader() speaks those sentences with the browser's built-in Web
 *    Speech API (speechSynthesis), one sentence per utterance. Nothing is sent
 *    anywhere by Waypoint, and only a voice the browser marks as local
 *    (SpeechSynthesisVoice.localService, MDN) is used, so the ledger text is not
 *    handed to an online voice either.
 *  - recognitionCtor() finds the browser's speech recognition, if it has one.
 *
 * Nothing here computes a dollar amount. It only says the ones it is given.
 */
import { usd } from './pricing';
import type { PricedLine } from './types';
import type { Fit } from './fit';

/* ---------- the script: the ledger, said aloud ---------- */

export type SpokenKind = 'priced' | 'blank' | 'counted' | 'unmatched' | 'diagnosis';

export interface SpokenLine {
  kind: SpokenKind;
  /** the unit of care's name, or the person's own words when there is no unit */
  name: string;
  times: number;
  /** the per-time figure shown in the Figure column */
  figureUsd: number | null;
  /** the line total shown in the Line total column */
  totalUsd: number | null;
  /** the dollar year of the figure, e.g. "2026"; null when the row does not say one */
  year: string | null;
  /** for a counted line: the counter it belongs in, e.g. "Time spent searching" */
  countedAs?: string | null;
  /** the person's own words for a priced line, said only when two lines share a unit's name */
  said?: string | null;
}

/** The dollar year of the figure a line shows. A charge carries the year of the
 *  claims it was published from (fit.figureNote: "Average submitted charge,
 *  CY2024 …"); every other figure carries the year of its row. Only a plain
 *  four-digit year is returned, never a guess. */
export function dollarYearOf(line: PricedLine, fit?: Fit | null): string | null {
  const it = line.entry.item;
  if (!it) return null;
  if (fit?.which === 'charge') return fit.figureNote.match(/CY(\d{4})/)?.[1] ?? null;
  return String(it.year ?? '').match(/^(\d{4})\b/)?.[1] ?? null;
}

/** One ledger line, read off the same priced line and fit the table renders. */
export function spokenLineOf(line: PricedLine, fit?: Fit | null, extra: { countedAs?: string | null; diagnosis?: boolean } = {}): SpokenLine {
  const it = line.entry.item;
  const name = it ? it.label : line.entry.raw.trim().replace(/[.!?]+$/, '');
  const times = Math.max(1, line.entry.times);
  if (extra.diagnosis) return { kind: 'diagnosis', name, times, figureUsd: null, totalUsd: null, year: null };
  if (it && line.priced) {
    return { kind: 'priced', name, times, figureUsd: fit ? fit.figureUsd : it.valueUsd ?? null, totalUsd: line.totalUsd, year: dollarYearOf(line, fit), said: line.entry.raw.trim().replace(/[\s.,;:!?]+$/, '') || null };
  }
  if (it) return { kind: 'blank', name, times, figureUsd: null, totalUsd: null, year: null };
  if (extra.countedAs) return { kind: 'counted', name, times, figureUsd: null, totalUsd: null, year: null, countedAs: extra.countedAs };
  return { kind: 'unmatched', name, times, figureUsd: null, totalUsd: null, year: null };
}

export interface LedgerScriptInput {
  /** the total's own label on the page */
  label: string;
  /** the total as the page shows it; null when the page suppresses it */
  totalUsd: number | null;
  /** the basis line under the total (lib/fit totalLabels().primary) */
  basis?: string | null;
  pricedCount: number;
  /** visits and tests: the times on lines with a unit of care */
  visits?: number;
  /** "2 years searching · 2 clinicians named", when she said it */
  searched?: string | null;
  /** judge panel 15 Oct B-1: the summable:false figures the total leaves out, as the card
   *  prints them (lib/pricing besideSentence); their lines are not passed in `lines` */
  beside?: string | null;
  /** a second total shown BESIDE the first, never added (uninsured: the Medicare stack) */
  second?: { label: string; totalUsd: number | null } | null;
  /** when no figure describes the person: the headline that stands where the total would */
  suppressed?: { headline: string; floorUsd: number | null; ceilingUsd: number | null } | null;
  lines: SpokenLine[];
  /** counted, never priced: the time spent searching, already worded (monthsPhrase) */
  searchingFor?: string | null;
  /** named costs left unpriced (the "left blank" list), by their own labels */
  namedUnpriced?: string[];
  /** who published the rows, e.g. ["CMS", "AHRQ MEPS"] */
  agencies?: string[];
  tableVersion?: string | null;
}

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
/** A middle dot, a slash or an arrow reads badly aloud; a comma reads as a pause. */
export function speakable(s: string): string {
  return s.replace(/\s*[·•]\s*/g, ', ').replace(/\s*[\u2192\u2013]\s*/g, ', ').replace(/\s+/g, ' ').trim();
}
const sentence = (s: string) => { const t = speakable(s); return /[.!?]$/.test(t) ? t : `${t}.`; };

/** The year phrase for a total: one year → "in 2026 dollars"; several → the span. */
export function yearPhrase(years: (string | null)[]): string {
  const ys = [...new Set(years.filter((y): y is string => !!y))].sort();
  if (!ys.length) return '';
  if (ys.length === 1) return `, in ${ys[0]} dollars`;
  return `, from figures published for ${ys[0]} to ${ys[ys.length - 1]}, each in its own year's dollars`;
}

/**
 * The ledger as plain sentences, in the order the page shows it: the total with
 * its dollar year, each line's name and figure, what was counted and never
 * priced, and where the figures come from. Every dollar is usd() of a number
 * the caller already renders.
 */
export function ledgerScript(x: LedgerScriptInput): string[] {
  const out: string[] = [];
  const priced = x.lines.filter((l) => l.kind === 'priced');
  if (x.suppressed) {
    out.push(sentence(x.suppressed.headline));
    if (x.suppressed.floorUsd !== null) out.push(sentence(`For reference only, not your rate: Medicare allows ${usd(x.suppressed.floorUsd)} for the same care`));
    if (x.suppressed.ceilingUsd !== null) out.push(sentence(`Providers billed ${usd(x.suppressed.ceilingUsd)} on average for the same care in 2024. That is a ceiling, not your rate`));
  } else if (x.totalUsd !== null) {
    const visits = x.visits && x.visits > 0 ? `, for ${x.visits} ${x.visits === 1 ? 'visit or test' : 'visits and tests'}` : '';
    out.push(sentence(`${x.label}: ${usd(x.totalUsd)}${yearPhrase(priced.map((l) => l.year))}. That is ${x.pricedCount} priced ${x.pricedCount === 1 ? 'line' : 'lines'}${visits}`));
    if (x.beside) out.push(sentence(x.beside));
    if (x.basis) out.push(sentence(`The basis: ${x.basis}`));
    if (x.second && x.second.totalUsd !== null) out.push(sentence(`Shown beside it, never added to it. ${x.second.label}: ${usd(x.second.totalUsd)}`));
    out.push('This is not a bill and not a claim.');
  }
  if (x.searched) out.push(sentence(x.searched));

  /* Two specialists are both "First visit with a new specialist" on the screen,
     where the line under each shows her words; aloud, the same sentence twice is
     a puzzle, so a shared name carries what she said. */
  const seen = new Map<string, number>();
  for (const l of priced) seen.set(l.name, (seen.get(l.name) ?? 0) + 1);
  x.lines.forEach((l) => {
    switch (l.kind) {
      case 'priced': {
        const name = (seen.get(l.name) ?? 0) > 1 && l.said ? `${l.name}, where you said "${l.said}"` : l.name;
        out.push(sentence(l.times === 1
          ? `${name}, once: ${usd(l.totalUsd, true)}`
          : `${name}, ${times(l.times)} at ${usd(l.figureUsd, true)} each: ${usd(l.totalUsd, true)}`));
        break;
      }
      case 'blank':
        out.push(sentence(`${l.name}, ${times(l.times)}: no published federal figure describes you here, so it is left blank, never guessed`));
        break;
      case 'counted':
        out.push(sentence(`"${l.name}": counted under ${l.countedAs}, never priced`));
        break;
      case 'unmatched':
        out.push(sentence(`"${l.name}": no published federal figure matched, so it is left blank, never guessed`));
        break;
      case 'diagnosis':
        out.push(sentence(`The diagnosis, in your words: ${l.name}`));
        break;
    }
  });

  if (x.searchingFor) out.push(sentence(`Counted, never priced: time spent searching, ${x.searchingFor}`));
  if (x.namedUnpriced?.length) out.push(sentence(`Named, and left blank, never guessed: ${x.namedUnpriced.map((n) => n.charAt(0).toLowerCase() + n.slice(1)).join('; ')}`));

  const who = x.agencies?.length ? ` The files are from ${listWords(x.agencies.map(agencyWords))}.` : '';
  out.push(`Where the figures come from: every figure is read from a published U.S. federal file, and each line names its file on the screen.${who}${x.tableVersion ? ` Price table ${x.tableVersion}.` : ''}`);
  return out;
}

const AGENCY_WORDS: Record<string, string> = {
  CMS: 'the Centers for Medicare and Medicaid Services',
  'AHRQ MEPS': 'the Medical Expenditure Panel Survey',
  'AHRQ HCUP': 'the Healthcare Cost and Utilization Project',
  BLS: 'the Bureau of Labor Statistics',
  GSA: 'the General Services Administration',
};
const agencyWords = (a: string) => AGENCY_WORDS[a] ?? a;
function listWords(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/* ---------- the reader: speechSynthesis, one sentence at a time ---------- */

export const RATES = { normal: 1, slower: 0.8 } as const;
export type Rate = keyof typeof RATES;

export function canSpeak(w: unknown = typeof window === 'undefined' ? undefined : window): boolean {
  const g = w as { speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown } | undefined;
  return !!g && !!g.speechSynthesis && typeof g.SpeechSynthesisUtterance === 'function';
}

type VoiceLike = Pick<SpeechSynthesisVoice, 'lang' | 'localService' | 'default' | 'name'>;
/**
 * A voice built into this device, English first. Returns undefined when the
 * browser has listed no voices yet (the utterance then takes the browser's
 * default) and null when every listed voice is a remote one: then Listen stays
 * off rather than send the ledger's text to an online voice.
 */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], lang = 'en-US'): V | null | undefined {
  if (!voices.length) return undefined;
  const local = voices.filter((v) => v.localService);
  if (!local.length) return null;
  const base = lang.slice(0, 2).toLowerCase();
  const exact = local.filter((v) => v.lang?.toLowerCase().replace('_', '-') === lang.toLowerCase());
  const same = local.filter((v) => v.lang?.toLowerCase().startsWith(base));
  return exact.find((v) => v.default) ?? same.find((v) => v.default) ?? exact[0] ?? same[0] ?? null;
}

/** Voices load late in Chrome; wait for them briefly, never forever. */
export function voicesReady(synth: SpeechSynthesis, waitMs = 1200): Promise<SpeechSynthesisVoice[]> {
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((done) => {
    const finish = () => { synth.removeEventListener?.('voiceschanged', finish); clearTimeout(t); done(synth.getVoices()); };
    const t = setTimeout(finish, waitMs);
    synth.addEventListener?.('voiceschanged', finish);
  });
}

export type ReaderState = 'idle' | 'playing' | 'paused';

interface SynthLike { speak(u: UtteranceLike): void; cancel(): void }
interface UtteranceLike { rate: number; lang: string; voice: unknown; onend: (() => void) | null; onerror: ((e?: unknown) => void) | null }

/**
 * Speaks a list of sentences one utterance at a time. Pause is a cancel that
 * keeps the place, and resume speaks from that sentence: speechSynthesis.pause()
 * does nothing on Chrome for Android, and one long utterance is cut off after
 * about fifteen seconds in desktop Chrome, so neither is relied on.
 */
export function createReader(opts: {
  synth: SynthLike;
  makeUtterance: (text: string) => UtteranceLike;
  sentences: string[];
  rate?: number;
  voice?: unknown;
  lang?: string;
  onState?: (s: ReaderState) => void;
  onIndex?: (i: number, of: number) => void;
}) {
  let i = 0;
  let gen = 0;
  let state: ReaderState = 'idle';
  let rate = opts.rate ?? 1;
  const set = (s: ReaderState) => { state = s; opts.onState?.(s); };
  const speakFrom = () => {
    const my = ++gen;
    if (i >= opts.sentences.length) { i = 0; set('idle'); return; }
    opts.onIndex?.(i, opts.sentences.length);
    const u = opts.makeUtterance(opts.sentences[i]);
    u.rate = rate;
    u.lang = opts.lang ?? 'en-US';
    if (opts.voice) u.voice = opts.voice;
    u.onend = () => { if (my !== gen || state !== 'playing') return; i += 1; speakFrom(); };
    /* An "interrupted" or "canceled" error is our own pause or stop. */
    u.onerror = () => { if (my !== gen) return; i += 1; speakFrom(); };
    opts.synth.speak(u);
  };
  const halt = () => { gen += 1; opts.synth.cancel(); };
  return {
    get state() { return state; },
    get index() { return i; },
    play() { halt(); i = 0; set('playing'); speakFrom(); },
    pause() { if (state !== 'playing') return; halt(); set('paused'); },
    resume() { if (state !== 'paused') return; halt(); set('playing'); speakFrom(); },
    stop() { halt(); i = 0; set('idle'); },
    setRate(r: number) { rate = r; if (state === 'playing') { halt(); speakFrom(); } },
  };
}

/* ---------- speech recognition: whose service hears the voice ---------- */

export interface RecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean; processLocally?: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
export interface RecognitionCtor {
  new (): RecognitionLike;
  available?: (o: { langs: string[]; processLocally?: boolean }) => Promise<string>;
}

/** The browser's speech recognition, standard name first, Chrome and Safari's prefixed one second. */
export function recognitionCtor(w: unknown = typeof window === 'undefined' ? undefined : window): RecognitionCtor | null {
  const g = w as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor } | undefined;
  return g?.SpeechRecognition ?? g?.webkitSpeechRecognition ?? null;
}

/** True only when the browser says it can recognise this language on the device itself (MDN: SpeechRecognition.available, processLocally). */
export async function canRecogniseOnDevice(C: RecognitionCtor, lang = 'en-US'): Promise<boolean> {
  if (typeof C.available !== 'function') return false;
  try { return (await C.available({ langs: [lang], processLocally: true })) === 'available'; } catch { return false; }
}

/** The words said beside the microphone: who turns the voice into text. */
export function recognitionNote(onDevice: boolean): string {
  return onDevice
    ? 'Your browser turns your voice into words on this device. Waypoint records nothing.'
    : 'Your browser turns your voice into words with its own speech service; in Chrome the audio goes to Google’s. Waypoint records nothing.';
}

/** The box after dictation: what was there, a space, then what was said. */
export function joinSaid(before: string, said: string): string {
  const s = said.trim();
  if (!s) return before;
  if (!before.trim()) return s;
  return /[\s]$/.test(before) ? `${before}${s}` : `${before} ${s}`;
}

/** What the microphone's error means, in plain words. */
export function recognitionError(code: string): string {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'The microphone is blocked for this page. Allow it from the address bar, or type instead.';
  if (code === 'no-speech') return 'Nothing was heard. Try again a little closer to the microphone.';
  if (code === 'audio-capture') return 'No microphone was found on this device.';
  if (code === 'network') return 'The browser’s speech service could not be reached. Typing still works.';
  return 'Speaking stopped. Try again, or type instead.';
}

/* ---------- a text file into the same box ---------- */

export const TEXT_FILE_MAX_CHARS = 20_000;
/** A plain-text file only: no parsing library, nothing uploaded; the words go into the box. */
export function isTextFile(f: { name: string; type: string }): boolean {
  return f.type === 'text/plain' || /\.txt$/i.test(f.name);
}

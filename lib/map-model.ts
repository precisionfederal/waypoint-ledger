/* The AI reader — the one place a model touches a story.

   A model reads a person's own words and names, for each phrase, a unit of
   care from a FIXED catalog (ids and labels only). It never sees a price and
   it never returns one: the published federal table prices the unit, exactly
   as it does for a phrase the deterministic rules matched. The rules win where
   they know better — care that was never received is never priced, and a span
   of time is time, not care — so the model can only ever fill a blank the
   rules left blank, with an id the catalog already holds.

   Everything here is pure so it can be tested without a model: build the
   request, validate the answer, merge it. `cf/functions/api/map.js` supplies
   the model (OpenAI gpt-5.4-nano first; Anthropic or Cloudflare Workers AI
   when that key is absent) and the cache. */
import type { PriceItem } from './types';
import type { ParsedSegment, MapResult } from './mapper';

export type SegmentSource = 'rules' | 'model';

export interface CatalogEntry { id: string; label: string; also: string[] }

/** One answer about one phrase. `i` indexes the phrases we asked to be mapped;
 *  `r` indexes the phrases the RULES already read, which the model may only
 *  flag, never change. `flag` is a report and never touches a price. */
export interface ModelAnswer { i?: number; r?: number; id?: string | null; why?: string; flag?: string }

/** A phrase the rules already read, shown to the model as context. */
export interface RulesRead { index: number; raw: string; id: string | null; label: string | null }

/** What the model said about a phrase the rules read. Report only. */
export interface ModelFlag { scope: 'read' | 'asked'; index: number; raw: string; ruleId: string | null; flag: string }

/** One catalog line per selectable unit — id, label, a few synonyms. No prices. */
export function catalogFor(table: readonly PriceItem[]): CatalogEntry[] {
  return table.map((i) => ({ id: i.id, label: i.label, also: (i.synonyms ?? []).slice(0, 8) }));
}

/** The phrases the rules left blank: no unit, no gap category, no span of time. */
export function candidatesOf(segments: readonly ParsedSegment[]): number[] {
  const out: number[] = [];
  segments.forEach((s, i) => {
    const r = s.result;
    if (!r.item && !r.gapCategory && r.months == null) out.push(i);
  });
  return out;
}

/** The phrases the rules DID read, with the id they landed on — the model sees
 *  these so it can read the story as a whole and say where the rules look wrong. */
export function rulesReadOf(segments: readonly ParsedSegment[]): RulesRead[] {
  const out: RulesRead[] = [];
  segments.forEach((s, index) => {
    const r = s.result;
    if (!r.item && !r.gapCategory && r.months == null) return;
    out.push({ index, raw: s.raw, id: r.item?.id ?? null, label: r.item?.label ?? (r.gapCategory ? `not priced: ${r.gapCategory}` : r.months != null ? `${r.months} months of time` : null) });
  });
  return out;
}

export const SYSTEM_PROMPT =
  'You read phrases from a patient\'s own account of a diagnostic search and map each one to a unit of care ' +
  'from a fixed catalog. Answer with JSON only.\n' +
  'LAY WORDS. People almost never use the catalog\'s words: "the heart ultrasound thing" is an echocardiogram; ' +
  '"they put electrodes on my legs and shocked the nerves" is a nerve and muscle test (EMG); "the doughnut machine" is a CT scanner; ' +
  '"the tilt table where they strap you upright" is a tilt table test; "the monitor I wore for two weeks" is a wearable heart monitor; ' +
  '"they sealed me in a glass box and told me to pant" is a lung volume test. Read each phrase in the context of the whole story and ' +
  'choose the catalog unit it describes.\n' +
  'TYPOS AND AUTOCORRECT are everywhere and never change the answer: brian is brain, moniter is monitor, colonscopy is colonoscopy, ' +
  'thyriod is thyroid, echocardigram is echocardiogram.\n' +
  'NEGATION. A phrase that names a unit inside "never got", "never went", "no one ever ordered", "was denied", "refused to cover", ' +
  '"could not afford", "skipped", "put off", "cancelled", "turned it down", "said no", "they wanted to but" is null. Care that did not ' +
  'happen is never a unit, however exactly it is named.\n' +
  'NOT CARE, always null: a wait or any length of time; a symptom, a feeling or a loss; a cost, a bill or an insurance decision; a person, ' +
  'a place, a hospital, a city or a state; a specialty named with no visit ("eleven doctors"); care someone else had; care only read ' +
  'about online, wondered about, or planned for a future appointment.\n' +
  'ONE EVENT, ONE UNIT. Where two neighbouring phrases are two halves of ONE appointment, give them BOTH THE SAME id: the system counts ' +
  'the unit once and keeps the person\'s own words on the page. Never give two halves of one event two different ids. The shocks and the ' +
  'needles of a single nerve study are one complete nerve and muscle test (EMG), so both halves take the EMG row. Two tests each named in ' +
  'their own right ("the breathing test, the gas transfer and the body box") are still two or three separate units.\n' +
  'NEVER INVENT SPECIFICITY. Some rows differ only by how many were done — nerve conduction tests by the number of nerves, allergy tests ' +
  'per allergen. Choose one of those only when the person says the number. A nerve study described without a count ("they shocked the ' +
  'nerves", "electrodes on my legs", "EMG and nerve conduction") is the complete nerve and muscle test (EMG), never a per-nerve row.\n' +
  'TWO UNITS THAT ARE EASY TO SWAP: electrodes or discs on the SCALP are a brain wave test (EEG), even when the person slept through it; ' +
  'an overnight sleep study is a whole night in a sleep lab. A scope down the throat is an upper endoscopy; a scope at the other end is a ' +
  'colonoscopy. A urine sample looked at under a microscope is a urinalysis; one grown in the lab is a culture. Blowing into a tube is ' +
  'spirometry; breathing a gas and holding your breath is the gas transfer test.\n' +
  'OUTPUT {"map":[{"i":<phrase index>,"id":<catalog id or null>,"why":"<at most twelve words>"}]} with one entry per phrase index. ' +
  'Use an id only when the phrase describes that unit of care having been done. Never invent an id. ' +
  'WHEN TWO NEIGHBOURING PHRASES ARE TWO HALVES OF ONE APPOINTMENT, PUT THE SAME ID ON BOTH — the system counts the unit once and keeps ' +
  'the person\'s words on the page. So "they put electrodes on my legs" and "shocked the nerves" both take the EMG row. Do not answer ' +
  'null on one half just because the other half already named the event; null is for care that did not happen.\n' +
  'WORKED EXAMPLE of the two halves. Phrases: 0: "they put electrodes on my legs"  1: "shocked the nerves". One appointment, so both take ' +
  'the same row: {"map":[{"i":0,"id":"cms-test-emg","why":"nerve and muscle test"},{"i":1,"id":"cms-test-emg","why":"same test, other half"}]}. ' +
  'Not a per-nerve row, because no number of nerves was said; and not null on either half, because the appointment happened.\n' +
  'THEN CHECK THE RULES. Go through the ALREADY READ list once. For each line ask: does the phrase really name that unit; did that care ' +
  'really happen (not denied, refused, unaffordable, skipped, someone else\'s, only read about or planned); and where two units are close, ' +
  'is it the right one. Where any answer is no, add an entry {"r":<index in ALREADY READ>,"flag":"<at most twelve words, what is wrong>"}. ' +
  'Say nothing about the lines that look right. A flag is a report to the people who maintain the rules: it never changes an answer, a ' +
  'count or a price. Never mention money.';

export function buildUserPrompt(
  catalog: readonly CatalogEntry[],
  phrases: readonly string[],
  story = '',
  alreadyRead: readonly RulesRead[] = [],
): string {
  const cat = catalog.map((c) => `${c.id} | ${c.label}${c.also.length ? ` | also: ${c.also.join(', ')}` : ''}`).join('\n');
  const ph = phrases.map((p, i) => `${i}: ${p}`).join('\n');
  const ctx = story ? `THE WHOLE STORY, for context only (do not map it; map the phrases listed below)\n<<<${story.slice(0, 2000)}>>>\n\n` : '';
  // The rules that produced this list are a keyword matcher. It is right most of the time and wrong in
  // characteristic ways — it has read "microscope" as a colonoscopy and "came back low" as a scan of the
  // lower back — so the model is shown its answers and asked to say where they look wrong. Report only.
  const read = alreadyRead.length
    ? `ALREADY READ by a keyword matcher, which is sometimes wrong (index: unit | the phrase it read)\n${alreadyRead
        .map((r, n) => `${n}: ${r.id ?? '(no unit)'} | ${r.raw}`)
        .join('\n')}\n\n`
    : '';
  const ask = alreadyRead.length
    ? `Return {"map":[...]} containing BOTH:\n` +
      `1. one {"i":…,"id":…,"why":…} entry for every phrase index above; and\n` +
      `2. your check of the ALREADY READ list: one {"r":<index>,"flag":"<what is wrong>"} entry for each line that names care the person did not have, or a unit that is not what the phrase says. If every line there looks right, say so once with {"r":-1,"flag":"none"}. Never leave the check out.`
    : `Return {"map":[...]} with one entry per phrase index.`;
  return `CATALOG (id | label | also)\n${cat}\n\n${ctx}${read}PHRASES TO MAP (each is a fragment of the story above; read it in that context)\n${ph}\n\n${ask}`;
}

/** Pull the first JSON object out of a model reply; tolerate prose around it.
 *  An entry is kept when it carries an integer `i` (a phrase we asked about) or
 *  an integer `r` (a phrase the rules already read, which may only be flagged). */
export function parseModelJson(text: string): ModelAnswer[] {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const obj = JSON.parse(m[0]);
    // Models answer the two jobs in one array ("map") or in two ("map" plus "r"/"flags"/"check").
    // Both shapes are read; anything else is ignored.
    const arr = [
      ...(Array.isArray(obj?.map) ? obj.map : []),
      ...(Array.isArray(obj?.r) ? obj.r : []),
      ...(Array.isArray(obj?.flags) ? obj.flags : []),
      ...(Array.isArray(obj?.check) ? obj.check : []),
    ];
    return arr
      .filter((a: unknown) => {
        if (!a || typeof a !== 'object') return false;
        const x = a as ModelAnswer;
        return Number.isInteger(x.i) || Number.isInteger(x.r);
      })
      .map((a: ModelAnswer) => ({
        ...(Number.isInteger(a.i) ? { i: a.i } : {}),
        ...(Number.isInteger(a.r) ? { r: a.r } : {}),
        id: typeof a.id === 'string' ? a.id : null,
        why: typeof a.why === 'string' ? a.why.slice(0, 120) : undefined,
        flag: typeof a.flag === 'string' ? a.flag.slice(0, 120) : undefined,
      }));
  } catch {
    return [];
  }
}

export interface Applied {
  segments: ParsedSegment[];
  /** Phrase indexes the model filled with a valid catalog id. */
  filled: number[];
  /** Ids the model offered that the catalog does not hold — refused, counted. */
  refused: string[];
  /** What the model said looked wrong about a phrase the rules read. REPORT ONLY:
   *  nothing here changes a unit, a count or a price. */
  flags: ModelFlag[];
}

/** Merge validated model answers into the rules' segments. Only a candidate
 *  index may change, only to a catalog id, and only from blank to a unit.
 *  `alreadyRead` is the list the model was shown so an `r` flag can be resolved
 *  back to the segment it is about; a flag never changes a segment. */
export function applyModel(
  segments: readonly ParsedSegment[],
  candidates: readonly number[],
  answers: readonly ModelAnswer[],
  table: readonly PriceItem[],
  alreadyRead: readonly RulesRead[] = [],
): Applied {
  const byId = new Map(table.map((i) => [i.id, i] as const));
  const allowed = new Set(candidates);
  const out = segments.map((s) => ({ ...s, source: (s.source ?? 'rules') as SegmentSource }));
  const filled: number[] = [];
  const refused: string[] = [];
  const flags: ModelFlag[] = [];
  for (const a of answers) {
    if (a.flag) {
      if (Number.isInteger(a.r)) {
        const read = alreadyRead[a.r as number];
        if (read) flags.push({ scope: 'read', index: read.index, raw: read.raw, ruleId: read.id, flag: a.flag });
      } else if (Number.isInteger(a.i)) {
        const idx = candidates[a.i as number];
        if (idx !== undefined) flags.push({ scope: 'asked', index: idx, raw: out[idx]?.raw ?? '', ruleId: null, flag: a.flag });
      }
    }
    if (!a.id || !Number.isInteger(a.i)) continue;
    const idx = candidates[a.i as number];
    if (idx === undefined || !allowed.has(idx)) continue;
    const item = byId.get(a.id);
    if (!item) { refused.push(a.id); continue; }
    // A phrase is often a fragment of the sentence beside it ("the breathing test" … "where you blow into the
    // machine"). If a neighbouring phrase the rules already read names the same unit, this is the same event,
    // not a second one — leave it blank rather than count the unit twice.
    const neighbours = [out[idx - 1], out[idx + 1]].filter(Boolean);
    if (neighbours.some((n) => n && n.result.item && n.result.item.id === item.id)) {
      out[idx] = { ...out[idx], absorbed: true, source: 'model', modelWhy: a.why ?? null };
      continue;
    }
    const result: MapResult = {
      item,
      score: 0.5,
      matchedOn: null,
      confidence: 'medium',
      reason: null,
      gapCategory: null,
      months: null,
    };
    out[idx] = { ...out[idx], result, source: 'model', modelWhy: a.why ?? null };
    filled.push(idx);
  }
  return { segments: out, filled, refused, flags };
}

/** The wire shape. Carries the unit's id and label; never a figure. */
export interface WireSegment {
  raw: string;
  times: number;
  countNote: string | null;
  itemId: string | null;
  label: string | null;
  confidence: MapResult['confidence'];
  reason: string | null;
  gapCategory: MapResult['gapCategory'];
  months: number | null;
  source: SegmentSource;
  why: string | null;
  absorbed?: boolean;
  /** The model's note that this phrase may have been read wrong. Report only —
   *  the unit, the count and the price are unchanged by it. */
  flag?: string;
}

export function toWire(segments: readonly ParsedSegment[], flags: readonly ModelFlag[] = []): WireSegment[] {
  const flagAt = new Map(flags.map((f) => [f.index, f.flag] as const));
  return segments.map((s, i) => ({
    raw: s.raw,
    times: s.times,
    countNote: s.countNote ?? null,
    itemId: s.result.item?.id ?? null,
    label: s.result.item?.label ?? null,
    confidence: s.result.confidence,
    reason: s.result.reason,
    gapCategory: s.result.gapCategory,
    months: s.result.months,
    source: s.source ?? 'rules',
    why: s.modelWhy ?? null,
    ...(s.absorbed ? { absorbed: true } : {}),
    ...(flagAt.has(i) ? { flag: flagAt.get(i) as string } : {}),
  }));
}

/** Back from the wire, priced by the table on this side — the id is the only thing that travels. */
export function fromWire(wire: readonly WireSegment[], table: readonly PriceItem[]): ParsedSegment[] {
  const byId = new Map(table.map((i) => [i.id, i] as const));
  return wire.map((w) => ({
    raw: w.raw,
    times: w.times,
    countNote: w.countNote,
    source: w.source,
    modelWhy: w.why,
    ...(w.absorbed ? { absorbed: true } : {}),
    result: {
      item: w.itemId ? byId.get(w.itemId) ?? null : null,
      score: w.source === 'model' ? 0.5 : w.itemId ? 1 : 0,
      matchedOn: null,
      confidence: w.confidence,
      reason: w.reason,
      gapCategory: w.gapCategory,
      months: w.months,
    },
  }));
}

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
   the model (Anthropic when a key is configured, Cloudflare Workers AI
   otherwise) and the cache. */
import type { PriceItem } from './types';
import type { ParsedSegment, MapResult } from './mapper';

export type SegmentSource = 'rules' | 'model';

export interface CatalogEntry { id: string; label: string; also: string[] }

export interface ModelAnswer { i: number; id: string | null; why?: string }

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

export const SYSTEM_PROMPT =
  'You read phrases from a patient\'s account of a diagnostic search and map each one to a unit of care ' +
  'from a fixed catalog. People describe care in lay words: "the heart ultrasound thing" is an echocardiogram; ' +
  '"they put electrodes on my legs and shocked the nerves" is a nerve and muscle test (EMG); "the tilt table where they strap you upright" is a tilt table test; ' +
  '"the monitor I wore for two weeks" is a wearable heart monitor. Read each phrase in the context of the whole story and choose the catalog unit it describes. ' +
  'Answer with JSON only, shaped {"map":[{"i":<phrase index>,"id":<catalog id or null>,"why":"<at most twelve words>"}]}. ' +
  'Use an id when the phrase describes that unit of care having been done, even in lay words. ' +
  'Use null for care that did not happen, a wait, a symptom, a feeling, a cost, a person, a place, or anything the catalog does not hold. ' +
  'Never invent an id. Never mention money.';

export function buildUserPrompt(catalog: readonly CatalogEntry[], phrases: readonly string[], story = ''): string {
  const cat = catalog.map((c) => `${c.id} | ${c.label}${c.also.length ? ` | also: ${c.also.join(', ')}` : ''}`).join('\n');
  const ph = phrases.map((p, i) => `${i}: ${p}`).join('\n');
  const ctx = story ? `THE WHOLE STORY, for context only (do not map it; map the phrases below)\n<<<${story.slice(0, 2000)}>>>\n\n` : '';
  return `CATALOG (id | label | also)\n${cat}\n\n${ctx}PHRASES TO MAP (each is a fragment of the story above; read it in that context)\n${ph}\n\nReturn {"map":[...]} with one entry per phrase index.`;
}

/** Pull the first JSON object out of a model reply; tolerate prose around it. */
export function parseModelJson(text: string): ModelAnswer[] {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const obj = JSON.parse(m[0]);
    const arr = Array.isArray(obj?.map) ? obj.map : [];
    return arr
      .filter((a: unknown) => a && typeof a === 'object' && Number.isInteger((a as ModelAnswer).i))
      .map((a: ModelAnswer) => ({ i: a.i, id: typeof a.id === 'string' ? a.id : null, why: typeof a.why === 'string' ? a.why.slice(0, 120) : undefined }));
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
}

/** Merge validated model answers into the rules' segments. Only a candidate
 *  index may change, only to a catalog id, and only from blank to a unit. */
export function applyModel(
  segments: readonly ParsedSegment[],
  candidates: readonly number[],
  answers: readonly ModelAnswer[],
  table: readonly PriceItem[],
): Applied {
  const byId = new Map(table.map((i) => [i.id, i] as const));
  const allowed = new Set(candidates);
  const out = segments.map((s) => ({ ...s, source: (s.source ?? 'rules') as SegmentSource }));
  const filled: number[] = [];
  const refused: string[] = [];
  for (const a of answers) {
    if (!a.id) continue;
    const idx = candidates[a.i];
    if (idx === undefined || !allowed.has(idx)) continue;
    const item = byId.get(a.id);
    if (!item) { refused.push(a.id); continue; }
    // A phrase is often a fragment of the sentence beside it ("the breathing test" … "where you blow into the
    // machine"). If a neighbouring phrase the rules already read names the same unit, this is the same event,
    // not a second one — leave it blank rather than count the unit twice.
    const neighbours = [out[idx - 1], out[idx + 1]].filter(Boolean);
    if (neighbours.some((n) => n && n.result.item && n.result.item.id === item.id)) continue;
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
  return { segments: out, filled, refused };
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
}

export function toWire(segments: readonly ParsedSegment[]): WireSegment[] {
  return segments.map((s) => ({
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

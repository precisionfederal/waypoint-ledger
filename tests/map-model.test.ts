/* The AI reader can only fill a blank the rules left, with an id the catalog
   holds, and never touches a price. These tests prove each of those without a
   model in the room. */
import { describe, it, expect } from 'vitest';
import { parseJourney } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';
import { catalogFor, candidatesOf, rulesReadOf, buildUserPrompt, parseModelJson, applyModel, toWire, fromWire, SYSTEM_PROMPT } from '../lib/map-model';

const STORY = 'I saw my primary care doctor twice, then a cardiologist, then the heart ultrasound thing, and I never got the sleep study because it was denied, and six months of waiting';

describe('what the model is shown', () => {
  it('sees ids, labels and synonyms — never a price', () => {
    const cat = catalogFor(SELECTABLE);
    expect(cat.length).toBe(SELECTABLE.length);
    const text = buildUserPrompt(cat, ['the heart ultrasound thing']);
    expect(text).not.toMatch(/\$\d/);
    expect(text).not.toMatch(/valueUsd|\busd\b/i);
    expect(SYSTEM_PROMPT).toMatch(/Never mention money/);
  });

  it('is asked only about the phrases the rules left blank', () => {
    const segs = parseJourney(STORY, SELECTABLE);
    const cands = candidatesOf(segs);
    for (const i of cands) {
      expect(segs[i].result.item).toBeNull();
      expect(segs[i].result.gapCategory).toBeNull();
      expect(segs[i].result.months).toBeNull();
    }
    // The denied sleep study and the six months are the rules' business, never the model's.
    const denied = segs.findIndex((s) => /sleep study/.test(s.raw));
    const wait = segs.findIndex((s) => s.result.months != null);
    if (denied >= 0) expect(cands).not.toContain(denied);
    if (wait >= 0) expect(cands).not.toContain(wait);
  });
});

describe('what the model is allowed to answer', () => {
  const segs = parseJourney('the heart ultrasound thing and a made up thing', SELECTABLE);
  const cands = candidatesOf(segs);

  it('parses JSON out of prose and drops malformed entries', () => {
    const a = parseModelJson('Sure! {"map":[{"i":0,"id":"cms-93306","why":"echocardiogram"},{"id":"x"},{"i":"1","id":null}]} thanks');
    expect(a).toEqual([{ i: 0, id: 'cms-93306', why: 'echocardiogram' }]);
    expect(parseModelJson('no json here')).toEqual([]);
    expect(parseModelJson('{"map": "nope"}')).toEqual([]);
  });

  it('refuses an id the catalog does not hold, and counts the refusal', () => {
    const r = applyModel(segs, cands, [{ i: 0, id: 'cms-00000-invented' }], SELECTABLE);
    expect(r.filled).toEqual([]);
    expect(r.refused).toEqual(['cms-00000-invented']);
    expect(r.segments[cands[0]].result.item).toBeNull();
  });

  it('fills a blank with a real unit, marked as the model\'s, priced by the table', () => {
    const id = SELECTABLE[0].id;
    const r = applyModel(segs, cands, [{ i: 0, id, why: 'named it' }], SELECTABLE);
    expect(r.filled).toEqual([cands[0]]);
    const s = r.segments[cands[0]];
    expect(s.source).toBe('model');
    expect(s.modelWhy).toBe('named it');
    expect(s.result.item?.id).toBe(id);
    expect(s.result.item?.valueUsd).toBe(SELECTABLE[0].valueUsd);
  });

  it('cannot touch a phrase the rules already read', () => {
    const story = 'two visits to my primary care doctor';
    const rules = parseJourney(story, SELECTABLE);
    const matched = rules.findIndex((s) => s.result.item);
    expect(matched).toBeGreaterThanOrEqual(0);
    const other = SELECTABLE.find((i) => i.id !== rules[matched].result.item!.id)!;
    // An answer index that is not a candidate is ignored outright.
    const r = applyModel(rules, candidatesOf(rules), [{ i: 0, id: other.id }], SELECTABLE);
    expect(r.segments[matched].result.item?.id).toBe(rules[matched].result.item!.id);
    expect(r.segments[matched].source).toBe('rules');
  });
});

describe('the wire', () => {
  it('carries ids and labels, never a figure, and prices again on this side', () => {
    const segs = parseJourney('two visits to my primary care doctor and the heart ultrasound thing', SELECTABLE);
    const wire = toWire(segs);
    for (const w of wire) expect(Object.keys(w)).not.toContain('valueUsd');
    expect(JSON.stringify(wire)).not.toMatch(/valueUsd|\$\d/);
    const back = fromWire(wire, SELECTABLE);
    expect(back.map((b) => b.result.item?.id ?? null)).toEqual(segs.map((s) => s.result.item?.id ?? null));
    expect(back.map((b) => b.times)).toEqual(segs.map((s) => s.times));
  });
});

describe('one clause, one line', () => {
  it('absorbs the tail fragment when the model names the unit its neighbour already carries', () => {
    const segs = parseJourney('they put electrodes on my legs and shocked the nerves', SELECTABLE);
    const cands = candidatesOf(segs);
    expect(cands.length).toBeGreaterThanOrEqual(2);
    const emg = SELECTABLE.find((i) => /EMG/i.test(i.label))!;
    const r = applyModel(segs, cands, [{ i: 0, id: emg.id, why: 'electrodes' }, { i: 1, id: emg.id, why: 'same test' }], SELECTABLE);
    expect(r.filled).toEqual([cands[0]]);
    expect(r.segments[cands[0]].result.item?.id).toBe(emg.id);
    expect(r.segments[cands[1]].absorbed).toBe(true);
    expect(r.segments[cands[1]].result.item).toBeNull();
    const wire = toWire(r.segments);
    expect(wire[cands[1]].absorbed).toBe(true);
    expect(fromWire(wire, SELECTABLE)[cands[1]].absorbed).toBe(true);
    // Priced once: the absorbed fragment carries no unit.
    expect(r.segments.filter((s) => s.result.item?.id === emg.id).length).toBe(1);
  });
});

describe('the model sees what the rules already read', () => {
  it('lists every phrase the rules answered, with the id it landed on', () => {
    const segs = parseJourney(STORY, SELECTABLE);
    const read = rulesReadOf(segs);
    const cands = candidatesOf(segs);
    // The two lists partition the segments: every phrase is asked about or shown as read.
    expect(read.length + cands.length).toBe(segs.length);
    for (const r of read) expect(cands).not.toContain(r.index);
    expect(read.some((r) => r.id !== null)).toBe(true);
  });

  it('puts the already-read phrases in the prompt, and still never a price', () => {
    const segs = parseJourney(STORY, SELECTABLE);
    const text = buildUserPrompt(catalogFor(SELECTABLE), ['the heart ultrasound thing'], STORY, rulesReadOf(segs));
    expect(text).toMatch(/ALREADY READ by a keyword matcher/);
    expect(text).not.toMatch(/\$\d/);
    expect(text).not.toMatch(/valueUsd/);
  });

  it('tells the model that denied, refused and unaffordable care is null', () => {
    expect(SYSTEM_PROMPT).toMatch(/NEGATION/);
    expect(SYSTEM_PROMPT).toMatch(/could not afford/);
    expect(SYSTEM_PROMPT).toMatch(/it never changes an answer, a count or a price/);
  });
});

describe('a flag is a report, never an override', () => {
  const story = 'two visits to my primary care doctor and the heart ultrasound thing';

  it('carries the flag to the wire and leaves the rules answer exactly as it was', () => {
    const segs = parseJourney(story, SELECTABLE);
    const cands = candidatesOf(segs);
    const read = rulesReadOf(segs);
    expect(read.length).toBeGreaterThan(0);
    const before = segs.map((s) => s.result.item?.id ?? null);
    const r = applyModel(segs, cands, [{ r: 0, flag: 'this looks like a specialist visit' }], SELECTABLE, read);
    expect(r.filled).toEqual([]);
    expect(r.segments.map((s) => s.result.item?.id ?? null)).toEqual(before);
    expect(r.flags).toEqual([{ scope: 'read', index: read[0].index, raw: read[0].raw, ruleId: read[0].id, flag: 'this looks like a specialist visit' }]);
    const wire = toWire(r.segments, r.flags);
    expect(wire[read[0].index].flag).toBe('this looks like a specialist visit');
    // The flag never reaches the priced side: fromWire ignores it.
    expect(fromWire(wire, SELECTABLE)[read[0].index].result.item?.id ?? null).toBe(before[read[0].index]);
  });

  it('drops a flag whose index names no phrase, and never invents a segment', () => {
    const segs = parseJourney(story, SELECTABLE);
    const r = applyModel(segs, candidatesOf(segs), [{ r: 99, flag: 'nowhere' }], SELECTABLE, rulesReadOf(segs));
    expect(r.flags).toEqual([]);
    expect(r.segments.length).toBe(segs.length);
  });

  it('parses an answer that carries an id and a flag together, and keeps both jobs separate', () => {
    const a = parseModelJson('{"map":[{"i":0,"id":"cms-99213","why":"visit"},{"r":1,"flag":"the rules read a wait as care"}]}');
    expect(a.length).toBe(2);
    expect(a[0].i).toBe(0);
    expect(a[0].id).toBe('cms-99213');
    expect(a[1].r).toBe(1);
    expect(a[1].flag).toBe('the rules read a wait as care');
    expect(a[1].id).toBeNull();
  });
});

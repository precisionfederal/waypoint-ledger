/* FINAL-1011 journeys: lived experience from published research, made into labelled composite journeys.
   Bo, 2026-10-11: "We never say these are live interviews and live feedback."
   Rules line 487: "Misrepresentation of data, manipulation of facts, or misleading claims are not permitted."
   So: every quote is in the saved text word for word, every text matches its recorded fingerprint, every
   journey carries the composite label, every step names the finding that documents it, and every price on
   the page comes from the reader and the table, never typed. */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { priceSentence } from '../lib/conditions-catalog';
import { SELECTABLE } from '../lib/table';
import { parseJourney } from '../lib/mapper';
import { clampTimes } from '../lib/pricing';
import { ITEMS, clampPerYear, unpriceableHit } from '../lib/store';
import {
  COMPOSITE_LABEL, FEATURES, LIVED_SOURCES, RESEARCH_JOURNEYS, SOURCE_KINDS, THEMES,
  findingById, ledgerOf, sourceById, sourceIdsOf, storyOf,
} from '../lib/research-journeys';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/* The saved source texts stay in the private repo (some are reports we may quote
   but not redistribute), so the public copy skips the two checks that read them. */
const TEXTS = existsSync(join(ROOT, 'data', 'lived-experience-text'));
const itTexts = TEXTS ? it : it.skip;
/** The builder's own matching: NFKC, curly quotes and dashes folded, whitespace collapsed, case folded. */
const norm = (s: string) => s.normalize('NFKC')
  .replace(/[‐-―−]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s+/g, ' ').trim().toLowerCase();

describe('lived-experience sources: published, fetched, fingerprinted, quoted verbatim', () => {
  it('holds 25 to 40 sources of the five allowed kinds, none a forum or social post', () => {
    expect(LIVED_SOURCES.length).toBeGreaterThanOrEqual(25);
    expect(LIVED_SOURCES.length).toBeLessThanOrEqual(40);
    for (const s of LIVED_SOURCES) {
      expect(SOURCE_KINDS).toContain(s.kind);
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.url).not.toMatch(/reddit|facebook|twitter|x\.com|tiktok|instagram|forum/i);
      expect(s.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.findings.length).toBeGreaterThan(0);
    }
    expect(new Set(LIVED_SOURCES.map((s) => s.id)).size).toBe(LIVED_SOURCES.length);
  });

  itTexts('every saved text matches the SHA-256 recorded for it', () => {
    for (const s of LIVED_SOURCES) {
      const text = read(s.textFile);
      expect(createHash('sha256').update(text, 'utf8').digest('hex'), s.id).toBe(s.sha256);
    }
  });

  itTexts('every quote is 25 words or fewer and appears word for word in its source text', () => {
    const missing: string[] = [];
    for (const s of LIVED_SOURCES) {
      const text = norm(read(s.textFile));
      for (const f of s.findings) {
        expect(f.quote.split(/\s+/).length, f.id).toBeLessThanOrEqual(25);
        expect(f.locator.length, f.id).toBeGreaterThan(0);
        if (!text.includes(norm(f.quote))) missing.push(f.id);
      }
    }
    expect(missing).toEqual([]);
  });

  it('finding ids are unique and every theme on the page has findings and a real feature', () => {
    const ids = LIVED_SOURCES.flatMap((s) => s.findings.map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of THEMES) for (const k of t.features) expect(FEATURES[k]).toBeTruthy();
  });
});

describe('composite journeys: labelled, every step sourced, priced only by the reader', () => {
  it('there are six to eight, each carrying the composite label', () => {
    expect(RESEARCH_JOURNEYS.length).toBeGreaterThanOrEqual(6);
    expect(RESEARCH_JOURNEYS.length).toBeLessThanOrEqual(8);
    for (const j of RESEARCH_JOURNEYS) expect(j.label).toBe('Composite journey, built from published patient research');
  });

  it('every step, every years figure and every research line names a finding that exists', () => {
    for (const j of RESEARCH_JOURNEYS) {
      for (const st of j.steps) {
        expect(st.findings.length, `${j.id}: ${st.said}`).toBeGreaterThan(0);
        for (const f of st.findings) expect(findingById(f), `${j.id}: ${f}`).not.toBeNull();
      }
      for (const f of [...(j.years?.findings ?? []), ...j.whatTheResearchSays]) expect(findingById(f), `${j.id}: ${f}`).not.toBeNull();
      for (const id of sourceIdsOf(j)) expect(sourceById(id)).not.toBeNull();
      if (j.years) expect(j.years.low).toBeLessThanOrEqual(j.years.high); else expect(j.span).toBeTruthy();
    }
  });

  it('every sentence parses to at least three priced lines through the existing reader and table', () => {
    for (const j of RESEARCH_JOURNEYS) {
      const r = priceSentence(storyOf(j), SELECTABLE);
      expect(r.pricedCount, j.id).toBeGreaterThanOrEqual(3);
      expect(r.pricedTotalUsd, j.id).toBeGreaterThan(0);
      for (const l of r.lines) if (l.lineUsd !== null) expect(SELECTABLE.some((i) => i.id === l.itemId), l.raw).toBe(true);
    }
  });

  it('each card total equals what the ledger itself adds for the same sentence (store addStory replayed)', () => {
    for (const j of RESEARCH_JOURNEYS) {
      let total = 0; let priced = 0;
      for (const sg of parseJourney(storyOf(j), ITEMS)) {
        if (sg.absorbed || unpriceableHit(sg.raw) || !sg.result.item || sg.result.item.valueUsd === null) continue;
        const t = clampTimes(sg.result.item, clampPerYear(sg.result.item, sg.times).times).times;
        total += sg.result.item.valueUsd * t; priced++;
      }
      const card = ledgerOf(storyOf(j));
      expect(card.pricedTotalUsd, j.id).toBeCloseTo(total, 2);
      expect(card.pricedCount, j.id).toBe(priced);
      expect(card.pricedCount, j.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('a dismissal step reads as counted and never priced, a hospital stay stays unpriced', () => {
    const lines = RESEARCH_JOURNEYS.flatMap((j) => priceSentence(storyOf(j), SELECTABLE).lines);
    const told = lines.filter((l) => /was told it was anxiety/.test(l.raw));
    expect(told.length).toBeGreaterThanOrEqual(4);
    for (const l of told) expect(l.lineUsd).toBeNull();
    const stay = lines.find((l) => /stayed in the hospital/.test(l.raw));
    expect(stay?.lineUsd).toBeNull();
  });
});

describe('the page says exactly what this is', () => {
  const page = read('app/lived-experience/page.tsx');
  const lib = read('lib/research-journeys.ts');
  const paraphrases = LIVED_SOURCES.flatMap((s) => s.findings.map((f) => f.finding)).join('\n');

  it('names the composites as composites, not interviews or real people, and links the register', () => {
    expect(page).toContain('COMPOSITE_LABEL');
    expect(page).toMatch(/Each journey is a composite built from this published research/);
    expect(page).toContain('href="/register"');
    expect(COMPOSITE_LABEL).toMatch(/^Composite journey/);
  });

  it('never calls the research ours: no interview, user, feedback or "told us" claim', () => {
    for (const t of [page, lib, paraphrases]) {
      expect(t).not.toMatch(/\bwe interviewed\b|\bour interview|\busers? (told|said)\b|community told us|\btold us\b|\bfeedback from\b|\bour users\b/i);
    }
  });

  it('types no dollar figure and never uses the banned words', () => {
    expect(page).not.toMatch(/\$\s?\d/);
    expect(lib).not.toMatch(/\$\s?\d/);
    for (const t of [page, lib]) expect(t).not.toMatch(/\bexcess\b|this is what you paid|AI prices/i);
    expect(page).toContain('ledgerOf(story)');
    expect(lib).toContain('priceSentence(story, SELECTABLE)');
  });
});

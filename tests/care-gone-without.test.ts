/* ==========================================================================
   CARE GONE WITHOUT, AT THE CENTRE OF THE LEDGER.

   Every answer to the burden survey received by 30 September 2026 ranked
   "Care you went without" first. The ledger now shows it directly under the
   total. These tests pin the rules that make that honest:

   1. It is a count. Nothing in lib/forgone.ts returns money, and the band
      prints no dollar figure.
   2. The "ranked first by X of Y" sentence is computed from the live
      aggregate, and is absent rather than invented when it cannot be read.
   3. The counts go to the same gap categories /gap and /api/gap already use.
   4. It sits under the total, above the table.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as F from '../lib/forgone';
import { validateGap, CATEGORY_IDS } from '../cf/functions/api/gap.js';
import { BURDEN_IDS } from '../lib/survey-def.js';

describe('it is a count, never a price', () => {
  it('reads its two categories from the gap counter itself', () => {
    const rows = F.forgoneRows();
    expect(rows.map((r) => r.id)).toEqual(['care-not-sought', 'care-denied']);
    for (const r of rows) expect(CATEGORY_IDS).toContain(r.id);
    expect(BURDEN_IDS).toContain(F.FORGONE_BURDEN);
  });
  it('the body it sends is counts only, and /api/gap accepts it', () => {
    const body = F.forgoneGapBody({ 'care-not-sought': 3, 'care-denied': 0 }, '2026-09-09.1')!;
    expect(body).toEqual({ counts: { 'care-not-sought': 3 }, tableVersion: '2026-09-09.1' });
    const v = validateGap(body) as { record?: { counts: Record<string, number> } };
    expect(v.record?.counts).toEqual({ 'care-not-sought': 3 });
    expect(F.forgoneGapBody(F.EMPTY_FORGONE, 'v')).toBeNull();
  });
  it('clamps what it reads back from storage', () => {
    expect(F.normalizeForgone({ 'care-not-sought': -4, 'care-denied': 1e9 })).toEqual({ 'care-not-sought': 0, 'care-denied': F.FORGONE_MAX });
    expect(F.normalizeForgone('junk')).toEqual(F.EMPTY_FORGONE);
  });
  it('no dollar sign, no money helper and no price anywhere in the band or its rules', () => {
    const lib = readFileSync('lib/forgone.ts', 'utf8');
    const ui = readFileSync('components/CareGoneWithout.tsx', 'utf8');
    for (const src of [lib, ui]) {
      expect(src).not.toMatch(/\$\d/);
      expect(src).not.toMatch(/\bmoney\(|\busd\(|valueUsd|toLocaleString\(\s*'en-US',\s*\{\s*style:\s*'currency'/);
    }
    expect(ui).toContain('never given one');
  });
});

describe('the survey sentence comes from the live aggregate', () => {
  const live = { n: 12, submissions: 14, senderBasis: 'senders', ranking: [{ burden: 'forgone', rankedFirstBy: 9 }, { burden: 'oop', rankedFirstBy: 2 }] };
  it('says how many answers ranked it heaviest, in answers, never people', () => {
    const r = F.forgoneRank(live)!;
    expect(r).toEqual({ first: 9, answers: 14, top: true });
    expect(F.forgoneRankSentence(r)).toBe('9 of 14 survey answers ranked it heaviest of the five burdens.');
    expect(F.forgoneRankSentence(r)).not.toMatch(/\bpeople\b|\bperson\b/);
  });
  it('says one answer, not one answers', () => {
    expect(F.forgoneRankSentence({ first: 1, answers: 1, top: true })).toBe('1 of 1 survey answer ranked it heaviest of the five burdens.');
  });
  it('never says heaviest when another burden was ranked first more often', () => {
    const r = F.forgoneRank({ n: 12, submissions: 12, ranking: [{ burden: 'forgone', rankedFirstBy: 2 }, { burden: 'oop', rankedFirstBy: 3 }] })!;
    expect(r.top).toBe(false);
    expect(F.forgoneRankSentence(r)).toBe('2 of 12 survey answers ranked it first of the five burdens.');
  });
  it('tells an empty survey (staging, 0 answers) from one it could not read', () => {
    expect(F.surveyIsEmpty({ n: 0, submissions: 0, ranking: [] })).toBe(true);
    expect(F.surveyIsEmpty(null)).toBe(false);
    expect(F.surveyIsEmpty(live)).toBe(false);
  });
  it('says nothing below the small-cell line: 9 answers, 6 of them ranking it first, is not said (2026-10-01 live register)', () => {
    expect(F.forgoneRank({ n: 9, submissions: 9, ranking: [{ burden: 'forgone', rankedFirstBy: 6 }, { burden: 'time', rankedFirstBy: 1 }] })).toBeNull();
    expect(F.forgoneRank({ n: 10, submissions: 10, ranking: [{ burden: 'forgone', rankedFirstBy: 10 }] })).toBeNull();
  });
  it('uses the same small-cell line as the rest of the site', async () => {
    const def = await import('../lib/survey-def.js');
    expect(F.RANK_MIN_ANSWERS).toBe(def.SMALL_CELL_MIN);
  });
  it('says nothing when there is nothing to read', () => {
    expect(F.forgoneRank(null)).toBeNull();
    expect(F.forgoneRank({ n: 0, submissions: 0, ranking: [] })).toBeNull();
    expect(F.forgoneRank({ ok: true, n: 0 } as unknown as F.SurveyAggregateLike)).toBeNull();
  });
  it('reads the same whether or not senders are known', () => {
    const r = F.forgoneRank({ n: 11, submissions: 11, senderBasis: 'sends', ranking: [{ burden: 'forgone', rankedFirstBy: 2 }] })!;
    expect(F.forgoneRankSentence(r)).toBe('2 of 11 survey answers ranked it heaviest of the five burdens.');
  });
  it('the number is never typed into the page', () => {
    const ui = readFileSync('components/CareGoneWithout.tsx', 'utf8');
    expect(ui).toContain("fetch('/api/survey')");
    expect(ui).not.toMatch(/\b4 of 4\b/);
  });
});

describe('it sits at the centre of the ledger', () => {
  const ledger = readFileSync('components/Ledger.tsx', 'utf8');
  it('comes after the total and before the burden fold and the table, and the table comes before the fold', () => {
    const total = ledger.indexOf('<TotalReveal');
    const band = ledger.indexOf('<CareGoneWithout />');
    const fold = ledger.indexOf('<BurdenLedger />');
    const table = ledger.indexOf('table-card');
    expect(total).toBeGreaterThan(0);
    expect(band).toBeGreaterThan(total);
    expect(band).toBeLessThan(fold);
    expect(band).toBeLessThan(table);
    expect(table).toBeLessThan(fold);
  });
  /* JUDGE-PANEL-R2 2.2 / S-1: at 390 px it rendered after the table (y about
     4,806 px) while desktop had it under the total. The test above read only the
     first occurrence, so the phone copy slipped past it. One element, on every
     width, before "Who carries this cost" and the lines. */
  it('renders once, on every width: never gated on phone, before WhoPays and the table', () => {
    expect(ledger.match(/<CareGoneWithout\b/g)).toHaveLength(1);
    expect(ledger).not.toMatch(/phone\s*&&\s*<CareGoneWithout/);
    const band = ledger.indexOf('<CareGoneWithout />');
    expect(ledger.slice(band - 40, band)).not.toMatch(/phone/);
    expect(band).toBeGreaterThan(ledger.indexOf('<TotalReveal'));
    expect(band).toBeLessThan(ledger.indexOf('<WhoPays'));
    expect(band).toBeLessThan(ledger.indexOf('<section className="card table-card" id="lines">'));
  });
});

describe('it is compact (round 2 decision) and truthful at 0 and at 4 answers', () => {
  const ui = readFileSync('components/CareGoneWithout.tsx', 'utf8');
  it('the counters open in place from one button', () => {
    expect(ui).toContain('aria-expanded={open}');
    expect(ui).toContain('aria-controls="forgone-panel"');
    expect(ui).toContain('hidden={!open}');
  });
  it('says the survey is empty rather than ranking anything at 0 answers', () => {
    expect(ui).toContain('The burden survey has no answers yet.');
    expect(ui).not.toContain('The burden people ranked heaviest');
  });
  it('shows no storage key and no grey slab (judge J6, desktop F13/F15)', () => {
    expect(ui).not.toMatch(/<code/);
    expect(ui).not.toContain('FORGONE_KEY');
    expect(ui).toContain('Kept only in this browser until you send it.');
    expect(ui).toContain('{entered > 0 && (');
    expect(ui).not.toMatch(/borderLeft:\s*'4px/);
  });
  it('says "federal cost file", and that surveys count it but none prices it (desktop F10)', () => {
    expect(ui).toContain('no row in\n          any federal cost file');
    expect(ui).toContain('National surveys count that it happened; none attaches a dollar to it.');
  });
});

/* JUDGE-3 #14: the home page showed three different example journeys: the
   placeholder (doctor x3, ER once), the preview card (doctor x6, cardiologist,
   ER x2, $1,838) and "See it done" (9 lines, $2,693). The preview is now labelled
   as three lines of the example, and the placeholder is those same three lines in
   the example's words, the length of the sentence it replaced. Read from the source: page.tsx may not export. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseJourney } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';
import { EXAMPLE_LEDGER_STORY, exampleLedger } from '../lib/store';
import { shownLines } from '../lib/pricing';

const PAGE = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const EXAMPLE = /const EXAMPLE = '([^']+)'/.exec(PAGE)![1];
const PREVIEW = [...PAGE.slice(PAGE.indexOf('const PREVIEW = ['), PAGE.indexOf('];', PAGE.indexOf('const PREVIEW = ['))).matchAll(/id: '([^']+)', n: (\d+)/g)].map((m) => ({ id: m[1], n: Number(m[2]) }));
const priced = (s: string) => parseJourney(s, SELECTABLE).filter((x) => !x.absorbed && x.result.item).map((x) => ({ id: x.result.item!.id, n: x.times, usd: x.result.item!.valueUsd ?? 0 }));

describe('JUDGE-3 #14: one example journey on the home page', () => {
  it('the preview card is three lines of the example ledger, same rows, same counts', () => {
    expect(PREVIEW).toHaveLength(3);
    const ex = exampleLedger().map((e) => ({ id: e.item!.id, n: e.times }));
    for (const p of PREVIEW) expect(ex).toContainEqual(p);
    expect(PAGE).toContain('three lines of the full example');
  });
  it('the placeholder reads to exactly the preview rows, so typing it gives the preview total', () => {
    const lines = priced(EXAMPLE);
    expect(lines.map(({ id, n }) => ({ id, n }))).toEqual(PREVIEW);
    expect(Math.round(lines.reduce((a, l) => a + l.usd * l.n, 0))).toBe(1838);
  });
  it('the placeholder is in the example story\'s words', () => {
    expect(EXAMPLE_LEDGER_STORY).toContain('saw my regular doctor about the fatigue six times');
    expect(EXAMPLE).toContain('saw my regular doctor six times');
    for (const clause of ['a first visit with a cardiologist', 'went to the ER twice when my heart was racing']) {
      expect(EXAMPLE).toContain(clause);
      expect(EXAMPLE_LEDGER_STORY).toContain(clause);
    }
  });
  it('the full example still totals $2,693', () => {
    const t = exampleLedger().reduce((a, e) => a + (e.item!.valueUsd ?? 0) * e.times, 0);
    expect(t.toFixed(2)).toBe('2692.51');
  });
  it('the three shown lines add up to the shown total, to the cent', () => {
    const vals = PREVIEW.map((p) => (SELECTABLE.find((i) => i.id === p.id)!.valueUsd ?? 0) * p.n);
    const { lines, total } = shownLines(vals);
    expect(lines).toEqual(['$571.14', '$177.36', '$1,089.08']);
    expect(total).toBe('$1,837.58');
    const cents = (t: string) => Math.round(Number(t.replace(/[$,]/g, '')) * 100);
    expect(lines.reduce((a, l) => a + cents(l), 0)).toBe(cents(total));
    // and the page renders those, not whole dollars rounded on their own
    expect(PAGE).toContain('<b>{shown.lines[i]}</b>');
    expect(PAGE).toContain('<b>{shown.total}</b>');
  });
  it('shown lines always add to the shown total, whatever the values', () => {
    const cents = (t: string) => Math.round(Number(t.replace(/[$,]/g, '')) * 100);
    for (let k = 0; k < 500; k++) {
      const vals = Array.from({ length: 1 + (k % 6) }, (_, j) => ((k * 7919 + j * 104729) % 250000) / 97);
      const { lines, total } = shownLines(vals);
      expect(lines.reduce((a, l) => a + cents(l), 0)).toBe(cents(total));
    }
  });
});

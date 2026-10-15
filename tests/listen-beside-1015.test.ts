/* Judge panel 15 Oct B-7 after B-1: Listen speaks the same total the card shows. With
   "He prescribed an antidepressant." on the ledger, the yearly prescriptions survey
   figure is said beside the total, as the card prints it, never as a line inside it,
   and its 2018 dollar year does not enter the total's year phrase. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TotalReveal from '../components/TotalReveal';
import { parseJourney } from '../lib/mapper';
import { ITEMS, exampleLedger } from '../lib/store';
import { besideSentence, priceJourney, totals, usd } from '../lib/pricing';
import { fitOf } from '../lib/fit';
import { TABLE_VERSION } from '../lib/table';
import { ledgerScript, spokenLineOf } from '../lib/speech';
import type { JourneyEntry } from '../lib/types';

const LABEL = "Medicare's price for the care you listed";
const entries: JourneyEntry[] = [...exampleLedger(), ...parseJourney('He prescribed an antidepressant.', ITEMS).map((s, i) => ({ key: `rx${i}`, raw: s.raw, item: s.result.item, times: s.times }) as JourneyEntry)];
const fits = new Map(entries.filter((e) => e.item).map((e) => [e.key, fitOf(e.item!, {})]));
const lines = priceJourney(entries, (e) => (e.item ? fits.get(e.key)?.figureUsd ?? null : undefined));
const sum = totals(lines);
const beside = besideSentence(sum.beside);
const script = ledgerScript({
  label: LABEL, beside, totalUsd: sum.totalUsd, pricedCount: sum.pricedCount,
  lines: lines.filter((l) => !sum.beside.includes(l)).map((l) => spokenLineOf(l, fits.get(l.entry.key))),
  agencies: ['CMS'], tableVersion: TABLE_VERSION,
});
const text = script.join(' ');

describe('B-7: Listen says the card\'s total, with the prescriptions figure beside it', () => {
  it('the first sentence is the card\'s label and the card\'s big number', () => {
    const html = renderToStaticMarkup(createElement(TotalReveal, { totalUsd: sum.totalUsd, pricedCount: sum.pricedCount, tableVersion: TABLE_VERSION, label: LABEL, beside }));
    const shown = html.match(/class="big-num"[^>]*>([^<]+)</)?.[1];
    expect(shown).toBe(usd(sum.totalUsd));
    expect(script[0]).toContain(`${LABEL}: ${shown}, in 2026 dollars. That is ${sum.pricedCount} priced lines`);
    expect(html).toContain(`${beside}.`);
  });
  it('the beside sentence is spoken right after the total, and the rx row is never a priced line', () => {
    expect(beside).toMatch(/^Shown beside the total, not in it: /);
    expect(script[1]).toBe(`${beside}.`);
    const rx = sum.beside[0].entry.item!;
    expect(text.split(rx.label).length - 1).toBe(1);
    expect(text).not.toMatch(/each in its own year/);
  });
  it('the ledger and the sheet hand Listen the same label, total and beside sentence the card prints', () => {
    const ledger = readFileSync('components/Ledger.tsx', 'utf8');
    expect(ledger).toContain(`label: st.example ? "Medicare's price for the example's care" : "Medicare's price for the care you listed",`);
    expect(ledger).toContain('beside: suppressed ? null : beside,');
    expect(ledger).toContain('g.lines.filter((l) => !sum.beside.includes(l))');
    const sheet = readFileSync('app/sheet/page.tsx', 'utf8');
    expect(sheet).toContain('beside: besideSentence(sum.beside),');
    expect(sheet).toContain('rows.filter((l) => !sum.beside.includes(l))');
  });
});

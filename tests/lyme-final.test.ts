/* ==========================================================================
   FINAL-1011 lyme: the Lyme comparison on /conditions, read the way a judge's
   copy, reader view or crawler reads it (tags and React's text-node comments
   turned into spaces), plus the Lyme card in the picker and ?example=lyme.

   The live build read "$1,333 median mean $0 mean per reported case , median
   $478 ." because the drawing's words were page text and the sentence was cut
   into text nodes. These tests fail if either comes back.

   The paper's own numbers (Hook SA et al., Emerg Infect Dis 2022;28(6):1170-1179,
   PMC9155891), Table 4, "Societal perspective of medical cost of Lyme disease per
   participant": row "All 613 478 1,333 5,690 164 1,932 50-121,869" under the
   columns No. participants, Median, Mean, SD, 10th, 90th, Range (2016 US dollars).
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import conditionsRaw from '../data/conditions.json';
import pricesRaw from '../data/prices.json';
import type { RawConditionsFile, RawPrice } from '../lib/conditions-core';
import { catalogOf } from '../lib/conditions-catalog';
import { benchmarkFor, conditionById } from '../lib/conditions';
import { SELECTABLE } from '../lib/table';
import { COMPOSED_EXAMPLES, composedExampleIn, composedExampleLedger } from '../lib/store';

const FILE = conditionsRaw as unknown as RawConditionsFile;
const PRICES = pricesRaw as unknown as { items: (RawPrice & { year?: string; basis?: string; source_url?: string; value_usd?: number | null })[] };
const ROW = new Map(PRICES.items.map((r) => [r.id, r]));
const lyme = () => catalogOf(FILE, PRICES, SELECTABLE).find((x) => x.condition.id === 'lyme')!;
/** What a text extractor gets: comments and tags become spaces, whitespace collapses. */
const extract = (html: string) => html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&rsquo;/g, '\u2019').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const count = (t: string, re: RegExp) => (t.match(re) ?? []).length;

async function panelHtml(): Promise<string> {
  const { renderToString } = await import('react-dom/server');
  const { createElement } = await import('react');
  const { ValidationPanel } = await import('../app/conditions/Catalog');
  return renderToString(createElement(ValidationPanel, { entry: lyme() }));
}

describe('the published side reads cleanly', () => {
  it('the figures are the paper\u2019s Table 4 row, mean and median', () => {
    const f = lyme().condition.publishedFigures.find((x) => x.compareWithJourney)!;
    expect(f.valueUsd).toBe(1333);
    expect(f.medianUsd).toBe(478);
    expect(f.dollarsYear).toBe(2016);
    expect(f.population).toMatch(/^613 people/);
  });

  it('mean and median are each labelled once, each beside its own value, and no "$0"', async () => {
    const text = extract(await panelHtml());
    const pub = text.slice(0, text.indexOf('Never added'));
    expect(pub).toContain('$1,333 Mean per reported case: $1,333. Median: $478.');
    // the drawing beside it carries marks only: its words would be a second label
    expect(count(pub, /\bmean\b/gi)).toBe(1);
    expect(count(pub, /\bmedian\b/gi)).toBe(1);
    expect(text).not.toContain('$0');
    expect(text).not.toMatch(/median mean|mean median/i);
  });

  it('no stray space before punctuation anywhere in the panel', async () => {
    const text = extract(await panelHtml());
    expect(text).not.toMatch(/\w \.(\s|$)/);
    expect(text).not.toMatch(/\w ,/);
    expect(text).not.toMatch(/\s:\s/);
  });

  it('the drawing carries no words of its own in the page text', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { RangeMarks } = await import('../components/FigureVisual');
    for (const props of [{ point: 1333, median: 478 }, { point: 4098, low: 1619, high: 6578 }, { point: 1333, median: 478, zero: false }]) {
      const html = renderToStaticMarkup(createElement(RangeMarks, props));
      expect(extract(html), JSON.stringify(props)).toBe('');
    }
    const off = renderToStaticMarkup(createElement(RangeMarks, { point: 1333, median: 478, zero: false, words: false }));
    expect(off).not.toContain('$0');
    expect(off).not.toContain('data-lab');
    // the panel draws it that way: no data-lab at all inside the validation panel
    expect(await panelHtml()).not.toContain('data-lab');
  });
});

describe('the tool side: every line in the sum is a priced federal row', () => {
  it('four priced lines, each a 2026 Medicare-allowed row with its source, summing to $222.90', async () => {
    const ex = lyme().example!;
    const priced = ex.lines.filter((l) => l.lineUsd !== null);
    expect(priced.map((l) => l.itemId)).toEqual(['cms-99213', 'cms-lab-lyme-screen', 'cms-lab-lyme-confirm', 'cms-99213']);
    for (const l of priced) {
      const r = ROW.get(l.itemId!)!;
      expect(r, l.itemId!).toBeTruthy();
      expect(r.year).toBe('2026');
      expect(r.basis).toBe('allowed_amount');
      expect(r.source_url).toMatch(/^https:\/\/www\.cms\.gov\//);
      expect(l.lineUsd).toBe(Math.round(r.value_usd! * l.times * 100) / 100);
    }
    expect(ex.pricedTotalUsd).toBe(222.9);
    expect(ex.unpricedCount).toBe(2);
    const text = extract(await panelHtml());
    expect(text).toContain('This tool (2026 dollars) $222.90');
    expect(text).toContain('Different years: the published figure is in 2016 dollars and the tool\u2019s is in 2026 dollars.');
    expect(text).not.toContain((1333 + 222.9).toFixed(2));
  });
});

describe('the Lyme card in the picker: the per-case figure as its own kind', () => {
  it('Lyme keeps no year figure: the per-case cost is never put in the year slot', () => {
    expect(conditionById('lyme')!.priceRowId ?? null).toBeNull();
    expect(benchmarkFor('lyme')!.kind).toBe('none');
  });

  it('shows the per-case figure, says the missing thing is a year, never "year ahead", never summed', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { YearAheadCard } = await import('../components/ConditionPicker');
    const text = extract(renderToStaticMarkup(createElement(YearAheadCard, { conditionId: 'lyme' })));
    expect(text).toContain('No published figure for a year');
    expect(text).toContain('$1,333 mean, $478 median, per reported case');
    expect(text).toContain('Not a year, and not what the person paid.');
    expect(text).toContain('Never added to your ledger.');
    expect(text).not.toMatch(/year ahead/i);
    expect(text).not.toContain('$0');
    // never summed: neither the two per-case means together nor mean + median
    for (const n of [1333 + 1252, 1333 + 478, 1252 + 244]) expect(text).not.toContain('$' + n.toLocaleString('en-US'));
  });

  it('a condition with no figure of any kind still says plainly "No published figure"', async () => {
    const none = (FILE.conditions as unknown as { id: string; price_row_id: string | null; published_figures?: unknown[] }[])
      .find((c) => !c.price_row_id && !(c.published_figures ?? []).length)!;
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { YearAheadCard } = await import('../components/ConditionPicker');
    const html = renderToStaticMarkup(createElement(YearAheadCard, { conditionId: none.id }));
    expect(html).toContain('>No published figure<');
  });
});

describe('?example=lyme: a composed Lyme journey, labelled as one', () => {
  it('reads the link, and nothing else', () => {
    expect(composedExampleIn('?example=lyme')).toBe('lyme');
    expect(composedExampleIn('?s=abcd&example=lyme')).toBe('lyme');
    for (const q of ['', '?example=1', '?example=LYME', '?example=__proto__', '?example=toString']) expect(composedExampleIn(q), q).toBeNull();
  });

  it('is the very sentence /conditions prices, so the two can never disagree', () => {
    const raw = (FILE.conditions as unknown as { id: string; example_journey: { sentence: string } }[]).find((c) => c.id === 'lyme')!;
    expect(COMPOSED_EXAMPLES.lyme.story).toBe(raw.example_journey.sentence);
  });

  it('loads as ledger lines priced only from existing rows, to the same $222.90', () => {
    const lines = composedExampleLedger('lyme');
    expect(lines.length).toBe(6);
    const ids = lines.filter((l) => l.item).map((l) => l.item!.id);
    expect(ids).toEqual(['cms-99213', 'cms-lab-lyme-screen', 'cms-lab-lyme-confirm', 'cms-99213']);
    for (const id of ids) expect(ROW.has(id)).toBe(true);
    const sum = Math.round(lines.reduce((a, l) => a + (l.item?.valueUsd ?? 0) * l.times, 0) * 100) / 100;
    expect(sum).toBe(lyme().example!.pricedTotalUsd);
    // the same two unpriced lines /conditions names, kept on the ledger by name, never guessed
    expect(lines.filter((l) => !l.item).map((l) => l.raw)).toEqual(['found a tick bite', 'took doxycycline for three weeks']);
  });

  it('says on loading that we wrote it, and never makes Lyme the focus', () => {
    const t = COMPOSED_EXAMPLES.lyme.loaded;
    expect(t).toMatch(/^An example we wrote, not anyone\u2019s record/);
    expect(t).not.toMatch(/focus|our condition|LymeX/i);
  });
});

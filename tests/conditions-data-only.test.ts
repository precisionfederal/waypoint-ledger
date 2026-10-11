/* CONDITIONS ARE DATA — the claim made checkable (scale builder, 2026-09-30).

   1. Every entry in data/conditions.json passes data/conditions.schema.json,
      and the schema refuses the entries it exists to refuse.
   2. A condition that exists only in this test, appended to the file at run
      time, comes out in the condition list, through the year-ahead price path,
      through the reader, and onto the /conditions page, with no code changed.
   3. Lyme disease runs through the same reader and table: the words people use
      land on the Lyme rows, care the table has no row for is unpriced by name,
      and the CDC-authored per-case cost is shown beside a priced journey and
      never added to it. */
import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import schema from '../data/conditions.schema.json';
import conditionsRaw from '../data/conditions.json';
import pricesRaw from '../data/prices.json';
import { benchmarkOf, conditionsOf, priceRowsOf, type RawConditionsFile, type RawCondition, type RawPrice } from '../lib/conditions-core';
import { catalogOf, priceSentence } from '../lib/conditions-catalog';
import { CONDITIONS, benchmarkFor } from '../lib/conditions';
import { parseJourney } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const FILE = conditionsRaw as unknown as RawConditionsFile;
const PRICES = pricesRaw as unknown as { items: RawPrice[] };
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** A condition no code has ever heard of. Its year-ahead row is one that
 *  already exists in the price table, exactly as a real addition would be. */
const FIXTURE: RawCondition = {
  id: 'fixture-condition',
  label: 'Fixture condition for the data-only test',
  also_called: ['fixture illness'],
  icd10cm: null,
  icd10cm_title: null,
  icd10cm_billable: null,
  icd10cm_blank_reason: 'A test fixture, so it names no diagnosis code; a real entry names the code exactly as the CDC/NCHS file prints it.',
  price_row_id: 'meps2022-benchmark-diabetes',
  figure_kind: 'condition_attributed',
  figure_kind_label: 'what was spent TREATING this condition in a year, per adult being treated for it',
  figure_is_government_publication: true,
  figure_publisher_note: 'Published by AHRQ, the federal agency that runs the survey.',
  note: 'A fixture pointing at an existing row, to prove the path.',
  definition_caveat: null,
  sex_note: null,
  sex_note_source: null,
  sex_note_source_url: null,
  sex_note_blank_reason: 'A test fixture carries no sentence about sex, and says so in a reason at least forty characters long.',
  published_figures: [],
  example_journey: { sentence: 'saw my regular doctor twice, then a specialist', composed_from: 'A fixture sentence, written for this test only.' },
  picker: 'list',
};

describe('the schema', () => {
  it('every shipped entry validates', () => {
    for (const c of FILE.conditions) {
      const ok = validate(c);
      expect(ok, `${c.id}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it('the fixture validates, so the test below adds a legal entry', () => {
    expect(validate(FIXTURE), JSON.stringify(validate.errors)).toBe(true);
  });

  it('refuses an entry with a field left out, instead of written as null', () => {
    const bad = clone(FIXTURE) as Record<string, unknown>;
    delete bad.sex_note;
    expect(validate(bad)).toBe(false);
  });

  it('refuses a field nobody defined', () => {
    expect(validate({ ...clone(FIXTURE), cost_guess: 123 })).toBe(false);
  });

  it('refuses a published figure with one source', () => {
    const lyme = clone(FILE.conditions.find((c) => c.id === 'lyme')!);
    lyme.published_figures![0].sources = lyme.published_figures![0].sources.slice(0, 1);
    expect(validate(lyme)).toBe(false);
  });

  it('refuses a dollar amount on a prevalence figure', () => {
    const lupus = clone(FILE.conditions.find((c) => c.id === 'lupus')!);
    lupus.published_figures![0].value_usd = 1000;
    expect(validate(lupus)).toBe(false);
  });

  it('refuses a figure set beside a journey without saying why they differ', () => {
    const lyme = clone(FILE.conditions.find((c) => c.id === 'lyme')!);
    delete (lyme.published_figures![0] as unknown as Record<string, unknown>).differs_from_journey;
    expect(validate(lyme)).toBe(false);
  });

  it('refuses a figure_kind on a condition with no year-ahead row', () => {
    const lyme = clone(FILE.conditions.find((c) => c.id === 'lyme')!);
    lyme.figure_kind = 'excess';
    expect(validate(lyme)).toBe(false);
  });
});

describe('adding a condition is data only', () => {
  const file: RawConditionsFile = { ...clone(FILE), conditions: [...clone(FILE.conditions), clone(FIXTURE)] };

  it('appears in the condition list', () => {
    const list = conditionsOf(file);
    expect(list.length).toBe(FILE.conditions.length + 1);
    expect(list.map((c) => c.id)).toContain('fixture-condition');
    // and the shipped list is untouched by the test
    expect(CONDITIONS.map((c) => c.id)).not.toContain('fixture-condition');
  });

  it('prices through the same year-ahead path as a shipped condition', () => {
    const fixture = conditionsOf(file).find((c) => c.id === 'fixture-condition')!;
    const b = benchmarkOf(fixture, priceRowsOf(PRICES), { qualifier: 'q', gapHref: '/gap' });
    const shipped = benchmarkFor('diabetes');
    expect(b.kind).toBe('figure');
    if (b.kind !== 'figure' || shipped?.kind !== 'figure') throw new Error('expected figures');
    expect(b.point).toBe(shipped.point);
    expect(b.year).toBe(shipped.year);
    expect(b.sourceUrl).toBe(shipped.sourceUrl);
  });

  it('with no row, it returns the absence in words, never a substitute', () => {
    const f2 = { ...clone(FIXTURE), price_row_id: null, figure_kind: null, figure_kind_label: null,
      figure_is_government_publication: null, figure_publisher_note: null };
    expect(validate(f2), JSON.stringify(validate.errors)).toBe(true);
    const b = benchmarkOf(conditionsOf({ ...file, conditions: [f2] })[0], priceRowsOf(PRICES), { qualifier: 'q', gapHref: '/gap' });
    expect(b.kind).toBe('none');
  });

  it('its example runs through the reader and onto the /conditions page', async () => {
    const entries = catalogOf(file, PRICES, SELECTABLE);
    const e = entries.find((x) => x.condition.id === 'fixture-condition')!;
    expect(e.example!.lines.map((l) => l.itemId)).toEqual(['cms-99213', 'cms-99204']);
    expect(e.example!.pricedTotalUsd).toBe(Math.round((95.19 * 2 + 177.36) * 100) / 100);
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { default: Catalog } = await import('../app/conditions/Catalog');
    const html = renderToStaticMarkup(createElement(Catalog, { entries, schemaHref: '/conditions/schema.json' }));
    expect(html).toContain('Fixture condition for the data-only test');
    expect(html).toContain('id="fixture-condition"');
    expect(html).toContain(`<strong>${FILE.conditions.length + 1}</strong> conditions`);
  }, 30000);
});

describe('Lyme disease, end to end', () => {
  const read = (s: string) => parseJourney(s, SELECTABLE).filter((x) => !x.absorbed)
    .map((x) => [x.raw, x.result.item?.id ?? null] as const);

  it('carries A69.2 and the CDC-authored cost study with both sources', () => {
    const lyme = FILE.conditions.find((c) => c.id === 'lyme')!;
    expect(lyme.icd10cm).toBe('A69.2');
    const fig = lyme.published_figures!.find((f) => f.id === 'lyme-ticknet-societal-medical')!;
    expect([fig.value_usd, fig.median_usd, fig.dollars_year]).toEqual([1333, 478, 2016]);
    expect(fig.sources.map((s) => s.url)).toEqual([
      'https://wwwnc.cdc.gov/eid/article/28/6/21-1335_article',
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC9155891/',
    ]);
    for (const s of fig.sources) expect(s.quote).toContain('for a median of $478 and mean of $1,333');
  });

  it('the words people use land on the Lyme rows, and a Lyme blood test is never a blood count', () => {
    const got = read('got a tick bite hiking, then a bullseye rash, saw my regular doctor twice, they did the Lyme blood test and the confirmatory Western blot, then an infectious disease specialist, then IV antibiotics');
    const byWords = Object.fromEntries(got);
    expect(byWords['they did the Lyme blood test']).toBe('cms-lab-lyme-screen');
    expect(byWords['the confirmatory Western blot']).toBe('cms-lab-lyme-confirm');
    expect(byWords['saw my regular doctor twice']).toBe('cms-99213');
    expect(byWords['an infectious disease specialist']).toBe('cms-99204');
    // no row for these, so they stay on the journey, unpriced, by name
    expect(byWords['IV antibiotics']).toBeNull();
    expect(byWords['got a tick bite hiking']).toBeNull();
    for (const s of ['lyme blood test', 'Lyme disease test', 'got a Lyme test', 'blood test for lyme'])
      expect(read(s)[0][1], s).toBe('cms-lab-lyme-screen');
  });

  it('the validation panel sets the published figure beside the priced journey and never adds them', async () => {
    const entries = catalogOf(FILE, PRICES, SELECTABLE);
    const e = entries.find((x) => x.condition.id === 'lyme')!;
    const ex = e.example!;
    const priced = ex.lines.filter((l) => l.lineUsd !== null);
    expect(ex.pricedTotalUsd).toBe(Math.round(priced.reduce((a, l) => a + l.lineUsd!, 0) * 100) / 100);
    expect(ex.lines.some((l) => l.itemId === 'cms-lab-lyme-screen')).toBe(true);
    expect(ex.unpricedCount).toBeGreaterThan(0);
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { ValidationPanel } = await import('../app/conditions/Catalog');
    const html = renderToStaticMarkup(createElement(ValidationPanel, { entry: e }));
    expect(html).toContain('$1,333');
    expect(html).toContain('Median: $478.');
    expect(html).toContain('$' + ex.pricedTotalUsd.toFixed(2));
    expect(html).toContain('never added');
    // no sum, no blend: neither the sum nor the difference of the two appears
    const sum = (1333 + ex.pricedTotalUsd).toFixed(2);
    const diff = (1333 - ex.pricedTotalUsd).toFixed(2);
    expect(html).not.toContain(sum);
    expect(html).not.toContain(diff);
  }, 30000);
});

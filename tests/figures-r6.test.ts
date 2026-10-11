/* ==========================================================================
   R6-FIX · figures — one test per finding, each quoting the adversary.

   The adversary graded every figure on the live site on 2026-09-09 and returned
   LOSE (../winloop/R6/data.md). These tests hold the fixes in place. Each one
   names the finding and quotes the sentence that made it a finding, so a future
   session cannot quietly undo it without reading why it is here.

   Every dollar asserted below is read from the shipped data files, which are
   themselves re-derived from the CMS files on disk by data/verify_price_table.py
   (274 rows PASS) and data/verify_additions.py (210 rows PASS).
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import prices from '../data/prices.json';
import additions from '../data/prices-additions-2026-09-09.json';
import { TABLE } from '../lib/table';
import { clampTimes, siteOf, figureFor, priceEntry } from '../lib/pricing';
import { localityLineNote } from '../lib/fit';
import { exportExtras, csvExtraCells, CSV_EXTRA_COLUMNS, burdenOf, round2 } from '../lib/ledger-export';
import type { JourneyEntry } from '../lib/types';

const root = fileURLToPath(new URL('..', import.meta.url));
const rawById = new Map<string, Record<string, unknown>>(
  [...prices.items, ...additions.items].map((r) => [r.id as string, r as Record<string, unknown>]),
);
const alt = (id: string) => (rawById.get(id)?.alternates ?? {}) as Record<string, unknown>;
const byId = (id: string) => TABLE.find((i) => i.id === id)!;
const entry = (e: Partial<JourneyEntry> & { raw: string }): JourneyEntry =>
  ({ key: e.raw, times: 1, item: null, ...e }) as JourneyEntry;

describe('F1 — the ER row named the office row while carrying the facility charge', () => {
  /* "$788.07 is the F row. 1,404 services / 383 providers are the O row ... the
      provenance block beside it names the other row." */
  it('names the facility row, with that row’s own counts', () => {
    const a = alt('cms-ed-99284-complete');
    expect(a.cy2024_physician_component_average_submitted_charge_usd).toBe(788.07);
    expect(String(a.cy2024_place_of_service)).toMatch(/^F: /);
    expect(a.cy2024_total_services).toBe(4531103);
    expect(a.cy2024_rendering_providers).toBe(117351);
    expect(String(a.cy2024_source_row)).toContain('Place_Of_Srvc=F');
    /* and the allowed amount from the same row, which was simply missing */
    expect(a.cy2024_average_allowed_usd).toBe(114.81);
    expect(String(a._charge_note)).toContain('4,531,103');
  });
});

describe('F2 — "0 of these 8 lines carry a figure CMS publishes for Iowa"', () => {
  /* "the page uses Iowa figures to build a subtotal and then tells an Iowa reader
      we hold none. (Also: the denominator 8 counts an unpriceable line.)" */
  const lines = [
    entry({ raw: 'saw my doctor', item: byId('cms-99213'), times: 3 }),
    entry({ raw: 'a cardiologist', item: byId('cms-99204') }),
    entry({ raw: 'an echo', item: byId('cms-img-echo') }),
    entry({ raw: 'a holter', item: byId('cms-test-holter') }),
    entry({ raw: 'a metabolic panel', item: byId('cms-lab-cmp') }),
    entry({ raw: 'a thyroid test', item: byId('cms-lab-tsh') }),
    entry({ raw: 'the ER', item: byId('cms-ed-99284-complete') }),
    entry({ raw: 'waited 8 months', months: 8 }),
  ];

  it('counts the rows, not the view, and prices the denominator honestly', () => {
    const note = localityLineNote(lines, { placeName: 'Iowa', showingCharges: true, subtotalLabel: '$1,253' })!;
    expect(note.priced).toBe(7);          // never 8: the wait cannot carry a figure
    expect(note.withLocality).toBe(4);    // 99213, 99204, echo, holter
    expect(note.sentence).toContain('4 of these 7 priced lines also carry a figure CMS publishes for Iowa');
    expect(note.sentence).toContain('$1,253');
    expect(note.sentence).toContain('The other 3 are priced from a national rate');
  });

  it('says none only when the rows really carry none', () => {
    const note = localityLineNote([entry({ raw: 'a blood count', item: byId('cms-lab-cbc') })],
      { placeName: 'Iowa' })!;
    expect(note.sentence).toContain('None of these 1 priced lines');
  });
});

describe('F3 / F12 — "at the hospital" was answered with the freestanding price', () => {
  /* "the two-bill total for the echo is $196.73 + $558.25, i.e. 3.8x what we print,
      and the app reads the state out of the story but ignores the setting." */
  it('reads the setting out of the person’s own words', () => {
    expect(siteOf('my cardiologist ordered an echo at the hospital')).toBe('hospital');
    expect(siteOf('the ER once when my heart was racing')).toBe('hospital');
    expect(siteOf('an MRI at a freestanding imaging center')).toBe('office');
    expect(siteOf('saw my doctor three times')).toBe('unknown');
  });

  it('shows both published bills for a hospital echo, and never adds them into the total', () => {
    const echo = byId('cms-img-echo');
    const f = figureFor(echo, 'hospital');
    expect(f.hospitalFeeUsd).toBe(558.25);
    expect(f.hospitalCopayUsd).toBe(111.65);
    expect(echo.facilityUsd).toBeCloseTo(67.47, 2);   // modifier 26, the reading
    expect(f.twoBillsUsd).toBeCloseTo(625.72, 2);
    expect(f.note).toContain('$558.25');
    /* the itemized line is untouched: the second bill sits beside it */
    expect(priceEntry(entry({ raw: 'an echo at the hospital', item: echo })).totalUsd).toBe(196.73);
  });

  it('carries the MRI caveat as a figure, not only as prose in the drawer', () => {
    const mri = byId('cms-img-mri-brain-nc');
    expect(mri.hospitalFeeUsd).toBe(243.77);
    expect(figureFor(mri, 'hospital').note).toContain('$243.77');
    expect(figureFor(mri, 'unknown').note).toBeNull();
  });

  it('every row that carries a hospital figure explains where it came from', () => {
    const withFacility = TABLE.filter((i) => i.facilityUsd !== undefined);
    expect(withFacility.length).toBeGreaterThan(100);
    for (const i of withFacility) {
      expect(i.facilityComponent, i.id).toBeTruthy();
      expect(String(i.facilityNote), i.id).toContain('33.4009');
    }
  });
});

describe('F4 — the site-of-service card contradicted its own drawer', () => {
  /* "$84.50 and $135.61 are CPT 99214's figures, not 99213's. The card says
      'One code, CPT 99213'; the drawer silently switches codes." */
  it('does the arithmetic on the code the card shows', () => {
    const cs = String(rawById.get('cms-g0463-hospital-clinic-fee')!.coverage_statement);
    expect(cs).toContain('The arithmetic on a low-complexity follow-up, CPT 99213: $57.45 to the '
      + 'clinician plus $136.02 to the hospital is $193.47, against $95.19 for the exact same visit '
      + 'in a freestanding private office.');
    expect(cs).not.toContain('$84.50');
    expect(cs).not.toContain('$135.61');
    expect(byId('cms-99213').facilityUsd).toBe(57.45);
    expect(byId('cms-99213').valueUsd).toBe(95.19);
  });
});

describe('F5 — a once-a-year code multiplied by the count the person typed', () => {
  /* "a line that reads 'Yearly ... x 6' is self-contradicting on the app's own
      terms, and $112.20 is a figure Medicare cannot allow in one year." */
  it('prices one, counts the rest, and says so', () => {
    const dep = byId('cms-g0444');
    expect(dep.maxPerYear).toBe(1);
    expect(String(dep.maxPerYearBasis)).toContain('Annual depression screening, 5 to 15 minutes');
    const c = clampTimes(dep, 6);
    expect(c).toEqual({
      times: 1, said: 6, capped: true,
      note: 'You said 6. CMS pays this once in a 12-month period, so one is priced and the other 5 are counted, not priced.',
    });
    const line = priceEntry(entry({ raw: 'screened me for depression at 6 visits', item: dep, times: 6 }));
    expect(line.totalUsd).toBe(18.7);      // never 112.20
  });

  it('leaves an ordinary code alone', () => {
    expect(clampTimes(byId('cms-99213'), 3)).toEqual({ times: 3, said: 3, capped: false, note: null });
    expect(priceEntry(entry({ raw: 'three visits', item: byId('cms-99213'), times: 3 })).totalUsd)
      .toBeCloseTo(285.57, 2);
  });

  it('every capped row names CMS’s own descriptor as the basis', () => {
    const capped = TABLE.filter((i) => i.maxPerYear !== undefined);
    expect(capped.length).toBeGreaterThanOrEqual(4);
    for (const i of capped) expect(String(i.maxPerYearBasis).length, i.id).toBeGreaterThan(40);
  });
});

describe('F6 — 13 rows dropped the allowed amount the same file publishes', () => {
  /* "our CBC figure is the CY2026 CLFS rate $7.77; CMS's own CY2024 claims file
      says the average allowed was $7.59 — a 2.3% independent corroboration." */
  const expected: [string, number][] = [
    ['cms-lab-cbc', 7.59], ['cms-lab-cmp', 10.33], ['cms-lab-bmp', 8.27], ['cms-lab-tsh', 16.44],
    ['cms-lab-ana', 11.83], ['cms-lab-esr', 2.64], ['cms-lab-crp', 5.07], ['cms-lab-hscrp', 12.67],
    ['cms-lab-ddimer', 9.96], ['cms-lab-ferritin', 13.33], ['cms-lab-lyme-screen', 16.67],
    ['cms-lab-lyme-confirm', 15.17],
  ];
  it.each(expected)('%s carries the CY2024 allowed amount', (id, usd) => {
    expect(alt(id).cy2024_average_allowed_usd).toBe(usd);
    expect(String(alt(id)._allowed_note)).toContain('never added');
  });

  it('leaves no row holding a charge without its allowed companion', () => {
    const orphans = [...rawById.values()].filter((r) => {
      const a = (r.alternates ?? {}) as Record<string, unknown>;
      return a.cy2024_average_submitted_charge_usd !== undefined
        && typeof a.cy2024_average_allowed_usd !== 'number';
    }).map((r) => r.id);
    expect(orphans).toEqual([]);
  });
});

describe('F11 / edge #8 — the exports lost the multiplication and the burden number', () => {
  /* "An actuary opening the CSV cannot tell an 8-month wait from an 8-year one."
     "The export tells a re-user nothing about [VERIFIED or DERIVED]." */
  it('carries the burden quantity and its unit', () => {
    const wait = entry({ raw: 'waited 8 months', months: 8 });
    expect(burdenOf(wait)).toEqual({ quantity: 8, unit: 'months' });
    const cells = csvExtraCells(wait);
    expect(CSV_EXTRA_COLUMNS.length).toBe(cells.length);
    expect(cells[cells.length - 2]).toBe('8');
    expect(cells[cells.length - 1]).toBe('months');
  });

  it('says whether the figure was read or derived, and whether we multiplied', () => {
    const x = exportExtras(entry({ raw: 'saw my doctor three times', item: byId('cms-99213'), times: 3 }));
    expect(x.figureConfidence).toBe('DERIVED');
    expect(x.figureArithmetic).toBe('2.85 total RVUs x $33.4009');
    expect(x.multiplied).toBe(true);
    expect(x.times).toBe(3);
    expect(x.timesPriced).toBe(3);

    const lab = exportExtras(entry({ raw: 'a blood count', item: byId('cms-lab-cbc') }));
    expect(lab.figureConfidence).toBe('VERIFIED');
    expect(lab.figureArithmetic).toBe('');
    expect(lab.multiplied).toBe(false);
  });

  it('publishes the priced count and the reason when they differ', () => {
    const x = exportExtras(entry({ raw: 'depression screen at 6 visits', item: byId('cms-g0444'), times: 6 }));
    expect(x.times).toBe(6);
    expect(x.timesPriced).toBe(1);
    expect(x.timesNote).toContain('once in a 12-month period');
  });

  it('rounds money at the export boundary', () => {
    expect(round2(406.83000000000004)).toBe(406.83);
  });
});

describe('the published table is the whole table', () => {
  /* public/data/price-table.json held 117 rows while lib/table.ts served 274. */
  const pub = JSON.parse(readFileSync(root + 'public/data/price-table.json', 'utf8')) as
    { rows: number; items: { id: string }[]; audit: { rows: number; pass: number; fail: number } };
  const build = JSON.parse(readFileSync(root + 'public/build.json', 'utf8')) as { publishedFigures: number };

  it('publishes every row the app can land on, and audits every one', () => {
    expect(TABLE.length).toBe(274);
    expect(pub.rows).toBe(TABLE.length);
    expect(pub.items.length).toBe(TABLE.length);
    expect(new Set(pub.items.map((i) => i.id)).size).toBe(TABLE.length);
    expect(pub.audit.rows).toBe(TABLE.length);
    expect(pub.audit.pass).toBe(TABLE.length);
    expect(pub.audit.fail).toBe(0);
    expect(build.publishedFigures).toBe(TABLE.length);
  });

  it('publishes the CSV with the same number of rows', () => {
    const csv = readFileSync(root + 'public/data/price-table.csv', 'utf8');
    const rows = csv.split('\n').filter((l) => /^cms|^ahrq|^bls|^gsa|^hcup|^meps/.test(l));
    expect(rows.length).toBeGreaterThanOrEqual(TABLE.length - 5);
  });
});

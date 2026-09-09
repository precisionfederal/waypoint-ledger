/* The price table is the product. These tests exist so that a row can never
   reach the app carrying a figure nobody can trace, a code nobody confirmed, or
   a published CSV that has drifted away from the JSON it was generated from.
   They read the shipped files, not fixtures. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import prices from '../data/prices.json';
import conditions from '../data/conditions.json';

const root = fileURLToPath(new URL('..', import.meta.url));
const items = prices.items as Array<Record<string, unknown>>;
const byId = new Map(items.map((r) => [r.id as string, r]));
const CF = 33.4009;

interface AuditRow { id: string; status: string; check?: string }
const audit = JSON.parse(readFileSync(root + 'data/AUDIT.json', 'utf8')) as {
  rows: number; pass: number; fail: number; unverified: number; results: AuditRow[];
};

/* A tiny CSV reader: enough for our own quoted output, and it fails loudly on
   anything it does not understand rather than guessing. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

describe('every row carries its provenance', () => {
  it('has a unique id', () => {
    expect(new Set(items.map((r) => r.id)).size).toBe(items.length);
  });

  it('names the agency that published it', () => {
    const allowed = new Set(['CMS', 'AHRQ', 'BLS', 'GSA']);
    for (const r of items) {
      expect(allowed.has(r.agency as string), `${r.id} agency ${r.agency}`).toBe(true);
      expect(String(r.agency_display ?? '').length, `${r.id} agency_display`).toBeGreaterThan(1);
    }
  });

  it('carries a source, a year, a population and a coverage statement', () => {
    for (const r of items) {
      for (const f of ['source_title', 'source_url', 'year', 'population', 'geography',
                       'coverage_statement', 'basis']) {
        expect(String(r[f] ?? ''), `${r.id}.${f}`).not.toBe('');
      }
      expect(String(r.source_url)).toMatch(/^https:\/\//);
    }
  });

  it('uses only bases the table itself defines', () => {
    const legend = new Set(Object.keys(prices._basis_legend as Record<string, unknown>));
    legend.add('rate'); // the GSA reimbursement rate: not a price, and labelled so
    for (const r of items) expect(legend.has(r.basis as string), `${r.id} ${r.basis}`).toBe(true);
  });

  it('never leaves a figure without an interval where the source published one', () => {
    const lc = byId.get('meps2022-longcovid-excess-total')!;
    expect(lc.value_range_usd).toEqual([1619, 6578]);
  });
});

describe('LOINC codes are confirmed, never guessed', () => {
  const withLoinc = items.filter((r) => r.loinc);

  it('every LOINC row states exactly what the code means', () => {
    expect(withLoinc.length).toBeGreaterThanOrEqual(30);
    for (const r of withLoinc) {
      expect(String(r.loinc)).toMatch(/^\d{1,6}-\d$/);
      expect(String(r.loinc_long_common_name ?? '').length, `${r.id}`).toBeGreaterThan(5);
      expect(String(r.loinc_source ?? '')).toContain('NLM');
    }
  });

  it('leaves the ambiguous tests without a code rather than picking one', () => {
    for (const id of ['cms-lab-troponin', 'cms-lab-ige-per-allergen',
                      'cms-lab-lyme-screen', 'cms-lab-lyme-confirm']) {
      expect(byId.get(id)!.loinc, id).toBeUndefined();
    }
  });

  it('only puts a LOINC on a laboratory row', () => {
    for (const r of withLoinc) expect(String(r.id)).toMatch(/^cms-lab-/);
  });
});

describe('the hospital-clinic comparison is arithmetic on published figures', () => {
  const em = byId.get('cms-99213')!;
  const alt = em.alternates as Record<string, number | string>;

  it('derives the facility-setting payment from the facility RVUs and the CY2026 factor', () => {
    const rvu = alt.facility_setting_total_rvu as number;
    const pay = alt.facility_setting_physician_payment_usd as number;
    expect(Math.round(rvu * CF * 100) / 100).toBe(pay);
  });

  it('adds the hospital fee to it and nothing else', () => {
    const pay = alt.facility_setting_physician_payment_usd as number;
    const fee = byId.get('cms-g0463-hospital-clinic-fee')!.value_usd as number;
    expect(Math.round((pay + fee) * 100) / 100).toBe(193.47);
    expect(Math.round((pay + fee - (em.value_usd as number)) * 100) / 100).toBe(98.28);
  });

  it('puts the facility figure on every office-visit code, with the formula spelled out', () => {
    for (const id of ['cms-99202', 'cms-99203', 'cms-99204', 'cms-99205',
                      'cms-99211', 'cms-99212', 'cms-99213', 'cms-99214', 'cms-99215']) {
      const a = byId.get(id)!.alternates as Record<string, number | string>;
      expect(typeof a.facility_setting_physician_payment_usd, id).toBe('number');
      expect(String(a._facility_setting_note)).toContain('facility total RVUs');
    }
  });
});

describe('the mileage rate is fenced off from the medical figures', () => {
  const g = byId.get('gsa2026-pov-mileage-rate');
  it('exists, is a rate, and can never enter a total', () => {
    expect(g, 'the GSA row').toBeDefined();
    expect(g!.basis).toBe('rate');
    expect(g!.summable).toBe(false);
    expect(String(g!.coverage_statement)).toContain('NOT A MEDICAL PRICE');
    expect(String(g!.source_url)).toContain('gsa.gov');
  });
});

describe('conditions.json points only at rows that exist', () => {
  const list = conditions.conditions as Array<Record<string, unknown>>;

  it('resolves every price row it references', () => {
    for (const c of list) {
      if (c.price_row_id) expect(byId.has(c.price_row_id as string), String(c.id)).toBe(true);
    }
    expect(byId.has(conditions._baseline_row_id as string)).toBe(true);
  });

  it('says what KIND of figure each priced condition carries', () => {
    for (const c of list) {
      if (!c.price_row_id) { expect(c.figure_kind).toBeNull(); continue; }
      expect(['excess', 'condition_attributed']).toContain(c.figure_kind);
      const row = byId.get(c.price_row_id as string)!;
      if (c.figure_kind === 'excess') expect(row.attribution).toBe('excess');
    }
  });

  it('names the absence instead of filling it', () => {
    const unpriced = list.filter((c) => !c.price_row_id);
    expect(unpriced.length).toBeGreaterThan(0);
    for (const c of unpriced) expect(String(c.note)).toMatch(/no published federal figure|no federal figure/i);
  });
});

describe('the audit covers the whole table', () => {
  it('has one result per row and nothing failing', () => {
    expect(audit.rows).toBe(items.length);
    expect(audit.results.length).toBe(items.length);
    expect(audit.fail).toBe(0);
    expect(new Set(audit.results.map((r) => r.id)).size).toBe(items.length);
  });

  it('gives every row a named check — "no checker" is a failure state', () => {
    for (const r of audit.results) {
      expect(r.check, r.id).toBeTruthy();
      expect(r.check, r.id).not.toBe('no checker');
    }
  });
});

describe('the published open-data files match the table they came from', () => {
  const csv = parseCsv(readFileSync(root + 'public/data/price-table.csv', 'utf8'));
  const header = csv[0];
  const rows = csv.slice(1).filter((r) => r.length > 1);
  const col = (name: string) => header.indexOf(name);

  it('publishes one row per priced unit of care, with the same figures', () => {
    expect(rows.length).toBe(items.length);
    const idCol = col('id'), valCol = col('value_usd');
    for (const r of rows) {
      const src = byId.get(r[idCol]);
      expect(src, r[idCol]).toBeDefined();
      const published = r[valCol] === '' ? null : Number(r[valCol]);
      expect(published, r[idCol]).toEqual(src!.value_usd ?? null);
    }
  });

  it('describes every column it publishes', () => {
    const dict = parseCsv(readFileSync(root + 'public/data/price-dictionary.csv', 'utf8'));
    const described = new Set(dict.slice(1).map((r) => r[1]));
    for (const h of header) expect(described.has(h), `${h} is undocumented`).toBe(true);
  });

  it('never hands a spreadsheet a formula', () => {
    for (const r of rows) {
      for (const cell of r) expect(/^[=+\-@\t\r]/.test(cell), cell.slice(0, 40)).toBe(false);
    }
  });

  it('carries the licence and the audit verdict with the JSON', () => {
    const pub = JSON.parse(readFileSync(root + 'public/data/price-table.json', 'utf8'));
    expect(pub.rows).toBe(items.length);
    expect(pub.table_version).toBe(prices._version);
    expect(pub.license).toContain('CC0');
    expect(pub.audit.fail).toBe(0);
    expect(pub.items.every((i: { audit: unknown }) => i.audit)).toBe(true);
  });
});

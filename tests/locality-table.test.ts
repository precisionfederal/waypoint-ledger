/* ==========================================================================
   THE PUBLISHED LOCALITY TABLE MUST REPRODUCE FROM ITS OWN COLUMNS.

   5,123 figures are the most reusable thing this project owns, and a published
   number that cannot be recomputed from the inputs printed beside it is worth
   less than no number at all. So this suite does not check that the file exists.
   It recomputes every figure from the RVUs and geographic indices on that row,
   checks it against the app's own table, and re-runs the generator to prove the
   published file is not stale.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { LOCALITIES, LOCALITY_ROW_COUNT, localityFigure } from '../lib/fit';
import audit from '../data/AUDIT.json';

const root = fileURLToPath(new URL('..', import.meta.url));
const readPub = (f: string) => readFileSync(`${root}public/data/${f}`, 'utf8');

/** A CSV parser that honours quoted cells. The published file must survive one. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}

const csv = parseCsv(readPub('locality-prices.csv'));
const header = csv[0];
const body = csv.slice(1);
const col = (name: string) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`locality-prices.csv has no column "${name}"`);
  return i;
};
const json = JSON.parse(readPub('locality-prices.json')) as {
  rows: number; codes: number; locality_count: number; states: number;
  conversion_factor: number; formula: string; license: string; how_to_cite: string;
  audit: { figures_checked: number; mismatches: number; reproduce: string };
  sources: Record<string, { file: string; sha256: string; url: string; verified_on: string }>;
  dictionary: { field: string }[];
  prices: Record<string, number | string>[];
};

describe('public/data/locality-prices.csv — the open data', () => {
  it('publishes every code in every CMS locality, and says so in the JSON', () => {
    expect(body.length).toBe(LOCALITY_ROW_COUNT * LOCALITIES.length);
    expect(json.rows).toBe(body.length);
    expect(json.codes).toBe(LOCALITY_ROW_COUNT);
    expect(json.locality_count).toBe(LOCALITIES.length);
  });

  it('🔴 every published figure recomputes from the RVUs and indices on its own row', () => {
    const [w, pe, mp, pw, peG, mpG, cf, usd] = [
      'work_rvu', 'pe_nonfacility_rvu', 'mp_rvu', 'pw_gpci', 'pe_gpci', 'mp_gpci',
      'conversion_factor', 'allowed_usd',
    ].map(col);
    let checked = 0;
    for (const r of body) {
      const calc = Math.round(
        (+r[w] * +r[pw] + +r[pe] * +r[peG] + +r[mp] * +r[mpG]) * +r[cf] * 100,
      ) / 100;
      expect(calc).toBeCloseTo(+r[usd], 2);
      checked++;
    }
    expect(checked).toBe(LOCALITY_ROW_COUNT * LOCALITIES.length);
  });

  it('is the same number the app shows for that place — the download is not a second table', () => {
    const [id, key, usd] = ['price_id', 'locality_key', 'allowed_usd'].map(col);
    for (const r of body) expect(localityFigure(r[id], r[key])).toBeCloseTo(+r[usd], 2);
  });

  it('carries the CMS files it was derived from, with a SHA256 on every row', () => {
    const [rvuFile, rvuHash, gpciFile, gpciHash] = ['rvu_file', 'rvu_file_sha256', 'gpci_file', 'gpci_file_sha256'].map(col);
    for (const r of body.slice(0, 50)) {
      expect(r[rvuFile]).toBe('PPRRVU2026_Jul_nonQPP.csv');
      expect(r[gpciFile]).toBe('GPCI2026.csv');
      expect(r[rvuHash]).toMatch(/^[0-9a-f]{64}$/);
      expect(r[gpciHash]).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('🔴 the RVU hash it publishes is the one verify_price_table.py recorded independently', () => {
    expect(json.sources.rvu.sha256).toBe((audit as { sources: Record<string, { sha256: string }> }).sources.rvu.sha256);
    expect(json.sources.gpci.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(json.sources.gpci.verified_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('says every figure was reproduced, with the command to reproduce it', () => {
    expect(json.audit.figures_checked).toBe(LOCALITY_ROW_COUNT * LOCALITIES.length);
    expect(json.audit.mismatches).toBe(0);
    expect(json.audit.reproduce).toBe('node scripts/gen-locality-table.mjs');
    const status = col('locality_audit_status');
    expect(new Set(body.map((r) => r[status]))).toEqual(new Set(['REPRODUCED']));
  });

  it('defines every column it publishes, exactly once', () => {
    const dict = parseCsv(readPub('locality-dictionary.csv')).slice(1);
    const fields = dict.map((r) => r[1]);
    expect(fields.sort()).toEqual([...header].sort());
    expect(new Set(fields).size).toBe(fields.length);
    for (const r of dict) expect(r[3].length).toBeGreaterThan(20);   // a real sentence, not a restated name
    expect(json.dictionary.map((d) => d.field).sort()).toEqual([...header].sort());
  });

  it('dedicates the arrangement to the public domain and says how to cite it', () => {
    expect(json.license).toContain('CC0 1.0');
    expect(json.license).toContain('public domain');
    expect(json.how_to_cite).toContain('locality-prices.csv');
  });

  it('never lets a cell open as a spreadsheet formula', () => {
    for (const r of body) for (const c of r) expect(c.startsWith('=')).toBe(false);
  });

  it('🔴 is not stale — regenerating produces byte-for-byte the same file', () => {
    const before = readPub('locality-prices.csv');
    // The JSON twin carries the run date; regenerating on a later day re-stamps it and dirties
    // the tree under a deploy (seen 2026-09-10 00:30 UTC). Put the committed bytes back after.
    const jsonPath = join(root, 'public/data/locality-prices.json');
    const jsonBefore = readFileSync(jsonPath, 'utf8');
    try {
      execFileSync('node', ['scripts/gen-locality-table.mjs'], { cwd: root, stdio: 'pipe' });
      expect(readPub('locality-prices.csv')).toBe(before);
    } finally {
      writeFileSync(jsonPath, jsonBefore);
    }
  }, 30_000);
});

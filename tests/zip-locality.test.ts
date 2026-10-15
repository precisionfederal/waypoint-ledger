/* ZIP → Medicare locality, from CMS's Zip Code to Carrier Locality File (updated 08/13/2026).
   Every expected key below was read off the raw CMS row by hand (ZIP5_OCT2026.txt / ZIP9_OCT2026.txt,
   columns: state 1-2, ZIP 3-7, carrier 8-12, pricing locality 13-14, +4 flag 21, plus four 22-25) and
   joined to data/state-prices.json (mac + locality):
     CA941100111205…   carrier 01112 loc 05 → CA-05 San Francisco-Oakland-Berkeley (SF/San Mateo/Alameda/Contra Costa)
     TX770020441218…   carrier 04412 loc 18 → TX-18 Houston
     NY100011320201…   carrier 13202 loc 01 → NY-01 Manhattan
     MA021391421201…   carrier 14212 loc 01 → MA-01 Metropolitan Boston  (leading zero)
     IA500100510200…   carrier 05102 loc 00 → IA-00 Iowa (Iowa has one locality)
     MD208141220201…   carrier 12202 loc 01 → DC-01 DC + MD/VA Suburbs (a Maryland ZIP CMS prices with D.C.)
     MA014341421201 … 1 (+4 flag): ZIP9 MA014341421201      10001 → 01434-0001 MA-01;
                                   ZIP9 MA014341421299      13900 → 01434-3900 MA-99; 01434-1234 has no ZIP9 row. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildZipIndex, parseZip, resolveZip, type ZipBase, type ZipSplit } from '@/lib/zip-locality';
import { LOCALITIES, localityOf } from '@/lib/fit';

const base = JSON.parse(readFileSync(new URL('../data/zip-locality.json', import.meta.url), 'utf8')) as ZipBase;
const pub = readFileSync(new URL('../public/data/zip-locality.json', import.meta.url), 'utf8');
const nine = JSON.parse(readFileSync(new URL('../public/data/zip9-split.json', import.meta.url), 'utf8')) as ZipSplit;
const load = { base: async () => base, nine: async () => nine };
const index = buildZipIndex(base);
const go = (z: string) => resolveZip(z, load, { index });

describe('ZIP → Medicare locality, from the CMS file', () => {
  it('names its source and covers every ZIP5 row', () => {
    expect(base._source.url).toBe('https://www.cms.gov/files/zip/zip-code-carrier-locality-file-updated-08-13-2026.zip');
    expect(base._source.updated).toBe('08/13/2026');
    expect(base._source.zip5_rows).toBe(42957);
    expect(base.count).toBe(42957);
    expect(base.runs.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0)).toBe(42957);
  });

  it('every locality it points at is one the prices are built for, and all 109 are reached', () => {
    const ours = new Set(LOCALITIES.map((l) => l.key));
    expect(base.localities.every((k) => ours.has(k))).toBe(true);
    const used = new Set(base.runs.filter((_, i) => i % 2 === 1).map((i) => base.localities[i]));
    expect(used.size).toBe(LOCALITIES.length);
  });

  it('the public copy the browser fetches is the same file', () => {
    expect(JSON.parse(pub)).toEqual(base);
  });

  it.each([
    ['94110', 'CA-05'],
    ['77002', 'TX-18'],
    ['10001', 'NY-01'],
  ])('multi-locality state: %s → %s', async (zip, key) => {
    expect(await go(zip)).toMatchObject({ kind: 'found', zip, locality: key, byPlus4: false });
  });

  it('San Francisco reads as San Francisco on the page', async () => {
    const a = await go('94110');
    expect(a.kind === 'found' && localityOf(a.locality)?.displayName).toMatch(/^San Francisco/);
  });

  it('a sole-locality state: Ames 50010 → IA-00', async () => {
    expect(await go('50010')).toMatchObject({ kind: 'found', locality: 'IA-00' });
  });

  it('leading zero survives: 02139 → MA-01', async () => {
    expect(await go('02139')).toMatchObject({ kind: 'found', zip: '02139', locality: 'MA-01' });
  });

  it('a Maryland ZIP CMS prices with D.C. goes to DC-01, as CMS says', async () => {
    expect(await go('20814')).toMatchObject({ kind: 'found', locality: 'DC-01' });
  });

  it('unknown ZIPs say so', async () => {
    expect(await go('00000')).toMatchObject({ kind: 'unknown', zip: '00000' });
    expect(await go('99999')).toMatchObject({ kind: 'unknown', zip: '99999' });
  });

  it('ZIP+4 on an unsplit ZIP resolves by its ZIP5 and keeps the +4', async () => {
    for (const z of ['94110-1234', '94110 1234', '941101234']) {
      expect(await go(z)).toMatchObject({ kind: 'found', zip: '94110', plus4: '1234', locality: 'CA-05', byPlus4: false });
    }
  });

  it('a ZIP CMS splits asks for the +4 instead of guessing', async () => {
    expect(await go('01434')).toMatchObject({ kind: 'split', zip: '01434', localities: ['MA-01', 'MA-99'] });
  });

  it('the +4 resolves a split ZIP exactly, from the ZIP9 rows', async () => {
    expect(await go('01434-0001')).toMatchObject({ kind: 'found', locality: 'MA-01', byPlus4: true });
    expect(await go('01434-3900')).toMatchObject({ kind: 'found', locality: 'MA-99', byPlus4: true });
  });

  it('a +4 CMS does not list leaves the choice with the person', async () => {
    expect(await go('01434-1234')).toMatchObject({ kind: 'split', plus4Unlisted: true, localities: ['MA-01', 'MA-99'] });
  });

  it('the +4 file covers every split ZIP and nothing else', () => {
    expect(Object.keys(nine.zips).sort()).toEqual(Object.keys(base.split).sort());
  });

  it('malformed input is not looked up', async () => {
    for (const z of ['', '1234', '123456', 'abcde', '94110-12']) expect(parseZip(z)).toBeNull();
    expect(await go('9411')).toEqual({ kind: 'malformed' });
  });

  it('the ZIP never rides in a URL: the browser fetches two fixed files', () => {
    const src = readFileSync(new URL('../lib/zip-locality.ts', import.meta.url), 'utf8');
    const urls = src.match(/getJson<\w+>\('[^']*'\)/g) ?? [];
    expect(src.match(/fetch\(/g)).toHaveLength(1);
    expect(urls).toEqual(["getJson<ZipBase>('/data/zip-locality.json')", "getJson<ZipSplit>('/data/zip9-split.json')"]);
  });

  it('the ContextBar stores the ZIP locally and never imports the data into the bundle', () => {
    const bar = readFileSync(new URL('../components/ContextBar.tsx', import.meta.url), 'utf8');
    expect(bar).toContain("const ZIP_KEY = 'waypoint-ledger.zip.v1'");
    expect(bar).not.toMatch(/import[^;]*zip-locality\.json/);
    expect(bar).toContain('autoComplete="postal-code"');
  });
});

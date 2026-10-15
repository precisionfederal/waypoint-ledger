/* Judge panel 15 Oct B-10: /method lists the hospital files behind the negotiated
   ranges (each file, its state, the hospital's date, the read date, the link and the
   services it prices), computed from the data files, never typed. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { hospitalSourceRows, hospitalSourceSummary, stateOf } from '../lib/private-rate-sources';

type Packed = { sources: { id: string; displayName: string; fileUrl: string; lastUpdatedOn: string; readAt: string }[]; codes: Record<string, [string, number, Record<string, [number, number, number, number, number, [number, number, number, number, number][]]>, unknown]> };
const client = JSON.parse(readFileSync('data/private-rates-client.json', 'utf8')) as Packed;
const lines = JSON.parse(readFileSync('data/private-rates-lines.json', 'utf8')) as { lines: Record<string, { p?: number[]; f?: number[] }> };
const page = readFileSync('app/method/page.tsx', 'utf8');

describe('B-10: the hospital negotiated-rate files on /method', () => {
  const rows = hospitalSourceRows();

  it('one row per source in the data, with its own link and dates', () => {
    expect(rows.map((r) => r.id)).toEqual(client.sources.map((s) => s.id));
    rows.forEach((r, i) => {
      const s = client.sources[i];
      expect(r.fileUrl).toBe(s.fileUrl);
      expect(r.fileDated).toBe(s.lastUpdatedOn);
      expect(r.readOn).toBe(s.readAt.slice(0, 10));
      expect(r.state).toBe(stateOf(s));
      expect(s.displayName.endsWith(` ${r.state}`)).toBe(true);
    });
  });

  it('each hospital\'s services count is the codes whose spreads name it, recounted from the packed file', () => {
    rows.forEach((r, i) => {
      const n = Object.values(client.codes).filter(([, , g]) => Object.values(g).some((sp) => sp[5].some((h) => h[0] === i))).length;
      expect(r.services, r.id).toBe(n);
      expect(r.services).toBeGreaterThan(0);
    });
  });

  it('the summary is counted from the two files', () => {
    const s = hospitalSourceSummary(rows);
    expect(s.hospitals).toBe(client.sources.length);
    expect(s.states).toEqual([...new Set(rows.map((r) => r.state))].sort());
    expect(s.services).toBe(Object.keys(client.codes).length);
    expect(s.linesWithRange).toBe(Object.values(lines.lines).filter((l) => [l.p, l.f].some((g) => g && g[0] >= 2)).length);
  });

  it('the page renders the list from the functions, with no count typed', () => {
    expect(page).toContain('const hospitals = hospitalSourceRows();');
    expect(page).toContain("{ id: 'hospital-rates', text: 'Hospital negotiated rates' }");
    expect(page).toContain('data-testid="hospital-rate-files"');
    const sec = page.slice(page.indexOf('<Sec id="hospital-rates"'), page.indexOf('</Sec>', page.indexOf('<Sec id="hospital-rates"')));
    expect(sec).not.toMatch(/\b(7|96|98|four)\b/);
  });
});

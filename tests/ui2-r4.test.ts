/* Round 4, UI2: the share link carries no words, the drawer names the file its
   figure comes from, and the sheet and the ledger count the same things with
   the same words. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TABLE } from '../lib/table';
import { PRIMARY_FILES, primarySourceOf } from '../lib/primary-source';
import { decodeShare, encodeShare, sharePayload, SHARED_NO_FIGURE } from '../lib/store';
import { gapSummary, NO_FIGURE, noteRowsOf, sheetRowsOf } from '../lib/sheet';
import type { JourneyEntry } from '../lib/types';

const item = (id: string) => {
  const it = TABLE.find((i) => i.id === id);
  if (!it) throw new Error(`fixture row ${id} is not in the published table`);
  return it;
};
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('the share link (R3 c1 C1, clinician C03)', () => {
  const words = 'saw Dr. Alvarez at St. Mary about my lupus';
  const entries: JourneyEntry[] = [
    { key: 'a', raw: words, item: item('cms-99213'), times: 3 },
    { key: 'b', raw: 'they wouldnt do the tilt table test at Mercy', item: null, times: 1, gapCategory: 'care-denied' },
    { key: 'c', raw: 'I skipped the GI referral because I couldnt afford it', item: null, times: 1, gapCategory: 'care-not-sought' },
    { key: 'd', raw: '3 years of looking for an answer', item: null, times: 1, gapCategory: 'time-searching', months: 36 },
    { key: 'e', raw: 'Dr. Chen said it was my nerves', item: null, times: 1 },
  ];

  it('carries no raw text at all', () => {
    const enc = encodeShare(entries, ['lost-work']);
    const json = decodeURIComponent(escape(atob(enc.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (enc.length % 4)) % 4))));
    for (const e of entries) expect(json).not.toContain(e.raw);
    for (const bit of ['Alvarez', 'Mary', 'lupus', 'Mercy', 'Chen', 'nerves', 'afford']) expect(json).not.toContain(bit);
    expect(sharePayload(entries).e.every((r) => r.length === 4)).toBe(true);
  });

  it('keeps denials, skipped care, time spans and counts, so the doctor’s copy matches', () => {
    const d = decodeShare(encodeShare(entries, ['lost-work']))!;
    expect(d.entries.map((e) => e.item?.id ?? null)).toEqual(['cms-99213', null, null, null, null]);
    expect(d.entries.map((e) => e.times)).toEqual([3, 1, 1, 1, 1]);
    expect(d.entries.map((e) => e.gapCategory ?? null)).toEqual([null, 'care-denied', 'care-not-sought', 'time-searching', null]);
    expect(d.entries[3].months).toBe(36);
    expect(d.unpriced).toEqual(['lost-work']);
    const g = gapSummary(d.entries);
    expect(g.months).toBe(36);
    expect(Object.fromEntries(g.cats)['care-denied']?.times).toBe(1);
    expect(Object.fromEntries(g.cats)['care-not-sought']?.times).toBe(1);
    expect(Object.fromEntries(g.cats)[NO_FIGURE]?.lines).toBe(1);
  });

  it('shows unit labels, never invented words, on the receiving ledger', () => {
    const d = decodeShare(encodeShare(entries))!;
    expect(d.entries[0].raw).toBe('');
    expect(d.entries[4].raw).toBe(SHARED_NO_FIGURE);
    expect(d.entries[1].raw.toLowerCase()).toContain('denied');
  });

  it('still opens a link made before round 4', () => {
    const old = btoa(JSON.stringify([['echo', 'cms-img-echo', 1]])).replace(/=+$/, '');
    const d = decodeShare(old)!;
    expect(d.entries[0].item?.id).toBe('cms-img-echo');
  });

  it('the toast says what the link carries', () => {
    const src = read('components/Ledger.tsx');
    expect(src).toContain('It carries only the units, the counts and how long, never your words or a name.');
    expect(src).not.toContain('It carries only the units and counts, no names.');
  });
});

describe('the drawer names the file its own figure comes from (R3 fedexpert FX-03)', () => {
  const audit = JSON.parse(read('data/AUDIT.json')) as {
    sources: Record<string, { sha256: string; file: string; url: string; retrieved: string }>;
    results: { id: string; source_key?: string; check: string }[];
  };

  it('copies the audited file names and hashes exactly', () => {
    for (const k of ['rvu', 'clfs', 'oppsb', 'gpci'] as const) {
      expect(PRIMARY_FILES[k].sha256).toBe(audit.sources[k].sha256);
      expect(PRIMARY_FILES[k].file).toBe(audit.sources[k].file);
      expect(PRIMARY_FILES[k].url).toBe(audit.sources[k].url);
      expect(PRIMARY_FILES[k].retrieved).toBe(audit.sources[k].retrieved);
    }
  });

  it('points every audited CMS row at the file the audit re-derived it from', () => {
    let n = 0;
    for (const r of audit.results) {
      if (!r.source_key || !/^(rvu|clfs|oppsb)/.test(r.source_key)) continue;
      const it = TABLE.find((t) => t.id === r.id);
      if (!it) continue;
      const parts = primarySourceOf(it);
      expect(parts.map((p) => p.file.key).sort().join('+'), r.id).toBe(r.source_key.split('+').sort().join('+'));
      if (r.check === 'PFS re-derivation, non-facility setting') expect(parts[0].fields, r.id).toMatch(/^NON-FACILITY TOTAL/);
      if (r.check === 'PFS re-derivation, facility setting') expect(parts[0].fields, r.id).toMatch(/^FACILITY TOTAL/);
      n++;
    }
    expect(n).toBeGreaterThan(240);
  });

  it('gives $95.19 its own row: 99213 in the RVU file, not the CY2024 claims file', () => {
    const p = primarySourceOf(item('cms-99213'));
    expect(p).toHaveLength(1);
    expect(p[0].file.file).toBe('PPRRVU2026_Jul_nonQPP.csv');
    expect(p[0].row).toContain('99213');
    expect(p[0].file.sha256.startsWith('b7d197e73211')).toBe(true);
  });
});

describe('the sheet (R3 clinician C04, C05, C06)', () => {
  const entries: JourneyEntry[] = [
    { key: 'a', raw: 'It started in March 2023 after covid.', item: null, times: 1 },
    { key: 'b', raw: 'I saw my regular doctor about 8 times', item: item('cms-99213'), times: 8 },
    { key: 'c', raw: 'I nearly fainted', item: null, times: 1 },
    { key: 'd', raw: 'saw a naturopath', item: null, times: 1 },
    { key: 'e', raw: 'I skipped the GI referral', item: null, times: 1, gapCategory: 'care-not-sought' },
  ];
  it('prints words that are not care as the person’s own words, not as cost rows', () => {
    const notes = noteRowsOf(entries).map((e) => e.key);
    const rows = sheetRowsOf(entries).map((e) => e.key);
    expect(notes).toEqual(['a', 'c']);
    expect(rows).toEqual(['b', 'd', 'e']);
    const g = gapSummary(entries);
    expect(Object.fromEntries(g.cats)[NO_FIGURE]?.lines).toBe(1);
  });
  it('asks the patient’s own questions, never a hindsight question about colleagues', () => {
    const src = read('app/sheet/page.tsx');
    expect(src).not.toMatch(/would you have ordered first/);
    expect(src).not.toMatch(/you would not repeat/);
    expect(src).toContain('Published figure <span className="th-sub">({oneLabel})</span>');
    expect(src).toContain('href="/ledger"');
  });
});

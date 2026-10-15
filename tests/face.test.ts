/* FINAL-1011 face (A): the hospital range on the ledger row itself.

   A person saw the named hospitals' posted negotiated rates only after opening
   a line. Each ledger row that has them now carries one line under the Medicare
   figure ("Hospitals’ posted negotiated rates: $x–$y (n hospitals)"), read from
   data/private-rates-lines.json so the row needs no rates file. These hold it
   to the drawer's own first range, keep it out of every total, and keep it from
   ever reading as the person's price. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CLIENT from '../data/private-rates-client.json';
import { privateRangeFor } from '../lib/private-rates';
import { MIN_HOSPITALS, faceRange, faceRangeOf } from '../lib/private-rate-lines';
import { PrivateRangeFace, faceRangeText } from '../components/PrivateRange';
import { priceJourney, totals } from '../lib/pricing';
import { ITEMS } from '../lib/store';

const lines = Object.keys((CLIENT as unknown as { lines: Record<string, string> }).lines);
const face = (id: string) => renderToStaticMarkup(createElement(PrivateRangeFace, { item: { id, label: id }, onOpen: () => {} }));

describe('the row summary is the drawer\'s first range', () => {
  for (const id of ['cms-img-mri-brain-nc', 'cms-lab-a1c', 'cms-g0463-hospital-clinic-fee']) {
    it(`${id}: low, high and hospitals equal the drawer's`, () => {
      const drawer = privateRangeFor({ id, code: '' })!.shown[0];
      const row = faceRange({ id })!;
      expect(row.group).toBe(drawer.group);
      expect([row.low, row.high, row.hospitals]).toEqual([drawer.spread.low, drawer.spread.high, drawer.spread.hospitals]);
      expect(face(id)).toContain(`(${drawer.spread.hospitals} hospitals)`);
    });
  }
  it('and so for every line with hospital rates', () => {
    let shown = 0;
    for (const id of lines) {
      const view = privateRangeFor({ id, code: '' });
      const row = faceRange({ id });
      if (!view) { expect(row, id).toBeNull(); continue; }
      shown++;
      const s = view.shown[0].spread;
      expect(row && [row.low, row.high, row.hospitals], id).toEqual([s.low, s.high, s.hospitals]);
    }
    expect(shown).toBeGreaterThan(50);
  });
});

describe('absent below MIN_HOSPITALS', () => {
  it('a line whose face groups each have fewer hospitals renders nothing', () => {
    const packed = JSON.parse(readFileSync('data/private-rates-lines.json', 'utf8')) as { lines: Record<string, { p?: number[]; f?: number[] }> };
    const thin = Object.entries(packed.lines).filter(([id, g]) => !privateRangeFor({ id, code: '' }) && (g.p || g.f)).map(([id]) => id);
    // The rule itself, below the floor: one hospital is not a range.
    const one = MIN_HOSPITALS - 1;
    expect(faceRangeOf('cms-lab-a1c', { p: [one, 5, 9] })).toBeNull();
    expect(faceRangeOf('cms-lab-a1c', { p: [one, 5, 9], f: [one, 6, 7] })).toBeNull();
    expect(faceRangeOf('cms-g0463-hospital-clinic-fee', { p: [3, 5, 9], f: [one, 6, 7] })).toBeNull();
    // A thin doctor's-fee group falls to the facility group, as the drawer's first range does.
    expect(faceRangeOf('cms-lab-a1c', { p: [one, 5, 9], f: [MIN_HOSPITALS, 6, 7] })).toEqual({ group: 'facility', hospitals: MIN_HOSPITALS, low: 6, high: 7 });
    for (const id of [...thin, 'no-such-line']) {
      expect(faceRange({ id }), id).toBeNull();
      expect(face(id), id).toBe('');
    }
    for (const id of lines) {
      const r = faceRange({ id });
      if (r) expect(r.hospitals, id).toBeGreaterThanOrEqual(MIN_HOSPITALS);
    }
  });
});

describe('never in any total', () => {
  it('a journey of lines with hospital ranges totals the Medicare figures only', () => {
    const withRange = ITEMS.filter((it) => faceRange(it) && it.valueUsd !== null).slice(0, 6);
    expect(withRange.length).toBe(6);
    const entries = withRange.map((item, i) => ({ key: String(i), raw: item.label, item, times: 2 }));
    const want = withRange.reduce((a, it) => a + (it.valueUsd ?? 0) * 2, 0);
    const t = totals(priceJourney(entries as never)) as unknown as Record<string, unknown>;
    const nums = Object.values(t).filter((v): v is number => typeof v === 'number');
    expect(nums.some((n) => Math.abs(n - want) < 0.005)).toBe(true);
    for (const it of withRange) {
      const r = faceRange(it)!;
      for (const n of nums) { expect(n).not.toBe(r.low); expect(n).not.toBe(r.high); }
    }
  });
  it('no module that adds a total reads the hospital rates', () => {
    for (const f of ['lib/pricing.ts', 'lib/sheet.ts', 'lib/ledger-export.ts', 'lib/fhir.ts', 'components/TotalReveal.tsx']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/private-rate/);
    }
  });
});

describe('the words', () => {
  it('the whole ER encounter says which half of the bill its hospital range covers (judge3 #2)', () => {
    const t = faceRangeText({ id: 'cms-ed-99284-complete' });
    expect(t).toMatch(/^Hospitals’ posted negotiated rates, (?:doctor|hospital)’s fee only: /);
    const v = faceRangeText({ id: 'cms-99213' });
    if (v) expect(v).toMatch(/^Hospitals’ posted negotiated rates: /);
  });
  it('say hospitals\' posted negotiated rates, never "near you", "your price" or "$0"', () => {
    for (const id of lines) {
      const text = faceRangeText({ id });
      const html = face(id);
      if (!text) { expect(html).toBe(''); continue; }
      expect(text).toMatch(/^Hospitals’ posted negotiated rates(?:, (?:doctor|hospital)’s fee only)?: \$[\d,]+\.\d\d–\$[\d,]+\.\d\d \(\d+ hospitals\)$/);
      for (const s of [text, html]) {
        expect(s.toLowerCase()).not.toContain('near you');
        expect(s.toLowerCase()).not.toContain('your price');
        expect(s).not.toContain('$0');
        expect(s.toLowerCase()).not.toMatch(/\bcost\b/);
      }
      expect(html).toContain('not added to any total');
    }
  });
});

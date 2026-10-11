/* ==========================================================================
   THE JOURNEY MAP (components/JourneyMap.tsx, /ledger/map).

   The map draws the ledger; it never prices anything itself. These tests pin:
   1. Waypoints are the ledger's lines in the order told, and the summit is the
      ledger's own total (lib/pricing over the same fit), to the cent.
   2. A line with no published figure carries no dollar and does not move the
      running total. Care gone without and lengths of time are off the path.
   3. The wide map's height is the running total: never lower after a later step.
   4. The picture carries the total and the source line, and none of the words
      the person typed unless they chose to put them there.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TABLE } from '../lib/table';
import { totals } from '../lib/pricing';
import type { JourneyEntry } from '../lib/types';
import {
  WIDE, buildJourneyModel, pricedLinesFor, smoothPath, tallX, wideGeometry, wideLabelBoxes,
} from '../components/JourneyMap';
import { PICTURE_FOOT, esc, mapPictureSvg } from '../components/JourneyMapPicture';

const item = (id: string) => {
  const it = TABLE.find((x) => x.id === id);
  if (!it) throw new Error(`no row ${id}`);
  return it;
};
const officeId = 'cms-99213';

const entries = (): JourneyEntry[] => [
  { key: 'a', raw: 'saw my regular doctor three times', item: item(officeId), times: 3 },
  { key: 'g', raw: 'I could not afford the specialist <twice> & gave up', item: null, times: 2, gapCategory: 'care-not-sought' },
  { key: 'b', raw: 'the heart ultrasound thing', item: item('cms-img-echo'), times: 1 },
  { key: 't', raw: 'three years of looking', item: null, times: 1, gapCategory: 'time-searching', months: 36 },
  { key: 'c', raw: 'they shocked my nerves & <b>zapped</b> me', item: null, times: 1 },
  { key: 'd', raw: 'the ER once', item: item('cms-ed-99284-complete'), times: 1, source: 'model' },
];

describe('the map is the ledger, drawn', () => {
  const { lines } = pricedLinesFor(entries(), {});
  const m = buildJourneyModel(lines, null);

  it('keeps the order the person told it, and only the lines that are care', () => {
    expect(m.stops.map((s) => s.key)).toEqual(['a', 'b', 'c', 'd']);
    expect(m.stops.map((s) => s.n)).toEqual([1, 2, 3, 4]);
  });
  it('the summit is the ledger total, and the running total climbs line by line', () => {
    expect(m.totalUsd).toBeCloseTo(totals(lines).totalUsd, 2);
    const o = item(officeId).valueUsd! * 3, e = item('cms-img-echo').valueUsd!, er = item('cms-ed-99284-complete').valueUsd!;
    expect(m.stops[0].runningUsd).toBeCloseTo(o, 2);
    expect(m.stops[1].runningUsd).toBeCloseTo(o + e, 2);
    expect(m.stops[3].runningUsd).toBeCloseTo(o + e + er, 2);
    expect(m.stops[3].runningUsd).toBeCloseTo(m.totalUsd, 2);
  });
  it('an unpriced line is named, carries no dollar and does not move the total', () => {
    const c = m.stops[2];
    expect(c.lineUsd).toBeNull();
    expect(c.ownWords).toBe(true);
    expect(c.safeName).toBe('A step with no federal figure');
    expect(c.runningUsd).toBe(m.stops[1].runningUsd);
    expect(m.blankCount).toBe(1);
    expect(m.pricedCount).toBe(3);
  });
  it('names the agency and the AI reader where they apply', () => {
    expect(m.stops[0].agency).toBe('CMS');
    expect(m.stops[3].ai).toBe(true);
    expect(m.stops[0].ai).toBe(false);
  });
  it('care gone without sits off the path, as a count; time searching is a length, never a step', () => {
    expect(m.offPath).toEqual([{ key: 'care-not-sought', label: 'Care you needed and did not get', count: 2, unit: 'times' }]);
    expect(m.searchMonths).toBe(36);
  });
  it('the counts the person entered in the ledger band win over the sentence', () => {
    const m2 = buildJourneyModel(lines, { 'care-not-sought': 5, 'care-denied': 1 });
    expect(m2.offPath.map((x) => [x.key, x.count])).toEqual([['care-not-sought', 5], ['care-denied', 1]]);
    expect(m2.offPath.every((x) => x.unit === 'occasions')).toBe(true);
  });
  it('a person the published figures do not describe gets hollow markers and no total', () => {
    const { lines: med } = pricedLinesFor(entries(), { coverage: 'medicaid' });
    const mm = buildJourneyModel(med, null);
    expect(mm.stops).toHaveLength(4);
    for (const s of mm.stops) if (s.lineUsd === null) expect(s.blankWhy).toMatch(/No published federal figure/);
  });
});

describe('the wide map climbs with the running total', () => {
  const m = buildJourneyModel(pricedLinesFor(entries(), {}).lines, null);
  const g = wideGeometry(m);
  it('waypoints run left to right, and no later one sits lower on the page', () => {
    for (let i = 1; i < g.pts.length; i++) {
      expect(g.pts[i].x).toBeGreaterThan(g.pts[i - 1].x);
      expect(g.pts[i].y).toBeLessThanOrEqual(g.pts[i - 1].y + 1e-9);
    }
    expect(g.pts[g.pts.length - 1].y).toBeCloseTo(WIDE.top, 5);
    expect(g.pts[2].y).toBe(g.pts[1].y);
  });
  it('labels in the same row never overlap and never leave the frame', () => {
    for (const n of [1, 2, 3, 5, 6, 8]) {
      const xs = Array.from({ length: n }, (_, i) => (n === 1 ? 500 : WIDE.left + ((WIDE.right - WIDE.left) * i) / (n - 1)));
      const b = wideLabelBoxes(xs);
      for (let i = 0; i < n; i++) {
        expect(b[i].left).toBeGreaterThanOrEqual(0);
        expect(b[i].left + b[i].width).toBeLessThanOrEqual(1.0001);
        if (b[i + 2]) expect(b[i].left + b[i].width).toBeLessThan(b[i + 2].left);
      }
    }
  });
  it('the phone path moves right as the total grows and stays inside its rail', () => {
    const xs = m.stops.map((_, i) => tallX(m, i, 96));
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(20); expect(x).toBeLessThanOrEqual(76); }
  });
  it('draws a real path', () => {
    expect(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }])).toMatch(/^M0,0 C.* C.*20,0$/);
  });
});

describe('the picture', () => {
  const m = buildJourneyModel(pricedLinesFor(entries(), {}).lines, null);
  const base = { basis: 'Medicare allowed amounts', totalUsd: m.totalUsd };

  it('carries the total and says where every figure comes from', () => {
    const { svg, width, height } = mapPictureSvg(m, { ...base, ownWords: false });
    expect(width).toBe(1080);
    expect(height).toBeGreaterThan(1000);
    expect(svg).toContain(PICTURE_FOOT);
    expect(PICTURE_FOOT).toBe('Priced from published federal figures · waypointledger.org');
    const whole = `$${Math.round(m.totalUsd).toLocaleString('en-US')}`;
    expect(svg).toContain(whole);
    expect(svg).toContain('Medicare allowed amounts');
  });
  it('carries none of the words the person typed unless they choose it', () => {
    const { svg } = mapPictureSvg(m, { ...base, ownWords: false });
    for (const e of entries()) expect(svg).not.toContain(esc(e.raw).slice(0, 18));
    expect(svg).not.toMatch(/shocked|zapped|afford|regular doctor|ultrasound thing|three years of/);
    expect(svg).toContain('A step with no federal figure');
    const mine = mapPictureSvg(m, { ...base, ownWords: true }).svg;
    expect(mine).toContain('shocked my nerves');
    expect(mine).toContain('&amp;');
    expect(mine).toContain('&lt;b&gt;');
    expect(mine).not.toContain('<b>');
    expect(mine).not.toMatch(/afford|regular doctor/);
  });
  it('an unpriced step has no dollar on the picture; care gone without is a count', () => {
    const { svg } = mapPictureSvg(m, { ...base, ownWords: false });
    expect(svg).toContain('no federal figure');
    expect(svg).toContain('Care you needed and did not get: 2 times');
    expect(svg).toContain('3 years of searching');
  });
  it('prints no total when there is none to print', () => {
    const { svg } = mapPictureSvg(m, { ...base, totalUsd: null, noTotal: 'No published federal figure describes you here', ownWords: false });
    /* set in lines, so read it back as words */
    const words = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((x) => x[1]).join(' ');
    expect(words).toContain('No published federal figure describes you here');
    expect(svg).not.toContain('Where the path reaches');
  });
});

describe('copy', () => {
  const src = readFileSync('components/JourneyMap.tsx', 'utf8') + readFileSync('components/JourneyMapPicture.ts', 'utf8') + readFileSync('app/ledger/map/page.tsx', 'utf8');
  it('no banned words, no em-dash, counts never called people', () => {
    expect(src).not.toMatch(/\b(prototype|demo|mockup|mock-up|MVP|TODO|lorem)\b/i);
    expect(src).not.toContain('—');
    expect(src).not.toMatch(/\bpeople\b/);
  });
});

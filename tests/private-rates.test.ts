/* ==========================================================================
   HOSPITAL-PUBLISHED NEGOTIATED RATES (45 CFR 180): the integrity pins.

   1. Every row in a range carries its provenance: the hospital, the file's URL,
      the file's sha256, the date it was read, the payer and plan as written, the
      code and its type, the rate and its type, and the setting.
   2. No average across plans: every low, median and high is recomputed here from
      the rows, and each one is a dollar amount a hospital actually printed.
   3. 99213 is pinned: recomputed from data/private-rates.json, which the build
      wrote from the hospitals' files whose hashes are pinned below.
   4. The Medicare figures do not move, and these rates never reach a total.
   5. The label: never "federal figure", never "national" or "typical".
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FULL from '../data/private-rates.json';
import SUMMARY from '../data/private-rates-summary.json';
import { TABLE } from '../lib/table';
import { fitOf } from '../lib/fit';
import type { Coverage } from '../lib/fit';
import { privateRangeFor, MIN_HOSPITALS, PRIVATE_RATE_LABEL_LONG, PRIVATE_RATE_CODES } from '../lib/private-rates';
import PrivateRange from '../components/PrivateRange';
import { onRequestGet } from '../cf/functions/api/private-rates/[code].js';

(globalThis as unknown as { React: typeof React }).React = React;

type Full = {
  rowColumns: string[];
  sources: { id: string; fileUrl: string; sha256: string; readAt: string; hospitalName: string; lastUpdatedOn: string; rule: string }[];
  codes: Record<string, {
    codeType: string;
    rowConstants: Record<string, unknown>;
    groups: Record<string, { low: number; median: number; high: number; rates: number; rows: number; hospitals: number;
      byHospital: { source: string; low: number; high: number; rates: number; rows: number }[] }>;
    rows: unknown[][];
  }>;
};
const F = FULL as unknown as Full;
const col = (name: string) => F.rowColumns.indexOf(name);
const rowsOf = (code: string) => F.codes[code].rows.map((r) => Object.fromEntries(F.rowColumns.map((k, i) => [k, r[i]])) as Record<string, unknown>);

const medianLow = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };

describe('the files: seven hospital files, each pinned by sha256', () => {
  it('pins every file hash the ranges were built from', () => {
    const pins: Record<string, string> = {
      uihc: '7124f50a62cd7c4fa8a3c30440b9dbf75f0b1f5a3bed1f9c2d9b2a0012590aeb',
      'cleveland-clinic': '7908c58768b530bd0d2eae31ed731fbd8cb671dcba5e500d522a2039b1a5c881',
      'unitypoint-iowa-methodist': '484af861bb5d384ea28582536b92381be44961821095e054698e08cde8d9477a',
      'mercyone-des-moines': '146c314068b2cf8d87d16cf52ff4c122c4448b0b9523861ef37d549efdd9d4cb',
      'chi-mercy-council-bluffs': 'a30c90f6eab31a22f6fe7e072284d55eae08636d0fd1b43c27edd12b06d732d0',
      'commonspirit-st-josephs-phoenix': '719db1e3699591cf703327046f2043860a768372db6db5ada70028b36773ad97',
      'hca-medical-city-dallas': 'bdec9ce186f75ee4267ad962e00ce8d615e219d1dd97de505a46f1c5c6bd6468',
    };
    expect(Object.fromEntries(F.sources.map((s) => [s.id, s.sha256]))).toEqual(pins);
    for (const s of F.sources) {
      expect(s.fileUrl).toMatch(/^https:\/\//);
      expect(s.readAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(s.lastUpdatedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.hospitalName).toBeTruthy();
      expect(s.rule).toBe('45 CFR 180.50');
    }
  });
});

describe('provenance on every row in a range', () => {
  const ids = new Set(F.sources.map((s) => s.id));
  it('every row names its file, payer, plan, code, rate type, setting and row', () => {
    /* problems are collected and asserted once: 15,019 rows times a dozen expect()
       calls is slow enough to time out when the whole suite runs in parallel */
    const bad: string[] = [];
    const nonEmpty = (v: unknown) => typeof v === 'string' && v.length > 0;
    let n = 0;
    for (const [code, c] of Object.entries(F.codes)) {
      expect(c.rowConstants).toMatchObject({ planClass: 'commercial', rateType: 'negotiated_dollar', modifiers: null, code });
      expect(['CPT', 'HCPCS']).toContain(c.codeType);
      for (const r of rowsOf(code)) {
        n++;
        const d = r.negotiatedDollar as number;
        const why = [
          !ids.has(r.source as string) && 'source',
          !nonEmpty(r.payer) && 'payer',
          !nonEmpty(r.plan) && 'plan',
          !nonEmpty(r.planClassMatched) && 'planClassMatched',
          !['professional', 'facility', 'not_stated'].includes(r.billingClass as string) && 'billingClass',
          !['outpatient', 'both'].includes(r.setting as string) && 'setting',
          !['fee schedule', 'case rate'].includes(String(r.methodology).toLowerCase()) && 'methodology',
          !(typeof d === 'number' && d > 0) && 'negotiatedDollar',
          r.grossCheckedAgainst !== null && d > (r.grossCheckedAgainst as number) && 'above gross',
          !Number.isInteger(r.sourceRow) && 'sourceRow',
        ].filter(Boolean);
        if (why.length) bad.push(`${code} ${r.source} row ${r.sourceRow}: ${why.join(', ')}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(n).toBe(15019);
  }, 30_000);
});

describe('no average across plans: every spread recomputed from its rows', () => {
  it('low, median and high are distinct printed rates, per billing class', () => {
    for (const [code, c] of Object.entries(F.codes)) {
      const rows = rowsOf(code);
      for (const [g, sp] of Object.entries(c.groups)) {
        const mine = rows.filter((r) => r.billingClass === g);
        const perHospital = new Map<string, Set<number>>();
        for (const r of mine) {
          const k = r.source as string;
          if (!perHospital.has(k)) perHospital.set(k, new Set());
          perHospital.get(k)!.add(Math.round((r.negotiatedDollar as number) * 100) / 100);
        }
        const values = [...perHospital.values()].flatMap((s) => [...s]);
        expect(sp.rates).toBe(values.length);
        expect(sp.rows).toBe(mine.length);
        expect(sp.hospitals).toBe(perHospital.size);
        expect(sp.low).toBe(Math.min(...values));
        expect(sp.high).toBe(Math.max(...values));
        expect(sp.median).toBe(medianLow(values));
        // the median is a rate a hospital printed, never the mean of two
        expect(values).toContain(sp.median);
      }
    }
  }, 30_000);

  it('99213, the doctor\'s fee: $83.62 to $219.72, median $114.52, 13 rates at 4 hospitals', () => {
    const rows = rowsOf('99213').filter((r) => r.billingClass === 'professional');
    const byH = new Map<string, Set<number>>();
    for (const r of rows) {
      if (!byH.has(r.source as string)) byH.set(r.source as string, new Set());
      byH.get(r.source as string)!.add(r.negotiatedDollar as number);
    }
    const v = [...byH.values()].flatMap((s) => [...s]);
    expect(Math.min(...v)).toBe(83.62);
    expect(medianLow(v)).toBe(114.52);
    expect(Math.max(...v)).toBe(219.72);
    expect(v.length).toBe(13);
    expect([...byH.keys()].sort()).toEqual(['cleveland-clinic', 'mercyone-des-moines', 'uihc', 'unitypoint-iowa-methodist']);
    // and the summary the browser imports says the same
    const s = (SUMMARY as unknown as Full).codes['99213'].groups.professional;
    expect([s.low, s.median, s.high, s.rates, s.hospitals]).toEqual([83.62, 114.52, 219.72, 13, 4]);
  });
});

describe('the packed file the browser imports says exactly what the summary says', () => {
  it('every code, group, hospital span and left-out count unpacks to the summary', () => {
    const sum = (SUMMARY as unknown as { codes: Record<string, { codeType: string; ledgerLines: string[]; rowsRead: number; notInSpread: Record<string, number>;
      groups: Record<string, { low: number; median: number; high: number; rates: number; rows: number; hospitals: number; byHospital: unknown[] }> }> }).codes;
    expect(Object.keys(PRIVATE_RATE_CODES).sort()).toEqual(Object.keys(sum).sort());
    for (const [code, c] of Object.entries(sum)) {
      const u = PRIVATE_RATE_CODES[code];
      expect(u.codeType).toBe(c.codeType);
      expect(u.ledgerLines.sort()).toEqual([...c.ledgerLines].sort());
      expect(u.rowsRead).toBe(c.rowsRead);
      expect(u.notInSpread).toEqual(c.notInSpread);
      for (const [g, sp] of Object.entries(c.groups)) {
        const v = u.groups[g as 'professional']!;
        expect([v.low, v.median, v.high, v.rates, v.rows, v.hospitals]).toEqual([sp.low, sp.median, sp.high, sp.rates, sp.rows, sp.hospitals]);
        expect(v.byHospital).toEqual(sp.byHospital);
      }
    }
  });
});

describe('the Medicare figures do not move, and these rates never reach a total', () => {
  it('every Medicare row keeps its figure for every coverage that sees the reference price', () => {
    const visit = TABLE.find((t) => t.id === 'cms-99213')!;
    expect(visit.valueUsd).toBe(95.19);
    for (const item of TABLE.filter((t) => /medicare/i.test(t.population))) {
      for (const c of ['employer', 'marketplace'] as Coverage[]) {
        const f = fitOf(item, { coverage: c });
        expect(f.figureUsd).toBe(item.valueUsd);
        expect(f.verdict).toBe('REFERENCE PRICE');
        expect(f.why).toMatch(/no federal file publishes/i);
      }
    }
  });

  it('the employer and Marketplace message says what hospitals do publish, when two or more do', () => {
    const visit = TABLE.find((t) => t.id === 'cms-99213')!;
    const f = fitOf(visit, { coverage: 'employer' });
    expect(f.why).toMatch(/45 CFR 180/);
    expect(f.why).toMatch(/4 hospitals' files list commercial rates/);
    expect(f.why).toMatch(/never added to your total/);
    expect(f.why).not.toMatch(/\$\d/);
  });

  it('no pricing, total or export module imports the private rates', () => {
    for (const f of ['lib/pricing.ts', 'lib/table.ts', 'lib/paid.ts', 'lib/fhir.ts', 'lib/sheet.ts']) {
      expect(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).not.toMatch(/private-rates/);
    }
  });
});

describe('PrivateRange on the line', () => {
  const visit = TABLE.find((t) => t.id === 'cms-99213')!;
  const html = renderToStaticMarkup(createElement(PrivateRange, { item: visit }));
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&rsquo;|’/g, "'").replace(/\s+/g, ' ');

  it('shows the range, its median, its counts, and one row per hospital with its read date', () => {
    expect(text).toContain('45 CFR 180');
    expect(text).toMatch(/\$83\.62 to \$219\.72, median \$114\.52, 13 rates at 4 hospitals/);
    const rows = html.match(/<li class="[^"]*hRow[^"]*">[\s\S]*?<\/li>/g) ?? [];
    expect(rows.length).toBe(4);
    for (const r of rows) expect(r).toMatch(/read 2026-10-01/);
    expect(text).toContain('University of Iowa Health Care Medical Center');
    expect(text).toContain('Cleveland Clinic Main Campus');
    expect(text).not.toMatch(/Iowa City IA · /);   // no run-on list of hospitals
    expect(html).not.toContain('font-m');
    expect(html).toContain('/api/private-rates/99213');
  });

  it('is compact closed: the range in words and a bar in the summary, the legal source outside it', () => {
    const summary = html.match(/<summary>([\s\S]*?)<\/summary>/)![1];
    const sumText = summary.replace(/<[^>]+>/g, '').replace(/&#x27;|&rsquo;|’/g, "'").replace(/&ndash;|–/g, '-').replace(/\s+/g, ' ').trim();
    expect(sumText).toBe('Hospital rates: $83.62-$219.72, 4 hospitals');
    expect(summary).toMatch(/data-range-bar/);
    expect(summary).not.toMatch(/<a\b/);           // no link nested in the button
    const after = html.slice(html.lastIndexOf('</details>'));
    expect(after).toMatch(/Medicare \$95\.19, not added · hospital price transparency files \(<a [^>]*href="https:\/\/www\.govinfo\.gov\/link\/cfr\/45\/180[^"]*"[^>]*>45 CFR 180<\/a>\)/);
    expect(html).toContain('(required by the federal hospital price transparency rule, 45 CFR 180)');
  });

  it('the bar starts at $0 and every mark sits where its figure is', () => {
    const bar = html.match(/<span[^>]*data-range-bar[^>]*>[\s\S]*?<\/span><\/span>/)![0];
    expect(bar).toMatch(/aria-label="[^"]*from \$83\.62 to \$219\.72, median \$114\.52, on a scale that starts at \$0\. Medicare(?:'|&#x27;)s \$95\.19 is marked, not added\."/);
    const max = 219.72 * 1.04;
    const pct = (v: number) => `${((v / max) * 100).toFixed(2)}%`;
    expect(bar).toContain(`left:${pct(83.62)}`);
    expect(bar).toContain(`left:${pct(114.52)}`);
    expect(bar).toContain(`left:${pct(95.19)}`);
  });

  it('the Medicare marker reads the same figure the drawer shows, national and by locality', async () => {
    const { default: LineDrawer } = await import('../components/LineDrawer');
    const { LOCALITIES } = await import('../lib/fit');
    const loc = LOCALITIES.find((l) => l.key === 'IA-00')!.key;
    for (const ctx of [{}, { coverage: 'employer' as Coverage }, { coverage: 'marketplace' as Coverage, locality: loc }, { coverage: 'medicare' as Coverage, locality: loc }]) {
      for (const id of ['cms-99213', 'cms-img-echo', 'cms-test-emg', 'cms-g0463-hospital-clinic-fee']) {
        const it_ = TABLE.find((t) => t.id === id)!;
        const drawer = renderToStaticMarkup(createElement(LineDrawer, { item: it_, ctx, onClose: () => {} }));
        const big = drawer.match(/class="fig-num[^"]*">([^<]+)</)![1];
        const band = renderToStaticMarkup(createElement(PrivateRange, { item: it_, ctx }));
        const marker = band.match(/data-medicare-usd="([\d.]+)"/);
        expect(marker, `${id} ${JSON.stringify(ctx)}`).not.toBeNull();
        expect(`$${Number(marker![1]).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).toBe(big);
        expect(Number(marker![1])).toBe(fitOf(it_, ctx).figureUsd);
      }
    }
  });

  it('the whole ER visit marks Medicare on neither half, and says why', () => {
    const er = TABLE.find((t) => t.id === 'cms-ed-99284-complete')!;
    const out = renderToStaticMarkup(createElement(PrivateRange, { item: er }));
    expect(out).not.toMatch(/data-medicare-usd/);
    expect(out).toMatch(/is the whole visit/);
  });

  it('never calls them federal, national or typical, and holds back a one-hospital class', () => {
    expect(text).not.toMatch(/\bnational\b/i);
    expect(text).not.toMatch(/\btypical\b/i);
    expect(text.replace(/not federal figures/gi, '')).not.toMatch(/federal figure/i);
    // MercyOne alone lists a facility rate for 99213 ($91.90): one hospital is not a range
    expect(text).not.toContain('$91.90');
    expect(privateRangeFor(visit)!.heldBack).toEqual([{ group: 'facility', hospitals: 1 }]);
  });

  it('never renders a fee-type-not-stated rate as a dollar amount, on any line (99214: no $2,845.80)', () => {
    const sum = (SUMMARY as unknown as { codes: Record<string, { groups: Record<string, { low: number; median: number; high: number;
      byHospital: { low: number; high: number }[] }> }> }).codes;
    const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    let lines = 0;
    for (const item of TABLE) {
      const v = privateRangeFor(item);
      if (!v) continue;
      lines++;
      const g = sum[v.code].groups;
      const allowed = new Set<string>();
      for (const k of ['professional', 'facility']) {
        const sp = g[k];
        if (!sp) continue;
        [sp.low, sp.median, sp.high, ...sp.byHospital.flatMap((h) => [h.low, h.high])].forEach((n) => allowed.add(money(n)));
      }
      // the Medicare figure the drawer shows is the one other dollar the band may print
      if (item.valueUsd !== null) allowed.add(money(item.valueUsd));
      const out = renderToStaticMarkup(createElement(PrivateRange, { item }));
      const shown = out.match(/\$[\d,]+\.\d{2}/g) ?? [];
      expect(shown.filter((x) => !allowed.has(x)), item.id).toEqual([]);
      if (g.not_stated) expect(out, item.id).toMatch(/whose file does not say whether (it is|they are) the doctor.s or the hospital.s fee (is|are) not shown/);
    }
    expect(lines).toBeGreaterThan(80);
    const v14 = TABLE.find((t) => t.id === 'cms-99214')!;
    const h14 = renderToStaticMarkup(createElement(PrivateRange, { item: v14 }));
    expect(h14).not.toContain('2,845.80');
    expect(h14).toMatch(/46 rates whose file does not say whether they are the doctor.s or the hospital.s fee are not shown/);
  });

  it('every range on every line has rates from at least two hospitals', () => {
    for (const item of TABLE) {
      const v = privateRangeFor(item);
      if (!v) continue;
      for (const r of v.shown) expect(r.spread.hospitals).toBeGreaterThanOrEqual(MIN_HOSPITALS);
    }
  });

  it('renders nothing for a line with no code', () => {
    const meps = TABLE.find((t) => !t.code)!;
    expect(renderToStaticMarkup(createElement(PrivateRange, { item: meps }))).toBe('');
  });
});

describe('GET /api/private-rates/{code}', () => {
  const call = async (code: string, q = '') =>
    onRequestGet({ request: new Request(`http://x/api/private-rates/${code}${q}`), params: { code } });

  it('returns each range with its hospitals and file hashes, and every row with provenance', async () => {
    const res = await call('99213');
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.label).toBe(PRIVATE_RATE_LABEL_LONG);
    expect(b.notFederal).toMatch(/not federal figures/i);
    const p = b.groups.professional;
    expect([p.low, p.median, p.high, p.rates, p.hospitalCount, p.shownAsRange]).toEqual([83.62, 114.52, 219.72, 13, 4, true]);
    for (const h of p.hospitals) {
      expect(h.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(h.fileUrl).toMatch(/^https:\/\//);
      expect(h.readAt).toBeTruthy();
    }
    expect(b.groups.facility.shownAsRange).toBe(false);
    expect(b.groups.not_stated.feeType).toBe('unstated');
    expect(b.groups.not_stated.shownAsRange).toBe(false);
    const unstated = b.rows.filter((r: { feeType: string }) => r.feeType === 'unstated');
    expect(unstated.length).toBe(b.rows.filter((r: { billingClass: string }) => r.billingClass === 'not_stated').length);
    expect(unstated.length).toBeGreaterThan(0);
    expect(b.rows.length).toBe(F.codes['99213'].rows.length);
    for (const r of b.rows) {
      for (const k of ['hospital', 'fileUrl', 'sha256', 'readAt', 'payer', 'plan', 'code', 'codeType', 'negotiatedDollar', 'rateType', 'setting', 'billingClass', 'sourceRow']) {
        expect(r[k], k).not.toBeUndefined();
      }
    }
  });

  it('leaves the rows out with ?rows=0, refuses a non-code, and 404s a code no file prices', async () => {
    expect((await (await call('99213', '?rows=0')).json()).rows).toBeUndefined();
    expect((await call('abc')).status).toBe(400);
    expect((await call('12345')).status).toBe(404);
  });
});

it('the column list the API reads is the one the build wrote', () => {
  expect(col('negotiatedDollar')).toBeGreaterThan(-1);
  expect(col('source')).toBe(0);
});

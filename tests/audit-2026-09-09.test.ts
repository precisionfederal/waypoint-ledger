/* THE 2026-09-09 AUDIT, LOCKED IN CODE.

   Every figure in the table was re-derived that night from four CMS files that
   were downloaded again from cms.gov in that session, so the hashes below are
   not copied out of data/AUDIT.json — they are what the government served, and
   AUDIT.json is the thing on trial. That direction matters: without it, a row
   could be made to pass by editing the recorded hash instead of the figure.

   The rest of this file guards the ways a true table can still tell a lie:
   prose that drifts away from the figure it explains, a lab priced off the
   physician schedule, a file that names a source the table no longer carries,
   and a card that tells a person no federal figure exists while one sits in
   the table. Full write-up: data/AUDIT-2026-09-09.md. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import prices from '../data/prices.json';
import unpriceable from '../data/unpriceable.json';
import invisible from '../data/invisible-events.json';
import { countTrips } from '../lib/burdens';

const root = fileURLToPath(new URL('..', import.meta.url));
const items = prices.items as Array<Record<string, any>>;
const audit = JSON.parse(readFileSync(root + 'data/AUDIT.json', 'utf8')) as {
  rows: number; pass: number; fail: number; unverified: number;
  alternates: number; alternates_pass: number; alternates_fail: number; alternates_unverified: number;
  sources: Record<string, { sha256: string; file: string; url: string }>;
};

/** What cms.gov served on 2026-09-09, hashed from a fresh download in that session. */
const SERVED_SHA256: Record<string, string> = {
  rvu: 'b7d197e73211ef6854c213c267d5fa9dec8df995db8e1ee7d44c0556ad7cee21',
  gpci: '7850e2987d12e46930e49033f96829b5ae11f60dd1f19965329b38cf08b05264',
  clfs: 'f5a090789c40fe791b478a735c7cf5399e86726adc788f11829435cb0ca4d7d5',
  oppsb: '1f34d9770231f66b877fc84ce2bd08dceb562309729dfb597e1ff8dafcfc9006',
};

describe('the audit is a fact, not a note', () => {
  it('every row reproduced, and nothing was left unverified', () => {
    expect(audit.fail).toBe(0);
    expect(audit.unverified).toBe(0);
    expect(audit.pass).toBe(audit.rows);
    expect(audit.rows).toBe(items.length);
  });

  it('every CY2024 companion figure reproduced too', () => {
    expect(audit.alternates_fail).toBe(0);
    expect(audit.alternates_unverified).toBe(0);
    expect(audit.alternates_pass).toBe(audit.alternates);
  });

  it('the audit read the files the government actually served, not files it chose', () => {
    for (const [name, sha] of Object.entries(SERVED_SHA256)) {
      expect(audit.sources[name], `AUDIT.json records no ${name} source`).toBeTruthy();
      expect(audit.sources[name].sha256, `${name} (${audit.sources[name]?.file})`).toBe(sha);
    }
  });
});

describe('the prose can never drift away from the figure it explains', () => {
  /* 28 rows print their own multiplication on the page: "2.85 Total RVUs x $33.4009".
     A person is invited to redo it, so it has to come out. */
  const quoted = items
    .map((i) => ({ i, m: /([\d.]+)\s*Total RVUs?\s*x\s*\$?([\d,.]+)/i.exec(i.coverage_statement || '') }))
    .filter((x) => x.m);

  it('reads the multiplication on at least the rows that print one', () => {
    expect(quoted.length).toBeGreaterThanOrEqual(28);
  });

  it.each(quoted.map((x) => [x.i.id as string, x] as const))('%s multiplies out to its own value', (_id, x) => {
    const rvu = Number(x.m![1]);
    const cf = Number(x.m![2].replace(/,/g, ''));
    expect(Math.round(rvu * cf * 100) / 100).toBeCloseTo(x.i.value_usd as number, 2);
  });
});

describe('a figure is priced in the schedule that publishes it', () => {
  const familyOf = (title: string) =>
    /Relative Value|Physician Fee Schedule/.test(title) ? 'PFS'
      : /Laboratory/.test(title) ? 'CLFS'
        : /Outpatient/.test(title) ? 'OPPS' : 'other';

  it('no lab code is priced off the physician schedule, and no procedure off the lab schedule', () => {
    const wrong: string[] = [];
    for (const i of items) {
      const n = Number(/(\d{5})/.exec(String(i.code ?? ''))?.[1]);
      if (!n) continue;
      const fam = familyOf(String(i.source_title ?? ''));
      const isLabCode = n >= 80000 && n <= 89999;
      if (isLabCode && fam === 'PFS') wrong.push(`${i.id} is a lab code priced on the PFS`);
      if (!isLabCode && fam === 'CLFS') wrong.push(`${i.id} is not a lab code but is priced on the CLFS`);
    }
    expect(wrong).toEqual([]);
  });
});

describe('a file may not name a source the table no longer carries', () => {
  /* data/unpriceable.json cited MEPS Statistical Brief #549 for months after the
     table stopped citing it. A reader who goes looking finds nothing. */
  const briefsCited = new Set(
    items.flatMap((i) => [...String(i.source_title ?? '').matchAll(/Statistical Brief #(\d+)/g)].map((m) => m[1])),
  );
  const prose = JSON.stringify(unpriceable) + JSON.stringify(invisible);

  it('every AHRQ brief these files name is one a row in the table cites', () => {
    const named = [...new Set([...prose.matchAll(/Statistical Brief #(\d+)/g)].map((m) => m[1]))];
    expect(named.filter((n) => !briefsCited.has(n))).toEqual([]);
  });
});

describe('an absence claimed in one file is not contradicted by another', () => {
  it('the gap categories do not all claim zero rows when two of them are billed', () => {
    const readme = (invisible as { _README: string })._README;
    const billed = (invisible as { categories: Array<{ id: string; whyInvisible: string }> }).categories
      .filter((c) => /billed|fully recorded|fully paid/i.test(c.whyInvisible));
    expect(billed.length).toBeGreaterThan(0);
    expect(readme).not.toMatch(/Every event listed here produces ZERO ROWS/);
  });

  it('the trips card names the per-mile input the table holds, instead of implying it holds nothing', () => {
    const inputs = items.filter((i) => /\b(mileage|per[- ]trip|travel)\b/i.test(String(i.label ?? '')));
    const card = countTrips(3);
    expect(card.valueUsd).toBeNull();
    for (const i of inputs) {
      expect(i.summable, `${i.id} must never be summable — a per-trip figure could enter a medical total`).toBe(false);
      expect(card.noFigureReason ?? '').toContain((i.value_usd as number).toFixed(2));
    }
  });
});

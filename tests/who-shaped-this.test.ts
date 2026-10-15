/* FINAL-1011 proof #2: /who-shaped-this. Pins the page to the record it was read
   from: two change-log rows (GET /api/changes, n 2), the four advocate survey
   answers, the 12 September advocate, the 14 September interview in progress,
   the federal leads by role only, HHS's Health+ reports, and the honest not-yet
   rows. Every proof link must land on a route and an anchor that exist. */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WhoShaped, { ROWS, STATUS_LABEL, READ_ON } from '../components/WhoShaped';

const ROOT = join(__dirname, '..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');
const text = (r: (typeof ROWS)[number]) => [r.who, r.heard ?? '', r.input, r.built, r.builtOn ?? '', ...r.proof.map((p) => p.label)].join(' ');

/* Where each internal anchor is defined. */
const ANCHOR_SOURCES: Record<string, string[]> = {
  '/register': ['components/Register.tsx'],
  '/method': ['app/method/page.tsx'],
};

describe('/who-shaped-this: rows only from the record', () => {
  it('is a static page with its own route', () => {
    const page = read('app/who-shaped-this/page.tsx');
    expect(page).not.toContain("'use client'");
    expect(read('components/WhoShaped.tsx')).not.toContain("'use client'");
    expect(page).toContain('<WhoShaped />');
  });

  it('carries exactly the five published change-log entries, each linked to /api/changes (read 13 Oct: /api/changes n 5)', () => {
    const fromChanges = ROWS.filter((r) => r.proof.some((p) => p.href === '/api/changes'));
    expect(fromChanges.map((r) => r.id).sort()).toEqual(['child-onset', 'forgone', 'interview-0914', 'interview-meds', 'interview-plain']);
    for (const r of fromChanges) { expect(r.builtOn).not.toBeNull(); expect(r.status).toBe('live'); }
    expect(ROWS.find((r) => r.id === 'forgone')!.input).toContain('by 43');
    expect(ROWS.find((r) => r.id === 'child-onset')!.heard).toBe('12 Sep 2026');
  });

  it('the 14 September interview is live since 11 October, with no quote', () => {
    const r = ROWS.find((x) => x.id === 'interview-0914')!;
    expect(r.status).toBe('live');
    expect(r.heard).toBe('14 Sep 2026');
    expect(r.built).toContain('Care that made you worse is now counted');
    expect(r.builtOn).toBe('11 Oct 2026');
  });

  it('the federal leads appear by role only, paraphrased, on the office-hours date', () => {
    const leads = ROWS.filter((r) => /federal lead|NIH health economist/.test(r.who));
    expect(leads.map((r) => r.id).sort()).toEqual(['coverage', 'health-plus', 'thumbs']);
    for (const r of leads) expect(r.heard).toBe('20 Aug 2026');
  });

  it('🔴 names no person and quotes no one', () => {
    for (const r of ROWS) {
      const t = text(r);
      expect(t, r.id).not.toMatch(/\b(Dr\.|Honey|Phillips|Kristen|John|Bo|Peng)\b/);
      expect(t, r.id).not.toMatch(/["“”]/);
      expect(t, r.id).not.toContain('—');
    }
  });

  it('keeps the honest rows: nothing delivered to an agency yet, and four answers is a small sample', () => {
    const notYet = ROWS.filter((r) => r.status === 'not-yet');
    expect(notYet.map((r) => r.id).sort()).toEqual(['agency']);
    expect(ROWS.find((r) => r.id === 'agency')!.built).toContain('Nothing has been delivered to an agency yet');
    expect(ROWS.find((r) => r.id === 'small-n')!.input).toContain('Four answers is a small sample');
  });

  it('every row links to its proof, and every internal link lands on a page and an anchor that exist', () => {
    for (const r of ROWS) {
      expect(r.proof.length, r.id).toBeGreaterThan(0);
      for (const p of r.proof) {
        if (p.href.startsWith('http')) { expect(p.href).toMatch(/^https:\/\/www\.hhs\.gov\//); continue; }
        const [path, anchor] = p.href.split('#');
        if (path.startsWith('/api/')) { expect(existsSync(join(ROOT, `cf/functions${path}.js`)), p.href).toBe(true); continue; }
        expect(existsSync(join(ROOT, `app${path}/page.tsx`)), p.href).toBe(true);
        if (anchor) {
          const srcs = ANCHOR_SOURCES[path];
          expect(srcs, p.href).toBeDefined();
          expect(srcs.some((f) => new RegExp(`id(=|: )["']${anchor}["']`).test(read(f))), p.href).toBe(true);
        }
      }
    }
  });

  it('renders every row, its status in words and the date it was read', () => {
    const html = renderToStaticMarkup(createElement(WhoShaped));
    for (const r of ROWS) expect(html).toContain(`id="${r.id}"`);
    for (const st of new Set(ROWS.map((r) => STATUS_LABEL[r.status]))) expect(html).toContain(`>${st}<`);
    expect((html.match(/<tr /g) || []).length).toBe(ROWS.length);
    expect(read('app/who-shaped-this/page.tsx')).toContain('{READ_ON}');
    expect(READ_ON).toBe('13 October 2026');
  });
});

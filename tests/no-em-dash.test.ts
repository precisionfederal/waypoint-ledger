/* ==========================================================================
   NO EM-DASH IN ANYTHING A PERSON READS (FLOW3 sweep, 2026-10-01).

   Person-facing text uses a colon, a comma, parentheses or a full stop. The
   one exception is a verbatim quote of a government source, which is shown
   exactly as it was published. Each such quote is listed in VERBATIM below
   with where it comes from. A new em-dash anywhere else fails this test.

   Three nets:
     1. every string in the data the app ships and publishes (data/*.json,
        public/data.json, public/data/*.json and *.csv), and the two markdown
        files /method renders (data/METHOD.md, data/GAPS.md);
     2. every source file that renders copy (app, components, lib, the
        Cloudflare functions, the static public pages), with comments removed;
     3. the rendered markup of the demo ledger, the sheet, and the line drawer
        for every row of the price table.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Ledger from '../components/Ledger';
import Sheet from '../app/sheet/page';
import LineDrawer from '../components/LineDrawer';
import { TABLE } from '../lib/table';
import { demoEntries, fakeStore, renderWith } from './helpers/ledger-render';

const DASH = '—';

/** Verbatim government quotes, kept exactly as published. */
const VERBATIM: { text: string; source: string }[] = [
  {
    text: 'Chronic kidney disease (CKD) affects more than 1 in 7 U.S. adults—an estimated 35.5 million Americans.',
    source: 'CDC, Chronic Kidney Disease in the United States, quoted in data/conditions.json (published_figures.sources.quote)',
  },
  {
    text: 'Prevalence of Inflammatory Bowel Disease Among Adults Aged ≥18 Years — United States, 2015',
    source: 'MMWR 2016;65(42):1166–1169, the article title as CDC printed it, in data/conditions.json (published_figures.sources.title)',
  },
];

/** Code that MATCHES an old em-dash in someone else's text (never prints one). Written as —. */
const MATCHERS: { file: string; line: string }[] = [
  { file: 'components/LineDrawer.tsx', line: "t.replace(/\\s+\\u2014\\s+/g, ': ')" },
  { file: 'components/Register.tsx', line: "[/^THE HEADLINE(?::|\\s+\\u2014)\\s+/, 'The headline']" },
  { file: 'components/Register.tsx', line: "[/^BASELINE(?::|\\s+\\u2014)\\s+/, 'Baseline']" },
  { file: 'components/Register.tsx', line: 'const answer = /(?:\\.| \\u2014) THE ANSWER IS: NOT DISTINGUISHABLE FROM ZERO$/;' },
  { file: 'components/Register.tsx', line: ".replace(/ \\u2014 /g, ': ')" },
  { file: 'lib/mapper.ts', line: '\\\\s*[:\\u2014\\u2013-]`' },
  /* Merged on the rehearsal line: render-time matchers that turn any dash still
     arriving in a source title or sentence into plain punctuation. */
  { file: 'app/method/page.tsx', line: ".replace(/\\s*\\u2014\\s*((?:(?!\\.\\s)[^\\u2014]){1,90}?)\\s*\\u2014\\s*/g, ', $1, ')" },
  { file: 'app/method/page.tsx', line: ".replace(/\\s*\\u2014\\s*(?=(?:and|or|but|not|because|which|including|about)\\b)/g, ', ')" },
  { file: 'app/method/page.tsx', line: ".replace(/\\s*\\u2014\\s*/g, ': ');" },
  { file: 'app/method/page.tsx', line: "const plain = (s: string) => s.replace(/\\s*\\u2014\\s*/g, ', ');" },
  { file: 'components/FigureVisual.tsx', line: "t.replace(/ \\u2014 /g, sep);" },
  { file: 'components/FigureVisual.tsx', line: "t.replace(/ \\u2014 (\\w)/g," },
  { file: 'components/sheet/JourneyStrip.tsx', line: "label.split(/,\\s|\\s\\(|\\s\\u2014\\s/)" },
];

const withoutVerbatim = (s: string) => VERBATIM.reduce((t, v) => t.split(v.text).join(''), s);

const walk = (dir: string, keep: (f: string) => boolean): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' || n === 'test-fixtures' ? [] : walk(p, keep);
    return keep(p) ? [p] : [];
  });

function strings(o: unknown, path: string, out: { path: string; s: string }[]) {
  if (typeof o === 'string') out.push({ path, s: o });
  else if (Array.isArray(o)) o.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) strings(v, `${path}.${k}`, out);
  return out;
}

/** Comments out; code and copy stay. A `//` after a colon (a URL) is not a comment. */
function code(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat(m.split('\n').length - 1))
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n').map((l) => l.replace(/(^|[\s;{}(),])\/\/(?!\/).*$/, '$1')).join('\n');
}

describe('no em-dash in the data the app ships and publishes', () => {
  const files = [
    ...walk('data', (f) => f.endsWith('.json')),
    'public/data.json',
    ...walk('public/data', (f) => f.endsWith('.json')),
  ];
  it('found the files', () => {
    expect(files).toContain('data/prices.json');
    expect(files).toContain('public/data/price-table.json');
  });
  for (const f of files) {
    it(f, () => {
      const hits = strings(JSON.parse(readFileSync(f, 'utf8')), '', [])
        .filter(({ s }) => withoutVerbatim(s).includes(DASH))
        .map(({ path, s }) => `${path}: ${s.slice(Math.max(0, s.indexOf(DASH) - 50), s.indexOf(DASH) + 30)}`);
      expect(hits).toEqual([]);
    });
  }
  it('METHOD.md and GAPS.md, which /method renders word for word', () => {
    for (const f of ['data/METHOD.md', 'data/GAPS.md']) {
      const hits = withoutVerbatim(readFileSync(f, 'utf8')).split('\n').filter((l) => l.includes(DASH));
      expect(hits, f).toEqual([]);
    }
  });
  it('the published CSVs', () => {
    for (const f of walk('public/data', (p) => p.endsWith('.csv'))) {
      expect(withoutVerbatim(readFileSync(f, 'utf8')).includes(DASH), f).toBe(false);
    }
  });
});

describe('no em-dash in the copy the source files render', () => {
  const files = [
    ...walk('app', (f) => /\.(tsx?|css)$/.test(f)),
    ...walk('components', (f) => /\.(tsx?|css)$/.test(f)),
    ...walk('lib', (f) => /\.tsx?$/.test(f)),
    ...walk('cf/functions', (f) => f.endsWith('.js')),
    ...readdirSync('public').filter((n) => /\.(html|js|webmanifest)$/.test(n)).map((n) => `public/${n}`),
  ];
  it('found the files', () => expect(files.length).toBeGreaterThan(100));
  it('no literal em-dash, &mdash; or numeric entity outside comments', () => {
    const hits: string[] = [];
    for (const f of files) {
      code(readFileSync(f, 'utf8')).split('\n').forEach((l, i) => {
        if (/—|&mdash;|&#8212;|&#x2014;/i.test(withoutVerbatim(l))) hits.push(`${f}:${i + 1}: ${l.trim().slice(0, 140)}`);
      });
    }
    expect(hits).toEqual([]);
  });
  it('a written-out \\u2014 appears only in the listed matchers', () => {
    const hits: string[] = [];
    for (const f of files) {
      code(readFileSync(f, 'utf8')).split('\n').forEach((l, i) => {
        if (!/\\u2014|\\2014/.test(l)) return;
        if (MATCHERS.some((m) => m.file === f && l.includes(m.line))) return;
        hits.push(`${f}:${i + 1}: ${l.trim().slice(0, 140)}`);
      });
    }
    expect(hits).toEqual([]);
    for (const m of MATCHERS) expect(readFileSync(m.file, 'utf8'), `${m.file} lost a matcher`).toContain(m.line);
  });
});

describe('no em-dash in the rendered pages', () => {
  it('the demo ledger and its sheet', () => {
    const ledger = renderWith(Ledger, fakeStore(demoEntries()));
    const sheet = renderWith(Sheet, fakeStore(demoEntries()));
    expect(withoutVerbatim(ledger).includes(DASH)).toBe(false);
    expect(withoutVerbatim(sheet).includes(DASH)).toBe(false);
  });
  it(`the line drawer for every one of the ${TABLE.length} rows`, () => {
    const bad: string[] = [];
    for (const item of TABLE) {
      const html = renderToStaticMarkup(createElement(LineDrawer, { item, ctx: {}, onClose: () => {} }));
      const i = withoutVerbatim(html).indexOf(DASH);
      if (i >= 0) bad.push(`${item.id}: ${html.slice(Math.max(0, i - 60), i + 30)}`);
    }
    expect(bad).toEqual([]);
  });
  it('every verbatim quote is still in the data, word for word', () => {
    const conditions = readFileSync('data/conditions.json', 'utf8');
    for (const v of VERBATIM) expect(conditions, v.source).toContain(JSON.stringify(v.text).slice(1, -1));
  });
});

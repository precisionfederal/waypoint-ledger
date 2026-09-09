/* The product surfaces: the live preview's arithmetic, the share card's payload,
   the reveal's comparison, and the two promises the shipped assets have to keep —
   a link preview that exists, and type served from our own origin. */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
// tsconfig keeps jsx:"preserve" for Next, so vitest's esbuild compiles the JSX in
// components/ with the classic runtime and expects a global React. Next itself
// uses the automatic runtime; this line is only for the test process.
(globalThis as unknown as { React: typeof React }).React = React;
import { readFileSync, existsSync } from 'node:fs';
import { previewTotals, shareCardData } from '../components/JourneyBuilder';
import TotalReveal, { TotalComparison, relationTo } from '../components/TotalReveal';
import { parseJourney, type ParsedSegment } from '../lib/mapper';
import { priceJourney } from '../lib/pricing';
import { TABLE, SELECTABLE } from '../lib/table';
import type { JourneyEntry, PriceItem } from '../lib/types';

const item = (id: string): PriceItem => {
  const it = TABLE.find((i) => i.id === id);
  if (!it) throw new Error(`fixture row ${id} is not in the published table`);
  return it;
};
// A hand-built segment. The cast keeps the fixture honest about the two fields the
// preview actually reads (item, times) while the mapper is free to add its own.
const seg = (it: PriceItem | null, times: number, raw = 'x'): ParsedSegment =>
  ({ raw, times, result: { item: it, score: it ? 100 : 0, matchedOn: it ? it.label : null } as unknown as ParsedSegment['result'] });
const entry = (id: string | null, times = 1, raw = 'x'): JourneyEntry =>
  ({ key: `${id}-${times}-${raw}`, raw, item: id ? item(id) : null, times });

describe('previewTotals — the live preview prices exactly like the ledger', () => {
  it('multiplies each matched figure by the count in the phrase', () => {
    const a = item('cms-99214'), b = item('cms-img-echo');
    const r = previewTotals([seg(a, 3), seg(b, 1)]);
    expect(r.matched).toBe(2);
    expect(r.previewTotal).toBe((a.valueUsd ?? 0) * 3 + (b.valueUsd ?? 0));
  });

  it('counts an unmatched phrase, and prices it at nothing', () => {
    const a = item('cms-99214');
    const r = previewTotals([seg(a, 1), seg(null, 4, 'I was exhausted for two years')]);
    expect(r.matched).toBe(1);
    expect(r.previewTotal).toBe(a.valueUsd ?? 0);
  });

  it('is empty for an empty sentence', () => {
    expect(previewTotals([])).toEqual({ matched: 0, previewTotal: 0 });
  });

  it('recognises a real sentence before anything is clicked', () => {
    const segs = parseJourney('saw my regular doctor three times, then an echo', SELECTABLE);
    const r = previewTotals(segs);
    expect(segs.length).toBeGreaterThan(1);
    expect(r.matched).toBeGreaterThan(0);
    // whatever the matcher chose, the total is the published figures times the counts
    const expected = segs.reduce((a, s) => a + (s.result.item ? (s.result.item.valueUsd ?? 0) * s.times : 0), 0);
    expect(r.previewTotal).toBe(expected);
  });
});

describe('shareCardData — the card carries only units, counts and published figures', () => {
  const lines = priceJourney([entry('cms-99214', 3), entry('cms-img-echo', 1), entry(null, 2, 'a test nobody could name')]);
  const d = shareCardData(lines, 3, 1);

  it('totals the priced lines and counts the appointments', () => {
    expect(d.totalUsd).toBe((item('cms-99214').valueUsd ?? 0) * 3 + (item('cms-img-echo').valueUsd ?? 0));
    expect(d.stepCount).toBe(6);
    expect(d.distinctCount).toBe(3);
    expect(d.pricedCount).toBe(2);
  });

  it('counts blanks — the unpriced line and the named-but-unpriceable one', () => {
    expect(d.blankCount).toBe(2);
  });

  it('carries category bars, largest first, and never a free-text field', () => {
    expect(d.bars.length).toBeGreaterThan(0);
    expect(d.bars.map((b) => b.total)).toEqual([...d.bars.map((b) => b.total)].sort((a, b) => b - a));
    expect(JSON.stringify(d)).not.toContain('a test nobody could name');
  });

  it('carries the odyssey as clauses that are already counts, never a sentence about the reader', () => {
    /* This fixture has no months and no refused care, so the only clause the
       card may carry is the appointment count. A clause is a count or it is
       not written; nothing here is typed text. */
    expect(d.story).toEqual(['6 appointments', '2 steps no federal file prices']);
    expect(JSON.stringify(d.story)).not.toContain('a test nobody could name');
  });

  it('carries one published, currently-true comparison line, or none', () => {
    /* lib/site-of-service returns null unless both rows are present and both
       carry the current fee-schedule year, so a stale ratio can never leave
       the site on a picture. */
    if (d.footnote !== null) {
      expect(d.footnote).toMatch(/CY20\d\d/);
      expect(d.footnote).toMatch(/hospital clinic/);
    }
  });
});

describe('relationTo — the comparison never claims the wrong direction', () => {
  it('is larger when the whole interval sits above the total', () => {
    expect(relationTo(900, 1619, 6578)).toBe('larger than');
  });
  it('is smaller when the whole interval sits below the total', () => {
    expect(relationTo(9000, 1619, 6578)).toBe('smaller than');
  });
  it('overlaps when the total falls inside the interval', () => {
    expect(relationTo(3011, 1619, 6578)).toBe('overlaps');
  });
});

describe('shipped assets — the link preview and the type', () => {
  it('/og.png exists and is exactly 1200x630', () => {
    const buf = readFileSync('public/og.png');
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(buf.readUInt32BE(16)).toBe(1200);
    expect(buf.readUInt32BE(20)).toBe(630);
  });

  it('the layout asks for that image as a large summary card', () => {
    const layout = readFileSync('app/layout.tsx', 'utf8');
    expect(layout).toContain("summary_large_image");
    expect(layout).toContain('/og.png');
  });

  it('no page requests a font from a third party', () => {
    const layout = readFileSync('app/layout.tsx', 'utf8');
    expect(layout).not.toContain('fonts.googleapis.com');
    expect(layout).not.toContain('fonts.gstatic.com');
    const css = readFileSync('app/fonts.css', 'utf8');
    expect(css).not.toContain('https://');
  });

  it('every @font-face points at a file that is actually in public/fonts', () => {
    const css = readFileSync('app/fonts.css', 'utf8');
    const urls = [...css.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThanOrEqual(6);
    for (const u of urls) expect(existsSync(`public${u}`), `${u} is missing`).toBe(true);
  });
});

describe('TotalReveal — what the reveal actually renders', () => {
  // Rendered to static markup: no browser, so this is the honest first paint —
  // the number is right there even before the count-up runs, and with reduced
  // motion that is all a person ever sees.
  const render = async (props: Parameters<typeof TotalReveal>[0]) => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    return renderToStaticMarkup(createElement(TotalReveal, props));
  };
  const YEAR = { point: 4098, low: 1619, high: 6578, year: 2022 };

  it('leads with the human label and the total, and demotes the version string', async () => {
    const html = await render({ totalUsd: 3011, pricedCount: 9, tableVersion: '2026-09-08.1-verified' });
    expect(html).toContain('What the published prices add up to');
    expect(html).toContain('$3,011');
    expect(html).toContain('how this is versioned');
    expect(html).toContain('2026-09-08.1-verified');
    expect(html).not.toContain('Itemized total, all payers combined');
  });

  it('states the comparison in the direction the two figures actually sit', async () => {
    const small = await render({ totalUsd: 900, pricedCount: 3, tableVersion: 'v', yearAhead: YEAR });
    expect(small).toContain('$1,619 to $6,578');
    expect(small).toContain('larger than');
    expect(small).toContain('never added');
    const big = await render({ totalUsd: 9000, pricedCount: 30, tableVersion: 'v', yearAhead: YEAR });
    expect(big).toContain('smaller than');
    const mid = await render({ totalUsd: 3011, pricedCount: 9, tableVersion: 'v', yearAhead: YEAR });
    expect(mid).toContain('overlaps');
  });

  it('says nothing about the year ahead when no published row was passed', async () => {
    const html = await render({ totalUsd: 3011, pricedCount: 9, tableVersion: 'v' });
    expect(html).not.toContain('excess');
    expect(html).not.toContain('year ahead');
  });
});

describe('copy — the product never asserts what a person paid', () => {
  // Asking someone to "say what you paid" is the correction flow and is fine.
  // Printing "you paid $28" at them is a claim about their life the tool cannot
  // make. These patterns catch the assertion, not the question.
  const ASSERTIONS = [/you paid \$/i, /you paid \{/i, /is what you paid/i, /what you paid \$/i];
  const files = [
    'components/JourneyBuilder.tsx', 'components/TotalReveal.tsx', 'components/ShareCard.tsx',
    'components/GapPanel.tsx', 'app/page.tsx',
  ];
  for (const f of files) {
    it(`${f} never prints a figure as something the reader paid`, () => {
      const src = readFileSync(f, 'utf8');
      for (const re of ASSERTIONS) expect(src, `${f} matches ${re}`).not.toMatch(re);
    });
  }

  it('the reveal is labelled in a human sentence, not an accounting header', () => {
    const src = readFileSync('components/TotalReveal.tsx', 'utf8');
    expect(src).toContain("label = 'What the published prices add up to'");
  });
});

/* ==========================================================================
   R4 · results #1 — THE DEFAULT VISITOR.

   A person who answers none of the three fit questions and only types their
   sentence is the most likely judge and the most likely patient. Round 4 found
   they got the weakest product we ship: "Prefer not to say" rendered
   pre-selected, so nothing was ever "chosen", so the year-ahead card returned
   null and the largest published figure in the product — the $1,619 to $6,578
   MEPS interval — was nowhere on the page.

   These tests hold the fix in place: nothing is pre-selected, no path renders a
   blank where a published figure exists, and no figure on the invitation is
   ever attributed to the person reading it.
   ========================================================================== */
describe('the year-ahead card for a visitor who chose nothing', () => {
  const render = async (el: React.ReactElement) => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    return renderToStaticMarkup(el);
  };
  const invite = async (implied: string | null, declined = false) => {
    const { YearAheadInvitation } = await import('../components/ConditionPicker');
    return render(React.createElement(YearAheadInvitation, { implied, declined }));
  };

  it('offers the published interval instead of a blank when nothing is implied', async () => {
    const html = await invite(null);
    expect(html).toContain('$1,619 to $6,578');
    expect(html).toContain('Point estimate $4,098');
    expect(html).toContain('pick your condition to narrow this');
    expect(html).toContain('Shown apart, never added to the total above');
  });

  it('lists the other published figures rather than averaging them into one span', async () => {
    const html = await invite(null);
    expect(html).toContain('$4,900');   // treated heart disease, MEPS SB#562
    expect(html).toContain('$5,810');   // treated diabetes, MEPS SB#568
    expect(html).toContain('listed and never');
    // the two-bases error: an excess low end and a gross high end are never one range
    expect(html).not.toContain('$1,619 to $5,810');
    expect(html).not.toMatch(/average of|averaged across/i);
  });

  it('never tells the reader the figure is theirs', async () => {
    for (const html of [await invite(null), await invite('long-covid'), await invite('fibromyalgia')]) {
      expect(html).toMatch(/if you are looking into|pick your condition/i);
      expect(html).not.toMatch(/you have|your long COVID|what you paid|you spent/i);
    }
  });

  it('answers with the implied condition when the person already typed it', async () => {
    const html = await invite('long-covid');
    expect(html).toContain('if you are looking into long COVID');
    expect(html).toContain('$1,619 to $6,578');
    expect(html).toContain('Who this describes:');
  });

  it('shows the absence, with the way to count it, for a condition with no figure', async () => {
    const html = await invite('fibromyalgia');
    expect(html).toContain('No published figure');
    expect(html).toContain('Count this gap');
    expect(html).not.toMatch(/\$\d/);   // never a substitute number
  });

  it('respects a person who declined, and still shows them something', async () => {
    const html = await invite(null, true);
    expect(html).toContain('You chose not to say');
    expect(html).not.toMatch(/Nothing is chosen yet/);
    expect(html).toContain('$1,619 to $6,578');
  });
});

describe('what the person already typed', () => {
  const implied = async (text: string | null) => {
    const { impliedConditionId } = await import('../components/ConditionPicker');
    return impliedConditionId(text);
  };

  it('reads the condition out of their own words', async () => {
    expect(await implied('four years of appointments after long COVID')).toBe('long-covid');
    expect(await implied('my fibromyalgia flared')).toBe('fibromyalgia');
    expect(await implied('endometriosis surgery')).toBe('endometriosis');
  });

  it('reads a published synonym the file already carries', async () => {
    expect(await implied('PASC clinic referral')).toBe('long-covid');
    expect(await implied('chronic fatigue syndrome workup')).toBe('me-cfs');
  });

  it('says nothing when the words name nothing', async () => {
    expect(await implied('three MRIs and an echocardiogram')).toBeNull();
    expect(await implied('')).toBeNull();
    expect(await implied(null)).toBeNull();
  });

  it('never matches a fragment inside a longer word', async () => {
    // "endo" is a real synonym; it must not fire inside "endoscopy"
    expect(await implied('upper endoscopy')).toBeNull();
  });

  it('takes the first condition named, not the last', async () => {
    expect(await implied('long COVID, then they said fibromyalgia')).toBe('long-covid');
  });
});

describe('the money screen defers the survey methods instead of printing them', () => {
  it('names the subject in a phrase and links to the card that carries it in full', () => {
    const y = {
      point: 4098, low: 1619, high: 6578, year: 2022,
      population: 'U.S. civilian noninstitutionalized adults 18 and older; 17,119 survey respondents standing for about 254 million adults, of whom 1,196 reported long COVID',
      source: '2022 Medical Expenditure Panel Survey',
    };
    const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
    const html = renderToStaticMarkup(
      React.createElement(TotalComparison, { totalUsd: 2049, yearAhead: y }),
    );
    expect(html).toContain('an adult reporting long COVID');
    expect(html).not.toContain('17,119');
    expect(html).toContain('#year-ahead-who');
    expect(html).toContain('$1,619 to $6,578');
  });

  it('keeps a short population inline, because there is nothing to defer', () => {
    const y = { point: 4098, low: 1619, high: 6578, year: 2022, population: 'adults 18 and older' };
    const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
    const html = renderToStaticMarkup(
      React.createElement(TotalComparison, { totalUsd: 2049, yearAhead: y }),
    );
    expect(html).toContain('For adults 18 and older');
    expect(html).not.toContain('#year-ahead-who');
  });

  /* The standing subject in TotalReveal names long COVID. That is only honest
     while long COVID is the ONLY condition carrying an `excess` figure — the
     one kind the ledger ever feeds into this band. If a second one is added,
     this test fails and the subject has to come from the row. */
  it('is guarded: exactly one condition carries an excess figure, and it is long COVID', () => {
    const raw = JSON.parse(readFileSync('data/conditions.json', 'utf8')) as
      { conditions: { id: string; figure_kind?: string | null }[] };
    const excess = raw.conditions.filter((c) => c.figure_kind === 'excess');
    expect(excess.map((c) => c.id)).toEqual(['long-covid']);
  });
});

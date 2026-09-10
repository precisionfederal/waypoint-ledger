/* UX-3 · the source drawer.

   Bo, 2026-09-09, on this drawer in dark mode: "This part right here is so hard
   to read … hard to parse. Feels flat. Feels terrible UI."

   The rebuild reorders and retypes the drawer. It removes nothing. That second
   half is the part a later edit can quietly break, so it is pinned here against
   a capture of the drawer as it stood BEFORE the rebuild:
   tests/fixtures/drawer-before.txt is the innerText of the Complete blood count
   drawer, taken from a real browser on the built site at 1280×800.

   The rule this file enforces: every FACT in that capture is still in the
   rendered drawer. A fact is a sentence, or a fragment of one either side of an
   em dash or a middot, because the rebuild regroups facts into label/value
   pairs and a sentence that used to run "$37.12 — average charge submitted …"
   is now two cells. Section HEADINGS are exempt and listed one by one, because
   the order that commissioned this rebuild renamed them on purpose. A URL that
   used to be printed in parentheses must still be in the markup as an href.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LineDrawer, {
  LEAD_WORD_CAP, VERDICT_LABEL, figureSpans, loincLink, paragraphize, shortHash, splitSentences, splitWhy,
} from '../components/LineDrawer';
import { TABLE } from '../lib/table';

const cbc = TABLE.find((i) => i.id === 'cms-lab-cbc');
if (!cbc) throw new Error('the fixture row cms-lab-cbc is not in the published table');

/* The app is built by Next with the automatic JSX runtime; this suite runs on the
   plain vite transform, which emits React.createElement against a global. Next's
   own build is unaffected — this line exists only so the component can be rendered
   inside a unit test. */
(globalThis as unknown as { React: typeof React }).React = React;

const html = renderToStaticMarkup(createElement(LineDrawer, { item: cbc, ctx: {}, onClose: () => {} }));

const decode = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&#x2F;/g, '/');
/** What a person would read off the rendered drawer, whitespace collapsed. */
const text = decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const lower = text.toLowerCase();

const before = readFileSync('tests/fixtures/drawer-before.txt', 'utf8');

/* Headings the rebuild renamed. Each one is asserted both ways: the old wording
   is gone, and the block it named is still there under its new name. */
const RENAMED: [string, string][] = [
  ['The other published measure of this same service', 'The other published measure'],
  ['Where the CY2024 figures come from', 'Where it comes from'],
];

/** The URL, and the sentence with the URL taken out of it. */
const stripUrls = (s: string) => ({
  urls: [...s.matchAll(/https?:\/\/[^\s)]+/g)].map((m) => m[0]),
  rest: s.replace(/\(\s*https?:\/\/[^)]*\)/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim(),
});

/** Every fact the old drawer printed, one per entry. */
function factsOf(capture: string): string[] {
  const out: string[] = [];
  for (const line of capture.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    if (RENAMED.some(([old]) => l === old)) continue;
    for (const sentence of splitSentences(l)) {
      for (const frag of sentence.split(/\s+—\s+|\s+·\s+/)) {
        const f = frag.replace(/^[\s—·]+|[\s.,;:]+$/g, '').trim();
        if (f.length > 1) out.push(f);
      }
    }
  }
  return out;
}

describe('UX-3 — the rebuild removed nothing', () => {
  const facts = factsOf(before);

  it('the capture it is measured against is the real drawer, not a stub', () => {
    expect(before).toContain('Complete blood count');
    expect(before).toContain('$7.77');
    expect(facts.length).toBeGreaterThan(30);
  });

  it('every fact the old drawer printed is still rendered', () => {
    const missing: string[] = [];
    for (const fact of facts) {
      const { urls, rest } = stripUrls(fact);
      for (const u of urls) if (!html.includes(u)) missing.push(`url ${u}`);
      if (rest.length > 1 && !lower.includes(rest.toLowerCase())) missing.push(rest);
    }
    expect(missing, `dropped by the rebuild:\n${missing.join('\n')}`).toEqual([]);
  });

  it('the renamed headings are renamed, not duplicated', () => {
    for (const [old, now] of RENAMED) {
      expect(text, `old heading survived: ${old}`).not.toContain(old);
      expect(lower).toContain(now.toLowerCase());
    }
  });

  it('the coverage statement is word for word, only regrouped', () => {
    /* The whole 250-word statement, whitespace-collapsed, must be reconstructible
       from the paragraphs the drawer renders. */
    const whole = cbc.coverage.replace(/\s+/g, ' ').trim();
    for (const s of splitSentences(whole)) expect(lower).toContain(s.toLowerCase());
  });
});

describe('UX-3 — the seven blocks, in order', () => {
  const order = [
    ['1 header', 'Complete blood count'],
    ['2 figure', 'fig-num'],
    ['3 open the source', 'Open the source and check this number'],
    ['4 what it is', 'What it is'],
    ['5 where it comes from', 'Where it comes from'],
    ['6 who it describes', 'Who this number does and does not describe'],
    ['7 the other measure', 'The other published measure'],
  ] as const;

  it('every block is present', () => {
    for (const [name, needle] of order) expect(html.includes(needle), `missing block: ${name}`).toBe(true);
  });

  it('they arrive top to bottom in the order a person asks the questions', () => {
    const at = order.map(([name, needle]) => [name, html.indexOf(needle)] as const);
    for (let i = 1; i < at.length; i++) {
      expect(at[i][1], `${at[i][0]} must come after ${at[i - 1][0]}`).toBeGreaterThan(at[i - 1][1]);
    }
  });

  it('the block names are eyebrows, never h3 prose', () => {
    expect(html).not.toContain('<h3');
    expect(html).toContain('<h2');
  });

  it('the figure carries the verdict as a pill beside it, in the reader\'s words', () => {
    expect(text).toContain('REFERENCE PRICE');
    expect(VERDICT_LABEL['NOT DESCRIBED']).toBe('DOES NOT DESCRIBE YOU');
    /* the database word never reaches the face of the card */
    expect(text).not.toContain('NOT DESCRIBED');
  });

  it('the one primary button is the one that opens the source', () => {
    expect(html).toContain('class="btn primary full"');
    expect((html.match(/btn primary/g) ?? []).length).toBe(1);
  });

  it('the hash is a chip of twelve characters with the whole of it still in the DOM', () => {
    const sha = 'c26956788333d03c0080017121c19e8e4d9990e9fa8ff385d7e1a2849c45074a';
    expect(html).toContain(shortHash(sha));
    expect(shortHash(sha)).toHaveLength(12);
    expect(html).toContain(`title="${sha}"`);          // hover
    expect(html).toContain(`<span class="sr-only">${sha}</span>`); // screen reader
    expect(html).toContain('Copy');
  });

  it('the NLM confirmation is a link, not a URL printed in parentheses', () => {
    expect(html).toContain('href="https://clinicaltables.nlm.nih.gov/apidoc/loinc_items/v3/doc.html"');
    expect(text).not.toContain('(https://clinicaltables');
  });
});

describe('UX-3 — the pure parts of the rebuild', () => {
  it('splits the verdict so one sentence sits beside the figure', () => {
    const w = splitWhy('This is what Medicare allows for this service. Say what coverage you have and this line will tell you whether that describes you.');
    expect(w.lead).toBe('This is what Medicare allows for this service.');
    expect(w.rest).toMatch(/^Say what coverage/);
    expect(w.lead.split(' ').length).toBeLessThanOrEqual(LEAD_WORD_CAP);
  });

  it('caps a long first sentence at thirty words and moves the tail, never drops it', () => {
    const long = `${Array.from({ length: 44 }, (_, i) => `w${i}`).join(' ')}. And a second sentence.`;
    const w = splitWhy(long);
    expect(w.lead.split(' ').length).toBe(LEAD_WORD_CAP);   // the ellipsis rides the 30th word
    expect(w.lead.endsWith('…')).toBe(true);
    expect(w.rest.split(' ')[0]).toBe('w30');               // the 31st word starts the tail
    expect(w.rest).toContain('w43');                        // and nothing after it was dropped
    expect(w.rest).toContain('And a second sentence.');
  });

  it('regroups the coverage wall into three to five paragraphs', () => {
    const paras = paragraphize(cbc.coverage.replace(/\s+/g, ' ').trim());
    expect(paras.length).toBeGreaterThanOrEqual(3);
    expect(paras.length).toBeLessThanOrEqual(5);
    expect(paras.join(' ')).toBe(splitSentences(cbc.coverage).join(' '));
  });

  it('bolds the figures inside the prose and nothing else', () => {
    const spans = figureSpans('That $0 is MEDICARE-ONLY. The charge was $37.12 — 4.8 times this rate.');
    expect(spans.filter((s) => s.b).map((s) => s.t)).toEqual(['$0', '$37.12', '4.8 times']);
    expect(spans.map((s) => s.t).join('')).toBe('That $0 is MEDICARE-ONLY. The charge was $37.12 — 4.8 times this rate.');
  });

  it('pulls the URL out of the LOINC provenance string', () => {
    const l = loincLink('NLM Clinical Table Search Service, LOINC table (https://clinicaltables.nlm.nih.gov/x)');
    expect(l.text).toBe('NLM Clinical Table Search Service, LOINC table');
    expect(l.url).toBe('https://clinicaltables.nlm.nih.gov/x');
    expect(loincLink('A source with no link').url).toBeNull();
  });
});

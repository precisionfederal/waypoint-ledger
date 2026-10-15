/* Judge panel 15 Oct #2.8 (B-9): "1 line is a describes you"; two journey stops read
   only "No federal figure"; the 1440 px strip broke "Echocardiogra m". */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stopWords, tallyPhrase } from '../components/sheet/sheet-who';
import { saidQuote } from '../lib/said-quote';
import Sheet from '../app/sheet/page';
import { demoEntries, fakeStore, renderWith } from './helpers/ledger-render';

describe('B-9: the sheet says each verdict as a sentence', () => {
  it.each([
    ['DESCRIBES YOU', 1, 'you', '1 line describes you'],
    ['DESCRIBES YOU', 3, 'your father', '3 lines describe your father'],
    ['REFERENCE PRICE', 9, 'you', '9 lines are a reference price'],
    ['REFERENCE PRICE', 1, 'you', '1 line is a reference price'],
    ['BILLED AGAINST THIS', 2, 'you', '2 lines are what an uninsured person is billed against'],
    ['NOT DESCRIBED', 1, 'the child', '1 line does not describe the child'],
  ])('%s × %i', (v, n, who, want) => expect(tallyPhrase(v, n, who)).toBe(want));
  it('never prints "is a describes"', () => {
    for (const n of [1, 2]) for (const v of ['DESCRIBES YOU', 'NOT DESCRIBED', 'BILLED AGAINST THIS']) expect(tallyPhrase(v, n, 'you')).not.toMatch(/\b(is|are) an? (describes|not described|billed)/i);
  });
});

describe('B-9: an unpriced stop carries her own words', () => {
  it('quoted, without the joining word she started it with, and hidden when she hid her words', () => {
    expect(stopWords(saidQuote('and shocked the nerves'), false, 'No federal figure')).toBe('“shocked the nerves”');
    expect(stopWords(saidQuote('and shocked the nerves'), true, 'No federal figure')).toBe('No federal figure');
    expect(stopWords('', false, 'No federal figure')).toBe('No federal figure');
    const long = stopWords('they kept sending me to different people who never talked to each other', false, 'x');
    expect(long.length).toBeLessThanOrEqual(43);
    expect(long).toMatch(/…”$/);
  });
  it('the sheet strip prints the words for the demo journey', () => {
    const html = renderWith(Sheet, fakeStore(demoEntries()));
    const strip = html.slice(html.indexOf('sj-stops'), html.indexOf('</ol>', html.indexOf('sj-stops')));
    expect(strip).toContain('<span class="sj-label">“shocked the nerves”</span>');
    expect(strip).not.toContain('No federal figure');
  });
  it('node labels never split mid-word', () => {
    const css = readFileSync('app/sheet/sheet.css', 'utf8');
    const rule = css.match(/\.sj-label\{[^}]*\}/)![0];
    expect(rule).toContain('hyphens:manual');
    expect(rule).toContain('overflow-wrap:normal');
    expect(rule).not.toContain('hyphens:auto');
  });
});

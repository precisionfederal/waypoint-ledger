/* THE FRONT PAGE BELONGS TO THE PERSON.
 *
 * The UX-1 adversary scored the live build 3/5, LOSE, and named three things on
 * home: the loudest control took a first-time visitor away from their own box
 * into a canned ledger; our worked example sat inside the same white card as
 * their empty textarea, so a stranger read our three rows as their result; and
 * `$0` was the largest type on the second screen, which reads as a valuation of
 * the person rather than an indictment of the data.
 *
 * These are source assertions, not geometry: where the fold falls is measured
 * on a real browser (see ../winloop/UX-2/home.md and the screenshots beside it).
 * What a unit test can hold is that the words and the hierarchy do not drift
 * back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../app/product.css', import.meta.url), 'utf8');

describe('the hero puts the person’s own action in the primary slot', () => {
  it('offers the example as a ghost, never as the loudest pill', () => {
    expect(PAGE).toContain('<button className="btn ghost" type="button"');
    expect(PAGE).toMatch(/btn ghost[\s\S]{0,220}See it done with an example/);
    // the old primary is gone: no teal pill leads away from an empty box
    expect(PAGE).not.toContain('Open the full example');
  });

  it('answers an empty box with a prompt that puts the cursor in it', () => {
    expect(PAGE).toMatch(/btn primary[^>]*onClick=\{\(\) => ref\.current\?\.focus\(\)\}>Start with one sentence/);
  });

  it('hands the same box, once it has text, to the add action the typed state uses', () => {
    expect(PAGE).toMatch(/story\.trim\(\) \? \([\s\S]{0,240}onClick=\{add\}/);
  });
});

describe('the sample is never mistaken for the person’s own answer', () => {
  it('wraps the label, the rows and their total in one tinted inset', () => {
    expect(PAGE).toMatch(/<div className="hl-sample">[\s\S]*?hl-eg-lbl[\s\S]*?<ul className="hl-eg">[\s\S]*?hl-total[\s\S]*?<\/div>/);
  });

  it('labels it as an example and not as their numbers', () => {
    expect(PAGE).toContain('Not your numbers yet &mdash; an example, priced from the table as this page loads');
  });

  it('tints the inset with the ground token, so it reads as inset and not as a new brand', () => {
    expect(CSS).toMatch(/\.hl-sample\{background:var\(--ground-2\);border-radius:var\(--r-sm\);padding:var\(--sp-3\)/);
  });

  it('keeps the ghost readable inside the white card, where the hero band would paint it white on white', () => {
    expect(CSS).toMatch(/\.hl-card \.btn\.ghost\{background:var\(--surface\);color:var\(--ink\)/);
  });
});

describe('the zero band keeps the fact and drops the headline numeral', () => {
  it('no longer sets $0 in the largest type on the page', () => {
    expect(PAGE).not.toContain('zero-num');
  });

  it('leads with the sentence, which says what the data does, not what a person is worth', () => {
    expect(PAGE).toContain('Every visit you needed and could not get produces no row in any federal file. Not $0 &mdash; no row at all.');
  });
});

describe('the running total stays on screen however long the sentence is', () => {
  it('caps the hero chip list and scrolls it inside the card', () => {
    expect(CSS).toMatch(/\.hero-live \.lp-chips\{max-height:18rem;overflow-y:auto/);
  });

  it('shows a scrollbar only when there is something to scroll', () => {
    expect(CSS).toMatch(/\.hero-live \.lp-chips\{[^}]*scrollbar-width:thin/);
  });
});

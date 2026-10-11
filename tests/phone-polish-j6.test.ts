/* JUDGE-6 #10, phone polish.
   1. "· Change" stood alone on its own line with a leading dot (/journey at
      320, 375 and 390; /ledger at 320): the fit line is now one run of text,
      the dot glued to the word before it.
   2. The ledger quoted "GI doctor finally did an", the remainder the reader
      priced as the specialist visit in "A GI doctor finally did an endoscopy".
      A quote that stops on a joining word ends on the last word with meaning
      and an ellipsis. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseJourney } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';
import { saidQuote } from '../lib/said-quote';

const STORY = "My daughter is 14. She started getting stomach pains when she was 9 and we took her to the pediatrician probably six times, they said it was anxiety. Then the ER twice when it got really bad, they did a CT scan once. A GI doctor finally did an endoscopy and a colonoscopy and it was Crohn's. All in all it took about four years.";

describe('JUDGE-6 #10: a quote ends on a word', () => {
  it('cuts the specialist visit\'s remainder on a word, with an ellipsis', () => {
    expect(saidQuote('GI doctor finally did an')).toBe('GI doctor finally…');
  });
  it('every line of the daughter story is quoted on a word', () => {
    const quotes = parseJourney(STORY, SELECTABLE).map((s) => saidQuote(s.raw));
    /* Merge round 6: FLOW6's JUDGE-6 #10 (36e362e603) now stores the visit's
       words cut clean at the source, "GI doctor", so the quote is those words
       whole; saidQuote still cuts any line that reaches it ending on a joining word. */
    expect(quotes).toContain('GI doctor');
    expect(quotes).not.toContain('GI doctor finally…');
    for (const q of quotes) expect(q).not.toMatch(/\s(?:a|an|the|of|to|with|and|did)$/i);
  });
  it('leaves whole lines alone', () => {
    for (const raw of ['A GI doctor finally did an endoscopy', 'a colonoscopy', 'they did a CT scan once.', 'we took her to the pediatrician probably six times', 'saw my doctor', 'an MRI']) {
      expect(saidQuote(raw)).toBe(raw);
    }
  });
  it('never empties a line', () => {
    expect(saidQuote('the')).toBe('the');
    expect(saidQuote('  ')).toBe('');
  });
  it('the ledger, What you paid and /journey quote through it; the stored words are unchanged', () => {
    const ledger = readFileSync(new URL('../components/Ledger.tsx', import.meta.url), 'utf8');
    expect(ledger).toContain('you said “{saidQuote(l.entry.raw)}”');
    const paid = readFileSync(new URL('../components/PaidView.tsx', import.meta.url), 'utf8');
    expect(paid).toContain('you said “${saidQuote(e.raw)}”');
    const builder = readFileSync(new URL('../components/JourneyBuilder.tsx', import.meta.url), 'utf8');
    expect(builder).toContain('<p className="j-raw">{saidQuote(en.raw)}</p>');
  });
});

describe('JUDGE-6 #10: "Change" never starts a line with a dot', () => {
  const css = readFileSync(new URL('../components/ContextBar.module.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('JUDGE-6 #10'));
  it('the line is inline text, not two wrapping blocks', () => {
    expect(block).toContain('.fitLine{display:block}');
  });
  it('the dot is glued to the word before it by a no-break space, and silent', () => {
    expect(block).toContain('.fitLine > .fitTxt:has(+ .fitChange)::after{content:"\\a0\\b7\\20";');
    expect(block).toContain('.fitLine > .fitTxt:has(+ .fitChange)::after{content:"\\a0\\b7\\20" / ""}');
  });
  it('Change carries no dot of its own', () => {
    expect(block).toContain('.fitLine > .fitChange::before{content:none}');
  });
});

/* JUDGE-3 #11: /policy copy slips.
   1. The note under "The other 55" said "for this condition": the brief prints the
      file's one-condition sentence once under a list, so it names how many.
   2. On a phone the MEPS citation left a bare "[" at a line end: each link there
      was an inline-flex tap target, an atomic box a line may break before. The
      citation links now stay inline, with padding for the hit area, so "[" and
      "]" stay with the words beside them (measured in Chromium and WebKit at
      390, 375, 360 and 320: 3 bare brackets before, 0 after). */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { NO_FIGURE_QUALIFIER, noFigureQualifierFor, conditionRows } from '../lib/policy';
import PolicyBrief from '../components/PolicyBrief';

describe('JUDGE-3 #11: the no-figure note names how many', () => {
  it('the file sentence is about one condition, and the brief variant is plural', () => {
    expect(NO_FIGURE_QUALIFIER).toMatch(/for this condition/);
    expect(noFigureQualifierFor(55)).toMatch(/^We have not found a published federal annual figure for these 55 conditions\./);
    expect(noFigureQualifierFor(55)).not.toMatch(/this condition/);
    expect(noFigureQualifierFor(1)).toMatch(/for this one condition\./);
    expect(noFigureQualifierFor(0)).toBe('');
    /* nothing else in the sentence moves */
    expect(noFigureQualifierFor(55).replace('these 55 conditions', 'this condition')).toBe(NO_FIGURE_QUALIFIER);
  });
});

describe('JUDGE-3 #11: the rendered brief', () => {
  const html = renderToStaticMarkup(createElement(PolicyBrief));
  const text = html.replace(/<[^>]+>/g, '');
  it('prints the plural note with the count the fold heading uses', () => {
    const m = text.match(/The other (\d+): no federal burden figure yet/);
    expect(m).not.toBeNull();
    expect(text).toContain(`for these ${m![1]} conditions`);
    expect(text).not.toMatch(/annual figure for this condition/);
    expect(conditionRows().length).toBeGreaterThan(Number(m![1]));
  });
  it('every citation is one inline run: "[" before its first link, "]" after its last', () => {
    const refs = html.match(/<span class="policy-refs">[\s\S]*?\]<\/span>/g) || [];
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect(r).toMatch(/^<span class="policy-refs">\[/);
  });
});

describe('JUDGE-3 #11: phone citation links are inline, not atomic boxes', () => {
  it('the 640 px rule puts .policy-refs a back inline after the inline-flex tap-target rule', () => {
    const css = readFileSync(new URL('../app/policy/policy.css', import.meta.url), 'utf8');
    const flex = css.indexOf('.policy-refs a,.policy-src a,.policy-chip,.policy-link,.policy a.btn{display:inline-flex');
    const inline = css.indexOf('.policy-refs a{display:inline;min-height:0;padding:.75rem 0}');
    expect(flex).toBeGreaterThan(0);
    expect(inline).toBeGreaterThan(flex);
  });
});

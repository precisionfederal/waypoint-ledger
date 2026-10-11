/* flow3-20: when a parent answers for a child, the drawer speaks about the child.
   The parent chose "A child I care for", and the coverage heading already says
   "the child"; the pill and the blank caption said "you". */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LineDrawer, { VERDICT_LABEL, blankCaption, verdictLabelFor } from '../components/LineDrawer';
import { TABLE } from '../lib/table';
import { LOCALITIES, fitOf, noFigureCopy } from '../lib/fit';
import { readFileSync } from 'node:fs';

(globalThis as unknown as { React: typeof React }).React = React;
const visit = TABLE.find((i) => i.id === 'cms-99213');
if (!visit) throw new Error('cms-99213 is not in the published table');
const textOf = (forChild: boolean) => renderToStaticMarkup(createElement(LineDrawer, { item: visit, ctx: { coverage: 'medicaid' }, onClose: () => {}, forChild }))
  .replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ');

describe('flow3-20: the drawer says "the child" for a parent answering for a child', () => {
  it('the labels', () => {
    expect(verdictLabelFor('NOT DESCRIBED', true)).toBe('DOES NOT DESCRIBE THE CHILD');
    expect(verdictLabelFor('DESCRIBES YOU', true)).toBe('DESCRIBES THE CHILD');
    expect(verdictLabelFor('REFERENCE PRICE', true)).toBe('REFERENCE PRICE');
    for (const v of Object.keys(VERDICT_LABEL) as (keyof typeof VERDICT_LABEL)[]) expect(verdictLabelFor(v, false)).toBe(VERDICT_LABEL[v]);
    expect(blankCaption(true)).toBe('No published federal figure describes the child here');
    expect(blankCaption(false)).toBe('No published federal figure describes you here');
  });
  it('a child on Medicaid: the rendered drawer says the child, never "describe you"', () => {
    const t = textOf(true);
    expect(t).toContain('DOES NOT DESCRIBE THE CHILD');
    expect(t).toContain('No published federal figure describes the child here');
    expect(t).not.toContain('DOES NOT DESCRIBE YOU');
    expect(t).not.toContain('describes you here');
  });
  it('an adult on Medicaid reads it as before', () => {
    const t = textOf(false);
    expect(t).toContain('DOES NOT DESCRIBE YOU');
    expect(t).toContain('No published federal figure describes you here');
  });
});

/* The parent stays "you" only where the sentence is about the parent: she told us
   the place, keeps the ledger (its total), pays the bill, and is told things. */
const PARENT_YOU = [/you told us/g, /your total/g, /your bill/g, /will tell you/g, /\bif you\b/gi];
const strayYou = (t: string) => PARENT_YOU.reduce((s, re) => s.replace(re, ''), t).match(/\byou(r|rs)?\b/gi);

describe('flow3-20: every lib/fit.ts sentence about the person says "the child" for a parent', () => {
  it('the Medicaid sentence names the child', () => {
    const f = fitOf(visit, { coverage: 'medicaid' }, true);
    expect(f.why).toContain('what Medicaid pays for the child.');
    expect(f.figureNote).toBe('No published federal figure describes the child here');
    expect(f.reference?.floorLabel).toContain('not the child’s rate');
    expect(fitOf(visit, { coverage: 'medicaid' }).why).toContain('what Medicaid pays for you.');
  });
  it('no row, coverage or place leaves a "you" about the patient in a child\'s fit', () => {
    const covs = [undefined, 'employer', 'marketplace', 'medicaid', 'medicare', 'uninsured', 'unsure'] as const;
    const places = [undefined, LOCALITIES[0].key, LOCALITIES[LOCALITIES.length - 1].key];
    const bad: string[] = [];
    for (const item of TABLE) for (const coverage of covs) for (const locality of places) {
      const f = fitOf(item, { coverage, locality }, true);
      for (const t of [f.why, f.figureNote, f.reference?.floorLabel ?? '', f.reference?.ceilingLabel ?? '']) {
        const m = strayYou(t);
        if (m) bad.push(`${item.id} ${coverage ?? '-'} ${locality ?? '-'}: ${t}`);
      }
    }
    expect([...new Set(bad.map((b) => b.split(': ').slice(1).join(': ')))]).toEqual([]);
  });
  it('the no-figure copy says the child for a parent, and you otherwise', () => {
    for (const coverage of ['medicaid', 'uninsured', 'employer'] as const) {
      const c = noFigureCopy({ coverage }, 3, true);
      expect(strayYou(`${c.headline} ${c.body}`), coverage).toBeNull();
    }
    expect(noFigureCopy({ coverage: 'medicaid' }, 3).body).toContain('Neither one is your rate.');
    expect(noFigureCopy({ coverage: 'medicaid' }, 3, true).body).toContain('Neither one is the child’s rate.');
  });
  it('the drawer and the ledger ask for the child wording', () => {
    expect(textOf(true)).toContain('what Medicaid pays for the child.');
    const ledger = readFileSync(new URL('../components/Ledger.tsx', import.meta.url), 'utf8');
    expect(ledger).toContain('fitOf(e.item, ctx, forChild)');
    expect(ledger).toContain('noFigureCopy(ctx, itemLines, forChild)');
  });
});

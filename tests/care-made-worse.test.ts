/* FINAL-1011 (susan): from a written interview with a patient advocate living
   with ME/CFS (14 Sep 2026): care she was advised to have made her worse.
   "Care that made you worse" is its own counted, never-priced card. */
import { describe, it, expect } from 'vitest';
import gapData from '../data/invisible-events.json';

describe('Care that made you worse: counted, never priced, judges no treatment', () => {
  const cats = (gapData as { categories: Array<{ id: string; label: string; prompt: string; examples: string[]; whyInvisible: string; unit: string }> }).categories;
  const c = cats.find((x) => x.id === 'care-made-worse')!;

  it('is a category in the file, in the same shape as the others', () => {
    expect(c).toBeTruthy();
    expect(c.label).toBe('Care that made you worse');
    for (const k of ['label', 'prompt', 'whyInvisible', 'unit'] as const) expect(typeof c[k]).toBe('string');
    expect(c.examples).toContain('advised to exercise through it and got sicker');
    expect(c.examples).toContain('a treatment that set me back');
    expect(Object.keys(c).sort()).toEqual(Object.keys(cats[0]).sort());
  });

  it('is billed and still invisible, said modestly, and gives no medical advice', () => {
    expect(c.whyInvisible).toMatch(/billed/);
    expect(c.whyInvisible).toMatch(/only when a clinician records one/);
    expect(c.whyInvisible).toMatch(/does not judge any treatment/i);
    const all = `${c.label} ${c.prompt} ${c.examples.join(' ')} ${c.whyInvisible}`;
    expect(all).not.toMatch(/\$|\bshould\b|\bavoid\b|\bstop\b|\bdo not exercise\b|\bharmful\b|\bdangerous\b|\bexcess\b/i);
  });

  it('sits beside the other billed-and-invisible kinds and the README counts it', () => {
    const ids = cats.map((x) => x.id);
    expect(ids.indexOf('care-made-worse')).toBe(ids.indexOf('wrong-track') + 1);
    expect(ids).toHaveLength(7);
    expect((gapData as { _README: string })._README).toMatch(/Three of the seven are billed/);
  });

  it('a dismissal as "all in my head" is shown on the dismissed card', () => {
    const d = cats.find((x) => x.id === 'dismissed')!;
    expect(d.prompt).toMatch(/all in your head/);
    expect(d.examples.slice(0, 3)).toContain('told it was all in my head');
  });
});

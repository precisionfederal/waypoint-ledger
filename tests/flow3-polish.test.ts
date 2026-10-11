/* FLOW3 round-3 POLISH items. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = (p: string) => readFileSync(p, 'utf8');

describe('flow3-14 the drawer has two close controls with two names', () => {
  it('the X is "Close this line" and the bottom button stays "Close"', () => {
    const d = src('components/LineDrawer.tsx');
    expect(d).toContain('aria-label="Close this line"><Icon.X /></button>');
    expect(d).not.toContain('aria-label="Close"');
    expect(d).toContain('onClick={onClose}>Close</button>');
  });
});

describe('flow3-15 the phone\'s sticky "So far" foot spans the card', () => {
  const css = src('app/product.css');
  it('the card padding and the foot\'s reach are one variable', () => {
    expect(css).toContain('.hl-card{--hl-pad:clamp(1.25rem,2.4vw,1.75rem);');
    expect(css).toContain('padding:var(--hl-pad);color:var(--ink)}');
    expect(css).toContain('.hl-card{--hl-pad:1.1rem;padding:var(--hl-pad);');
  });
  it('the foot reaches out by that variable and is not held to the content width', () => {
    const rule = css.slice(css.indexOf('.hero-live .hl-foot:not(.is-empty){position:sticky'));
    const body = rule.slice(0, rule.indexOf('}'));
    expect(body).toContain('max-width:none');
    expect(body).toContain('margin:0 calc(-1 * var(--hl-pad,1.1rem)) calc(-1 * var(--hl-pad,1.1rem))');
    expect(body).toContain('padding:.65rem var(--hl-pad,1.1rem)');
  });
});

describe('flow3-16 the year disclosure says "year figure", like the rest of the ledger', () => {
  const l = src('components/Ledger.tsx');
  it('the fold, the declined heading and its sentence', () => {
    expect(l).toContain('<summary>The year figure, shown apart and never added</summary>');
    expect(l).toContain('The year figure: you chose not to say');
    expect(l).toContain('A year figure only means something when');
    expect(l).not.toMatch(/>The year ahead|A year-ahead figure only/);
  });
});

/* ==========================================================================
   THE DIALOG'S TWO RULES, WITHOUT A BROWSER.

   Round 2 measured the source drawer: Tab twice from inside it and focus was on
   the page footer; six of eight stops were outside the thing that was open.
   Both rules that fix it are pure, so they are held here; the platform parts
   (showModal, Esc, the backdrop, inert) are held in shots2/e2e-ops.mjs against
   a real browser, because a fake DOM would only prove our own opinion of them.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { FOCUSABLE_SELECTOR, focusableIn, nextStop } from '../components/Dialog';

const el = (attrs: Record<string, string> = {}) => ({
  attrs,
  hasAttribute: (n: string) => Object.prototype.hasOwnProperty.call(attrs, n),
  getAttribute: (n: string) => (Object.prototype.hasOwnProperty.call(attrs, n) ? attrs[n] : null),
});
const root = (list: ReturnType<typeof el>[]) => ({ querySelectorAll: () => list });

describe('what counts as a stop', () => {
  it('asks for the controls a person can actually reach', () => {
    for (const s of ['a[href]', 'button:not([disabled])', 'textarea:not([disabled])', 'summary', '[tabindex]:not([tabindex="-1"])']) {
      expect(FOCUSABLE_SELECTOR).toContain(s);
    }
    expect(FOCUSABLE_SELECTOR).not.toContain('[tabindex="-1"],');
  });

  it('drops a hidden or aria-hidden control, which no keyboard reaches', () => {
    const keep = el(); const hidden = el({ hidden: '' }); const aria = el({ 'aria-hidden': 'true' });
    expect(focusableIn(root([keep, hidden, aria]))).toEqual([keep]);
  });

  it('is empty for nothing at all, and never throws on a missing element', () => {
    expect(focusableIn(null)).toEqual([]);
    expect(focusableIn(root([]))).toEqual([]);
  });
});

describe('where Tab goes', () => {
  const stops = ['a', 'b', 'c'];
  it('cycles from the last stop back to the first', () => {
    expect(nextStop(stops, 'c', false)).toBe(0);
  });
  it('cycles backwards from the first stop to the last', () => {
    expect(nextStop(stops, 'a', true)).toBe(2);
  });
  it('leaves the browser alone in the middle', () => {
    expect(nextStop(stops, 'b', false)).toBeNull();
    expect(nextStop(stops, 'b', true)).toBeNull();
  });
  it('brings focus back inside when it has escaped', () => {
    expect(nextStop(stops, 'the page footer', false)).toBe(0);
    expect(nextStop(stops, 'the page footer', true)).toBe(2);
  });
  it('does nothing when the dialog holds no controls', () => {
    expect(nextStop([], 'anything', false)).toBeNull();
  });
});

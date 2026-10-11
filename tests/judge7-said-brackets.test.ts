/* JUDGE-7 #10 (2026-10-01): a quote keeps or drops brackets as a pair. */
import { describe, it, expect } from 'vitest';
import { saidQuote } from '../lib/said-quote';

describe('JUDGE-7 #10', () => {
  it('an unpaired bracket is left out of the quote', () => {
    expect(saidQuote('a ton of labs (ANA')).toBe('a ton of labs ANA');
    expect(saidQuote('sed rate).')).toBe('sed rate.');
  });
  it('a paired bracket is quoted whole', () => {
    expect(saidQuote('labs (ANA, CBC, sed rate)')).toBe('labs (ANA, CBC, sed rate)');
  });
  it('the dangling-word cut still works', () => {
    expect(saidQuote('GI doctor finally did an')).toBe('GI doctor finally…');
  });
});

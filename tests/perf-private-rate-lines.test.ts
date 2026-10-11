/* PERF (2026-10-01): the fit sentence's hospital count comes from
   data/private-rates-lines.json so the rates stay out of first load. This pins
   that count to the one privateRangeFor computes from the rates, for every line,
   and keeps lib/fit.ts from importing the rates again. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import CLIENT from '../data/private-rates-client.json';
import { privateRangeFor } from '../lib/private-rates';
import { privateRangeHospitals } from '../lib/private-rate-lines';

const lines = Object.keys((CLIENT as unknown as { lines: Record<string, string> }).lines);

describe('private-rate line counts match the rates', () => {
  it('covers every priced line', () => {
    expect(lines.length).toBeGreaterThan(50);
  });
  it('equals the widest shown range for every line', () => {
    for (const id of lines) {
      const view = privateRangeFor({ id, code: '' });
      const want = view ? Math.max(...view.shown.map((r) => r.spread.hospitals)) : 0;
      expect(privateRangeHospitals({ id }), id).toBe(want);
    }
    expect(privateRangeHospitals({ id: 'no-such-line' })).toBe(0);
  });
  it('lib/fit.ts never imports the rates themselves', () => {
    expect(readFileSync('lib/fit.ts', 'utf8')).not.toMatch(/from '\.\/private-rates'/);
  });
});

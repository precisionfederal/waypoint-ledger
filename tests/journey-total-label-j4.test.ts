/* JUDGE-4 #7: /journey printed "all payers combined" beside a running total of
   national Medicare allowed amounts, while the ledger beside it says "Medicare
   reference · national". The label now names the basis, and this pins the
   premise: every row a journey can add is a CMS allowed amount, priced at its
   national figure. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SELECTABLE } from '../lib/table';
import { agencyOf } from '../lib/fit';
import { JOURNEY_TOTAL_BASIS, priceJourney, totals } from '../lib/pricing';
import { exampleLedger } from '../lib/store';

const SRC = readFileSync(new URL('../components/JourneyBuilder.tsx', import.meta.url), 'utf8');

describe('JUDGE-4 #7: the journey total says what it adds up', () => {
  it('every row a journey can add is a CMS allowed amount', () => {
    expect(SELECTABLE.length).toBeGreaterThan(0);
    for (const i of SELECTABLE) {
      expect(i.basis, i.id).toBe('allowed');
      expect(agencyOf(i), i.id).toBe('CMS');
    }
  });
  it('the total is the national figures with no fit, and the example still adds to $2,692.51', () => {
    const t = totals(priceJourney(exampleLedger()));
    expect(t.basesUsed).toEqual(['allowed']);
    expect(t.totalUsd.toFixed(2)).toBe('2692.51');
  });
  it('the label names Medicare allowed amounts and never all payers', () => {
    expect(JOURNEY_TOTAL_BASIS).toBe('national Medicare allowed amounts: what Medicare and the patient pay together');
    expect(SRC).not.toMatch(/all payers/i);
    expect(SRC.match(/\{JOURNEY_TOTAL_BASIS\}/g)).toHaveLength(2);
  });
});

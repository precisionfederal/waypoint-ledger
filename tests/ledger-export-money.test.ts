/* patient-20: money in the ledger JSON download is whole cents. */
import { describe, it, expect } from 'vitest';
import { TABLE } from '../lib/table';
import { ledgerJson, moneyReplacer } from '../lib/ledger-export';

describe('ledger JSON money is rounded to cents', () => {
  it('rounds a float-noise total and nested line totals', () => {
    const out = JSON.parse(ledgerJson({ totals: { totalUsd: 2199.2400000000002, pricedLines: 7 }, lines: [{ times: 3, lineTotalUsd: 285.57000000000005, months: 8 }] }));
    expect(out.totals.totalUsd).toBe(2199.24);
    expect(out.totals.pricedLines).toBe(7);
    expect(out.lines[0]).toEqual({ times: 3, lineTotalUsd: 285.57, months: 8 });
    expect(ledgerJson({ totalUsd: 2199.2400000000002 })).not.toMatch(/2199\.24000/);
  });
  it('leaves nulls, strings and non-money numbers alone', () => {
    expect(moneyReplacer('totalUsd', null)).toBe(null);
    expect(moneyReplacer('label', 'x')).toBe('x');
    expect(moneyReplacer('times', 1.0000001)).toBe(1.0000001);
  });
  it('changes no published figure in the table', () => {
    for (const it of TABLE) expect(JSON.parse(ledgerJson({ unit: it })).unit).toEqual(JSON.parse(JSON.stringify(it)));
  });
  it('is pretty-printed the way the download was', () => {
    expect(ledgerJson({ a: 1 })).toBe(JSON.stringify({ a: 1 }, null, 2));
  });
});

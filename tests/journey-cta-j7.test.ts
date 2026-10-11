/* JUDGE-7 #10 (journey and quote):
   - /journey showed two filled buttons once the ledger held a line ("Add these
     N" and "See what it cost"); now one: "See what it cost" is filled and Add
     is the secondary. Before any line, Add is filled and "See what it cost"
     is switched off.
   - The phone bar said "N distinct lines" while the ledger says "N priced
     lines"; the bar now counts the ledger's way.
   - saidQuote keeps or drops brackets as a pair. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { saidQuote } from '../lib/said-quote';

const SRC = readFileSync(new URL('../components/JourneyBuilder.tsx', import.meta.url), 'utf8');

describe('JUDGE-7 #10: one filled button on /journey', () => {
  it('Add is secondary once the ledger holds a line, in both of its forms', () => {
    expect(SRC.match(/<button className=\{`btn \$\{st\.entries\.length \? 'ghost' : 'primary'\}`\}/g)).toHaveLength(2);
    expect(SRC).not.toContain('<button className="btn primary" type="submit">');
  });
  it('"See what it cost" is filled only when there is a line to see', () => {
    expect(SRC).toContain('? <Link className="btn primary full" href="/ledger" id="see-what-it-cost" data-go="total">');
    expect(SRC).toContain(': <button className="btn primary full is-disabled" type="button" data-go="total" disabled>');
  });
  it('the phone bar counts priced lines, as the ledger does', () => {
    expect(SRC).toContain("{sum.pricedCount} priced {sum.pricedCount === 1 ? 'line' : 'lines'}");
    expect(SRC).not.toMatch(/distinct \{st\.entries\.length/);
  });
});

describe('JUDGE-7 #10: brackets as a pair in a quote', () => {
  it('keeps a whole bracket', () => expect(saidQuote('labs (ANA, CBC, sed rate)')).toBe('labs (ANA, CBC, sed rate)'));
  it('drops an open bracket the line ends inside, keeping the words', () => expect(saidQuote('labs (ANA, CBC')).toBe('labs ANA, CBC')); // round 7 merge: flow7's pairedBrackets keeps the analytes
  it('drops a close bracket with no open one', () => expect(saidQuote('CBC, sed rate)')).toBe('CBC, sed rate'));
  it('still cuts on a word', () => expect(saidQuote('GI doctor finally did an')).toBe('GI doctor finally…'));
});

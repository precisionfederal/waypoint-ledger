/* Judge panel 15 Oct #2.4 (B-4): the ER drawer said "Does not describe: people on a
   plan from work, a Marketplace plan, Medicaid, or no insurance, and those usually
   pay more than Medicare, so read this as the floor, not your bill." Medicaid
   usually pays less than Medicare, and the same lines show hospital rates below
   it. The words are corrected where they are rendered (lib/coverage-words), so
   data/prices.json and its audit hashes are untouched. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LineDrawer, { splitCoverage } from '../components/LineDrawer';
import { TABLE } from '../lib/table';
import { coverageForReader, MEDICAID_MORE, MEDICAID_FIXED } from '../lib/coverage-words';

const raw = JSON.parse(readFileSync('data/prices.json', 'utf8')) as { items: { id: string; coverage_statement?: string }[] };
const inFile = raw.items.filter((r) => (r.coverage_statement ?? '').includes(MEDICAID_MORE));
const affected = TABLE.filter((i) => i.coverage.includes(MEDICAID_MORE));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&rsquo;/g, '’').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('B-4: whom a Medicare figure does not describe, said correctly', () => {
  it('the published file still carries its own words (56 rows), untouched', () => {
    expect(inFile.length).toBe(56);
    expect(affected.length).toBeGreaterThanOrEqual(56);
  });

  it('every affected row splits to the corrected "does not describe", with no "floor"', () => {
    for (const it of affected) {
      const c = splitCoverage(coverageForReader(it.coverage));
      expect(c.notDescribes, it.id).toContain(MEDICAID_FIXED);
      expect(c.notDescribes, it.id).not.toContain('usually pay more than Medicare, so read');
      expect(c.notDescribes, it.id).not.toMatch(/floor/i);
    }
  });

  it('every affected row renders the new text in the drawer, and never the old', () => {
    for (const it of affected) {
      const t = text(renderToStaticMarkup(createElement(LineDrawer, { item: it, ctx: {}, onClose: () => {} })));
      expect(t, it.id).toContain('Medicaid, which usually pays less');
      expect(t, it.id).toContain('Read it as Medicare’s price, not your bill');
      expect(t, it.id).not.toContain('and those usually pay more than Medicare');
      expect(t, it.id).not.toContain('PRICE FLOOR');
    }
  });

  it('a statement without the sentence is returned as it was', () => {
    const other = TABLE.find((i) => i.coverage && !i.coverage.includes(MEDICAID_MORE))!;
    expect(coverageForReader(other.coverage)).toBe(other.coverage);
  });

  it('every page that prints a coverage statement reads it through coverageForReader', () => {
    for (const f of ['components/LineDrawer.tsx', 'app/method/page.tsx', 'components/SiteOfService.tsx']) {
      expect(readFileSync(f, 'utf8'), f).toContain('coverageForReader(');
    }
  });
});

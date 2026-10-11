/* ==========================================================================
   ONE COUNT OF PUBLISHED FIGURES, EVERYWHERE.

   On 2026-09-30 the live site said 274 published figures at /api/health and in
   public/data/price-table.json, and 117 at /api/integrity (and so on the
   /integrity page). 117 is data/prices.json alone; 274 is that file plus the
   157 rows of data/prices-additions-2026-09-09.json, which lib/table.ts merges
   into the TABLE the ledger prices from. The same split refused a correction
   on any of those 157 rows ("not a published figure in this table").

   The true count is TABLE.length. This file fails the moment any surface
   counts differently, and the moment a priced row cannot be corrected.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TABLE } from '../lib/table';
import { onRequestGet as integrityGet } from '../cf/functions/api/integrity.js';
import { onRequestGet as healthGet, BUILD } from '../cf/functions/api/health.js';
import { PRICE_IDS, validateCorrection } from '../cf/functions/api/corrections.js';

/** A D1 stand-in that answers every query with no rows: the figure count must
 *  not depend on the database at all. */
const env = {
  DB: { prepare: () => ({ bind() { return this; }, all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }) },
  LEDGER: { get: async () => null, put: async () => undefined },
};

describe('every surface reports the same count of published figures', () => {
  it('the table the ledger prices from is the reference', () => {
    const base = (JSON.parse(readFileSync('data/prices.json', 'utf8')) as { items: unknown[] }).items.length;
    const added = (JSON.parse(readFileSync('data/prices-additions-2026-09-09.json', 'utf8')) as { items: unknown[] }).items.length;
    expect(TABLE.length).toBe(base + added);
  });
  it('/api/integrity says TABLE.length', async () => {
    const res = await integrityGet({ request: new Request('https://x/api/integrity'), env } as never);
    const body = await res.json() as { publishedFigures: number };
    expect(body.publishedFigures).toBe(TABLE.length);
  });
  it('/api/health (the build stamp) says TABLE.length', async () => {
    expect(BUILD.publishedFigures).toBe(TABLE.length);
    const body = await (await healthGet({ env } as never)).json() as { build: { publishedFigures: number } };
    expect(body.build.publishedFigures).toBe(TABLE.length);
  });
  it('the published price-table export says TABLE.length', () => {
    const pub = JSON.parse(readFileSync('public/data/price-table.json', 'utf8')) as { rows: number; items: unknown[] };
    expect(pub.rows).toBe(TABLE.length);
    expect(pub.items.length).toBe(TABLE.length);
  });
  it('the /integrity page prints the endpoint\'s own number, not one of its own', () => {
    expect(readFileSync('components/IntegrityPanel.tsx', 'utf8')).toContain('{d.publishedFigures} published figures');
  });
});

describe('every priced row can be corrected', () => {
  it('the corrections validator accepts exactly the rows the ledger prices', () => {
    expect(PRICE_IDS.size).toBe(TABLE.length);
    for (const it of TABLE) expect(PRICE_IDS.has(it.id)).toBe(true);
  });
  it('a thumb on a 2026-09-09 addition is accepted', () => {
    const added = (JSON.parse(readFileSync('data/prices-additions-2026-09-09.json', 'utf8')) as { items: { id: string }[] }).items;
    for (const a of added) expect((validateCorrection({ priceId: a.id, verdict: 'right' }) as { error?: string }).error).toBeUndefined();
  });
  it('an id outside the table is still refused', () => {
    expect((validateCorrection({ priceId: 'not-a-row', verdict: 'right' }) as { error?: string }).error).toMatch(/not a published figure/);
  });
});

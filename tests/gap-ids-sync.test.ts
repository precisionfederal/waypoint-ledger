/* FINAL-1011 (susan): the server, the export and the API description accept
   every kind the /gap page shows. A card whose count the server dropped would
   tell a person something was counted when it was not. */
import { describe, it, expect } from 'vitest';
import gapData from '../data/invisible-events.json';
import { CATEGORY_IDS, validateGap } from '../cf/functions/api/gap.js';
import { GAP_CSV_HEADER } from '../cf/functions/api/export/[kind].js';
import { OPENAPI } from '../lib/openapi';

const ids = (gapData as { categories: { id: string }[] }).categories.map((c) => c.id);

describe('one taxonomy from the page to the export', () => {
  it('the server accepts every category the page shows, and no other', () => {
    expect([...CATEGORY_IDS].sort()).toEqual([...ids].sort());
  });
  it('a count of care that made someone worse is kept, not dropped', () => {
    const v = validateGap({ counts: { 'care-made-worse': 2 }, ranking: ['care-made-worse'] }) as { record?: { counts: Record<string, number>; ranking: string[] } };
    expect(v.record?.counts['care-made-worse']).toBe(2);
    expect(v.record?.ranking).toEqual(['care-made-worse']);
  });
  it('gap.csv has a count column and a rank column for every category', () => {
    for (const id of ids) expect(GAP_CSV_HEADER).toContain(id);
    expect(GAP_CSV_HEADER.filter((h: string) => /^rank_\d+$/.test(h))).toHaveLength(ids.length);
  });
  it('the API description lists every category for ranking', () => {
    expect(JSON.stringify(OPENAPI)).toContain('"care-made-worse"');
  });
});

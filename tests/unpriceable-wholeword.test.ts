/* FINAL-1011 (journeys lane finding): a short travel synonym ("gas") matched inside
   "gastroenterologist", so the visit landed in Travel and was never priced. */
import { describe, it, expect } from 'vitest';
import { unpriceableFor } from '../lib/price-api';
import unpriceable from '../data/unpriceable.json';

const LIST = ((unpriceable as any).items ?? unpriceable) as any[];
const idOf = (t: string) => unpriceableFor(t, LIST)?.id ?? null;

describe('unpriceable costs match whole words', () => {
  it('a gastroenterologist visit is care, never travel', () => {
    expect(idOf('saw a gastroenterologist')).toBeNull();
  });
  it('real travel and out-of-pocket phrases still match', () => {
    for (const t of ['gas money', 'paid for gas', 'parking', 'mileage', 'paid out of pocket']) expect(idOf(t), t).not.toBeNull();
  });
  it('every label and synonym still matches itself', () => {
    for (const u of LIST) for (const s of [u.label, ...u.synonyms]) expect(unpriceableFor(String(s), LIST), String(s)).toBeTruthy();
  });
});

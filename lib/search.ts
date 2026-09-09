/* Typeahead over the price table. Ranks by label, synonyms and code. Returns
   units of care only — it never touches a price.

   🔴 WHY THE STOPWORDS MATTER. The alternates offered under a parsed phrase are
   the product's own second guess in front of the person. When "an echo" offered
   an autoimmune screen — because the two-letter article "an" prefix-matched
   "ANA" — a deterministic mapper read as a guess. Joining words are dropped
   before ranking, and a prefix match needs three real characters. */
import type { PriceItem } from './types';
import { COUNT_NOISE } from './mapper';

export interface Hit { item: PriceItem; why: string; score: number }

/** Joining words carry no unit of care and must never earn a match. */
const STOP = new Set([
  'a', 'an', 'and', 'the', 'of', 'my', 'for', 'with', 'then', 'to', 'i', 'me',
  'in', 'on', 'at', 'it', 'is', 'was', 'were', 'had', 'have', 'this', 'that', 'some',
]);

/** Joining words and counting words come out of BOTH sides. Otherwise "two
 *  rheumatologists" offers "Chest X-ray, two views" — which it did, on screen,
 *  one keystroke from a live demo. */
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').filter((w) => w && !STOP.has(w) && !COUNT_NOISE.has(w)).join(' ');
}

export function search(query: string, table: PriceItem[], limit = 8): Hit[] {
  const q = norm(query);
  if (q.length < 2) return [];
  // A prefix match needs three characters of a real word behind it.
  const qt = q.split(' ').filter((w) => w.length >= 3);
  const hits: Hit[] = [];
  for (const item of table) {
    let best = 0; let why = '';
    const cands = [item.label, ...item.synonyms, item.code ?? ''].filter(Boolean);
    for (const c of cands) {
      const n = norm(c);
      if (!n) continue;
      let s = 0;
      if (n === q) s = 100;
      else if (n.startsWith(q)) s = 80;
      else if (n.includes(q)) s = 60;
      else if (qt.length) {
        const ct = n.split(' ').filter((t) => t.length >= 3);
        const overlap = qt.filter((w) => ct.some((t) => t.startsWith(w))).length;
        if (overlap) s = 20 + (overlap / qt.length) * 30;
      }
      if (s > best) { best = s; why = c; }
    }
    if (best >= 30) hits.push({ item, why, score: best });
  }
  return hits.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label)).slice(0, limit);
}

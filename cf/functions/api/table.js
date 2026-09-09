/* GET /api/table — the whole published price table, provenance included.
   Anyone reusing this API can check every figure against the source file it
   came from; that is the point of publishing the table rather than a price.
   `?slim=1` drops the long prose (coverage, geography, population, rules) for
   callers who only need the units and their figures.
   `?locality=IA-00` or `?state=IA` prices every row for that CMS payment
   locality and carries the arithmetic; an unknown value is a 400 with a
   sentence, never a silent national fallback (see ./_geo.js). */
import { json, bad } from './_http.js';
import { TABLE, TABLE_VERSION, rulesFor } from '../../../lib/table.ts';
import { geoFromQuery, withLocality, localityNoteFor } from './_geo.js';

export const withRules = (i) => ({ ...i, rules: rulesFor(i.id) });
export const slimRow = (i) => ({
  id: i.id, label: i.label, valueUsd: i.valueUsd, basis: i.basis, year: i.year,
  attribution: i.attribution, confidence: i.confidence, sourceUrl: i.sourceUrl,
  summable: rulesFor(i.id).summable,
});

export function onRequestGet({ request }) {
  const slim = new URL(request.url).searchParams.get('slim') === '1';
  const geo = geoFromQuery(request);
  if (geo.error) return bad(geo.error);
  const { locality } = geo.context;

  const items = TABLE.map(slim ? slimRow : withRules).map((i) => withLocality(i, locality));
  const priced = locality ? items.filter((i) => i.localityUsd !== null).length : 0;

  return json(
    {
      ok: true,
      version: TABLE_VERSION,
      count: items.length,
      slim,
      locality,
      localityNote: locality ? localityNoteFor(locality, priced, items.length) : null,
      localityPricedCount: locality ? priced : null,
      items,
    },
    200,
    { 'cache-control': 'public, max-age=3600' },
  );
}

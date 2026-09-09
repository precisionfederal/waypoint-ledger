/* GET /api/table/{id} — one unit of care with its rules and its source.
   `?locality=IA-00` / `?state=IA` returns that place's Medicare allowed amount
   with the RVUs, the geographic indices and the formula that produced it, plus
   what the same row costs from the cheapest CMS locality to the dearest. */
import { json, bad } from '../_http.js';
import { TABLE, TABLE_VERSION, rulesFor } from '../../../../lib/table.ts';
import { localityRangeFor } from '../../../../lib/price-api.ts';
import { geoFromQuery, withLocality, localityNoteFor } from '../_geo.js';

export function onRequestGet({ request, params }) {
  const item = TABLE.find((t) => t.id === params.id);
  if (!item) return bad(`No unit of care with id "${params.id}". GET /api/table lists every id.`, 404);
  const geo = geoFromQuery(request);
  if (geo.error) return bad(geo.error);
  const { locality } = geo.context;

  const row = withLocality({ ...item, rules: rulesFor(item.id) }, locality);
  return json(
    {
      ok: true,
      version: TABLE_VERSION,
      locality,
      localityNote: locality ? localityNoteFor(locality, row.localityUsd === null ? 0 : 1, 1) : null,
      localityRange: localityRangeFor(item),
      item: row,
    },
    200,
    { 'cache-control': 'public, max-age=3600' },
  );
}

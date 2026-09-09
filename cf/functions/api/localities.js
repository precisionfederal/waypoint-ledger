/* ==========================================================================
   GET /api/localities — the index of the 109 places Medicare prices separately.

   Until now the only way to get one locality's figure out of this project was
   to download a 2.5 MB CSV of all 5,123. That is publishing, not an API. An
   agency wanting Iowa should be able to ask for Iowa.

   Every index on this page is CMS's own: the Medicare Administrative Contractor
   number, the three geographic practice cost indices, and the conversion factor
   the fee schedule formula multiplies by. Nothing here is derived by us except
   the arrangement, and GET /api/localities/{key} shows the arithmetic for every
   figure it returns.
   ========================================================================== */
import { json } from './_http.js';
import { TABLE, TABLE_VERSION } from '../../../lib/table.ts';
import {
  CONVERSION_FACTOR, LOCALITIES, LOCALITY_ROW_COUNT, STATE_NAME,
  STATE_PRICE_FORMULA, STATE_PRICE_SOURCES, STATE_PRICE_VERSION, hasLocalityFigures,
} from '../../../lib/fit.ts';

export const PRICED_IDS = TABLE.filter((t) => hasLocalityFigures(t.id)).map((t) => t.id);

export const indexRow = (l) => ({
  key: l.key,
  name: l.displayName,
  cmsName: l.name,
  state: l.state,
  stateName: STATE_NAME[l.state] ?? l.state,
  mac: l.mac,
  workGpci: l.pw,
  practiceExpenseGpci: l.pe,
  malpracticeGpci: l.mp,
  figures: `/api/localities/${l.key}`,
});

export function onRequestGet() {
  return json(
    {
      ok: true,
      version: STATE_PRICE_VERSION,
      tableVersion: TABLE_VERSION,
      count: LOCALITIES.length,
      pricedCodesPerLocality: LOCALITY_ROW_COUNT,
      figuresPublished: LOCALITY_ROW_COUNT * LOCALITIES.length,
      conversionFactor: CONVERSION_FACTOR,
      formula: STATE_PRICE_FORMULA,
      sources: STATE_PRICE_SOURCES,
      note:
        'A CMS payment locality is the geography Medicare prices a service in. The three indices below are '
        + "CMS's own geographic practice cost indices for that place; the formula multiplies them by the "
        + 'published relative value units for a code and by the conversion factor. GET /api/localities/{key} '
        + 'returns every priced code for one locality with that arithmetic on each row, and '
        + 'GET /api/table?locality={key} prices the whole table for it. The complete set is also published '
        + 'as a file at /data/locality-prices.csv.',
      items: LOCALITIES.map(indexRow),
    },
    200,
    { 'cache-control': 'public, max-age=3600' },
  );
}

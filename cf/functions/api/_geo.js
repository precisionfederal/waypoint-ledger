/* ==========================================================================
   ONE PLACE WHERE A GET LEARNS WHERE THE CALLER LIVES.

   R3's scale adversary: "GET /api/table/cms-99213?locality=IA-00 returns the
   national figure — the locality is silently ignored, and nobody is warned."
   POST /api/price had already been fixed; the GET an agency actually harvests
   had not. A published figure that quietly answers a different question than
   the one asked is worse than a 400.

   So the query string is read through the SAME resolver the POST body goes
   through (lib/price-api.ts resolveContext), which means one definition of what
   a locality key is, one set of error sentences, and no second copy to drift.
   An unknown state or locality is a 400 with a sentence, never a fallback.
   ========================================================================== */
import { resolveContext } from '../../../lib/price-api.ts';
import { formulaParts, localityFigure, localityOf, CONVERSION_FACTOR, STATE_PRICE_FORMULA } from '../../../lib/fit.ts';

/** Read ?locality= / ?state= off a GET. Returns { error } or { context }. */
export function geoFromQuery(request) {
  const q = new URL(request.url).searchParams;
  return resolveContext({ locality: q.get('locality') ?? '', state: q.get('state') ?? '' });
}

/** Why a row has no locality figure. True of every row CMS does not price by GPCI. */
export const NO_LOCALITY_FIGURE =
  'CMS publishes no geographically adjusted amount for this row in the files this table is built from '
  + '(the geographic practice cost indices apply to the physician fee schedule only), so the published '
  + 'figure is the national one and is the same in every locality.';

/**
 * The locality half of one row: the figure for that place and the arithmetic
 * that produced it. Returns the row untouched when no locality was asked for.
 */
export function withLocality(row, locality) {
  if (!locality) return row;
  const loc = localityOf(locality.key);
  const usd = localityFigure(row.id, locality.key);
  const parts = usd === null ? null : formulaParts(row.id, loc);
  return {
    ...row,
    nationalUsd: row.valueUsd,
    localityUsd: usd,
    localityKey: locality.key,
    localityName: locality.name,
    localityGeography: usd === null
      ? row.geography
      : `${placeName(locality)} (CMS payment locality ${locality.key}, Medicare Administrative Contractor ${locality.mac})`,
    localityNote: usd === null ? NO_LOCALITY_FIGURE : null,
    localityFormula: parts
      ? {
        code: parts.code,
        text: STATE_PRICE_FORMULA,
        conversionFactor: CONVERSION_FACTOR,
        parts: parts.parts.map((p) => ({
          name: p.name, rvu: p.rvu, gpci: p.gpci, product: Math.round(p.product * 1e6) / 1e6,
        })),
        rvuSum: Math.round(parts.sum * 1e6) / 1e6,
        total: parts.total,
      }
      : null,
  };
}

/** "Iowa" · "Rest Of Texas, Texas" — the CMS locality name, and the state when it adds anything. */
export const placeName = (l) => (l.name === l.stateName ? l.name : `${l.name}, ${l.stateName}`);

/** The sentence that goes at the top of a localised response, so nothing is implicit. */
export const localityNoteFor = (locality, priced, total) => {
  const head =
    `Read for ${placeName(locality)} (CMS locality ${locality.key}). valueUsd is left as the published `
    + `NATIONAL figure and is never overwritten; localityUsd is this place's amount and localityFormula is `
    + `the arithmetic CMS's own files produce it from. `;
  if (total === 1) {
    return head + (priced
      ? 'CMS prices this row geographically, so localityUsd is what Medicare allows here.'
      : 'CMS publishes no geographically adjusted amount for this row, so it is the same figure everywhere.');
  }
  return head
    + `${priced} of ${total} rows carry a locality figure; the rest are national by publication, not by omission.`;
};

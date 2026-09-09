/* ==========================================================================
   GET /api/citation/{priceId} — a correction, addressed to the body that
   published the number, without our bundle.

   A thumb on a ledger line is bound to ONE published federal row. Until now the
   only way to act on that was to download our CSV and join it back to our price
   table. An analyst at CMS or AHRQ holding the row id `cms-99213` could not get
   the provenance and the count in one call, so the demand signal stopped at our
   edge. This is that call.

     GET /api/citation/cms-99213            -> JSON: the row, its provenance, the
                                               public counts, and the same block
                                               as plain text in `text`
     GET /api/citation/cms-99213?format=text -> text/plain, nothing to parse
     Accept: text/plain                      -> the same

   Every field comes from data/prices.json and the corrections table. Nothing is
   computed except the fit rate and the median of what people said they paid,
   and both are labelled as a demand signal about the published figure, never as
   a price. A row nobody has spoken about still answers, with zero counts — the
   provenance is the point, and the absence of a count is a fact too.
   ========================================================================== */
import { json, bad } from '../_http.js';
import { all } from '../_db.js';
import { TABLE, TABLE_VERSION } from '../../../../lib/table.ts';
import {
  BASIS_LABEL, PUBLISHER_FULL, PUBLISHER_ROUTE, basisLabel, citationText,
  documentOf, fitRate, publisherOf,
} from '../../../../lib/register-cite.ts';

const byId = new Map(TABLE.map((i) => [i.id, i]));

/** The counts for one row, straight from the register. Median exactly as the aggregate computes it. */
async function countsFor(env, priceId) {
  const rows = await all(env, 'SELECT verdict, believed_usd FROM corrections WHERE price_id=?1', priceId);
  let right = 0; let wrong = 0;
  const believed = [];
  for (const r of rows) {
    if (r.verdict === 'wrong') wrong++; else right++;
    if (r.believed_usd !== null && r.believed_usd !== undefined) believed.push(Number(r.believed_usd));
  }
  believed.sort((a, b) => a - b);
  return {
    confirmedRight: right,
    flaggedWrong: wrong,
    n: rows.length,
    fitRatePct: fitRate(right, wrong),
    publicMedianBelievedUsd: believed.length ? believed[Math.floor(believed.length / 2)] : null,
  };
}

export async function onRequestGet({ params, request, env }) {
  const priceId = decodeURIComponent(String(params.id || '')).trim();
  const item = byId.get(priceId);
  if (!item) {
    return bad(`No published figure has the identifier "${priceId}". GET /api/table lists every row, and every id is in /data/price-table.csv.`, 404);
  }

  let counts;
  try { counts = await countsFor(env, priceId); }
  catch { return bad('The register could not be read right now, so the counts for this figure are unavailable. The provenance is unchanged and is in /api/table/' + priceId + '.', 503); }

  const url = new URL(request.url);
  const asOf = new Date().toISOString().slice(0, 10);
  const site = `${url.protocol}//${url.host}`;
  const publisher = publisherOf(item.sourceTitle);

  const cite = {
    priceId, label: item.label, code: item.code,
    valueUsd: item.valueUsd, year: item.year, basis: item.basis,
    geography: item.geography, population: item.population,
    sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl,
    confirmedRight: counts.confirmedRight, flaggedWrong: counts.flaggedWrong,
    medianBelievedUsd: counts.publicMedianBelievedUsd,
  };
  const text = citationText(cite, asOf, site);

  const wantsText = url.searchParams.get('format') === 'text'
    || (request.headers.get('accept') || '').includes('text/plain');
  if (wantsText) {
    return new Response(text + '\n', {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
        'content-disposition': `inline; filename="waypoint-correction-${priceId}.txt"`,
      },
    });
  }

  return json({
    ok: true,
    priceId,
    countedAsOf: asOf,
    tableVersion: TABLE_VERSION,
    figure: {
      label: item.label,
      code: item.code ?? null,
      publishedValueUsd: item.valueUsd,
      year: item.year,
      basis: item.basis,
      basisMeaning: BASIS_LABEL[item.basis] ?? item.basis,
      basisLabel: basisLabel(item.basis),
      geography: item.geography,
      population: item.population,
      coverage: item.coverage,
      confidence: item.confidence,
    },
    publishedBy: {
      agency: publisher,
      agencyFullName: PUBLISHER_FULL[publisher],
      whatACorrectionHereIsAbout: PUBLISHER_ROUTE[publisher],
      document: documentOf(item.sourceTitle),
      sourceTitle: item.sourceTitle,
      sourceUrl: item.sourceUrl,
    },
    publicSignal: {
      ...counts,
      sample: 'Self-selected members of the public using a free tool. Counts are reported exactly as entered — no weighting, no imputation, no extrapolation to a population.',
      medianNote: 'publicMedianBelievedUsd is a demand signal about the published figure. It is never used to price a ledger.',
    },
    text,
    plainTextUrl: `${site}/api/citation/${encodeURIComponent(priceId)}?format=text`,
    methodUrl: `${site}/method`,
  }, 200, { 'access-control-allow-origin': '*' });
}

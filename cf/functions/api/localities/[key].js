/* GET /api/localities/{key} — one CMS payment locality, and every figure we
   publish for it, each with the arithmetic that produced it. An unknown key is
   a 404 with the sentence that tells the caller what a key looks like. */
import { json, bad } from '../_http.js';
import { TABLE, TABLE_VERSION } from '../../../../lib/table.ts';
import {
  CONVERSION_FACTOR, LOCALITIES, STATE_NAME, STATE_PRICE_FORMULA,
  STATE_PRICE_SOURCES, STATE_PRICE_VERSION, formulaParts, localityFigure,
} from '../../../../lib/fit.ts';
import { indexRow } from '../localities.js';

export function onRequestGet({ params }) {
  const key = String(params.key || '').toUpperCase();
  const loc = LOCALITIES.find((l) => l.key === key);
  if (!loc) {
    return bad(
      `No CMS payment locality has the key "${params.key}". A key is the two-letter state and the two-digit `
      + 'CMS locality number, like "IA-00" or "TX-31". GET /api/localities lists all '
      + `${LOCALITIES.length}.`,
      404,
    );
  }

  const rows = [];
  for (const item of TABLE) {
    const usd = localityFigure(item.id, key);
    if (usd === null) continue;
    const parts = formulaParts(item.id, loc);
    rows.push({
      id: item.id,
      label: item.label,
      code: item.code ?? null,
      basis: item.basis,
      year: item.year,
      nationalUsd: item.valueUsd,
      localityUsd: usd,
      sourceTitle: item.sourceTitle,
      sourceUrl: item.sourceUrl,
      formula: parts
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
    });
  }

  return json(
    {
      ok: true,
      version: STATE_PRICE_VERSION,
      tableVersion: TABLE_VERSION,
      locality: { ...indexRow(loc), stateName: STATE_NAME[loc.state] ?? loc.state },
      count: rows.length,
      conversionFactor: CONVERSION_FACTOR,
      formula: STATE_PRICE_FORMULA,
      sources: STATE_PRICE_SOURCES,
      note:
        'These are Medicare allowed amounts for this locality: what Medicare approves, program payment plus '
        + "the beneficiary's share. For a person who is not on Medicare this is a published reference price "
        + 'and not a bill, and for a person on Medicaid it does not describe what their state pays at all. '
        + 'Every figure below was recomputed from the relative value units and geographic indices on its own '
        + 'row; node scripts/gen-locality-table.mjs re-derives all of them and exits non-zero on one cent of '
        + 'drift.',
      items: rows,
    },
    200,
    { 'cache-control': 'public, max-age=3600' },
  );
}

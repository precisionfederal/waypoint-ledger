/* POST /api/price — the public pricing endpoint.
   Runs the SAME library the browser runs (lib/price-api.ts → lib/mapper.ts →
   lib/pricing.ts → lib/table.ts → lib/fit.ts). No model, average or
   interpolation is reachable from here: every dollar in the response is a row
   of the published federal table, returned with its year, basis, population
   and source URL.

   🔴 The reuse surface must equal the product. Send `coverage` and `locality`
   (or `state`) and this endpoint answers the question the screen answers: the
   figure fitted to that person, the verdict on whether it describes them, and
   the range that figure takes across all 109 CMS payment localities. An
   unknown coverage, state or locality is a 400 with a sentence — never a
   silent fall back to the national number. */
import { json, bad, readJson, count } from './_http.js';
import { priceRequest } from '../../../lib/price-api.ts';
import { SELECTABLE, TABLE, TABLE_VERSION, checkCombination, bundlingNote } from '../../../lib/table.ts';
import unpriceable from '../../../data/unpriceable.json';

const OPTS = { tableVersion: TABLE_VERSION, unpriceable: unpriceable.items, checkCombination, bundlingNote };

export async function onRequestPost({ request, env }) {
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  // A story is matched only against units a person can actually add to a ledger.
  // An explicit itemId may name any row, including one that is never summed —
  // it comes back priced, with its source, and outside the total.
  const table = typeof body.story === 'string' ? SELECTABLE : TABLE;
  const out = priceRequest(body, table, OPTS);
  if (out.error) return bad(out.error);
  await count(env, 'price');
  return json(out.result);
}

export const onRequestGet = () => bad('POST a JSON body: {"story":"…"} or {"items":[{"itemId":"cms-99213","times":2}]}. Add "coverage" (employer, marketplace, medicaid, medicare, uninsured, unsure) and "state" or "locality" to get the figure fitted to that person. GET /api/openapi.json describes every route.', 405);

/* GET /api/fhir/example — the demo journey, as an HL7 FHIR R4 Bundle.

   The same sentence the landing page offers as an example, so the first bundle
   a developer sees is the journey the product actually demonstrates rather than
   a happy path written for the docs. ?envelope=1 adds what was left out of it
   and why. */
import { json, bad, count } from '../_http.js';
import { EXAMPLE_STORY, toFhirBundle } from '../../../../lib/fhir.ts';
import { parseJourney } from '../../../../lib/mapper.ts';
import { SELECTABLE, TABLE, TABLE_VERSION } from '../../../../lib/table.ts';

const FHIR_HEADERS = {
  'content-type': 'application/fhir+json; charset=utf-8',
  'cache-control': 'public, max-age=3600',
};

export async function onRequestGet({ request, env }) {
  const entries = parseJourney(EXAMPLE_STORY, SELECTABLE)
    .filter((s) => s.result.item)
    .map((s, i) => ({ key: `s${i}`, raw: s.raw, item: s.result.item, times: s.times }));
  const out = toFhirBundle(entries, TABLE, { tableVersion: TABLE_VERSION });
  await count(env, 'fhir-example');

  if (new URL(request.url).searchParams.get('envelope') !== '1') {
    return new Response(JSON.stringify(out.bundle, null, 2), { status: 200, headers: FHIR_HEADERS });
  }
  return json({
    ok: true,
    fhirVersion: '4.0.1',
    tableVersion: TABLE_VERSION,
    story: EXAMPLE_STORY,
    counts: out.counts,
    omitted: out.omitted,
    codes: out.codes,
    bundle: out.bundle,
  }, 200, { 'cache-control': 'public, max-age=3600' });
}

export const onRequestPost = () => bad('The example is a GET. POST a ledger to /api/fhir.', 405);

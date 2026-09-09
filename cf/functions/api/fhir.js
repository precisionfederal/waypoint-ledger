/* POST /api/fhir — a ledger, as an HL7 FHIR R4 collection Bundle.

   The response is FHIR-native by default: the bare Bundle, served as
   application/fhir+json, so a FHIR client can consume it without unwrapping
   anything. `?envelope=1` returns { ok, bundle, omitted, codes, counts } for
   callers who want the two lists that deliberately do NOT go inside the bundle:
   `omitted` (lines that are not care a provider delivered, and words that
   matched no unit of care) and `codes` (the CMS Ambulatory Payment
   Classification, which FHIR gives no code system URI, so we never invent one).

   Send `entries` (the shape POST /api/journeys takes) or `story` (the shape
   POST /api/price takes). Add `coverage` and `state` or `locality` and every
   ChargeItem carries the figure this site would show that person, and a line
   that nothing published describes keeps its Procedure and gets no ChargeItem —
   a blank, never a zero. Errors keep this API's usual { ok:false, error } shape.

   Every dollar here is a row of data/prices.json, multiplied by a count. This
   endpoint prices nothing: lib/fhir.ts re-expresses what lib/pricing.ts and
   lib/fit.ts already decided. */
import { json, bad, readJson, count } from './_http.js';
import { toFhirBundle } from '../../../lib/fhir.ts';
import { validateJourney, resolveContext, MAX_STORY } from '../../../lib/price-api.ts';
import { parseJourney } from '../../../lib/mapper.ts';
import { fitOf } from '../../../lib/fit.ts';
import { SELECTABLE, TABLE, TABLE_VERSION } from '../../../lib/table.ts';

const FHIR_HEADERS = { 'content-type': 'application/fhir+json; charset=utf-8', 'cache-control': 'no-store' };

/** Build the ledger lines from a story, exactly as the browser's mapper does. */
function entriesFromStory(story) {
  return parseJourney(story, SELECTABLE)
    .filter((s) => s.result.item)
    .map((s, i) => ({ key: `s${i}`, raw: s.raw, item: s.result.item, times: s.times }));
}

export function buildBundle(body) {
  const ctxResult = resolveContext(body);
  if (ctxResult.error) return { error: ctxResult.error };
  const context = ctxResult.context;
  const ctx = {
    ...(context.coverage ? { coverage: context.coverage } : {}),
    ...(context.locality ? { locality: context.locality.key } : {}),
  };
  const fitted = Boolean(ctx.coverage || ctx.locality);

  let entries;
  if (typeof body.story === 'string') {
    const story = body.story.trim();
    if (!story) return { error: 'The story is empty.' };
    if (story.length > MAX_STORY) return { error: `The story must be ${MAX_STORY} characters or fewer.` };
    entries = entriesFromStory(story);
    if (!entries.length) {
      return { error: 'Nothing in that story matched a unit of care in the published table, so there is nothing to put in a bundle. POST /api/price returns the same story with the reason for each phrase.' };
    }
  } else {
    const v = validateJourney(body, TABLE);
    if (v.error) return { error: v.error };
    entries = v.entries;
  }

  const out = toFhirBundle(entries, TABLE, {
    tableVersion: TABLE_VERSION,
    ...(fitted
      ? {
        figureFor: (e) => {
          if (!e.item) return undefined;
          const fit = fitOf(e.item, ctx);
          /* 🔴 The fee-schedule and locality figures both come out of the CMS
             release the row already cites, so the line keeps that file. The
             CY2024 average submitted charge does not: the table records it as an
             alternate figure without a file of its own, so the line cites NO
             file rather than pointing at the fee schedule it did not come from. */
          const source = fit.which === 'charge' ? null : undefined;
          return { usd: fit.figureUsd, note: fit.figureNote, source };
        },
      }
      : {}),
  });
  return { out, context };
}

export async function onRequestPost({ request, env }) {
  const { body, error } = await readJson(request);
  if (error) return bad(error);
  const built = buildBundle(body);
  if (built.error) return bad(built.error);
  await count(env, 'fhir');

  const envelope = new URL(request.url).searchParams.get('envelope') === '1';
  if (!envelope) return new Response(JSON.stringify(built.out.bundle), { status: 200, headers: FHIR_HEADERS });
  return json({
    ok: true,
    fhirVersion: '4.0.1',
    tableVersion: TABLE_VERSION,
    context: built.context,
    counts: built.out.counts,
    omitted: built.out.omitted,
    codes: built.out.codes,
    bundle: built.out.bundle,
  });
}

export const onRequestGet = () => bad(
  'POST a JSON body: {"entries":[{"itemId":"cms-99213","times":3}]} or {"story":"…"}. '
  + 'Add "coverage" and "state" or "locality" to get the figures this site would show that person. '
  + 'Add ?envelope=1 for the bundle plus what was deliberately left out of it. '
  + 'GET /api/fhir/example returns a worked bundle.',
  405,
);

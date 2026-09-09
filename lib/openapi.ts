/* ==========================================================================
   THE PUBLISHED API DESCRIPTION — OpenAPI 3.1, written by hand and kept
   beside the code it describes. Served at /api/openapi.json and rendered on
   /developers, so the description a machine reads and the one a person reads
   are the same object.

   Administrative endpoints take a bearer token and are deliberately not
   described here.
   ========================================================================== */

export interface OpenApiOperation {
  operationId: string;
  summary: string;
  description?: string;
  tags?: string[];
  parameters?: Record<string, unknown>[];
  requestBody?: Record<string, unknown>;
  responses: Record<string, Record<string, unknown>>;
}
export type OpenApiPathItem = Partial<Record<'get' | 'post' | 'put' | 'delete', OpenApiOperation>>;
export interface OpenApiDoc {
  openapi: string;
  info: Record<string, unknown>;
  servers: { url: string; description: string }[];
  tags: { name: string; description: string }[];
  paths: Record<string, OpenApiPathItem>;
  components: Record<string, unknown>;
}

const jsonBody = (schema: Record<string, unknown>, required = true) => ({
  required,
  content: { 'application/json': { schema } },
});
const ok = (schema: Record<string, unknown>, description = 'Success.') => ({
  description,
  content: { 'application/json': { schema } },
});
const ERR = { $ref: '#/components/schemas/Error' };
/* Every public count is served from a folded snapshot. The endpoint says which
   answer you got, how many rows are behind it, and when that fold was written,
   so a caller can tell a cached number from a freshly counted one. */
const FOLD = {
  type: 'object',
  description: 'hit=true means this answer came from the folded snapshot; rows is how many rows are folded into it; foldedAt is when that fold was written.',
  properties: { hit: { type: 'boolean' }, rows: { type: 'integer' }, foldedAt: { type: 'string', format: 'date-time' } },
};
/* Validate a body without recording it. Every public POST below takes it. */
const DRY = {
  name: 'dry', in: 'query', required: false, schema: { type: 'string', enum: ['1'] },
  description: 'Validate only. With ?dry=1 the body is checked and the storage path is probed; nothing is written and no published count moves. Answers { ok, dryRun: true, kind, accepted, storage, note }.',
};
/* The FHIR routes answer FHIR by default. This asks for the bundle plus the two
   lists that are deliberately not inside it. */
const ENVELOPE = {
  name: 'envelope', in: 'query', required: false, schema: { type: 'string', enum: ['1'] },
  description: 'Return { ok, fhirVersion, tableVersion, counts, omitted, codes, bundle } instead of the bare Bundle.',
};
const errors = (...codes: [string, string][]) =>
  Object.fromEntries(codes.map(([c, d]) => [c, { description: d, content: { 'application/json': { schema: ERR } } }]));

const geoParams = [
  { name: 'locality', in: 'query', required: false, schema: { type: 'string' }, example: 'IA-00',
    description: 'A CMS payment locality key: the two-letter state and the two-digit CMS locality number. Every row that CMS prices geographically comes back with that locality’s allowed amount in localityUsd and the arithmetic in localityFormula. valueUsd is never overwritten. An unknown key is a 400 with a sentence.' },
  { name: 'state', in: 'query', required: false, schema: { type: 'string' }, example: 'IA',
    description: 'A two-letter postal abbreviation. Accepted only where the state has exactly one CMS payment locality; a state with more is a 400 naming its localities, because a state is not enough to price a line.' },
] as const;

export const OPENAPI: OpenApiDoc = {
  openapi: '3.1.0',
  info: {
    title: 'Waypoint Ledger API',
    version: '1.0.0',
    summary: 'Price one person’s diagnostic journey from published U.S. federal figures.',
    description:
      'A deterministic matcher maps a plain-language phrase to a unit of care; a published federal '
      + 'table prices that unit. No model produces a dollar figure. Every priced line comes back with '
      + 'the year, the basis (allowed amount, payment, charge), the population the figure describes, '
      + 'and the URL of the file it was read from, so a caller can show any number it prints. '
      + 'Figures that must not be added together are returned flagged and kept out of the total. '
      + 'Anonymous by default: no account is required, nothing identifies a caller, and free text '
      + 'sent to the register endpoints is never served back. '
      + 'Everything behind the tool is downloadable without an API call: the national price table at '
      + '/data/price-table.csv, all 5,123 CMS locality figures at /data/locality-prices.csv, and the '
      + 'instrument dictionary at /data/dictionary.csv. To stand this up for another condition, state or '
      + 'population, /adopt names the files to edit.',
    contact: { name: 'Precision Federal', email: 'bo@precisionfederal.com' },
    license: {
      name: 'CC0 1.0 Universal (public domain dedication)',
      url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      identifier: 'CC0-1.0',
    },
  },
  servers: [
    { url: 'https://waypoint-ledger.pages.dev', description: 'Production' },
    { url: 'http://localhost:8788', description: 'Local full stack (wrangler pages dev)' },
  ],
  tags: [
    { name: 'pricing', description: 'The price table and the pricing call.' },
    { name: 'journeys', description: 'Save a ledger and read it back by link.' },
    { name: 'register', description: 'The public counts: corrections, gaps, the burden survey, the change log.' },
    { name: 'account', description: 'Optional passkey sign-in so a ledger follows a person across devices.' },
    { name: 'interoperability', description: 'The ledger as HL7 FHIR R4, so another system reads it without a bespoke parser.' },
    { name: 'open data', description: 'Whole files, no request body, nothing to join back to us.' },
  ],
  paths: {
    '/api/health': {
      get: {
        operationId: 'health', tags: ['pricing'], summary: 'Service and table version.',
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, version: { type: 'string' }, db: { type: 'string', enum: ['ok', 'down'] }, tables: { type: 'object', additionalProperties: { type: 'integer' } } } }) },
      },
      post: {
        operationId: 'healthWritePath', tags: ['pricing'],
        summary: 'Prove the database accepts a write, not just a read.',
        description: 'Administrative: takes the bearer token. Inserts and deletes one row in a canary table outside every chain, so a read-only outage and a write-only outage cannot look alike. rowsLeftBehind is 0 when the canary cleaned up after itself.',
        responses: {
          200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, writePath: { type: 'object', properties: { ok: { type: 'boolean' }, ms: { type: 'integer' }, rowsLeftBehind: { type: 'integer' }, at: { type: 'string', format: 'date-time' } } } } }),
          ...errors(['401', 'No admin token.'], ['503', 'The database refused the write.']),
        },
      },
    },
    '/api/table': {
      get: {
        operationId: 'getTable', tags: ['pricing'],
        summary: 'The whole price table with provenance.',
        description: 'Cacheable for an hour. Every row carries its figure, basis, year, population, coverage statement, source title and source URL, plus the combination rules that say whether it may enter a total. Add ?slim=1 for units and figures without the prose.',
        parameters: [
          { name: 'slim', in: 'query', required: false, schema: { type: 'string', enum: ['1'] }, description: 'Return id, label, figure, basis, year, confidence, source URL and summable only.' },
          ...geoParams,
        ],
        responses: {
          200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, version: { type: 'string' }, count: { type: 'integer' }, locality: { $ref: '#/components/schemas/Locality' }, localityNote: { type: ['string', 'null'] }, localityPricedCount: { type: ['integer', 'null'] }, items: { type: 'array', items: { $ref: '#/components/schemas/TableItem' } } } }),
          ...errors(['400', 'An unknown locality or state. Never ignored, never a silent national fallback.']),
        },
      },
    },
    '/api/table/{id}': {
      get: {
        operationId: 'getTableItem', tags: ['pricing'], summary: 'One unit of care.',
        description: 'Add ?locality= or ?state= and the row comes back with that place’s Medicare allowed amount, the relative value units and geographic indices behind it, and the formula. localityRange is what this one row costs from the cheapest CMS locality to the dearest, with both places named.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'cms-99213' },
          ...geoParams,
        ],
        responses: {
          200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, version: { type: 'string' }, locality: { $ref: '#/components/schemas/Locality' }, localityNote: { type: ['string', 'null'] }, localityRange: { type: ['object', 'null'] }, item: { $ref: '#/components/schemas/TableItem' } } }),
          ...errors(['400', 'An unknown locality or state.'], ['404', 'No row with that id.']),
        },
      },
    },
    '/api/localities': {
      get: {
        operationId: 'getLocalities', tags: ['open data'],
        summary: 'The 109 places Medicare prices separately.',
        description: 'Every CMS payment locality with its Medicare Administrative Contractor and its three geographic practice cost indices, plus the conversion factor and the formula. The whole set of published locality figures is also downloadable as a file at /data/locality-prices.csv.',
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, version: { type: 'string' }, count: { type: 'integer' }, pricedCodesPerLocality: { type: 'integer' }, figuresPublished: { type: 'integer' }, conversionFactor: { type: 'number' }, formula: { type: 'string' }, items: { type: 'array', items: { $ref: '#/components/schemas/Locality' } } } }) },
      },
    },
    '/api/localities/{key}': {
      get: {
        operationId: 'getLocality', tags: ['open data'],
        summary: 'One locality, and every figure published for it.',
        description: 'Each row carries the national figure, this locality’s allowed amount, and the three products CMS’s own formula multiplies — relative value unit by geographic index — so the number can be re-derived without this API.',
        parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' }, example: 'IA-00' }],
        responses: {
          200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, version: { type: 'string' }, locality: { $ref: '#/components/schemas/Locality' }, count: { type: 'integer' }, items: { type: 'array', items: { type: 'object' } } } }),
          ...errors(['404', 'No locality with that key. The sentence names the format and points at the index.']),
        },
      },
    },
    '/api/price': {
      post: {
        operationId: 'price', tags: ['pricing'],
        summary: 'Price a story, or a list of units of care.',
        description:
          'Send `story` (up to 2000 characters of plain language) or `items` (up to 60 units). Each priced '
          + 'segment returns the unit it mapped to, what it matched on, the published figure, and that '
          + 'figure’s year, basis, population, coverage and source URL. Phrases with no published figure '
          + 'come back in `unpriced` with the reason. Rate limit: 300 calls per network per hour.\n\n'
          + 'Add `coverage` and `locality` (or `state`) and the response carries the same answer the site '
          + 'shows that person: `segments[].fit` says whether the published figure describes them, '
          + '`segments[].localityUsd` is the amount for their CMS payment locality, '
          + '`segments[].localityRange` is what that service costs from the cheapest locality to the '
          + 'dearest, and `fitted` totals only the lines a published figure actually describes. An unknown '
          + 'coverage, state or locality is a 400 with a sentence — the national figure is never returned '
          + 'in place of a value we were asked for and could not honour.',
        requestBody: jsonBody({ $ref: '#/components/schemas/PriceRequest' }),
        responses: {
          200: ok({ $ref: '#/components/schemas/PriceResponse' }),
          ...errors(['400', 'The body is not a story or a list of known units.'], ['429', 'Rate limit reached for this network this hour.']),
        },
      },
    },
    '/api/fhir': {
      post: {
        operationId: 'fhirBundle', tags: ['interoperability'],
        summary: 'A ledger as an HL7 FHIR R4 collection Bundle.',
        description:
          'Send `entries` (the shape POST /api/journeys takes) or `story` (the shape POST /api/price takes) '
          + 'and the answer is a FHIR R4 Bundle of type `collection`, served as application/fhir+json: one '
          + 'Encounter per visit line, one Procedure per test or procedure line coded in CPT or HCPCS from '
          + 'the row itself, one ChargeItem per priced line whose `priceOverride` is the published figure and '
          + 'whose `definitionUri` is the federal file it came from, and one DocumentReference plus one '
          + 'Provenance per federal file.\n\n'
          + 'There is no Patient resource, no `identifier` element and no date anywhere in the bundle: the '
          + 'tool never collected them, so asserting them would be invention. Every subject is a display-only '
          + 'reference. Every ChargeItem carries status `unknown`, because nobody here knows whether the care '
          + 'was billed, paid or denied — the figure is a published federal reference price, not a bill.\n\n'
          + 'Add `coverage` and `state` or `locality` and each ChargeItem carries the figure this site would '
          + 'show that person; a line nothing published describes keeps its Procedure and gets no ChargeItem, '
          + 'which is a blank rather than a zero. `?envelope=1` wraps the bundle with what was deliberately '
          + 'left out of it: `omitted` (wages, mileage, whole-year survey figures and words that matched no '
          + 'unit of care) and `codes` (the CMS Ambulatory Payment Classification, which has no FHIR code '
          + 'system URI, so it is never coded inside the bundle). Rate limit: 300 calls per network per hour.\n\n'
          + 'Each ChargeItem cites the file its FIGURE came from in `definitionUri`, never the file the row '
          + 'came from. Where an uninsured person is shown the CY2024 average submitted charge, the table '
          + 'holds that figure as an alternate without a file of its own, so the line cites no file rather '
          + 'than the fee schedule it did not come from, and `counts.chargeItemsWithoutASourceFile` says how '
          + 'many lines that is.',
        parameters: [ENVELOPE],
        requestBody: jsonBody({ $ref: '#/components/schemas/FhirRequest' }),
        responses: {
          200: {
            description: 'An HL7 FHIR R4 Bundle of type collection, or the envelope when ?envelope=1.',
            content: { 'application/fhir+json': { schema: { $ref: '#/components/schemas/FhirBundle' } } },
          },
          ...errors(
            ['400', 'The body is not a list of known units or a story, or the coverage, state or locality is one we do not have a published figure rule for.'],
            ['429', 'Rate limit reached for this network this hour.'],
          ),
        },
      },
    },
    '/api/fhir/example': {
      get: {
        operationId: 'fhirExample', tags: ['interoperability'],
        summary: 'The demo journey, already converted.',
        description: 'The same sentence the landing page offers as an example, priced from the published table and returned as a FHIR R4 Bundle. ?envelope=1 adds what was left out of it and why. Cached for an hour.',
        parameters: [ENVELOPE],
        responses: {
          200: {
            description: 'An HL7 FHIR R4 Bundle of type collection.',
            content: { 'application/fhir+json': { schema: { $ref: '#/components/schemas/FhirBundle' } } },
          },
        },
      },
    },
    '/api/journeys': {
      post: {
        operationId: 'createJourney', tags: ['journeys'],
        summary: 'Save a journey and get a link back.',
        description: 'Anonymous unless a passkey session cookie is present, in which case the journey is bound to that account. Rate limit: 30 calls per network per hour.',
        requestBody: jsonBody({ $ref: '#/components/schemas/JourneyInput' }),
        responses: {
          200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, id: { type: 'string' }, slug: { type: 'string' }, url: { type: 'string', format: 'uri' }, savedTo: { type: 'string', enum: ['link', 'account'] }, deleteToken: { type: 'string', description: 'Returned for an anonymous save. Send it as x-delete-token to DELETE the journey without an account. Keep it; it is not recoverable.' }, expiresAt: { type: 'string', format: 'date-time' }, deleteWith: { type: 'string', description: 'The exact call that removes it, written out.' } } }),
          ...errors(['400', 'An entry names a unit of care that does not exist, or the count is out of range.'], ['429', 'Rate limit reached.']),
        },
      },
    },
    '/api/journeys/{id}': {
      get: {
        operationId: 'getJourney', tags: ['journeys'], summary: 'Read a shared journey.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'The share slug from POST /api/journeys. The journey id works here too.' }],
        responses: { 200: ok({ $ref: '#/components/schemas/Journey' }), ...errors(['404', 'No journey with that link.']) },
      },
      put: {
        operationId: 'updateJourney', tags: ['journeys'], summary: 'Replace the lines of a journey you own.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: jsonBody({ $ref: '#/components/schemas/JourneyInput' }),
        responses: { 200: ok({ $ref: '#/components/schemas/Journey' }), ...errors(['401', 'No passkey session.'], ['403', 'That journey belongs to another account.'], ['404', 'No journey with that id.']) },
      },
      delete: {
        operationId: 'deleteJourney', tags: ['journeys'],
        summary: 'Delete a journey — with the session that owns it, or with the delete token it was saved with.',
        description: 'A journey saved without an account is still the saver’s to remove, with no account and no sign-in: send the `deleteToken` returned by POST /api/journeys as the `x-delete-token` header, as `?token=`, or as `{"deleteToken":"…"}` in the body. The code is shown once and is not recoverable.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'x-delete-token', in: 'header', required: false, schema: { type: 'string' }, description: 'The delete code returned when the journey was saved anonymously.' },
          { name: 'token', in: 'query', required: false, schema: { type: 'string' }, description: 'The same delete code, for a caller that cannot set a header.' },
        ],
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, deleted: { type: 'string' }, by: { type: 'string', enum: ['delete-code', 'account'] } } }), ...errors(['401', 'The delete code is wrong or missing, and there is no session that owns this journey.'], ['403', 'That journey belongs to another account.'], ['404', 'No journey with that link: it never existed, it expired, or it is already gone.']) },
      },
    },
    '/api/register': {
      get: {
        operationId: 'register', tags: ['register'],
        summary: 'Every public count in one call.',
        description: 'The corrections aggregate, the gap aggregate, the burden-survey aggregate, the interview count, the published change log, and the first and last dates anything was received.',
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, corrections: { type: 'object' }, gap: { type: 'object' }, survey: { type: 'object' }, interviews: { type: 'object' }, changes: { type: 'array', items: { $ref: '#/components/schemas/Change' } }, firstAt: { type: ['string', 'null'] }, lastAt: { type: ['string', 'null'] }, generatedAt: { type: 'string' } } }) },
      },
    },
    '/api/corrections': {
      get: {
        operationId: 'getCorrections', tags: ['register'],
        summary: 'Counts of right and wrong per federal figure.',
        description: 'The optional note a person wrote is stored and is never served here.',
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, totals: { type: 'object', additionalProperties: { type: 'object', properties: { right: { type: 'integer' }, wrong: { type: 'integer' } } } }, fold: FOLD } }) },
      },
      post: {
        operationId: 'postCorrection', tags: ['register'],
        summary: 'Say a published figure is right or wrong for you.',
        parameters: [DRY],
        description: 'Bound to the exact source row so it can be routed to the agency that published the number. No name, no journey, no diagnosis, no IP address and no cookie are recorded. Rate limit: 20 per network per hour.',
        requestBody: jsonBody({
          type: 'object', required: ['priceId', 'verdict'],
          properties: {
            priceId: { type: 'string', example: 'cms-99213' },
            verdict: { type: 'string', enum: ['right', 'wrong'] },
            believedValueUsd: { type: ['number', 'null'], minimum: 0, description: 'Optionally, what you say it actually cost.' },
            note: { type: 'string', maxLength: 600, description: 'Held privately; never served publicly.' },
            priceTableVersion: { type: 'string' },
            journeyId: { type: 'string' },
          },
        }),
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, id: { type: 'string' } } }), ...errors(['400', 'Missing priceId or verdict.'], ['429', 'Rate limit reached.']) },
      },
    },
    '/api/gap': {
      get: {
        operationId: 'getGap', tags: ['register'], summary: 'The measured shape of what claims data cannot see.',
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, n: { type: 'integer' }, fold: FOLD }, additionalProperties: true }) },
      },
      post: {
        operationId: 'postGap', tags: ['register'], summary: 'Report care you needed and did not get.',
        parameters: [DRY],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            counts: { type: 'object', description: 'Whole numbers, keyed by category id.', additionalProperties: { type: 'integer', minimum: 0, maximum: 10000 } },
            ranking: { type: 'array', items: { type: 'string', enum: ['care-not-sought', 'care-denied', 'dismissed', 'wrong-track', 'time-searching', 'life-lost'] } },
            note: { type: 'string', maxLength: 400, description: 'Held privately; never served publicly.' },
            context: { type: 'object', properties: { ageBand: { type: 'string' }, insurance: { type: 'string' }, region: { type: 'string' }, urbanicity: { type: 'string' } } },
          },
        }),
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, id: { type: 'string' } } }), ...errors(['400', 'A report needs at least one count or one ranking.'], ['429', 'Rate limit reached.']) },
      },
    },
    '/api/survey': {
      get: {
        operationId: 'getSurvey', tags: ['register'],
        summary: 'The community’s ranking of which burden weighed most, with its N.',
        description: 'A weighting with a stated basis: the count, the mean rank of each burden, and the channel each response arrived on.',
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, n: { type: 'integer' }, fold: FOLD }, additionalProperties: true }) },
      },
      post: {
        operationId: 'postSurvey', tags: ['register'], summary: 'Rank the five burdens.',
        parameters: [DRY],
        requestBody: jsonBody({
          type: 'object', required: ['ranking', 'unasked', 'lead', 'decide'],
          properties: {
            ranking: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'string', enum: ['oop', 'time', 'work', 'unpaid', 'forgone'] }, description: 'All five, heaviest first.' },
            unasked: { type: 'string', description: 'A burden id, or "all-asked".' },
            lead: { type: 'string', enum: ['oop', 'time', 'work', 'unpaid', 'forgone'] },
            decide: { type: 'string', enum: ['patients', 'clinicians', 'researchers', 'reader'] },
            clinicians: { type: ['integer', 'null'], minimum: 0, maximum: 99 },
            context: { type: 'object', description: 'Optional self-description: age band, coverage, region, stage.' },
            sentence: { type: 'string', maxLength: 280, description: 'Held privately; never published word for word.' },
            channel: { type: 'string', pattern: '^[a-z0-9-]{1,24}$' },
            surveyVersion: { type: 'string' },
          },
        }),
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, id: { type: 'string' } } }), ...errors(['400', 'The ranking is incomplete or an answer is not one of the choices.'], ['429', 'Rate limit reached.']) },
      },
    },
    '/api/interview': {
      get: {
        operationId: 'getInterviews', tags: ['register'],
        summary: 'How many written interviews have been received. Nothing else, ever.',
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, n: { type: 'integer' }, firstAt: { type: ['string', 'null'] }, lastAt: { type: ['string', 'null'] }, consent: { type: 'object', additionalProperties: { type: 'integer' } }, fold: FOLD } }) },
      },
      post: {
        operationId: 'postInterview', tags: ['register'],
        summary: 'Send a written interview.',
        parameters: [DRY],
        description: 'Answers, name and email are encrypted at rest and are never served by any endpoint or included in any export.',
        requestBody: jsonBody({
          type: 'object', required: ['consent', 'answers'],
          properties: {
            consent: { type: 'string', enum: ['notes', 'quote-anonymously', 'quote-by-name'] },
            answers: { type: 'object', description: 'At least three of the published questions, keyed by question id.', additionalProperties: { type: 'string', maxLength: 3000 } },
            name: { type: 'string', maxLength: 80, description: 'Only when consent is quote-by-name.' },
            followUp: { type: 'boolean' },
            email: { type: 'string', format: 'email', description: 'Only when followUp is true.' },
            channel: { type: 'string', pattern: '^[a-z0-9-]{1,24}$' },
          },
        }),
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, id: { type: 'string' } } }), ...errors(['400', 'Fewer than three answers, or a consent choice that is not one of the three.'], ['429', 'Rate limit reached.']) },
      },
    },
    '/api/changes': {
      get: {
        operationId: 'getChanges', tags: ['register'],
        summary: 'The published change log: what someone said, and what changed because of it.',
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, changes: { type: 'array', items: { $ref: '#/components/schemas/Change' } } } }) },
      },
    },
    '/api/integrity': {
      get: {
        operationId: 'integrity', tags: ['register'],
        summary: 'The hash-chain head of every public count.',
        description:
          'Each accepted row of the register is hash-chained to the row before it over the fields listed in '
          + '`covers`, so a count cannot be edited afterwards without the published head changing. This '
          + 'returns the current head, the row count and the covered columns for each chain, plus the price '
          + 'table version the counts were recorded against. Anyone can recompute a chain from the CSV '
          + 'exports and compare it to the head published here.',
        responses: {
          200: ok({
            type: 'object',
            properties: {
              ok: { type: 'boolean' }, genesis: { type: 'string' }, priceTableVersion: { type: 'string' },
              publishedFigures: { type: 'integer' }, chains: { type: 'integer' },
              tables: { type: 'array', items: { type: 'object', properties: { table: { type: 'string' }, head: { type: 'string' }, rows: { type: 'integer' }, updatedAt: { type: 'string' }, covers: { type: 'array', items: { type: 'string' } }, unchainedLegacyRows: { type: 'integer' } } } },
            },
          }),
        },
      },
    },
    '/api/citation/{id}': {
      get: {
        operationId: 'citation', tags: ['register'],
        summary: 'One published figure, its provenance and what the public said about it.',
        description:
          'A correction is bound to one published federal row. This returns that row’s publisher, document, '
          + 'source URL, code, published value, basis, geography and population, together with how many people '
          + 'said the figure describes them and how many said it does not — so an analyst at the agency that '
          + 'published the number can act on it with no bundle, no join and no account. Add `?format=text` (or '
          + 'send `Accept: text/plain`) for the same block as plain text. A row nobody has spoken about still '
          + 'answers, with zero counts.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'cms-99213', description: 'The price-table row id. Every id is in /data/price-table.csv.' },
          { name: 'format', in: 'query', required: false, schema: { type: 'string', enum: ['text'] }, description: 'Return the citation block as text/plain instead of JSON.' },
        ],
        responses: {
          200: ok({ $ref: '#/components/schemas/Citation' }),
          ...errors(['404', 'No published figure has that identifier.'], ['503', 'The register could not be read; the provenance is still at /api/table/{id}.']),
        },
      },
    },
    '/data/locality-prices.csv': {
      get: {
        operationId: 'localityPricesCsv', tags: ['open data'],
        summary: 'Every CMS payment locality figure behind this tool, as CSV.',
        description:
          '5,123 rows: 47 CMS Physician Fee Schedule codes priced for each of the 109 Medicare payment '
          + 'localities. Each row carries the three RVU components, the three geographic practice cost indices, '
          + 'the conversion factor, the formula written out, the national figure, the audit verdict and the '
          + 'SHA256 of both CMS files it was derived from. Public domain (CC0 1.0). Column meanings are in '
          + '/data/locality-dictionary.csv.',
        responses: { 200: { description: 'The CSV file.', content: { 'text/csv': { schema: { type: 'string' } } } } },
      },
    },
    '/data/locality-prices.json': {
      get: {
        operationId: 'localityPricesJson', tags: ['open data'],
        summary: 'The same 5,123 figures as JSON, with the formula, the sources and the audit.',
        description:
          'The machine-readable form: the CMS formula, the conversion factor, both source files with their '
          + 'SHA256 and the date each was verified, the column dictionary, all 109 localities with their '
          + 'indices, and every figure with the inputs that produced it. Regenerate and re-audit it with '
          + '`node scripts/gen-locality-table.mjs`, which recomputes all 5,123 and exits non-zero on one cent '
          + 'of drift.',
        responses: { 200: ok({ type: 'object' }, 'The locality price table.') },
      },
    },
    '/data/price-table.csv': {
      get: {
        operationId: 'priceTableCsv', tags: ['open data'],
        summary: 'The whole national price table as CSV, with provenance and audit verdict.',
        description: 'One row per unit of care: the figure, its basis, year, population, coverage statement, combination rules, the federal file it came from and the audit verdict. Column meanings are in /data/price-dictionary.csv.',
        responses: { 200: { description: 'The CSV file.', content: { 'text/csv': { schema: { type: 'string' } } } } },
      },
    },
    '/api/export/{kind}.csv': {
      get: {
        operationId: 'exportCsv', tags: ['register'],
        summary: 'The de-identified register as CSV.',
        description: 'Free-text fields are never exported; interviews are never exported at all. Rows are oldest first. data/dictionary.csv describes every column.',
        parameters: [{ name: 'kind', in: 'path', required: true, schema: { type: 'string', enum: ['corrections', 'gap', 'survey'] } }],
        responses: { 200: { description: 'CSV.', content: { 'text/csv': { schema: { type: 'string' } } } }, ...errors(['404', 'Unknown export.']) },
      },
    },
    '/api/openapi.json': {
      get: { operationId: 'openapi', tags: ['pricing'], summary: 'This description.', responses: { 200: ok({ type: 'object' }) } },
    },
    '/api/auth/register/options': {
      post: {
        operationId: 'registerOptions', tags: ['account'], summary: 'Begin creating a passkey.',
        description: 'Returns WebAuthn creation options and a challenge id held for five minutes.',
        responses: { 200: ok({ type: 'object' }) },
      },
    },
    '/api/auth/register/verify': {
      post: {
        operationId: 'registerVerify', tags: ['account'], summary: 'Finish creating a passkey and start a session.',
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, user: { $ref: '#/components/schemas/User' } } }), ...errors(['400', 'The attestation did not verify.']) },
      },
    },
    '/api/auth/login/options': {
      post: { operationId: 'loginOptions', tags: ['account'], summary: 'Begin signing in with a passkey.', responses: { 200: ok({ type: 'object' }) } },
    },
    '/api/auth/login/verify': {
      post: {
        operationId: 'loginVerify', tags: ['account'], summary: 'Finish signing in; sets the session cookie.',
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, user: { $ref: '#/components/schemas/User' } } }), ...errors(['400', 'The assertion did not verify.']) },
      },
    },
    '/api/auth/logout': {
      post: { operationId: 'logout', tags: ['account'], summary: 'End the session and clear the cookie.', responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' } } }) } },
    },
    '/api/me': {
      get: { operationId: 'me', tags: ['account'], summary: 'Who the session belongs to, or null.', responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, user: { oneOf: [{ $ref: '#/components/schemas/User' }, { type: 'null' }] } } }) } },
      put: {
        operationId: 'setDisplayName', tags: ['account'], summary: 'Set a display name.',
        requestBody: jsonBody({ type: 'object', properties: { displayName: { type: 'string', maxLength: 40 } } }),
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, user: { $ref: '#/components/schemas/User' } } }), ...errors(['401', 'No session.']) },
      },
      delete: {
        operationId: 'deleteMe', tags: ['account'], summary: 'Erase the account and everything it owns.',
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' } } }), ...errors(['401', 'No session.']) },
      },
    },
    '/api/me/corrections': {
      get: {
        operationId: 'myCorrections', tags: ['account'],
        summary: 'The corrections this account has sent.',
        description: 'What you told us, read back to you — including the private note, which is served to nobody else, ever.',
        responses: {
          200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, n: { type: 'integer' }, corrections: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, priceId: { type: 'string' }, verdict: { type: 'string', enum: ['right', 'wrong'] }, believedUsd: { type: ['number', 'null'] }, note: { type: ['string', 'null'] }, tableVersion: { type: ['string', 'null'] }, receivedAt: { type: 'string' } } } } } }),
          ...errors(['401', 'No session.'], ['503', 'The register could not be read right now.']),
        },
      },
    },
    '/api/me/journeys': {
      get: {
        operationId: 'myJourneys', tags: ['account'], summary: 'The journeys saved to this account.',
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, journeys: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, slug: { type: 'string' }, title: { type: ['string', 'null'] }, updatedAt: { type: 'string' }, entryCount: { type: 'integer' } } } } } }), ...errors(['401', 'No session.']) },
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: 'object', required: ['ok', 'error'],
        properties: { ok: { type: 'boolean', const: false }, error: { type: 'string', description: 'A sentence a person could read, not a code.' } },
      },
      Locality: {
        type: ['object', 'null'],
        description: 'A CMS payment locality: the geography Medicare prices a service in, with the three geographic practice cost indices CMS publishes for it.',
        properties: {
          key: { type: 'string', description: 'State and CMS locality number, e.g. IA-00.' },
          name: { type: 'string' },
          state: { type: 'string' },
          stateName: { type: 'string' },
          mac: { type: 'string', description: 'The Medicare Administrative Contractor number CMS prices this locality under.' },
          workGpci: { type: 'number' },
          practiceExpenseGpci: { type: 'number' },
          malpracticeGpci: { type: 'number' },
        },
      },
      TableItem: {
        type: 'object',
        description: 'One unit of care and the published figure that prices it.',
        properties: {
          id: { type: 'string' }, label: { type: 'string' },
          synonyms: { type: 'array', items: { type: 'string' }, description: 'How a person actually says it. Drives the matcher.' },
          valueUsd: { type: ['number', 'null'], description: 'null means no published figure was found. Never guessed.' },
          outOfPocketUsd: { type: ['number', 'null'] },
          basis: { type: 'string', enum: ['charge', 'allowed', 'payment', 'out_of_pocket', 'total_expenditure', 'wage'] },
          attribution: { type: 'string', enum: ['gross', 'excess'] },
          year: { type: 'string' }, geography: { type: 'string' },
          population: { type: 'string', description: 'Who the figure describes.' },
          coverage: { type: 'string', description: 'Who is and is not covered by this figure, in plain words.' },
          sourceTitle: { type: 'string' }, sourceUrl: { type: 'string', format: 'uri' },
          confidence: { type: 'string', description: 'VERIFIED read from the file, DERIVED computed from stated inputs, REPORTED cited from a publication.' },
          code: { type: 'string' },
          rules: {
            type: 'object',
            properties: {
              summable: { type: 'boolean', description: 'false means this figure may never enter an itemized total.' },
              mutuallyExclusiveWith: { type: 'array', items: { type: 'string' } },
              bundlesAncillaries: { type: 'boolean', description: 'true means the figure already contains the labs and imaging of that visit.' },
            },
          },
        },
      },
      PriceRequest: {
        type: 'object',
        oneOf: [{ required: ['story'] }, { required: ['items'] }],
        properties: {
          story: { type: 'string', maxLength: 2000, example: 'saw my regular doctor three times, then a cardiologist, an echocardiogram and blood work twice' },
          items: {
            type: 'array', maxItems: 60,
            items: { type: 'object', properties: { itemId: { type: 'string' }, raw: { type: 'string', maxLength: 200 }, times: { type: 'integer', minimum: 1, maximum: 365 } } },
          },
          coverage: {
            type: 'string',
            enum: ['employer', 'marketplace', 'medicaid', 'medicare', 'uninsured', 'unsure'],
            description: 'What kind of coverage the person has. This decides whether a published figure describes them, and which published figure is shown. Omit it and every line comes back as a reference price.',
            example: 'uninsured',
          },
          state: {
            type: 'string', minLength: 2, maxLength: 2, example: 'IA',
            description: 'Two-letter postal abbreviation. Accepted where CMS prices the state as a single payment locality; where a state has more than one, the error names them and `locality` is required.',
          },
          locality: {
            type: 'string', example: 'TX-31',
            description: 'A CMS payment locality key, "state-locality" as CMS numbers them. All 109 are published at /data/locality-prices.json.',
          },
        },
      },
      ResolvedContext: {
        type: 'object',
        description: 'Who the caller said they are and where they live, as the server read it. Echoed back so a response is never ambiguous about what it was fitted to.',
        properties: {
          coverage: { type: ['string', 'null'], enum: ['employer', 'marketplace', 'medicaid', 'medicare', 'uninsured', 'unsure', null] },
          locality: {
            type: ['object', 'null'],
            properties: {
              key: { type: 'string', example: 'IA-00' }, name: { type: 'string', example: 'Iowa' },
              state: { type: 'string' }, stateName: { type: 'string' },
              mac: { type: 'string', description: 'The Medicare Administrative Contractor number that prices this locality.' },
              workGpci: { type: 'number' }, practiceExpenseGpci: { type: 'number' }, malpracticeGpci: { type: 'number' },
            },
          },
          localityFrom: { type: ['string', 'null'], enum: ['locality', 'state', null], description: 'Whether the caller named the locality or it is the only one in the state they named.' },
          figureBasis: { type: 'string', description: 'What every fee-schedule figure in this response is, in one sentence.' },
        },
      },
      SegmentFit: {
        type: 'object',
        description: 'Whether the published figure on this line describes this caller. The same verdict the ledger prints.',
        properties: {
          verdict: { type: 'string', enum: ['DESCRIBES YOU', 'REFERENCE PRICE', 'BILLED AGAINST THIS', 'NOT DESCRIBED'] },
          why: { type: 'string', description: 'One sentence written for the person, not a methodology note.' },
          figureUsd: { type: ['number', 'null'], description: 'The figure that describes this caller, or null when no published figure does. Null is a gap, never a zero.' },
          figureNote: { type: 'string' },
          which: { type: 'string', enum: ['schedule', 'locality', 'charge', 'none'] },
          offerGap: { type: 'boolean', description: 'true when the honest answer is that nothing published describes them here — the case to count, not to fill.' },
          lineTotalUsd: { type: ['number', 'null'] },
        },
      },
      LocalityRange: {
        type: 'object',
        description: 'What one service costs across every CMS payment locality, from CMS’s own formula.',
        properties: {
          nationalUsd: { type: 'number' },
          lowUsd: { type: 'number' }, lowLocalityKey: { type: 'string' }, lowLocalityName: { type: 'string' },
          highUsd: { type: 'number' }, highLocalityKey: { type: 'string' }, highLocalityName: { type: 'string' },
          localityCount: { type: 'integer' }, formula: { type: 'string' },
        },
      },
      FittedTotals: {
        type: 'object',
        description: 'The total of the lines a published figure actually describes, with what it is made of. Lines where nothing describes the caller are counted, never added as zero.',
        properties: {
          totalUsd: { type: ['number', 'null'], description: 'Null — never 0 — when no published figure describes this caller on any line. A zero would be read as a price.' },
          suppressedReason: { type: ['string', 'null'], description: 'Why there is no total, when there is none.' },
          describedCount: { type: 'integer' },
          notDescribedCount: { type: 'integer', description: 'Lines where nothing published describes the caller. Count them at /api/gap; do not fill them.' },
          figureKindsUsed: { type: 'array', items: { type: 'string', enum: ['schedule', 'locality', 'charge', 'none'] } },
          labels: { type: 'object', properties: { primary: { type: 'string' }, secondary: { type: ['string', 'null'] } } },
          verdicts: { type: 'array', items: { type: 'object', properties: { verdict: { type: 'string' }, lines: { type: 'integer' } } } },
          basisWarning: { type: ['string', 'null'] },
        },
      },
      Citation: {
        type: 'object',
        description: 'One published federal figure, its provenance, and what the public said about it — enough for the agency that published it to act without joining to anything of ours.',
        properties: {
          ok: { type: 'boolean' }, priceId: { type: 'string' }, countedAsOf: { type: 'string', format: 'date' },
          tableVersion: { type: 'string' },
          figure: { type: 'object', properties: { label: { type: 'string' }, code: { type: ['string', 'null'] }, publishedValueUsd: { type: ['number', 'null'] }, year: { type: 'string' }, basis: { type: 'string' }, basisMeaning: { type: 'string' }, geography: { type: 'string' }, population: { type: 'string' }, coverage: { type: 'string' }, confidence: { type: 'string' } } },
          publishedBy: { type: 'object', properties: { agency: { type: 'string' }, agencyFullName: { type: 'string' }, whatACorrectionHereIsAbout: { type: 'string' }, document: { type: 'string' }, sourceTitle: { type: 'string' }, sourceUrl: { type: 'string', format: 'uri' } } },
          publicSignal: { type: 'object', properties: { confirmedRight: { type: 'integer' }, flaggedWrong: { type: 'integer' }, n: { type: 'integer' }, fitRatePct: { type: ['integer', 'null'] }, publicMedianBelievedUsd: { type: ['number', 'null'] }, sample: { type: 'string' }, medianNote: { type: 'string' } } },
          text: { type: 'string', description: 'The whole block as plain text, ready to paste into a message.' },
          plainTextUrl: { type: 'string', format: 'uri' },
          methodUrl: { type: 'string', format: 'uri' },
        },
      },
      PriceSegment: {
        type: 'object',
        properties: {
          raw: { type: 'string' }, times: { type: 'integer' }, itemId: { type: 'string' }, label: { type: 'string' },
          matchedOn: { type: ['string', 'null'] }, matchScore: { type: 'number' },
          valueUsd: { type: 'number', description: 'The published figure for one unit.' },
          outOfPocketUsd: { type: ['number', 'null'] },
          lineTotalUsd: { type: 'number', description: 'valueUsd multiplied by times. The only arithmetic in the API.' },
          basis: { type: 'string' }, attribution: { type: 'string' }, year: { type: 'string' },
          geography: { type: 'string' }, population: { type: 'string' }, coverage: { type: 'string' },
          sourceTitle: { type: 'string' }, sourceUrl: { type: 'string', format: 'uri' },
          confidence: { type: 'string' }, code: { type: 'string' },
          summable: { type: 'boolean' },
          nationalUsd: { type: 'number', description: 'The published national figure, always present, so it is never confused with a locality amount.' },
          localityUsd: { type: ['number', 'null'], description: 'The amount for the CMS payment locality the caller named, or null where CMS publishes no locality figure for this code.' },
          localityName: { type: ['string', 'null'] },
          fit: { $ref: '#/components/schemas/SegmentFit' },
          localityRange: { oneOf: [{ $ref: '#/components/schemas/LocalityRange' }, { type: 'null' }] },
        },
      },
      PriceResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          input: { type: 'string', enum: ['story', 'items'] },
          segments: { type: 'array', items: { $ref: '#/components/schemas/PriceSegment' } },
          unpriced: {
            type: 'array',
            items: { type: 'object', properties: { raw: { type: 'string' }, kind: { type: 'string', enum: ['no-match', 'known-unpriceable'] }, reason: { type: 'string' }, unpriceableId: { type: 'string' }, whatWouldFixIt: { type: 'string' } } },
          },
          totals: { type: 'object', properties: { totalUsd: { type: 'number' }, outOfPocketUsd: { type: 'number' }, outOfPocketReported: { type: 'boolean' }, pricedCount: { type: 'integer' }, unpricedCount: { type: 'integer' }, basesUsed: { type: 'array', items: { type: 'string' } } } },
          basisWarning: { type: ['string', 'null'], description: 'Set when the total mixes measures that answer different questions.' },
          conflicts: { type: 'array', items: { type: 'object', properties: { keep: { type: 'string' }, drop: { type: 'string' }, reason: { type: 'string' } } } },
          nonSummable: { type: 'array', items: { type: 'string' } },
          excludedFromTotal: { type: 'array', items: { type: 'object', properties: { itemId: { type: 'string' }, reason: { type: 'string' } } } },
          bundlingNote: { type: ['string', 'null'] },
          tableVersion: { type: 'string' },
          method: { type: 'string' },
          context: { $ref: '#/components/schemas/ResolvedContext' },
          fitted: { $ref: '#/components/schemas/FittedTotals' },
        },
      },
      FhirRequest: {
        type: 'object',
        oneOf: [{ required: ['entries'] }, { required: ['story'] }],
        properties: {
          entries: {
            type: 'array', minItems: 1, maxItems: 60,
            description: 'The same entries POST /api/journeys takes.',
            items: { type: 'object', properties: { raw: { type: 'string', maxLength: 200 }, itemId: { type: ['string', 'null'] }, times: { type: 'integer', minimum: 1, maximum: 99 } } },
          },
          story: { type: 'string', maxLength: 2000, example: 'saw my regular doctor three times, then a cardiologist, an echo and a Holter, then the ER once when my heart was racing' },
          coverage: { type: 'string', enum: ['employer', 'marketplace', 'medicaid', 'medicare', 'uninsured', 'unsure'], description: 'Same meaning as on POST /api/price. Omit it and every ChargeItem carries the national published figure.' },
          state: { type: 'string', minLength: 2, maxLength: 2, example: 'IA' },
          locality: { type: 'string', example: 'TX-31' },
        },
      },
      FhirBundle: {
        type: 'object',
        description: 'An HL7 FHIR R4 Bundle. Validated against the official R4 JSON schema in tests/fhir.test.ts; the schema of record is hl7.org/fhir/R4/fhir.schema.json, not this summary.',
        properties: {
          resourceType: { type: 'string', const: 'Bundle' },
          type: { type: 'string', const: 'collection' },
          timestamp: { type: 'string', format: 'date-time' },
          meta: { type: 'object', description: 'Carries one tag: the price table version every figure in the bundle came from.' },
          entry: {
            type: 'array',
            items: { type: 'object', properties: { fullUrl: { type: 'string', example: 'urn:uuid:1f0f…' }, resource: { type: 'object', description: 'Encounter, Procedure, ChargeItem, DocumentReference or Provenance.' } } },
          },
        },
      },
      JourneyInput: {
        type: 'object', required: ['entries'],
        properties: {
          title: { type: 'string', maxLength: 120 },
          entries: {
            type: 'array', minItems: 1, maxItems: 60,
            items: { type: 'object', properties: { raw: { type: 'string', maxLength: 200 }, itemId: { type: ['string', 'null'] }, times: { type: 'integer', minimum: 1, maximum: 99 } } },
          },
        },
      },
      Journey: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' }, id: { type: 'string' }, slug: { type: 'string' }, title: { type: ['string', 'null'] },
          entries: { type: 'array', items: { type: 'object', properties: { raw: { type: 'string' }, itemId: { type: ['string', 'null'] }, times: { type: 'integer' } } } },
          tableVersion: { type: 'string' }, createdAt: { type: 'string' }, updatedAt: { type: 'string' },
        },
      },
      Change: {
        type: 'object',
        properties: { id: { type: 'string' }, date: { type: 'string', format: 'date' }, said: { type: 'string' }, changed: { type: 'string' }, who: { type: 'string' } },
      },
      User: { type: 'object', properties: { id: { type: 'string' }, displayName: { type: ['string', 'null'] } } },
    },
  },
};

export default OPENAPI;

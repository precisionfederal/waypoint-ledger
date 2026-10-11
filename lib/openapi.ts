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

import { COUNT_FIELD as CF, DEPRECATED_ALIAS as DA } from './count-fields';

/* JUDGE-4 #6: every count field says exactly what it counts, from ONE place
   (lib/count-fields.ts). A legacy name that means different numbers on
   different endpoints is marked deprecated and keeps its value. */
const INT = (description: string) => ({ type: 'integer', description });
const OLD = (description: string, nullable = false) => ({ type: nullable ? ['integer', 'null'] : 'integer', deprecated: true, description });
const SENDER_BASIS = { type: 'string', enum: ['senders', 'sends', 'none'], description: CF.senderBasis };
const DENOM = { type: 'string', description: 'The sentence that says what senders counts, as the server publishes it.' };
/* The survey and gap blocks, as /api/survey and /api/gap serve them and
   /api/register and /api/policy carry them. */
const SURVEY_COUNTS = (n: string) => ({ answers: INT(CF.answers), senders: INT(CF.senders), submissions: INT(CF.submissions), senderBasis: SENDER_BASIS, denominator: DENOM, n: OLD(n) });
const GAP_COUNTS = (respondents: string) => ({ reports: INT(CF.reports), senders: INT(CF.senders), submissions: INT(CF.submissions), senderBasis: SENDER_BASIS, denominator: DENOM, respondents: OLD(respondents) });
/* JUDGE-5 #7: every payload with an old name says which named field it equals. */
const ALIAS_MAP = { type: 'object', description: 'The deprecated names in this block, each mapped to the named field it equals: {alias: field}. payload[alias] is always payload[field].', additionalProperties: { type: 'string' } };
const CORRECTION_COUNTS = { sends: INT(CF.sends), browserFigurePairs: INT(CF.browserFigurePairs), senders: OLD(DA.correctionsSenders), figures: INT('Published figures that hold at least one correction.'), deprecated: ALIAS_MAP };
const TEAM_TESTS = INT('Rows marked as our own team testing the form, left out of every count here.');

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
  description: 'hit=true means this answer came from the folded snapshot; rows is how many rows are folded into it; foldedAt is the day the fold was written (UTC), never the time.',
  properties: { hit: { type: 'boolean' }, rows: { type: 'integer' }, foldedAt: { type: ['string', 'null'], description: 'The day the fold was written, as YYYY-MM-DDT00:00:00 with no zone. Not a time: every clock field is 00:00:00.', example: '2026-10-01T00:00:00' } },
};
/* Survey and gap answers are published as the day they arrived, never the time
   (cf/functions/api/_cells.js publicDates). firstAt/lastAt keep their names so an
   older client still parses them; firstOn/lastOn carry the plain date. */
const DAY_STAMP = { type: 'string', description: 'The UTC day, as YYYY-MM-DDT00:00:00 with no zone. Never the time.', example: '2026-10-01T00:00:00' };
const DAY = { type: 'string', format: 'date', description: 'The UTC day, YYYY-MM-DD.', example: '2026-10-01' };
const DAY_FIELDS = { firstAt: DAY_STAMP, lastAt: DAY_STAMP, firstOn: DAY, lastOn: DAY };
/* Small cells never leave the server (cf/functions/api/_cells.js). Every
   breakdown of who answered is a {value: count} map in which any value held by
   fewer than smallCellMin answers is folded into ONE key, "fewer than 11, not
   shown", holding their total, so no small value is named and the map still sums
   to the whole. "not stated" is always published as is. */
const COVERAGE = {
  type: 'object',
  description: 'Who answered, one {value: count} map per self-description field. A value held by fewer than smallCellMin answers is never named: all such values are counted together under the key "fewer than 11, not shown". "not stated" is always shown. Each map sums to the whole.',
  additionalProperties: { type: 'object', additionalProperties: { type: 'integer' } },
};
const COVERAGE_WITHHELD = {
  type: 'object',
  description: 'For each field in coverage: how many values were folded into "fewer than 11, not shown" (cells), how many answers they hold between them (responses), and the threshold applied (min).',
  additionalProperties: { type: 'object', properties: { cells: { type: 'integer' }, responses: { type: 'integer' }, min: { type: 'integer' } } },
};
const SMALL_CELL = { type: 'integer', description: 'The small-cell threshold: a breakdown value held by fewer answers than this is not shown.', example: 11 };
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
      + '/data/price-table.csv, all 5,668 CMS locality figures at /data/locality-prices.csv, and the '
      + 'instrument dictionary at /data/dictionary.csv. To stand this up for another condition, state or '
      + 'population, /adopt names the files to edit.\n\n'
      + 'Licences (NOTICE.txt says which covers what): the code is Apache-2.0 (LICENSE.txt); the data, '
      + 'meaning every figure, every published file under /data/ and every CSV and JSON this API returns, '
      + 'is CC0 1.0, public domain (https://creativecommons.org/publicdomain/zero/1.0/).',
    contact: { name: 'Precision Federal', url: 'https://precisionfederal.com/contact' },
    /* FLOW adopter-5: the licence field names the code's licence, as LICENSE.txt does;
       NOTICE.txt section 2 dedicates the data to the public domain, said in the description. */
    license: {
      name: 'Apache License 2.0 (code); data CC0 1.0',
      url: 'https://www.apache.org/licenses/LICENSE-2.0',
      identifier: 'Apache-2.0',
    },
  },
  servers: [
    { url: 'https://waypointledger.org', description: 'Production' },
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
        description: 'Each row carries the national figure, this locality’s allowed amount, and the three products CMS’s own formula multiplies (relative value unit by geographic index), so the number can be re-derived without this API.',
        parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' }, example: 'IA-00' }],
        responses: {
          200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, version: { type: 'string' }, locality: { $ref: '#/components/schemas/Locality' }, count: { type: 'integer' }, items: { type: 'array', items: { type: 'object' } } } }),
          ...errors(['404', 'No locality with that key. The sentence names the format and points at the index.']),
        },
      },
    },
    '/api/private-rates/{code}': {
      get: {
        operationId: 'getPrivateRates', tags: ['open data'],
        summary: 'Hospital-published negotiated rates for one code (45 CFR 180), with every hospital and file hash.',
        description:
          'What commercial plans negotiated for one CPT or HCPCS code at the hospitals whose price-transparency files '
          + 'we read. These rates are required by the federal hospital price transparency rule (45 CFR 180) and printed by '
          + 'the hospitals; they are not federal figures, not national or typical prices, and never added to a ledger total. '
          + 'Per billing class (professional, facility, not stated): the lowest, median and highest distinct negotiated '
          + 'dollar amount, how many distinct rates, and how many hospitals, plus each hospital with its file URL, sha256 '
          + 'and the date it was read. A class with rates from fewer than two hospitals has `shownAsRange: false`. '
          + 'Percentage-of-charge, per-diem and algorithm-only rates are counted in `notInSpread`, never converted. '
          + 'Every row carries the payer and plan as the hospital wrote them and the file row; `?rows=0` leaves the rows out.',
        parameters: [
          { name: 'code', in: 'path', required: true, schema: { type: 'string', pattern: '^[A-Za-z0-9]{5}$' }, example: '99213' },
          { name: 'rows', in: 'query', required: false, schema: { type: 'string', enum: ['0', '1'] }, description: '0 leaves the per-rate rows out.' },
        ],
        responses: {
          200: ok({ type: 'object', properties: {
            ok: { type: 'boolean' }, code: { type: 'string' }, codeType: { type: 'string' },
            label: { type: 'string' }, notFederal: { type: 'string' }, rule: { type: 'string' }, spreadRule: { type: 'string' },
            groups: { type: 'object', additionalProperties: { type: 'object' } },
            notInSpread: { type: 'object', additionalProperties: { type: 'integer' } },
            rows: { type: 'array', items: { type: 'object' } },
          } }),
          ...errors(['400', 'Not a five-character CPT or HCPCS code.'], ['404', 'No hospital file we read gives a qualifying rate for that code.']),
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
          + 'come back in `unpriced` with the reason. Rate limit: 300 calls per network per hour. The answer is readable from any origin (access-control-allow-origin: *), so a browser app on another site can call it.\n\n'
          + 'Add `coverage` and `locality` (or `state`) and the response carries the same answer the site '
          + 'shows that person: `segments[].fit` says whether the published figure describes them, '
          + '`segments[].localityUsd` is the amount for their CMS payment locality, '
          + '`segments[].localityRange` is what that service costs from the cheapest locality to the '
          + 'dearest, and `fitted` totals only the lines a published figure actually describes. An unknown '
          + 'coverage, state or locality is a 400 with a sentence. The national figure is never returned '
          + 'in place of a value we were asked for and could not honour.',
        requestBody: jsonBody({ $ref: '#/components/schemas/PriceRequest' }),
        responses: {
          200: ok({ $ref: '#/components/schemas/PriceResponse' }),
          ...errors(['400', 'The body is not a story or a list of known units.'], ['429', 'Rate limit reached for this network this hour.']),
        },
      },
    },
    '/api/map': {
      post: {
        operationId: 'mapStory', tags: ['pricing'],
        summary: 'AI reads a story into units of care; the published table prices them.',
        description:
          'Send `story`. The deterministic rules (the same lib/mapper the browser runs) read it first, on our server. '
          + 'Only the phrases they cannot place go on to a model: each one on its own, with at most four words from the '
          + 'phrase just before it and four from the phrase just after it, plus the catalog\'s ids, labels and synonyms. '
          + 'Never the rest of the story, never a phrase the rules placed, never a price. The model may answer with a '
          + 'catalog id or null, never a figure. Care that was not received and spans of time are decided by the rules '
          + 'and are never sent to the model. The model is chosen by which key a deployment holds: OpenAI (gpt-5.6-luna, '
          + 'then gpt-5.5, then gpt-5.4-mini, each only if the one before it errors) on waypointledger.org; otherwise Anthropic; otherwise Cloudflare '
          + 'Workers AI. The reply carries ids and labels; price them with POST /api/price or '
          + 'the public table. `model` names the model that answered, or null when none was reachable and the rules\' '
          + 'answer stands. Cached by the story\'s SHA-256 for 24 hours. Add `?debug=1` to see exactly what was sent: '
          + '`asked` lists each phrase with its `before` and `after` words, and `sent` is the phrases block itself.',
        parameters: [{ name: 'debug', in: 'query', required: false, schema: { type: 'string', enum: ['1'] }, description: 'Add asked[] {phrase, before, after}, sent (the phrases block) and modelText to the reply. Never served from the cache.' }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['story'], properties: { story: { type: 'string', maxLength: 2000 } } } } } },
        responses: { '200': { description: 'ok, cached, tableVersion, model, filled, refused, segments[] {raw, times, countNote, itemId, label, confidence, reason, gapCategory, months, source (rules|model), why}; with ?debug=1 also asked, sent and modelText' }, '400': { description: 'no story' }, '429': { description: 'rate limited' } },
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
          + 'was billed, paid or denied. The figure is a published federal reference price, not a bill.\n\n'
          + 'Add `coverage` and `state` or `locality` and each ChargeItem carries the figure this site would '
          + 'show that person; a line nothing published describes keeps its Procedure and gets no ChargeItem, '
          + 'which is a blank rather than a zero. `?envelope=1` wraps the bundle with what was deliberately '
          + 'left out of it: `omitted` (wages, mileage, whole-year survey figures and words that matched no '
          + 'unit of care) and `codes` (the CMS Ambulatory Payment Classification, which has no FHIR code '
          + 'system URI, so it is never coded inside the bundle). Rate limit: 300 calls per network per hour. The answer is readable from any origin.\n\n'
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
        summary: 'The example journey, already converted.',
        description: 'The example sentence the journey builder (/journey) offers in its empty box, priced from the published table and returned as a FHIR R4 Bundle. ?envelope=1 adds what was left out of it and why. Cached for an hour.',
        parameters: [ENVELOPE],
        responses: {
          200: {
            description: 'An HL7 FHIR R4 Bundle of type collection.',
            content: { 'application/fhir+json': { schema: { $ref: '#/components/schemas/FhirBundle' } } },
          },
        },
      },
    },
    '/fhir/StructureDefinition/{id}': {
      get: {
        operationId: 'fhirStructureDefinition', tags: ['interoperability'],
        summary: 'A FHIR StructureDefinition this site names, served at its own canonical URL.',
        description: 'Published: `cms-apc`, the CMS Ambulatory Payment Classification extension. It is marked retired: bundles '
          + 'no longer carry it (the APC is in the envelope `codes[]` and in the ChargeItem\'s overrideReason), and it stays '
          + 'here so a bundle downloaded before that change still resolves. A `.json` suffix is accepted. An unknown id is a 404 OperationOutcome.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'cms-apc' }],
        responses: {
          200: { description: 'The StructureDefinition.', content: { 'application/fhir+json': { schema: { type: 'object' } } } },
          404: { description: 'An OperationOutcome naming the ids that are published.', content: { 'application/fhir+json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/fhir/CodeSystem/{id}': {
      get: {
        operationId: 'fhirCodeSystem', tags: ['interoperability'],
        summary: 'A FHIR CodeSystem this site names, served at its own canonical URL.',
        description: 'Published: `price-table-version`, the code system of the price-table version every bundle carries in `Bundle.meta.tag`. '
          + 'A `.json` suffix is accepted. An unknown id is a 404 OperationOutcome.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'price-table-version' }],
        responses: {
          200: { description: 'The CodeSystem.', content: { 'application/fhir+json': { schema: { type: 'object' } } } },
          404: { description: 'An OperationOutcome naming the ids that are published.', content: { 'application/fhir+json': { schema: { type: 'object' } } } },
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
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'The share slug from POST /api/journeys. The row id opens it only for the signed-in account that owns it.' }],
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
        summary: 'Delete a journey, with the session that owns it, or with the delete token it was saved with.',
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
        description: 'The corrections aggregate, the gap aggregate, the burden-survey aggregate, the interview count, the published change log, and the first and last dates anything was received. The gap and survey blocks are exactly what GET /api/gap and GET /api/survey serve: small cells already folded into "fewer than 11, not shown", with coverageWithheld and smallCellMin beside them, and their dates as the day only (firstOn/lastOn). The top-level firstAt/lastAt are the earliest and latest of the four blocks\' own dates.',
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' },
          corrections: { type: 'object', description: 'As GET /api/corrections.', properties: { ...CORRECTION_COUNTS, teamTests: TEAM_TESTS }, additionalProperties: true },
          gap: { type: 'object', description: 'As GET /api/gap. respondents is the deprecated alias of reports here and there; deprecated names it.', properties: { ...GAP_COUNTS(DA.respondentsIsReports), teamTests: TEAM_TESTS, deprecated: ALIAS_MAP }, additionalProperties: true },
          survey: { type: 'object', description: 'As GET /api/survey. n is the deprecated alias of answers here and there; deprecated names it.', properties: { ...SURVEY_COUNTS(DA.nIsAnswers), teamTests: TEAM_TESTS, deprecated: ALIAS_MAP }, additionalProperties: true },
          interviews: { type: 'object', description: 'As GET /api/interview.', properties: { n: INT(CF.interviews), senders: INT(CF.senders), senderBasis: SENDER_BASIS, denominator: DENOM, teamTests: TEAM_TESTS }, additionalProperties: true },
          changes: { type: 'array', items: { $ref: '#/components/schemas/Change' } }, firstAt: { type: ['string', 'null'] }, lastAt: { type: ['string', 'null'] }, generatedAt: { type: 'string' } } }) },
      },
    },
    '/api/corrections': {
      get: {
        operationId: 'getCorrections', tags: ['register'],
        summary: 'Counts of right and wrong per federal figure.',
        description: 'The optional note a person wrote is stored and is never served here.',
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, ...CORRECTION_COUNTS, teamTests: TEAM_TESTS, summary: { type: 'array', items: { type: 'object', properties: { priceId: { type: 'string' }, confirmedRight: INT('Corrections that said this figure fits.'), flaggedWrong: INT('Corrections that said this figure does not fit.'), publicMedianBelievedUsd: { type: ['number', 'null'] } } } }, totals: { type: 'object', description: 'Present only when there are no corrections yet: an empty object.', additionalProperties: { type: 'object' } }, fold: FOLD }, additionalProperties: true }) },
      },
      post: {
        operationId: 'postCorrection', tags: ['register'],
        summary: 'Say a published figure is right or wrong for you.',
        parameters: [DRY],
        description: 'Bound to the exact source row so it can be routed to the agency that published the number. No name, no journey, no diagnosis, no IP address and no cookie are recorded. Rate limit: 300 per network per hour, and at most 3 an hour and 8 a day on any one figure from one network.',
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
        description: 'Counts and rankings exactly as reported. Who reported (age band, insurance, region, urbanicity) is published only as counts, and any value held by fewer than smallCellMin reports is folded into "fewer than 11, not shown" on the server, never named. Dates are the day, never the time.',
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, ...GAP_COUNTS(DA.respondentsIsReports), teamTests: TEAM_TESTS, deprecated: ALIAS_MAP, ...DAY_FIELDS, gap: { type: 'array', items: { type: 'object' } }, communityWeights: { type: 'array', items: { type: 'object' } }, coverage: COVERAGE, coverageWithheld: COVERAGE_WITHHELD, smallCellMin: SMALL_CELL, method: { type: 'string' }, fold: FOLD }, additionalProperties: true }) },
      },
      post: {
        operationId: 'postGap', tags: ['register'], summary: 'Report care you needed and did not get.',
        parameters: [DRY],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            counts: { type: 'object', description: 'Whole numbers, keyed by category id.', additionalProperties: { type: 'integer', minimum: 0, maximum: 10000 } },
            ranking: { type: 'array', items: { type: 'string', enum: ['care-not-sought', 'care-denied', 'dismissed', 'wrong-track', 'time-searching', 'life-lost', 'care-made-worse'] } },
            note: { type: 'string', maxLength: 400, description: 'Held privately; never served publicly.' },
            context: { type: 'object', properties: { ageBand: { type: 'string' }, insurance: { type: 'string' }, region: { type: 'string' }, urbanicity: { type: 'string' } } },
            idempotencyKey: { type: 'string', pattern: '^[A-Za-z0-9._:-]{8,80}$', description: 'Optional. A report sent again with the same key within a day is answered duplicate: true and not recorded. Kept hashed outside the row; never published.' },
          },
        }),
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, id: { type: 'string' }, duplicate: { type: 'boolean', description: 'True when this key was already counted; nothing was added.' } } }), ...errors(['400', 'A report needs at least one count or one ranking.'], ['429', 'Rate limit reached.']) },
      },
    },
    '/api/survey': {
      get: {
        operationId: 'getSurvey', tags: ['register'],
        summary: 'The community’s ranking of which burden weighed most, with its N.',
        description: 'A weighting with a stated basis: the count, the mean rank of each burden, and the channel each response arrived on. '
          + 'Every self-description (age band, sex, coverage, region, state, stage, who answered, ages at onset and diagnosis) is published only as counts in `coverage`, '
          + 'and any value held by fewer than smallCellMin answers is folded into "fewer than 11, not shown" on the server, never named. '
          + '`rankingBySex` and `rankingByStratum` serve a group only at smallCellMin answers or more, and say how many groups and answers were withheld. Dates are the day, never the time.',
        responses: { 200: ok({ type: 'object', properties: {
          ok: { type: 'boolean' }, ...SURVEY_COUNTS(DA.nIsAnswers), teamTests: TEAM_TESTS, deprecated: ALIAS_MAP, ...DAY_FIELDS,
          coverage: COVERAGE, coverageWithheld: COVERAGE_WITHHELD, smallCellMin: SMALL_CELL,
          headline: { type: 'object', description: "What the headline counts: ranking, unasked, lead, decide, clinicians and rankingBySex are computed from answers about the person's own illness; a parent's answers about a child are read only in rankingByStratum. n here is how many answers that is; the top-level n is every answer.", properties: { n: { type: 'integer' }, of: { type: 'string' }, method: { type: 'string' } } },
          rankingByStratum: { type: 'object', description: 'counts holds only strata with smallCellMin answers or more (and "onset-not-stated", always); groups ranks those; withheldGroups and withheldResponses say what was left out.', properties: { min: { type: 'integer' }, counts: { type: 'object', additionalProperties: { type: 'integer' } }, groups: { type: 'array', items: { type: 'object' } }, withheldGroups: { type: 'integer' }, withheldResponses: { type: 'integer' }, method: { type: 'string' } } },
          fold: FOLD,
        }, additionalProperties: true }) },
      },
      post: {
        operationId: 'postSurvey', tags: ['register'], summary: 'Rank the five burdens.',
        description: 'Rate limit: a flood guard of 300 per network per hour and no daily cap, so a person or a clinic on one network is never refused. A 429 says when to try again and carries retry-after. Writes from another website are refused (403); calls with no Origin header, such as curl, are accepted.',
        parameters: [DRY],
        requestBody: jsonBody({
          type: 'object', required: ['ranking', 'unasked', 'lead', 'decide'],
          properties: {
            ranking: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'string', enum: ['oop', 'time', 'work', 'unpaid', 'forgone'] }, description: 'All five, heaviest first.' },
            unasked: { type: 'string', description: 'A burden id, or "all-asked".' },
            lead: { type: 'string', enum: ['oop', 'time', 'work', 'unpaid', 'forgone'] },
            decide: { type: 'string', enum: ['patients', 'clinicians', 'researchers', 'reader'] },
            clinicians: { type: ['integer', 'null'], minimum: 0, maximum: 99 },
            context: { type: 'object', description: 'Optional self-description: age band, sex, coverage, region, state, stage; from instrument version 2026-10-01.1 also respondent (the person, or a parent or caregiver answering for a child), onset_age and diagnosis_age. A field is accepted only on the instrument version that asked it. Published only as counts at GET /api/survey, with any value under 11 answers not shown; never in the CSV export.' },
            sentence: { type: 'string', maxLength: 280, description: 'Held privately; never published word for word.' },
            channel: { type: 'string', pattern: '^[a-z0-9-]{1,24}$' },
            surveyVersion: { type: 'string' },
          },
        }),
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, id: { type: 'string' } } }), ...errors(['400', 'The ranking is incomplete or an answer is not one of the choices.'], ['429', 'Rate limit reached.']) },
      },
    },
    '/api/survey/channel': {
      get: {
        operationId: 'getSurveyChannel', tags: ['register'],
        summary: 'The answers that came in through one survey link (?c=), under the small-cell rule.',
        description: 'For a patient organization or clinic that shares /survey?c=<slug>. No answers: answers is 0. One to ten answers: answers is null and withheld is true, with no dates and no ranking. '
          + 'From smallCellMin answers on: answers, the first and last day (never the time), and the ranking, lead and unasked counts, computed by the same function as GET /api/survey. '
          + 'Nothing anyone said about themselves is served per link, because a second breakdown narrows the group twice. Anyone who has the link can answer through it.',
        parameters: [{ name: 'c', in: 'query', required: true, schema: { type: 'string' }, example: 'your-org', description: 'The link label. Read the way the survey reads it: lowercased, anything else turned into a hyphen, 24 characters at most.' }],
        responses: { 200: ok({ type: 'object', properties: {
          ok: { type: 'boolean' }, channel: { type: 'string' }, answers: { type: ['integer', 'null'], description: CF.channelAnswers }, n: OLD(DA.nIsAnswers, true), deprecated: ALIAS_MAP, withheld: { type: 'boolean' },
          firstOn: { type: 'string' }, lastOn: { type: 'string' }, smallCellMin: SMALL_CELL,
          ranking: { type: 'array', items: { type: 'object' } }, lead: { type: 'object', additionalProperties: { type: 'integer' } }, unasked: { type: 'object', additionalProperties: { type: 'integer' } },
        }, additionalProperties: true }), ...errors(['400', 'No link label, or one that cannot be read.'], ['503', 'The database could not be read.']) },
      },
    },
    '/api/interview': {
      get: {
        operationId: 'getInterviews', tags: ['register'],
        summary: 'How many written interviews have been received. Nothing else, ever.',
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, n: INT(CF.interviews), senders: INT(CF.senders), senderBasis: SENDER_BASIS, denominator: DENOM, teamTests: TEAM_TESTS, firstAt: { type: ['string', 'null'] }, lastAt: { type: ['string', 'null'] }, consent: { type: 'object', additionalProperties: { type: 'integer' } }, fold: FOLD } }) },
      },
      post: {
        operationId: 'postInterview', tags: ['register'],
        summary: 'Send a written interview.',
        parameters: [DRY],
        description: 'Answers, name and email are encrypted at rest and are never served by any endpoint or included in any export. At least three answers of a sentence or more are needed. Rate limit: 5 per network per hour and 10 per day. Writes from another website are refused (403); calls with no Origin header, such as curl, are accepted.',
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
    '/api/annotations': {
      get: {
        operationId: 'getAnnotations', tags: ['register'],
        summary: 'Every row we marked as our own team testing the form, by row_hash. Marked rows stay in the chain and the CSV, and are left out of every count.',
        description: 'Deleting a test row would break the integrity chain, so it is marked instead (migration 0007, append-only). Each aggregate reports how many rows it left out as teamTests, each CSV carries team_test, and /api/integrity reports teamTestRows per table while still walking every row.',
        responses: { 200: ok({ type: 'object', properties: {
          ok: { type: 'boolean' }, n: { type: 'integer' }, method: { type: 'string' },
          annotations: { type: 'array', items: { type: 'object', properties: {
            table: { type: 'string', enum: ['corrections', 'gap_reports', 'survey_responses', 'interviews'] },
            rowHash: { type: 'string' }, kind: { type: 'string', enum: ['team-test'] }, on: { type: 'string' },
          } } },
        } }) },
      },
    },
    '/api/use': {
      get: {
        operationId: 'getUse', tags: ['register'],
        summary: 'Counts of actions by week since counting began: counts of actions, never of who took them.',
        description: 'One number per day per action (a story read, a ledger opened, priced, saved or exported, a sheet printed, a correction, a gap report, a survey answer, an interview), folded into weeks that start on Monday (UTC). '
          + 'No cookie, address, identifier or anything anyone typed is kept. Requests from our own tests (they send x-waypoint-synthetic) and from known bots are counted apart and reported only as leftOut; calls from programs rather than a browser are in programs.',
        responses: { 200: ok({ type: 'object', properties: {
          ok: { type: 'boolean' }, since: { type: ['string', 'null'] }, asOf: { type: 'string' }, unit: { type: 'string' },
          actions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' }, how: { type: 'string' } } } },
          weeks: { type: 'array', items: { type: 'object', properties: { weekStart: { type: 'string' }, counts: { type: 'object', additionalProperties: { type: 'integer' } } } } },
          totals: { type: 'object', additionalProperties: { type: 'integer' } }, total: { type: 'integer' },
          programs: { type: 'object', additionalProperties: { type: 'integer' } }, programTotal: { type: 'integer' },
          leftOut: { type: 'object', properties: { synthetic: { type: 'integer' }, bot: { type: 'integer' } } },
        }, additionalProperties: true }), ...errors(['503', 'The counts could not be read. They are unread, not zero.']) },
      },
      post: {
        operationId: 'countUse', tags: ['register'],
        summary: 'The browser reports one action it does on its own. No body is read.',
        description: 'Only ledger, sheet, fhir and export are accepted, as ?a=. Nothing but that word arrives; the answer is { ok: true, counted }.',
        parameters: [{ name: 'a', in: 'query', required: true, schema: { type: 'string', enum: ['ledger', 'sheet', 'fhir', 'export'] } }, DRY],
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, counted: { type: 'string' } } }), ...errors(['400', 'Not one of the four actions.'], ['429', 'Rate limit reached.']) },
      },
    },
    '/api/policy': {
      get: {
        operationId: 'getPolicy', tags: ['register'],
        summary: 'The policy view: burden figures per condition, the burden ranking, and corrections rolled up by agency and fee schedule.',
        description: 'The numbers /policy prints. A rollup cell holding fewer than smallCellMin corrections is withheld whole on the server (counts and dates) and counted in one line, so the published cells still add up to N. No dollar figure is produced: each condition figure is a price-table row. Cached five minutes.',
        responses: { 200: ok({ type: 'object', properties: { ok: { type: 'boolean' }, generatedOn: { type: 'string' }, smallCellMin: SMALL_CELL, conditions: { type: 'object' },
          uncounted: { type: 'object', properties: {
            survey: { type: 'object', description: 'The survey ranking. n is the deprecated alias of answers here, as on /api/survey and /api/register; deprecated names it. The ranking is computed over rankedAnswers, the answers about the person\'s own illness (headline.n on /api/survey); answers is every answer.', properties: { ...SURVEY_COUNTS(DA.nIsAnswers), deprecated: ALIAS_MAP, rankedAnswers: { type: ['integer', 'null'], description: "How many answers the ranking is computed over: the answers about the person's own illness, the same count as headline.n on GET /api/survey. Null when the aggregate does not say." }, rankedAnswersOf: { type: ['string', 'null'], description: 'What rankedAnswers counts, in the words the register prints.' } }, additionalProperties: true },
            gap: { type: 'object', description: 'Uncounted care. respondents is the deprecated alias of reports here, as on /api/gap and /api/register; deprecated names it.', properties: { ...GAP_COUNTS(DA.respondentsIsReports), deprecated: ALIAS_MAP }, additionalProperties: true },
          }, additionalProperties: true },
          disputes: { type: 'object', description: 'Corrections rolled up by agency and fee schedule. Each cell carries sends, browserFigurePairs and the deprecated senders under the same definitions.', properties: { sends: INT(CF.sends), browserFigurePairs: INT(CF.browserFigurePairs), senders: OLD(DA.correctionsSenders), deprecated: ALIAS_MAP }, additionalProperties: true },
          agencies: { type: 'array', items: { type: 'object' } }, levers: { type: 'array', items: { type: 'object' } } }, additionalProperties: true }), ...errors(['503', 'The policy view could not be read. It is unread, not zero.']) },
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
          + 'table version the counts were recorded against. `inCsv` says what a stranger can do with each '
          + 'export: corrections.csv carries every covered field, so every row_hash can be recomputed from the '
          + 'file alone (check `recompute`). survey.csv and gap.csv publish the day, not the time, and survey.csv '
          + 'leaves out every self-description, so on those two files a stranger checks the links (check `links`): '
          + 'the first prev_hash is 64 zeros, each prev_hash equals the row_hash above it, and the last row_hash and '
          + 'the row count match the head here. `?verify=1` walks every chain over the stored rows on our side. '
          + 'The chain itself was never rewritten.',
        parameters: [{ name: 'verify', in: 'query', required: false, schema: { type: 'string', enum: ['1'] }, description: 'Recompute every chain over the stored rows and add verified {ok, walked, recomputedHead, brokeAt, reason} to each table.' }],
        responses: {
          200: ok({
            type: 'object',
            properties: {
              ok: { type: 'boolean' }, genesis: { type: 'string' }, priceTableVersion: { type: 'string' },
              publishedFigures: { type: 'integer' }, chains: { type: 'integer' },
              tables: { type: 'array', items: { type: 'object', properties: {
                table: { type: 'string' }, head: { type: 'string' }, rows: { type: 'integer' },
                updatedAt: { ...DAY_STAMP, description: 'The day the head last moved, as YYYY-MM-DDT00:00:00 with no zone. Never the time.' },
                updatedOn: { ...DAY, description: 'The same day, YYYY-MM-DD.' },
                covers: { type: 'array', items: { type: 'string' } },
                inCsv: { type: ['object', 'null'], description: 'What the CSV export lets a stranger check. null for interviews, which are never exported.', properties: { file: { type: 'string' }, check: { type: 'string', enum: ['recompute', 'links'] }, withheld: { type: 'array', items: { type: 'string' }, description: 'Covered fields the file leaves out on purpose.' } } },
                unchainedLegacyRows: { type: 'integer' },
              } } },
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
          + 'said the figure describes them and how many said it does not, so an analyst at the agency that '
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
          '5,668 rows: 52 CMS Physician Fee Schedule codes priced for each of the 109 Medicare payment '
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
        summary: 'The same 5,668 figures as JSON, with the formula, the sources and the audit.',
        description:
          'The machine-readable form: the CMS formula, the conversion factor, both source files with their '
          + 'SHA256 and the date each was verified, the column dictionary, all 109 localities with their '
          + 'indices, and every figure with the inputs that produced it. Regenerate and re-audit it with '
          + '`node scripts/gen-locality-table.mjs`, which recomputes all 5,668 and exits non-zero on one cent '
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
        description: 'Free-text fields are never exported; interviews are never exported at all. Rows are oldest first. data/dictionary.csv describes every column. kind=corrections returns the same bytes as /api/export/corrections.csv.\n\n'
          + 'survey.csv columns: received_on, channel, rank_1…rank_5, unasked, lead, decide, clinicians, survey_version, prev_hash, row_hash. '
          + 'No self-description and no time of day: received_on is the UTC day; who answered is published only as counts at GET /api/survey.\n\n'
          + 'gap.csv columns: received_on, care-not-sought, care-denied, dismissed, wrong-track, time-searching, life-lost, care-made-worse, rank_1…rank_7, table_version, prev_hash, row_hash.\n\n'
          + 'On survey.csv and gap.csv, prev_hash and row_hash let a stranger check the chain link by link against GET /api/integrity; '
          + 'a row_hash cannot be recomputed from these two files, because it was taken over the full time and, on the survey, the self-description. '
          + 'corrections.csv carries every field its hash covers, so every row_hash in it can be recomputed.',
        parameters: [{ name: 'kind', in: 'path', required: true, schema: { type: 'string', enum: ['corrections', 'gap', 'survey'] } }],
        responses: { 200: { description: 'CSV.', content: { 'text/csv': { schema: { type: 'string' } } } }, ...errors(['404', 'Unknown export.']) },
      },
    },
    '/api/export/corrections.csv': {
      get: {
        operationId: 'correctionsCsv', tags: ['register'],
        summary: 'Corrections to published federal figures, joined to the file each figure came from.',
        description: 'A defect report an analyst at the publishing agency can route without opening this site. '
          + 'One row per correction, carrying the price row id, the CPT or HCPCS code and the LOINC code where there is one, '
          + 'the published figure with its basis, year, geography and population, the federal file by name with its URL, '
          + 'its SHA-256 and the day it was read, the exact line or arithmetic the figure was re-read from, the audit verdict, '
          + 'the direction of the correction, the counts and fit rate on that figure, the chained row hash, and a permalink '
          + 'that renders the figure as a paste-ready correction report. The first line is a comment naming the price-table '
          + 'version and the audit. Free text is never exported. Column meanings are published at /api/export/corrections.json.',
        responses: { 200: { description: 'CSV.', content: { 'text/csv': { schema: { type: 'string' } } } }, ...errors(['503', 'The export could not be read right now.']) },
      },
    },
    '/api/export/corrections.json': {
      get: {
        operationId: 'correctionsJson', tags: ['register'],
        summary: 'The same corrections file as JSON, shaped as a DCAT distribution, with its column contract.',
        description: 'Carries the price-table version, the audit line and date, one entry per column (name, type, meaning), '
          + 'and every row of the CSV plus the CY2024 companion charge where CMS publishes one for that code (the figure an '
          + 'uninsured person is billed against), with its file, its SHA-256 and the row it was read from.',
        responses: {
          200: ok({
            type: 'object',
            properties: {
              '@type': { type: 'string' }, tableVersion: { type: 'string' }, auditLine: { type: 'string' },
              auditedOn: { type: 'string' }, countedAsOf: { type: 'string' }, n: { type: 'integer' },
              columns: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, note: { type: 'string' } } } },
              rows: { type: 'array', items: { type: 'object' } },
            },
          }),
          ...errors(['503', 'The export could not be read right now.']),
        },
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
        description: 'What you told us, read back to you, including the private note, which is served to nobody else, ever.',
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
          offerGap: { type: 'boolean', description: 'true when the honest answer is that nothing published describes them here: the case to count, not to fill.' },
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
          totalUsd: { type: ['number', 'null'], description: 'Null, never 0, when no published figure describes this caller on any line. A zero would be read as a price.' },
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
        description: 'One published federal figure, its provenance, and what the public said about it: enough for the agency that published it to act without joining to anything of ours.',
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
            items: { type: 'object', properties: { raw: { type: 'string', maxLength: 200 }, itemId: { type: ['string', 'null'] }, times: { type: 'integer', minimum: 1, maximum: 365 }, paid: { type: 'number', minimum: 0, maximum: 1000000, description: 'Optional. What the person says they paid for this line, in dollars: their own number, never a federal figure and never added to one.' }, paidEach: { type: 'boolean', description: 'Optional. true when paid is for one of the times on the line, not all of them.' } } },
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
            items: { type: 'object', properties: { fullUrl: { type: 'string', example: 'urn:uuid:1f0f…' }, resource: { type: 'object', description: 'Encounter, Procedure, ChargeItem, Observation, DocumentReference or Provenance.' } } },
          },
        },
      },
      JourneyInput: {
        type: 'object', required: ['entries'],
        properties: {
          title: { type: 'string', maxLength: 120 },
          entries: {
            type: 'array', minItems: 1, maxItems: 60,
            items: { type: 'object', properties: { raw: { type: 'string', maxLength: 200 }, itemId: { type: ['string', 'null'] }, times: { type: 'integer', minimum: 1, maximum: 365 }, paid: { type: 'number', minimum: 0, maximum: 1000000, description: 'Optional. What the person says they paid for this line, in dollars: their own number, never a federal figure and never added to one.' }, paidEach: { type: 'boolean', description: 'Optional. true when paid is for one of the times on the line, not all of them.' } } },
          },
        },
      },
      Journey: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' }, id: { type: 'string' }, slug: { type: 'string' }, title: { type: ['string', 'null'] },
          entries: { type: 'array', items: { type: 'object', properties: { raw: { type: 'string' }, itemId: { type: ['string', 'null'] }, times: { type: 'integer' }, paid: { type: 'number' }, paidEach: { type: 'boolean' } } } },
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

/* ==========================================================================
   THE FHIR EXPORT IS ONLY REAL IF THE OFFICIAL SCHEMA SAYS IT IS.

   The word "FHIR" is a claim other people's systems will act on, so this suite
   does not check our own idea of the standard. It fetches the published R4 JSON
   schema from hl7.org, caches the zip under tests/fixtures, and validates every
   bundle we produce against it with ajv. Nothing here mocks the schema, and the
   suite FAILS — never skips — when the schema cannot be obtained, because a
   validation test that quietly turns itself off is worse than no test.

   The schema is strict in the two ways that matter: `additionalProperties` is
   false on every resource, so a misspelt element is an error rather than a
   silent no-op; and `resourceType` is a const per definition, so a resource can
   only validate as the thing it says it is.
   ========================================================================== */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import Ajv, { type ValidateFunction } from 'ajv';
import draft06 from 'ajv/dist/refs/json-schema-draft-06.json';

import { TABLE, SELECTABLE, TABLE_VERSION } from '../lib/table';
import { parseJourney } from '../lib/mapper';
import { categoryKey } from '../lib/categories';
import type { JourneyEntry, PriceItem } from '../lib/types';
import {
  CPT_SYSTEM, HCPCS_SYSTEM, ACT_CODE_SYSTEM, PROVENANCE_AGENT_TYPE_SYSTEM, SUBJECT_DISPLAY,
  lineKindFor, parseCode, toFhirBundle,
  type FhirBundle, type FhirResource,
} from '../lib/fhir';

const SCHEMA_URL = 'https://hl7.org/fhir/R4/fhir.schema.json.zip';
const root = fileURLToPath(new URL('..', import.meta.url));
const CACHE = `${root}tests/fixtures/fhir.schema.json.zip`;

/* The sentence the site itself offers as an example, on the landing page and in
   the journey builder. The demo bundle is the demo journey, not a happy path
   invented here. */
const DEMO_STORY =
  'saw my regular doctor three times, then a cardiologist, an echo and a Holter, then the ER once when my heart was racing';

/* ---------- the schema: fetch once, cache, extract without a dependency ---------- */

async function schemaZip(): Promise<Buffer> {
  if (existsSync(CACHE)) return readFileSync(CACHE);
  const res = await fetch(SCHEMA_URL);
  if (!res.ok) throw new Error(`Could not fetch ${SCHEMA_URL}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(`${root}tests/fixtures`, { recursive: true });
  writeFileSync(CACHE, buf);
  return buf;
}

/** The zip holds one deflated entry and sets the data-descriptor flag, so the
 *  sizes live in the central directory rather than the local header. */
function unzipSingleEntry(zip: Buffer): string {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error('Not a zip file: no end-of-central-directory record.');
  const cd = zip.readUInt32LE(eocd + 16);
  if (zip.readUInt32LE(cd) !== 0x02014b50) throw new Error('Not a zip file: no central directory.');
  const compressedSize = zip.readUInt32LE(cd + 20);
  const uncompressedSize = zip.readUInt32LE(cd + 24);
  const localHeader = zip.readUInt32LE(cd + 42);
  const nameLen = zip.readUInt16LE(localHeader + 26);
  const extraLen = zip.readUInt16LE(localHeader + 28);
  const start = localHeader + 30 + nameLen + extraLen;
  const out = inflateRawSync(zip.subarray(start, start + compressedSize));
  if (out.length !== uncompressedSize) throw new Error('The schema did not inflate to its stated size.');
  return out.toString('utf8');
}

let validateBundle: ValidateFunction;
let ajv: Ajv;
let schemaBytes = 0;

beforeAll(async () => {
  const raw = unzipSingleEntry(await schemaZip());
  schemaBytes = raw.length;
  const schema = JSON.parse(raw) as Record<string, unknown>;
  /* The published file declares draft-06 but writes the schema id with draft-04's
     `id` keyword. ajv refuses that one keyword. Dropping the document's own id is
     the only edit made to it; no rule, definition, required list or pattern is
     touched, and the assertions below prove the schema still bites. */
  expect(schema.id).toBe('http://hl7.org/fhir/json-schema/4.0');
  expect(schema.$schema).toBe('http://json-schema.org/draft-06/schema#');
  delete schema.id;

  ajv = new Ajv({ strict: false, allowUnionTypes: true, validateFormats: false });
  ajv.addMetaSchema(draft06);
  ajv.addSchema(schema, 'fhir');
  validateBundle = ajv.compile({ $ref: 'fhir#/definitions/Bundle' });
}, 120_000);

/* ---------- fixtures built the way the product builds them ---------- */

const seq = () => {
  let n = 0;
  return () => {
    n += 1;
    return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  };
};
const FIXED_NOW = () => '2026-09-09T12:00:00.000Z';

function demoEntries(): JourneyEntry[] {
  return parseJourney(DEMO_STORY, SELECTABLE)
    .filter((s) => s.result.item)
    .map((s, i) => ({ key: `s${i}`, raw: s.raw, item: s.result.item, times: s.times }));
}

const byId = (id: string): PriceItem => {
  const it = TABLE.find((t) => t.id === id);
  if (!it) throw new Error(`no such row: ${id}`);
  return it;
};

const resourcesOf = (b: FhirBundle): FhirResource[] => b.entry.map((e) => e.resource);
const ofType = (b: FhirBundle, t: string) => resourcesOf(b).filter((r) => r.resourceType === t);

/** Validate, and report the failure against the specific resource definition so
 *  the message names the real problem instead of the first oneOf branch. */
function expectValid(bundle: FhirBundle) {
  /* Boolean() on purpose: ajv's return is a type predicate, and letting it
     narrow would turn `bundle` into `never` in the failure branch below. */
  const ok = Boolean(validateBundle(bundle));
  if (!ok) {
    const detail = resourcesOf(bundle).map((r) => {
      const type = r.resourceType;
      const v = ajv.compile({ $ref: `fhir#/definitions/${type}` });
      return Boolean(v(r)) ? null : `${type}: ${ajv.errorsText(v.errors)}`;
    }).filter(Boolean);
    throw new Error(`Bundle failed the official R4 schema.\n${detail.join('\n')}\n${ajv.errorsText(validateBundle.errors)}`);
  }
  expect(ok).toBe(true);
}

/* ========================================================================== */

describe('the official R4 schema is the one we validate against', () => {
  it('is the published file, and it is strict enough to catch a real mistake', () => {
    expect(schemaBytes).toBeGreaterThan(3_000_000);
    const bad = ajv.compile({ $ref: 'fhir#/definitions/Bundle' });
    // a misspelt element
    expect(bad({ resourceType: 'Bundle', type: 'collection', entrys: [] })).toBe(false);
    // a required element missing: ChargeItem needs code and subject
    expect(bad({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: { resourceType: 'ChargeItem', status: 'unknown' } }],
    })).toBe(false);
    // a code outside a required binding, where the schema publishes the enum
    expect(bad({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: { resourceType: 'ChargeItem', status: 'made-up', code: { text: 'x' }, subject: { display: 'x' } } }],
    })).toBe(false);
    // a money value written as a string
    expect(bad({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: { resourceType: 'ChargeItem', status: 'unknown', code: { text: 'x' }, subject: { display: 'x' }, priceOverride: { value: '95.19', currency: 'USD' } } }],
    })).toBe(false);
    // a timestamp that is not an instant
    expect(bad({ resourceType: 'Bundle', type: 'collection', timestamp: '9 September 2026', entry: [] })).toBe(false);
  });

  /* The generated schema publishes an enum only for some required bindings —
     Procedure.status and Encounter.status are plain `code`. So the value sets we
     rely on are checked here, against the codes read at hl7.org/fhir/R4. */
  it('🔴 uses only status codes that exist in R4, including the ones the schema does not police', () => {
    const { bundle } = toFhirBundle(demoEntries(), TABLE, { now: FIXED_NOW, uuid: seq() });
    const ALLOWED: Record<string, string[]> = {
      Encounter: ['planned', 'arrived', 'triaged', 'in-progress', 'onleave', 'finished', 'cancelled', 'entered-in-error', 'unknown'],
      Procedure: ['preparation', 'in-progress', 'not-done', 'on-hold', 'stopped', 'completed', 'entered-in-error', 'unknown'],
      ChargeItem: ['planned', 'billable', 'not-billable', 'aborted', 'billed', 'entered-in-error', 'unknown'],
      DocumentReference: ['current', 'superseded', 'entered-in-error'],
    };
    for (const r of resourcesOf(bundle)) {
      const allowed = ALLOWED[r.resourceType];
      if (!allowed) continue;
      expect(allowed, `${r.resourceType}.status`).toContain(r.status as string);
    }
    // and the one that is a deliberate choice, on every charge
    for (const c of ofType(bundle, 'ChargeItem')) expect(c.status).toBe('unknown');
    for (const e of ofType(bundle, 'Encounter')) expect(e.status).toBe('finished');
    for (const p of ofType(bundle, 'Procedure')) expect(p.status).toBe('completed');
  });
});

describe('the demo journey, as a FHIR R4 collection bundle', () => {
  const built = () => toFhirBundle(demoEntries(), TABLE, {
    tableVersion: TABLE_VERSION, now: FIXED_NOW, uuid: seq(),
  });

  it('🔴 validates against the official FHIR R4 JSON schema', () => {
    expectValid(built().bundle);
  });

  it('reads the demo sentence into priced lines, not into nothing', () => {
    const { counts } = built();
    expect(counts.lines).toBeGreaterThanOrEqual(4);
    expect(counts.encounters).toBeGreaterThanOrEqual(2); // the doctor visits and the ER
    expect(counts.procedures).toBeGreaterThanOrEqual(2); // the echo and the Holter
    expect(counts.chargeItems).toBe(counts.encounters + counts.procedures);
    expect(counts.sources).toBeGreaterThanOrEqual(1);
  });

  it('🔴 stays under 60 KB', () => {
    const bytes = Buffer.byteLength(JSON.stringify(built().bundle, null, 2), 'utf8');
    expect(bytes).toBeLessThan(60 * 1024);
  });

  it('is byte-for-byte reproducible from the same ledger', () => {
    const a = JSON.stringify(built().bundle);
    const b = JSON.stringify(built().bundle);
    expect(a).toBe(b);
  });

  it('carries the price table version, so every figure can be rebuilt', () => {
    const { bundle } = built();
    expect(bundle.meta?.tag?.[0].code).toBe(TABLE_VERSION);
  });
});

describe('🔴 nobody is identified', () => {
  const { bundle } = toFhirBundle(demoEntries(), TABLE, { now: FIXED_NOW, uuid: seq() });

  it('contains no Patient resource', () => {
    expect(ofType(bundle, 'Patient')).toEqual([]);
  });

  it('contains no identifier element anywhere', () => {
    const walk = (v: unknown): string[] => {
      if (Array.isArray(v)) return v.flatMap(walk);
      if (!v || typeof v !== 'object') return [];
      return Object.entries(v as Record<string, unknown>)
        .flatMap(([k, val]) => (k === 'identifier' ? [k] : walk(val)));
    };
    expect(walk(bundle)).toEqual([]);
  });

  it('makes every subject a display-only reference', () => {
    for (const r of resourcesOf(bundle)) {
      const s = r.subject as { reference?: string; display?: string } | undefined;
      if (!s) continue;
      expect(s.reference).toBeUndefined();
      expect(s.display).toBe(SUBJECT_DISPLAY);
    }
  });

  it('carries no date of service, because none was ever collected', () => {
    const json = JSON.stringify(bundle);
    for (const k of ['performedDateTime', 'occurrenceDateTime', 'birthDate', 'period']) {
      expect(json).not.toContain(`"${k}"`);
    }
  });
});

describe('🔴 every figure in the bundle is a figure the table already published', () => {
  it('prices each ChargeItem as the row figure times the count, and nothing else', () => {
    const entries = demoEntries();
    const { bundle } = toFhirBundle(entries, TABLE, { now: FIXED_NOW, uuid: seq() });
    const charges = ofType(bundle, 'ChargeItem');
    expect(charges.length).toBeGreaterThan(0);
    for (const c of charges) {
      const label = (c.code as { text: string }).text;
      const entry = entries.find((e) => e.item?.label === label);
      expect(entry, label).toBeTruthy();
      const unit = entry!.item!.valueUsd!;
      const times = (c.quantity as { value: number }).value;
      expect(times).toBe(entry!.times);
      expect((c.priceOverride as { value: number; currency: string }).value)
        .toBe(Math.round(unit * times * 100) / 100);
      expect((c.priceOverride as { currency: string }).currency).toBe('USD');
    }
  });

  it('points every ChargeItem at the federal file its figure came from', () => {
    const { bundle } = toFhirBundle(demoEntries(), TABLE, { now: FIXED_NOW, uuid: seq() });
    for (const c of ofType(bundle, 'ChargeItem')) {
      const uris = c.definitionUri as string[];
      expect(uris.length).toBe(1);
      expect(uris[0]).toMatch(/^https?:\/\//);
      expect(TABLE.some((t) => t.sourceUrl === uris[0])).toBe(true);
    }
  });

  it('writes the multiplication out where a human can check it', () => {
    const { bundle } = toFhirBundle(
      [{ key: 'a', raw: 'saw my regular doctor three times', item: byId('cms-99213'), times: 3 }],
      TABLE, { now: FIXED_NOW, uuid: seq() },
    );
    const [charge] = ofType(bundle, 'ChargeItem');
    expect(charge.overrideReason).toContain('3 x $95.19 = $285.57');
    expect(charge.overrideReason).toContain('not a bill');
    expect((charge.priceOverride as { value: number }).value).toBe(285.57);
  });

  it('🔴 never cites the row\'s file for a figure that did not come out of it', () => {
    const entries: JourneyEntry[] = [{ key: 'a', raw: 'a follow-up', item: byId('cms-99213'), times: 3 }];
    /* what the site shows an uninsured person: the CY2024 average submitted
       charge, which the table records without a file of its own. */
    const out = toFhirBundle(entries, TABLE, {
      now: FIXED_NOW, uuid: seq(),
      figureFor: () => ({ usd: 189.25, note: 'Average submitted charge, CY2024', source: null }),
    });
    const [charge] = ofType(out.bundle, 'ChargeItem');
    expect((charge.priceOverride as { value: number }).value).toBe(567.75);
    expect(charge.definitionUri).toBeUndefined();
    expect(JSON.stringify(out.bundle)).not.toContain('rvu26c');
    expect(ofType(out.bundle, 'Provenance')).toEqual([]);
    expect(ofType(out.bundle, 'DocumentReference')).toEqual([]);
    expect(out.counts.chargeItemsWithoutASourceFile).toBe(1);
    expectValid(out.bundle);
  });

  it('cites the file a caller names, and gives it its own provenance', () => {
    const out = toFhirBundle(
      [{ key: 'a', raw: 'a follow-up', item: byId('cms-99213'), times: 1 }],
      TABLE,
      {
        now: FIXED_NOW, uuid: seq(),
        figureFor: () => ({ usd: 85.37, note: 'What Medicare allowed on average in CY2024.', source: { url: 'https://data.cms.gov/example', title: 'A named CMS file' } }),
      },
    );
    expect((ofType(out.bundle, 'ChargeItem')[0].definitionUri as string[])[0]).toBe('https://data.cms.gov/example');
    const [doc] = ofType(out.bundle, 'DocumentReference');
    expect((doc.content as { attachment: { title: string } }[])[0].attachment.title).toBe('A named CMS file');
    expect(out.counts.chargeItemsWithoutASourceFile).toBe(0);
    expectValid(out.bundle);
  });

  it('ends the reason with a sentence, whatever the caller wrote', () => {
    const out = toFhirBundle(
      [{ key: 'a', raw: 'a follow-up', item: byId('cms-99213'), times: 1 }],
      TABLE,
      { now: FIXED_NOW, uuid: seq(), figureFor: () => ({ usd: 95.19, note: 'A note with no full stop' }) },
    );
    expect(ofType(out.bundle, 'ChargeItem')[0].overrideReason)
      .toContain('A note with no full stop. This is a published federal reference figure');
  });

  it('uses the figure the screen is showing when the caller hands one in', () => {
    const entries: JourneyEntry[] = [{ key: 'a', raw: 'an echo', item: byId('cms-img-echo'), times: 1 }];
    const { bundle } = toFhirBundle(entries, TABLE, {
      now: FIXED_NOW, uuid: seq(),
      figureFor: () => ({ usd: 197.09, note: 'CMS allowed amount for locality TX-18 (Houston).' }),
    });
    const [charge] = ofType(bundle, 'ChargeItem');
    expect((charge.priceOverride as { value: number }).value).toBe(197.09);
    expect(charge.overrideReason).toContain('TX-18');
  });

  it('🔴 leaves the line unpriced, with its Procedure intact, when no figure describes the person', () => {
    const entries: JourneyEntry[] = [{ key: 'a', raw: 'an echo', item: byId('cms-img-echo'), times: 1 }];
    const out = toFhirBundle(entries, TABLE, { now: FIXED_NOW, uuid: seq(), figureFor: () => ({ usd: null }) });
    expect(ofType(out.bundle, 'ChargeItem')).toEqual([]);
    expect(ofType(out.bundle, 'Procedure').length).toBe(1);
    expect(out.counts.clinicalLinesWithNoFigure).toBe(1);
    expectValid(out.bundle);
  });
});

describe('the codes come off the row, and an unknown system is never invented', () => {
  it('reads CPT, HCPCS and the APC that rides with it', () => {
    expect(parseCode('CPT 99213')).toEqual({ system: CPT_SYSTEM, systemName: 'CPT', code: '99213', apc: null });
    expect(parseCode('HCPCS G0463 (APC 5012)')).toEqual({ system: HCPCS_SYSTEM, systemName: 'HCPCS', code: 'G0463', apc: '5012' });
    expect(parseCode('CPT 99284 (APC 5024)')).toEqual({ system: CPT_SYSTEM, systemName: 'CPT', code: '99284', apc: '5024' });
    expect(parseCode('CPT 94729, add-on')).toEqual({ system: CPT_SYSTEM, systemName: 'CPT', code: '94729', apc: null });
    expect(parseCode(undefined)).toBeNull();
    expect(parseCode('LOINC 1234-5')).toBeNull();
  });

  it('🔴 emits only the two systems it verified, and keeps the APC out of the bundle', () => {
    const entries: JourneyEntry[] = [
      { key: 'a', raw: 'the hospital clinic', item: byId('cms-g0463-hospital-clinic-fee'), times: 1 },
      { key: 'b', raw: 'the ER', item: byId('cms-ed-99284-complete'), times: 1 },
    ];
    const out = toFhirBundle(entries, TABLE, { now: FIXED_NOW, uuid: seq() });
    const systems = new Set<string>();
    JSON.stringify(out.bundle, (k, v) => { if (k === 'system') systems.add(v as string); return v; });
    expect([...systems].sort()).toEqual([ACT_CODE_SYSTEM, CPT_SYSTEM, HCPCS_SYSTEM, PROVENANCE_AGENT_TYPE_SYSTEM].sort());
    expect(JSON.stringify(out.bundle)).not.toContain('APC');
    expect(out.codes.map((c) => c.apc)).toEqual(['5012', '5024']);
    expectValid(out.bundle);
  });

  it('every row in the whole table that becomes a resource has a readable code', () => {
    const unreadable = TABLE
      .filter((i) => lineKindFor(i) !== 'none' && i.code)
      .filter((i) => parseCode(i.code) === null)
      .map((i) => `${i.id} (${i.code})`);
    expect(unreadable).toEqual([]);
  });
});

describe('what becomes what', () => {
  it('makes an Encounter of a visit and of the ER, with the right class', () => {
    const out = toFhirBundle([
      { key: 'a', raw: 'a follow-up', item: byId('cms-99213'), times: 1 },
      { key: 'b', raw: 'the ER once', item: byId('cms-ed-99284-complete'), times: 1 },
    ], TABLE, { now: FIXED_NOW, uuid: seq() });
    const classes = ofType(out.bundle, 'Encounter').map((e) => (e.class as { code: string }).code);
    expect(classes).toEqual(['AMB', 'EMER']);
  });

  it('makes a Procedure of a lab, a scan, a test, a procedure and a therapy hour', () => {
    for (const id of ['cms-lab-cbc', 'cms-img-mri-brain-nc', 'cms-test-holter', 'cms-proc-colonoscopy', 'cms-mh-therapy-45']) {
      expect(lineKindFor(byId(id)), id).toBe('Procedure');
    }
  });

  it('🔴 refuses to dress a wage, a mileage rate or a whole-year survey figure as a charge', () => {
    const ids = ['bls2026q2-median-weekly-earnings', 'gsa2026-pov-mileage-rate', 'meps2022-longcovid-excess-total'];
    const out = toFhirBundle(
      ids.map((id, i) => ({ key: `k${i}`, raw: id, item: byId(id), times: 1 })),
      TABLE, { now: FIXED_NOW, uuid: seq() },
    );
    expect(out.bundle.entry).toEqual([]);
    expect(out.omitted.map((o) => o.itemId)).toEqual(ids);
    for (const o of out.omitted) expect(o.reason.length).toBeGreaterThan(40);
  });

  it('keeps words that matched nothing out of the bundle and says so', () => {
    const out = toFhirBundle(
      [{ key: 'a', raw: 'eighteen months of being told it was anxiety', item: null, times: 1 }],
      TABLE, { now: FIXED_NOW, uuid: seq() },
    );
    expect(out.bundle.entry).toEqual([]);
    expect(out.omitted[0].reason).toContain('No unit of care');
  });

  it('accepts the API shape as well as the browser shape', () => {
    const out = toFhirBundle(
      [{ raw: 'a follow-up', itemId: 'cms-99213', times: 2 }],
      TABLE, { now: FIXED_NOW, uuid: seq() },
    );
    expect(ofType(out.bundle, 'Encounter').length).toBe(1);
    expect((ofType(out.bundle, 'ChargeItem')[0].priceOverride as { value: number }).value).toBe(190.38);
    expectValid(out.bundle);
  });
});

describe('provenance resolves inside the bundle', () => {
  const out = toFhirBundle(demoEntries(), TABLE, { now: FIXED_NOW, uuid: seq() });

  it('gives every federal file one DocumentReference and one Provenance', () => {
    expect(ofType(out.bundle, 'DocumentReference').length).toBe(out.counts.sources);
    expect(ofType(out.bundle, 'Provenance').length).toBe(out.counts.sources);
  });

  it('🔴 resolves every reference to an entry that is actually in the bundle', () => {
    const urls = new Set(out.bundle.entry.map((e) => e.fullUrl));
    const refs: string[] = [];
    JSON.stringify(out.bundle, (k, v) => { if (k === 'reference') refs.push(v as string); return v; });
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect(urls.has(r), r).toBe(true);
  });

  it('names the agency that published the figure, and the file it lives in', () => {
    for (const d of ofType(out.bundle, 'DocumentReference')) {
      const att = (d.content as { attachment: { url?: string; title: string } }[])[0].attachment;
      expect(att.url).toMatch(/^https?:\/\//);
      expect(att.title.length).toBeGreaterThan(10);
      expect((d.author as { display: string }[])[0].display.length).toBeGreaterThan(2);
    }
    for (const p of ofType(out.bundle, 'Provenance')) {
      expect((p.entity as { role: string }[])[0].role).toBe('source');
      expect((p.agent as unknown[]).length).toBe(2);
      expect(p.recorded).toBe('2026-09-09T12:00:00.000Z');
    }
  });
});

describe('the whole table survives the export', () => {
  it('🔴 every priced, clinical row in the table produces a valid bundle', () => {
    const clinical = TABLE.filter((i) => lineKindFor(i) !== 'none' && i.valueUsd !== null);
    expect(clinical.length).toBeGreaterThan(80);
    const out = toFhirBundle(
      clinical.map((item, i) => ({ key: `k${i}`, raw: item.label, item, times: 1 })),
      TABLE, { tableVersion: TABLE_VERSION, now: FIXED_NOW, uuid: seq() },
    );
    expect(out.counts.chargeItems).toBe(clinical.length);
    expectValid(out.bundle);
  });

  it('sorts every row in the table into exactly one destination', () => {
    for (const i of TABLE) {
      const kind = lineKindFor(i);
      const cat = categoryKey(i);
      if (kind === 'none') expect(['time', 'survey', 'other']).toContain(cat);
      else expect(['visit', 'er', 'lab', 'img', 'test', 'proc', 'mh']).toContain(cat);
    }
  });
});

/* ==========================================================================
   Medicare claims → the ledger.

   The fixture is not written by us. It is one verbatim ExplanationOfBenefit
   search Bundle lifted out of the Blue Button 2.0 API's own published OpenAPI
   specification (synthetic beneficiary data, published by CMS), and its
   SHA-256 is pinned below — so these tests cannot quietly start passing
   against a friendlier version of reality.

   The result on that real CMS sample is recorded here honestly: none of the
   eight codes CMS billed has a row in this price table. That is a finding
   about the table, not a failure of the mapper, and it is asserted so nobody
   has to take it on trust. The mapper is proved separately, on a small Bundle
   hand-built for the purpose and labelled as such.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  SANDBOX, SERVICE_CODE_SYSTEMS, normalizeCode, codeIndex, pickRow,
  extractLines, claimCount, nextPageUrl, mapClaims, mapLines, importSummary,
  type EobBundle, type ClaimLine,
} from '../lib/bluebutton';
import { TABLE } from '../lib/table';

const ROOT = join(__dirname, '..');
const FIXTURE_DIR = join(ROOT, 'data/test-fixtures/bluebutton');
const fixtureText = readFileSync(join(FIXTURE_DIR, 'eob-bundle-v2.json'), 'utf8');
const source = JSON.parse(readFileSync(join(FIXTURE_DIR, 'SOURCE.json'), 'utf8'));
const bundle: EobBundle = JSON.parse(fixtureText);

/* -------------------------------------------------------------------------- */

describe('the fixture is the CMS one, unedited', () => {
  it('hashes to the value recorded when it was downloaded', () => {
    expect(createHash('sha256').update(fixtureText).digest('hex')).toBe(source.fixture_sha256);
  });

  it('cites where it came from', () => {
    expect(source.spec_url).toBe('https://s3.amazonaws.com/bb-impl-content-cms-gov/static/openapi.yaml');
    expect(source.spec_served_by).toBe('https://sandbox.bluebutton.cms.gov/docs/openapi');
    expect(source.example_key).toContain('V2FhirExplanationOfBenefitExample');
    expect(source.spec_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is a FHIR Bundle of ExplanationOfBenefit resources', () => {
    expect(bundle.resourceType).toBe('Bundle');
    expect(claimCount(bundle)).toBe(10);
  });
});

describe('the sandbox endpoints', () => {
  it('are all on the CMS sandbox host', () => {
    for (const url of [SANDBOX.authorizeUrl, SANDBOX.tokenUrl, SANDBOX.revokeUrl, SANDBOX.fhirBase]) {
      expect(new URL(url).origin).toBe('https://sandbox.bluebutton.cms.gov');
    }
  });

  it('ask for the slashed form, because the server 301s the unslashed one', () => {
    // Verified live 2026-09-09: GET /v2/o/authorize → 301 /v2/o/authorize/.
    // A 301 on a POST is how a token request loses its body.
    for (const url of [SANDBOX.authorizeUrl, SANDBOX.tokenUrl, SANDBOX.revokeUrl]) {
      expect(url.endsWith('/')).toBe(true);
    }
  });

  it('asks for read access to claims and nothing else', () => {
    expect(SANDBOX.scopes).toEqual(['patient/ExplanationOfBenefit.rs']);
  });
});

/* -------------------------------------------------------------------------- */

describe('a table row code becomes a bare service code', () => {
  it('reads the three shapes data/prices.json actually uses', () => {
    expect(normalizeCode('CPT 99213')).toBe('99213');
    expect(normalizeCode('HCPCS G0463 (APC 5012)')).toBe('G0463');
    expect(normalizeCode('CPT 99284 (APC 5024)')).toBe('99284');
    expect(normalizeCode('CPT 94729, add-on')).toBe('94729');
  });

  it('reads a Category II/III code and refuses a non-code', () => {
    expect(normalizeCode('CPT 0001U')).toBe('0001U');
    expect(normalizeCode('MEPS panel 21')).toBeNull();
    expect(normalizeCode(null)).toBeNull();
    expect(normalizeCode(undefined)).toBeNull();
  });

  it('leaves no coded row in the price table unreadable', () => {
    const coded = TABLE.filter((r) => r.code);
    expect(coded.length).toBeGreaterThan(80);
    expect(coded.filter((r) => !normalizeCode(r.code))).toEqual([]);
  });

  it('indexes every coded row, and the emergency-room code is the only collision', () => {
    const ix = codeIndex(TABLE);
    const collisions = [...ix.entries()].filter(([, rows]) => rows.length > 1);
    expect(collisions.map(([code]) => code)).toEqual(['99284']);
    expect(collisions[0][1].map((r) => r.id).sort()).toEqual([
      'cms-ed-99284-complete', 'cms-ed-99284-facility-only', 'cms-ed-99284-physician-only',
    ]);
  });
});

describe('the emergency-room code: the claim chooses, never this code', () => {
  const rows = codeIndex(TABLE).get('99284')!;

  it('an institutional claim is the hospital half', () => {
    expect(pickRow(rows, 'institutional')!.id).toBe('cms-ed-99284-facility-only');
  });

  it('a professional claim is the doctor half', () => {
    expect(pickRow(rows, 'professional')!.id).toBe('cms-ed-99284-physician-only');
  });

  it('a claim that does not say leaves the choice to the person', () => {
    // Never the "complete" row, which is the largest of the three. Silently
    // picking the biggest number is the easiest way to inflate a total.
    expect(pickRow(rows, 'unknown')).toBeNull();
    expect(pickRow(rows, 'pharmacy')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe('reading the CMS bundle', () => {
  const lines = extractLines(bundle);

  it('finds every billed line across all ten claims', () => {
    expect(lines.length).toBe(63);
  });

  it('reads a code only from a real service code system', () => {
    for (const l of lines) {
      if (l.code) expect(SERVICE_CODE_SYSTEMS).toContain(l.codeSystem);
    }
    expect(lines.filter((l) => l.code).length).toBe(32);
  });

  it('treats the data-absent-reason placeholder as no code, never as a code', () => {
    expect(lines.filter((l) => !l.code).length).toBe(31);
    expect(lines.some((l) => l.code === 'NULL')).toBe(false);
    expect(lines.some((l) => (l.codeSystem || '').includes('data-absent-reason'))).toBe(false);
  });

  it('dates every line, from the line or from the claim', () => {
    expect(lines.every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.servicedOn || ''))).toBe(true);
  });

  it('knows which kind of claim each line sits on', () => {
    expect([...new Set(lines.map((l) => l.claimKind))].sort()).toEqual(['institutional', 'professional']);
  });

  it('🔴 carries no money at all', () => {
    // The bundle is full of amounts — 459.1 appears on several lines. None of
    // them may cross into a ClaimLine: every dollar in this app is a row of the
    // published federal table, with a year, a basis and a source URL.
    const flat = JSON.stringify(lines);
    expect(flat).not.toContain('459.1');
    expect(flat).not.toContain('237.17');
    const moneyish = /amount|usd|paid|charge|submitted|cost|price|adjudicat/i;
    for (const key of Object.keys(lines[0] as unknown as Record<string, unknown>)) {
      expect(key).not.toMatch(moneyish);
    }
  });

  it('only follows a next-page link back to CMS itself', () => {
    expect(nextPageUrl({ link: [{ relation: 'next', url: 'https://sandbox.bluebutton.cms.gov/v2/fhir/ExplanationOfBenefit/?page=2' }] }))
      .toBe('https://sandbox.bluebutton.cms.gov/v2/fhir/ExplanationOfBenefit/?page=2');
    expect(nextPageUrl({ link: [{ relation: 'next', url: 'https://evil.example.com/v2/fhir/' }] })).toBeNull();
    expect(nextPageUrl({ link: [{ relation: 'self', url: 'https://sandbox.bluebutton.cms.gov/x' }] })).toBeNull();
    expect(nextPageUrl(null)).toBeNull();
  });
});

describe('what the CMS sample actually maps to — derived from the table, never from a hard-coded count', () => {
  const r = mapClaims(bundle, TABLE);
  const SAMPLE_CODES = ['96127', '96156', '99241', '99401', '99408', '99495', 'G0442', 'G0444'];
  const inTable = codeIndex(TABLE);
  const expectMatched = SAMPLE_CODES.filter((c) => inTable.has(c)).sort();
  const expectUnmatched = SAMPLE_CODES.filter((c) => !inTable.has(c)).sort();

  it('matches exactly the sample codes that have a published row in this table', () => {
    expect([...new Set(r.matched.map((m) => normalizeCode(m.item.code)))].sort()).toEqual(expectMatched);
    expect(r.entries.length).toBeGreaterThanOrEqual(r.matched.length);
  });

  it('lists every sample code without a row, with counts, rather than dropping them', () => {
    expect(r.unmatched.map((u) => u.code).sort()).toEqual(expectUnmatched);
    expect(r.unmatched.reduce((a, u) => a + u.count, 0) + r.matched.reduce((a, m) => a + m.lines.length, 0)).toBeGreaterThan(0);
    expect(r.unmatched.every((u) => u.reason === 'no-row')).toBe(true);
  });

  it('🔴 names none of the unmatched, because CMS sent no description with any', () => {
    // The one thing worse than a blank on a medical code is a plausible guess.
    for (const u of r.unmatched) {
      expect(u.display).toBeNull();
      if (u.display !== null) expect(fixtureText).toContain(u.display);
    }
  });

  it('counts the lines that arrived with no procedure code', () => {
    expect(r.linesWithoutCode).toBe(31);
    expect(r.lineCount).toBe(63);
    expect(r.claimCount).toBe(10);
  });

  it('reports the span of the record it read', () => {
    expect(r.earliestServicedOn).toBe('2016-03-01');
    expect(r.latestServicedOn).toBe('2024-03-30');
  });

  it('summarises itself without an adjective or a dollar sign, and its numbers agree with the map', () => {
    const s = importSummary(r);
    expect(s).toBe(`10 Medicare claims, 63 billed lines, ${r.matched.length} matched a published federal price row, `
      + `${r.unmatched.length} code${r.unmatched.length === 1 ? '' : 's'} had no row in this table, 31 lines carried no procedure code.`);
    expect(s).not.toContain('$');
  });
});

/* --------------------------------------------------------------------------
   The positive control.

   HAND-BUILT, and nothing in it is presented as data. It exists to prove the
   matcher does match, using the same structure the CMS bundle above uses:
   productOrService.coding on the CMS hcpcs system, a claim type, a date.
   -------------------------------------------------------------------------- */
const HCPCS = 'https://bluebutton.cms.gov/resources/codesystem/hcpcs';
const claimType = (hl7: string, display: string) => ({
  coding: [
    { system: 'https://bluebutton.cms.gov/resources/variables/nch_clm_type_cd', code: '71', display },
    { system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: hl7, display: hl7 },
  ],
});
const eob = (id: string, hl7: string, display: string, items: { code?: string; date: string; qty?: number; display?: string }[]) => ({
  resource: {
    resourceType: 'ExplanationOfBenefit',
    id,
    type: claimType(hl7, display),
    billablePeriod: { start: items[0].date },
    item: items.map((it, i) => ({
      sequence: i + 1,
      servicedDate: it.date,
      quantity: it.qty === undefined ? undefined : { value: it.qty },
      productOrService: it.code
        ? { coding: [{ system: HCPCS, code: it.code, display: it.display }] }
        : { coding: [{ system: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason', code: 'NULL' }] },
    })),
  },
});

describe('the matcher, on a bundle built for the purpose', () => {
  const built: EobBundle = {
    resourceType: 'Bundle',
    entry: [
      eob('c1', 'professional', 'Carrier claim', [
        { code: '99213', date: '2023-02-01' },
        { code: '85025', date: '2023-02-01', qty: 11 },
      ]),
      eob('c2', 'professional', 'Carrier claim', [
        { code: '99213', date: '2023-06-14' },
        { code: '99999', date: '2023-06-14', display: 'A code this table does not price' },
        { date: '2023-06-14' },
      ]),
    ],
  };
  const r = mapClaims(built, TABLE);

  it('matches on the bare code and counts one occurrence per billed line', () => {
    const visit = r.matched.find((m) => m.item.id === 'cms-99213')!;
    expect(visit.lines.length).toBe(2);
    expect(visit.firstServicedOn).toBe('2023-02-01');
    expect(visit.lastServicedOn).toBe('2023-06-14');
    expect(r.entries.find((e) => e.item?.id === 'cms-99213')!.times).toBe(2);
  });

  it('🔴 never multiplies a published price by a reported unit count', () => {
    // quantity means minutes on one line, doses on another, sessions on a third.
    // One billed line is one occurrence; the units change no number.
    const cbc = r.matched.find((m) => m.item.id === 'cms-lab-cbc')!;
    expect(cbc.lines[0].unitsReported).toBe(11);
    expect(r.entries.find((e) => e.item?.id === 'cms-lab-cbc')!.times).toBe(1);
  });

  it('keeps the description CMS sent for a code it cannot price', () => {
    const miss = r.unmatched.find((u) => u.code === '99999')!;
    expect(miss.display).toBe('A code this table does not price');
    expect(miss.reason).toBe('no-row');
  });

  it('writes a ledger line that says where it came from', () => {
    const e = r.entries.find((x) => x.item?.id === 'cms-99213')!;
    expect(e.raw).toContain('2 Medicare claim lines');
    expect(e.raw).toContain('2023-02-01 to 2023-06-14');
    expect(e.key).toBe('bb-cms-99213');
  });

  it('routes the emergency-room code by the claim it arrived on', () => {
    const inst = mapClaims({ resourceType: 'Bundle', entry: [eob('i1', 'institutional', 'Hospital Outpatient claim', [{ code: '99284', date: '2024-01-02' }])] }, TABLE);
    expect(inst.matched.map((m) => m.item.id)).toEqual(['cms-ed-99284-facility-only']);

    const prof = mapClaims({ resourceType: 'Bundle', entry: [eob('p1', 'professional', 'Carrier claim', [{ code: '99284', date: '2024-01-02' }])] }, TABLE);
    expect(prof.matched.map((m) => m.item.id)).toEqual(['cms-ed-99284-physician-only']);

    const unknown = mapClaims({ resourceType: 'Bundle', entry: [eob('u1', 'other', 'Something else', [{ code: '99284', date: '2024-01-02' }])] }, TABLE);
    expect(unknown.matched).toEqual([]);
    expect(unknown.unmatched[0].reason).toBe('ambiguous');
    expect(unknown.unmatched[0].candidates.map((c) => c.id).sort()).toEqual([
      'cms-ed-99284-complete', 'cms-ed-99284-facility-only', 'cms-ed-99284-physician-only',
    ]);
  });

  it('survives an empty, malformed or foreign bundle without inventing anything', () => {
    for (const b of [null, undefined, {}, { entry: [] }, { entry: [{ resource: { resourceType: 'Patient' } }] }] as EobBundle[]) {
      const out = mapClaims(b, TABLE);
      expect(out.matched).toEqual([]);
      expect(out.unmatched).toEqual([]);
      expect(out.entries).toEqual([]);
      expect(out.lineCount).toBe(0);
    }
  });

  it('maps identically whether it starts from a bundle or from extracted lines', () => {
    const lines: ClaimLine[] = extractLines(built);
    expect(mapLines(lines, TABLE, 2)).toEqual(r);
  });
});

/* --------------------------------------------------------------------------
   🔴 THE HARD RULE, MECHANISED.

   "Blue Button appears on no page until a real sandbox login round-trips."
   As of this commit CMS has issued no credentials (BB_CLIENT_ID and
   BB_CLIENT_SECRET do not exist), no sign-in has round-tripped, and so nothing
   in app/ may name it and ImportClaims may not be mounted. When the round trip
   is done, this test is the thing to change — deliberately, in the same commit
   that mounts it.
   -------------------------------------------------------------------------- */
describe('the feature is not on any page yet', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?|css|mdx?)$/.test(name)) files.push(p);
    }
  };
  walk(join(ROOT, 'app'));

  it('no page names Blue Button or the CMS sandbox host', () => {
    const named = files.filter((f) => /blue ?button|bluebutton\.cms\.gov/i.test(readFileSync(f, 'utf8')));
    expect(named).toEqual([]);
  });

  it('nothing mounts ImportClaims', () => {
    const mounted = files.filter((f) => /ImportClaims/.test(readFileSync(f, 'utf8')));
    expect(mounted).toEqual([]);
  });

  it('the public API description does not advertise it either', () => {
    expect(/blue ?button/i.test(readFileSync(join(ROOT, 'lib/openapi.ts'), 'utf8'))).toBe(false);
  });
});

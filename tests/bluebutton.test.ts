/* ==========================================================================
   Medicare claims → the ledger.

   The fixture is not written by us. It is one verbatim ExplanationOfBenefit
   search Bundle lifted out of the Blue Button 2.0 API's own published OpenAPI
   specification (synthetic beneficiary data, published by CMS), and its
   SHA-256 is pinned below — so these tests cannot quietly start passing
   against a friendlier version of reality.

   The result on that CMS sample is derived from the table, never hard-coded:
   as the table grew, seven of the eight codes CMS billed gained a row, five of
   those rows carry a published figure, and the sample now prices into a ledger
   (asserted below, line by line, against each row's own source). The mapper is
   also proved on a small Bundle hand-built for the purpose and labelled as such.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SANDBOX, SERVICE_CODE_SYSTEMS, normalizeCode, codeIndex, pickRow,
  extractLines, claimCount, nextPageUrl, mapClaims, mapLines, importSummary,
  refusalOf, CMS_ATTRIBUTION, ENVIRONMENT_LABEL,
  type EobBundle, type ClaimLine,
} from '../lib/bluebutton';
import { TABLE } from '../lib/table';
import { priceJourney, totals, clampTimes } from '../lib/pricing';

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
   The CMS sample, priced into a ledger (CMS sandbox, synthetic beneficiaries).

   This is the claim-to-ledger step end to end on the recorded fixture: the
   mapper's entries go through the same priceJourney/totals the ledger uses.
   Every figure is the row's own published number times the count that may be
   priced; nothing else is added, and no claim dollar is read.
   -------------------------------------------------------------------------- */
describe('the CMS synthetic sample, priced into a ledger', () => {
  const r = mapClaims(bundle, TABLE);
  const lines = priceJourney(r.entries);
  const t = totals(lines);

  it('makes one ledger line per matched row, each saying it came from Medicare claims', () => {
    expect(r.entries.length).toBe(r.matched.length);
    for (const e of r.entries) {
      expect(e.key).toMatch(/^bb-/);
      expect(e.raw).toMatch(/from \d+ Medicare claim lines?, /);
    }
  });

  it('🔴 every priced line keeps its federal source, year, basis and coverage note', () => {
    expect(t.pricedCount).toBeGreaterThan(0);
    for (const l of lines.filter((x) => x.priced)) {
      const it = l.entry.item!;
      expect(it.sourceUrl, it.id).toMatch(/^https:\/\/[^/]*\.gov\//);
      expect(it.sourceTitle.trim().length, it.id).toBeGreaterThan(0);
      expect(it.year, it.id).toMatch(/^\d{4}/);
      expect(it.coverage.trim().length, it.id).toBeGreaterThan(0);
      expect(it.valueUsd, it.id).not.toBeNull();
    }
  });

  it('a row with no published figure stays unpriced, never filled in', () => {
    const blank = lines.filter((l) => l.entry.item && l.entry.item.valueUsd === null);
    for (const l of blank) {
      expect(l.priced).toBe(false);
      expect(l.totalUsd).toBeNull();
    }
    expect(t.unpricedCount).toBe(blank.length);
  });

  it('the total is exactly each published figure times the count that may be priced', () => {
    let want = 0;
    for (const l of lines) {
      const it = l.entry.item;
      if (!it || it.valueUsd === null) continue;
      want += it.valueUsd * clampTimes(it, l.entry.times).times;
    }
    expect(t.totalUsd).toBeCloseTo(want, 6);
    expect(t.totalUsd).toBeGreaterThan(0);
  });

  it('a once-a-year code billed more often is priced once and the rest counted', () => {
    for (const l of lines) {
      const it = l.entry.item!;
      const c = clampTimes(it, l.entry.times);
      if (it.maxPerYear && l.entry.times > it.maxPerYear) {
        expect(c.capped).toBe(true);
        expect(c.said).toBe(l.entry.times);
      }
    }
  });

  it('never mixes bases silently: every basis present is reported', () => {
    const bases = new Set(lines.filter((l) => l.priced).map((l) => l.entry.item!.basis));
    expect([...t.basesUsed].sort()).toEqual([...bases].sort());
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
    expect(e.raw.endsWith(`(${ENVIRONMENT_LABEL})`)).toBe(true);
    expect(e.raw).not.toContain('—');
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
   The import on the page: mounted on the ledger, hidden until configured.

   It used to be on no page at all, because no sign-in had round-tripped. It is
   now mounted on /ledger (CMS sends the person back there), and the switch is
   the server's: GET /api/bluebutton/status `configured`, which is true only
   once the sandbox credentials are Pages secrets. Until then the panel renders
   nothing, not on the static page, not on first paint, not after the status
   answers. The Standards table and /method still say it stays off, which is
   true wherever no credentials are set.
   -------------------------------------------------------------------------- */
describe('the Medicare import: on the ledger, hidden until configured', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?|css|mdx?)$/.test(name)) files.push(p);
    }
  };
  walk(join(ROOT, 'app'));
  walk(join(ROOT, 'components'));
  const rel = (f: string) => f.slice(ROOT.length + 1).split('\\').join('/');

  /* The places allowed to name it: the mount, and two descriptions that say it is off. */
  const NAMES_IT_AS_OFF = ['app/method/page.tsx', 'components/Adopt.tsx'];
  const OFF = /stays off until CMS issues us credentials/;

  it('is mounted on the ledger page, through its gate, and nowhere else', () => {
    const gate = files.filter((f) => /<MedicareImport\b/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(gate).toEqual(['app/ledger/page.tsx']);
    const panel = files.filter((f) => /<ImportClaims\b/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(panel).toEqual(['components/MedicareImport.tsx']);
    // The panel's code is its own chunk, loaded only when configured.
    expect(readFileSync(join(ROOT, 'components/MedicareImport.tsx'), 'utf8')).toMatch(/lazy\(\(\) => import\('\.\/ImportClaims'\)\)/);
  });

  it('only the mount and the two descriptions name Blue Button, and both descriptions say it is off', () => {
    const named = files
      .filter((f) => !/components[\\/]ImportClaims\.tsx$/.test(f))
      .filter((f) => /blue ?button|bluebutton\.cms\.gov/i.test(readFileSync(f, 'utf8')))
      .map(rel)
      .sort();
    expect(named).toEqual(['app/ledger/page.tsx', 'components/MedicareImport.tsx', ...NAMES_IT_AS_OFF].sort());
    for (const f of NAMES_IT_AS_OFF) expect(readFileSync(join(ROOT, f), 'utf8'), f).toMatch(OFF);
  });

  it('the public API description does not advertise it yet', () => {
    expect(/blue ?button/i.test(readFileSync(join(ROOT, 'lib/openapi.ts'), 'utf8'))).toBe(false);
  });

  const unconfigured = { ok: true, configured: false, connected: false, environment: 'sandbox' };
  const configured = { ok: true, configured: true, connected: false, environment: 'sandbox' };

  it('🔴 hidden while unconfigured: no markup at all, in every phase', async () => {
    const { ImportClaimsView } = await import('../components/ImportClaims');
    expect(renderToStaticMarkup(createElement(ImportClaimsView, { status: null, phase: 'checking' }))).toBe('');
    expect(renderToStaticMarkup(createElement(ImportClaimsView, { status: unconfigured, phase: 'off' }))).toBe('');
    for (const phase of ['ready', 'loading', 'loaded', 'error'] as const) {
      expect(renderToStaticMarkup(createElement(ImportClaimsView, { status: unconfigured, phase })), phase).toBe('');
    }
  });

  it('🔴 the mount paints nothing before the status answers (no shift, no words)', async () => {
    const { default: MedicareImport } = await import('../components/MedicareImport');
    const { default: ImportClaims } = await import('../components/ImportClaims');
    const { StoreProvider } = await import('../lib/store');
    expect(renderToStaticMarkup(createElement(MedicareImport))).toBe('');
    expect(renderToStaticMarkup(createElement(StoreProvider, null, createElement(ImportClaims)))).toBe('');
    expect(renderToStaticMarkup(createElement(StoreProvider, null,
      createElement(ImportClaims, { initialStatus: unconfigured })))).toBe('');
  });

  it('given a configured status by its gate, the panel shows at once', async () => {
    const { default: ImportClaims } = await import('../components/ImportClaims');
    const { StoreProvider } = await import('../lib/store');
    const html = renderToStaticMarkup(createElement(StoreProvider, null,
      createElement(ImportClaims, { initialStatus: configured })));
    expect(html).toContain('Bring in your Medicare record');
    expect(html).toContain(CMS_ATTRIBUTION.replace('&', '&amp;'));
  });

  it('shown when configured: the sign-in, the sandbox label and the CMS notice', async () => {
    const { ImportClaimsView } = await import('../components/ImportClaims');
    const html = renderToStaticMarkup(createElement(ImportClaimsView, { status: configured, phase: 'ready' }));
    expect(html).toContain('Bring in your Medicare record');
    expect(html).toContain(`${ENVIRONMENT_LABEL}.`);
    expect(html).toContain('href="/api/bluebutton/start"');
    expect(html).toContain(CMS_ATTRIBUTION.replace('&', '&amp;'));
    expect(html).not.toContain('—');
  });

  it('shown when configured and loaded: the CMS sample, labelled, with every figure from the table', async () => {
    const { ImportClaimsView } = await import('../components/ImportClaims');
    const r = mapClaims(bundle, TABLE);
    const html = renderToStaticMarkup(createElement(ImportClaimsView, {
      status: { ...configured, connected: true }, phase: 'loaded', result: r,
    }));
    expect(html).toContain(importSummary(r));
    expect(html).toContain(`(${ENVIRONMENT_LABEL})`);
    expect(html).toContain(CMS_ATTRIBUTION.replace('&', '&amp;'));
    expect(html).toContain(`Add ${r.matched.length} lines to my ledger`);
    for (const g of r.matched) expect(html).toContain(g.item.code!);
    expect(html).not.toContain('Sign in at Medicare');
    expect(html).not.toContain('—');
  });

  it('a CMS refusal shows a plain sentence and CMS\'s own words, and only on a failed sign-in', async () => {
    const { ImportClaimsView } = await import('../components/ImportClaims');
    const refusal = refusalOf('invalid_scope', 'Invalid redirect_uri for this application.')!;
    const failed = renderToStaticMarkup(createElement(ImportClaimsView, {
      status: { ...configured, refusal }, phase: 'ready', outcome: { kind: 'failed', why: 'The Medicare sandbox refused the sign-in.' },
    }));
    expect(failed).toContain(refusal.plain);
    expect(failed).toContain('CMS said: “Invalid redirect_uri for this application.”');
    expect(failed).toContain('(invalid_scope)');
    const cancelled = renderToStaticMarkup(createElement(ImportClaimsView, {
      status: { ...configured, refusal }, phase: 'ready', outcome: { kind: 'cancelled', why: null },
    }));
    expect(cancelled).not.toContain('CMS said');
  });
});

/* --------------------------------------------------------------------------
   When CMS says no: its reason reaches the person, and nobody else's words do.
   -------------------------------------------------------------------------- */
describe('a refused sign-in, in plain words', () => {
  it('maps each OAuth error code CMS can send to a plain sentence', () => {
    for (const code of ['invalid_request', 'invalid_client', 'invalid_grant', 'unauthorized_client',
      'unsupported_grant_type', 'invalid_scope', 'server_error', 'temporarily_unavailable']) {
      const r = refusalOf(code, null)!;
      expect(r.code).toBe(code);
      expect(r.plain).toMatch(/^CMS /);
      expect(r.plain).not.toMatch(/_/);
    }
    expect(refusalOf('something_new', null)!.plain).toBe('CMS refused the sign-in.');
  });

  it('cleans CMS\'s words: no control characters, no runaway length, no fake code', () => {
    const r = refusalOf('Bad Code!', 'line one\nline\u0007two   ' + 'x'.repeat(400))!;
    expect(r.code).toBeNull();
    expect(r.cmsSaid).not.toMatch(/[\u0000-\u001f]/);
    expect(r.cmsSaid!.length).toBeLessThanOrEqual(300);
    expect(r.cmsSaid!.startsWith('line one line two')).toBe(true);
    expect(refusalOf(null, '   ')).toBeNull();
    expect(refusalOf(undefined, undefined)).toBeNull();
  });
});

describe('the callback and status carry CMS\'s reason, never a stranger\'s', () => {
  const env = { BB_CLIENT_ID: 'test-client', BB_CLIENT_SECRET: 'test-secret' };
  const ORIGIN = 'https://bluebutton-night.waypoint-ledger.pages.dev';
  const pkce = (state: string) => `wl_bb_pkce=${encodeURIComponent(JSON.stringify({ state, verifier: 'v'.repeat(64) }))}`;
  const call = async (qs: string, cookie?: string) => {
    const { onRequestGet } = await import('../cf/functions/api/bluebutton/callback.js');
    const request = new Request(`${ORIGIN}/api/bluebutton/callback?${qs}`, { headers: cookie ? { cookie } : {} });
    const res: Response = await onRequestGet({ request, env });
    const loc = new URL(res.headers.get('location')!);
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
    return { loc, cookies: cookies.join('\n') };
  };

  it('a person who says no at CMS is a cancel, not an error', async () => {
    const { loc, cookies } = await call('error=access_denied&state=s1', pkce('s1'));
    expect(loc.pathname).toBe('/ledger');
    expect(loc.searchParams.get('medicare')).toBe('cancelled');
    expect(cookies).not.toContain('wl_bb_refusal=');
  });

  it('a CMS error on our own round trip is shown in CMS\'s words, through an HttpOnly cookie, never the URL', async () => {
    const { loc, cookies } = await call('error=invalid_scope&error_description=Scope%20not%20allowed&state=s2', pkce('s2'));
    expect(loc.searchParams.get('medicare')).toBe('failed');
    expect(loc.searchParams.get('why')).toBe('refused');
    expect(loc.search).not.toContain('Scope');
    expect(cookies).toMatch(/wl_bb_refusal=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=300; Secure/);
  });

  it('🔴 a crafted link with someone else\'s words shows none of them', async () => {
    const forged = await call('error=server_error&error_description=Call%201-800-SCAM&state=guess', pkce('real'));
    expect(forged.loc.searchParams.get('why')).toBe('state-mismatch');
    expect(forged.cookies).not.toContain('wl_bb_refusal=');
    const cold = await call('error=server_error&error_description=Call%201-800-SCAM&state=guess');
    expect(cold.loc.searchParams.get('why')).toBe('expired');
    expect(cold.cookies).not.toContain('wl_bb_refusal=');
  });

  it('a refused token exchange carries CMS\'s error and description', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ error: 'invalid_grant', error_description: 'Mismatching redirect URI.' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;
    try {
      const { loc, cookies } = await call('code=abc&state=s3', pkce('s3'));
      expect(loc.searchParams.get('why')).toBe('refused');
      const m = /wl_bb_refusal=([^;]+)/.exec(cookies)!;
      expect(JSON.parse(decodeURIComponent(m[1]))).toEqual({ e: 'invalid_grant', d: 'Mismatching redirect URI.' });

      const { onRequestGet: status } = await import('../cf/functions/api/bluebutton/status.js');
      const res: Response = await status({ request: new Request(`${ORIGIN}/api/bluebutton/status`, { headers: { cookie: `wl_bb_refusal=${m[1]}` } }), env });
      const j = await res.json();
      expect(j.configured).toBe(true);
      expect(j.environment).toBe('sandbox');
      expect(j.refusal).toEqual(refusalOf('invalid_grant', 'Mismatching redirect URI.'));
      expect(res.headers.get('set-cookie')).toMatch(/^wl_bb_refusal=; .*Max-Age=0/);
    } finally { globalThis.fetch = real; }
  });

  it('an unreachable CMS is its own reason, with nothing from CMS to show', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (async () => { throw new TypeError('network'); }) as typeof fetch;
    try {
      const { loc, cookies } = await call('code=abc&state=s4', pkce('s4'));
      expect(loc.searchParams.get('why')).toBe('unreachable');
      expect(cookies).not.toContain('wl_bb_refusal=');
    } finally { globalThis.fetch = real; }
  });

  it('status reports configured false and no refusal without credentials', async () => {
    const { onRequestGet: status } = await import('../cf/functions/api/bluebutton/status.js');
    const res: Response = await status({ request: new Request(`${ORIGIN}/api/bluebutton/status`), env: {} });
    const j = await res.json();
    expect(j.configured).toBe(false);
    expect(j.refusal).toBeNull();
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

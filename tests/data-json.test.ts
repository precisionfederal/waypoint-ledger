/* ==========================================================================
   /data.json MUST VALIDATE AGAINST THE GOVERNMENT'S OWN SCHEMA.

   A catalog is a promise to a harvester. The failure mode is not a missing file
   — it is a file that looks like DCAT-US, gets harvested, and is rejected or,
   worse, silently mangled. So this validates the real artifact against the real
   published schema, and re-hashes the vendored schema first so nobody can make
   the catalog pass by editing the ruler.

   The one deviation, and its authority, are documented in
   tests/fixtures/dcat-us-v1.1/SOURCE.md: bureauCode and programCode are dropped
   from `required` because resources.data.gov says in terms that they are
   federal-agency fields and "should not be seen as required" for a non-federal
   publisher. Every other rule is applied exactly as published.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const readJson = (p: string) => JSON.parse(readFileSync(root + p, 'utf8'));

const CATALOG = readJson('public/data.json') as Record<string, any>;

/* The bytes resources.data.gov served on 2026-09-09. See SOURCE.md. */
const SCHEMA_SHA256: Record<string, string> = {
  'catalog.json': '3e5a23ae36361ba36163e1a522f094fb8b39532731e741553f48dbcd4ddaf0d6',
  'dataset.json': 'f425894237684d0648b51c6cb6ba1f37823aeec44183c7d2e47d5d0bd2d293b6',
  'distribution.json': 'cd1905495b0576855840c12e6a5138ae2952cf9b7bee56ad20df15da841a3774',
  'organization.json': '4ce4f6bb576870f79396f35e713ff3ff55a0e734d2a33b0d7ddf1324bafb4619',
  'vcard.json': 'b16075a8aeed2ca512281aeb16b7f3726dd89de25597c56731a67a106235c4b9',
};

/** Federal-agency-only fields. A non-federal publisher inventing one would be
 *  inventing a federal identifier, which this product refuses on every surface. */
const FEDERAL_ONLY = ['bureauCode', 'programCode', 'dataQuality', 'primaryITInvestmentUII', 'systemOfRecords'];

/** draft-04 as published -> draft-07 as ajv 8 reads it. Nothing else changes. */
function adapt(name: string): Record<string, any> {
  const raw = readFileSync(`${root}tests/fixtures/dcat-us-v1.1/${name}`, 'utf8');
  const s = JSON.parse(raw) as Record<string, any>;
  s.$schema = 'http://json-schema.org/draft-07/schema#';
  s.$id = s.id;
  delete s.id;
  if (name === 'dataset.json') s.required = (s.required as string[]).filter((r) => !FEDERAL_ONLY.includes(r));
  return s;
}

function validator() {
  const ajv = new Ajv({
    strict: false,
    allErrors: true,
    // vcard.json's hasEmail pattern predates unicode-mode regexes (\_ \~ \! \& \' \, \; \= \:
    // are all legal in draft-04 and illegal under /u). Compile it as published.
    unicodeRegExp: false,
    // The published schemas use exactly one format, "uri", on absolute URLs.
    formats: { uri: /^[a-z][a-z0-9+.-]*:\S*$/i },
  });
  for (const n of Object.keys(SCHEMA_SHA256)) ajv.addSchema(adapt(n));
  return ajv.getSchema('https://project-open-data.cio.gov/v1.1/schema/catalog.json#')!;
}

describe('the vendored DCAT-US v1.1 schema is the one the government published', () => {
  it('🔴 every schema file still hashes to the bytes resources.data.gov served', () => {
    for (const [name, sha] of Object.entries(SCHEMA_SHA256)) {
      const buf = readFileSync(`${root}tests/fixtures/dcat-us-v1.1/${name}`);
      expect(createHash('sha256').update(buf).digest('hex'), name).toBe(sha);
    }
  });

  it('documents the single deviation, with its published authority', () => {
    const src = readFileSync(`${root}tests/fixtures/dcat-us-v1.1/SOURCE.md`, 'utf8');
    expect(src).toContain('should not be seen as required');
    expect(src).toContain('https://resources.data.gov/resources/dcat-us/');
    for (const f of FEDERAL_ONLY) expect(src).toContain(f);
  });
});

describe('/data.json is a DCAT-US v1.1 catalog', () => {
  it('🔴 validates against the published schema', () => {
    const validate = validator();
    const ok = validate(CATALOG);
    const errors = (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  it('declares the schema version data.gov harvests on, and points at the schema', () => {
    expect(CATALOG.conformsTo).toBe('https://project-open-data.cio.gov/v1.1/schema');
    expect(CATALOG['@type']).toBe('dcat:Catalog');
    expect(CATALOG['@id']).toBe('https://waypoint-ledger.pages.dev/data.json');
    expect(CATALOG.describedBy).toBe('https://project-open-data.cio.gov/v1.1/schema/catalog.json');
  });

  it('🔴 claims no federal-agency field it has no right to', () => {
    const text = JSON.stringify(CATALOG);
    for (const f of FEDERAL_ONLY) expect(text.includes(`"${f}"`), f).toBe(false);
  });

  it('names the bidding entity, not the successor LLC, as publisher', () => {
    for (const d of CATALOG.dataset) {
      expect(d.publisher.name).toBe('Precision Delivery Federal LLC');
      expect(d.contactPoint.hasEmail).toBe('mailto:bo@precisionfederal.com');
      expect(d.license).toBe('https://creativecommons.org/publicdomain/zero/1.0/');
      expect(d.accessLevel).toBe('public');
    }
  });

  it('gives every dataset a distinct identifier', () => {
    const ids = CATALOG.dataset.map((d: any) => d.identifier);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(6);
  });
});

describe('🔴 every URL in the catalog is a thing that exists', () => {
  const site = 'https://waypoint-ledger.pages.dev';
  const distributions: any[] = CATALOG.dataset.flatMap((d: any) => d.distribution ?? []);

  /** A catalog URL is either a file under public/ or a Pages Function that
   *  serves it. /api/export/corrections.csv is a download served by
   *  cf/functions/api/export/[kind].js, so both shapes have to resolve. */
  function resolves(url: string): boolean {
    const p = url.replace(site, '');
    if (existsSync(`${root}public${p}`)) return true;
    const literal = ['', '.js', '/index.js'].some((s) => existsSync(`${root}cf/functions${p}${s}`));
    if (literal) return true;
    // the last segment may be a [param] the function names
    const dir = `${root}cf/functions${p.slice(0, p.lastIndexOf('/'))}`;
    if (!existsSync(dir)) return false;
    return readdirSync(dir).some((f) => /^\[\w+\]\.js$/.test(f));
  }

  it('every downloadURL is a published file or the function that serves it', () => {
    const missing = distributions.filter((x) => x.downloadURL)
      .map((x) => String(x.downloadURL)).filter((u) => !resolves(u));
    expect(missing).toEqual([]);
  });

  it('every accessURL resolves to a Cloudflare Pages Function on disk', () => {
    const missing = distributions.filter((x) => x.accessURL)
      .map((x) => String(x.accessURL)).filter((u) => !resolves(u));
    expect(missing).toEqual([]);
  });

  it('every describedBy dictionary is a published file', () => {
    const missing = CATALOG.dataset
      .map((d: any) => d.describedBy)
      .filter(Boolean)
      .map((u: string) => u.replace(site, ''))
      .filter((p: string) => !existsSync(`${root}public${p}`));
    expect(missing).toEqual([]);
  });

  it('the price table cites the federal files its own rows cite — no more, no fewer', () => {
    const table = readJson('public/data/price-table.json');
    const fromRows = [...new Set(table.items.map((i: any) => i.source_url).filter(Boolean))].sort();
    const inCatalog = [...CATALOG.dataset[0].references].sort();
    expect(inCatalog).toEqual(fromRows);
  });
});

describe('🔴 one licence, in the tree and on the site', () => {
  it('publishes the same LICENSE bytes the repository carries', () => {
    for (const f of ['LICENSE', 'NOTICE']) {
      const tree = readFileSync(root + f, 'utf8');
      expect(readFileSync(`${root}public/${f}`, 'utf8'), f).toBe(tree);
      expect(readFileSync(`${root}public/${f}.txt`, 'utf8'), `${f}.txt`).toBe(tree);
    }
  });

  it('the LICENSE is Apache-2.0 held by the entity that bids', () => {
    const lic = readFileSync(root + 'LICENSE', 'utf8');
    expect(lic).toContain('Apache License');
    expect(lic).toContain('Version 2.0, January 2004');
    expect(lic).toContain('Copyright 2026 Precision Delivery Federal LLC');
    expect(lic).not.toContain('[yyyy] [name of copyright owner]');
  });

  it('🔴 the NOTICE says which licence covers the code and which covers the data', () => {
    const n = readFileSync(root + 'NOTICE', 'utf8');
    expect(n).toContain('Apache License, Version 2.0');
    expect(n).toContain('CC0 1.0 Universal');
    expect(n).toContain('https://creativecommons.org/publicdomain/zero/1.0/');
    // The data licence in the NOTICE and the one every dataset claims must agree.
    expect(CATALOG.dataset[0].license).toBe('https://creativecommons.org/publicdomain/zero/1.0/');
  });
});

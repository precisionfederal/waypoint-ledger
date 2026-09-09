/* ==========================================================================
   THE PUBLISHED DESCRIPTION MUST DESCRIBE THE THING THAT EXISTS.

   An OpenAPI document is a promise a machine will act on without asking. The
   failure mode is not a malformed document — it is a well-formed one that
   describes a route nobody wrote, or omits a route we tell people to use. So
   this validates the structure AND resolves every documented path to a handler
   on disk, in both directions.

   There is no OpenAPI validator in this project's dependencies and adding one
   to check our own hand-written document would be a dependency for a job we can
   do exactly: 3.1 structure, every $ref resolvable, unique operation ids, every
   response described, every path real.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OPENAPI } from '../lib/openapi';
import type { OpenApiOperation } from '../lib/openapi';

const root = fileURLToPath(new URL('..', import.meta.url));
const METHODS = ['get', 'post', 'put', 'delete'] as const;

const operations: { path: string; method: string; op: OpenApiOperation }[] =
  Object.entries(OPENAPI.paths).flatMap(([path, item]) =>
    METHODS.filter((m) => item[m]).map((m) => ({ path, method: m, op: item[m]! })));

/** Where a Cloudflare Pages Function for this path would have to live. */
function handlerFor(path: string): string[] {
  if (path.startsWith('/data/')) return [`${root}public${path}`];
  // /api/export/{kind}.csv is served by export/[kind].js — the extension is part of the parameter
  const cleaned = path.replace(/\{(\w+)\}\.csv$/, '[$1].js').replace(/\{(\w+)\}/g, '[$1]');
  const base = `${root}cf/functions${cleaned}`;
  return [base, `${base}.js`, `${base}/index.js`];
}

describe('OpenAPI 3.1 — structure', () => {
  it('is a 3.1 document with the fields a generator needs', () => {
    expect(OPENAPI.openapi).toBe('3.1.0');
    expect(OPENAPI.info.title).toBeTruthy();
    expect(OPENAPI.info.version).toBeTruthy();
    expect(String(OPENAPI.info.description).length).toBeGreaterThan(200);
    expect(OPENAPI.servers.length).toBeGreaterThan(0);
    for (const s of OPENAPI.servers) expect(s.url).toMatch(/^https?:\/\//);
  });

  it('publishes a licence a lawyer can act on, not a sentence', () => {
    const lic = OPENAPI.info.license as { name: string; url?: string; identifier?: string };
    expect(lic.identifier).toBe('CC0-1.0');
    expect(lic.url).toMatch(/^https:\/\//);
  });

  it('gives every operation an id, and never the same id twice', () => {
    const ids = operations.map((o) => o.op.operationId);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every operation a summary and at least one described response', () => {
    for (const { path, method, op } of operations) {
      expect(op.summary, `${method.toUpperCase()} ${path}`).toBeTruthy();
      expect(Object.keys(op.responses).length, `${method.toUpperCase()} ${path}`).toBeGreaterThan(0);
      for (const [code, res] of Object.entries(op.responses)) {
        expect((res as { description?: string }).description, `${method.toUpperCase()} ${path} ${code}`).toBeTruthy();
      }
    }
  });

  it('declares every tag it uses', () => {
    const declared = new Set(OPENAPI.tags.map((t) => t.name));
    for (const { op } of operations) for (const t of op.tags ?? []) expect(declared).toContain(t);
  });

  it('resolves every $ref against its own components — nothing dangles', () => {
    const schemas = (OPENAPI.components.schemas ?? {}) as Record<string, unknown>;
    const refs: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (!v || typeof v !== 'object') return;
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (k === '$ref' && typeof val === 'string') refs.push(val);
        else walk(val);
      }
    };
    walk(OPENAPI);
    expect(refs.length).toBeGreaterThan(10);
    for (const r of refs) {
      expect(r.startsWith('#/components/schemas/'), r).toBe(true);
      expect(Object.keys(schemas), r).toContain(r.replace('#/components/schemas/', ''));
    }
  });

  it('leaves no schema defined and unused', () => {
    const text = JSON.stringify(OPENAPI);
    for (const name of Object.keys(OPENAPI.components.schemas as Record<string, unknown>)) {
      expect(text.includes(`#/components/schemas/${name}`), `${name} is defined and never referenced`).toBe(true);
    }
  });
});

describe('OpenAPI — every documented route exists, and every route is documented', () => {
  it('🔴 resolves each documented path to a handler or a published file on disk', () => {
    const missing = [...new Set(operations.map((o) => o.path))]
      .filter((p) => !handlerFor(p).some((f) => existsSync(f)));
    expect(missing).toEqual([]);
  });

  it('🔴 documents every public route that exists', () => {
    /* Deliberately unpublished, each for a stated reason. This set may shrink;
       a route that appears here without a reason is the drift this test exists
       to catch. */
    const UNPUBLISHED = new Map([
      ['/api/admin', 'administrative, bearer token, never published'],
      ['/api/auth/password', 'password sign-in is being built this round; it is published once it is live'],
      ['/api/bluebutton', 'the Medicare import is written but unproven: CMS has issued no sandbox '
        + 'credentials yet, so no sign-in has round-tripped. Naming it on /developers would '
        + 'advertise a capability nobody has watched work. Published in the commit that proves it.'],
    ]);
    const documented = new Set(Object.keys(OPENAPI.paths));
    const files = fnFiles(`${root}cf/functions/api`);
    const undocumented = files
      .map(routeOf)
      .filter((r) => !documented.has(r) && !documented.has(withParams(r)))
      .filter((r) => ![...UNPUBLISHED.keys()].some((prefix) => r.startsWith(prefix)));
    expect(undocumented).toEqual([]);
  });
});

/* ---------- helpers: the function tree, as routes ---------- */
import { readdirSync, statSync } from 'node:fs';

function fnFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = `${dir}/${name}`;
    if (statSync(p).isDirectory()) { out.push(...fnFiles(p)); continue; }
    if (!name.endsWith('.js') || name.startsWith('_')) continue;
    out.push(p);
  }
  return out;
}

/** cf/functions/api/table/[id].js -> /api/table/{id} */
const routeOf = (file: string) =>
  file.replace(`${root}cf/functions`, '').replace(/\.js$/, '').replace(/\[(\w+)\]/g, '{$1}');

/** The export route is documented with the extension the caller actually types. */
const withParams = (r: string) => (r === '/api/export/{kind}' ? '/api/export/{kind}.csv' : r);

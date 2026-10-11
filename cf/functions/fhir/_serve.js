/* ==========================================================================
   GET /fhir/StructureDefinition/{id} and /fhir/CodeSystem/{id}

   The bundle names two URLs of our own: the APC extension and the price-table
   version code system. A canonical URL has to answer with the definition it
   names, or a FHIR validator reports the bundle as carrying an extension
   nobody can look up (R3-fedexpert FX-11). The definitions live in
   lib/fhir.ts beside the code that uses them, and are served from there.
   ========================================================================== */
import { APC_EXTENSION_DEFINITION, TABLE_VERSION_CODESYSTEM } from '../../../lib/fhir.ts';

export const DEFINITIONS = {
  StructureDefinition: { 'cms-apc': APC_EXTENSION_DEFINITION },
  CodeSystem: { 'price-table-version': TABLE_VERSION_CODESYSTEM },
};

const HEADERS = {
  'content-type': 'application/fhir+json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=3600',
};

export function serveDefinition(type, rawId) {
  const id = String(rawId || '').replace(/\.json$/, '');
  const def = DEFINITIONS[type] && Object.prototype.hasOwnProperty.call(DEFINITIONS[type], id) ? DEFINITIONS[type][id] : null;
  if (!def) {
    return new Response(JSON.stringify({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'not-found', diagnostics: `No ${type} named "${id}" is published here. Published: ${Object.keys(DEFINITIONS[type] || {}).join(', ') || 'none'}.` }],
    }), { status: 404, headers: HEADERS });
  }
  return new Response(JSON.stringify(def, null, 1), { status: 200, headers: HEADERS });
}

/* GET /api/openapi.json — the machine-readable description of every public route. */
import { OPENAPI } from '../../../lib/openapi.ts';

export function onRequestGet() {
  return new Response(JSON.stringify(OPENAPI, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}

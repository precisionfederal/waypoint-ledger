/* The JSON Schema for one condition entry, served as a file so an agency or an
   advocate can validate an entry before sending it. The same file the unit
   suite validates data/conditions.json against; nothing is copied. */
import schema from '@/data/conditions.schema.json';

export const dynamic = 'force-static';

export function GET() {
  return new Response(JSON.stringify(schema, null, 2) + '\n', {
    headers: { 'content-type': 'application/schema+json; charset=utf-8' },
  });
}

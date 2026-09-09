// Shared HTTP helpers for every Waypoint Ledger function. One definition.
export const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
export const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { ...JSON_HEADERS, ...extra } });
export const bad = (error, status = 400) => json({ ok: false, error }, status);
export const MAX_BODY = 16 * 1024;

/** Parse a JSON body with a size cap. Returns { body } or { error }. */
export async function readJson(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return { error: 'Body too large.' };
  let text;
  try { text = await request.text(); } catch { return { error: 'Body must be JSON.' }; }
  if (text.length > MAX_BODY) return { error: 'Body too large.' };
  try { const body = JSON.parse(text); return body && typeof body === 'object' ? { body } : { error: 'Body must be a JSON object.' }; }
  catch { return { error: 'Body must be JSON.' }; }
}

/* --------------------------------------------------------------------------
   ?dry=1 — VALIDATE A WRITE WITHOUT WRITING.

   A deploy has to prove the write path, and the register is a public record:
   a test row in it is a lie about how many people have spoken. So every public
   write accepts ?dry=1, which runs the real validator and the real storage
   check and returns 200 without inserting. What it proves: the request would be
   accepted, the D1 binding answers, the table is there and the chain has a head
   to append against. What it does not prove: that the INSERT itself succeeds —
   POST /api/health (admin token) proves that, in a canary table outside every
   chain, with the row deleted in the same transaction.
   -------------------------------------------------------------------------- */
export const isDryRun = (request) => { try { return new URL(request.url).searchParams.get('dry') === '1'; } catch { return false; } };
/**
 * @param {string} kind
 * @param {Record<string, unknown>} accepted   what the validator accepted, echoed back
 * @param {Record<string, unknown>|null} [storage]  the result of writeProbe(), or null
 */
export const dryOk = (kind, accepted, storage = null) => json({
  ok: true, dryRun: true, kind, accepted, storage,
  note: 'Validated only. Nothing was written, and no published count moved. Remove ?dry=1 to record it.',
});

export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const slug = (n = 10) => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; const b = crypto.getRandomValues(new Uint8Array(n)); return Array.from(b, (x) => a[x % a.length]).join(''); };

/** Small validators. Each returns the cleaned value or undefined. */
export const str = (v, max = 400) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
export const oneOf = (v, set) => (set.includes(v) ? v : undefined);
export const int = (v, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : undefined; };
export const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined);
export const channelOf = (v) => (typeof v === 'string' && /^[a-z0-9-]{1,24}$/.test(v) ? v : 'direct');

/** Count an aggregate event (no PII). Never throws. */
export async function count(env, name) {
  try { await env.DB.prepare('INSERT INTO events(day,name,count) VALUES(?1,?2,1) ON CONFLICT(day,name) DO UPDATE SET count=count+1').bind(now().slice(0, 10), name).run(); } catch { /* counters are best effort */ }
}

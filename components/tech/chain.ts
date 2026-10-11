/* ==========================================================================
   /integrity, "check it in this browser" (VISUAL tech, 2026-09-30 night).

   The same method as the Python recipe on the page, in the reader's own
   browser: download the published CSV, recompute (corrections) or link-check
   (survey, gap) every row from the top, and compare the last hash with the
   head /api/integrity published. Nothing is sent anywhere; GET only.

   It mirrors cf/functions/api/_hash.js exactly: SHA-256 over
   prev_hash + canonical JSON (keys sorted, no whitespace, missing = null),
   and the corrections projection received_at, price_id, verdict,
   believed_usd, table_version. tests/tech-chain.test.ts builds rows with the
   server's own rowHash() and checks this file agrees with it.
   ========================================================================== */

export const GENESIS = '0'.repeat(64);

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes.
 *  Lines that start with # before the header are comments (the corrections file opens with one). */
export function parseCsv(text: string): Record<string, string>[] {
  const body = text.replace(/^(#[^\n]*\n)+/, '');
  const rows: string[][] = [];
  let row: string[] = [], f = '', q = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (q) {
      if (c === '"') { if (body[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && body[i + 1] === '\n') i++;
      row.push(f); f = ''; rows.push(row); row = [];
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const [head, ...rest] = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  if (!head) return [];
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

/** A cell a spreadsheet would run is published with a leading apostrophe; strip that one character. */
const cell = (s: string) => (s.startsWith("'") && /^[=+\-@\t\r]/.test(s.slice(1, 2)) ? s.slice(1) : s);
const num = (s: string) => (s === '' ? null : Number(s));

export function canonical(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface Walk {
  /** what was done: every hash recomputed, or every link checked */
  mode: 'recompute' | 'links';
  /** the published row_hash of each row, in order */
  hashes: string[];
  /** per row: it recomputes (recompute) or it links to the row above (links) */
  ok: boolean[];
  /** the last hash, and whether it equals the published head with the published row count */
  last: string;
  matchesHead: boolean;
}

export async function recomputeCorrections(rows: Record<string, string>[], head: string, count: number): Promise<Walk> {
  let prev = GENESIS;
  const hashes: string[] = [], ok: boolean[] = [];
  for (const r of rows) {
    const fields = {
      received_at: cell(r.received_at ?? ''),
      price_id: cell(r.price_id ?? ''),
      verdict: cell(r.verdict ?? ''),
      believed_usd: num(r.believed_usd ?? ''),
      table_version: cell(r.table_version ?? '') || null,
    };
    prev = await sha256Hex(prev + canonical(fields));
    hashes.push(r.row_hash ?? '');
    ok.push(prev === r.row_hash);
  }
  return { mode: 'recompute', hashes, ok, last: prev, matchesHead: prev === head && rows.length === count && ok.every(Boolean) };
}

export function checkLinks(rows: Record<string, string>[], head: string, count: number): Walk {
  let prev = GENESIS;
  const hashes: string[] = [], ok: boolean[] = [];
  for (const r of rows) {
    ok.push(r.prev_hash === prev);
    hashes.push(r.row_hash ?? '');
    prev = r.row_hash ?? '';
  }
  return { mode: 'links', hashes, ok, last: prev, matchesHead: prev === head && rows.length === count && ok.every(Boolean) };
}

/** Which chains publish a file this browser can check, and how. */
export const CHECKABLE: Record<string, { file: string; mode: Walk['mode'] }> = {
  corrections: { file: '/api/export/corrections.csv', mode: 'recompute' },
  survey_responses: { file: '/api/export/survey.csv', mode: 'links' },
  gap_reports: { file: '/api/export/gap.csv', mode: 'links' },
};

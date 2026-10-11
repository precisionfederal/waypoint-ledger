/* VISUAL tech (2026-09-30 night): /integrity's "check it in this browser"
   must agree with the server's own chain (cf/functions/api/_hash.js). Rows are
   hashed here with the server's rowHash(), written out the way the export
   writes them (a comment line first, quoted cells), then walked by
   components/tech/chain.ts. One edited row must break it. */
import { describe, it, expect } from 'vitest';
import { rowHash, GENESIS } from '../cf/functions/api/_hash.js';
import { parseCsv, recomputeCorrections, checkLinks, canonical } from '../components/tech/chain';

const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

async function build() {
  const raw = [
    { received_at: '2026-09-10T15:25:26.848Z', price_id: 'cms-99213', verdict: 'wrong', believed_usd: 185, table_version: '2026-09-09.1', label: "Doctor's office visit, established patient, low complexity" },
    { received_at: '2026-10-01T02:34:03.303Z', price_id: 'cms-99213', verdict: 'right', believed_usd: null, table_version: '2026-09-09.1', label: 'Visit, "quoted"' },
    { received_at: '2026-10-01T02:34:06.137Z', price_id: 'cms-test-emg', verdict: 'right', believed_usd: 12.5, table_version: '', label: 'EMG' },
  ];
  let prev = GENESIS;
  const lines = ['# Waypoint Ledger, a comment, with commas', 'received_at,price_id,label,verdict,believed_usd,table_version,row_hash'];
  for (const r of raw) {
    const h = await rowHash(prev, { received_at: r.received_at, price_id: r.price_id, verdict: r.verdict, believed_usd: r.believed_usd, table_version: r.table_version || null });
    lines.push([r.received_at, r.price_id, q(r.label), r.verdict, r.believed_usd == null ? '' : String(r.believed_usd), r.table_version, h].join(','));
    prev = h;
  }
  return { csv: lines.join('\n') + '\n', head: prev };
}

describe('the browser check agrees with the server chain', () => {
  it('canonical JSON is the server canonical', () => {
    expect(canonical({ b: 1, a: [null, 'x'], c: undefined })).toBe('{"a":[null,"x"],"b":1,"c":null}');
  });
  it('recomputes every corrections row and reaches the head', async () => {
    const { csv, head } = await build();
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[1].label).toBe('Visit, "quoted"');
    const w = await recomputeCorrections(rows, head, 3);
    expect(w.ok).toEqual([true, true, true]);
    expect(w.matchesHead).toBe(true);
  });
  it('an edited row breaks it from that row on, and the head no longer matches', async () => {
    const { csv, head } = await build();
    const rows = parseCsv(csv.replace(',wrong,185,', ',wrong,186,'));
    const w = await recomputeCorrections(rows, head, 3);
    expect(w.ok[0]).toBe(false);
    expect(w.matchesHead).toBe(false);
  });
  it('checks links the way survey.csv and gap.csv are published', () => {
    const rows = [{ prev_hash: GENESIS, row_hash: 'a'.repeat(64) }, { prev_hash: 'a'.repeat(64), row_hash: 'b'.repeat(64) }];
    expect(checkLinks(rows, 'b'.repeat(64), 2).matchesHead).toBe(true);
    expect(checkLinks([rows[1]], 'b'.repeat(64), 1).ok).toEqual([false]);
    expect(checkLinks([], GENESIS, 0).matchesHead).toBe(true);
  });
});

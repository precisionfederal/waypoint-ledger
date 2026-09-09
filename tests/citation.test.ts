/* ==========================================================================
   A CORRECTION HAS TO BE ACTIONABLE WITHOUT OUR BUNDLE.

   Honey asked for a demand signal her staff could use. A CSV of
   `price_id, verdict, row_hash` is not one: an analyst holding `cms-99213`
   cannot act on it without joining back to us. GET /api/citation/{id} is the
   join, done on our side — the publisher, the document, the URL, the code, the
   published value, its basis, the population it describes, and the counts, in
   one call, as JSON or as text you can paste into an email.

   These tests drive the real handler against a stub D1, so what is asserted is
   what the route returns.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { onRequestGet } from '../cf/functions/api/citation/[id].js';
import { TABLE } from '../lib/table';
import { PUBLISHER_FULL, publisherOf } from '../lib/register-cite';

/** A D1 stub that answers the one query the route makes. */
const envWith = (rows: { verdict: string; believed_usd: number | null }[], fail = false) => ({
  DB: {
    prepare() {
      return {
        bind() {
          return {
            async all() { if (fail) throw new Error('down'); return { results: rows }; },
          };
        },
      };
    },
  },
});

const req = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://waypoint-ledger.pages.dev${path}`, { headers });

const call = (id: string, env: unknown, path = `/api/citation/${id}`, headers = {}) =>
  onRequestGet({ params: { id }, request: req(path, headers), env } as never);

const row = TABLE.find((i) => i.id === 'cms-99213')!;

describe('GET /api/citation/{id}', () => {
  it('returns the row’s provenance without a single count on file', async () => {
    const res = await call('cms-99213', envWith([]));
    expect(res.status).toBe(200);
    const b = await res.json() as Record<string, never>;
    expect(b.ok).toBe(true);
    expect(b.priceId).toBe('cms-99213');
    const fig = b.figure as unknown as Record<string, unknown>;
    expect(fig.publishedValueUsd).toBe(row.valueUsd);
    expect(fig.year).toBe(row.year);
    expect(fig.basis).toBe(row.basis);
    expect(fig.population).toBe(row.population);
    expect(fig.code).toBe(row.code);
    const by = b.publishedBy as unknown as Record<string, unknown>;
    expect(by.agency).toBe(publisherOf(row.sourceTitle));
    expect(by.agencyFullName).toBe(PUBLISHER_FULL[publisherOf(row.sourceTitle)]);
    expect(by.sourceUrl).toBe(row.sourceUrl);
    expect(by.document).toBeTruthy();
    const sig = b.publicSignal as unknown as Record<string, unknown>;
    expect(sig.n).toBe(0);
    expect(sig.fitRatePct).toBeNull();
    expect(sig.publicMedianBelievedUsd).toBeNull();
  });

  it('counts the thumbs and the median of what people said they paid', async () => {
    const res = await call('cms-99213', envWith([
      { verdict: 'wrong', believed_usd: 300 },
      { verdict: 'wrong', believed_usd: 180 },
      { verdict: 'right', believed_usd: null },
      { verdict: 'wrong', believed_usd: 240 },
    ]));
    const sig = (await res.json() as Record<string, never>).publicSignal as unknown as Record<string, number | string>;
    expect(sig.n).toBe(4);
    expect(sig.flaggedWrong).toBe(3);
    expect(sig.confirmedRight).toBe(1);
    expect(sig.fitRatePct).toBe(25);
    expect(sig.publicMedianBelievedUsd).toBe(240);   // median of 180, 240, 300
    expect(String(sig.medianNote)).toContain('never used to price a ledger');
    expect(String(sig.sample)).toContain('no weighting, no imputation');
  });

  it('🔴 never lets the public median be read as a price', async () => {
    const res = await call('cms-99213', envWith([{ verdict: 'wrong', believed_usd: 999 }]));
    const b = await res.json() as Record<string, never>;
    expect(String(b.text)).toContain('demand signal about the published figure');
    expect(String(b.text)).not.toMatch(/actual price|the real price/i);
  });

  it('serves the same block as plain text on ?format=text, ready to paste', async () => {
    const res = await call('cms-99213', envWith([]), '/api/citation/cms-99213?format=text');
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const t = await res.text();
    expect(t).toContain('PUBLIC CORRECTION REPORT');
    expect(t).toContain('cms-99213');
    expect(t).toContain(row.sourceUrl);
    expect(t).toContain(String(row.valueUsd));
  });

  it('honours Accept: text/plain the same way', async () => {
    const res = await call('cms-99213', envWith([]), '/api/citation/cms-99213', { accept: 'text/plain' });
    expect(res.headers.get('content-type')).toContain('text/plain');
  });

  it('answers for every row in the published table, not just the CMS ones', async () => {
    for (const item of TABLE) {
      const res = await call(item.id, envWith([]));
      expect(res.status, item.id).toBe(200);
      const b = await res.json() as Record<string, never>;
      expect((b.publishedBy as unknown as Record<string, string>).sourceUrl, item.id).toBe(item.sourceUrl);
      expect(String(b.text), item.id).toContain(item.label);
    }
  });

  it('404s an identifier that is not a published figure, and says where the ids are', async () => {
    const res = await call('not-a-row', envWith([]));
    expect(res.status).toBe(404);
    const b = await res.json() as { error: string };
    expect(b.error).toContain('not-a-row');
    expect(b.error).toContain('/data/price-table.csv');
  });

  it('says the register is unreadable rather than reporting zero counts as fact', async () => {
    const res = await call('cms-99213', envWith([], true));
    expect(res.status).toBe(503);
    const b = await res.json() as { error: string };
    expect(b.error).toContain('/api/table/cms-99213');
  });

  it('points at the plain-text form and the method page on the host it was called on', async () => {
    const b = await (await call('cms-99213', envWith([]))).json() as Record<string, string>;
    expect(b.plainTextUrl).toBe('https://waypoint-ledger.pages.dev/api/citation/cms-99213?format=text');
    expect(b.methodUrl).toBe('https://waypoint-ledger.pages.dev/method');
  });
});

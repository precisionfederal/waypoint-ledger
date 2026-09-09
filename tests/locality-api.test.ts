/* ==========================================================================
   THE GET AN AGENCY HARVESTS MUST CARRY GEOGRAPHY.

   R3, scale, verbatim: "GET /api/table/cms-99213?locality=IA-00 returns the
   national figure — the locality is silently ignored." POST /api/price had been
   fixed a round earlier; the read-only endpoint a data steward would actually
   crawl had not. An answer to a question nobody asked, returned with no warning,
   is the worst failure this API can have: it is wrong and it looks right.

   These run the real handlers, not a description of them.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { onRequestGet as tableGet } from '../cf/functions/api/table.js';
import { onRequestGet as itemGet } from '../cf/functions/api/table/[id].js';
import { onRequestGet as localitiesGet } from '../cf/functions/api/localities.js';
import { onRequestGet as localityGet } from '../cf/functions/api/localities/[key].js';
import { TABLE } from '../lib/table';
import { LOCALITIES, LOCALITY_ROW_COUNT, localityFigure } from '../lib/fit';

const req = (url: string) => ({ request: new Request(`https://waypoint-ledger.pages.dev${url}`) });
const body = async (res: Response) => JSON.parse(await res.text());
const get = async (url: string) => body(await tableGet(req(url)));
const item = async (id: string, qs = '') => body(await itemGet({ ...req(`/api/table/${id}${qs}`), params: { id } }));

/* The row every round has used as its worked example: an established-patient
   office visit, level 3. Its Iowa figure comes from the published table, never
   from a number typed into this test. */
const IOWA = 'IA-00';
const CODE = 'cms-99213';
const iowaUsd = localityFigure(CODE, IOWA);
const nationalUsd = TABLE.find((t) => t.id === CODE)!.valueUsd;

describe('GET /api/table?locality=', () => {
  it('🔴 returns the locality figure, and it is not the national one', async () => {
    const r = await get(`/api/table?locality=${IOWA}`);
    const row = r.items.find((i: any) => i.id === CODE);
    expect(iowaUsd).not.toBeNull();
    expect(row.localityUsd).toBe(iowaUsd);
    expect(row.nationalUsd).toBe(nationalUsd);
    expect(row.localityUsd).not.toBe(row.nationalUsd);
    expect(r.locality.key).toBe(IOWA);
    expect(r.locality.stateName).toBe('Iowa');
  });

  it('never overwrites the published national figure', async () => {
    const r = await get(`/api/table?locality=${IOWA}`);
    const row = r.items.find((i: any) => i.id === CODE);
    expect(row.valueUsd).toBe(nationalUsd);
  });

  it('🔴 shows the arithmetic: RVU x GPCI, summed, times the conversion factor', async () => {
    const r = await get(`/api/table?locality=${IOWA}`);
    const f = r.items.find((i: any) => i.id === CODE).localityFormula;
    expect(f.parts.map((p: any) => p.name)).toEqual(['Work', 'Practice expense', 'Malpractice']);
    for (const p of f.parts) expect(p.product).toBeCloseTo(p.rvu * p.gpci, 6);
    const sum = f.parts.reduce((a: number, p: any) => a + p.rvu * p.gpci, 0);
    expect(f.rvuSum).toBeCloseTo(sum, 6);
    expect(f.total).toBe(Math.round(sum * f.conversionFactor * 100) / 100);
    expect(f.total).toBe(iowaUsd);
  });

  it('says how many rows carry a locality figure, and why the rest do not', async () => {
    const r = await get(`/api/table?locality=${IOWA}`);
    expect(r.localityPricedCount).toBe(LOCALITY_ROW_COUNT);
    expect(r.localityNote).toContain('Iowa');
    const without = r.items.find((i: any) => i.localityUsd === null);
    expect(without.localityNote).toContain('geographic practice cost indices');
  });

  it('takes a state when the state has exactly one locality', async () => {
    const r = await get('/api/table?state=IA');
    expect(r.locality.key).toBe(IOWA);
  });

  it('🔴 refuses an unknown locality with a sentence rather than ignoring it', async () => {
    const res = await tableGet(req('/api/table?locality=ZZ-99'));
    expect(res.status).toBe(400);
    const b = await body(res);
    expect(b.ok).toBe(false);
    expect(b.error).toContain('ZZ-99');
  });

  it('🔴 refuses a state with more than one locality, and names them', async () => {
    const res = await tableGet(req('/api/table?state=TX'));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toMatch(/TX-\d\d/);
  });

  it('carries the locality into ?slim=1 as well', async () => {
    const r = await get(`/api/table?slim=1&locality=${IOWA}`);
    const row = r.items.find((i: any) => i.id === CODE);
    expect(row.localityUsd).toBe(iowaUsd);
    expect(row.coverage).toBeUndefined();
  });

  it('is unchanged when no place is named', async () => {
    const r = await get('/api/table');
    expect(r.locality).toBeNull();
    expect(r.localityNote).toBeNull();
    expect(r.items.find((i: any) => i.id === CODE).valueUsd).toBe(nationalUsd);
  });
});

describe('GET /api/table/{id}?locality=', () => {
  it('🔴 answers for the place asked about, with the range across all localities', async () => {
    const r = await item(CODE, `?locality=${IOWA}`);
    expect(r.item.localityUsd).toBe(iowaUsd);
    expect(r.localityRange.localityCount).toBe(LOCALITIES.length);
    expect(r.localityRange.lowUsd).toBeLessThan(r.localityRange.highUsd);
    expect(r.localityRange.lowLocalityName).toBeTruthy();
  });

  it('refuses an unknown place here too', async () => {
    const res = await itemGet({ ...req(`/api/table/${CODE}?state=ZZ`), params: { id: CODE } });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/localities', () => {
  it('indexes every locality CMS publishes, with its MAC and its three indices', async () => {
    const r = await body(await localitiesGet());
    expect(r.count).toBe(LOCALITIES.length);
    expect(r.figuresPublished).toBe(LOCALITY_ROW_COUNT * LOCALITIES.length);
    const ia = r.items.find((l: any) => l.key === IOWA);
    expect(ia.stateName).toBe('Iowa');
    expect(ia.mac).toBeTruthy();
    for (const k of ['workGpci', 'practiceExpenseGpci', 'malpracticeGpci']) expect(typeof ia[k]).toBe('number');
  });

  it('returns one locality with every figure published for it', async () => {
    const r = await body(await localityGet({ params: { key: 'ia-00' } }));
    expect(r.locality.key).toBe(IOWA);
    expect(r.count).toBe(LOCALITY_ROW_COUNT);
    const row = r.items.find((i: any) => i.id === CODE);
    expect(row.localityUsd).toBe(iowaUsd);
    expect(row.nationalUsd).toBe(nationalUsd);
    expect(row.sourceUrl).toMatch(/^https:\/\//);
    expect(row.formula.total).toBe(iowaUsd);
  });

  it('🔴 every figure it returns re-derives from the indices on its own row', async () => {
    const r = await body(await localityGet({ params: { key: IOWA } }));
    for (const row of r.items) {
      if (!row.formula) continue;
      const sum = row.formula.parts.reduce((a: number, p: any) => a + p.rvu * p.gpci, 0);
      expect(Math.round(sum * r.conversionFactor * 100) / 100, row.id).toBe(row.localityUsd);
    }
  });

  it('a key that is not a locality is a 404 that says what a key looks like', async () => {
    const res = await localityGet({ params: { key: 'ZZ-99' } });
    expect(res.status).toBe(404);
    expect((await body(res)).error).toContain('IA-00');
  });
});

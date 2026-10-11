/* ==========================================================================
   ROUND 5 · WHAT YOU PAID (ASKS §3 row 4, Bo to Dr. Honey 9/10; §2 rank 10;
   R3 brainfog BF-09). The store, the totals, the roll-up, the saved journey,
   the share link, the FHIR bundle, and the invariant the demo depends on:
   with no paid amount the ledger and the sheet render exactly as round 4 did.
   ========================================================================== */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import Ajv, { type ValidateFunction } from 'ajv';
import draft06 from 'ajv/dist/refs/json-schema-draft-06.json';
import Ledger from '../components/Ledger';
import Sheet from '../app/sheet/page';
import { demoEntries, fakeStore, renderWith } from './helpers/ledger-render';
import {
  cleanPaid, gapPhrase, paidFieldsIn, paidFieldsOut, paidLineTotal, paidSummary, signedMoney, withPaid,
  NO_FIGURE_GROUP,
} from '../lib/paid';
import { priceJourney, totals, usd } from '../lib/pricing';
import { decodeShare, encodeShare, savedRowsOf, sharePayload, splitSaved } from '../lib/store';
import { validateJourney } from '../lib/price-api';
import { TABLE, SELECTABLE, TABLE_VERSION } from '../lib/table';
import { toFhirBundle, PAID_CODE_TEXT } from '../lib/fhir';
import type { JourneyEntry } from '../lib/types';

const money = (n: number) => usd(n, true);
const priced = (entries: JourneyEntry[]) => priceJourney(entries);

/* ---------- 1. the numbers ---------- */

describe('a paid amount is the person’s own number, cleaned and kept to the cent', () => {
  it('accepts dollars and cents, typed or numeric, and refuses anything else', () => {
    expect(cleanPaid(340)).toBe(340);
    expect(cleanPaid('85.5')).toBe(85.5);
    expect(cleanPaid('$1,204.199')).toBe(1204.2);
    expect(cleanPaid(0)).toBe(0);
    for (const bad of [-1, '', '  ', 'abc', NaN, Infinity, 1_000_001, null, undefined, {}]) expect(cleanPaid(bad)).toBeNull();
  });
  it('a line’s paid total is the amount, or the amount times the person’s own count when it was for each one', () => {
    const [visit] = demoEntries();
    expect(paidLineTotal(visit)).toBeNull();
    expect(paidLineTotal({ ...visit, paid: 300 })).toBe(300);
    expect(paidLineTotal({ ...visit, paid: 120, paidEach: true })).toBe(360);
    expect(paidLineTotal({ ...visit, times: 1, paid: 120, paidEach: true })).toBe(120);
  });
  it('withPaid sets and clears one line and leaves every other line alone', () => {
    const e = demoEntries();
    const a = withPaid(e, 'k1', 120, true);
    expect(a[0].paid).toBe(120); expect(a[0].paidEach).toBe(true);
    expect(a.slice(1)).toEqual(e.slice(1));
    const b = withPaid(a, 'k1', null);
    expect(b[0]).toEqual(e[0]);
    /* "each" means nothing on a line that happened once */
    expect(withPaid(e, 'k2', 50, true)[1].paidEach).toBeUndefined();
  });
  it('says the difference in plain words', () => {
    expect(gapPhrase(244.81, 'Medicare figure', money)).toBe('$244.81 more than the Medicare figure');
    expect(gapPhrase(-20, 'Medicare figure', money)).toBe('$20.00 less than the Medicare figure');
    expect(gapPhrase(0, 'federal figure', money)).toBe('the same as the federal figure');
    expect(signedMoney(12.5, money)).toBe('+$12.50');
    expect(signedMoney(-12.5, money)).toBe('−$12.50');
  });
});

describe('the roll-up: separate total, difference only where both exist, by kind of care', () => {
  const base = demoEntries();
  const federalBefore = totals(priced(base));

  it('with no paid amount there is nothing to show', () => {
    const s = paidSummary(priced(base));
    expect(s.any).toBe(false);
    expect(s.paidUsd).toBe(0);
    expect(s.groups).toEqual([]);
  });

  it('adds up what was paid, compares it only on lines with a federal figure, and groups it', () => {
    let e = withPaid(base, 'k1', 120, true);          // office visit: $120 × 3 = $360 vs 3 × $95.19
    e = withPaid(e, 'k3', 900);                        // echo: $900 vs $196.73
    e = withPaid(e, 'k5', 250);                        // nerve conduction, no federal figure
    const lines = priced(e);
    const s = paidSummary(lines);
    const visit = lines.find((l) => l.entry.key === 'k1')!.totalUsd!;
    const echo = lines.find((l) => l.entry.key === 'k3')!.totalUsd!;
    expect(s.any).toBe(true);
    expect(s.paidUsd).toBe(1510);
    expect(s.paidLines).toBe(3);
    expect(s.compared).toBe(2);
    expect(s.comparedPaidUsd).toBe(1260);
    expect(s.comparedFederalUsd).toBeCloseTo(visit + echo, 2);
    expect(s.gapUsd).toBeCloseTo(1260 - (visit + echo), 2);
    expect(s.noFigureLines).toBe(1);
    expect(s.noFigurePaidUsd).toBe(250);
    expect(s.figureName).toBe('Medicare figure');
    /* groups use the categories the ledger already has; the largest difference first, no-figure last */
    expect(s.groups.map((g) => g.key)).toEqual(['img', 'visit', NO_FIGURE_GROUP.key]);
    expect(s.groups[0]).toMatchObject({ label: 'Scans and imaging', lines: 1, paidUsd: 900, compared: 1 });
    expect(s.groups[2]).toMatchObject({ label: 'No federal figure', paidUsd: 250, compared: 0, gapUsd: null });
  });

  it('never changes the federal total', () => {
    const e = withPaid(withPaid(base, 'k1', 5000), 'k5', 250);
    const after = totals(priced(e));
    expect(after.totalUsd).toBe(federalBefore.totalUsd);
    expect(after.pricedCount).toBe(federalBefore.pricedCount);
    expect(after.unpricedCount).toBe(federalBefore.unpricedCount);
  });
});

/* ---------- 2. where the number may travel ---------- */

describe('a paid amount goes with a saved journey and never in a share link', () => {
  const e = withPaid(withPaid(demoEntries(), 'k1', 120, true), 'k5', 250);

  it('the saved rows carry it, per line', () => {
    const { rows } = savedRowsOf(e, []);
    expect(rows[0]).toMatchObject({ itemId: 'cms-99213', times: 3, paid: 120, paidEach: true });
    expect(rows[4]).toMatchObject({ itemId: null, paid: 250 });
    expect(rows[4].paidEach).toBeUndefined();
    expect(rows[1].paid).toBeUndefined();
  });

  it('the server keeps it, checks it, and refuses a bad one', () => {
    const { rows } = savedRowsOf(e, []);
    const ok = validateJourney({ entries: rows }, TABLE);
    expect('entries' in ok && ok.entries[0]).toMatchObject({ paid: 120, paidEach: true });
    expect('entries' in ok && ok.entries[4]).toMatchObject({ paid: 250 });
    expect('entries' in ok && 'paid' in ok.entries[1]).toBe(false);
    for (const paid of [-5, 'lots', 2_000_000]) {
      const r = validateJourney({ entries: [{ raw: 'echo', itemId: 'cms-img-echo', times: 1, paid }] }, TABLE);
      expect('error' in r && r.error).toMatch(/paid must be an amount/);
    }
  });

  it('reads back from a saved journey onto the same line', () => {
    const { rows } = savedRowsOf(e, []);
    const { lines } = splitSaved(rows);
    expect(paidFieldsIn(lines[0])).toEqual({ paid: 120, paidEach: true });
    expect(paidFieldsIn(lines[4])).toEqual({ paid: 250 });
    expect(paidFieldsOut(e[1])).toEqual({});
  });

  it('a share link carries no paid amount', () => {
    expect(JSON.stringify(sharePayload(e))).not.toMatch(/120|250|paid/);
    const back = decodeShare(encodeShare(e))!;
    expect(back.entries.every((x) => x.paid === undefined)).toBe(true);
  });

  it('the Wrong box still posts only what it did before, and the store keeps the amount on the line', () => {
    const src = readFileSync('lib/store.tsx', 'utf8');
    expect(src).toContain("priceId: item.id, verdict, believedValueUsd, ...(note ? { note } : {}),");
    expect(src).toMatch(/withPaid\(p, line\.key, usd, true\)/);
  });
});

/* ---------- 3. the invariant: no paid amount, no change ---------- */

describe('with no paid amount the ledger and the sheet are exactly round 4', () => {
  /* The ledger baseline is captured from commit c64e0174f2 (the DESIGN R1
     merge, before round 5 joined it) with the same six demo lines; the sheet
     baseline from 687fc8dc64, which the redesign did not change, re-rendered by SHEET4 (JUDGE-6 #8) for one
     change only: the sources list cites a repeated source by its number and prints addresses without "www.". The only addition is the "Add what you paid" link in the ledger's
     foot row, below the exports; it is removed here and nothing else may differ. */
  const before = readFileSync('tests/fixtures/ledger-no-paid-c64e0174f2.html', 'utf8');
  const sheetBefore = readFileSync('tests/fixtures/sheet-no-paid-687fc8dc64.html', 'utf8');
  const FOOT_LINK = '<button class="link-btn" type="button">Add what you paid</button>';

  it('the ledger markup is byte-for-byte the same, apart from the one foot link', () => {
    const now = renderWith(Ledger, fakeStore(demoEntries()));
    expect(now.split(FOOT_LINK).length).toBe(2);
    // FINAL-1011 face: the hospital range under each row's figure is new, and the only other addition.
    expect(now.replace(FOOT_LINK, '').replace(/<button type="button" class="[^"]*" data-private-face="[^"]*"[^>]*>.*?<\/button>/g, '')).toBe(before);
  });

  it('no paid column, card, strip or form is rendered', () => {
    const now = renderWith(Ledger, fakeStore(demoEntries()));
    for (const s of ['What you paid</th>', 'paid-cell', 'paid-card', 'paid-strip', 'paid-dlg', 'colSpan="6"']) expect(now).not.toContain(s);
    expect(now).toContain('colSpan="5"');
  });

  it('the sheet markup is byte-for-byte the same', () => {
    const now = renderWith(Sheet, fakeStore(demoEntries())).replace(/Prepared [A-Z][a-z]+ \d{1,2}, \d{4}/, 'Prepared DATE');
    expect(now).toBe(sheetBefore);
  });
});

describe('with a paid amount the ledger and the sheet show it beside the federal figure', () => {
  const e = withPaid(withPaid(demoEntries(), 'k3', 900), 'k5', 250);
  const html = renderWith(Ledger, fakeStore(e));
  const none = renderWith(Ledger, fakeStore(demoEntries()));

  it('adds the column, the separate total and the roll-up, in plain words', () => {
    expect(html).toContain('What you paid</th>');
    expect(html).toContain('colSpan="6"');
    expect(html).toContain('You paid $1,150.00');
    expect(html).toContain('Difference from the Medicare figure');
    expect(html).toContain('What you paid, by kind of care');
    expect(html).toContain('$703.27 more than the Medicare figure');    // 900 − 196.73
    expect(html).toContain('no federal figure to compare');
    expect(html).toContain('never added to them');
  });

  it('the federal total is the same string with or without it', () => {
    const hero = (h: string) => /Published figures for this pattern of care[\s\S]{0,600}?\$[\d,]+(\.\d\d)?/.exec(h)?.[0];
    expect(hero(html)).toBeTruthy();
    expect(hero(html)).toBe(hero(none));
  });

  it('the sheet prints the paid column and its own totals', () => {
    const sheet = renderWith(Sheet, fakeStore(e));
    expect(sheet).toContain('What I paid</th>');
    expect(sheet).toContain('I paid $1,150.00');
    expect(sheet).toContain('class="sheet-paid"');
    expect(sheet).toContain('a difference from the Medicare figure of +$703.27');
    /* the unpriced nerve study with a paid amount prints as a cost row */
    expect(sheet).toContain('$250.00');
  });
});

/* ---------- 4. FHIR: a patient-reported Observation, schema-valid ---------- */

function unzipSingleEntry(zip: Buffer): string {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  const cd = zip.readUInt32LE(eocd + 16);
  const compressedSize = zip.readUInt32LE(cd + 20);
  const localHeader = zip.readUInt32LE(cd + 42);
  const start = localHeader + 30 + zip.readUInt16LE(localHeader + 26) + zip.readUInt16LE(localHeader + 28);
  return inflateRawSync(zip.subarray(start, start + compressedSize)).toString('utf8');
}

describe('FHIR R4: what the person paid rides as their own Observation, never as a charge', () => {
  let validate: ValidateFunction;
  beforeAll(() => {
    const schema = JSON.parse(unzipSingleEntry(readFileSync('tests/fixtures/fhir.schema.json.zip'))) as Record<string, unknown>;
    delete schema.id;
    const ajv = new Ajv({ strict: false, allowUnionTypes: true, validateFormats: false });
    ajv.addMetaSchema(draft06);
    ajv.addSchema(schema, 'fhir');
    validate = ajv.compile({ $ref: 'fhir#/definitions/Bundle' });
  }, 120_000);
  const opts = () => { let n = 0; return { tableVersion: TABLE_VERSION, now: () => '2026-10-01T00:00:00.000Z', uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }; };

  it('with no paid amount the bundle is unchanged', () => {
    const a = toFhirBundle(demoEntries(), SELECTABLE, opts());
    expect(a.counts.paidObservations).toBe(0);
    expect(a.bundle.entry.some((x) => (x.resource.code as { text?: string } | undefined)?.text === PAID_CODE_TEXT)).toBe(false);
  });

  it('adds one valid Observation per paid line, pointing at the line, and leaves every ChargeItem as it was', () => {
    const plain = toFhirBundle(demoEntries(), SELECTABLE, opts());
    const e = withPaid(withPaid(demoEntries(), 'k1', 120, true), 'k5', 250);
    const out = toFhirBundle(e, SELECTABLE, opts());
    expect(out.counts.paidObservations).toBe(2);
    expect(out.bundle.entry.length).toBe(plain.bundle.entry.length + 2);
    const ok = validate(out.bundle);
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
    const paidObs = out.bundle.entry.map((x) => x.resource).filter((r) => (r.code as { text?: string } | undefined)?.text === PAID_CODE_TEXT);
    expect(paidObs[0]).toMatchObject({ resourceType: 'Observation', status: 'final', valueQuantity: { value: 360, unit: 'USD', system: 'urn:iso:std:iso:4217', code: 'USD' } });
    expect(JSON.stringify(paidObs[0].note)).toMatch(/Reported by the person.*\$120\.00 each × 3.*not added to any ChargeItem/);
    const focus = (paidObs[0].focus as { reference: string }[])[0].reference;
    expect(out.bundle.entry.find((x) => x.fullUrl === focus)?.resource.resourceType).toBe('Encounter');
    const charges = (b: typeof out) => b.bundle.entry.filter((x) => x.resource.resourceType === 'ChargeItem').map((x) => x.resource.priceOverride);
    expect(charges(out)).toEqual(charges(plain));
  });
});

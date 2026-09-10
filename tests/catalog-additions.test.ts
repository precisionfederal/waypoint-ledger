/* The 2026-09-09 widening of the price table — 157 more units of care.

   A person types what happened to them. A unit the table does not hold reads to
   them as "this tool has no figure for me", so on 2026-09-09 the table was
   widened with the things patients actually name. These tests exist so that the
   widening can never become the way an untraceable figure gets in: every added
   row must still carry its CMS file, its code and the arithmetic on the face of
   its own coverage statement, and this file re-does that arithmetic from the
   sentence the patient reads rather than trusting the number beside it.

   data/verify_additions.py is the harder check — it re-reads the CMS CSVs
   themselves. This is the check that runs on every commit without them. */
import { describe, it, expect } from 'vitest';
import prices from '../data/prices.json';
import additions from '../data/prices-additions-2026-09-09.json';
import { TABLE, SELECTABLE } from '../lib/table';
import { mapUtterance } from '../lib/mapper';

const CF = 33.4009;
const rows = additions.items as Array<Record<string, any>>;
const published = prices.items as Array<Record<string, any>>;

describe('the widening reached the table', () => {
  it('adds 157 rows, 116 from the fee schedule and 41 from the lab schedule', () => {
    expect(rows.length).toBe(157);
    expect(rows.filter((r) => r.confidence === 'DERIVED').length).toBe(116);
    expect(rows.filter((r) => r.confidence === 'VERIFIED').length).toBe(41);
  });

  it('every added row is in TABLE and is priced and addable', () => {
    const inTable = new Set(TABLE.map((t) => t.id));
    const addable = new Set(SELECTABLE.map((t) => t.id));
    for (const r of rows) {
      expect(inTable.has(r.id), `${r.id} missing from TABLE`).toBe(true);
      expect(addable.has(r.id), `${r.id} not selectable`).toBe(true);
    }
  });

  it('leaves data/prices.json exactly as published — coverage is never widened by rewriting it', () => {
    expect(published.length).toBe(117);
  });

  it('claims no id and no CPT/HCPCS code that the published table already holds', () => {
    const ids = new Set(published.map((r) => r.id));
    const codes = new Set(published.map((r) => r.code).filter(Boolean));
    for (const r of rows) {
      expect(ids.has(r.id), `duplicate id ${r.id}`).toBe(false);
      expect(codes.has(r.code), `duplicate code ${r.code}`).toBe(false);
    }
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(new Set(rows.map((r) => r.code)).size).toBe(rows.length);
  });
});

describe('no added figure can be untraceable', () => {
  it('names CMS, a cms.gov file, the year and the code on every row', () => {
    for (const r of rows) {
      expect(r.agency).toBe('CMS');
      expect(r.year).toBe('2026');
      expect(String(r.source_url)).toMatch(/^https:\/\/www\.cms\.gov\//);
      expect(String(r.code)).toMatch(/^(CPT|HCPCS) [0-9A-Z]+$/);
      expect(['DERIVED', 'VERIFIED']).toContain(r.confidence);
      expect(typeof r.value_usd).toBe('number');
      expect(r.value_usd).toBeGreaterThan(0);
      // A Medicare allowed amount is not what anyone paid out of pocket.
      expect(r.out_of_pocket_usd).toBe(null);
      expect(r.basis).toBe('allowed_amount');
    }
  });

  it('re-derives every fee-schedule figure from the RVUs printed in its own coverage statement', () => {
    const bad: string[] = [];
    for (const r of rows.filter((x) => x.confidence === 'DERIVED')) {
      const total = /This figure is ([\d.]+) Total non-facility RVUs/.exec(r.coverage_statement);
      const parts = /sum of ([\d.]+) work \+ ([\d.]+) non-facility practice expense \+ ([\d.]+) malpractice/
        .exec(r.coverage_statement);
      if (!total || !parts) { bad.push(`${r.id}: coverage statement does not print its RVU inputs`); continue; }
      const t = Number(total[1]);
      const sum = Number(parts[1]) + Number(parts[2]) + Number(parts[3]);
      if (Math.abs(sum - t) > 0.005) bad.push(`${r.id}: components ${sum} do not sum to ${t}`);
      if (Math.abs(Math.round(t * CF * 100) / 100 - r.value_usd) > 0.005) {
        bad.push(`${r.id}: ${t} RVU x ${CF} is not ${r.value_usd}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('quotes the same lab rate in the sentence as in the figure, and never a cost share in an out-of-pocket column', () => {
    const bad: string[] = [];
    for (const r of rows.filter((x) => x.confidence === 'VERIFIED')) {
      const m = /\$([\d.]+) is the payment amount/.exec(r.coverage_statement);
      if (!m || Math.abs(Number(m[1]) - r.value_usd) > 0.005) bad.push(`${r.id}: sentence and figure disagree`);
      expect(r.alternates?.medicare_beneficiary_cost_share_usd).toBe(0);
      expect(String(r.alternates?._cost_share_note)).toContain('MEDICARE-ONLY');
    }
    expect(bad).toEqual([]);
  });

  it('says who the figure does not describe, on every single row', () => {
    for (const r of rows) {
      expect(r.coverage_statement, r.id).toContain('does NOT describe');
      expect(r.coverage_statement, r.id).toContain('PRICE FLOOR');
    }
  });
});

describe('the words a patient would use reach the new rows', () => {
  it('gives every added row at least six lay phrasings', () => {
    for (const r of rows) expect(r.plain_language_synonyms.length, r.id).toBeGreaterThanOrEqual(6);
  });

  it('reads the units people name most, straight to the right row', () => {
    const cases: [string, string][] = [
      ['mammogram', 'cms-img-mammo-screen'],
      ['bone density scan', 'cms-img-dexa'],
      ['home sleep apnea test', 'cms-test-home-sleep-basic'],
      ['speech therapy', 'cms-speech-therapy'],
      ['rapid strep test', 'cms-lab-strep-rapid'],
      ['epidural steroid injection', 'cms-proc-epidural-interlaminar'],
      ['punch biopsy', 'cms-proc-skin-biopsy-punch'],
      ['venipuncture', 'cms-lab-venipuncture'],
      ['psa test', 'cms-lab-psa'],
      ['liver panel', 'cms-lab-hepatic-panel'],
    ];
    for (const [phrase, id] of cases) {
      expect(mapUtterance(phrase, SELECTABLE).item?.id, phrase).toBe(id);
    }
  });

  it('never takes a phrase away from the row that already owned it', () => {
    const kept: [string, string][] = [
      ['urgent care', 'cms-99203'],
      ['blood draw', 'cms-lab-cbc'],
      ['nerve conduction study', 'cms-test-emg'],
      ['EMG test', 'cms-test-emg'],
      ['chest xray', 'cms-img-cxr'],
      ['PT', 'cms-pt-exercise-15'],
      ['endoscopy', 'cms-proc-egd-biopsy'],
      ['overnight sleep study', 'cms-test-sleep-study'],
      ['heart echo', 'cms-img-echo'],
      ['ER trip', 'cms-ed-99284-complete'],
    ];
    for (const [phrase, id] of kept) {
      expect(mapUtterance(phrase, SELECTABLE).item?.id, phrase).toBe(id);
    }
  });
});

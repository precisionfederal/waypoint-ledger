/* 10/13 interview (postpartum depression): "I entered my doctor visits and
   medication I was prescribed for 5 years, but there was no data shown for the
   medications." A named drug class now reaches the one published prescriptions
   figure; advice and supplements still do not. */
import { describe, it, expect } from 'vitest';
import { TABLE } from '../lib/table';
import { mapUtterance, parseJourney, unpricedByName, UNCARRIED_TREATMENT_REASON } from '../lib/mapper';
import { ITEMS } from '../lib/store';
import { previewTotals } from '../components/LivePreview';

const id = (s: string) => mapUtterance(s, TABLE).item?.id ?? null;

describe('a named drug class reaches the prescriptions figure', () => {
  it.each([
    'He prescribed an antidepressant.',
    'They gave me steroids.',
    'they put me on antibiotics for Lyme.',
    'my doctor prescribed meds for joint pain',
  ])('%s', (s) => expect(id(s)).toBe('meps2018-retail-rx-out-of-pocket'));

  it.each([
    'I was prescribed rest',
    'I take magnesium pills.',
    'told to take it easy.',
    'IV antibiotics',
  ])('%s stays off it', (s) => expect(id(s)).not.toBe('meps2018-retail-rx-out-of-pocket'));

  it('care that already prices keeps its own row', () => {
    expect(id('I had a blood test for Lyme.')).toBe('cms-lab-lyme-screen');
  });
});

describe('ECT and TMS stay on the ledger by name, unpriced (same interview)', () => {
  it.each(['had ECT.', 'I had electroconvulsive therapy', 'did TMS for depression'])('%s', (s) => {
    const r = mapUtterance(s, TABLE);
    expect(r.item).toBeNull();
    expect(r.reason).toBe(UNCARRIED_TREATMENT_REASON);
    expect(unpricedByName(r.reason)).toBe(true);
  });
  it('an ECG still prices', () => expect(id('had an ECG')).toBe('cms-test-ecg'));
});

describe('judge4 #6: the live ledger table (ITEMS) still reaches the prescriptions row', () => {
  it('parseJourney with ITEMS maps a named medicine to the rx row', () => {
    const segs = parseJourney('He prescribed an antidepressant. They gave me steroids.', ITEMS);
    const ids = segs.map((s) => s.result.item?.id ?? null);
    expect(ids.filter((x) => x === 'meps2018-retail-rx-out-of-pocket').length).toBe(2);
  });
  it('mapUtterance with ITEMS too', () => {
    expect(mapUtterance('they put me on antibiotics', ITEMS).item?.id).toBe('meps2018-retail-rx-out-of-pocket');
  });
});

describe('the journey preview keeps the yearly prescriptions figure out of its running total', () => {
  it('two medicines and a visit sum to the visit alone', () => {
    const segs = parseJourney('saw my doctor once. He prescribed an antidepressant. They gave me steroids.', ITEMS);
    const visit = segs.find((s) => s.result.item?.id === 'cms-99213')!;
    const { previewTotal, matched } = previewTotals(segs);
    expect(matched).toBe(3);
    expect(previewTotal).toBeCloseTo((visit.result.item!.valueUsd ?? 0) * visit.times, 2);
  });
});

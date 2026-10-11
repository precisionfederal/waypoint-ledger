/* Judge panel R1 (2026-10-01), fixer CORE round 3. One test per rule. Every
   figure is read from the table; the spans are read from the words typed. */
import { describe, it, expect } from 'vitest';
import { parseJourney, DIAGNOSIS_REASON, DIAGNOSED_REASON } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

const read = (s: string) => parseJourney(s, SELECTABLE);
const priced = (s: string) => read(s).filter((x) => x.result.item).map((x) => [x.result.item!.id, x.times]);
const spans = (s: string) => read(s).filter((x) => x.result.gapCategory === 'time-searching').map((x) => x.result.months);

describe('#5a a count with words of how it felt before the plural', () => {
  for (const [s, id, n] of [
    ['4 expensive brain MRIs', 'cms-img-mri-brain-nc', 4],
    ['four costly MRIs of my brain', 'cms-img-mri-brain-nc', 4],
    ['10 awful physical therapy sessions', 'cms-pt-exercise-15', 10],
  ] as const) {
    it(`"${s}" → ${id} ×${n}`, () => expect(priced(s)).toEqual([[id, n]]));
  }
  it('a time or a measure between the number and the plural is never a count', () => {
    expect(priced('3 years of blood tests')).not.toContainEqual(['cms-lab-cbc', 3]);
    expect(priced('drove 60 long miles to the cardiologist')).not.toContainEqual(['cms-99204', 60]);
  });
  it('the specialty said as an adjective is that specialist: first visit new, the rest return', () => {
    expect(priced('3 exhausting rheumatology appointments')).toEqual([['cms-99204', 1], ['cms-99214', 2]]);
    expect(priced('six months of waiting for the neurology appointment')).toEqual([]);
  });
});

describe('#5b a diagnosis said by someone is a name, never a line of care', () => {
  it('"they said POTS"', () => {
    const [x] = read('they said POTS');
    expect(x.result.item).toBeNull();
    expect(x.result.reason).toBe(DIAGNOSIS_REASON);
  });
  it('"diagnosed in 2025" is when the answer came', () => {
    const x = read('finally diagnosed in 2025')[0];
    expect(x.result.item).toBeNull();
    expect(x.result.reason).toBe(DIAGNOSED_REASON);
  });
});

describe('#5c the length of the search, every way it is said', () => {
  const now = new Date();
  for (const [s, months] of [
    ['got sick at 12 and was diagnosed at 19', 84],
    ['I got sick when I was 12. Diagnosed at 19.', 84],
    ['from 2015 to 2022', 84],
    ['spent two and a half years looking for an answer', 30],
    ['a year and a half of appointments', 18],
    ['over a decade of tests', 120],
  ] as const) {
    it(`"${s}" → ${months} months, never priced`, () => {
      expect(spans(s)).toEqual([months]);
      expect(priced(s)).toEqual([]);
    });
  }
  it('an onset year counts to now from the END of that year (the least it can be)', () => {
    expect(spans('symptoms started in 2016')).toEqual([(now.getFullYear() - 2016) * 12 + now.getMonth() - 11]);
  });
  it('an onset year counts to the diagnosis year when she says one', () => {
    expect(spans('It started in March 2023 after covid. Diagnosed in 2025.')).toEqual([22]);
  });
  it('a span beside care: the care prices and the span is counted', () => {
    const s = 'between 2019 and 2023 I saw a neurologist 3 times';
    expect(priced(s)).toEqual([['cms-99204', 1], ['cms-99214', 2]]);
    expect(spans(s)).toEqual([48]);
    expect(spans('saw 8 different doctors over 7 years')).toEqual([84]);
  });
  it('a monitor worn for two weeks is still how long it was worn, not a search', () => {
    expect(spans('wore a heart monitor for two weeks')).toEqual([]);
  });
  it('the age and the onset with no end and no year stay context, never a line', () => {
    expect(read('my daughter got sick when she was 11.')).toEqual([]);
  });
});

describe('the demo sentence is unchanged by round 3', () => {
  it('6 chips, $1,204.20 by rules', () => {
    const s = 'saw my regular doctor three times, then a cardiologist, the heart ultrasound thing, then they put electrodes on my legs and shocked the nerves, then the ER once when my heart was racing';
    const segs = read(s);
    expect(segs).toHaveLength(6);
    const total = segs.reduce((a, x) => a + (x.result.item?.valueUsd ?? 0) * x.times, 0);
    expect(Math.round(total * 100) / 100).toBe(1204.2);
  });
});

import { searchLength } from '../lib/search-length';
import { shareCardData } from '../components/JourneyBuilder';
import { priceJourney } from '../lib/pricing';
import type { JourneyEntry } from '../lib/types';

const ledgerOf = (story: string): JourneyEntry[] =>
  read(story).filter((s) => !s.absorbed).map((s, i) => ({ key: `k${i}`, raw: s.raw, item: s.result.item, times: s.times, gapCategory: s.result.gapCategory, months: s.result.months }) as JourneyEntry);

describe('#6 the length of the search beside the total, from her words only', () => {
  it('"7 years searching · 8 clinicians" when she said both', () => {
    expect(searchLength(ledgerOf('I saw 8 different doctors over 7 years')).line).toBe('7 years searching · 8 clinicians, as counted');
  });
  it('named clinicians are counted once each; the regular doctor is one', () => {
    const l = searchLength(ledgerOf('saw my regular doctor 6 times, my family doctor, a neurologist, a cardiologist twice'));
    expect(l.clinicians).toBe(3);
    expect(l.line).toBe('3 clinicians named');
  });
  it('nothing when she said neither, and never a default', () => {
    expect(searchLength(ledgerOf('an MRI of my brain and blood work')).line).toBeNull();
    expect(searchLength(ledgerOf('saw my regular doctor 4 times')).line).toBeNull();   // one clinician is not a count worth a line
    expect(searchLength([]).line).toBeNull();
  });
  it('a clinician she never saw is not counted', () => {
    expect(searchLength(ledgerOf('my regular doctor, and the neurologist I never got to see')).clinicians).toBe(0);
  });
  it('the demo journey names two clinicians and says they were named, not that there were two', () => {
    const l = searchLength(ledgerOf('saw my regular doctor three times, then a cardiologist, the heart ultrasound thing, then the ER once'));
    expect(l.line).toBe('2 clinicians named');
  });
  it('the span alone is shown alone', () => {
    expect(searchLength(ledgerOf('got sick at 12 and was diagnosed at 19')).line).toBe('7 years searching');
  });
  it('the share card carries the clinicians right after how long it took', () => {
    const e = ledgerOf('I saw 8 different doctors over 7 years, a neurologist, an MRI of my brain');
    const d = shareCardData(priceJourney(e), e.length, 0);
    expect((d.story ?? []).slice(0, 2)).toEqual(['7 years of searching', '8 clinicians, as counted']);
  });
});

import { readFileSync } from 'node:fs';
import { patientFromWords, PATIENT_OPTIONS, SCHOOL_CARD, CHILD_BASIS_NOTE, coverageOptionsFor } from '../lib/patient';
import { STRATA } from '../lib/survey-def';
import Ledger from '../components/Ledger';
import { demoEntries, fakeStore, renderWith } from './helpers/ledger-render';

describe('#9 a child\'s illness, read from the words, with the survey\'s own ids', () => {
  for (const [s, want] of [
    ['my daughter saw her pediatrician 8 times', 'caregiver-child'],
    ['our son had an MRI', 'caregiver-child'],
    ['my 14 year old saw the cardiologist twice', 'caregiver-child'],
    ['I got sick at 12 and was diagnosed at 19', 'pediatric-onset'],
    ['it started when I was a teenager', 'pediatric-onset'],
    ['symptoms began in middle school', 'pediatric-onset'],
    ['I have been sick since I was 9', 'pediatric-onset'],
    ['I got sick at 34', 'adult-onset'],
    ['saw my regular doctor three times, then a cardiologist', null],
  ] as const) {
    it(`"${s}" → ${want}`, () => expect(patientFromWords(s)).toBe(want));
  }
  it('every choice is a stratum id in lib/survey-def.js', () => {
    const ids = new Set(STRATA.map((x: { id: string }) => x.id));
    for (const o of PATIENT_OPTIONS) expect(ids.has(o.id)).toBe(true);
  });
  it('the school card cites the two regulations it paraphrases, and lib/patient.ts quotes them', () => {
    expect(SCHOOL_CARD.body).toContain('34 CFR 104.33');
    expect(SCHOOL_CARD.body).toContain('34 CFR 300.8(c)(9)');
    const src = readFileSync('lib/patient.ts', 'utf8');
    expect(src).toContain('regular or special education and related');
    expect(src).toContain('Adversely affects a child\'s educational');
    expect(CHILD_BASIS_NOTE).toContain('Medicare is not a child’s insurer');
  });
});

describe('#9 the ledger for a child', () => {
  const kid = { patient: { stratum: 'caregiver-child', from: 'words' }, setPatient: () => {} } as never;
  const kidSelf = { patient: { stratum: 'pediatric-onset', from: 'chosen' }, setPatient: () => {} } as never;
  it('a caregiver sees the school card in place of the employer card, and the reference note', () => {
    const html = renderWith(Ledger, fakeStore(demoEntries(), kid));
    expect(html).toContain('Give it to the school');
    expect(html).not.toContain('Give it to your employer');
    expect(html).toContain('Medicare is not a child’s insurer');
  });
  it('childhood onset answered by the person: the school card first, the employer card kept', () => {
    const html = renderWith(Ledger, fakeStore(demoEntries(), kidSelf));
    expect(html.indexOf('Give it to the school')).toBeGreaterThan(-1);
    expect(html.indexOf('Give it to the school')).toBeLessThan(html.indexOf('Give it to your employer'));
  });
  it('an adult ledger is unchanged: no school card, no note', () => {
    const html = renderWith(Ledger, fakeStore(demoEntries()));
    expect(html).not.toContain('Give it to the school');
    expect(html).not.toContain('Medicare is not a child’s insurer');
  });
  it('Medicaid or CHIP is the first coverage offered for a child, and only then', () => {
    expect(coverageOptionsFor({ stratum: 'caregiver-child', from: 'words' })[0]).toEqual({ key: 'medicaid', label: 'Medicaid or CHIP' });
    expect(coverageOptionsFor({ stratum: 'pediatric-onset', from: 'chosen' })[0].key).toBe('medicaid');
    expect(coverageOptionsFor(null)[0].key).toBe('employer');
    expect(coverageOptionsFor({ stratum: 'adult-onset', from: 'chosen' }).map((o) => o.label)).not.toContain('Medicaid or CHIP');
    expect(readFileSync('components/ContextBar.tsx', 'utf8')).toContain('coverageOptionsFor(st.patient).map');
  });
});

describe('patient2-10: a first visit past one says the rest are return visits', () => {
  const NOTE = 'Seen the same specialist again? That is a return visit, billed as an established patient.';
  const spec = SELECTABLE.find((i) => i.id === 'cms-99204')!;
  const line = (times: number) => [{ key: 'n1', raw: 'a neurologist', item: spec, times }] as JourneyEntry[];
  it('shown on a new-patient line at ×2, not at ×1, and never on a return-visit line', () => {
    expect(renderWith(Ledger, fakeStore(line(2)))).toContain(NOTE);
    expect(renderWith(Ledger, fakeStore(line(1)))).not.toContain(NOTE);
    const ret = SELECTABLE.find((i) => i.id === 'cms-99214')!;
    expect(renderWith(Ledger, fakeStore([{ key: 'r1', raw: 'return visits', item: ret, times: 3 }] as JourneyEntry[]))).not.toContain(NOTE);
  });
});

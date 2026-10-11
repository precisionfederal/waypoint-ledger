/* FINAL-1011 reader (2026-10-11): A JUDGE'S OWN SENTENCE MUST COME OUT RIGHT.

   JUDGE-PANEL-R1 §1 Data, "Against it": "8 physical therapy visits" priced x1
   and "I have Lyme disease" became a test line. Each sentence below is one a
   judge could type in the ten-minute review, and each assertion is the reading
   a careful person would give it: the count she said, a diagnosis kept as a
   name and never priced, the length of the search counted under Time spent
   searching, and the total card carrying that length only when it was read. */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseJourney, DIAGNOSIS_REASON, notReadAsCare } from '../lib/mapper';
import { isDiagnosisLine } from '../lib/diagnosis-line';
import { searchLength } from '../lib/search-length';
import { SELECTABLE } from '../lib/table';
import TotalReveal from '../components/TotalReveal';

const read = (s: string) => parseJourney(s, SELECTABLE).filter((g) => !g.absorbed);
const priced = (s: string) => read(s).filter((g) => g.result.item).map((g) => [g.result.item!.id, g.times] as const);
const spans = (s: string) => read(s).filter((g) => g.result.gapCategory === 'time-searching').map((g) => g.result.months);
const entries = (s: string) => read(s).map((g, i) => ({ key: String(i), raw: g.raw, item: g.result.item, times: g.times, gapCategory: g.result.gapCategory, months: g.result.months }));

/* The months to today from the END of a year said with no month: the least the search can be. */
const toToday = (y: number, now = new Date()) => (now.getFullYear() - y) * 12 + (now.getMonth() - 11);

describe('(a) a count with words between the number and the noun is read', () => {
  it('judge-a1 "8 physical therapy visits" is x8', () => {
    expect(priced('8 physical therapy visits')).toEqual([['cms-pt-exercise-15', 8]]);
  });
  it('judge-a2 "three ER visits" is x3', () => {
    expect(priced('three ER visits')).toEqual([['cms-ed-99284-complete', 3]]);
  });
  it('judge-a3 "two more blood tests" is x2', () => {
    expect(priced('two more blood tests')).toEqual([['cms-lab-cbc', 2]]);
  });
  it('judge-a4 "5 follow-up appointments with my neurologist" is five return visits to the neurologist, and no sixth visit', () => {
    expect(priced('5 follow-up appointments with my neurologist')).toEqual([['cms-99214', 5]]);
    expect(priced('5 follow up visits with my neurologist')).toEqual([['cms-99214', 5]]);
  });
  it('judge-a5 a hyphenated word between number and noun no longer hides the count', () => {
    expect(priced('6 follow-up visits')).toEqual([['cms-99213', 6]]);
  });
  it('judge-a6 a generic visit with a primary-care clinician stays primary care', () => {
    expect(priced('two appointments with my GP')).toEqual([['cms-99213', 2]]);
  });
});

describe('(b) a diagnosis is a named marker, never a test and never a failed line', () => {
  for (const s of ['I have Lyme disease', 'they said it was POTS', 'diagnosed with lupus', 'finally got a diagnosis of endometriosis']) {
    it(`judge-b "${s}" is a diagnosis line with no unit`, () => {
      const rows = read(s);
      expect(rows).toHaveLength(1);
      const [g] = rows;
      expect(g.result.item).toBeNull();
      expect(g.result.reason).toBe(DIAGNOSIS_REASON);
      expect(isDiagnosisLine({ item: g.result.item, gapCategory: g.result.gapCategory, months: g.result.months, reason: g.result.reason })).toBe(true);
      // Context, never a blank line of care under "Without a federal figure".
      expect(notReadAsCare({ raw: g.raw, item: g.result.item, gapCategory: g.result.gapCategory, months: g.result.months, reason: g.result.reason })).toBe(true);
    });
  }
  it('judge-b5 "I had a Lyme test" stays the test', () => {
    expect(priced('I had a Lyme test')).toEqual([['cms-lab-lyme-screen', 1]]);
  });
  it('judge-b6 a diagnosis said with the years it took keeps the years on its line', () => {
    const [g] = read('finally got a diagnosis of endometriosis after 9 years');
    expect(g.result.item).toBeNull();
    expect(g.result.reason).toBe(DIAGNOSIS_REASON);
    expect(g.result.gapCategory).toBe('time-searching');
    expect(g.result.months).toBe(108);
  });
  it('judge-b7 "after 2 weeks in the hospital" is not years of searching', () => {
    expect(spans('diagnosed with lupus after 2 weeks in the hospital')).toEqual([]);
  });
});

describe('(c) spans are Time spent searching, never priced', () => {
  it('judge-c1 "got sick at 12 ... diagnosed at 19" is 7 years', () => {
    expect(spans('got sick at 12 and was diagnosed at 19')).toEqual([84]);
    expect(spans('got sick at 12 and wasnt diagnosed until 19')).toEqual([84]);
    expect(priced('got sick at 12 and was diagnosed at 19')).toEqual([]);
  });
  it('judge-c2 "for 3 years" is 36 months', () => {
    expect(spans("I've been sick for 3 years")).toEqual([36]);
  });
  it('judge-c3 "since 2022" runs to today, from the end of 2022', () => {
    expect(spans('sick since 2022')).toEqual([toToday(2022)]);
    expect(spans('sick since 2022 and nobody knows why')).toEqual([toToday(2022)]);
    expect(priced('sick since 2022')).toEqual([]);
  });
  it('judge-c3b "since" beside a medicine is not the search', () => {
    expect(spans('on gabapentin since 2022')).toEqual([]);
  });
  it('judge-c4 "it took four years to get answers" is 48 months', () => {
    expect(spans('it took four years to get answers')).toEqual([48]);
  });
  it('judge-c5 "doctor to doctor" is the search, with its years when said', () => {
    expect(spans('I went from doctor to doctor for 5 years')).toEqual([60]);
    expect(spans('spent 6 years going doctor to doctor')).toEqual([72]);
    expect(read('spent 6 years going doctor to doctor')).toHaveLength(1);
    // No number said, none made up: counted, with no months.
    expect(spans('bounced from doctor to doctor')).toEqual([null]);
    // Care said beside it still prices.
    expect(priced('went doctor to doctor and had an MRI of my brain')).toEqual([['cms-img-mri-brain-nc', 1]]);
  });
});

describe('care not yet had, and the ER that sent her home', () => {
  it('judge-d1 "waiting on a spinal tap" is not priced; a result waited on does not unprice the test', () => {
    expect(priced('they think it might be MS, waiting on a spinal tap')).toEqual([]);
    expect(priced('a spinal tap to check the fluid around my brain')).toEqual([['cms-proc-lumbar-puncture', 1]]);
  });
  it('judge-d2 "sent me home from the ER" is the whole ER visit, not the doctor\'s half at the lowest level', () => {
    expect(priced('they told me it was anxiety and sent me home from the ER')).toEqual([['cms-ed-99284-complete', 1]]);
  });
});

describe('(e) JUDGE #6: the total card carries the search when it was read, and nothing when not', () => {
  it('judge-e1 years and clinicians read from her words', () => {
    expect(searchLength(entries('got sick at 12 and was diagnosed at 19. saw 8 different doctors')).line)
      .toBe('7 years searching · 8 clinicians, as counted');
  });
  it('judge-e2 a since-year span reaches the line', () => {
    const line = searchLength(entries('sick since 2022. saw my regular doctor 4 times and a rheumatologist')).line;
    expect(line).toMatch(/^\d+ years?(?: \d+ months?)? searching · 2 clinicians named$/);
  });
  it('judge-e3 doctor-to-doctor years reach the line', () => {
    expect(searchLength(entries('I went from doctor to doctor for 5 years')).line).toBe('5 years searching');
  });
  it('judge-e4 absent when not read: no span and fewer than two clinicians', () => {
    expect(searchLength(entries('an MRI of my brain')).line).toBeNull();
    expect(searchLength(entries('I have Lyme disease')).line).toBeNull();
  });
  it('judge-e5 the card prints the line beside the dollar total, and prints nothing when absent', () => {
    const base = { totalUsd: 1120, pricedCount: 3, tableVersion: 'test' };
    const withIt = renderToStaticMarkup(createElement(TotalReveal, { ...base, searched: '7 years searching · 8 clinicians, as counted' }));
    expect(withIt).toContain('class="core-searched"');
    expect(withIt).toContain('7 years searching · 8 clinicians, as counted');
    expect(withIt.indexOf('big-num')).toBeLessThan(withIt.indexOf('core-searched'));
    const without = renderToStaticMarkup(createElement(TotalReveal, { ...base, searched: null }));
    expect(without).not.toContain('core-searched');
    expect(without).not.toContain('searching');
  });
});

/* FINAL-1011 (main, from the susan lane's probe): "push through" is advice, never an IV push. */
describe('push through is advice, not an IV push', () => {
  const ids = (s: string) => read(s).map((g) => g.result?.item?.id ?? null);
  it('"told to push through and crashed for weeks" prices nothing', () => {
    expect(ids('told to push through and crashed for weeks')).not.toContain('cms-proc-iv-push');
    expect(read('told to push through and crashed for weeks').every((g) => !g.result?.item)).toBe(true);
  });
  it('"my doctor said to push through it" prices nothing', () => {
    expect(ids('my doctor said to push through it')).not.toContain('cms-proc-iv-push');
  });
  it('a real IV push still prices', () => {
    expect(ids('they gave me an IV push of zofran')).toContain('cms-proc-iv-push');
    expect(ids('they pushed a drug through my iv')).toContain('cms-proc-iv-push');
  });
});

/* FINAL-1011 face (B): "I saw 6 doctors" was "No federal figure matched" x6. A
   count of clinicians with no kind of care named is the clinician count on the
   total card, never six unmatched lines and never six priced visits: we do not
   know what any of the six visits was. */
const unmatched = (s: string) => read(s).filter((g) => !g.result.item && !g.result.gapCategory
  && !notReadAsCare({ raw: g.raw, item: g.result.item, gapCategory: g.result.gapCategory, months: g.result.months, reason: g.result.reason }));
describe('(f) a bare count of clinicians is the clinicians count, never lines of care', () => {
  for (const s of ['I saw 6 doctors', 'I have seen six different doctors', 'saw 6 doctors so far']) {
    it(`judge-f1 "${s}" is 6 clinicians, as counted, with no priced and no unmatched line`, () => {
      expect(priced(s)).toEqual([]);
      expect(unmatched(s)).toEqual([]);
      const sl = searchLength(entries(s));
      expect(sl.clinicians).toBe(6);
      expect(sl.line).toBe('6 clinicians, as counted');
    });
  }
  it('judge-f2 "saw 6 doctors, including a cardiologist" is 6 clinicians and one cardiologist visit priced', () => {
    const s = 'saw 6 doctors, including a cardiologist';
    expect(priced(s)).toEqual([['cms-99204', 1]]);
    expect(unmatched(s)).toEqual([]);
    expect(searchLength(entries(s)).clinicians).toBe(6);
  });
  /* Needs one change in lib/mapper.ts splitReturnVisits (not this lane’s to edit;
     FINAL-1011/face/REPORT.md "NEEDS"): with no comma the whole clause is one
     segment, and the cardiologist row takes the count said on "doctors". */
  it('judge-f3 "saw 6 doctors including a cardiologist" is 6 clinicians and one cardiologist visit priced', () => {
    const s = 'saw 6 doctors including a cardiologist';
    expect(priced(s)).toEqual([['cms-99204', 1]]);
    expect(unmatched(s)).toEqual([]);
    expect(searchLength(entries(s)).clinicians).toBe(6);
  });
  it('judge-f4 a count beside named care or a specialist plural reads as before', () => {
    expect(priced('saw 4 specialists')).toEqual([['cms-99204', 4]]);
    expect(priced('took her to the pediatrician six times').map(([, n]) => n).reduce((a, b) => a + b, 0)).toBe(6);
  });
  it('judge-f5 "rheumatologist twice" is one first visit and one return visit, by the CMS new-patient rule', () => {
    expect(priced('saw the rheumatologist twice')).toEqual([['cms-99204', 1], ['cms-99214', 1]]);
  });
  it('judge-f6 the demo sentence total is unchanged, $1,204.20 by rules', () => {
    const s = 'saw my regular doctor three times, then a cardiologist, the heart ultrasound thing, then they put electrodes on my legs and shocked the nerves, then the ER once when my heart was racing';
    const total = read(s).reduce((a, x) => a + (x.result.item?.valueUsd ?? 0) * x.times, 0);
    expect(Math.round(total * 100) / 100).toBe(1204.2);
  });
});

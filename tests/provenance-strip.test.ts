/* The one line a judge reads in three seconds. It may only name an agency or a
   code system that is actually on the page — and it must name every one that is. */
import { describe, it, expect } from 'vitest';
import { provenanceClauses } from '../components/ProvenanceStrip';
import { TABLE } from '../lib/table';

const item = (id: string) => TABLE.find((i) => i.id === id)!;

describe('the provenance strip', () => {
  it('counts every agency on the page, lines and figures beside the total alike', () => {
    const { agencies } = provenanceClauses(
      [item('cms-99213'), item('cms-99214'), item('cms-lab-cmp')],
      [
        { sourceTitle: 'AHRQ, MEPS 2022 long COVID analysis', what: 'published excess' },
        { sourceTitle: 'U.S. Bureau of Labor Statistics, Usual Weekly Earnings', what: 'wage figure', n: 2 },
        { sourceTitle: 'U.S. General Services Administration, POV mileage', what: 'rate' },
      ],
    );
    expect(agencies[0]).toBe('CMS 3 lines');
    expect(agencies.join(' · ')).toContain('AHRQ MEPS 1 published excess');
    expect(agencies.join(' · ')).toContain('BLS 2 wage figures');
    expect(agencies.join(' · ')).toContain('GSA 1 rate');
  });

  it('names a code system only when a row on the page carries it', () => {
    const office = provenanceClauses([item('cms-99213')]);
    expect(office.codes).toEqual(['CPT']);

    const lab = provenanceClauses([item('cms-lab-cmp')]);
    expect(lab.codes).toContain('LOINC');

    const withCondition = provenanceClauses([item('cms-99213')], [], 'U09.9');
    expect(withCondition.codes).toEqual(['CPT', 'ICD-10-CM']);
  });

  it('says nothing when the page is showing nothing', () => {
    const empty = provenanceClauses([], []);
    expect(empty.agencies).toEqual([]);
    expect(empty.codes).toEqual([]);
  });

  it('counts one line as a line and two as lines', () => {
    expect(provenanceClauses([item('cms-99213')]).agencies[0]).toBe('CMS 1 line');
  });
});

/* JUDGE-7 #5 and #6 (2026-10-01): an adult relative's story and an opening
   "She is 12" are read for who the search is about. */
import { describe, it, expect } from 'vitest';
import { patientFromWords, relationFromWords, PATIENT_OPTIONS } from '../lib/patient';
import { parseJourney, AGE_NOW_REASON } from '../lib/mapper';
import { SELECTABLE } from '../lib/table';

describe('JUDGE-7 #5: an adult relative', () => {
  it('"My dad is 78" is an age, never a cost row', () => {
    for (const s of ['My dad is 78.', 'my mom is 70', 'my grandma is 88', 'my husband is 102']) {
      expect(parseJourney(s, SELECTABLE).map((g) => g.result.reason), s).toEqual([AGE_NOW_REASON]);
    }
  });
  it('sets caregiver-adult and the relation in lowercase', () => {
    const cases: [string, string][] = [
      ['My dad is 78. He saw a cardiologist 3 times and had an echo.', 'father'],
      ['my mom had an MRI of her brain', 'mother'],
      ['my husband saw a neurologist twice', 'husband'],
      ['my wife had a sleep study', 'wife'],
      ['my grandpa went to the ER twice', 'grandfather'],
    ];
    for (const [s, rel] of cases) {
      expect(patientFromWords(s), s).toBe('caregiver-adult');
      expect(relationFromWords(s), s).toBe(rel);
    }
  });
  it('a story with the writer\'s own care stays the writer\'s', () => {
    expect(patientFromWords('I saw my regular doctor. my husband saw a cardiologist')).not.toBe('caregiver-adult');
  });
  it('the survey choices are unchanged', () => {
    expect(PATIENT_OPTIONS.map((o) => o.id)).toEqual(['adult-onset', 'pediatric-onset', 'caregiver-child']);
  });
});

describe('JUDGE-7 #6: "She is 12." opens a child\'s story', () => {
  it('sets caregiver-child', () => {
    expect(patientFromWords('She is 12. She saw a pediatrician 4 times and had bloodwork twice.')).toBe('caregiver-child');
    expect(patientFromWords("he's 9 and has seen 3 specialists")).toBe('caregiver-child');
  });
  it('an adult age does not', () => {
    expect(patientFromWords('She is 34. She saw a rheumatologist twice.')).not.toBe('caregiver-child');
  });
});

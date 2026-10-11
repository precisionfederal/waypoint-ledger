/* lib/patient.ts uses the survey's stratum ids without importing lib/survey-def.js (that file
   would ride into every page's first load through the store). This test is the guard that used
   to run at import time: a stratum renamed in the survey fails here. */
import { describe, it, expect } from 'vitest';
import { STRATA } from '../lib/survey-def.js';
import { PATIENT_OPTIONS } from '../lib/patient';

describe('lib/patient.ts strata are the survey\'s', () => {
  it('every patient choice is a survey stratum id', () => {
    const ids = new Set(STRATA.map((s: { id: string }) => s.id));
    for (const o of PATIENT_OPTIONS) expect(ids.has(o.id), o.id).toBe(true);
    for (const id of ['caregiver-child', 'pediatric-onset', 'adult-onset']) expect(ids.has(id), id).toBe(true);
  });
  it('lib/patient.ts does not import the survey definition', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(new URL('../lib/patient.ts', import.meta.url), 'utf8')).not.toMatch(/from '\.\/survey-def'/);
  });
});

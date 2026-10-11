/* flow3-11: for a child the survey offers "Medicaid or CHIP" first. Only the words and
   the order change: the stored value stays 'Medicaid', so the aggregates and the CSV
   never split one coverage into two rows. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONTEXT, insuranceChoices } from '../lib/survey-def.js';

describe('the child coverage choice (flow3-11)', () => {
  it('a child sees Medicaid or CHIP first, stored as Medicaid', () => {
    const c = insuranceChoices(true);
    expect(c[0]).toEqual({ value: 'Medicaid', label: 'Medicaid or CHIP' });
    expect(c.map((o: { value: string }) => o.value).sort()).toEqual([...CONTEXT.insurance.options].sort());
  });
  it('an adult sees the list as before, word for word', () => {
    expect(insuranceChoices(false)).toEqual(CONTEXT.insurance.options.map((o: string) => ({ value: o, label: o })));
  });
  it('the stored key set is unchanged, so no aggregate or CSV row splits', () => {
    expect(CONTEXT.insurance.options).toEqual(['Employer plan', 'Marketplace or individual plan', 'Medicaid', 'Medicare', 'Uninsured', 'Other or mixed']);
    expect(CONTEXT.insurance.options).not.toContain('Medicaid or CHIP');
  });
  it('the form renders the choice through insuranceChoices and hints that the child can be an adult child', () => {
    const src = readFileSync(new URL('../components/SurveyForm.tsx', import.meta.url), 'utf8');
    expect(src).toContain('insuranceChoices(forChild)');
    expect(src).toContain('The child can be an adult child.');
  });
});

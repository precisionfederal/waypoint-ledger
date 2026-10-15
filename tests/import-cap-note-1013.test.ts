import { describe, expect, it } from 'vitest';
import { cappedNote } from '../components/ImportClaims';

describe('a once-a-year code imported over several years', () => {
  it('keeps the plain note inside one year', () => {
    expect(cappedNote(1, '2020-01-02', '2020-06-30')).toBe('1 priced: CMS pays this once in a 12-month period');
  });
  it('says more than one may have been allowed across years and still prices one', () => {
    const n = cappedNote(1, '2017-03-07', '2021-03-30');
    expect(n).toContain('run from 2017 to 2021');
    expect(n).toContain('more than one may have been allowed');
    expect(n).toContain('prices one');
  });
  it('falls back when dates are missing', () => {
    expect(cappedNote(1, null, null)).toBe('1 priced: CMS pays this once in a 12-month period');
  });
});

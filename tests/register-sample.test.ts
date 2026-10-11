/* The illustrative sample is honest about itself: seeded, plausible, internally consistent,
   never served by the API, never exported, always under its banner. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sampleRegister, SAMPLE_BANNER } from '../lib/register-sample';
import { TABLE } from '../lib/table';

describe('the illustrative register sample', () => {
  const s = sampleRegister();
  it('is deterministic and flagged', () => {
    expect(JSON.stringify(sampleRegister())).toBe(JSON.stringify(s));
    expect(s.sample).toBe(true);
    expect(SAMPLE_BANNER).toMatch(/not real answers/i);
  });
  it('adds up', () => {
    const n = s.survey.n;
    for (const row of s.survey.ranking) { expect(row.rankedFirstBy).toBeLessThanOrEqual(n); expect(row.rankedLastBy).toBeLessThanOrEqual(n); }
    expect(s.survey.ranking.reduce((a, r) => a + r.rankedFirstBy, 0)).toBe(n);
    expect(s.survey.ranking.reduce((a, r) => a + r.rankedLastBy, 0)).toBe(n);
    for (const k of Object.keys(s.survey.coverage)) { const c = (s.survey.coverage as Record<string, Record<string, number>>)[k]; expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(n); }
    expect(Object.values(s.survey.channels).reduce((a, b) => a + b, 0)).toBe(n);
    for (const g of s.survey.rankingBySex.groups) expect(g.n).toBeGreaterThanOrEqual(s.survey.rankingBySex.min);
    const ids = new Set(TABLE.map((i) => i.id));
    for (const c of s.corrections.summary) expect(ids.has(c.priceId)).toBe(true);
    expect(s.corrections.sends).toBe(s.corrections.summary.reduce((a, c) => a + c.confirmedRight + c.flaggedWrong, 0));
  });
  it('never reaches the API, the exports or the live route', () => {
    for (const f of ['cf/functions/api/register.js', 'cf/functions/api/survey.js', 'cf/functions/api/export/survey.csv.js', 'app/register/live/page.tsx', 'app/register/page.tsx']) {
      let src = ''; try { src = readFileSync(f, 'utf8'); } catch { continue; }
      expect(src).not.toMatch(/register-sample|sampleRegister/);
    }
    expect(readFileSync('app/register/preview/page.tsx', 'utf8')).toMatch(/index: false/);
  });
  it('lives only at /register/preview: /register is the live count, and the sample says so everywhere', () => {
    expect(readFileSync('app/register/page.tsx', 'utf8')).toMatch(/<Register \/>/);
    const reg = readFileSync('components/Register.tsx', 'utf8');
    expect(reg).toContain('Sample data, not real answers');
    expect(reg).toContain('href="/register/preview">How this page reads at scale');
    expect(reg).not.toContain('<Link href="/register">How this page reads at scale');
  });
});

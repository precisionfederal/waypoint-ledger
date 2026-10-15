/* Judge panel 15 Oct B-5: the home proof strip under the hero. Three links, each a
   count the site already prints elsewhere, read live or from the file /method reads,
   never typed into the page. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { auditProof, rankProof, SANDBOX_PROOF } from '../components/ProofStrip';
import { forgoneRank } from '../lib/forgone-rank';

const audit = JSON.parse(readFileSync('data/AUDIT.json', 'utf8')) as { rows: number; pass: number; generated: string };
const count = JSON.parse(readFileSync('data/audit-count.json', 'utf8')) as { rows: number; pass: number; audited: string };
const src = readFileSync('components/ProofStrip.tsx', 'utf8');
const home = readFileSync('app/page.tsx', 'utf8');

describe('B-5: the proof strip', () => {
  it('the audit count is the one /method prints, from data/AUDIT.json', () => {
    expect(count).toMatchObject({ rows: audit.rows, pass: audit.pass, audited: audit.generated });
    expect(auditProof()).toBe(`${audit.pass} of ${audit.rows} federal figures reproduce from their source file`);
    expect(readFileSync('app/method/page.tsx', 'utf8')).toContain('{audit.pass} of {audit.rows} rows reproduce from their source file');
    expect(auditProof({})).toBeNull();
    expect(readFileSync('cf/build-static.sh', 'utf8')).toContain('node scripts/gen-audit-count.mjs');
  });

  it('the ranking is read from /api/register\'s survey block, by the same rule as the ledger', () => {
    expect(src).toContain("fetch('/api/register'");
    expect(src).toContain('forgoneRank(j?.survey)');
    const agg = { n: 108, headline: { n: 106 }, ranking: [{ burden: 'forgone', rankedFirstBy: 43 }, { burden: 'money', rankedFirstBy: 30 }] };
    expect(rankProof(forgoneRank(agg)!)).toBe('43 of 106 survey answers ranked care gone without the heaviest burden');
    const notTop = { ...agg, ranking: [{ burden: 'forgone', rankedFirstBy: 20 }, { burden: 'money', rankedFirstBy: 50 }] };
    expect(rankProof(forgoneRank(notTop)!)).toBe('20 of 106 survey answers ranked care gone without first');
    expect(forgoneRank({ n: 3, headline: { n: 3 }, ranking: [{ burden: 'forgone', rankedFirstBy: 3 }] })).toBeNull();
  });

  it('the sandbox link is drawn only when /api/bluebutton/status says configured, and says sandbox', () => {
    expect(src).toContain("fetch('/api/bluebutton/status'");
    expect(src).toContain('setSandbox(j?.configured === true)');
    expect(SANDBOX_PROOF).toMatch(/CMS sandbox/);
    expect(src).toContain('href="/ledger?try=cms-synthetic"');
  });

  it('no count is typed into the strip, and it sits under the hero', () => {
    expect(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')).not.toMatch(/\b(43|106|274)\b/);
    expect(home).toContain('<div className="wrap"><ProofStrip /></div>');
    expect(src).toContain('href="/register"');
    expect(src).toContain('href="/method"');
  });
});

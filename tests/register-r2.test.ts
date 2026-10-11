import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ==========================================================================
   /register/live is on screen while the presenter says "four survey answers
   and one written interview". Round 2 (2026-09-30) made every count on it say
   what it counts: answers, reports, thumbs, interviews. Never people.
   Checked against the source, the way register.test.ts checks the empty states.
   ========================================================================== */
const REG = readFileSync(new URL('../components/Register.tsx', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../components/Register.module.css', import.meta.url), 'utf8');

describe('counts are answers, reports, thumbs or interviews, never people', () => {
  it('drops every count of people the round-1 attack found', () => {
    for (const old of [
      "'person' : 'people'} answered",
      "'person' : 'people'} reporting",
      'people, out of {n} who answered',
      "Of {n} {n === 1 ? 'person' : 'people'}",
      "Of {gap.respondents} {gap.respondents === 1 ? 'person' : 'people'}",
      'label="people reporting uncounted care"',
      'People reporting</th>',
      'Per person</th>',
      'of {n} who answered</span>',
      "'respondent' : 'respondents'",
    ]) expect(REG, old).not.toContain(old);
  });

  it('says answers where it counts the survey, and reports where it counts the gap', () => {
    expect(REG).toContain("sv.n === 1 ? 'answer' : 'answers'");
    expect(REG).toContain('answers, out of {n}</span>');
    expect(REG).toContain("'survey answer' : 'survey answers'");
    expect(REG).toContain("'report of uncounted care' : 'reports of uncounted care'");
    expect(REG).toContain("'written interview' : 'written interviews'");
  });

  it('prints a sender count only when the server sends one', () => {
    expect(REG).toContain("typeof sv?.senders === 'number' && sv.senders > 0 && (sv.senderBasis === undefined || sv.senderBasis === 'senders') ? sv.senders : null");
  });
});

describe('the illustrative page is reached from under the counts, and says it is not real', () => {
  it('no longer sits under the h1', () => {
    expect(REG).not.toContain('The register at about 200 answers');
    const label = 'How this page reads at scale: an illustration at 200 answers, not real data →';
    expect(REG).toContain(label);
    expect(REG.indexOf(label)).toBeGreaterThan(REG.indexOf('counts, never estimates.'));
    expect(REG.indexOf(label)).toBeGreaterThan(REG.indexOf('className="reg-grid"'));
  });
});

describe('the one correction so far is ours, and the page says so only while that is true', () => {
  it('guards the note on exactly one correction dated 10 September 2026', () => {
    expect(REG).toContain('The one correction so far is ours, from the Sep 10, 2026 walkthrough.');
    const guard = REG.slice(REG.indexOf('const onlyOurAlphaThumb'), REG.indexOf('const onlyOurAlphaThumb') + 300);
    expect(guard).toContain('nCorr === 1');
    expect(guard).toContain("firstAt ?? '').slice(0, 10) === '2026-09-10'");
    expect(guard).toContain("lastAt ?? '').slice(0, 10) === '2026-09-10'");
  });
});

describe('what changed because of you', () => {
  it('shows the newest published change under the counts, and nothing when there is none', () => {
    expect(REG).toContain('What changed because of you');
    expect(REG).toContain("phase === 'ok' && changes.length > 0 && <ChangedBecauseOfYou latest={changes[0]}");
    expect(REG.indexOf('<ChangedBecauseOfYou latest')).toBeGreaterThan(REG.indexOf('className="reg-grid"'));
    expect(REG).toContain('id="changes"');
  });
});

describe('words a federal-data reader would catch', () => {
  it('says cost file and cost data, never any federal file', () => {
    expect(REG).not.toContain('no row in any federal file');
    expect(REG).not.toContain('zero rows in federal data');
    expect(REG).toContain('no row in any federal cost file');
    expect(REG).toContain('zero rows in federal cost data');
  });

  it('labels every channel in words, with no internal key and no banned word', () => {
    expect(REG).toContain("advocate: 'Patient advocate link'");
    expect(REG).not.toMatch(/demo call/i);
  });

  it('lets the long download label wrap on a 320px phone', () => {
    expect(REG).toContain('styles.wrapBtn');
    expect(CSS).toMatch(/button\.wrapBtn\.wrapBtn\s*\{\s*white-space:\s*normal/);
  });
});

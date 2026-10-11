/* FLOW4 flow4-8 (2026-10-01): the group's link is named before question 1. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('flow4-8 the survey names the link before the first question', () => {
  const src = readFileSync('components/SurveyForm.tsx', 'utf8');
  it('shows the label above the form, only for a labelled link', () => {
    expect(src).toMatch(/\{channel !== 'direct' && \(\s*<p className="micro fc-channel" data-testid="channel-before">\s*Your answer is counted with the answers that came through the link labelled &ldquo;\{channel\}&rdquo;\./);
  });
  it('it sits above the first question', () => {
    expect(src.indexOf('data-testid="channel-before"')).toBeLessThan(src.indexOf('data-testid="respondent"'));
    expect(src.indexOf('data-testid="channel-before"')).toBeGreaterThan(src.indexOf('<section className="step survey fc">'));
  });
});

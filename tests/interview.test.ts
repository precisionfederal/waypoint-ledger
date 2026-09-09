/* Written interviews are the one place a person writes freely. The contract is that
   what they write is never served back by any endpoint, and that consent decides how
   it may be used. Both are asserted here, on the same validator the server runs. */
import { describe, it, expect } from 'vitest';
import { validateInterview, summarizeInterviews } from '../cf/functions/api/interview.js';
import { INTERVIEW_QUESTIONS } from '../lib/survey-def.js';

interface InterviewRecord {
  consent: string; name?: string; answers: Record<string, string>;
  followUp: boolean; email?: string; channel: string; receivedAt: string;
}
interface InterviewSummary {
  ok: true; n: number; firstAt?: string; lastAt?: string;
  consent: Record<string, number>; note: string;
}
/** The validated record, or a failure that names the rule that refused it. */
const rec = (b: unknown): InterviewRecord => {
  const v = validateInterview(b) as { error?: string; record?: InterviewRecord };
  if (!v.record) throw new Error(`expected a valid response, refused with: ${v.error}`);
  return v.record;
};
const summary = (rows: InterviewRecord[]) => summarizeInterviews(rows) as InterviewSummary;

const ANSWERS = {
  q1: 'It started in the spring; it was nineteen months before anyone gave it a name.',
  q2: 'Four thousand dollars I can account for, and a job I could not keep.',
  q3: 'The echo was billed at nine hundred and I paid two hundred and eleven.',
};
const VALID = { consent: 'quote-anonymously', answers: ANSWERS, channel: 'demo' };

describe('validateInterview — accepts', () => {
  it('three answers and a consent choice', () => {
    expect((validateInterview(VALID) as { error?: string }).error).toBeUndefined();
    const r = rec(VALID);
    expect(Object.keys(r.answers)).toEqual(['q1', 'q2', 'q3']);
    expect(r.consent).toBe('quote-anonymously');
    expect(r.followUp).toBe(false);
    expect(r.email).toBeUndefined();
    expect(r.name).toBeUndefined();
  });
  it('a name only when the writer chose to be quoted by name', () => {
    expect(rec({ ...VALID, consent: 'quote-by-name', name: 'Alex Rivera' }).name).toBe('Alex Rivera');
    expect(rec({ ...VALID, name: 'Alex Rivera' }).name).toBeUndefined();
  });
  it('an address only when the writer asked to hear back', () => {
    expect(rec({ ...VALID, followUp: true, email: 'someone@example.org' }).email).toBe('someone@example.org');
    expect(rec({ ...VALID, email: 'someone@example.org' }).email).toBeUndefined();
  });
  it('every question, and caps each answer at 3000 characters', () => {
    const full = Object.fromEntries((INTERVIEW_QUESTIONS as [string, string][]).map(([id]) => [id, 'y'.repeat(4000)]));
    const r = rec({ ...VALID, answers: full });
    expect(Object.keys(r.answers)).toHaveLength(10);
    expect(r.answers.q1).toHaveLength(3000);
  });
  it('and drops an unknown channel to "direct"', () => {
    expect(rec({ ...VALID, channel: 'a b c' }).channel).toBe('direct');
  });
});

describe('validateInterview — refuses', () => {
  const err = (b: unknown) => (validateInterview(b) as { error?: string }).error ?? '';
  it('a body that is not an object', () => { expect(err(null)).toMatch(/JSON/); });
  it('a missing or invented consent choice', () => {
    expect(err({ ...VALID, consent: undefined })).toMatch(/how we may use/);
    expect(err({ ...VALID, consent: 'publish-everywhere' })).toMatch(/how we may use/);
  });
  it('fewer than three answers', () => {
    expect(err({ ...VALID, answers: { q1: 'one', q2: 'two' } })).toMatch(/at least three/);
    expect(err({ ...VALID, answers: {} })).toMatch(/at least three/);
    expect(err({ ...VALID, answers: { q1: 'one', q2: 'two', q3: '   ' } })).toMatch(/at least three/);
  });
  it('an answer to a question that does not exist', () => {
    expect(err({ ...VALID, answers: { q1: 'a', q2: 'b', q99: 'c' } })).toMatch(/at least three/);
  });
  it('"quote me by name" with no name', () => {
    expect(err({ ...VALID, consent: 'quote-by-name' })).toMatch(/add the name/);
    expect(err({ ...VALID, consent: 'quote-by-name', name: '  ' })).toMatch(/add the name/);
  });
  it('"write back to me" with no address, or an address that is not one', () => {
    expect(err({ ...VALID, followUp: true })).toMatch(/add an email address/);
    expect(err({ ...VALID, followUp: true, email: 'not-an-address' })).toMatch(/add an email address/);
  });
});

describe('summarizeInterviews — a count and the consent split, never the words', () => {
  const rows = [
    rec(VALID),
    rec({ ...VALID, consent: 'notes' }),
    rec({ ...VALID, consent: 'quote-by-name', name: 'Alex Rivera' }),
  ];
  it('counts by consent', () => {
    const s = summary(rows);
    expect(s.n).toBe(3);
    expect(s.consent).toEqual({ 'quote-anonymously': 1, notes: 1, 'quote-by-name': 1 });
    expect(typeof s.firstAt).toBe('string');
  });
  it('never serves an answer, a name or an address', () => {
    const blob = JSON.stringify(summary(rows));
    expect(blob).not.toContain('nineteen months');
    expect(blob).not.toContain('Alex Rivera');
    expect(blob).not.toContain('@example.org');
    expect(summary(rows).note).toMatch(/never served/);
  });
  it('reports zero honestly', () => {
    expect(summary([]).n).toBe(0);
  });
});

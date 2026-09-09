/* The burden-ranking instrument. One definition (lib/survey-def.js) is read by the
   React form, the Node route and the Cloudflare function; these tests import the same
   validator the server runs, so a rule can never drift between the page and the API. */
import { describe, it, expect } from 'vitest';
import { validateSurvey, aggregateSurvey } from '../cf/functions/api/survey.js';
import { BURDENS, BURDEN_IDS, DECIDERS, DECIDER_IDS, CONTEXT, CONTEXT_KEYS, QUESTIONS, SURVEY_VERSION, INTERVIEW_QUESTIONS } from '../lib/survey-def.js';

interface SurveyRecord {
  ranking: string[]; unasked: string; lead: string; decide: string;
  clinicians: number | null; context?: Record<string, string>;
  sentence?: string; channel: string; surveyVersion?: string; receivedAt: string;
}
interface SurveyAggregate {
  ok: true; n: number; firstAt: string; lastAt: string;
  channels: Record<string, number>;
  ranking: { burden: string; rankedFirstBy: number; rankedLastBy: number; meanRank: number }[];
  unasked: Record<string, number>; lead: Record<string, number>; decide: Record<string, number>;
  clinicians: { n: number; median: number; mean: number; max: number };
  coverage: Record<string, Record<string, number>>;
  sentencesHeld: number; method: string;
}

/** The validated record, or a failure that names the rule that refused it. */
const rec = (b: unknown): SurveyRecord => {
  const v = validateSurvey(b) as { error?: string; record?: SurveyRecord };
  if (!v.record) throw new Error(`expected a valid response, refused with: ${v.error}`);
  return v.record;
};
const err = (b: unknown): string => (validateSurvey(b) as { error?: string }).error ?? '';
const agg = (rows: SurveyRecord[]) => aggregateSurvey(rows) as SurveyAggregate;

const VALID = {
  ranking: ['time', 'oop', 'work', 'unpaid', 'forgone'],
  unasked: 'unpaid',
  lead: 'time',
  decide: 'patients',
  clinicians: 7,
  context: { age: '30–44', insurance: 'Employer plan', region: 'Midwest', stage: 'Still searching' },
  channel: 'demo',
  surveyVersion: SURVEY_VERSION,
};

describe('the instrument itself', () => {
  it('is five burdens, four deciders, four context questions and ten interview questions', () => {
    expect(BURDENS).toHaveLength(5);
    expect(new Set(BURDEN_IDS).size).toBe(5);
    expect(DECIDERS).toHaveLength(4);
    expect(new Set(DECIDER_IDS).size).toBe(4);
    expect(CONTEXT_KEYS).toEqual(['age', 'insurance', 'region', 'state', 'stage']);
    expect(INTERVIEW_QUESTIONS).toHaveLength(10);
    expect(SURVEY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\./);
  });
  it('asks every question in plain words, not in the language of a methodologist', () => {
    for (const q of Object.values(QUESTIONS)) expect(String(q).length).toBeGreaterThan(20);
    for (const k of CONTEXT_KEYS) expect((CONTEXT as Record<string, { options: string[] }>)[k].options.length).toBeGreaterThan(1);
  });
});

describe('validateSurvey — accepts', () => {
  it('a complete response', () => {
    expect(err(VALID)).toBe('');
    const r = rec(VALID);
    expect(r.ranking).toEqual(VALID.ranking);
    expect(r.unasked).toBe('unpaid');
    expect(r.lead).toBe('time');
    expect(r.decide).toBe('patients');
    expect(r.clinicians).toBe(7);
    expect(r.channel).toBe('demo');
    expect(r.context).toEqual(VALID.context);
    expect(typeof r.receivedAt).toBe('string');
  });
  it('"no one asked about any of them" as an answer in its own right', () => {
    expect(rec({ ...VALID, unasked: 'all-asked' }).unasked).toBe('all-asked');
  });
  it('a blank clinician count, because nobody has to answer it', () => {
    for (const c of [null, undefined, '']) expect(rec({ ...VALID, clinicians: c }).clinicians).toBeNull();
  });
  it('a whole number sent as a string', () => {
    expect(rec({ ...VALID, clinicians: '12' }).clinicians).toBe(12);
  });
  it('but drops an unknown channel to "direct" rather than storing what was sent', () => {
    expect(rec({ ...VALID, channel: 'DROP TABLE' }).channel).toBe('direct');
    expect(rec({ ...VALID, channel: undefined }).channel).toBe('direct');
  });
  it('and keeps only context values that are on the published option list', () => {
    expect(rec({ ...VALID, context: { age: 'made up', insurance: 'Medicaid', nope: 'x' } }).context).toEqual({ insurance: 'Medicaid' });
  });
  it('and caps the one free sentence at 280 characters', () => {
    expect(rec({ ...VALID, sentence: 'x'.repeat(400) }).sentence).toHaveLength(280);
    expect(rec({ ...VALID, sentence: '   ' }).sentence).toBeUndefined();
  });
});

describe('validateSurvey — refuses, in words a person can act on', () => {
  it('a body that is not an object', () => {
    expect(err(null)).toMatch(/JSON/);
    expect(err('hello')).toMatch(/JSON/);
  });
  it('a partial ranking', () => {
    expect(err({ ...VALID, ranking: ['time', 'oop'] })).toMatch(/Rank all five/);
    expect(err({ ...VALID, ranking: undefined })).toMatch(/Rank all five/);
  });
  it('a ranking with a repeat or an invented burden', () => {
    expect(err({ ...VALID, ranking: ['time', 'time', 'oop', 'work', 'unpaid'] })).toMatch(/Rank all five/);
    expect(err({ ...VALID, ranking: ['time', 'oop', 'work', 'unpaid', 'rent'] })).toMatch(/Rank all five/);
  });
  it('a missing or invented "no one asked" answer', () => {
    expect(err({ ...VALID, unasked: undefined })).toMatch(/no one asked/);
    expect(err({ ...VALID, unasked: 'rent' })).toMatch(/no one asked/);
  });
  it('a missing or invented lead burden', () => {
    expect(err({ ...VALID, lead: 'rent' })).toMatch(/lead with/);
  });
  it('a missing or invented decider', () => {
    expect(err({ ...VALID, decide: 'the vendor' })).toMatch(/who should decide/);
  });
  it('an impossible clinician count', () => {
    expect(err({ ...VALID, clinicians: 100 })).toMatch(/0 to 99/);
    expect(err({ ...VALID, clinicians: -1 })).toMatch(/0 to 99/);
    expect(err({ ...VALID, clinicians: 3.5 })).toMatch(/0 to 99/);
    expect(err({ ...VALID, clinicians: 'seven' })).toMatch(/0 to 99/);
  });
});

describe('aggregateSurvey — counts, with the N, and nothing else', () => {
  it('says so plainly when nobody has answered', () => {
    const a = aggregateSurvey([]) as { n: number; note: string };
    expect(a.n).toBe(0);
    expect(a.note).toMatch(/only what people have actually sent/);
  });

  it('reports each burden by first place, last place and mean position', () => {
    const a = agg([
      rec(VALID),
      rec({ ...VALID, ranking: ['oop', 'time', 'forgone', 'work', 'unpaid'], lead: 'oop', channel: 'reddit' }),
    ]);
    expect(a.n).toBe(2);
    expect(a.ranking).toHaveLength(5);
    const time = a.ranking.find((r) => r.burden === 'time');
    expect(time?.rankedFirstBy).toBe(1);
    expect(time?.meanRank).toBe(1.5);
    expect(a.ranking[0].meanRank).toBeLessThanOrEqual(a.ranking[4].meanRank);
    expect(a.channels).toEqual({ demo: 1, reddit: 1 });
    expect(a.lead).toEqual({ time: 1, oop: 1 });
    expect(a.clinicians.n).toBe(2);
    expect(a.coverage.age['30–44']).toBe(2);
    expect(a.method).toMatch(/no imputation, no extrapolation/i);
  });

  it('holds the free sentence back — the aggregate reports only how many were written', () => {
    const a = agg([rec({ ...VALID, sentence: 'the waiting was the worst part' })]);
    expect(a.sentencesHeld).toBe(1);
    expect(JSON.stringify(a)).not.toContain('the waiting was the worst part');
  });
});

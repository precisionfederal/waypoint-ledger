/* FLOW5 flow5-1 (2026-10-01): /policy's ranking N is the register's headline N.
   flow3-4 computes the ranking over the answers about the person's own illness;
   /policy still printed "N = 7 answers from 2 senders, every answer ranked"
   beside a register reading "Of 3 answers about the person's own illness". */
import { describe, it, expect } from 'vitest';
import { aggregateSurvey } from '../cf/functions/api/survey.js';
import { withSenders } from '../cf/functions/api/_senders.js';
import { policyDocument } from '../cf/functions/api/policy.js';
import { rankingN } from '../components/PolicyLive';
import { RESPONDENT_CHILD } from '../lib/survey-def.js';
import { ALIASES } from '../lib/count-fields.js';

const BURDENS = ['forgone', 'time', 'oop', 'unpaid', 'dismissed'];
const row = (ctx: Record<string, string> | undefined, first: string) => ({
  ranking: [first, ...BURDENS.filter((b) => b !== first)], unasked: 'time', lead: 'oop', decide: 'clinician', clinicians: 3, context: ctx,
  receivedAt: '2026-10-01T05:00:00.000Z',
});
const ROWS = [row(undefined, 'oop'), row({ onset_age: '30–44' }, 'oop'), row(undefined, 'time'), row({ respondent: RESPONDENT_CHILD }, 'forgone')];

describe('flow5-1 the /policy N is the register\'s headline N', () => {
  const agg = aggregateSurvey(ROWS) as Record<string, any>;
  const published = { ...withSenders(agg, { key: 'senders', people: 2, submissions: agg.n, noun: 'answers' }), deprecated: ALIASES.survey };
  const survey = (policyDocument({ survey: published }) as any).uncounted.survey;

  it('carries the own-illness count in its own field; answers stays every answer', () => {
    expect(agg.headline.n).toBe(3);
    expect(survey.rankedAnswers).toBe(agg.headline.n);
    expect(survey.rankedAnswersOf).toBe("answers about the person's own illness");
    expect(survey.answers).toBe(4);
  });
  it('prints the register\'s count and words, with every answer beside it', () => {
    expect(rankingN(survey)).toBe("3 answers about the person's own illness, of 4 answers from 2 senders");
    const register = `Of ${agg.headline.n} answers ${agg.headline.of.replace(/^answers /, '')}`;
    expect(register).toBe("Of 3 answers about the person's own illness");
    expect(rankingN(survey).startsWith(`${agg.headline.n} answers ${agg.headline.of.replace(/^answers /, '')}`)).toBe(true);
  });
  it('with no child answer, or an older body, it reads as before', () => {
    const adults = aggregateSurvey(ROWS.slice(0, 3)) as Record<string, any>;
    const s2 = (policyDocument({ survey: { ...withSenders(adults, { key: 'senders', people: 2, submissions: 3, noun: 'answers' }), deprecated: ALIASES.survey } }) as any).uncounted.survey;
    expect(rankingN(s2)).toBe('3 answers from 2 senders, every answer ranked');
    expect(rankingN({ n: 2, submissions: 7, answers: 7, senders: 2 })).toBe('7 answers from 2 senders, every answer ranked');
  });
  it('the staging fixture as the endpoint builds it: 3 own-illness answers of 7 from 2 senders, n is answers', () => {
    const seven = [row(undefined, 'oop'), row({ onset_age: '30–44' }, 'oop'), row(undefined, 'time'),
      ...Array.from({ length: 4 }, () => row({ respondent: RESPONDENT_CHILD }, 'forgone'))];
    const a = aggregateSurvey(seven) as Record<string, any>;
    const s7 = (policyDocument({ survey: { ...withSenders(a, { key: 'senders', people: 2, submissions: a.n, noun: 'answers' }), deprecated: ALIASES.survey } }) as any).uncounted.survey;
    expect(rankingN(s7)).toBe("3 answers about the person's own illness, of 7 answers from 2 senders");
    expect(s7.n).toBe(s7.answers);
    expect(s7.deprecated).toEqual({ n: 'answers' });
  });
});

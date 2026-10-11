/* FLOW4 flow4-2 (2026-10-01): the register served a fold written by older code.

   flow3-4 added `headline` to the survey aggregate, but AGG_SHAPE in
   cf/functions/api/_counters.js stayed the same, so every fold already in D1
   still matched and /api/survey kept answering without `headline`: the child
   answer stayed pooled into "Of 7 answers" on staging, and would have on
   production, until the next answer landed.

   This test folds one fixed set of rows through all four published aggregates
   and fingerprints the SHAPE of what they publish: every key path and the type
   of the value at it (data values themselves are not hashed, so a new answer
   wording does not trip it). The fingerprint is recorded against the AGG_SHAPE
   it was published under. Change what an aggregate publishes and the
   fingerprint moves; the test then fails until AGG_SHAPE is bumped AND the new
   fingerprint is recorded under the new name.

   Never edit a recorded fingerprint in place. A new shape is a new line. */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { AGG_SHAPE } from '../cf/functions/api/_counters.js';
import { aggregateSurvey } from '../cf/functions/api/survey.js';
import { aggregateGap } from '../cf/functions/api/gap.js';
import { aggregateCorrections } from '../cf/functions/api/corrections.js';
import { summarizeInterviews, validateInterview } from '../cf/functions/api/interview.js';
import { RESPONDENT_CHILD } from '../lib/survey-def.js';

/** AGG_SHAPE -> the fingerprint of the aggregates published under it. */
const RECORDED: Record<string, string> = {
  'cells-11.days.team-tests.headline.2026-10-01': '16228f0179ce49a5',
  // Merge round 4: FLOW4's headline and JUDGE-4's browserFigurePairs (count-fields) together.
  'cells-11.days.team-tests.headline.count-fields.2026-10-01': '3e6615bff6dc8d7c',
};

const BURDENS = ['forgone', 'time', 'oop', 'unpaid', 'dismissed'];
const survey = (ctx: Record<string, string> | undefined, first: string, clinicians: number) => ({
  ranking: [first, ...BURDENS.filter((b) => b !== first)],
  unasked: 'time', lead: 'oop', decide: 'clinician', clinicians, context: ctx,
  receivedAt: '2026-10-01T05:00:00.000Z', channel: 'direct',
});
const SURVEY_ROWS = [
  survey({ onset_age: '30–44', sex: 'female' }, 'forgone', 5),
  survey({ onset_age: '18–29' }, 'time', 7),
  survey(undefined, 'oop', 9),
  survey({ respondent: RESPONDENT_CHILD }, 'oop', 9),
];
const GAP_ROWS = [
  { counts: { 'time-searching': 24, 'lost-work': 3 }, ranking: ['time-searching', 'lost-work'], context: { age_band: '30–44' }, receivedAt: '2026-10-01T05:00:00.000Z' },
  { counts: { 'time-searching': 12 }, ranking: ['time-searching'], context: {}, receivedAt: '2026-10-01T06:00:00.000Z' },
];
const CORRECTION_ROWS = [
  { priceId: 'cms-99213', verdict: 'wrong', believedValueUsd: 120, receivedAt: '2026-10-01T05:00:00.000Z', senderKey: 's1' },
  { priceId: 'cms-99214', verdict: 'right', believedValueUsd: null, receivedAt: '2026-10-01T06:00:00.000Z', senderKey: 's2' },
];
const interview = (b: unknown) => {
  const v = validateInterview(b) as { record?: unknown; error?: string };
  if (!v.record) throw new Error(`fixture interview refused: ${v.error}`);
  return v.record;
};
const INTERVIEW_ROWS = [
  interview({ consent: 'quote-anonymously', answers: { q1: 'Nineteen months before it had a name.', q2: 'A job I could not keep.', q3: 'The echo.' }, channel: 'direct' }),
  interview({ consent: 'notes', answers: { q1: 'Two years.', q2: 'Savings.', q3: 'Nothing.' }, channel: 'direct' }),
];

/** Every key path with the type at it; arrays read as the union of their items. */
function shape(v: unknown, at = '', out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) {
    out.add(`${at}:array`);
    for (const x of v) shape(x, `${at}[]`, out);
  } else if (v && typeof v === 'object') {
    out.add(`${at}:object`);
    for (const [k, x] of Object.entries(v)) shape(x, `${at}.${k}`, out);
  } else {
    out.add(`${at}:${v === null ? 'null' : typeof v}`);
  }
  return out;
}

function aggregateFingerprint(): string {
  const all = {
    survey: aggregateSurvey(SURVEY_ROWS),
    gap: aggregateGap(GAP_ROWS),
    corrections: aggregateCorrections(CORRECTION_ROWS),
    interviews: summarizeInterviews(INTERVIEW_ROWS as never[]),
  };
  const lines = [...shape(all)].sort().join('\n');
  return createHash('sha256').update(lines).digest('hex').slice(0, 16);
}

describe('flow4-2 an older fold is never served in a newer shape', () => {
  it('the survey aggregate publishes the headline the register reads', () => {
    expect(shape(aggregateSurvey(SURVEY_ROWS)).has('.headline.n:number')).toBe(true);
  });

  it('AGG_SHAPE has its fingerprint recorded', () => {
    expect(
      RECORDED[AGG_SHAPE],
      `AGG_SHAPE '${AGG_SHAPE}' has no recorded fingerprint. If you bumped it because an aggregate changed shape, record '${aggregateFingerprint()}' under the new name in tests/agg-shape.test.ts.`,
    ).toBeTypeOf('string');
  });

  it('the aggregates publish the shape recorded for this AGG_SHAPE', () => {
    const now = aggregateFingerprint();
    expect(
      now,
      `What an aggregate publishes changed (fingerprint ${now}), but AGG_SHAPE is still '${AGG_SHAPE}'. Every fold already in D1 would keep being served in the old shape. Bump AGG_SHAPE in cf/functions/api/_counters.js and record '${now}' under the new name.`,
    ).toBe(RECORDED[AGG_SHAPE]);
  });

  it('no two AGG_SHAPE names share a fingerprint, and no name is reused', () => {
    const prints = Object.values(RECORDED);
    expect(new Set(prints).size).toBe(prints.length);
  });
});

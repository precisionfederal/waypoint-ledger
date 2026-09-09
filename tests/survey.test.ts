/* The burden-ranking instrument. One definition (lib/survey-def.js) is read by the
   React form, the Node route and the Cloudflare function; these tests import the same
   validator the server runs, so a rule can never drift between the page and the API. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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
/* The aggregate grew a by-sex cross-tabulation, so the cast goes through
   `unknown`: this interface names the fields these tests read, not every
   field the endpoint serves. */
const agg = (rows: SurveyRecord[]) => aggregateSurvey(rows) as unknown as SurveyAggregate;

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
  it('is five burdens, four deciders, six context questions and ten interview questions', () => {
    expect(BURDENS).toHaveLength(5);
    expect(new Set(BURDEN_IDS).size).toBe(5);
    expect(DECIDERS).toHaveLength(4);
    expect(new Set(DECIDER_IDS).size).toBe(4);
    expect(CONTEXT_KEYS).toEqual(['age', 'sex', 'insurance', 'region', 'state', 'stage']);
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


/* ---------- UX-1 fix 12 — the thumb, on the device most people will use -------
   Measured on a real iPhone 14 viewport on 2026-09-09: 59 controls on /survey, 28
   of them smaller than 44 px in their own box. Twenty of those 28 are the radio
   glyphs, and every one of them is wrapped by its .choice label — 358 x 52 px —
   so the thing a thumb hits is the label, not the glyph. The other eight are links
   inside sentences, which WCAG 2.5.8 exempts. These tests hold the rule that makes
   that true: the label is the target, and it never drops under 44 px. */
describe('the survey is answerable with a thumb', () => {
  const PRODUCT_CSS = readFileSync(new URL('../app/product.css', import.meta.url), 'utf8');
  const GLOBALS_CSS = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const FORM = readFileSync(new URL('../components/SurveyForm.tsx', import.meta.url), 'utf8');

  it('wraps every radio in the label that is the tap target', () => {
    const choice = FORM.slice(FORM.indexOf('function Choice'));
    expect(choice).toMatch(/<label className=\{`choice/);
    expect(choice.indexOf('<input type="radio"')).toBeGreaterThan(choice.indexOf('<label'));
    expect(choice.indexOf('</label>')).toBeGreaterThan(choice.indexOf('<input type="radio"'));
  });

  it('never lets a choice, a rank chip or a field drop under 44 px', () => {
    const px = (css: string, sel: string) => {
      const m = new RegExp(`\\${sel}\\{[^}]*min-height:\\s*([\\d.]+)(px|rem)`).exec(css);
      if (!m) return null;
      return m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
    };
    for (const sel of ['.choice', '.rank-chip']) {
      const v = px(PRODUCT_CSS, sel);
      expect(v, `${sel} has no min-height in product.css`).not.toBeNull();
      expect(v!).toBeGreaterThanOrEqual(44);
    }
    /* and the label is a flex row, so the whole 52 px is one target */
    expect(GLOBALS_CSS).toMatch(/\.choice\{display:flex;align-items:center/);
  });
});

/* The research-panel completion code (dormant until a paid panel is approved).
   The code lives only in env.PROLIFIC_COMPLETION_CODE and is returned only on a
   successful survey or interview POST whose own channel is exactly 'paid-panel'. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { panelCode, PANEL_CHANNEL } from '../cf/functions/api/_panel.js';
import { channelOf } from '../cf/functions/api/_http.js';
import { normalizeChannel, SURVEY_VERSION } from '../lib/survey-def.js';
import { onRequestPost as postSurvey } from '../cf/functions/api/survey.js';
import { onRequestPost as postInterview } from '../cf/functions/api/interview.js';

const CODE = 'C1A2B3D4';
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));
function fakeEnv(extra: Record<string, unknown> = {}) {
  const stmt = { bind: () => stmt, first: async () => null, run: async () => ({ meta: { changes: 1 } }), all: async () => ({ results: [] }) };
  return { DB: { prepare: () => stmt, batch: async () => [{ meta: { changes: 1 } }, { meta: { changes: 1 } }] }, INTERVIEW_KEY: KEY, ...extra };
}
const post = (body: unknown) => new Request('https://example.test/api/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const survey = (channel: string) => ({ ranking: ['oop', 'time', 'work', 'unpaid', 'forgone'], unasked: 'oop', lead: 'time', decide: 'patients', clinicians: 3, context: {}, channel, surveyVersion: SURVEY_VERSION });
const interview = (channel: string) => ({
  consent: 'notes', channel,
  answers: { q1: 'It took eleven months and four specialists before anyone named it.', q2: 'We paid for the scans ourselves and I lost a lot of work.', q3: 'Nobody ever asked who was caring for the kids while I was sick.' },
});

describe('panelCode', () => {
  it('is absent without the env var, with another channel, or with a blank code', () => {
    expect(panelCode({}, PANEL_CHANNEL)).toEqual({});
    expect(panelCode({ PROLIFIC_COMPLETION_CODE: CODE }, 'direct')).toEqual({});
    expect(panelCode({ PROLIFIC_COMPLETION_CODE: CODE }, 'advocate')).toEqual({});
    expect(panelCode({ PROLIFIC_COMPLETION_CODE: '   ' }, PANEL_CHANNEL)).toEqual({});
  });
  it('is present with both the channel and the env var', () => {
    expect(panelCode({ PROLIFIC_COMPLETION_CODE: ` ${CODE} ` }, PANEL_CHANNEL)).toEqual({ completionCode: CODE });
  });
  it('each study can carry its own code, falling back to the shared one', () => {
    const env = { PROLIFIC_COMPLETION_CODE: CODE, PROLIFIC_COMPLETION_CODE_SURVEY: 'SURV1', PROLIFIC_COMPLETION_CODE_INTERVIEW: ' INTV1 ' };
    expect(panelCode(env, PANEL_CHANNEL, 'survey')).toEqual({ completionCode: 'SURV1' });
    expect(panelCode(env, PANEL_CHANNEL, 'interview')).toEqual({ completionCode: 'INTV1' });
    expect(panelCode({ PROLIFIC_COMPLETION_CODE: CODE }, PANEL_CHANNEL, 'interview')).toEqual({ completionCode: CODE });
    expect(panelCode({ PROLIFIC_COMPLETION_CODE_SURVEY: 'SURV1' }, PANEL_CHANNEL, 'interview')).toEqual({});
    expect(panelCode(env, 'advocate', 'survey')).toEqual({});
  });
  it('the channel arrives normalised: the link label becomes the exact slug the server keeps', () => {
    expect(normalizeChannel('Paid Panel')).toBe(PANEL_CHANNEL);
    expect(normalizeChannel('paid-panel')).toBe(PANEL_CHANNEL);
    expect(channelOf(normalizeChannel('PAID panel'))).toBe(PANEL_CHANNEL);
  });
  it('the code is never in source or the client: only the env var name appears', () => {
    for (const f of ['cf/functions/api/_panel.js', 'cf/functions/api/survey.js', 'cf/functions/api/interview.js', 'components/SurveyForm.tsx', 'components/InterviewForm.tsx', 'components/ContribKit.tsx']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/PROLIFIC_COMPLETION_CODE\s*[:=]\s*['"`][^'"`]/);
    }
    expect(readFileSync('components/SurveyForm.tsx', 'utf8')).not.toContain('PROLIFIC');
    expect(readFileSync('components/InterviewForm.tsx', 'utf8')).not.toContain('PROLIFIC');
  });
});

describe('POST /api/survey and /api/interview carry the code only for a paid-panel row with the code set', () => {
  for (const [name, fn, body] of [['survey', postSurvey, survey], ['interview', postInterview, interview]] as const) {
    it(`${name}: present with both`, async () => {
      const r = await fn({ request: post(body(PANEL_CHANNEL)), env: fakeEnv({ PROLIFIC_COMPLETION_CODE: CODE }) } as never);
      const j = await r.json();
      expect(j.ok).toBe(true);
      expect(j.completionCode).toBe(CODE);
    });
    it(`${name}: absent with another channel`, async () => {
      const j = await (await fn({ request: post(body('advocate')), env: fakeEnv({ PROLIFIC_COMPLETION_CODE: CODE }) } as never)).json();
      expect(j.ok).toBe(true);
      expect(j).not.toHaveProperty('completionCode');
    });
    it(`${name}: absent without the env var`, async () => {
      const j = await (await fn({ request: post(body(PANEL_CHANNEL)), env: fakeEnv() } as never)).json();
      expect(j.ok).toBe(true);
      expect(j).not.toHaveProperty('completionCode');
    });
    it(`${name}: its own code wins over the shared one`, async () => {
      const own = { [`PROLIFIC_COMPLETION_CODE_${name.toUpperCase()}`]: 'OWN42' };
      const j = await (await fn({ request: post(body(PANEL_CHANNEL)), env: fakeEnv({ PROLIFIC_COMPLETION_CODE: CODE, ...own }) } as never)).json();
      expect(j.completionCode).toBe('OWN42');
    });
  }
});

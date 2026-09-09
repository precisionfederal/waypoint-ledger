/* ==========================================================================
   SEX — the one instruction the program gave every team in writing.

   On 26 August 2026 the Federal Sprint Lead for the Invisible Illness track
   asked every team in the sprint to be intentional about sex differences where
   relevant. These tests hold that answer to the same standard as every dollar
   on the site:

   1. THE INSTRUMENT ASKS IT, and asks it as one optional question with four
      stated answers. Nothing is pre-selected and nothing is filled in: a blank
      is "not stated", and "Prefer not to say" is the different, stated thing.
   2. THE CHAIN COVERS IT. ctx_sex is published, so ctx_sex is hashed — the
      defect that ctx_state taught us is not repeated with a new field.
   3. THE CROSS-TABULATION IS SUPPRESSED ON THE SERVER. A sex group under
      SMALL_CELL_MIN never leaves the machine holding it, and the withholding
      is counted rather than hidden.
   4. NO SENTENCE ABOUT SEX IS UNSOURCED, AND NONE OF THEM IS A DOLLAR. Every
      sex_note names a federal file and a URL; every blank names the page that
      was read and where it stops; no priced row is published by sex, because
      no fee schedule we price from is.
   ========================================================================== */
import { describe, it, expect } from 'vitest';
import { validateSurvey, aggregateSurvey, rankingBySex, rankOf } from '../cf/functions/api/survey.js';
import { chainCoverage, surveyCtxKeysFor, SURVEY_CTX_KEYS, SURVEY_PROJECTIONS } from '../cf/functions/api/_hash.js';
import { exportRows } from '../cf/functions/api/export/[kind].js';
import {
  CONTEXT, CONTEXT_KEYS, SMALL_CELL_MIN, SURVEY_VERSION,
  SEX_NOTE, SEX_POLICY, SEX_POLICY_URL, SEX_ASK_ORIGIN,
} from '../lib/survey-def.js';
import conditionsRaw from '@/data/conditions.json';
import auditRaw from '@/data/CONDITIONS-AUDIT.json';

interface Condition {
  id: string; label: string; price_row_id: string | null;
  sex_note?: string | null; sex_note_source?: string | null;
  sex_note_source_url?: string | null; sex_note_blank_reason?: string | null;
}
const conditions = (conditionsRaw as unknown as { conditions: Condition[] }).conditions;
const conditionsRule = (conditionsRaw as unknown as { _sex_note_rule?: string })._sex_note_rule;
const audit = auditRaw as unknown as {
  conditions_version: string;
  results: { check: string; status: string; detail: string }[];
};

const SEX = CONTEXT.sex as { label: string; options: string[]; note: string };
const survey = (sex?: string) => ({
  ranking: ['time', 'oop', 'work', 'unpaid', 'forgone'],
  unasked: 'unpaid',
  lead: 'time',
  decide: 'patients',
  clinicians: 3,
  context: sex === undefined ? { age: '30–44' } : { age: '30–44', sex },
  channel: 'test',
  surveyVersion: SURVEY_VERSION,
});
const rec = (b: unknown) => {
  const v = validateSurvey(b) as { error?: string; record?: { context?: Record<string, string> } };
  if (!v.record) throw new Error(`refused: ${v.error}`);
  return v.record;
};
/** n identical responses that put `first` heaviest, all stating the same sex. */
const many = (n: number, sex: string | undefined, first = 'time') =>
  Array.from({ length: n }, () => {
    const r = rec({ ...survey(sex), ranking: [first, ...['time', 'oop', 'work', 'unpaid', 'forgone'].filter((b) => b !== first)] });
    return { ...r, receivedAt: '2026-09-09T00:00:00.000Z' };
  }) as unknown as Parameters<typeof rankingBySex>[0];

describe('the instrument asks sex, once, optionally, and on the face of the form', () => {
  it('sits directly after age, so it is asked with the rest of who answered', () => {
    expect(CONTEXT_KEYS).toContain('sex');
    expect(CONTEXT_KEYS.indexOf('sex')).toBe(CONTEXT_KEYS.indexOf('age') + 1);
    expect(SEX.label).toBe('Sex');
  });

  it('offers four answers, one of which is a stated refusal', () => {
    expect(SEX.options).toEqual(['Female', 'Male', 'Intersex', 'Prefer not to say']);
    expect(SEX.options).toContain('Prefer not to say');
  });

  it('says why it is asked, and cites the policy that frames it', () => {
    expect(SEX.note).toBe(SEX_NOTE);
    expect(SEX_POLICY).toMatch(/NOT-OD-15-102/);
    expect(SEX_POLICY_URL).toBe('https://grants.nih.gov/grants/guide/notice-files/NOT-OD-15-102.html');
    expect(SEX_ASK_ORIGIN).toMatch(/26 August 2026/);
  });

  it('accepts each stated answer and records it exactly as given', () => {
    for (const o of SEX.options) expect(rec(survey(o)).context?.sex).toBe(o);
  });

  it('records nothing when the question is left alone — a blank is never filled in', () => {
    expect(rec(survey(undefined)).context?.sex).toBeUndefined();
    expect(rec(survey('')).context?.sex).toBeUndefined();
  });

  it('drops a value that is not one of the four rather than storing free text', () => {
    expect(rec(survey('42')).context?.sex).toBeUndefined();
    expect(rec(survey('<script>')).context?.sex).toBeUndefined();
  });

  it('keeps sex inside the anonymous context and nowhere else on the record', () => {
    const r = rec(survey('Female')) as Record<string, unknown>;
    expect(r.sex).toBeUndefined();
    expect(Object.keys(r).filter((k) => /sex/i.test(k))).toEqual([]);
  });
});

describe('what is published is a count, and the chain covers it', () => {
  it('the coverage table counts every answer against the N, and names the silence', () => {
    const rows = [...many(3, 'Female'), ...many(2, 'Male'), ...many(1, undefined)];
    const agg = aggregateSurvey(rows) as unknown as { n: number; coverage: Record<string, Record<string, number>> };
    expect(agg.n).toBe(6);
    expect(agg.coverage.sex).toEqual({ Female: 3, Male: 2, 'not stated': 1 });
  });

  it('ctx_sex is exported, so ctx_sex is hashed — the ctx_state defect, not repeated', () => {
    const header = String(exportRows('survey', [])).trim().split(',');
    expect(header).toContain('ctx_sex');
    expect(SURVEY_CTX_KEYS).toContain('sex');
    expect(surveyCtxKeysFor(SURVEY_VERSION)).toContain('sex');
    const cov = chainCoverage('survey', header, {}) as { uncovered: string[]; covered: { column: string; field: string }[] };
    expect(cov.uncovered).toEqual([]);
    expect(Object.fromEntries(cov.covered.map((c) => [c.column, c.field])).ctx_sex).toBe('context.sex');
  });

  it('a row written before the instrument asked sex is still walked under its own field set', () => {
    expect(surveyCtxKeysFor('2026-09-09.2')).not.toContain('sex');
    expect(SURVEY_PROJECTIONS[0].keys).toContain('sex');
    expect(SURVEY_PROJECTIONS[0].from).toBe(SURVEY_VERSION);
  });
});

describe('the ranking read by sex — suppressed on the server, never in the browser', () => {
  it('publishes a group at the threshold and withholds one under it, counting the withholding', () => {
    const rows = [...many(SMALL_CELL_MIN, 'Female'), ...many(SMALL_CELL_MIN - 1, 'Male'), ...many(2, undefined)];
    const bySex = rankingBySex(rows) as unknown as {
      min: number; stated: number; notStated: number; withheldGroups: number; withheldResponses: number;
      groups: { sex: string; n: number; ranking: { burden: string; meanRank: number | null }[] }[];
    };
    expect(bySex.min).toBe(SMALL_CELL_MIN);
    expect(bySex.groups.map((g) => g.sex)).toEqual(['Female']);
    expect(bySex.groups[0].n).toBe(SMALL_CELL_MIN);
    expect(bySex.withheldGroups).toBe(1);
    expect(bySex.withheldResponses).toBe(SMALL_CELL_MIN - 1);
    expect(bySex.notStated).toBe(2);
    expect(bySex.stated).toBe(SMALL_CELL_MIN * 2 - 1);
  });

  it('never serves the withheld group under any key, not even emptied out', () => {
    const rows = [...many(3, 'Female'), ...many(2, 'Male')];
    const bySex = rankingBySex(rows) as unknown as { groups: unknown[] };
    expect(bySex.groups).toEqual([]);
    expect(JSON.stringify(bySex)).not.toContain('"Female"');
    expect(JSON.stringify(bySex)).not.toContain('"Male"');
  });

  it('computes a group by the same function as the total it sits under', () => {
    const female = many(SMALL_CELL_MIN, 'Female', 'oop');
    const bySex = rankingBySex([...female, ...many(4, 'Male')]) as unknown as {
      groups: { sex: string; ranking: unknown }[];
    };
    expect(bySex.groups[0].ranking).toEqual(rankOf(female));
  });

  it('the aggregate carries it, so the register can print it without asking twice', () => {
    const agg = aggregateSurvey(many(SMALL_CELL_MIN, 'Female')) as unknown as {
      rankingBySex: { groups: { sex: string }[]; method: string; why: string };
    };
    expect(agg.rankingBySex.groups.map((g) => g.sex)).toEqual(['Female']);
    expect(agg.rankingBySex.method).toMatch(/withheld/i);
    expect(agg.rankingBySex.why).toBe(SEX_ASK_ORIGIN);
  });
});

describe('every sentence about sex is sourced, and none of them is a dollar', () => {
  it('the file states the rule it holds itself to', () => {
    expect(conditionsRule).toBeTruthy();
    expect(conditionsRule).toMatch(/verify_conditions\.py/);
  });

  it('every condition either says something federal about sex or says why it cannot', () => {
    for (const c of conditions) {
      if (c.sex_note) {
        expect(c.sex_note_source, `${c.id} has a note with no source`).toBeTruthy();
        expect(c.sex_note_source_url, `${c.id} has a note with no URL`).toMatch(/^https:\/\//);
        expect(c.sex_note_blank_reason, `${c.id} has both a note and a blank reason`).toBeUndefined();
      } else {
        expect(c.sex_note_blank_reason, `${c.id} is silent on sex with no reason given`).toBeTruthy();
        expect(String(c.sex_note_blank_reason).length).toBeGreaterThan(40);
        expect(c.sex_note_source).toBeNull();
        expect(c.sex_note_source_url).toBeNull();
      }
    }
  });

  it('carries at least one federal sentence, and at least one honest blank', () => {
    expect(conditions.filter((c) => c.sex_note).length).toBeGreaterThan(0);
    expect(conditions.filter((c) => !c.sex_note).length).toBeGreaterThan(0);
  });

  it('never puts a dollar amount in a sentence about sex — no file we price from is published by sex', () => {
    for (const c of conditions) {
      expect(String(c.sex_note ?? ''), `${c.id}`).not.toMatch(/\$[0-9]/);
      expect(String(c.sex_note_blank_reason ?? ''), `${c.id}`).not.toMatch(/\$[0-9]/);
    }
  });

  it('only cites .gov files, because the ask was about the federal record', () => {
    for (const c of conditions) {
      if (c.sex_note_source_url) expect(new URL(c.sex_note_source_url).hostname).toMatch(/\.gov$/);
    }
  });

  it('the audit ran against THIS version of the file and no sex check failed', () => {
    expect(audit.conditions_version).toBe((conditionsRaw as unknown as { _version: string })._version);
    const sexChecks = audit.results.filter((r) => /\bsex\b/.test(r.check));
    expect(sexChecks.length).toBeGreaterThanOrEqual(conditions.length);
    expect(sexChecks.filter((r) => r.status !== 'PASS')).toEqual([]);
    expect(audit.results.find((r) => r.check === 'price table carries no sex field')?.status).toBe('PASS');
  });
});

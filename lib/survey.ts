/* ==========================================================================
   THE BURDEN-RANKING INSTRUMENT — five questions, one page.

   Dr. John Phillips (Senior Advisor on Health Economic Research, Office of the
   NIH Director) put this to the cohort first and returned to it three times:
   any weighting across kinds of burden must have a stated basis, and eliciting
   that basis from the affected community "would be a great contribution."

   This file is the one definition of the instrument. The survey page renders
   it, the API validates against it, the data dictionary is generated from it.
   The published output is a frequency distribution with its N, its recruitment
   channels and its dates. There is no weighting scheme of ours underneath.
   ========================================================================== */

import { SEX_NOTE, SEX_POLICY, SEX_POLICY_URL, SEX_ASK_ORIGIN, SURVEY_VERSION, BURDENS, BURDEN_IDS, DECIDERS, DECIDER_IDS, QUESTIONS, CONTEXT, CONTEXT_KEYS, INTERVIEW_QUESTIONS, STATES, SMALL_CELL_MIN, suppressSmallCells, RESPONDENT_SELF, RESPONDENT_CHILD, ONSET_BANDS, ONSET_CHILD_BANDS, NOT_DIAGNOSED, BURDENS_FOR_CHILD, QUESTIONS_FOR_CHILD, burdensFor, questionsFor, STRATA, stratumOf, ONSET_KEYS } from './survey-def.js';
export { SEX_NOTE, SEX_POLICY, SEX_POLICY_URL, SEX_ASK_ORIGIN, SURVEY_VERSION, BURDENS, BURDEN_IDS, DECIDERS, DECIDER_IDS, QUESTIONS, CONTEXT, CONTEXT_KEYS, INTERVIEW_QUESTIONS, STATES, SMALL_CELL_MIN, suppressSmallCells, RESPONDENT_SELF, RESPONDENT_CHILD, ONSET_BANDS, ONSET_CHILD_BANDS, NOT_DIAGNOSED, BURDENS_FOR_CHILD, QUESTIONS_FOR_CHILD, burdensFor, questionsFor, STRATA, stratumOf, ONSET_KEYS };
/* The corrections file's column contract: one definition, used by the export and
   by the published data dictionary below. */
import { DEFECT_COLUMNS } from './defect-columns.js';
import { COUNT_FIELD_MAP } from './count-fields.js';

export type BurdenId = 'oop' | 'time' | 'work' | 'unpaid' | 'forgone';
export type DeciderId = 'patients' | 'clinicians' | 'researchers' | 'reader';
export type ContextKey = 'age' | 'sex' | 'insurance' | 'region' | 'state' | 'stage' | 'respondent' | 'onset_age' | 'diagnosis_age';
/** The fields first asked at instrument version 2026-10-01.1, each with a publication rule of its own. */
const ONSET_FIELDS: ContextKey[] = ['respondent', 'onset_age', 'diagnosis_age'];

export interface SurveyResponse {
  ranking: BurdenId[];                 // heaviest first, all five
  unasked: BurdenId | 'all-asked';
  lead: BurdenId;
  decide: DeciderId;
  clinicians: number | null;           // 0–99
  context?: Partial<Record<ContextKey, string>>;
  sentence?: string;                   // optional, ≤280 chars, never published verbatim
  channel?: string;                    // recruitment channel slug from ?c=, ≤24 chars
  surveyVersion: string;
  receivedAt: string;
}

/** The data dictionary, generated from the instrument so it can never drift from it. */
export function dictionary() {
  /* 2026-10-01: survey.csv and gap.csv publish the day, not the time, and survey.csv
     publishes no self-description. The self-description is published only as counts at
     /api/survey, where any value held by fewer than SMALL_CELL_MIN answers is not shown
     (cf/functions/api/_cells.js). Both files carry prev_hash and row_hash so the chain can
     be checked row by row. */
  const withheldRule = `Published only as a count at /api/survey (coverage.*), never per answer. Any value held by fewer than ${SMALL_CELL_MIN} responses is not shown: it is counted in the line "fewer than ${SMALL_CELL_MIN}, not shown" and never named. "not stated" is published as it is.`;
  const prevHash = { type: '64 hex characters', values: '', note: 'the row_hash of the row above; 64 zeros on the first row. Check that each row links to the one above and that the last row_hash is the head at /api/integrity.' };
  const rowHash = { type: '64 hex characters', values: '', note: 'SHA-256 over the row as it was written, including the full time and, on the survey, the self-description. Those are not in this file, so the hash is checked by its links, not recomputed; /api/integrity?verify=1 recomputes every one over the stored rows.' };
  /* team_test (migration 0007, cf/functions/api/_annotations.js): a mark made after the row was written. */
  const teamTest = (what: string, where: string) => ({ type: 'true | false', values: '', note: `true on ${what} we marked as our own team testing the form (GET /api/annotations). The row is kept because the chain forbids deletion, and every count at ${where} leaves it out and reports how many as teamTests. A mark is made after the row was written, so it is outside the row_hash.` });
  return [
    { file: 'survey.csv', field: 'received_on', type: 'date YYYY-MM-DD (UTC)', values: 'the day the response was recorded', note: 'the day only: the time is kept for the integrity chain and never published' },
    { file: 'survey.csv', field: 'channel', type: 'string', values: 'recruitment channel slug, or "direct"', note: 'the ?c= parameter on the link the respondent used; published so the sample can be read as the sample it is' },
    { file: 'survey.csv', field: 'rank_1 … rank_5', type: 'enum', values: BURDEN_IDS.join(' | '), note: QUESTIONS.rank },
    { file: 'survey.csv', field: 'unasked', type: 'enum', values: BURDEN_IDS.join(' | ') + ' | all-asked', note: QUESTIONS.unasked },
    { file: 'survey.csv', field: 'lead', type: 'enum', values: BURDEN_IDS.join(' | '), note: QUESTIONS.lead },
    { file: 'survey.csv', field: 'decide', type: 'enum', values: DECIDER_IDS.join(' | '), note: QUESTIONS.decide },
    { file: 'survey.csv', field: 'clinicians', type: 'integer 0–99 or blank', values: 'count', note: QUESTIONS.clinicians },
    { file: 'survey.csv', field: 'survey_version', type: 'YYYY-MM-DD.N', values: 'the instrument version the answer was collected under', note: 'names which fields the integrity chain covers for that row' },
    { file: 'survey.csv', field: 'team_test', ...teamTest('an answer', '/api/survey') },
    { file: 'survey.csv', field: 'prev_hash', ...prevHash },
    { file: 'survey.csv', field: 'row_hash', ...rowHash },
    // 'state' and 'sex' have their own rows below: they are the self-descriptions with a publication rule people ask about first.
    ...(CONTEXT_KEYS as ContextKey[]).filter((k) => k !== 'state' && k !== 'sex' && !ONSET_FIELDS.includes(k)).map((k) => ({ file: '/api/survey', field: `coverage.${k}`, type: 'count per value', values: CONTEXT[k].options.join(' | ') + ' | not stated', note: `Optional self-description: ${CONTEXT[k].label}. ${withheldRule}` })),
    /* corrections.csv is generated from ONE contract:
       cf/functions/api/export/_defect-report.js DEFECT_COLUMNS, republished at
       /api/export/corrections.json. Listed here so the published dictionary
       describes every column of every file it names. */
    ...DEFECT_COLUMNS.map(([field, type, note]) => ({ file: 'corrections.csv', field, type, values: '', note })),
    { file: 'gap.csv', field: 'received_on', type: 'date YYYY-MM-DD (UTC)', values: 'the day the report was recorded', note: 'the day only: the time is kept for the integrity chain and never published' },
    { file: 'gap.csv', field: 'care-not-sought … life-lost, care-made-worse', type: 'integer or blank', values: 'occasions, times or months as labelled on /gap', note: 'events that produce zero rows in MEPS, HCUP and CMS claims' },
    { file: 'gap.csv', field: 'rank_1 … rank_7', type: 'enum or blank', values: 'gap category ids', note: 'the order the person put them in, most costly first' },
    { file: 'gap.csv', field: 'table_version', type: 'string or blank', values: 'the price table version the report was sent against', note: '' },
    { file: 'gap.csv', field: 'team_test', ...teamTest('a report', '/api/gap') },
    { file: 'gap.csv', field: 'prev_hash', ...prevHash },
    { file: 'gap.csv', field: 'row_hash', ...rowHash },
    { file: '/api/survey', field: 'coverage.sex', type: 'count per value', values: CONTEXT.sex.options.join(' | ') + ' | not stated', note: `Optional. ${SEX_ASK_ORIGIN} ${SEX_NOTE} Asked as sex, not gender, because sex is the variable the federal prevalence files cited on /method are published by; ${SEX_POLICY} sets the framing. "Prefer not to say" is a stated answer and is counted as one; a blank is counted as "not stated". ${withheldRule} The ranking read by sex (rankingBySex) is withheld on the server for any sex group under ${SMALL_CELL_MIN} responses.` },
    { file: '/api/survey', field: 'coverage.state', type: 'count per value', values: `${STATES.length} options: the 50 states, the District of Columbia and the five U.S. territories`, note: `Optional. A count of one or two people in a named place can identify a person, so any state cell holding fewer than ${SMALL_CELL_MIN} responses is withheld on the server before it is served. ${withheldRule}` },
    ...ONSET_FIELDS.map((k) => ({ file: '/api/survey', field: `coverage.${k}`, type: 'count per value', values: CONTEXT[k].options.join(' | ') + ' | not stated', note: `Optional: ${CONTEXT[k].label}. Asked from instrument version 2026-10-01.1, so every earlier answer is counted as "not stated", never as adult-onset. A parent or caregiver answering for a child sees the same five burdens, with the same ids, worded for the family; the register reads the ranking by stratum and withholds any stratum under ${SMALL_CELL_MIN} responses, its count as well as its ranking. ${withheldRule}` })),
    /* JUDGE-4 #6: every count field of the open APIs, with exactly what it
       counts. A legacy name that holds different numbers on different
       endpoints is listed as a deprecated alias, with its value on each. */
    ...COUNT_FIELD_MAP.map((r) => ({ file: r.endpoint, field: r.field, type: r.counts === 'deprecated' ? 'integer, deprecated alias' : r.field === 'answers' && r.endpoint === '/api/survey/channel' ? 'integer or null' : 'integer', values: '', note: r.note })),
    { file: 'all files', field: '(absent)', type: '', values: '', note: 'no name, no date of birth, no diagnosis, no IP address, no cookie and no free text in any file. survey.csv and gap.csv also carry no time of day and no self-description. Free-text notes are held but never exported.' },
  ];
}

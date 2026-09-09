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

import { SEX_NOTE, SEX_POLICY, SEX_POLICY_URL, SEX_ASK_ORIGIN, SURVEY_VERSION, BURDENS, BURDEN_IDS, DECIDERS, DECIDER_IDS, QUESTIONS, CONTEXT, CONTEXT_KEYS, INTERVIEW_QUESTIONS, STATES, SMALL_CELL_MIN, suppressSmallCells } from './survey-def.js';
export { SEX_NOTE, SEX_POLICY, SEX_POLICY_URL, SEX_ASK_ORIGIN, SURVEY_VERSION, BURDENS, BURDEN_IDS, DECIDERS, DECIDER_IDS, QUESTIONS, CONTEXT, CONTEXT_KEYS, INTERVIEW_QUESTIONS, STATES, SMALL_CELL_MIN, suppressSmallCells };
/* The corrections file's column contract: one definition, used by the export and
   by the published data dictionary below. */
import { DEFECT_COLUMNS } from './defect-columns.js';

export type BurdenId = 'oop' | 'time' | 'work' | 'unpaid' | 'forgone';
export type DeciderId = 'patients' | 'clinicians' | 'researchers' | 'reader';
export type ContextKey = 'age' | 'sex' | 'insurance' | 'region' | 'state' | 'stage';

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
  return [
    { file: 'survey.csv', field: 'received_at', type: 'ISO 8601 UTC timestamp', values: 'when the response was recorded', note: 'no other timing information is kept' },
    { file: 'survey.csv', field: 'channel', type: 'string', values: 'recruitment channel slug, or "direct"', note: 'the ?c= parameter on the link the respondent used; published so the sample can be read as the sample it is' },
    { file: 'survey.csv', field: 'rank_1 … rank_5', type: 'enum', values: BURDEN_IDS.join(' | '), note: QUESTIONS.rank },
    { file: 'survey.csv', field: 'unasked', type: 'enum', values: BURDEN_IDS.join(' | ') + ' | all-asked', note: QUESTIONS.unasked },
    { file: 'survey.csv', field: 'lead', type: 'enum', values: BURDEN_IDS.join(' | '), note: QUESTIONS.lead },
    { file: 'survey.csv', field: 'decide', type: 'enum', values: DECIDER_IDS.join(' | '), note: QUESTIONS.decide },
    { file: 'survey.csv', field: 'clinicians', type: 'integer 0–99 or blank', values: 'count', note: QUESTIONS.clinicians },
    // 'state' and 'sex' have their own rows below: they are the context fields with a publication rule attached.
    ...(CONTEXT_KEYS as ContextKey[]).filter((k) => k !== 'state' && k !== 'sex').map((k) => ({ file: 'survey.csv', field: `ctx_${k}`, type: 'enum or blank', values: CONTEXT[k].options.join(' | '), note: `optional self-description: ${CONTEXT[k].label}` })),
    /* corrections.csv is generated from ONE contract:
       cf/functions/api/export/_defect-report.js DEFECT_COLUMNS, republished at
       /api/export/corrections.json. Listed here so the published dictionary
       describes every column of every file it names. */
    ...DEFECT_COLUMNS.map(([field, type, note]) => ({ file: 'corrections.csv', field, type, values: '', note })),
    { file: 'gap.csv', field: 'received_at', type: 'ISO 8601 UTC timestamp', values: '', note: '' },
    { file: 'gap.csv', field: 'care-not-sought … life-lost', type: 'integer or blank', values: 'occasions, times or months as labelled on /gap', note: 'events that produce zero rows in MEPS, HCUP and CMS claims' },
    { file: 'gap.csv', field: 'rank_1 … rank_6', type: 'enum or blank', values: 'gap category ids', note: 'the order the person put them in, most costly first' },
    { file: 'survey.csv, gap.csv', field: 'ctx_sex', type: 'enum or blank', values: CONTEXT.sex.options.join(' | '), note: `Optional. ${SEX_ASK_ORIGIN} ${SEX_NOTE} Asked as sex, not gender, because sex is the variable the federal prevalence files cited on /method are published by; ${SEX_POLICY} sets the framing. "Prefer not to say" is a stated answer and is published as one; a blank is published as "not stated". On the published register any sex cell holding fewer than ${SMALL_CELL_MIN} responses is withheld under the same rule as the state, and the withheld cells are counted in public.` },
    { file: 'survey.csv, gap.csv', field: 'ctx_state', type: 'enum or blank', values: `${STATES.length} options: the 50 states, the District of Columbia and the five U.S. territories`, note: `Optional. On the published register any state cell holding fewer than ${SMALL_CELL_MIN} responses is withheld, because a count of one or two people in a named place can identify a person; the number of withheld cells and the responses they hold are published instead. The raw export carries the value as entered.` },
    { file: 'all files', field: '(absent)', type: '', values: '', note: 'no name, no date of birth, no diagnosis, no IP address, no cookie, no free text. Free-text notes are held but never exported.' },
  ];
}

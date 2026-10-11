// The one definition of the burden-ranking survey and the written-interview questions.
// Plain ESM so the Cloudflare functions (cf/functions/api/*.js), the Node routes and the
// React pages all read the same object. lib/survey.ts adds the types and the data dictionary.
/* 2026-10-01.1 adds who is answering (the person who was ill, or a parent or
   caregiver answering for a child), the age the symptoms began and the age at
   diagnosis. A patient advocate who fell ill as a child wrote on 12 September
   2026 that the questions assume someone who was a working adult when they got
   sick. Rows collected under earlier versions keep their own field set: see
   SURVEY_PROJECTIONS in cf/functions/api/_hash.js. */
export const SURVEY_VERSION = '2026-10-01.1';
export const BURDENS = [
  { id: 'oop',     label: 'Money paid out of pocket',            short: 'Out of pocket' },
  { id: 'time',    label: 'Time spent: visits, waiting, travel', short: 'Time' },
  { id: 'work',    label: 'Paid work missed',                    short: 'Work missed' },
  { id: 'unpaid',  label: 'Unpaid care from family or friends',  short: 'Unpaid care' },
  { id: 'forgone', label: 'Care you went without',               short: 'Care gone without' },
];
export const BURDEN_IDS = BURDENS.map((b) => b.id);
export const DECIDERS = [
  { id: 'patients',    label: 'Patients' },
  { id: 'clinicians',  label: 'Clinicians' },
  { id: 'researchers', label: 'Researchers' },
  { id: 'reader',      label: 'The person reading their own number' },
];
export const DECIDER_IDS = DECIDERS.map((d) => d.id);
export const QUESTIONS = {
  rank: 'Thinking about the whole time you were looking for a diagnosis, rank these from heaviest to lightest.',
  unasked: 'Which one of the five did no one ever ask you about?',
  lead: 'If a tool could show you one number about that time, which of the five should it lead with?',
  decide: 'Who should decide how these are weighed when a total is reported?',
  clinicians: 'How many different clinicians did you see before a diagnosis, or so far?',
};
// The 50 states, the District of Columbia and the five U.S. territories, so a state or
// territorial health department can find its own count in the register. Optional, like every
// other context field; a blank is published as "not stated" and never filled in.
export const STATES = [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
    'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas',
    'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
    'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
    'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
    'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
    'West Virginia', 'Wisconsin', 'Wyoming', 'American Samoa', 'Guam', 'Northern Mariana Islands', 'Puerto Rico',
    'U.S. Virgin Islands',
];
/* --------------------------------------------------------------------------
   SEX IS ASKED BECAUSE THE FEDERAL FILES ARE PUBLISHED BY IT.

   On 26 August 2026 the Federal Sprint Lead for the Invisible Illness track
   asked every team in the sprint, in writing, to "be intentional about sex
   differences where relevant" so that it is not overlooked. This is the answer
   on the face of the instrument.

   The framing is NIH's own. NOT-OD-15-102, "Consideration of Sex as a
   Biological Variable in NIH-funded Research" (released 9 June 2015),
   https://grants.nih.gov/grants/guide/notice-files/NOT-OD-15-102.html, states
   NIH's expectation "that scientists will account for the possible role of sex
   as a biological variable in vertebrate animal and human studies", and that
   doing so "includes data collection and analysis of results, as well as
   reporting of findings."

   So: the instrument asks it, the register publishes it under the same
   small-cell rule as the state, and /method says plainly which federal files
   split by sex and which do not. It is asked as sex, not as gender, because
   sex is the variable the federal prevalence files we cite are published by --
   and the CMS fee schedules we price from are published by neither. Optional,
   like every other context field. A blank is published as "not stated", never
   filled in, and it joins to no identifier, because the instrument holds none.
   -------------------------------------------------------------------------- */
export const SEX_NOTE = 'Asked because the federal prevalence files we cite are published by sex, and because NIH expects sex to be accounted for as a biological variable in the research it funds. Optional. It is published only as a count, and it is joined to nothing.';
export const SEX_POLICY = 'NIH NOT-OD-15-102, Consideration of Sex as a Biological Variable in NIH-funded Research, 9 June 2015';
export const SEX_POLICY_URL = 'https://grants.nih.gov/grants/guide/notice-files/NOT-OD-15-102.html';
export const SEX_ASK_ORIGIN = 'The Federal Sprint Lead for the Invisible Illness track asked every team, on 26 August 2026, to be intentional about sex differences where relevant.';

/* --------------------------------------------------------------------------
   WHO IS ANSWERING, AND WHEN IT BEGAN.

   The instrument was written for an adult answering about their own illness.
   An illness that began in childhood is carried, in money and in time, by a
   parent or caregiver, and the questions have to say so or the answer bends to
   fit them. So a caregiver answering for a child sees the same five burdens,
   with the same ids, worded for the family that carried them; and the age at
   onset and at diagnosis are asked on the face of the form, with bands below
   18. The ids never change, so every answer is comparable with every other,
   and the published ranking is also read by stratum (see stratumOf), so a
   pediatric-onset answer can never quietly reshape the adult-onset one.
   -------------------------------------------------------------------------- */
export const RESPONDENT_SELF = 'Me, about my own illness';
export const RESPONDENT_CHILD = 'A parent or caregiver, answering for a child';
export const ONSET_CHILD_BANDS = ['Under 5', '5–12', '13–17'];
export const ONSET_BANDS = [...ONSET_CHILD_BANDS, '18–29', '30–44', '45–64', '65 or older'];
export const NOT_DIAGNOSED = 'Not diagnosed yet';

/** The five burdens, worded for a parent or caregiver answering for a child. Same ids, same order. */
export const BURDENS_FOR_CHILD = [
  { id: 'oop',     label: 'Money the family paid out of pocket',                    short: 'Out of pocket' },
  { id: 'time',    label: 'Time spent: visits, waiting, travel, the child’s and yours', short: 'Time' },
  { id: 'work',    label: 'Paid work you or another caregiver missed',             short: 'Work missed' },
  { id: 'unpaid',  label: 'Unpaid care you and the family gave',                   short: 'Unpaid care' },
  { id: 'forgone', label: 'Care the child went without',                           short: 'Care gone without' },
];
export const QUESTIONS_FOR_CHILD = {
  rank: 'Thinking about the whole time you were looking for a diagnosis for the child, rank these from heaviest to lightest. Count what it cost you and the family, not only the child.',
  unasked: 'Which one of the five did no one ever ask you about?',
  lead: 'If a tool could show you one number about that time, which of the five should it lead with?',
  decide: 'Who should decide how these are weighed when a total is reported?',
  clinicians: 'How many different clinicians did the child see before a diagnosis, or so far?',
};
/** The wording a respondent sees. The ids and the stored answers are the same either way. */
export function burdensFor(respondent) { return respondent === RESPONDENT_CHILD ? BURDENS_FOR_CHILD : BURDENS; }
export function questionsFor(respondent) { return respondent === RESPONDENT_CHILD ? QUESTIONS_FOR_CHILD : QUESTIONS; }

/** The stratum a response is read in. A row with no onset stated (every row
 *  collected before 2026-10-01.1) is its own stratum, never assumed adult. */
export const STRATA = [
  { id: 'caregiver-child', label: 'A parent or caregiver, for a child' },
  { id: 'pediatric-onset', label: 'Began before 18, answered by the person' },
  { id: 'adult-onset',     label: 'Began at 18 or older' },
  { id: 'onset-not-stated', label: 'Age at onset not stated' },
];
export function stratumOf(context) {
  const c = context || {};
  if (c.respondent === RESPONDENT_CHILD) return 'caregiver-child';
  if (ONSET_CHILD_BANDS.includes(c.onset_age)) return 'pediatric-onset';
  if (ONSET_BANDS.includes(c.onset_age)) return 'adult-onset';
  return 'onset-not-stated';
}
/** The context fields first asked at 2026-10-01.1. A row stating an earlier version cannot carry them. */
export const ONSET_KEYS = ['respondent', 'onset_age', 'diagnosis_age'];

/* flow3-11 (judge panel #9): for a child, Medicaid is offered first and named
   "Medicaid or CHIP". Only the words and the order change; the stored value is still
   'Medicaid', so the aggregates and the CSV never split into two rows. */
export function insuranceChoices(forChild) {
  const opts = CONTEXT.insurance.options;
  if (!forChild) return opts.map((o) => ({ value: o, label: o }));
  return ['Medicaid', ...opts.filter((o) => o !== 'Medicaid')].map((o) => ({ value: o, label: o === 'Medicaid' ? 'Medicaid or CHIP' : o }));
}

export const CONTEXT = {
  age:       { label: 'Your age now', options: ['18–29', '30–44', '45–64', '65 or older'] },
  sex:       { label: 'Sex', options: ['Female', 'Male', 'Intersex', 'Prefer not to say'], note: SEX_NOTE },
  insurance: { label: 'Coverage during the search', options: ['Employer plan', 'Marketplace or individual plan', 'Medicaid', 'Medicare', 'Uninsured', 'Other or mixed'] },
  region:    { label: 'Region', options: ['Northeast', 'Midwest', 'South', 'West', 'Outside the U.S.'] },
  state:     { label: 'State or territory', options: STATES },
  stage:     { label: 'Where you are now', options: ['Still searching', 'Diagnosed', 'Stopped looking'] },
  respondent:    { label: 'Who is answering', options: [RESPONDENT_SELF, RESPONDENT_CHILD] },
  onset_age:     { label: 'Age when the symptoms began', options: ONSET_BANDS },
  diagnosis_age: { label: 'Age when it was diagnosed', options: [...ONSET_BANDS, NOT_DIAGNOSED] },
};
export const CONTEXT_KEYS = Object.keys(CONTEXT);

/* --------------------------------------------------------------------------
   SMALL CELLS ARE NOT PUBLISHED.
   A count of one or two people in a named place can identify a person, and the
   privacy promise on this tool is the precondition for everything else on it.
   Any cell below SMALL_CELL_MIN is withheld; the number of withheld cells and
   the responses they hold are published, so the table still adds up in public.
   This threshold is ours, stated here and on the register. It is not taken from
   another agency's rule.
   -------------------------------------------------------------------------- */
export const SMALL_CELL_MIN = 11;

/** counts: {label: n}. Returns the publishable cells plus an honest account of what was held back. */
export function suppressSmallCells(counts, min = SMALL_CELL_MIN) {
  const shown = {};
  let suppressedCells = 0, suppressedTotal = 0;
  for (const [k, v] of Object.entries(counts || {})) {
    const n = Number(v) || 0;
    if (n >= min) shown[k] = n;
    else if (n > 0) { suppressedCells++; suppressedTotal += n; }
  }
  return { shown, suppressedCells, suppressedTotal, min };
}
export const INTERVIEW_QUESTIONS = [
  ['q1', 'Walk us through it from the beginning. When did you first know something was wrong, and how long was it before anyone gave it a name?'],
  ['q2', 'Over that whole stretch, what did it cost you? Take that however you want to take it.'],
  ['q3', 'Think of one specific appointment or test. Do you know what it cost? What did the bill say, and what did you actually pay?'],
  ['q4', 'Was there ever a moment where the number you were told and the number you paid were very far apart? What happened?'],
  ['q5', 'If you could separate "what this illness cost me" from "what I would have spent on health care anyway", would that separation matter to you?'],
  ['q6', 'Suppose you had a complete, itemized, credible total for your own journey. What would you do with it? Who would you show it to?'],
  ['q7', 'Has there been a moment where having that number in hand would have changed something? What was the moment?'],
  ['q8', 'Open the example ledger and tell us what is wrong with it. Is there a number on it you would not trust?'],
  ['q9', 'If a tool like this had to rank which burdens matter most, how would you rank them, and who should decide that ranking?'],
  ['q10', 'What did we not ask that we should have?'],
];

/* --------------------------------------------------------------------------
   THE WRITTEN INTERVIEW, FOR A PARENT OR CAREGIVER.

   A mother answering the survey for her 14-year-old was sent on to the written
   interview (round 3, 30 September 2026) and met "what did it cost you" and
   "when did you first know something was wrong" with nowhere to say she was the
   one who carried it. The same ten questions, with the same ids, worded for the
   person who cared for someone through the search. The stored answers keep the
   same ids either way, so every interview reads beside every other.
   -------------------------------------------------------------------------- */
export const INTERVIEW_RESPONDENT_SELF = RESPONDENT_SELF;
export const INTERVIEW_RESPONDENT_CARER = 'A parent or caregiver, answering about someone else';
export const INTERVIEW_QUESTIONS_FOR_CARER = [
  ['q1', 'Walk us through it from the beginning. When did you first notice something was wrong with the person you care for, and how long was it before anyone gave it a name?'],
  ['q2', 'Over that whole stretch, what did it cost you and your family? Take that however you want to take it.'],
  ['q3', 'Think of one specific appointment or test. Do you know what it cost? What did the bill say, and what did your family actually pay?'],
  ['q4', 'Was there ever a moment where the number you were told and the number you paid were very far apart? What happened?'],
  ['q5', 'If you could separate "what this illness cost our family" from "what we would have spent on health care anyway", would that separation matter to you?'],
  ['q6', 'Suppose you had a complete, itemized, credible total for the whole search. What would you do with it? Who would you show it to?'],
  ['q7', 'Has there been a moment where having that number in hand would have changed something, for you or for them? What was the moment?'],
  ['q8', 'Open the example ledger and tell us what is wrong with it. The example is an adult\u2019s own search (missed work, a regular doctor); tell us what would be different for a child. Is there a number on it you would not trust?'],
  ['q9', 'If a tool like this had to rank which burdens matter most, counting what fell on you and the family, how would you rank them, and who should decide that ranking?'],
  ['q10', 'What did we not ask that we should have, about caring for someone through this?'],
];
/** The interview wording a respondent sees. The ids, and the answers stored under them, are the same either way. */
export function interviewQuestionsFor(respondent) {
  return respondent === INTERVIEW_RESPONDENT_CARER || respondent === RESPONDENT_CHILD ? INTERVIEW_QUESTIONS_FOR_CARER : INTERVIEW_QUESTIONS;
}

/* --------------------------------------------------------------------------
   THE RECRUITMENT CHANNEL, READ THE WAY PEOPLE TYPE IT.

   A patient organization that shares /survey?c=MEAction or ?c=me_cfs_alliance
   used to have every answer counted as "direct" in silence, because the server
   keeps only lowercase letters, digits and hyphens. The link is now read the
   way it was meant: lowercased, anything else turned into a hyphen, cut to 24.
   What cannot be read at all comes back null, and the form says so to the
   person answering instead of quietly counting them as direct.
   -------------------------------------------------------------------------- */
export const CHANNEL_RE = /^[a-z0-9-]{1,24}$/;
export function normalizeChannel(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-')
    .replace(/^-+/, '').slice(0, 24).replace(/-+$/, '');
  return CHANNEL_RE.test(s) ? s : null;
}

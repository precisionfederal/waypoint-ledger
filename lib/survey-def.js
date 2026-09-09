// The one definition of the burden-ranking survey and the written-interview questions.
// Plain ESM so the Cloudflare functions (cf/functions/api/*.js), the Node routes and the
// React pages all read the same object. lib/survey.ts adds the types and the data dictionary.
export const SURVEY_VERSION = '2026-09-09.2';
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
export const CONTEXT = {
  age:       { label: 'Age', options: ['18–29', '30–44', '45–64', '65 or older'] },
  insurance: { label: 'Coverage during the search', options: ['Employer plan', 'Marketplace or individual plan', 'Medicaid', 'Medicare', 'Uninsured', 'Other or mixed'] },
  region:    { label: 'Region', options: ['Northeast', 'Midwest', 'South', 'West', 'Outside the U.S.'] },
  state:     { label: 'State or territory', options: STATES },
  stage:     { label: 'Where you are now', options: ['Still searching', 'Diagnosed', 'Stopped looking'] },
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

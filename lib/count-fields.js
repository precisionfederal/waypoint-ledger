/* ==========================================================================
   WHAT EVERY COUNT FIELD IN THE OPEN APIS COUNTS (JUDGE-4 #6, 2026-10-01)

   The open APIs used one field name for two numbers:
     · /api/gap `respondents` was senders (1 on staging), while /api/register
       `gap.respondents` was reports (3);
     · /api/survey and /api/policy `uncounted.survey.n` were senders (2), while
       /api/register `survey.n` was answers (7);
     · `senders` on the corrections block counted distinct browser-and-figure
       keys, not senders in the survey and gap sense.

   A data lead who joins these files gets a wrong number with no error. The old
   names keep their exact values, because an adopter may already read them, and
   are documented as deprecated aliases. Every block now also carries a field
   whose name says what it counts, with the same meaning on every endpoint:

     answers             survey answers received
     reports             uncounted-care reports received
     senders             one network on one day, counted once (_senders.js)
     browserFigurePairs  distinct browser-and-figure keys among corrections

   lib/openapi.ts and the data dictionary (lib/survey.ts dictionary()) read
   their descriptions from here, and tests/count-fields-j4.test.ts pins each
   field against a fixture, so a description and its number cannot drift.
   ========================================================================== */

const TEAM = 'Rows we marked as our own team testing the form are left out (teamTests says how many).';

export const COUNT_FIELD = Object.freeze({
  answers:
    `Survey answers received: one per answer sent to POST /api/survey. ${TEAM} The same number on /api/survey, /api/register (survey) and /api/policy (uncounted.survey).`,
  reports:
    `Uncounted-care reports received: one per report sent to POST /api/gap. ${TEAM} The same number on /api/gap, /api/register (gap) and /api/policy (uncounted.gap).`,
  senders:
    'Distinct senders: one network on one day, counted once, never a verified person. A household on one connection is one sender, so this runs low, never high. Counted when a row is written, outside the row, and never larger than the answers or reports beside it. senderBasis says how to read it: "senders" when the sender index was read, "sends" when it could not be read and this equals the answers or reports, "none" when nothing has been sent.',
  submissions:
    'How many were sent: the same number as answers (survey blocks) or reports (gap blocks). Kept for callers that already read it.',
  senderBasis:
    '"senders" when senders is a distinct-sender count, "sends" when the sender index could not be read and senders equals the sends, "none" when nothing has been sent.',
  browserFigurePairs:
    'Distinct browser-and-figure keys among the corrections. The key a correction keeps is bound to one figure and table version, so one browser that corrects five figures holds five keys, and a repeat on the same figure is refused. This equals the corrections that carried a browser id. It is not a count of senders.',
  sends: `Corrections received. ${TEAM}`,
  interviews: `Written interviews received. ${TEAM}`,
  channelAnswers:
    'Answers that arrived through this link. null when fewer than smallCellMin have arrived (withheld is then true).',
});

/* JUDGE-5 #7: ONE OLD NAME, ONE NUMBER. Until now n was senders on /api/survey
   and answers on /api/register, and respondents was senders on /api/gap and
   reports on /api/register. Each old name now equals, on every endpoint, the
   one named field it aliases: n is answers, respondents is reports. Every
   payload says so in its own `deprecated` map ({alias: field}), and
   tests/aliases-j5.test.ts checks payload[alias] === payload[field] on each.
   Corrections `senders` cannot be a sender count (the key is bound to one
   figure), so it stays equal to browserFigurePairs and is described as that
   different quantity. /api/policy (uncounted.survey, uncounted.gap, disputes)
   follows the same rule and carries the same deprecated maps. */

/** alias -> the named field it equals, per block. Published in each payload as `deprecated`. */
export const ALIASES = Object.freeze({
  survey: Object.freeze({ n: 'answers' }),
  gap: Object.freeze({ respondents: 'reports' }),
  corrections: Object.freeze({ senders: 'browserFigurePairs' }),
  channel: Object.freeze({ n: 'answers' }),
});

/** The old names, with exactly what each one holds. */
export const DEPRECATED_ALIAS = Object.freeze({
  nIsAnswers:
    'Deprecated alias of answers: the same number as answers on this endpoint and on every survey block that carries both (the payload\'s deprecated map says so). Kept for existing callers. Read answers instead.',
  respondentsIsReports:
    'Deprecated alias of reports: the same number as reports on this endpoint and on every gap block that carries both (the payload\'s deprecated map says so). Kept for existing callers. Read reports instead.',
  correctionsSenders:
    'Deprecated alias of browserFigurePairs: the same number. It is a different quantity from senders on the survey, gap and interview blocks (one network on one day), because a correction key is bound to one figure. Kept for existing callers. Read browserFigurePairs instead.',
});

/** Each field as it appears in each response, for the dictionary and the tests. */
/** @type {{ endpoint: string, field: string, counts: keyof typeof COUNT_FIELD | 'deprecated', note: string }[]} */
export const COUNT_FIELD_MAP = [
  { endpoint: '/api/survey', field: 'answers', counts: 'answers', note: COUNT_FIELD.answers },
  { endpoint: '/api/survey', field: 'senders', counts: 'senders', note: COUNT_FIELD.senders },
  { endpoint: '/api/survey', field: 'submissions', counts: 'submissions', note: COUNT_FIELD.submissions },
  { endpoint: '/api/survey', field: 'n', counts: 'deprecated', note: DEPRECATED_ALIAS.nIsAnswers },
  { endpoint: '/api/survey/channel', field: 'answers', counts: 'channelAnswers', note: COUNT_FIELD.channelAnswers },
  { endpoint: '/api/survey/channel', field: 'n', counts: 'deprecated', note: DEPRECATED_ALIAS.nIsAnswers },
  { endpoint: '/api/gap', field: 'reports', counts: 'reports', note: COUNT_FIELD.reports },
  { endpoint: '/api/gap', field: 'senders', counts: 'senders', note: COUNT_FIELD.senders },
  { endpoint: '/api/gap', field: 'submissions', counts: 'submissions', note: COUNT_FIELD.submissions },
  { endpoint: '/api/gap', field: 'respondents', counts: 'deprecated', note: DEPRECATED_ALIAS.respondentsIsReports },
  { endpoint: '/api/corrections', field: 'sends', counts: 'sends', note: COUNT_FIELD.sends },
  { endpoint: '/api/corrections', field: 'browserFigurePairs', counts: 'browserFigurePairs', note: COUNT_FIELD.browserFigurePairs },
  { endpoint: '/api/corrections', field: 'senders', counts: 'deprecated', note: DEPRECATED_ALIAS.correctionsSenders },
  { endpoint: '/api/register', field: 'survey.answers', counts: 'answers', note: COUNT_FIELD.answers },
  { endpoint: '/api/register', field: 'survey.senders', counts: 'senders', note: COUNT_FIELD.senders },
  { endpoint: '/api/register', field: 'survey.n', counts: 'deprecated', note: DEPRECATED_ALIAS.nIsAnswers },
  { endpoint: '/api/register', field: 'gap.reports', counts: 'reports', note: COUNT_FIELD.reports },
  { endpoint: '/api/register', field: 'gap.senders', counts: 'senders', note: COUNT_FIELD.senders },
  { endpoint: '/api/register', field: 'gap.respondents', counts: 'deprecated', note: DEPRECATED_ALIAS.respondentsIsReports },
  { endpoint: '/api/register', field: 'corrections.browserFigurePairs', counts: 'browserFigurePairs', note: COUNT_FIELD.browserFigurePairs },
  { endpoint: '/api/register', field: 'corrections.senders', counts: 'deprecated', note: DEPRECATED_ALIAS.correctionsSenders },
  { endpoint: '/api/register', field: 'interviews.n', counts: 'interviews', note: COUNT_FIELD.interviews },
  { endpoint: '/api/register', field: 'interviews.senders', counts: 'senders', note: COUNT_FIELD.senders },
  { endpoint: '/api/interview', field: 'n', counts: 'interviews', note: COUNT_FIELD.interviews },
  { endpoint: '/api/interview', field: 'senders', counts: 'senders', note: COUNT_FIELD.senders },
  { endpoint: '/api/policy', field: 'uncounted.survey.answers', counts: 'answers', note: COUNT_FIELD.answers },
  { endpoint: '/api/policy', field: 'uncounted.survey.senders', counts: 'senders', note: COUNT_FIELD.senders },
  { endpoint: '/api/policy', field: 'uncounted.survey.n', counts: 'deprecated', note: DEPRECATED_ALIAS.nIsAnswers },
  { endpoint: '/api/policy', field: 'uncounted.gap.reports', counts: 'reports', note: COUNT_FIELD.reports },
  { endpoint: '/api/policy', field: 'uncounted.gap.senders', counts: 'senders', note: COUNT_FIELD.senders },
  { endpoint: '/api/policy', field: 'uncounted.gap.respondents', counts: 'deprecated', note: DEPRECATED_ALIAS.respondentsIsReports },
  { endpoint: '/api/policy', field: 'disputes.sends', counts: 'sends', note: COUNT_FIELD.sends },
  { endpoint: '/api/policy', field: 'disputes.browserFigurePairs', counts: 'browserFigurePairs', note: COUNT_FIELD.browserFigurePairs },
  { endpoint: '/api/policy', field: 'disputes.senders', counts: 'deprecated', note: DEPRECATED_ALIAS.correctionsSenders },
];

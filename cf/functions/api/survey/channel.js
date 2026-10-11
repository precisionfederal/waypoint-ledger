/* ==========================================================================
   GET /api/survey/channel?c=<slug> — the answers that came in through one link.

   A patient organization or a clinic that shares /survey?c=<slug> gets its own
   count back, under the same small-cell rule as everything else we publish:
     - no answers: n is 0, and that is said plainly;
     - 1 to 10 answers: nothing is served but "fewer than 11". Not the count,
       not the dates, not the ranking;
     - 11 or more: the count, the first and last day (never the time), and the
       same ranking, lead and unasked counts the whole register publishes,
       computed by the same function (rankOf in ../survey.js).

   WHAT IS NEVER SERVED PER LINK: anything a person said about themselves (age,
   sex, coverage, region, state, stage, onset). A breakdown by link and then by
   state narrows the group twice, and the whole-sample breakdown minus this one
   would give back the small cells the whole-sample rule withheld. So the
   self-descriptions stay in /api/survey, whole-sample and suppressed, and are
   not repeated here. Neither is the free-text sentence, which no endpoint serves.

   Anyone who has a link can answer through it, so this is a count of answers
   through the link, never a count of an organization's members.
   ========================================================================== */
import { json, bad } from '../_http.js';
import { all } from '../_db.js';
import { rankOf, surveyOf } from '../survey.js';
import { dayOf } from '../_cells.js';
import { normalizeChannel, SMALL_CELL_MIN } from '../../../../lib/survey-def.js';
import { ALIASES } from '../../../../lib/count-fields.js';

const tally = (arr) => arr.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {});

/** Pure: the rows that arrived through one channel -> what may be published about them. */
export function channelAggregate(channel, rows, min = SMALL_CELL_MIN) {
  const n = rows.length;
  /* `answers` is the count under its own name (JUDGE-4 #6); `n` is its
     deprecated alias, the same value, as on every survey block (JUDGE-5 #7). */
  const base = { ok: true, channel, smallCellMin: min, deprecated: ALIASES.channel };
  if (n === 0) return { ...base, answers: 0, n: 0, withheld: false, note: 'No answers have arrived through this link yet.' };
  if (n < min) return { ...base, answers: null, n: null, withheld: true, note: `Fewer than ${min} answers have arrived through this link. The count, the dates and the ranking are shown from ${min} on.` };
  const days = rows.map((r) => dayOf(r.receivedAt)).filter(Boolean).sort();
  return {
    ...base,
    answers: n,
    n,
    withheld: false,
    firstOn: days[0],
    lastOn: days[days.length - 1],
    ranking: rankOf(rows),
    lead: tally(rows.map((r) => r.lead)),
    unasked: tally(rows.map((r) => r.unasked)),
    method: `A count of answers through the link labelled "${channel}", exactly as entered. Anyone who has the link can answer through it. No weighting, no imputation. Nothing anyone said about themselves is served per link, because a second breakdown narrows the group twice; those counts are published only for the whole sample, at /api/survey, under the same rule of ${min}.`,
  };
}

export async function onRequestGet({ request, env }) {
  const raw = new URL(request.url).searchParams.get('c');
  const channel = normalizeChannel(raw || '');
  if (!channel) return bad('Give the link label as ?c=, for example ?c=your-org. It keeps lowercase letters, digits and hyphens, 24 at most.');
  try {
    const rows = (await all(env, 'SELECT * FROM survey_responses WHERE channel = ?1 ORDER BY received_at ASC, rowid ASC', channel)).map(surveyOf);
    return json(channelAggregate(channel, rows));
  } catch {
    return bad('The count for this link could not be read right now.', 503);
  }
}

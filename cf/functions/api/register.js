/* ==========================================================================
   GET /api/register — everything the public has told the government through
   this tool, in one call: the four aggregates, the change log, and the dates
   that bound the sample. One request so the register page is one paint.

   Every number here is a count of what people actually sent. No estimate, no
   imputation, no weighting scheme of ours. Free text is never included.
   ========================================================================== */
import { json, bad } from './_http.js';
import { cachedAggregate } from './_counters.js';
import { aggregateCorrections, correctionRows } from './corrections.js';
import { aggregateGap, gapRows } from './gap.js';
import { aggregateSurvey, surveyRows } from './survey.js';
import { summarizeInterviews, interviewRows } from './interview.js';
import { publishedChanges } from './changes.js';

export async function onRequestGet({ env }) {
  try {
    /* Each aggregate is served from its fold when the fold is exactly current,
       so the page a judge opens costs the same at ten rows and at a hundred
       thousand. The folds are the same pure functions as always — nothing here
       computes a published number of its own. */
    const [corrections, gap, survey, interviews] = await Promise.all([
      cachedAggregate(env, { kind: 'corrections', loadRows: correctionRows, aggregate: aggregateCorrections }),
      cachedAggregate(env, { kind: 'gap', loadRows: gapRows, aggregate: aggregateGap }),
      cachedAggregate(env, { kind: 'survey', loadRows: surveyRows, aggregate: aggregateSurvey }),
      cachedAggregate(env, { kind: 'interviews', loadRows: interviewRows, aggregate: summarizeInterviews }),
    ]);
    const changes = await publishedChanges(env);

    /* The dates that bound the sample come from the four aggregates, which each
       carry their own first and last. No second pass over the rows. */
    const dates = [corrections, gap, survey, interviews]
      .flatMap((a) => [a.firstAt, a.lastAt])
      .filter(Boolean)
      .sort();
    return json({
      ok: true,
      corrections,
      gap,
      survey,
      interviews,
      changes,
      firstAt: dates[0],
      lastAt: dates[dates.length - 1],
      generatedAt: new Date().toISOString(),
    });
  } catch { return bad('The register could not be read right now.', 503); }
}

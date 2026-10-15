/* ==========================================================================
   "X of Y survey answers ranked care gone without heaviest", read from the live
   survey aggregate (GET /api/survey, or the survey block of GET /api/register).
   Split out of lib/forgone.ts (judge panel 15 Oct B-5) so the home proof strip
   can say it without loading the counter rows. Counts are answers, never people.
   ========================================================================== */

/** The site's small-cell line (lib/survey-def.js SMALL_CELL_MIN), held here so the ledger and
 *  /adopt/kit do not carry the whole survey definition; a test pins the two together. */
export const RANK_MIN_ANSWERS = 11;

/** The survey burden id this block answers to (lib/survey-def.js BURDENS). */
export const FORGONE_BURDEN = 'forgone';

/** The survey aggregate, as much of it as this block reads. */
export interface SurveyAggregateLike {
  n?: number;
  submissions?: number;
  senderBasis?: string;
  ranking?: { burden: string; rankedFirstBy: number }[];
  /** The answers the ranking is computed from (the person's own illness). */
  headline?: { n: number };
}

/** What the live aggregate says about this burden. Counts are answers, never people. */
export interface ForgoneRank {
  /** answers that ranked care gone without first */
  first: number;
  /** answers in the aggregate */
  answers: number;
  /** true only when no other burden was ranked first by more answers */
  top: boolean;
}

/** "X of Y survey answers ranked it heaviest", from the live aggregate. Null when it cannot be said truthfully, or below the small-cell line (RANK_MIN_ANSWERS). */
export function forgoneRank(agg: SurveyAggregateLike | null | undefined): ForgoneRank | null {
  if (!agg || !Array.isArray(agg.ranking)) return null;
  /* judge4 #11: the ranking is computed over headline.n (answers about the person's own
     illness); that is its denominator, the same one the register and the filing use. */
  const answers = agg.headline && Number.isFinite(agg.headline.n) ? Number(agg.headline.n)
    : Number.isFinite(agg.submissions) ? Number(agg.submissions) : Number(agg.n);
  if (!Number.isFinite(answers) || answers <= 0) return null;
  /* Below the site's own small-cell line the sentence is not said. A handful of
     answers, some of them the team testing the form, is not a finding to put
     beside a person's ledger; /register/live still shows every count with its
     channel. */
  if (answers < RANK_MIN_ANSWERS) return null;
  const row = agg.ranking.find((r) => r.burden === FORGONE_BURDEN);
  if (!row || !Number.isFinite(row.rankedFirstBy)) return null;
  const first = Math.min(row.rankedFirstBy, answers);
  const others = agg.ranking.filter((r) => r.burden !== FORGONE_BURDEN).map((r) => (Number.isFinite(r.rankedFirstBy) ? r.rankedFirstBy : 0));
  return { first, answers, top: first > 0 && others.every((n) => n <= first) };
}

export function forgoneRankSentence(r: ForgoneRank): string {
  const noun = r.answers === 1 ? 'survey answer' : 'survey answers';
  return r.top
    ? `${r.first} of ${r.answers} ${noun} ranked it heaviest of the five burdens.`
    : `${r.first} of ${r.answers} ${noun} ranked it first of the five burdens.`;
}

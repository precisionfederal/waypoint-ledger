/* ==========================================================================
   WHO PUBLISHED THE ROWS THIS TOOL PRICES — ONE SENTENCE, COUNTED OFF THE TABLE.

   🔴 R6 sense F9: the home page and the register each described the table's
   composition in their own words, and neither matched data/prices.json. The
   register undercounted AHRQ by two and called three rows "published research"
   when only two are — the third was the GSA mileage rate, which is as federal as
   a file gets. Two pages, two answers, and a reviewer who checks either one
   against the data finds a third.

   So there is one sentence now, and it is computed. It cannot drift when a row
   is added, and it cannot disagree with the source card beside it, because both
   read `agencyOf` in lib/fit.ts — the one place that decides which body
   published a row, off the row's own source title.

   The distinction the sentence must keep: the long-COVID rows come from AHRQ's
   MEPS SURVEY but the estimate is Neba et al.'s peer-reviewed analysis of it.
   The survey is the government's; the estimate is the authors'. That is counted
   here and said out loud rather than folded into "AHRQ published 12".
   ========================================================================== */

import { TABLE } from './table';
import { agencyOf } from './fit';
import type { PriceItem } from './types';

/** The bucket `agencyOf` uses for an estimate that is somebody's analysis of a survey. */
const ANALYSIS_BUCKET = 'Peer-reviewed analysis of MEPS';

/** How each bucket is said in a sentence about who published a row. */
const PHRASE: Record<string, (n: number) => string> = {
  CMS: (n) => `${n} were published by CMS`,
  'AHRQ MEPS': (n) => `${n} come from AHRQ's MEPS survey`,
  'AHRQ HCUP': (n) => `${n} from AHRQ's HCUP`,
  BLS: (n) => `${n} from the Bureau of Labor Statistics`,
  GSA: (n) => `${n} from the General Services Administration`,
};

/** A count that opens a sentence is spelled, the way a person writes it. */
const WORD: Record<number, string> = {
  1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five',
  6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten',
};

export interface SourceComposition {
  /** rows in the table the sentence describes */
  total: number;
  /** rows per publishing body, largest first, the analysis rows folded into their survey */
  byBody: { body: string; rows: number }[];
  /** rows that are somebody's peer-reviewed analysis OF a federal survey */
  analysisRows: number;
  /** the one sentence both pages print */
  sentence: string;
}

/**
 * Compute the composition of any set of price rows. Pass nothing for the whole
 * table. Every number in the returned sentence is a count of rows on disk.
 */
export function sourceComposition(items: readonly PriceItem[] = TABLE): SourceComposition {
  const tally = new Map<string, number>();
  for (const it of items) {
    const bucket = agencyOf(it);
    // The analysis rows are counted under the survey they analyse AND counted
    // again as analyses, because both facts are true and a reader needs both.
    const body = bucket === ANALYSIS_BUCKET ? 'AHRQ MEPS' : bucket;
    tally.set(body, (tally.get(body) ?? 0) + 1);
  }
  const analysisRows = items.filter((it) => agencyOf(it) === ANALYSIS_BUCKET).length;
  const byBody = [...tally.entries()]
    .map(([body, rows]) => ({ body, rows }))
    .sort((a, b) => b.rows - a.rows || a.body.localeCompare(b.body));

  const parts = byBody.map(({ body, rows }) => (PHRASE[body] ?? ((n: number) => `${n} from ${body}`))(rows));
  const list = parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
    : parts[0] ?? 'none';

  const analysisClause = analysisRows === 0 ? '' : ` ${WORD[analysisRows] ?? String(analysisRows)} of the `
    + `MEPS row${analysisRows === 1 ? ' is' : 's are'} a peer-reviewed analysis of that survey rather than an `
    + 'AHRQ publication, and every screen that prints them says so.';

  return {
    total: items.length,
    byBody,
    analysisRows,
    sentence: `Of the ${items.length} rows this tool prices, ${list}.${analysisClause}`,
  };
}

/** The whole table's composition, computed once at module load. */
export const SOURCE_COMPOSITION = sourceComposition();

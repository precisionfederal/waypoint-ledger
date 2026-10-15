/* The reader's score on /method (judge panel 15 Oct B-6): data/reader-score.json,
   written at build by scripts/gen-reader-score.mjs from data/test-fixtures/READER-EVAL.md
   and the header of cf/functions/api/map.js. Nothing here is typed. */
export interface ReaderScore {
  sentences: number;
  rulesF1: string;
  readerF1: string;
  wrongUnitsAdded: number;
  scoredOn: string;
  model: string;
}

export const READER_EVAL_URL = 'https://github.com/precisionfederal/waypoint-ledger/blob/main/data/test-fixtures/READER-EVAL.md';

/** "30 Sep 2026" from "2026-09-30". */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return `${d} ${mon} ${y}`;
}

/** The card's one sentence. */
export function readerScoreLine(s: ReaderScore): string {
  return `AI reader, ${s.sentences} test sentences, scored ${shortDate(s.scoredOn)}: F1 ${s.rulesF1} with rules alone, `
    + `${s.readerF1} with the reader; ${s.wrongUnitsAdded} wrong ${s.wrongUnitsAdded === 1 ? 'unit' : 'units'} added`;
}

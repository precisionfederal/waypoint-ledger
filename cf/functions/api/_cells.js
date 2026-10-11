/* ==========================================================================
   SMALL CELLS NEVER LEAVE THE SERVER.

   The survey, the register, /privacy, /adopt and the survey form all promise
   that a count small enough to point at a person is not published. Until
   2026-10-01 that rule ran only in the browser (components/Register.tsx), so
   GET /api/survey served, for example, a named state with a count of 1 to
   anyone who asked. The rule now runs here, before anything is served.

   ONE THRESHOLD: SMALL_CELL_MIN in lib/survey-def.js (11), the same number
   the register prints and the survey form states.

   THE SHAPE STAYS READABLE BY THE PAGE THAT EXISTS TODAY. A breakdown is still
   a plain {value: count} map, so a client written for the old shape renders it
   without an "undefined" anywhere:
     - every value holding SMALL_CELL_MIN answers or more is published as is;
     - "not stated" is published as is: it names no value of anybody's;
     - every smaller cell is folded into ONE line, WITHHELD_LABEL, whose count
       is the answers they hold between them. No withheld value is named, and
       the map still adds up to N in public.
   The structured account (how many cells, how many answers) travels beside it,
   for a page that wants to say so in its own words.
   ========================================================================== */
import { SMALL_CELL_MIN } from '../../../lib/survey-def.js';

export { SMALL_CELL_MIN };
export const NOT_STATED = 'not stated';
export const withheldLabel = (min = SMALL_CELL_MIN) => `fewer than ${min}, not shown`;
export const WITHHELD_LABEL = withheldLabel();

/** counts: {value: n}. Returns { cells, withheld: { cells, responses, min } }. Pure. */
export function publishCells(counts, min = SMALL_CELL_MIN) {
  const cells = {};
  let withheldCells = 0, withheldResponses = 0;
  for (const [k, v] of Object.entries(counts || {})) {
    const n = Number(v) || 0;
    if (n <= 0) continue;
    if (k === NOT_STATED || n >= min) cells[k] = n;
    else { withheldCells++; withheldResponses += n; }
  }
  if (withheldResponses > 0) cells[withheldLabel(min)] = withheldResponses;
  return { cells, withheld: { cells: withheldCells, responses: withheldResponses, min } };
}

/** Every breakdown in `coverage` ({field: {value: n}}), published under the rule.
 *  Returns { coverage, withheld } keyed by the same fields. Pure. */
export function publishCoverage(coverage, min = SMALL_CELL_MIN) {
  const out = {}, withheld = {};
  for (const [k, counts] of Object.entries(coverage || {})) {
    const p = publishCells(counts, min);
    out[k] = p.cells;
    withheld[k] = p.withheld;
  }
  return { coverage: out, withheld };
}

/** A timestamp cut to its UTC day. The register publishes the day an answer
 *  arrived and never the time: a time to the millisecond, beside a row hash,
 *  would let anyone who guessed the rest of a row confirm the guess.
 *  `dayOf` gives YYYY-MM-DD for the CSV and the new fields. `dayStamp` gives
 *  YYYY-MM-DDT00:00:00 with no zone, so a page written for a full timestamp
 *  (new Date(x).toLocaleDateString()) shows that same day in every time zone
 *  instead of the day before. */
export const dayOf = (iso) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : undefined);
export const dayStamp = (iso) => { const d = dayOf(iso); return d ? d + 'T00:00:00' : undefined; };

/** firstAt / lastAt on a public aggregate, cut to the day, with the plain dates beside them. */
export function publicDates(agg) {
  if (!agg || typeof agg !== 'object') return agg;
  const out = { ...agg };
  if ('firstAt' in agg) { out.firstAt = dayStamp(agg.firstAt); out.firstOn = dayOf(agg.firstAt); }
  if ('lastAt' in agg) { out.lastAt = dayStamp(agg.lastAt); out.lastOn = dayOf(agg.lastAt); }
  return out;
}

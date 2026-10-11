/* ==========================================================================
   FLOW5 flow5-2 (2026-10-01): A NAMED DIAGNOSIS IS CONTEXT, NOT A BLANK LINE.

   "it was epilepsy" came back from the reader as the name of a condition, and
   then the ledger, the sheet and the Brief each counted it under "Without a
   federal figure" as if it were care with no price. It is not care. The two
   reasons the reader gives a diagnosis live here, in a module with no imports,
   so lib/sheet.ts can test for them without loading the whole reader.
   ========================================================================== */
export const DIAGNOSED_REASON =
  'when the answer came, not a unit of care. The visits and tests that found it are what carry a published figure';
export const DIAGNOSIS_REASON =
  'the name of a condition, not a unit of care. The visits and tests that found it are what carry a published figure';

/** True for a line that only names the diagnosis or when it came: no unit, no
 *  counter, no months. A diagnosis said with the length of the search keeps
 *  its line, as time spent searching. */
export function isDiagnosisLine(e: { item?: unknown; gapCategory?: string | null; months?: number | null; reason?: string | null }): boolean {
  if (e.item || e.gapCategory || e.months != null) return false;
  return e.reason === DIAGNOSIS_REASON || e.reason === DIAGNOSED_REASON;
}

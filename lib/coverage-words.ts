/* ==========================================================================
   WHO A MEDICARE FIGURE DOES NOT DESCRIBE, SAID CORRECTLY (judge panel 15 Oct #2.4)

   56 rows of data/prices.json (and the rows the 9 Sep additions carry) say, in
   their coverage statement: "people on a plan from work, a Marketplace plan,
   Medicaid, or no insurance, and those usually pay more than Medicare, so read
   this as the floor, not your bill." Medicaid generally pays LESS than Medicare,
   and the same lines show hospital-posted negotiated rates below Medicare, so
   "floor" is not true either. The published table and its audit hashes stay
   untouched: the words are corrected where they are rendered, here, and every
   page that prints a coverage statement reads it through this function.
   ========================================================================== */

export const MEDICAID_MORE =
  'Medicaid, or no insurance, and those usually pay more than Medicare, so read this as the floor, not your bill';
const MEDICAID_MORE_FULL = `people on a plan from work, a Marketplace plan, ${MEDICAID_MORE}`;
export const MEDICAID_FIXED =
  'people on a plan from work or a Marketplace plan, who usually pay more than Medicare; Medicaid, which usually pays less; '
  + 'or no insurance, billed the provider’s charge. Read it as Medicare’s price, not your bill';

/* The sentence that follows it in every affected row repeats "PRICE FLOOR"; once
   the corrected sentence has said "Medicare's price, not your bill", it keeps only
   its own claim (commercial insurance normally pays more, the uninsured are
   billed the charge). */
const FLOOR_AGAIN = /Read it as a PRICE FLOOR, not as your bill: commercial insurance/g;

/** A coverage statement as the reader sees it. Every other word is the data's own. */
export function coverageForReader(text: string): string {
  if (!text || !text.includes(MEDICAID_MORE)) return text;
  return text
    .split(MEDICAID_MORE_FULL).join(MEDICAID_FIXED)
    .split(MEDICAID_MORE).join(MEDICAID_FIXED)
    .replace(FLOOR_AGAIN, 'Commercial insurance');
}

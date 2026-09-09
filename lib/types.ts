/* ==========================================================================
   Waypoint Ledger — types

   🔴 THE LOAD-BEARING RULE OF THIS CODEBASE:
   `mapUtterance()` turns plain language into a UNIT OF CARE.
   `priceUnit()` looks that unit up in a published federal table.
   They are separate modules on purpose. No model, heuristic, average or
   interpolation anywhere in this app produces a dollar figure. If a unit is
   not in the table, the line is UNPRICED and shown to the user as unpriced.
   The product's entire claim is "no estimate we cannot show you."
   ========================================================================== */

/** How a published figure is denominated. These are NOT interchangeable and
 *  must never be summed across bases without saying so. */
export type PriceBasis =
  | 'charge'              // what was billed (HCUP) — almost never what anyone pays
  | 'allowed'             // negotiated/allowed amount (CMS fee schedules)
  | 'payment'             // what was actually paid, all sources (MEPS)
  | 'out_of_pocket'       // what the person paid themselves (MEPS)
  | 'total_expenditure'   // payment from all sources combined (MEPS)
  | 'wage';               // earnings, for valuing lost time (BLS)

export type Confidence = 'VERIFIED' | 'REPORTED' | 'NOT_FOUND';

/** Whether a figure is gross spending or the excess attributable to the
 *  condition. The honest headline for a diagnostic odyssey is EXCESS. */
export type Attribution = 'gross' | 'excess';

export interface PriceItem {
  id: string;
  label: string;
  /** How a real person would say this. Drives the mapping layer. */
  synonyms: string[];

  /** The figure. `null` means no real published number was found — never guess. */
  valueUsd: number | null;
  /** The out-of-pocket share, where the source reports it separately. */
  outOfPocketUsd: number | null;

  basis: PriceBasis;
  attribution: Attribution;
  year: string;
  geography: string;
  population: string;

  /** 🔴 Required. Phillips: convey "who is and isn't covered in that data".
   *  Plain English, written for a patient, not a methodologist. */
  coverage: string;

  sourceTitle: string;
  sourceUrl: string;
  /** Which agency published the figure — CMS · AHRQ · BLS · GSA. */
  agency?: string;
  /** The agency as it should be printed: "CMS", "AHRQ MEPS", "AHRQ HCUP", "BLS", "GSA". */
  agencyDisplay?: string;
  confidence: Confidence;

  /** Optional service code, shown so a clinician or analyst can check it. */
  code?: string;
  /** The LOINC order code for a lab row, confirmed at NLM. Absent where no single
   *  LOINC names the same test — a blank a health-data professional can read. */
  loinc?: string;
  /** What that LOINC means, in NLM's own words. */
  loincName?: string;
  /** Where the LOINC was confirmed. */
  loincSource?: string;
  /** Set only where CMS publishes relative value units for the code and pays
   *  nothing for it. 'N' is the file's own non-covered indicator. */
  pfsStatus?: string;
}

export interface JourneyEntry {
  key: string;
  /** Exactly what the person typed. Never normalized away — it is shown back. */
  raw: string;
  /** null when nothing in the table matches. The line survives as UNPRICED. */
  item: PriceItem | null;
  times: number;
  /** The counter care-that-did-not-happen belongs in. Never a price. */
  gapCategory?: string | null;
  /** Whole months, when the phrase named a length of time rather than care. */
  months?: number | null;
  /** Who read the phrase into this unit: the deterministic rules, or the AI reader. Shown on every screen. */
  source?: 'rules' | 'model';
  /** The AI reader's one-line reason, when it read the phrase. Never a price. */
  modelWhy?: string | null;
}

export interface PricedLine {
  entry: JourneyEntry;
  priced: boolean;
  outOfPocketUsd: number | null;
  totalUsd: number | null;
}

export interface LedgerTotals {
  outOfPocketUsd: number;
  totalUsd: number;
  outOfPocketReported: boolean;
  pricedCount: number;
  unpricedCount: number;
  /** Bases actually present, so the UI can warn when they are not addable. */
  basesUsed: PriceBasis[];
}

/** A user's verdict on a published federal figure. This is the payload that
 *  makes the tool bidirectional — the demand signal back to the agency that
 *  published the number. */
export interface Correction {
  priceId: string;
  verdict: 'right' | 'wrong';
  /** Optional free text — what the person believes the real figure is. */
  note?: string;
  submittedAt: string;
}

export interface PrevalenceFigure {
  count: number;
  label: string;
  sourceTitle: string;
  sourceUrl: string;
  year: string;
  coverage: string;
}

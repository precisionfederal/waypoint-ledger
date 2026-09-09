/* ==========================================================================
   THE SITE-OF-SERVICE FINDING — one definition, read by every surface.

   CPT 99213 priced by CMS twice in the SAME year: once where the doctor bills
   alone (non-facility), once where the doctor bills the facility amount and the
   hospital bills its own clinic fee (HCPCS G0463) on top. Same code, same year,
   same medicine — so the difference is a fact about where the visit happened,
   not about who the patient was.

   🔴 IT IS PUBLISHED OR IT IS NOTHING. This returns null unless every input is
   a present row of the published table AND both rows carry the same year AND
   that year is the current fee-schedule year. A stale ratio on a share card
   that leaves the site is a claim we cannot take back, so the card simply
   omits the line rather than print last year's arithmetic.

   The component that draws the block on the page (components/SiteOfService.tsx)
   does the same arithmetic inline today; it should import this instead, so the
   card and the page can never disagree.
   ========================================================================== */

import { TABLE, rulesFor } from './table';

const OFFICE_ID = 'cms-99213';
const HOSPITAL_FEE_ID = 'cms-g0463-hospital-clinic-fee';

/** The year the finding must be stated in to be shown at all. */
export const SITE_OF_SERVICE_YEAR = '2026';

export interface SiteOfServiceFinding {
  /** Non-facility payment: the doctor's office, one bill. */
  officeUsd: number;
  /** Facility physician payment + the hospital's own clinic fee: two bills. */
  hospitalUsd: number;
  gapUsd: number;
  /** e.g. "1.9" — one decimal, never rounded to a whole number. */
  ratio: string;
  year: string;
  /** One sentence, safe to print anywhere, including on an image that leaves the site. */
  line: string;
}

export function siteOfServiceFinding(): SiteOfServiceFinding | null {
  const office = TABLE.find((i) => i.id === OFFICE_ID);
  const hospitalFee = TABLE.find((i) => i.id === HOSPITAL_FEE_ID);
  const facilityPay = rulesFor(OFFICE_ID).alternates?.facility_setting_physician_payment_usd;
  if (!office?.valueUsd || !hospitalFee?.valueUsd || typeof facilityPay !== 'number') return null;
  /* Two rows from two different years are two different facts; refuse to net them. */
  if (office.year !== hospitalFee.year) return null;
  if (office.year !== SITE_OF_SERVICE_YEAR) return null;

  const officeUsd = office.valueUsd;
  const hospitalUsd = Math.round((facilityPay + hospitalFee.valueUsd) * 100) / 100;
  const gapUsd = Math.round((hospitalUsd - officeUsd) * 100) / 100;
  if (!(gapUsd > 0)) return null;
  const ratio = (hospitalUsd / officeUsd).toFixed(1);
  const money = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
  return {
    officeUsd, hospitalUsd, gapUsd, ratio, year: office.year,
    line: `The same visit code costs ${money(gapUsd)} more in a hospital clinic than in a doctor's office — CMS, CY${office.year}.`,
  };
}

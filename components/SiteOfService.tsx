'use client';

import { TABLE, rulesFor } from '@/lib/table';
import { usd } from '@/lib/pricing';

/**
 * 🔴 THE ACTIONABLE FINDING.
 *
 * Dr. Phillips, TOPx Cost of Illness office hours, 2026-08-20 [50:11]:
 *   "that's where the real value is going to be, is like translating to
 *    something that it's a policymaker, it's a patient, it's a doctor, can take
 *    out and say, okay, now I need to act. I know how to act because of what
 *    you're providing."
 *
 * This is that, rebuilt 2026-09-09 so it survives the obvious objection.
 *
 * It used to compare two MEPS 2014 averages — an office visit against a hospital
 * outpatient visit — which invites "isn't that just sicker patients?", because
 * the two settings do not see the same case mix and the figures were twelve
 * years old. This version compares ONE CPT CODE with itself in CY2026:
 *
 *   CPT 99213 in a freestanding office : the physician's non-facility payment.
 *   CPT 99213 in a hospital-owned clinic: the physician's FACILITY payment,
 *     which is lower, PLUS the hospital's own clinic-visit fee (HCPCS G0463),
 *     which Medicare pays on top. Two bills, one visit.
 *
 * Same code, same year, same patient, same medicine. Every figure is already a
 * row in the price table with its own coverage statement; the only arithmetic
 * is one addition and one subtraction, and both are printed on the face.
 */

const OFFICE_ID = 'cms-99213';
const HOSPITAL_FEE_ID = 'cms-g0463-hospital-clinic-fee';
const MEPS_OFFICE_ID = 'meps2014-office-visit-any';
const MEPS_HOSPITAL_ID = 'meps2014-hospital-outpatient';

export default function SiteOfService() {
  const office = TABLE.find((i) => i.id === OFFICE_ID);
  const hospitalFee = TABLE.find((i) => i.id === HOSPITAL_FEE_ID);
  const facilityPay = rulesFor(OFFICE_ID).alternates?.facility_setting_physician_payment_usd;
  const facilityRvu = rulesFor(OFFICE_ID).alternates?.facility_setting_total_rvu;

  // Every side of the comparison must be present, or it is not honest. No
  // half-claim, no placeholder.
  if (
    !office?.valueUsd || !hospitalFee?.valueUsd ||
    typeof facilityPay !== 'number' || typeof facilityRvu !== 'number'
  ) return null;

  const officeTotal = office.valueUsd;
  const hospitalTotal = Math.round((facilityPay + hospitalFee.valueUsd) * 100) / 100;
  const gap = Math.round((hospitalTotal - officeTotal) * 100) / 100;
  const ratio = (hospitalTotal / officeTotal).toFixed(1);
  const pct = (v: number) => (v / hospitalTotal) * 100;

  const mepsOffice = TABLE.find((i) => i.id === MEPS_OFFICE_ID);
  const mepsHospital = TABLE.find((i) => i.id === MEPS_HOSPITAL_ID);

  return (
    <section className="sos">
      <div className="wrap">
        <p className="eyebrow">Something you can act on</p>
        <h2>
          The same visit code costs {usd(gap, true)} more in a hospital clinic than in a doctor&rsquo;s
          office &mdash; in {office.year}.
        </h2>
        <p className="sub">
          Not our analysis, and not two different visits. One code, CPT 99213, priced by CMS twice
          in the same year: once where the doctor bills alone, once where the hospital bills too.
        </p>

        <div className="sos-grid">
          <article className="sos-card">
            <h3>What Medicare pays for CPT 99213 in {office.year}</h3>

            <div className="sos-bars">
              <div className="sos-row">
                <span className="sos-lab">
                  In a doctor&rsquo;s office
                  <em>one bill</em>
                </span>
                <div className="bar-track" aria-hidden="true">
                  <div className="sos-bar office" style={{ width: `${pct(officeTotal)}%` }} />
                </div>
                <span className="sos-val">
                  {usd(officeTotal, true)}
                  <em>the doctor, {usd(officeTotal, true)}</em>
                </span>
              </div>

              <div className="sos-row">
                <span className="sos-lab">
                  In a hospital-owned clinic
                  <em>two bills</em>
                </span>
                <div className="bar-track sos-stack" aria-hidden="true">
                  <div className="sos-bar phys" style={{ width: `${pct(facilityPay)}%` }} />
                  <div className="sos-bar hosp" style={{ width: `${pct(hospitalFee.valueUsd)}%` }} />
                </div>
                <span className="sos-val">
                  {usd(hospitalTotal, true)}
                  <em>
                    the doctor {usd(facilityPay, true)} + the hospital {usd(hospitalFee.valueUsd, true)}
                  </em>
                </span>
              </div>
            </div>

            <p className="sos-ratio">
              <strong>{usd(hospitalTotal, true)} &minus; {usd(officeTotal, true)} = {usd(gap, true)}</strong>
              <span> &nbsp;·&nbsp; {ratio}× the price, same code, same year</span>
            </p>
            <p className="sos-src">
              CMS Physician Fee Schedule (CY{office.year}) and CMS Hospital Outpatient PPS Addendum B
              (January&nbsp;{office.year}). The doctor&rsquo;s share falls to {usd(facilityPay, true)} in the
              hospital setting &mdash; {facilityRvu} facility RVUs &times; the same conversion factor
              &mdash; because the practice-expense half of the payment moves to the hospital, which
              then bills {usd(hospitalFee.valueUsd, true)} of its own.
            </p>
          </article>

          <article className="sos-card">
            <h3>What to do with that</h3>
            <p className="sos-body">
              Ask whether your specialist has an office-based location as well as a hospital clinic,
              and ask whether the clinic is <em>provider-based</em> &mdash; that is the word that turns
              one visit into two bills. For someone being sent from specialist to specialist over
              months, this is the largest single lever over what the search costs, and most people have
              never been told it exists.
            </p>
            <p className="sos-body">
              Sometimes the hospital setting is the only option, or the clinically correct one. This is
              a question to ask, not a rule to follow. And a Medicare patient&rsquo;s minimum copay on
              the hospital half alone is{' '}
              {usd(
                (rulesFor(HOSPITAL_FEE_ID).alternates
                  ?.hospital_outpatient_minimum_beneficiary_copay_usd as number) ?? null,
                true,
              )}
              .
            </p>
          </article>
        </div>

        <details className="sos-caveat">
          <summary>Where every figure here comes from, and who it does not describe</summary>
          <p><strong>{office.label}</strong> — {office.coverage}</p>
          <p><strong>{hospitalFee.label}</strong> — {hospitalFee.coverage}</p>
          <p>
            <strong>The hospital-setting physician payment.</strong>{' '}
            {String(rulesFor(OFFICE_ID).alternates?._facility_setting_note ?? '')}
          </p>
          {mepsOffice?.valueUsd && mepsHospital?.valueUsd && (
            <p>
              <strong>An older, wider corroboration.</strong> Across all payers and all ages, AHRQ&rsquo;s
              MEPS put the average office visit at {usd(mepsOffice.valueUsd)} and the average hospital
              outpatient visit at {usd(mepsHospital.valueUsd)} in {mepsOffice.year}. That is a much larger
              gap than the one above, but it compares two different mixes of patients and services and is{' '}
              {Number(office.year) - Number(mepsOffice.year)} years old, so it belongs here as background
              rather than as the finding.
            </p>
          )}
          <p>
            {office.sourceTitle} —{' '}
            <a href={office.sourceUrl} target="_blank" rel="noopener noreferrer">
              open the file and check it yourself
            </a>
            {' · '}
            {hospitalFee.sourceTitle} —{' '}
            <a href={hospitalFee.sourceUrl} target="_blank" rel="noopener noreferrer">
              open Addendum B
            </a>
          </p>
        </details>
      </div>
    </section>
  );
}

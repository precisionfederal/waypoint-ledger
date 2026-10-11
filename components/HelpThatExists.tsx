/* ==========================================================================
   HELP THAT ALREADY EXISTS — on the appointment sheet (ASKS rows 11, 33, 35).

   Dr. Phillips, Office Hours 1: "avenues where people actually can get various
   types of assistance that already exist they may not be aware of". Health
   Worth's interviewees asked for "a way to confirm the number with the actual
   provider"; the first two items are exactly that.

   🔴 THE RULES FOR THIS LIST.
   1. No dollar figure, ever. A threshold printed here would be a number with no
      row in the price table behind it.
   2. Federal sources only. Every sentence was read on 30 Sep 2026 in two
      official sources (listed per item in winloop/BETA-2026-10-01/R2-content.md).
      A sentence that could not be read twice was left out.
   3. It is information, not advice about anyone's case. Words stay plain.
   The Medicaid change for 2027 (round 4, a clinician: "a printed sheet
   outlives the rule") was read on 30 Sep 2026 in P.L. 119-21 §71112(a), (b)
   and (d) (govinfo.gov PLAW-119publ21: "the month before" for the expansion
   adult group, "the second month before" for everyone else, for applications
   on or after the first day of the first quarter beginning after 31 Dec 2026)
   and in CMS SMD #26-001, 6 Mar 2026, footnote 16 ("Effective for applications
   made on or after January 1, 2027 … a maximum of one month of retroactive
   eligibility" for the adult group). KFF's summary of §71112 agrees.
   ========================================================================== */

export interface HelpItem {
  id: string;
  title: string;
  body: string;
  /** The page a person should open. Printed in full on paper, without the scheme. */
  url: string;
}

export const HELP_ITEMS: HelpItem[] = [
  {
    id: 'good-faith-estimate',
    title: 'Ask for a good faith estimate',
    body:
      'If you do not have insurance, or you choose not to use it for a visit or test, in most cases the provider must give you '
      + 'a written estimate of the expected charges when you book at least three business days ahead, or when you ask. '
      + 'You do not need to use the words "good faith estimate". If the bill comes in well above the estimate, '
      + 'you may be able to dispute it.',
    url: 'https://www.cms.gov/nosurprises',
  },
  {
    id: 'plan-cost-tool',
    title: 'If you have insurance, ask your plan first',
    body:
      'Most health plans, from work or bought on your own, must let you look up what you would pay for a covered '
      + 'service before you get it: with an online tool, or on paper if you ask.',
    url: 'https://www.cms.gov/priorities/healthplan-price-transparency/overview/consumers',
  },
  {
    id: 'health-centers',
    title: 'Community health centers',
    body: 'What you pay at a community health center depends on your income.',
    url: 'https://findahealthcenter.hrsa.gov/',
  },
  {
    id: 'medicaid',
    title: 'Medicaid, including recent bills',
    body:
      'Medicaid may help pay for care you got in the three months before the month you applied, if you would have qualified then. '
      + 'For applications made on or after 1 January 2027, federal law shortens this to one month for adults covered '
      + 'through the Medicaid expansion and two months for everyone else. '
      + 'You can apply with your state’s Medicaid agency, or through HealthCare.gov, which passes your application '
      + 'to your state if it looks like you qualify.',
    url: 'https://www.healthcare.gov/medicaid-chip/getting-medicaid-chip/',
  },
  {
    id: 'hospital-assistance',
    title: 'Ask a nonprofit hospital for its financial assistance policy',
    body:
      'Every nonprofit (tax-exempt) hospital must have a written policy that says who can get free or discounted care '
      + 'and how to apply, and must post it on a website. If you qualify, it cannot charge you more for emergency care, '
      + 'or other care you medically need, than it generally bills people who have insurance.',
    url: 'https://www.irs.gov/charities-non-profits/financial-assistance-policy-and-emergency-medical-care-policy-section-501r4',
  },
  {
    id: 'disability',
    title: 'Disability benefits',
    body:
      'If your illness stops or limits your ability to work, Social Security has two disability programs: SSDI, for '
      + 'people with enough work history, and SSI, for people with little or no income or resources.',
    url: 'https://www.ssa.gov/disability',
  },
];

export default function HelpThatExists() {
  return (
    <section className="help-exists" aria-labelledby="help-exists-h" data-testid="help-exists">
      <h2 id="help-exists-h">Help that already exists</h2>
      <p className="help-lede">
        <span className="help-lede-screen">Federal rights and programs that can lower what this costs you. </span>
        Each one was checked against two federal sources on 30 September 2026. None of it is advice about your case.
        <span className="help-print-note"> Each address has the details.</span>
      </p>
      <ul className="help-list">
        {HELP_ITEMS.map((h) => (
          <li key={h.id}>
            <h3>{h.title}</h3>
            <p className="help-body">{h.body}</p>
            <p className="help-url">
              <a href={h.url} target="_blank" rel="noopener noreferrer">{h.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

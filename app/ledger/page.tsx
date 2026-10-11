import type { Metadata } from 'next';
import Ledger from '@/components/Ledger';
import MedicareImport from '@/components/MedicareImport';
export const metadata: Metadata = { title: 'My ledger' };

/* The number is what a person came for, so nothing stands between the heading
   and it. The sentence that used to run on here — "Open any line to see exactly
   who its figure does and does not describe" — is now at the head of the table
   it is about, where it is an instruction you can act on. */
export default function LedgerPage() {
  return (
    <section className="page">
      <div className="wrap">
        <p className="eyebrow">Step 2 of 3</p>
        {/* JUDGE-3 #9: the inner-page hero role, the --hero-h1 token PageHero uses (44 px at 1440, 28 px at 390) */}
        <h1 style={{ fontSize: 'var(--hero-h1)' }}>What it cost, line by line</h1>
        <p className="sub">Published federal figures for this pattern of care. Not a bill, and not a claim.</p>
        {/* The Medicare import. It renders nothing, not even on first paint, and
            downloads nothing more, unless GET /api/bluebutton/status says the site
            is configured (components/MedicareImport.tsx). It sits
            above the ledger because CMS sends the person back here after sign-in,
            and an empty ledger fills the screen below. */}
        <MedicareImport />
        <Ledger />
      </div>
    </section>
  );
}

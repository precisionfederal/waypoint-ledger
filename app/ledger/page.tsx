import type { Metadata } from 'next';
import Ledger from '@/components/Ledger';
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
        <h1>What it cost, line by line</h1>
        <p className="sub">Published federal figures for this pattern of care. Not a bill, and not a claim.</p>
        <Ledger />
      </div>
    </section>
  );
}

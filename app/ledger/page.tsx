import type { Metadata } from 'next';
import Stepper from '@/components/Stepper';
import Ledger from '@/components/Ledger';
export const metadata: Metadata = { title: 'My ledger' };
export default function LedgerPage() {
  return (
    <section className="page">
      <div className="wrap">
        <Stepper current={2} />
        <h1>What it cost, line by line</h1>
        <p className="sub">Published prices for this pattern of care, not a bill and not a claim. Open any line to see exactly who its figure does and does not describe.</p>
        <Ledger />
      </div>
    </section>
  );
}

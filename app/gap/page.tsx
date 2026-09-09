import type { Metadata } from 'next';
import GapClient from './GapClient';

export const metadata: Metadata = {
  title: 'The costs no dataset counted',
  description: 'Count the visits that never happened, the tests that were refused and the months lost waiting — the care that produces no row in MEPS, HCUP or Medicare claims.',
};

export default function GapPage() {
  return (
    <section className="page">
      <div className="wrap">
        <h1 className="page-h1">The costs no dataset counted</h1>
        <p className="page-h1-sub">Federal data records care that was delivered and billed. Everything below it produces no row anywhere. Counting it is the only way it exists.</p>
        <GapClient />
      </div>
    </section>
  );
}

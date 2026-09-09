import type { Metadata } from 'next';
import GapClient from './GapClient';
import { Aside } from '@/components/LongSection';

export const metadata: Metadata = {
  title: 'The costs no dataset counted',
  description: 'Count the visits that never happened, the tests that were refused and the months lost waiting — the care that produces no row in MEPS, HCUP or Medicare claims.',
};

export default function GapPage() {
  return (
    <section className="page">
      <div className="wrap">
        <p className="eyebrow">Uncounted care</p>
        <h1 className="page-h1">The costs no dataset counted</h1>
        <p className="page-h1-sub">Federal data records care that was delivered and billed; everything below that produces no row anywhere.</p>
        <GapClient />
        <Aside summary="Why counting it is the whole point">
          <p>
            A visit that never happened, a test that was refused and a month spent waiting leave nothing
            behind in MEPS, in HCUP or in a claims file. Counting them here is the only way they exist as a
            number at all.
          </p>
        </Aside>
      </div>
    </section>
  );
}

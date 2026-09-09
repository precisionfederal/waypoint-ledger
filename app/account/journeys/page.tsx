import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountJourneys } from '@/components/AccountDashboard';

export const metadata: Metadata = {
  title: 'My saved ledgers · Waypoint Ledger',
  description: 'Every ledger you have saved to your account: open it, rename it or delete it.',
};

export default function SavedLedgersPage() {
  return (
    <section className="step survey">
      <div className="wrap narrow">
        <p className="eyebrow">Your account</p>
        <h1>My saved ledgers</h1>
        <p className="sub">
          Each one opens on any device you sign in on. Deleting a ledger also stops its share link working for anyone who has it.
        </p>
        <div className="card">
          <AccountJourneys />
        </div>
        <div className="step-actions">
          <Link className="btn ghost small" href="/account">Back to my account</Link>
          <Link className="btn ghost small" href="/journey">Price another journey</Link>
        </div>
      </div>
    </section>
  );
}

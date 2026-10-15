import type { Metadata } from 'next';
import Link from 'next/link';
import { shareCard } from '@/lib/og';
import WhoShaped, { READ_ON } from '@/components/WhoShaped';

const TITLE = 'Who shaped this';
const DESCRIPTION = 'Every real input to Waypoint Ledger, what we built from it, when, and where it stands, with the proof one click away.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...shareCard(TITLE, DESCRIPTION, '/who-shaped-this'),
};

/* FINAL-1011 proof #2. A static page: no script of its own, nothing read from
   the visitor. Rows and their sources: components/WhoShaped.tsx. */
export default function WhoShapedThisPage() {
  return (
    <section className="page">
      <div className="wrap">
        <p className="eyebrow">The record</p>
        <h1 style={{ fontSize: 'var(--hero-h1)' }}>Who shaped this</h1>
        <p className="sub">
          Every real input this tool has had, what we built from it and where it stands. Each row links to its
          proof. People are named by their role, never by name, and what they said is put in our words.
        </p>
        <WhoShaped />
        <p className="micro" style={{ marginTop: 'var(--sp-4)' }}>
          Read from the <Link href="/register" prefetch={false}>register</Link> and the{' '}
          <a href="/api/changes" target="_blank" rel="noopener noreferrer">change log</a> on {READ_ON}. Our own
          test runs are not inputs and are not counted here. To add yours, <Link href="/survey" prefetch={false}>rank the burdens</Link>{' '}
          or <Link href="/interview" prefetch={false}>write an interview</Link>.
        </p>
      </div>
    </section>
  );
}

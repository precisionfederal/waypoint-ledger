import type { Metadata } from 'next';
import { shareCard } from '@/lib/og';
import PolicyBrief from '@/components/PolicyBrief';
import ThemedImg from '@/components/ThemedImg';
import './policy.css';

const TITLE = 'Policy brief';
const DESCRIPTION = 'What the published federal burden figures say and miss, where people dispute them by agency and fee schedule, and the federal policy levers that evidence speaks to. Counts with their N; cells under 11 not shown.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...shareCard(TITLE, DESCRIPTION, '/policy'),
};

export default function PolicyPage() {
  return (
    <section className="page">
      <div className="wrap">
        <header className="policy-hero">
          <div className="policy-hero-copy">
            <p className="eyebrow">Policy brief</p>
            <h1 className="page-h1">What people&rsquo;s searches for a diagnosis tell the agencies that publish the numbers</h1>
            <p className="page-h1-sub">
              The published cost of an illness, set beside what people say it missed and where they say a federal figure is wrong.
              Only counts of what people actually sent, with their N. Print it, or take the JSON.
            </p>
          </div>
          {/* VISUAL data: the policy hero (ART lane, 1200x525). Decorative: the heading beside it says what it shows. */}
          <ThemedImg light="/img/v2/policy-hero.webp" dark="/img/v2/policy-hero-dark.webp" width={1200} height={525} alt="" className="policy-hero-art no-print" loading="eager" fetchPriority="high" />
        </header>
        <PolicyBrief />
      </div>
    </section>
  );
}

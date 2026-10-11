import type { Metadata } from 'next';
import GapClient from './GapClient';
import GapStep from './GapStep';
import { Aside } from '@/components/LongSection';
import { Glance, TI } from '@/components/trust/Kit';
import { shareCard } from '@/lib/og';
import ThemedImg from '@/components/ThemedImg';
import './gap.css';

const HERO = '/img/v2/gap-hero.webp';
const HERO_DARK = '/img/v2/gap-hero-dark.webp';

const TITLE = 'The costs no dataset counted';
const DESCRIPTION = 'Count the visits that never happened, the tests that were refused and the months lost waiting: the care that produces no row in MEPS, HCUP or Medicare claims.';
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...shareCard(TITLE, DESCRIPTION, '/gap'),
};

export default function GapPage() {
  return (
    <section className="page gap-page">
      <div className="wrap">
        <header className="gp-hero">
          <div className="gp-hero-copy">
            <GapStep />
            <h1 className="page-h1">What the data never recorded about you</h1>
            <p className="page-h1-sub">Government cost files only count care you actually got. What you needed and never got is in no file at all. Count it here.</p>
          </div>
          {/* VISUAL data: the gap hero (ART lane, 1200x525). Decorative: the heading beside it says what it shows. */}
          <ThemedImg light={HERO} dark={HERO_DARK} width={1200} height={525} alt="" className="gp-hero-art" loading="eager" fetchPriority="high" />
        </header>
        <div className="gap-glance">
          <Glance label="Why this count exists" items={[
            { icon: TI.never(), big: 'No row', text: 'A visit that never happened leaves nothing in MEPS’s event files, in HCUP or in a claims file.' },
            { icon: TI.table(), big: 'A share, not you', text: 'NHIS and MEPS record that care was delayed or not received, for a share of the population, with no dollar attached.' },
            { icon: TI.shield(), big: 'Only here', text: 'Counting it here is the only way it exists as a number at all.' },
          ]} />
        </div>
        <GapClient />
        <Aside summary="Why counting it is the whole point">
          <p>
            A visit that never happened, a test that was refused and a month spent waiting leave nothing
            behind in MEPS&rsquo;s event files, in HCUP or in a claims file.{' '}
            <a href="https://www.cdc.gov/nchs/nhis/index.html" target="_blank" rel="noopener noreferrer">NHIS</a> (the National Health Interview Survey) and{' '}
            <a href="https://meps.ahrq.gov/mepsweb/about_meps/survey_back.jsp" target="_blank" rel="noopener noreferrer">MEPS</a>&rsquo;s own
            access-to-care questions record that care was delayed or not received, for a share of the
            population; neither attaches a dollar to it, and neither is about you. Counting it here is the
            only way it exists as a number at all.
          </p>
        </Aside>
      </div>
    </section>
  );
}

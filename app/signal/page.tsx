import type { Metadata } from 'next';
import Link from '@/components/IntentLink';
import Go from './Go';
import ThemedImg from '@/components/ThemedImg';
import s from './signal.module.css';

/* /signal is the earlier name of the register, and until now both URLs rendered
   the same component — one destination under two names, which is how a person
   ends up unsure whether they have already seen a page. Shared links still have
   to work, so this is a redirect stub: the meta refresh moves a browser, the
   sentence moves a reader, and nothing here is a second copy of the register. */
export const metadata: Metadata = {
  title: 'The register moved',
  robots: { index: false, follow: true },
};

export default function SignalPage() {
  return (
    <>
      <meta httpEquiv="refresh" content="0;url=/register/live" />
      <Go />
      <div className="page">
        <div className="wrap">
          <header className={s.hero}>
            <div className={s.heroCopy}>
              <p className="eyebrow">Moved</p>
              <h1>The register moved</h1>
              <p className="sub">It is now at <Link href="/register/live">the register</Link>.</p>
            </div>
            {/* VISUAL data: the register's own picture (ART lane, register-hero, 1200x525), so the
                moment between the old name and the new one already looks like the place it leads. Decorative. */}
            <ThemedImg light="/img/v2/register-hero.webp" dark="/img/v2/register-hero-dark.webp" width={1200} height={525} alt="" className={s.heroArt} loading="eager" />
          </header>
        </div>
      </div>
    </>
  );
}

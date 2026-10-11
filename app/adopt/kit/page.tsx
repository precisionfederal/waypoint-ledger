import type { Metadata } from 'next';
import OrgKit from '@/components/OrgKit';
import { shareCard } from '@/lib/og';
import { dp } from '@/components/DevPagesKit';
import { AI, Head, Tiles } from '@/components/adopt/parts';
import { PageHero, TI } from '@/components/trust/Kit';
import { SMALL_CELL_MIN } from '@/lib/survey-def';
import k from './kit.module.css';

export const metadata: Metadata = {
  title: 'Kit for your organization',
  description: 'Type your organization’s name and get a survey link that counts your community’s answers together, a QR code, a paragraph to paste, a one-page flyer and your own count page. No code, no account.',
  ...shareCard('Your organization’s own survey link, QR code and flyer', 'Type your organization’s name and get a survey link that counts your community’s answers together, a QR code and a printable flyer. No code, no account.', '/adopt/kit'),
};
export const dynamic = 'force-static';

/* VISUAL-4b (2026-09-30): the hero and the five things you get render here, on
   the server; only the form, the outputs and the flyer (OrgKit) run in the
   browser. The wrapper carries the phone tap-area and code-wrap rules, kept on
   the server so the class map never ships in the route's JavaScript. */
export default function OrgKitPage() {
  return (
    <div className={dp.dp}>
      <section className={`page ${k.kit} ${k.page}`}>
        <div className="wrap no-print">
          <PageHero
            className={k.hero}
            eyebrow="For patient organizations and clinics"
            title="Your own survey link, QR code and flyer"
            lead={<>Type your organization&rsquo;s name and get all five things below on one screen. No code, no account, nothing to install.</>}
            art={{ light: '/img/v2/4b-adopt-kit.webp', dark: '/img/v2/4b-adopt-kit-dark.webp', width: 1600, height: 618, position: '55% 0%' }}
          >
            <a className="btn primary" href="#kit-form">Start with your organization&rsquo;s name</a>
          </PageHero>
        </div>
        <div className="wrap">
          {/* FLOW4 flow4-14: the form comes first, so what typing makes appears
              under it on the first screen; the tiles that list it follow. */}
          <OrgKit />
          <div className="no-print">
            <Head id="you-get" title="What you get" lead="Made in this browser from your organization’s name. The name never leaves it." />
            <Tiles five label="What the kit makes" items={[
              { icon: <AI.link />, title: '1. Your survey link', text: <>A link to the burden survey that counts your community&rsquo;s answers together.</> },
              { icon: <AI.qr />, title: '2. A QR code', text: 'PNG and SVG, black on white, ready for paper or a screen.' },
              { icon: <AI.para />, title: '3. A paragraph to paste', text: 'For a newsletter, a group post or a waiting-room screen.' },
              { icon: <AI.print />, title: '4. A one-page flyer', text: 'Your name, the QR code, three sentences, the link and the privacy promise.' },
              { icon: <TI.table />, title: '5. Your own count page', text: <>Your answers, counted on their own. Until {SMALL_CELL_MIN} have come through, it says only &ldquo;fewer than {SMALL_CELL_MIN}&rdquo;.</> },
            ]} />
          </div>
        </div>
      </section>
    </div>
  );
}

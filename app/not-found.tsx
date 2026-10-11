import type { Metadata } from 'next';
import Link from '@/components/IntentLink';
import ThemedImg from '@/components/ThemedImg';
import s from './not-found.module.css';

export const metadata: Metadata = { title: 'That page is not here' };

/* PAGES DETAIL (2026-09-30): the 404 is a small card system like the rest of
   the product. Bo, 17:40 CT: "Don't put my email. Put contact." The
   broken-link line links to the contact page.
   VISUAL tech (2026-09-30 night): a fork in the path (img/v2/not-found.webp,
   VISUAL-art.md), the same reassurance, three ways onward as large cards, and
   the other places a person most likely meant as one quiet row. */
const WAYS = [
  { href: '/journey', name: 'Start a journey', line: 'One sentence in your own words, priced from published federal figures', icon: 'M4 18c3-6 6 2 9-4s4-7 7-8M17 6h3v3' },
  { href: '/ledger', name: 'Your ledger', line: 'What you have entered so far, priced from published federal figures', icon: 'M6 4h9l4 4v12H6zM15 4v4h4M9 13h6M9 17h6' },
  { href: '/register/live', name: 'The public register', line: 'What people said a federal figure got wrong, and the care no claims file recorded', icon: 'M4 5h16v14H4zM4 10h16M9 10v9' },
];
const PLACES = [
  { href: '/method', name: 'How a number is made', line: 'The file, the row and the arithmetic behind every figure', icon: 'M4 18V10M10 18V5M16 18v-7M22 18H2' },
  { href: '/integrity', name: 'How the count is kept honest', line: 'The register’s hash chain and how to check it', icon: 'M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6zM9 12l2 2 4-4' },
  { href: '/privacy', name: 'Privacy', line: 'What this tool keeps and what it never sees', icon: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z' },
  { href: '/developers', name: 'Developers: the API', line: 'Every route, no key, with worked calls you can copy', icon: 'M8 7l-5 5 5 5M16 7l5 5-5 5' },
];

const Ic = ({ d }: { d: string }) => (
  <span className={s.icon} aria-hidden="true">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  </span>
);
const Arrow = () => (
  <svg className={s.go} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

export default function NotFound() {
  return (
    <section className={`page ${s.page}`}>
      <div className="wrap">
        <div className={s.hero}>
          {/* decorative: a fork in the path with a blank signpost; the words are beside it */}
          <ThemedImg light="/img/v2/not-found.webp" dark="/img/v2/not-found-dark.webp" width={480} height={435} alt="" className={s.art} loading="eager" fetchPriority="high" />
          <div className={s.head}>
            <p className="eyebrow">404</p>
            <h1>That page is not here</h1>
            <p className={s.lede}>
              The link may be old, or we may have moved something. Nothing you have entered is affected: your ledger is
              kept in this browser, not on this page.
            </p>
          </div>
        </div>

        <h2 className={s.h2}>Three ways onward</h2>
        <ul className={s.ways}>
          {WAYS.map((p, i) => (
            <li key={p.href}>
              <Link className={`${s.way}${i === 0 ? ` ${s.wayMain}` : ''}`} href={p.href}>
                <Ic d={p.icon} />
                <span className={s.text}><b>{p.name}</b><span>{p.line}</span></span>
                <Arrow />
              </Link>
            </li>
          ))}
        </ul>

        <h2 className={s.h2b}>Or go straight to</h2>
        <ul className={s.grid}>
          {PLACES.map((p) => (
            <li key={p.href}>
              <Link className={s.card} href={p.href}>
                <Ic d={p.icon} />
                <span className={s.text}><b>{p.name}</b><span>{p.line}</span></span>
              </Link>
            </li>
          ))}
        </ul>
        <p className={s.foot}>
          If a link on this site brought you here, please tell us through the{' '}
          <a href="https://precisionfederal.com/contact">Contact</a> page so we can fix it.
        </p>
      </div>
    </section>
  );
}

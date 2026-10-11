/* ==========================================================================
   THE REGISTER'S DOWNLOADS AS A STRIP OF FILE CARDS (VISUAL-4b register).

   One card per file: its icon and name, one plain line of what it holds, the
   detail as labelled lines where a file has more to say, and a 44 px button per
   format at the foot of the card. Three across where there is room (the
   corrections file takes two, the method link a slim full row), two across on a
   tablet, one on a phone; DOM order is reading order at every width. No fact
   lives here; every word and every href is passed in by the page.
   ========================================================================== */
import type { ReactNode } from 'react';
import Link from '@/components/IntentLink';
import x from './files.module.css';

export function FileStrip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className={x.cq}>
      <ul className={x.strip} aria-label={label} data-explain="">{children}</ul>
    </div>
  );
}

export function FileCard({ icon, title, line, detail, wide = false, slim = false, children }: {
  icon: ReactNode; title: string; line: ReactNode; detail?: ReactNode; wide?: boolean; slim?: boolean; children: ReactNode;
}) {
  return (
    <li className={`${x.card}${wide ? ` ${x.wide}` : ''}${slim ? ` ${x.slim}` : ''}`}>
      <div className={x.head}>
        <span className={x.ic} aria-hidden="true">{icon}</span>
        <h3 className={x.title}>{title}</h3>
      </div>
      <p className={x.line}>{line}</p>
      {detail && <div className={x.detail}>{detail}</div>}
      <p className={x.gets}>{children}</p>
    </li>
  );
}

const DownIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" /><path d="M5 19.5h14" />
  </svg>
);
const OpenIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 5h5v5M19 5l-8 8" /><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  </svg>
);
const ArrowIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/** One format of one file: a 44 px pill with its format name. A file served
 *  as a download carries the download mark; one opened in a new tab, the open
 *  mark; a page on this site, an arrow. */
export function Get({ href, fmt, newTab = false, page = false, onClick, title, label }: {
  href?: string; fmt: string; newTab?: boolean; page?: boolean; onClick?: () => void; title?: string; label: string;
}) {
  const icon = page ? <ArrowIcon /> : newTab ? <OpenIcon /> : <DownIcon />;
  if (onClick) {
    return <button type="button" className={x.get} onClick={onClick} title={title} aria-label={label}>{icon}{fmt}</button>;
  }
  if (page && href) return <Link className={x.get} href={href} aria-label={label}>{icon}{fmt}</Link>;
  return (
    <a className={x.get} href={href} aria-label={label} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{icon}{fmt}</a>
  );
}

/* ==========================================================================
   The trust pages (/privacy, /adopt, /developers, /account, /accessibility)
   share four pieces: an at-a-glance band, a folded card row, a code block you
   can copy, and a method badge. Server components; only the copy button runs
   in the browser. Colours and radii are the product's own tokens.
   ========================================================================== */

import type { ReactNode } from 'react';
import CopyButton from './CopyButton';
import s from './trust.module.css';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const svg = (d: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">{d}</svg>
);

/* lucide-style strokes, 1.5 px, currentColor */
export const TI = {
  browser: () => svg(<><rect x="3" y="4" width="18" height="16" rx="2" {...P} /><path d="M3 9h18M7 6.5h.01M10 6.5h.01" {...P} /></>),
  server: () => svg(<><rect x="4" y="4" width="16" height="7" rx="1.5" {...P} /><rect x="4" y="13" width="16" height="7" rx="1.5" {...P} /><path d="M8 7.5h.01M8 16.5h.01" {...P} /></>),
  reader: () => svg(<><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4z" {...P} /><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" {...P} /></>),
  never: () => svg(<><circle cx="12" cy="12" r="8.5" {...P} /><path d="M6 6l12 12" {...P} /></>),
  clock: () => svg(<><circle cx="12" cy="12" r="8.5" {...P} /><path d="M12 7.5V12l3 2" {...P} /></>),
  calendar: () => svg(<><rect x="3.5" y="5" width="17" height="15" rx="2" {...P} /><path d="M3.5 10h17M8 3v4M16 3v4" {...P} /></>),
  table: () => svg(<><rect x="3.5" y="4" width="17" height="16" rx="2" {...P} /><path d="M3.5 9.5h17M3.5 14.5h17M10 9.5V20" {...P} /></>),
  code: () => svg(<><path d="M8.5 8L4.5 12l4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13" {...P} /></>),
  cloud: () => svg(<path d="M7 18h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.5 4.5 0 0 0 7 18z" {...P} />),
  bundle: () => svg(<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" {...P} /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" {...P} /></>),
  steps: () => svg(<><path d="M10 6h10M10 12h10M10 18h10" {...P} /><path d="M4 5.5l1.5-1v4M3.8 13.5a1.5 1.5 0 1 1 2.4 1.2L4 17h2.5" {...P} /></>),
  key: () => svg(<><circle cx="8" cy="15" r="4" {...P} /><path d="M11 12l8.5-8.5M16.5 6.5l2 2M14.5 8.5l1.5 1.5" {...P} /></>),
  shield: () => svg(<><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" {...P} /><path d="M9 12l2 2 4-4" {...P} /></>),
  device: () => svg(<><rect x="6" y="2.5" width="12" height="19" rx="2.5" {...P} /><path d="M11 18.5h2" {...P} /></>),
  trash: () => svg(<><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" {...P} /></>),
  open: () => svg(<><path d="M12 3v12M7.5 10.5L12 15l4.5-4.5" {...P} /><path d="M4 17v3h16v-3" {...P} /></>),
  eye: () => svg(<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...P} /><circle cx="12" cy="12" r="3" {...P} /></>),
  target: () => svg(<><circle cx="12" cy="12" r="8.5" {...P} /><circle cx="12" cy="12" r="4.5" {...P} /><circle cx="12" cy="12" r=".6" {...P} /></>),
  mail: () => svg(<><rect x="3" y="5.5" width="18" height="13" rx="2" {...P} /><path d="M3.5 7l8.5 6 8.5-6" {...P} /></>),
};

/** The "at a glance" band: 3 or 4 cards, a big figure or a short claim, one line under it. */
export function Glance({ items, label = 'At a glance' }: {
  items: { icon: ReactNode; big: ReactNode; text: ReactNode }[]; label?: string;
}) {
  return (
    <ul className={s.glance} aria-label={label}>
      {items.map((it, i) => (
        <li key={i} className={s.gCard}>
          <span className={s.gIc}>{it.icon}</span>
          <span className={s.gBig}>{it.big}</span>
          <span className={s.gText}>{it.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** A card row that folds: a heading and one line, a chevron, the detail behind it.
 *  Native details/summary, so Enter and Space open it and find-in-page reaches it. */
export function Fold({ id, title, summary, children, open = false, level = 2 }: {
  id: string; title: ReactNode; summary?: ReactNode; children: ReactNode; open?: boolean; level?: 2 | 3;
}) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <details className={`${s.fold}${level === 3 ? ` ${s.fold3}` : ''}`} open={open} data-sec={id}>
      <summary>
        <span className={s.foldHead}>
          <H id={id} className={s.foldTitle}>{title}</H>
          {summary && <span className={s.foldSum}>{summary}</span>}
        </span>
        <span className={s.chev} aria-hidden="true" />
      </summary>
      <div className={s.foldBody}>{children}</div>
    </details>
  );
}

/** A code block with a copy button and an optional caption above it. */
export function Code({ code, label, caption, tall = false }: {
  code: string; label: string; caption?: ReactNode; tall?: boolean;
}) {
  return (
    <figure className={s.code}>
      <figcaption className={s.codeCap}>
        <span>{caption ?? label}</span>
        <CopyButton text={code} label={label} className={s.copy} />
      </figcaption>
      {/* tabIndex so a keyboard can scroll a long block */}
      <pre className={tall ? s.preTall : s.pre} tabIndex={0} aria-label={label}><code>{code}</code></pre>
    </figure>
  );
}

export function Badge({ method }: { method: string }) {
  const m = method.toUpperCase();
  const k = m === 'GET' ? s.get : m === 'POST' ? s.post : m === 'DELETE' ? s.del : s.put;
  return <span className={`${s.badge} ${k}`}>{m}</span>;
}

/** One short labelled line for an honesty caveat, instead of a paragraph. */
export function Caveat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className={s.caveat}><span className={s.caveatLbl}>{label}</span> {children}</p>
  );
}

export { PageHero, type PageHeroArt } from './PageHero';

export { s as trust };

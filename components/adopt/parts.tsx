/* ==========================================================================
   /adopt and /adopt/kit (VISUAL-4b, 2026-09-30): the pieces that make the
   adoption pages read as a product. A contents rail (the hero is the Kit
   PageHero every inner page shares), the illustrated choice cards, the icon tiles and the
   standards chips. Server components: no JavaScript ships for any of them.
   Every word they show is handed in by the page, so the facts stay where they
   were (components/Adopt.tsx, app/adopt/kit/page.tsx).
   ========================================================================== */

import type { ReactNode } from 'react';
import u from './parts.module.css';
import ThemedImg from '../ThemedImg';

export { u as adoptUi };

/** Contents: a sticky rail at 1024 px and wider, a row of pills on phones. */
export function Rail({ items }: { items: { id: string; text: string }[] }) {
  return (
    <nav className={u.rail} aria-label="On this page">
      <p className={u.railH}>On this page</p>
      <ul>
        {items.map((t) => <li key={t.id}><a href={`#${t.id}`}>{t.text}</a></li>)}
      </ul>
    </nav>
  );
}

/** Rail on the left, the page on the right. */
export function WithRail({ items, children }: { items: { id: string; text: string }[]; children: ReactNode }) {
  return (
    <div className={u.withRail}>
      <Rail items={items} />
      <div className={u.body}>{children}</div>
    </div>
  );
}

export interface Way {
  id: string; art: string; /** the night twin, shown in the dark theme */ artDark?: string; who: ReactNode; title: ReactNode; effort: ReactNode; text: ReactNode;
  cta: { href: string; label: string; primary?: boolean }; extra?: ReactNode;
}

/** The ways to adopt, as large illustrated choice cards. */
export function Ways({ ways }: { ways: Way[] }) {
  return (
    <ol className={u.ways}>
      {ways.map((w, i) => (
        <li key={w.id} className={u.way} data-reveal="">
          <div className={u.wayArt}>
            {w.artDark
              ? <ThemedImg light={w.art} dark={w.artDark} width={480} height={336} alt="" />
              : <img src={w.art} width={480} height={336} alt="" aria-hidden="true" loading="lazy" decoding="async" />}
            <span className={u.wayNo} aria-hidden="true">{i + 1}</span>
          </div>
          <div className={u.wayBody}>
            <p className={u.wayWho}>{w.who}</p>
            <h3 id={`way-${w.id}`} className={u.wayTitle}>{w.title}</h3>
            <p className={u.effort}><Clock />{w.effort}</p>
            <p className={u.wayText}>{w.text}</p>
            {w.extra}
            <a className={`btn ${w.cta.primary ? 'primary' : 'ghost'} ${u.wayCta}`} href={w.cta.href}>
              {w.cta.label}<Arrow />
            </a>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Icon tiles: what an adopter gets. With an href, each one links to the thing itself. */
export function Tiles({ items, label, five = false }: {
  items: { icon: ReactNode; title: ReactNode; text: ReactNode; href?: string; go?: string }[]; label: string;
  /** five across on a wide screen, so five tiles never leave one alone on a row */
  five?: boolean;
}) {
  return (
    <ul className={`${u.tiles}${five ? ` ${u.five}` : ''}`} aria-label={label}>
      {items.map((t, i) => {
        const inner = (
          <>
            <span className={u.tileIc}>{t.icon}</span>
            <span className={u.tileTitle}>{t.title}</span>
            <span className={u.tileText}>{t.text}</span>
            {t.go && <span className={u.tileGo}>{t.go}<Arrow /></span>}
          </>
        );
        return (
          <li key={i} data-reveal="">
            {t.href ? <a className={u.tile} href={t.href}>{inner}</a> : <div className={`${u.tile} ${u.still}`}>{inner}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export type ChipState = 'live' | 'off' | 'none';

/** Standards as chips. Each one links to the page or file that proves it. */
export function Chips({ title, groups }: {
  title: ReactNode;
  groups: { state: ChipState; label: string; chips: { name: ReactNode; note?: ReactNode; href: string }[] }[];
}) {
  return (
    <div className={`${u.chipGroups} ${u.reveal}`} data-reveal="">
      <h3 className={u.chipTitle}>{title}</h3>
      {groups.map((g) => (
        <div key={g.label} className={u.chipGroup}>
          <p className={u.chipLbl}><span className={`${u.dot} ${u[g.state]}`} aria-hidden="true" />{g.label}</p>
          <ul className={u.chips}>
            {g.chips.map((c, i) => (
              <li key={i}>
                <a className={`${u.chip} ${u[`c_${g.state}`]}`} href={c.href}>
                  <span className={u.chipName}>{c.name}</span>
                  {c.note && <span className={u.chipNote}>{c.note}</span>}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** A section heading with its one plain lead sentence. */
export function Head({ id, title, lead, eyebrow }: { id: string; title: ReactNode; lead?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className={u.head}>
      {eyebrow && <p className={u.headEyebrow}>{eyebrow}</p>}
      <h2 id={id} className={u.h2}>{title}</h2>
      {lead && <p className={u.headLead}>{lead}</p>}
    </div>
  );
}

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const Arrow = () => (
  <svg className={u.arrow} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" {...S} /></svg>
);
const Clock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" {...S} /><path d="M12 7.5V12l3 2" {...S} /></svg>
);

const svg = (d: ReactNode) => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">{d}</svg>;
/** Icons the trust Kit does not have (lucide-style, 1.6 px, currentColor). */
export const AI = {
  qr: () => svg(<><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" {...S} /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1" {...S} /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1" {...S} /><path d="M14 14h2.5v2.5M20.5 14v.01M14 20.5h.01M17.5 17.5h3v3h-3z" {...S} /></>),
  link: () => svg(<><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" {...S} /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" {...S} /></>),
  para: () => svg(<><path d="M4 6h16M4 10.5h16M4 15h10M4 19.5h7" {...S} /></>),
  print: () => svg(<><path d="M7 9V3.5h10V9" {...S} /><rect x="3.5" y="9" width="17" height="8" rx="2" {...S} /><path d="M7 14h10v6.5H7z" {...S} /></>),
  chart: () => svg(<><path d="M4 20V4M4 20h16" {...S} /><path d="M8 16v-4M12 16V8M16 16v-6" {...S} /></>),
  files: () => svg(<><path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" {...S} /><path d="M14 3.5v5h5M9 13h6M9 16.5h4" {...S} /></>),
  catalog: () => svg(<><ellipse cx="12" cy="6" rx="7.5" ry="2.8" {...S} /><path d="M4.5 6v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6" {...S} /></>),
};

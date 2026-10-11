/* The one inner-page hero, split out of Kit.tsx with its own CSS module (re-merge):
   a page that needs only the hero no longer ships the trust kit's whole class map. */
import type { ReactNode } from 'react';
import ThemedImg from '../ThemedImg';
import s from './PageHero.module.css';

/** The one inner-page hero (VISUAL-4b hero, 2026-09-30 night; the site rule agreed
 *  with the VISUAL session, the same as /gap and /register/live): the eyebrow, H1,
 *  lead and any points or buttons on the left, the art on the right in a 527 px column
 *  (527x231 at 1440), the H1 at clamp(1.75rem, 2.2vw + 1rem, 2.75rem). Under 860 px
 *  the art sits above the words in an 11rem crop. A dark twin goes through ThemedImg,
 *  the site's one light/dark image mechanism. Decorative art (alt "") is aria-hidden.
 *  Home keeps its own hero; /survey and /interview keep their centred art.
 *  Place it inside a .wrap. */
export type PageHeroArt = {
  light: string; dark?: string; width: number; height: number; alt?: string;
  /** object-position for the crop, e.g. '50% 60%' (desktop and phone unless mobilePosition is set) */
  position?: string; mobilePosition?: string;
};
export function PageHero({ eyebrow, title, lead, children, art, className, titleId }: {
  eyebrow?: ReactNode; title: ReactNode; lead?: ReactNode; children?: ReactNode;
  art: PageHeroArt; className?: string; titleId?: string;
}) {
  const alt = art.alt ?? '';
  /* custom properties inherit, so the crop rides on the header and reaches either copy */
  const pos = {
    ...(art.position ? { ['--ph-pos' as string]: art.position } : {}),
    ...(art.mobilePosition || art.position ? { ['--ph-pos-m' as string]: art.mobilePosition ?? art.position } : {}),
  };
  return (
    <header className={`${s.ph}${className ? ` ${className}` : ''}`} style={pos}>
      <div className={s.phCopy}>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 id={titleId} className={s.phH1}>{title}</h1>
        {lead && <p className={s.phLead}>{lead}</p>}
        {children && <div className={s.phMore}>{children}</div>}
      </div>
      {art.dark
        ? <ThemedImg light={art.light} dark={art.dark} width={art.width} height={art.height} alt={alt}
            className={s.phArt} loading="eager" fetchPriority="high" />
        /* eslint-disable-next-line @next/next/no-img-element */
        : <img className={s.phArt} src={art.light} width={art.width} height={art.height} alt={alt}
            loading="eager" fetchPriority="high" decoding="async" {...(alt === '' ? { 'aria-hidden': true as const } : {})} />}
    </header>
  );
}

import type { Metadata } from 'next';

/* FLOW adopter-10 (2026-09-30): a child route that sets no openGraph inherits the
   layout's, so a group that posted its survey link got the home page's card and
   og:url. Next replaces openGraph and twitter whole per segment, so a route that
   sets its own must carry the image too; this is the one place that does. */
const IMAGE = { url: '/og.png', width: 1200, height: 630, alt: 'Waypoint Ledger: what did your diagnostic search actually cost? Every figure cited to a published federal file.' };

/* VISUAL (2026-09-30 night): each route that has its own illustrated card shares it
   (public/og/*.png, 1200x630, made from the route's own title over its hero art by
   winloop/BETA-2026-10-01/art-og/cards.mjs). Any other route keeps the site card. */
export const ROUTE_CARD: Record<string, string> = {
  '/': '/og/home.png',
  '/gap': '/og/gap.png',
  '/register/live': '/og/register-live.png',
  '/conditions': '/og/conditions.png',
  '/survey': '/og/survey.png',
  '/developers': '/og/developers.png',
  '/interview': '/og/interview.png',
  /* VISUAL-4b (2026-09-30 night): same template, over the 4b hero art
     (winloop/BETA-2026-10-01/art-og/cards-4b.json). */
  '/method': '/og/method.png',
  '/privacy': '/og/privacy.png',
  '/adopt': '/og/adopt.png',
  '/adopt/kit': '/og/adopt-kit.png',
  /* 4a (2026-10-01): the four routes that still fell back to the home card
     (waypoint-art-2026-10-01/og-missing, same template, 1200x630). */
  '/policy': '/og/policy.png',
  '/integrity': '/og/integrity.png',
  '/accessibility': '/og/accessibility.png',
  '/ledger/map': '/og/ledger-map.png',
};

export function shareCard(title: string, description: string, path: string): Pick<Metadata, 'openGraph' | 'twitter'> {
  const url = ROUTE_CARD[path] ?? IMAGE.url;
  const image = { ...IMAGE, url, alt: url === IMAGE.url ? IMAGE.alt : `Waypoint Ledger: ${title}` };
  return {
    openGraph: { title, description, type: 'website', siteName: 'Waypoint Ledger', url: path, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [url] },
  };
}

import type { Metadata, Viewport } from 'next';
import './fonts.css';
import './globals.css';
import './product.css';
import Shell from '@/components/Shell';
import UseBeacon from '@/components/UseBeacon';
import './core.css';
import build from '@/public/build.json';
import { chunkRecoveryScript } from '@/lib/chunk-recovery';

export const metadata: Metadata = {
  title: { default: 'Waypoint Ledger', template: '%s · Waypoint Ledger' },
  description: 'Prices one person’s diagnostic journey from published U.S. federal figures and cites every one, and says so where a figure is an analysis of a federal survey. Never invents a number.',
  applicationName: 'Waypoint Ledger',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  metadataBase: new URL('https://waypointledger.org'),
  appleWebApp: { capable: true, title: 'Waypoint', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  openGraph: {
    title: 'Waypoint Ledger',
    description: 'What did your diagnostic search cost? Every figure cited to a published federal file.',
    type: 'website',
    siteName: 'Waypoint Ledger',
    /* No url here (FLOW adopter-10): a route that sets no card of its own inherited
       og:url = the home page, so its shared link claimed to be the home page. Routes
       that want their own card use lib/og.ts. */
    images: [{ url: '/og/home.png', width: 1200, height: 630, alt: 'Waypoint Ledger: what did your diagnostic search actually cost? Every figure cited to a published federal file.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Waypoint Ledger',
    description: 'What did your diagnostic search cost? Every figure cited to a published federal file.',
    images: ['/og/home.png'],
  },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0e2a3a' };

/* The service worker's cache names carry THIS build's stamp. public/build.json is
   written before every build (scripts/gen-build-json.mjs), and its builtAt changes
   on every build even when the commit does not, so every deploy registers a
   different worker URL: the browser installs the new worker, and its activate
   step deletes every cache the previous build left. A judge who opened the site
   yesterday gets today's pages and today's route payloads, never a mix. */
const SW_VERSION = `${build.shortCommit}-${(Date.parse(build.builtAt) || 0).toString(36)}`.replace(/[^a-z0-9-]/gi, '');

/* Registers the service worker, then hands it the static URLs this page actually
   loaded so the routes it links to are warm before the connection drops. */
const SW_REGISTER = `if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js?v=${SW_VERSION}').then(function(reg){function send(){var sw=navigator.serviceWorker.controller||reg.active;if(!sw)return;try{var u=performance.getEntriesByType('resource').map(function(e){return e.name}).filter(function(n){return n.indexOf(location.origin+'/')===0&&(n.indexOf('/_next/static/')>-1||/\\.(css|js|png|svg|woff2|json|csv)(\\?|$)/.test(n))});if(u.length)sw.postMessage({type:'PRECACHE',urls:u})}catch(e){}}if(reg.active)send();navigator.serviceWorker.addEventListener('controllerchange',send)}).catch(function(){})})}`;

/* The page theme, set before the first paint so a dark page never flashes white.
   Bo, 2026-09-09: "just have it default to light every single time." Light stays
   the default for everyone, whatever the OS asks: the theme is dark only when this
   person chose it with the footer switch (components/ThemeToggle.tsx), which stores
   'dark' or 'light' under wl-theme. Storage blocked or empty means light. */
const THEME_INIT = `(function(){var t='light';try{var s=localStorage.getItem('wl-theme');if(s==='dark'||s==='light')t=s}catch(e){}var d=document.documentElement;d.setAttribute('data-theme',t);d.style.colorScheme=t})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The server always stamps light, so the dark media block in globals.css (guarded
  // :root:not([data-theme="light"])) never applies; THEME_INIT may turn it dark before
  // paint, which is why <html> carries suppressHydrationWarning.
  return (
    <html lang="en" data-theme="light" style={{ colorScheme: 'light' }} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {/* First, before any chunk can fail: a tab left open across a deploy
            reloads once into the new build (lib/chunk-recovery.ts). */}
        <script dangerouslySetInnerHTML={{ __html: chunkRecoveryScript(SW_VERSION) }} />
        {/* Type is served from this origin (see app/fonts.css). The two faces every page
            paints with are preloaded; the rest arrive only if a page needs them. */}
        <link rel="preload" href="/fonts/figtree-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/bricolage-grotesque-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <Shell>{children}</Shell>
        <UseBeacon />
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER }} />
      </body>
    </html>
  );
}

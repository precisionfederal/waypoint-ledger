import type { Metadata, Viewport } from 'next';
import './fonts.css';
import './globals.css';
import './product.css';
import Shell from '@/components/Shell';

export const metadata: Metadata = {
  title: { default: 'Waypoint Ledger', template: '%s · Waypoint Ledger' },
  description: 'Prices one person’s diagnostic journey from published U.S. federal figures and cites every one. Never invents a number.',
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
  metadataBase: new URL('https://waypoint-ledger.pages.dev'),
  appleWebApp: { capable: true, title: 'Waypoint', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  openGraph: {
    title: 'Waypoint Ledger',
    description: 'What did your diagnostic search cost? Every figure cited to a published federal file.',
    type: 'website',
    siteName: 'Waypoint Ledger',
    url: '/',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Waypoint Ledger — what did your diagnostic search actually cost? Every figure cited to a published federal file.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Waypoint Ledger',
    description: 'What did your diagnostic search cost? Every figure cited to a published federal file.',
    images: ['/og.png'],
  },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0e2a3a' };

/* Registers the service worker, then hands it the static URLs this page actually
   loaded so the routes it links to are warm before the connection drops. */
const SW_REGISTER = `if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').then(function(reg){function send(){var sw=navigator.serviceWorker.controller||reg.active;if(!sw)return;try{var u=performance.getEntriesByType('resource').map(function(e){return e.name}).filter(function(n){return n.indexOf(location.origin+'/')===0&&(n.indexOf('/_next/static/')>-1||/\\.(css|js|png|svg|woff2|json|csv)(\\?|$)/.test(n))});if(u.length)sw.postMessage({type:'PRECACHE',urls:u})}catch(e){}}if(reg.active)send();navigator.serviceWorker.addEventListener('controllerchange',send)}).catch(function(){})})}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Bo, 2026-09-09: "just have it default to light every single time." The light stamp is set here, so the
  // dark media block in globals.css (guarded :root:not([data-theme="light"])) never applies, whatever the OS asks.
  return (
    <html lang="en" data-theme="light" style={{ colorScheme: 'light' }}>
      <head>
        {/* Type is served from this origin (see app/fonts.css). The two faces every page
            paints with are preloaded; the rest arrive only if a page needs them. */}
        <link rel="preload" href="/fonts/figtree-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/bricolage-grotesque-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <Shell>{children}</Shell>
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER }} />
      </body>
    </html>
  );
}

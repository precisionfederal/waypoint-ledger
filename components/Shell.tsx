'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { StoreProvider, useStore } from '@/lib/store';
import { Icon } from './Icons';
import Toasts from './Toasts';

/* ==========================================================================
   The frame.

   The header used to carry eight destinations plus a pill. Nobody holds eight,
   and a person who arrived with one question ("what did this cost me?") had to
   read a menu before they could ask it. The bar is now FOUR links and one
   button; everything else moved into the footer under three headings that say
   who each group is for, and the phone menu shows those same three headings
   under the four links. Nothing was deleted — every destination that was in
   the header is still one tap away, and every one of them is in the footer of
   every page.
   ========================================================================== */

const NAV = [
  { href: '/journey', label: 'Price my journey' },
  { href: '/ledger', label: 'My ledger' },
  { href: '/register', label: 'The register' },
  { href: '/method', label: 'How it is made' },
];

type MoreLink = { href: string; label: string; external?: boolean };
type MoreGroup = { head: string; links: MoreLink[] };

/* One list, rendered twice: the footer columns and the phone menu. Two copies
   of this list is how a footer and a menu start disagreeing about what exists. */
const MORE: MoreGroup[] = [
  {
    head: 'For you',
    links: [
      { href: '/sheet', label: 'Appointment sheet' },
      { href: '/survey', label: 'Rank the burdens' },
      { href: '/interview', label: 'Written interview' },
      { href: '/account', label: 'Save across devices' },
    ],
  },
  {
    head: 'For agencies and developers',
    links: [
      { href: '/developers', label: 'Developers: the API' },
      { href: '/adopt', label: 'Run this yourself' },
      { href: '/api/corrections', label: 'Open data: corrections', external: true },
      { href: '/api/gap', label: 'Open data: the gap', external: true },
      { href: '/api/survey', label: 'Open data: burden rankings', external: true },
      { href: '/data/dictionary.csv', label: 'Data dictionary', external: true },
    ],
  },
  {
    head: 'About',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/integrity', label: 'The integrity record' },
      { href: '/accessibility', label: 'Accessibility' },
    ],
  },
];

function MoreLinks({ links }: { links: MoreLink[] }) {
  return (
    <>
      {links.map((l) => (l.external
        ? <a key={l.href} href={l.href} target={l.href.startsWith('/api') ? '_blank' : undefined} rel="noopener noreferrer">{l.label}</a>
        : <Link key={l.href} href={l.href}>{l.label}</Link>
      ))}
    </>
  );
}

/* A button that points at the page you are standing on is a dead control, and
   the header used to offer "Open my ledger" while you were on /ledger. So the
   one CTA always points somewhere you are not. */
function ctaFor(path: string, count: number): { href: string; label: string } | null {
  if (count > 0) return path === '/ledger' ? { href: '/journey', label: 'Add more care' } : { href: '/ledger', label: 'Open my ledger' };
  return path === '/journey' ? null : { href: '/journey', label: 'Price my journey' };
}

function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const { entries } = useStore();
  useEffect(() => { setOpen(false); }, [path]);
  const cta = ctaFor(path, entries.length);
  return (
    <header className="site">
      <div className="wrap bar">
        <Link href="/" className="brand" aria-label="Waypoint Ledger home">
          <Icon.Logo />
          <span className="name">Waypoint Ledger</span>
        </Link>
        <nav id="topnav" className={`topnav ${open ? 'open' : ''}`} aria-label="Site">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? 'page' : undefined}>
              {n.label}{n.href === '/ledger' && entries.length > 0 && <span className="pill-n">{entries.length}</span>}
            </Link>
          ))}
          {/* the same three headings as the footer, so the menu and the footer
              can never drift apart; hidden at desktop widths by CSS */}
          <div className="nav-more">
            {MORE.map((g) => (
              <div key={g.head} className="nav-group">
                <p className="foot-h">{g.head}</p>
                <MoreLinks links={g.links} />
              </div>
            ))}
          </div>
        </nav>
        <div className="bar-right">
          {cta && <Link href={cta.href} className="btn primary small nav-cta">{cta.label}</Link>}
          <button className="menu-btn" type="button" aria-expanded={open} aria-controls="topnav" aria-label={open ? 'Close the menu' : 'Open the menu'} onClick={() => setOpen((o) => !o)}><Icon.Menu /></button>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-foot">
      <div className="wrap foot-top">
        <div className="brand"><Icon.Logo size={24} /><span className="name">Waypoint Ledger</span></div>
        <p className="micro">Prices one person&rsquo;s diagnostic journey from published U.S. federal figures and cites every one. Never invents a number.</p>
      </div>
      <div className="wrap foot-grid">
        {MORE.map((g) => (
          <nav key={g.head} aria-label={g.head}>
            <p className="foot-h">{g.head}</p>
            <MoreLinks links={g.links} />
          </nav>
        ))}
      </div>
      <div className="wrap foot-legal">
        <p className="micro">Built by Bo Peng at Precision Federal, Ames, Iowa &middot; <a href="mailto:bo@precisionfederal.com">bo@precisionfederal.com</a> &middot; open source, Apache 2.0: <a href="https://github.com/precisionfederal/waypoint-ledger" rel="noopener">github.com/precisionfederal/waypoint-ledger</a></p>
        <p className="micro">Built in the TOPx HHS Tech Sprint for AI and Invisible Illness, Cost of Illness track.</p>
        <p className="micro">Not a diagnostic device. Not medical, legal or financial advice. Your journey stays in your browser. A correction you choose to send contains no personal information.</p>
      </div>
    </footer>
  );
}

const INSTALL_DISMISSED = 'waypoint-ledger.install-dismissed';

/* The browser only fires beforeinstallprompt where installing is actually
   possible, so this card never appears anywhere it would be a dead end. */
function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(INSTALL_DISMISSED) === '1') return;
      if (window.matchMedia('(display-mode: standalone)').matches) return;
    } catch { /* storage unavailable: still offer it */ }
    setHidden(false);
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setEvt(null); setHidden(true); try { localStorage.setItem(INSTALL_DISMISSED, '1'); } catch { /* */ } };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  const dismiss = useCallback(() => { setHidden(true); try { localStorage.setItem(INSTALL_DISMISSED, '1'); } catch { /* */ } }, []);
  const install = useCallback(async () => {
    if (!evt) return;
    setHidden(true);
    try { await evt.prompt(); await evt.userChoice; } catch { /* the browser closed it */ }
    setEvt(null);
  }, [evt]);

  if (hidden || !evt) return null;
  return (
    <aside className="install-card" role="region" aria-label="Install Waypoint Ledger">
      <div className="ic-body">
        <p className="ic-h">Keep it on your phone</p>
        <p className="micro">Install Waypoint Ledger and it opens like an app and prices a journey with no signal. Your ledger stays on the device.</p>
      </div>
      <div className="ic-actions">
        <button className="btn primary small" type="button" onClick={install}>Install</button>
        <button className="btn ghost small" type="button" onClick={dismiss}>Not now</button>
      </div>
    </aside>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <a className="skip" href="#main">Skip to content</a>
      <Header />
      <main id="main" tabIndex={-1}>{children}</main>
      <Footer />
      <InstallPrompt />
      <Toasts />
    </StoreProvider>
  );
}

/* Chromium's install event; not in lib.dom yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

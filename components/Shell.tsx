'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { StoreProvider, useStore } from '@/lib/store';
import { Icon } from './Icons';
import Toasts from './Toasts';
import { AccountLink } from './Account';

const NAV = [
  { href: '/journey', label: 'Price a journey' },
  { href: '/ledger', label: 'My ledger' },
  { href: '/sheet', label: 'Appointment sheet' },
  { href: '/survey', label: 'Rank the burdens' },
  { href: '/register', label: 'The register' },
  { href: '/method', label: 'How it is made' },
];

function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const { entries } = useStore();
  useEffect(() => { setOpen(false); }, [path]);
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
          <AccountLink />
        </nav>
        <div className="bar-right">
          <Link href={entries.length ? '/ledger' : '/journey'} className="btn primary small hide-sm">{entries.length ? 'Open my ledger' : 'Start'}</Link>
          <button className="menu-btn" type="button" aria-expanded={open} aria-controls="topnav" aria-label={open ? 'Close the menu' : 'Open the menu'} onClick={() => setOpen((o) => !o)}><Icon.Menu /></button>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-foot">
      <div className="wrap foot-grid">
        <div>
          <div className="brand"><Icon.Logo size={24} /><span className="name">Waypoint Ledger</span></div>
          <p className="micro">Prices one person&rsquo;s diagnostic journey from published U.S. federal figures and cites every one. Never invents a number.</p>
        </div>
        <nav aria-label="Product">
          <p className="foot-h">Product</p>
          <Link href="/journey">Price a journey</Link>
          <Link href="/ledger">My ledger</Link>
          <Link href="/sheet">Appointment sheet</Link>
          <Link href="/survey">Rank the burdens</Link>
          <Link href="/interview">Written interview</Link>
          <Link href="/register">The register</Link>
          <Link href="/account">Save across devices</Link>
        </nav>
        <nav aria-label="Trust and open data">
          <p className="foot-h">Trust</p>
          <Link href="/method">How it is made</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/developers">Developers: the API</Link>
          <Link href="/adopt">Run this yourself</Link>
          <Link href="/integrity">The integrity record</Link>
          <a href="/api/corrections" target="_blank" rel="noopener noreferrer">Open data: corrections</a>
          <a href="/api/gap" target="_blank" rel="noopener noreferrer">Open data: the gap</a>
          <a href="/api/survey" target="_blank" rel="noopener noreferrer">Open data: burden rankings</a>
          <a href="/data/dictionary.csv">Data dictionary</a>
        </nav>
        <div>
          <p className="foot-h">Precision Federal</p>
          <p className="micro">Ames, Iowa · <a href="mailto:bo@precisionfederal.com">bo@precisionfederal.com</a></p>
          <p className="micro">Built in the TOPx HHS Tech Sprint for AI and Invisible Illness, Cost of Illness track.</p>
          <p className="micro">Open source, Apache 2.0: <a href="https://github.com/precisionfederal/waypoint-ledger" rel="noopener">github.com/precisionfederal/waypoint-ledger</a></p>
        </div>
      </div>
      <div className="wrap foot-legal">
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

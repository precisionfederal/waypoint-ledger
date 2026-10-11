'use client';
import Link from '@/components/IntentLink';
import FinePrint from '@/components/FinePrint';
import ThemeToggle from '@/components/ThemeToggle';
import { usePathname } from 'next/navigation';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { StoreProvider, useStore } from '@/lib/store';
import { Icon } from './Icons';
import Toasts from './Toasts';
import fs from './ShellFoot.module.css';

/* ==========================================================================
   The frame.

   The header used to carry eight destinations plus a pill. Nobody holds eight,
   and a person who arrived with one question ("what did this cost me?") had to
   read a menu before they could ask it. The bar is now FIVE links and one
   button; everything else moved into the footer under three headings that say
   who each group is for, and the phone menu shows those same three headings
   under the four links. Nothing was deleted — every destination that was in
   the header is still one tap away, and every one of them is in the footer of
   every page.
   ========================================================================== */

/* adopter-20: "Price my journey" stood twice in the bar, as a link and as the
   button, both to /journey; the button keeps it. judge-6: /conditions (the
   Scalability answer) had no door from any page but a fold on /method. */
/* JUDGE-7 #7e (FINAL-1011): the policy brief is what an agency reviewer came
   for, and it sat in the phone menu's third group or 4,500 px down the footer.
   It is in the bar now, and first in the phone menu's own list. */
const NAV = [
  { href: '/ledger', label: 'My ledger' },
  { href: '/register', label: 'The register' },
  { href: '/policy', label: 'For agencies' },
  { href: '/method', label: 'How it is made' },
  { href: '/conditions', label: 'Conditions' },
];

/* footerOnly: in the footer and not (yet) in the phone menu, whose links are frozen
   until the demo is over (FLOW judge-6). format: what an open-data link opens, said
   in the footer so a click on it is not a surprise wall of JSON (FLOW judge-16). */
type MoreLink = { href: string; label: string; external?: boolean; footerOnly?: boolean; format?: 'JSON' | 'CSV' };
type MoreGroup = { head: string; links: MoreLink[] };

/* One list, rendered twice: the footer columns and the phone menu. Two copies
   of this list is how a footer and a menu start disagreeing about what exists. */
const MORE: MoreGroup[] = [
  {
    head: 'For you',
    links: [
      { href: '/journey', label: 'Price a journey step by step' },
      { href: '/sheet', label: 'Appointment sheet' },
      { href: '/survey', label: 'Rank the burdens' },
      { href: '/interview', label: 'Written interview' },
      { href: '/account', label: 'Save across devices' },
    ],
  },
  {
    head: 'For agencies and developers',
    links: [
      { href: '/policy', label: 'Policy brief for agencies', footerOnly: true },
      { href: '/conditions', label: 'Conditions and their codes', footerOnly: true },
      { href: '/developers', label: 'Developers: the API' },
      { href: '/adopt', label: 'Run this yourself' },
      { href: '/api/corrections', label: 'Open data: corrections', external: true, format: 'JSON' },
      { href: '/api/gap', label: 'Open data: the gap', external: true, format: 'JSON' },
      { href: '/api/survey', label: 'Open data: burden rankings', external: true, format: 'JSON' },
      { href: '/data/dictionary.csv', label: 'Data dictionary', external: true, format: 'CSV' },
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

function MoreLinks({ links, footer = false }: { links: MoreLink[]; footer?: boolean }) {
  return (
    <>
      {links.filter((l) => footer || !l.footerOnly).map((l) => {
        const text = footer && l.format ? `${l.label} (${l.format})` : l.label;
        return l.external
          ? <a key={l.href} href={l.href} target={l.href.startsWith('/api') ? '_blank' : undefined} rel="noopener noreferrer">{text}</a>
          : <Link key={l.href} href={l.href}>{text}</Link>;
      })}
    </>
  );
}

/* ---- the account link: "Sign in" until this browser is signed in, then the name ----
   It lives here, not in Account.tsx, because the header is on every page and
   Account.tsx carries the whole sign-in flow (the passkey library, the saved-
   ledger dashboard and the price table it labels them with). Importing it into
   the frame would put all of that in the first load of every page to draw one
   link. So this reads the same two things auth-client does and nothing else:
   the local "signed in here before" hint (key HINT in lib/auth-client.ts, kept
   equal by tests/shell-r2.test.ts) and GET /api/me, and only when the hint is
   set, so an anonymous visitor makes no request at all.
   Account.tsx announces every change of user with the AUTH_EVENT, so signing
   in or out on /account renames this link without a reload. */
export const AUTH_EVENT = 'wl:auth';
const SIGNED_IN_HINT = 'wl_signed_in';
type AuthDetail = { displayName: string | null } | null;

function readHint(): boolean {
  try { return localStorage.getItem(SIGNED_IN_HINT) === '1'; } catch { return false; }
}

export function AccountLink() {
  const path = usePathname();
  const [who, setWho] = useState<AuthDetail | undefined>(undefined);   // undefined: not known yet
  useEffect(() => {
    let live = true;
    const check = () => {
      if (!readHint()) { setWho(null); return; }
      setWho((w) => w ?? { displayName: null });                     // "Your account" while we ask
      fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
        .then((r) => r.json())
        .then((b: { ok?: boolean; user?: { displayName?: string | null } | null }) => {
          if (!live || b?.ok !== true) return;
          const u = b.user ? { displayName: b.user.displayName ?? null } : null;
          try { if (u) localStorage.setItem(SIGNED_IN_HINT, '1'); else localStorage.removeItem(SIGNED_IN_HINT); } catch { /* private mode */ }
          setWho(u);
        })
        .catch(() => { /* offline: keep what we showed */ });
    };
    check();
    const onAuth = (e: Event) => { const d = (e as CustomEvent<AuthDetail>).detail; setWho(d ? { displayName: d.displayName ?? null } : null); };
    const onStorage = (e: StorageEvent) => { if (e.key === SIGNED_IN_HINT) check(); };
    window.addEventListener(AUTH_EVENT, onAuth);
    window.addEventListener('storage', onStorage);
    return () => { live = false; window.removeEventListener(AUTH_EVENT, onAuth); window.removeEventListener('storage', onStorage); };
  }, []);
  const signedIn = Boolean(who);
  const name = who?.displayName?.trim() || '';
  const label = signedIn ? (name || 'Your account') : 'Sign in';
  return (
    <Link href="/account" className={`nav-signin${signedIn ? ' is-in' : ''}`} data-testid="nav-account"
      aria-current={path === '/account' || path.startsWith('/account/') ? 'page' : undefined}
      aria-label={signedIn ? `Your account${name ? `, signed in as ${name}` : ', signed in'}` : undefined}>
      {signedIn && <span className="nav-dot" aria-hidden="true" />}
      <span className="nav-signin-t">{label}</span>
    </Link>
  );
}

/* A button that points at the page you are standing on is a dead control, and
   the header used to offer "Open my ledger" while you were on /ledger. So the
   one CTA always points somewhere you are not. */
function ctaFor(path: string, count: number): { href: string; label: string } | null {
  if (count > 0) return path === '/ledger' ? { href: '/journey', label: 'Add more care' } : { href: '/ledger', label: 'Open my ledger' };
  /* patient-13: on home the box IS the way in; a dark "Price my journey" button
     beside it led to a second box on a second page. */
  return path === '/journey' || path === '/' ? null : { href: '/journey', label: 'Price my journey' };
}

function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const { entries } = useStore();
  const navRef = useRef<HTMLElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [path]);
  /* MERGE (rehearsal): FLOW adopter-4 (waypoint-flow: focus the first link on
     open, Escape hands focus back to the menu button) and access2-10
     (waypoint-flow-core: the page behind the open menu is inert, so Tab stays
     in the header). Both kept. */
  useEffect(() => {
    const behind = [document.getElementById('main'), document.querySelector('footer.site-foot')].filter(Boolean) as HTMLElement[];
    behind.forEach((el) => { if (open) el.setAttribute('inert', ''); else el.removeAttribute('inert'); });
    if (!open) return;
    navRef.current?.querySelector<HTMLElement>('a[href]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      btnRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); behind.forEach((el) => el.removeAttribute('inert')); };
  }, [open]);
  const cta = ctaFor(path, entries.length);
  return (
    <header className="site">
      <div className="wrap bar">
        <Link href="/" className="brand" aria-label="Waypoint Ledger home">
          <Icon.Logo />
          <span className="name">Waypoint Ledger</span>
        </Link>
        <nav id="topnav" ref={navRef} className={`topnav ${open ? 'open' : ''}`} aria-label="Site">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href || path.startsWith(`${n.href}/`) ? 'page' : undefined}>
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
          {/* Sign in is optional and says so on /account; it sits in the bar so a
              person who wants the ledger on a second device finds it in one look,
              and it turns into their name once this browser is signed in. */}
          <AccountLink />
          {cta && <Link href={cta.href} className="btn primary small nav-cta">{cta.label}</Link>}
          <button ref={btnRef} className="menu-btn" type="button" aria-expanded={open} aria-controls="topnav" aria-label={open ? 'Close the menu' : 'Open the menu'} onClick={() => setOpen((o) => !o)}><Icon.Menu /></button>
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
        <p className="micro">Adds up what a search for a diagnosis cost, from published U.S. federal figures, and shows where every number came from. Where a figure is somebody&rsquo;s analysis of a federal survey, it says so. Never invents a number.</p>
      </div>
      <div className="wrap foot-grid">
        {MORE.map((g) => (
          <nav key={g.head} aria-label={g.head}>
            <p className="foot-h">{g.head}</p>
            <MoreLinks links={g.links} footer />
          </nav>
        ))}
      </div>
      <div className="wrap foot-legal">
        <p className={`micro ${fs.legal}`}>Built by Precision Federal &middot; <a className={fs.hit} href="https://precisionfederal.com/contact">Contact</a> &middot; open source, Apache 2.0: <a className={fs.hit} href="https://github.com/precisionfederal/waypoint-ledger" rel="noopener">github.com/precisionfederal/waypoint-ledger</a></p>
        {/* JUDGE-3 #13: the safety line is printed, never behind the (i) */}
        <p className="micro">Not a diagnostic device. Not medical, legal or financial advice.</p>
        <ThemeToggle />
        <FinePrint label="The fine print">
        <p>Built in the TOPx HHS Tech Sprint for AI and Invisible Illness, Cost of Illness track.</p>
        <p>Your journey stays in your browser. A correction you choose to send contains no personal information.</p>
        </FinePrint>
      </div>
    </footer>
  );
}

const INSTALL_DISMISSED = 'waypoint-ledger.install-dismissed';

/* The browser only fires beforeinstallprompt where installing is actually
   possible, so this card never appears anywhere it would be a dead end.

   🔴 A PHONE CARD, ON A PHONE, NEVER OVER THE HERO OR THE LEDGER (R3 c1 C5).
   Desktop Chrome fires the event too, so "Keep it on your phone" stood over the
   home hero and the first ledger line on a laptop, and on the projector. It is
   now shown only on a coarse pointer at a phone width, and never on the home
   page or the ledger, whose first screen is the product. The event is still
   caught on every page, so the card can appear on the next page a phone opens. */
const PHONE_QUERY = '(pointer: coarse) and (max-width: 600px)';
const NO_CARD_ON = new Set(['/', '/ledger']);
function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);
  const [phone, setPhone] = useState(false);
  const path = usePathname() ?? '/';

  useEffect(() => {
    let mq: MediaQueryList | null = null;
    try { mq = window.matchMedia(PHONE_QUERY); } catch { return; }
    const on = () => setPhone(Boolean(mq?.matches));
    on();
    mq.addEventListener?.('change', on);
    return () => mq?.removeEventListener?.('change', on);
  }, []);

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

  if (hidden || !evt || !phone || NO_CARD_ON.has(path.replace(/\/+$/, '') || '/')) return null;
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

/* access2-11: after a client-side page change (never on the first load), focus
   moves to the main region so a screen reader starts at the new page instead of
   on the link that was just used. preventScroll leaves the scroll where Next put it. */
function RouteFocus() {
  const path = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const main = document.getElementById('main');
    if (main && !main.contains(document.activeElement)) main.focus({ preventScroll: true });
  }, [path]);
  return null;
}

/* POLISH judge2-4: a heading that takes focus on arrival (the ledger's h1 after
   "See it done with an example") wore a thick ring for a mouse user, because
   Chromium treats script focus on a freshly loaded page as :focus-visible.
   The ring on those headings now follows the last way the person moved:
   Tab (or Enter, Space, an arrow key outside a text box) marks the page
   keyboard-driven, a pointer press clears it, and the mark survives the full
   page load the example button makes. core.css scopes the ring to it. */
const KBD_KEY = 'wl-kbd';
function KeyboardModality() {
  useEffect(() => {
    const root = document.documentElement;
    try { if (sessionStorage.getItem(KBD_KEY) === '1') root.setAttribute('data-kbd', ''); } catch { /* private window */ }
    const mark = (on: boolean) => {
      if (on === root.hasAttribute('data-kbd')) return;
      if (on) root.setAttribute('data-kbd', ''); else root.removeAttribute('data-kbd');
      try { if (on) sessionStorage.setItem(KBD_KEY, '1'); else sessionStorage.removeItem(KBD_KEY); } catch { /* private window */ }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Tab') { mark(true); return; }
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (!typing && /^(Enter| |ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) mark(true);
    };
    const onPointer = () => mark(false);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onPointer, true); };
  }, []);
  return null;
}

/* Every Link is cold (components/IntentLink.tsx). A route is warmed once, when a
   person presses or touches a link to it: the payload and its CSS start on the
   press, a beat before the click that uses them, and never for a link that only
   scrolled past or sat under a resting pointer (hover warmed /conditions on
   /method when the new page drew that link under the cursor, and Chromium
   warned about its unused stylesheet). Pages only: an /api/ link or a file (a dot in the
   last segment) is not a route. The router context, not useRouter(): it is
   null in a server render, where useRouter() throws. */
function IntentPrefetch() {
  const router = useContext(AppRouterContext);
  useEffect(() => {
    if (!router) return;
    const done = new Set<string>();
    const warm = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="/"]') as HTMLAnchorElement | null;
      const h = a?.getAttribute('href')?.split('#')[0];
      if (!a || !h || a.target || a.hasAttribute('download') || h.startsWith('//') || h.startsWith('/api/') || /\.[a-z0-9]+$/i.test(h) || done.has(h)) return;
      done.add(h);
      try { router.prefetch(h); } catch { /* only ever a head start */ }
    };
    const o = { capture: true, passive: true };
    for (const t of ['pointerdown', 'touchstart']) document.addEventListener(t, warm, o);
    return () => { for (const t of ['pointerdown', 'touchstart']) document.removeEventListener(t, warm, o); };
  }, [router]);
  return null;
}

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <a className="skip" href="#main">Skip to content</a>
      <Header />
      <RouteFocus />
      <KeyboardModality />
      <IntentPrefetch />
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

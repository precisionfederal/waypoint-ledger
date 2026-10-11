'use client';
/* The dark theme, opt in (FLOW access-11). Light stays the default for everyone
   (Bo, 2026-09-09); a person who finds a white screen hard (light sensitivity,
   migraine, low vision) turns this on once and the site remembers it in this
   browser. app/layout.tsx reads the same key before the first paint, so a dark
   page never flashes white on the next visit.

   One toggle button: its name stays "Dark theme" and aria-pressed says whether it
   is on, which is how a screen reader announces a switch that keeps its name. */
import { useEffect, useState } from 'react';
import css from './ThemeToggle.module.css';

const KEY = 'wl-theme';
type Theme = 'light' | 'dark';

function apply(t: Theme) {
  const d = document.documentElement;
  d.setAttribute('data-theme', t);
  d.style.colorScheme = t;
}

export default function ThemeToggle() {
  /* The server renders light; the real state is read after mount. The switch sits
     in the footer, far below the first screen, so nobody sees it settle. */
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.getAttribute('data-theme') === 'dark');
    /* Another tab flipped it: follow, so two open tabs never disagree. */
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      const t: Theme = e.newValue === 'dark' ? 'dark' : 'light';
      apply(t);
      setDark(t === 'dark');
    };
    addEventListener('storage', onStorage);
    return () => removeEventListener('storage', onStorage);
  }, []);

  function toggle() {
    const t: Theme = dark ? 'light' : 'dark';
    apply(t);
    setDark(t === 'dark');
    try { localStorage.setItem(KEY, t); } catch { /* storage blocked: the choice lasts for this page only */ }
  }

  return (
    <button type="button" className={css.toggle} aria-pressed={dark} onClick={toggle}>
      <svg className={css.icon} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {dark ? (
          <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" fill="currentColor" />
        ) : (
          <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
          </g>
        )}
      </svg>
      <span className={css.label}>Dark theme</span>
      <span className={css.track} aria-hidden="true"><span className={css.knob} /></span>
    </button>
  );
}

'use client';

/* /method's only browser code, kept small on purpose (the route has a 2.8 KB
   budget). It does three things and renders nothing:
   1. A link or a hash that points inside a closed fold opens the fold first.
   2. Anything marked data-motion is armed, then drawn once when it scrolls
      into view (the price path, the meters). With reduced motion nothing is
      armed, so the page shows the final state at once. Without this script
      the page also shows the final state: arming is the script's job.
   3. The contents rail marks the section being read (aria-current). */

import { useEffect } from 'react';

export default function MethodMotion() {
  useEffect(() => {
    const root = document.querySelector('.mx');
    if (!root) return;
    const openTo = (el: Element | null) => {
      for (let n = el; n; n = n.parentElement) if (n instanceof HTMLDetailsElement) n.open = true;
    };
    const fromHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (el) { openTo(el); el.scrollIntoView({ block: 'start' }); }
    };
    fromHash();
    addEventListener('hashchange', fromHash);

    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.setAttribute('data-in', ''); io.unobserve(e.target); }
    }), { threshold: 0.2 });
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.querySelectorAll('[data-motion]').forEach((el) => { el.setAttribute('data-armed', ''); io.observe(el); });
    }

    const links = [...root.querySelectorAll<HTMLAnchorElement>('.mx-rail a')];
    const spy = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      const id = e.target.querySelector('h2')?.id;
      links.forEach((a) => (a.hash === `#${id}` ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
    }), { rootMargin: '-15% 0px -75% 0px' });
    root.querySelectorAll('[data-spy]').forEach((s) => spy.observe(s));

    return () => { removeEventListener('hashchange', fromHash); io.disconnect(); spy.disconnect(); };
  }, []);
  return null;
}

'use client';

/* /privacy motion, once and only with purpose: a block below the first screen
   rises into place the first time it is scrolled to, and a figure marked
   data-count climbs to its real value (the value is already in the page; this
   only replays the climb). Nothing moves under prefers-reduced-motion or
   without IntersectionObserver: the page is then exactly what the server sent.
   No layout changes (transform and opacity only), so CLS stays 0. */

import { useEffect } from 'react';

function rise(el: HTMLElement) {
  const to = Number(el.dataset.count);
  if (!Number.isFinite(to) || to <= 0) return;
  const t0 = performance.now();
  const dur = 600;
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  el.textContent = '0';
  requestAnimationFrame(step);
}

export default function PrivacyMotion() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        io.unobserve(el);
        el.dataset.pv = 'in';
        el.querySelectorAll<HTMLElement>('[data-count]').forEach(rise);
      }
    }, { threshold: 0.12 });
    const below = innerHeight * 0.92;
    document.querySelectorAll<HTMLElement>('[data-pv]').forEach((el) => {
      if (el.getBoundingClientRect().top > below) { el.dataset.pv = 'wait'; io.observe(el); }
    });
    return () => io.disconnect();
  }, []);
  return null;
}

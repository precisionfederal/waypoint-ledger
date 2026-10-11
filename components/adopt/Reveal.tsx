'use client';

/* Reveal on scroll, once (VISUAL-4b, 2026-09-30). Only what starts below the
   fold waits; what a person already sees is never hidden. A transform and an
   opacity, so nothing moves the layout (CLS 0). Off under reduced motion, and
   without JavaScript everything is simply there. */

import { useEffect } from 'react';

export default function Reveal() {
  useEffect(() => {
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { (e.target as HTMLElement).dataset.reveal = 'in'; io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll<HTMLElement>('[data-reveal=""]').forEach((el) => {
      if (el.getBoundingClientRect().top < innerHeight) return;
      el.dataset.reveal = 'wait';
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);
  return null;
}

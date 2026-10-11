'use client';
/* ==========================================================================
   MOTION FOR THE DATA PAGES (VISUAL data, 2026-09-30 night).

   Two pieces, both honest about the number they carry:
   - useReveal: marks an element "wait" before it is painted, then "in" the first
     time it is seen, so a bar can grow or a path can draw once. With no script,
     with reduced motion, or with no IntersectionObserver, nothing is marked and
     the final state is what shows.
   - CountUp: a count that rises to its real value once, when it is first seen.
     It starts from the value itself (so the server and a no-script reader see
     the true number), and its width is reserved, so nothing beside it moves.
   ========================================================================== */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** data-reveal="wait" → "in" once the element is first seen → "done" after its entrance. */
export function useReveal<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  useIso(() => {
    const el = ref.current;
    if (!el || reducedMotion() || typeof IntersectionObserver === 'undefined') return;
    el.dataset.reveal = 'wait';
    let raf = 0, done = 0;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      /* two frames: the "wait" state is painted once before the transition starts */
      raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => {
        el.dataset.reveal = 'in';
        /* once the entrance has played, staggered delays stop applying to later changes */
        done = window.setTimeout(() => { el.dataset.reveal = 'done'; }, 1600);
      }); });
    }, { threshold });
    io.observe(el);
    /* paper shows the final state */
    const print = () => { el.dataset.reveal = 'done'; };
    window.addEventListener('beforeprint', print);
    /* a full-page capture never scrolls, so the observer may never fire: whatever
       has not been seen after 1.2 s takes its final state anyway (judges and the
       filing take full-page shots) */
    const fallback = window.setTimeout(() => { if (el.dataset.reveal === 'wait') { io.disconnect(); el.dataset.reveal = 'done'; } }, 1200);
    return () => { io.disconnect(); cancelAnimationFrame(raf); window.clearTimeout(done); window.clearTimeout(fallback); window.removeEventListener('beforeprint', print); };
  }, []);
  return ref;
}

/** A whole number that rises to its value once, when first seen. */
export function CountUp({ value, duration = 700, className }: { value: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  useIso(() => {
    const el = ref.current;
    if (!el || value <= 0 || reducedMotion() || typeof IntersectionObserver === 'undefined') { setShown(value); return; }
    let raf = 0;
    setShown(0);
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      let start = 0;
      const tick = (t: number) => {
        if (!start) start = t;
        const p = Math.min(1, (t - start) / duration);
        setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.1 });
    io.observe(el);
    const t = window.setTimeout(() => { io.disconnect(); cancelAnimationFrame(raf); setShown(value); }, duration + 2500);
    return () => { io.disconnect(); cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, [value, duration]);
  const text = value.toLocaleString('en-US');
  return (
    <span ref={ref} className={className}
      style={{ display: 'inline-block', minWidth: `${text.length}ch`, fontVariantNumeric: 'tabular-nums' }}>
      {shown.toLocaleString('en-US')}
    </span>
  );
}

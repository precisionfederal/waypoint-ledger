'use client';
/* The mount for the live half of /policy. The counts and their tables load as
   their own chunk (React.lazy, no extra runtime), so the route itself ships
   almost no JavaScript: everything else on the page is static HTML rendered at
   build time. */
import { lazy, Suspense, useEffect } from 'react';

const Survey = lazy(() => import('./PolicyLive').then((m) => ({ default: m.PolicySurvey })));
const Disputes = lazy(() => import('./PolicyLive').then((m) => ({ default: m.PolicyDisputes })));
const wait = <p className="micro" role="status">Reading the register&hellip;</p>;

export const PolicySurvey = () => <Suspense fallback={wait}><Survey /></Suspense>;
export const PolicyDisputes = () => <Suspense fallback={wait}><Disputes /></Suspense>;
export const PolicyPrint = () => <button type="button" className="btn primary no-print" onClick={() => window.print()}>Print or save as PDF</button>;

/** The brief folds on screen; on paper every fold is open. Ctrl+P and the
 *  button both fire beforeprint, and the folds close again after. */
export function PolicyPrintOpen() {
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = () => {
      const closed = [...document.querySelectorAll<HTMLDetailsElement>('[data-policy-brief] details:not([open])')];
      opened.push(...closed);
      closed.forEach((d) => { d.open = true; });
    };
    const after = () => { opened.forEach((d) => { d.open = false; }); opened = []; };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);
  return null;
}

/** JUDGE-2 #7: on a phone the condition cards swipe sideways, and a sideways row is as
 *  tall as its tallest card, which left about 450 px of empty band under the short ones.
 *  This sizes the row to the cards in view (the one snapped to and the one peeking in),
 *  so it grows for a tall card and shrinks back. Wide screens (a wrapping grid) and
 *  readers without script keep the plain layout. */
export function PolicyCardsFit() {
  useEffect(() => {
    const ul = document.querySelector<HTMLElement>('[data-policy-brief] .policy-cards');
    if (!ul) return;
    const mq = window.matchMedia('(max-width: 640px)');
    let raf = 0;
    const fit = () => {
      raf = 0;
      if (!mq.matches) { ul.style.height = ''; return; }
      const box = ul.getBoundingClientRect();
      let h = 0;
      for (const li of ul.children) {
        const r = (li as HTMLElement).getBoundingClientRect();
        if (r.right > box.left + 8 && r.left < box.right - 8) h = Math.max(h, (li as HTMLElement).offsetHeight);
      }
      const cs = getComputedStyle(ul);
      if (h) ul.style.height = `${Math.ceil(h + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom))}px`;
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(fit); };
    fit();
    ul.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    mq.addEventListener?.('change', on);
    return () => { ul.removeEventListener('scroll', on); window.removeEventListener('resize', on); mq.removeEventListener?.('change', on); if (raf) cancelAnimationFrame(raf); ul.style.height = ''; };
  }, []);
  return null;
}

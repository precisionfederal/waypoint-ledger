'use client';

/* ==========================================================================
   CONTRIB KIT (VISUAL, 2026-09-30 night): the small pieces that make giving an
   answer feel heard, shared by /survey and /interview.

   - useRise: a count that rises once to the real value (no value, no count).
   - useFlip: ranked cards glide into their new place instead of jumping.
   - Waypoints: the progress line drawn as the waypoints a question passes.
   - ThanksMoment: the thank-you, with the register's own count beside it.

   Every motion here is off under prefers-reduced-motion (the final state shows
   at once), and no number is ever drawn that did not come from /api/register.
   ========================================================================== */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from 'react';
import Link from '@/components/IntentLink';
import ThemedImg from './ThemedImg';

export function prefersStill(): boolean {
  try { return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** Rises from 0 to `target` once, ease-out; reduced motion shows `target` at once. */
export function useRise(target: number | null, ms = 900): number | null {
  const [v, setV] = useState<number | null>(null);
  useEffect(() => {
    if (target === null) return;
    if (prefersStill() || target <= 1) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/* FLIP for the ranking. snapshot() is called by the handler just before the
   state changes; after React lays the new order out, every element that carries
   the same data-flip key glides from where it was to where it is, even across
   lists (a burden tapped in the pool flies to its numbered place). Positions are
   kept relative to the box, so a scroll between taps never skews them. */
export function useFlip(box: RefObject<HTMLElement | null>, deps: unknown[]) {
  const before = useRef<Map<string, DOMRect> | null>(null);
  const snapshot = useCallback(() => {
    const el = box.current;
    if (!el || prefersStill()) { before.current = null; return; }
    const o = el.getBoundingClientRect();
    const m = new Map<string, DOMRect>();
    el.querySelectorAll<HTMLElement>('[data-flip]').forEach((n) => {
      const r = n.getBoundingClientRect();
      m.set(n.dataset.flip!, new DOMRect(r.left - o.left, r.top - o.top, r.width, r.height));
    });
    before.current = m;
  }, [box]);
  useLayoutEffect(() => {
    const el = box.current;
    const prev = before.current;
    before.current = null;
    if (!el || !prev) return;
    const o = el.getBoundingClientRect();
    el.querySelectorAll<HTMLElement>('[data-flip]').forEach((n) => {
      const was = prev.get(n.dataset.flip!);
      const r = n.getBoundingClientRect();
      if (!was) {
        n.animate?.([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
        return;
      }
      const dx = was.left - (r.left - o.left);
      const dy = was.top - (r.top - o.top);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      n.animate?.([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return snapshot;
}

/** The progress line as waypoints. Decorative: the words beside it and the
 *  progressbar's own value carry the meaning for a screen reader. */
export function Waypoints({ done }: { done: boolean[] }) {
  return (
    <span className="wp-track" aria-hidden="true">
      <span className="wp-line"><span style={{ width: `${done.length > 1 ? (Math.max(0, donePrefix(done) - 1) / (done.length - 1)) * 100 : 0}%` }} /></span>
      {done.map((d, i) => <span key={i} className={`wp-dot${d ? ' on' : ''}`} style={{ left: `${done.length > 1 ? (i / (done.length - 1)) * 100 : 50}%` }} />)}
    </span>
  );
}
/* The line is drawn only through the waypoints answered in a row from the
   start, so it never runs past a question still open. */
function donePrefix(done: boolean[]): number {
  const k = done.indexOf(false);
  return k === -1 ? done.length : k;
}

/** The ART lane's spots (public/img/v2, manifest winloop/BETA-2026-10-01/VISUAL-art.md).
 *  Each is set here once its file has landed and been checked; null draws no image. */
export type Art = { src: string; dark?: string; width: number; height: number; alt: string };
export const ART: Record<'survey' | 'interview' | 'account' | 'thanks', Art | null> = {
  /* heroes, opaque on the page ground (art commit 1bcf5bd8bd) */
  survey: { src: '/img/v2/survey-hero.webp', dark: '/img/v2/survey-hero-dark.webp', width: 1200, height: 525, alt: 'Five smooth stones laid along the path, from the heaviest in front to the lightest near the summit.' },
  interview: { src: '/img/v2/interview-hero.webp', dark: '/img/v2/interview-hero-dark.webp', width: 1200, height: 525, alt: 'An open notebook with blank pages lifting in the breeze at the start of the path.' },
  /* spots, transparent (art commit 5cd45b9ead) */
  account: { src: '/img/v2/account.webp', dark: '/img/v2/account-dark.webp', width: 480, height: 435, alt: 'A phone and a laptop on two hills, joined by a dotted path.' },
  thanks: { src: '/img/v2/thank-you.webp', dark: '/img/v2/thank-you-dark.webp', width: 480, height: 435, alt: 'A marker planted on a summit at sunrise.' },
};

/** A page's illustration, sized up front so nothing shifts when it loads; its
 *  alt text is the ART lane's own (VISUAL-art.md). */
export function Spot({ art, className, eager = false }: { art: Art | null; className?: string; eager?: boolean }) {
  if (!art) return null;
  if (art.dark) {
    /* the night rendition in the dark theme (ThemedImg: two tags, one hidden, same box) */
    return <ThemedImg light={art.src} dark={art.dark} width={art.width} height={art.height} alt={art.alt} className={className} loading={eager ? 'eager' : 'lazy'} />;
  }
  return <img className={className} src={art.src} width={art.width} height={art.height} alt={art.alt} decoding="async" loading={eager ? 'eager' : 'lazy'} />;
}

type RegisterCounts = { survey: number | null; interviews: number | null };

/** Reads the two counts from the public register once. Null until read, and
 *  null for good if it cannot be read: the moment then simply has no number. */
export function useRegisterCounts(enabled: boolean): RegisterCounts | null {
  const [c, setC] = useState<RegisterCounts | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetch('/api/register', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live || !j || !j.ok) return;
        const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null);
        setC({ survey: num(j.survey?.n), interviews: num(j.interviews?.n) });
      })
      .catch(() => { /* no number is better than a wrong one */ });
    return () => { live = false; };
  }, [enabled]);
  return c;
}

/** The thank-you as a moment: the art, the words, and the register's own count
 *  with this answer in it, rising once to its real value. */
export function ThanksMoment({ eyebrow, title, sub, count, countLabel, art, notice, children, headingRef }: {
  eyebrow: string; title: ReactNode; sub: ReactNode;
  /** flow3-9: the caller focuses the heading once the thank-you replaces the form, so
   *  focus does not fall to BODY; it is then a programmatic target (tabIndex -1). */
  headingRef?: Ref<HTMLHeadingElement>;
  /** Shown right under the words, before the count (the panel's completion code). */
  notice?: ReactNode;
  count: number | null; countLabel: (n: number) => string;
  art?: Art | null;
  children?: ReactNode;
}) {
  const shown = useRise(count);
  const digits = count === null ? 1 : String(count).length;
  return (
    <div className="ty">
      <div className="ty-head">
        <Spot art={art ?? null} className="ty-art" />
        <p className="eyebrow">{eyebrow}</p>
        <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>{title}</h1>
        <p className="sub">{sub}</p>
        {notice}
        {count !== null && (
          <div className="ty-count" data-testid="thanks-count">
            <span className="ty-n" aria-hidden="true" style={{ minWidth: `${digits}ch` }}>{shown ?? 0}</span>
            <span className="ty-lab" aria-hidden="true">{countLabel(count)}</span>
            <span className="sr-only">{count} {countLabel(count)}</span>
            <Link className="ty-link" href="/register/live">On the live register</Link>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/** The research panel's completion code, shown only when the server returned
 *  one (a paid-panel answer with the code configured: cf/functions/api/_panel.js).
 *  Nothing renders otherwise. */
export function PanelCode({ code }: { code: string | null }) {
  const [said, setSaid] = useState('');
  if (!code) return null;
  return (
    <div className="ty-panel" data-testid="panel-code">
      <p className="ty-panel-t">Your completion code for the research panel: <code className="ty-panel-code">{code}</code></p>
      <button type="button" className="btn ghost ty-panel-copy" onClick={async () => {
        try { await navigator.clipboard.writeText(code); setSaid('Copied the completion code.'); }
        catch { setSaid('Could not copy. Select the code and copy it by hand.'); }
      }}>Copy the code</button>
      <p className="ty-panel-said" aria-live="polite">{said}</p>
    </div>
  );
}

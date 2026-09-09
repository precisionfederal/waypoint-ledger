'use client';

/* ==========================================================================
   A REAL DIALOG.

   Round 2 measured the source drawer: Tab twice from inside it and focus was on
   the page footer; six of eight stops were outside the thing that was open; Esc
   left focus on "Save across devices". A person using a keyboard or a screen
   reader could not tell what was open, and could not get out of it.

   This is the native <dialog> element opened with showModal(), which is the one
   mechanism that gives all four guarantees from the platform rather than from
   our own code: the top layer, a real backdrop, Esc, and everything outside made
   inert. On top of it we add what the platform leaves to us — Tab that cycles
   (also correct in the fallback path), the first control focused on open, and
   the focus a person came from restored on close.

   IDENTITY: the element itself is stripped to nothing. The caller's own markup
   and classes render exactly as they did before, so the design does not change
   by being made accessible.
   ========================================================================== */

import { useCallback, useEffect, useRef } from 'react';

/** Everything a person can reach with Tab. Order is document order, which is the
 *  order the browser itself uses. */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface Focusable { offsetParent?: unknown; hasAttribute?: (n: string) => boolean; getAttribute?: (n: string) => string | null }

/** Visible, focusable descendants in document order. `aria-hidden` and
 *  `hidden` subtrees are not reachable, so they are not stops. */
export function focusableIn<T extends Focusable>(root: { querySelectorAll: (s: string) => ArrayLike<T> } | null): T[] {
  if (!root) return [];
  const all = Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR));
  return all.filter((el) => {
    if (el.hasAttribute && (el.hasAttribute('hidden') || el.getAttribute?.('aria-hidden') === 'true')) return false;
    return true;
  });
}

/** Where Tab should go from `active`, given the stops inside the dialog.
 *  Pure, so the rule is tested without a browser. Returns the index to focus,
 *  or null to let the browser do what it was going to do. */
export function nextStop(stops: unknown[], active: unknown, shift: boolean): number | null {
  if (stops.length === 0) return null;
  const i = stops.indexOf(active);
  if (i === -1) return shift ? stops.length - 1 : 0;   // focus escaped: bring it back inside
  if (!shift && i === stops.length - 1) return 0;      // last -> first
  if (shift && i === 0) return stops.length - 1;       // first -> last
  return null;                                          // in the middle: the browser is right
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Classes for the <dialog> itself. The caller's own overlay markup goes in children. */
  className?: string;
  /** id of the element that names this dialog (usually the heading). */
  labelledBy?: string;
  describedBy?: string;
  label?: string;
  /** Focus this when it opens. Without it, the first focusable control is focused. */
  initialFocus?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}

/* The UA stylesheet gives <dialog> a border, padding, a white background and a
   width. Every one of them is removed here so the caller's markup is what is
   seen — this component changes behaviour, never appearance. */
const RESET: React.CSSProperties = {
  padding: 0, border: 0, background: 'transparent', margin: 0,
  maxWidth: '100vw', maxHeight: '100vh', width: '100vw', height: '100dvh',
  overflow: 'hidden', color: 'inherit',
};

export default function Dialog({ open, onClose, className, labelledBy, describedBy, label, initialFocus, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      returnTo.current = (document.activeElement as HTMLElement) || null;
      if (typeof el.showModal === 'function') { if (!el.open) el.showModal(); }
      else el.setAttribute('open', '');
      const target = initialFocus?.current ?? focusableIn<HTMLElement>(el)[0] ?? el;
      /* After the browser's own open-focus, so ours is the one that lands. */
      const t = window.setTimeout(() => { try { target.focus(); } catch { /* a detached node is not an error */ } }, 0);
      return () => window.clearTimeout(t);
    }
    if (el.open) { if (typeof el.close === 'function') el.close(); else el.removeAttribute('open'); }
    const back = returnTo.current;
    if (back && typeof back.focus === 'function' && document.contains(back)) back.focus();
    return undefined;
  }, [open, initialFocus]);

  /* Esc: the platform fires `cancel` and would close the element behind React's
     back, leaving the caller's state saying it is still open. */
  const onCancel = useCallback((e: React.SyntheticEvent) => { e.preventDefault(); onClose(); }, [onClose]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const el = ref.current;
    const stops = focusableIn<HTMLElement>(el);
    const to = nextStop(stops, document.activeElement, e.shiftKey);
    if (to === null) return;
    e.preventDefault();
    stops[to]?.focus();
  }, [onClose]);

  /* A click on the ::backdrop is delivered to the dialog element itself. A click
     on the caller's own overlay is the caller's to handle. */
  const onClick = useCallback((e: React.MouseEvent) => { if (e.target === ref.current) onClose(); }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={className}
      style={RESET}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={onCancel}
      onKeyDown={onKeyDown}
      onClick={onClick}
    >
      {children}
    </dialog>
  );
}

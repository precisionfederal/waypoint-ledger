'use client';

/* One live region for the whole app. The region is in the DOM from first paint, so a
   screen reader announces what arrives in it; each toast is announced once (the region
   is polite and additions-only, and the toasts themselves carry no second role that
   would make it announce twice). Errors interrupt, everything else waits its turn.

   The region also carries the OUTBOX CHIP: a standing line, on every page, whenever a
   correction is still held on this device. It is derived from localStorage, not from
   React state, so it survives a reload, a new tab and a closed laptop — the moment the
   thumb was pressed with no signal is the moment the promise has to hold.

   TWO THINGS ROUND 3 MEASURED, AND WHAT CHANGED
   1. On an iPhone 14 with the network off, the SAME FACT appeared three times at once:
      the chip, a success toast, and a per-line label in the ledger. The chip is now the
      one voice: while anything is waiting, a transient success toast is not rendered.
      One fact, one sentence, one place.
   2. The fixed stack sat over the top of the ledger. Below 720px the region is now a
      sticky band under the header that PUSHES the page down instead of covering it, and
      it can never be wider than the viewport. Those rules live in this file, in a scoped
      style element, because app/globals.css belongs to another lane this round. */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useStore, type Toast, type ToastAction } from '@/lib/store';
import { Icon } from './Icons';
import { flush, pendingItems, snapshot, stuckItems, stuckLabel, stuckText, subscribe, waitingLabel } from '@/lib/outbox';

/* FLOW2 access2-2: A TOAST WITH AN ACTION WAITS FOR THE PERSON.
   lib/store.tsx drops every toast after a timer (10 s for one with an action).
   A keyboard or switch user could not reach Undo in that time (WCAG 2.2.1).
   The newest toast that carries an action is now HELD here until it is used,
   closed, or replaced by a newer one; focus moves to its action button when it
   appears, and Escape or Close puts focus back where the caller says. The
   extra fields ride on the same action object the store already keeps. */
export type HeldAction = ToastAction & {
  /** the action button's accessible name, e.g. "Undo: put Doctor's office visit back" */
  name?: string;
  /** where focus goes when the toast is closed without acting */
  onClose?: () => void;
  /** toasts of one group replace each other quietly (a second Remove folds
   *  into the first); a toast of another group replacing it calls onDrop */
  group?: string;
  /** called when the toast goes without being used or closed */
  onDrop?: () => void;
  /** patient2-2: the Undo is only offered while the ledger is as it left it */
  dropOnLedgerChange?: boolean;
};

/* access2-7: ONE SENTENCE, ONE LIVE REGION. Controls that change a number
   (the ledger's count steppers) say what changed through this region instead
   of each carrying its own. */
type Said = { n: number; text: string };
let said: Said = { n: 0, text: '' };
const sayers = new Set<() => void>();
let quiet: ReturnType<typeof setTimeout> | undefined;
export function announce(text: string): void {
  said = { n: said.n + 1, text };
  sayers.forEach((f) => f());
  /* spoken once, then taken out so it is never read again as page text */
  clearTimeout(quiet);
  quiet = setTimeout(() => { said = { n: said.n + 1, text: '' }; sayers.forEach((f) => f()); }, 6000);
}
const subscribeSaid = (f: () => void) => { sayers.add(f); return () => { sayers.delete(f); }; };

/** How many requests are still waiting on this device. Reads the storage itself:
 *  the snapshot is the raw serialized queue, so React re-renders exactly when the
 *  queue changes and never in a loop. */
export function useOutboxCount(): number {
  const raw = useSyncExternalStore(subscribe, snapshot, () => '');
  return useMemo(() => (raw ? pendingItems().length : 0), [raw]);
}

/** How many of those have run out of automatic tries. Same storage, same subscription. */
export function useStuckCount(): number {
  const raw = useSyncExternalStore(subscribe, snapshot, () => '');
  return useMemo(() => (raw ? stuckItems().length : 0), [raw]);
}

/* The chip's own layout. Scoped to .toasts so it cannot reach anything else, and
   written here rather than in globals.css so two lanes never edit one file. */
const CHIP_CSS = `
.toasts { max-width: 100%; }
.toasts .outbox-chip { max-width: 100%; overflow-wrap: anywhere; }
.toasts .outbox-chip .chip-acts { display: flex; gap: .75rem; flex-wrap: wrap; margin-top: .35rem; }
/* access2-2: the held Undo toast. The message wraps; Undo and Close stay
   together at the end, 44 px tall, and Close is a 44 px square. */
.toasts .toast-held { align-items: center; pointer-events: auto; }
.toasts .toast-held .toast-txt { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.toasts .toast-held .toast-acts { display: inline-flex; align-items: center; flex: 0 0 auto; margin: -.6rem -.6rem -.6rem 0; }
.toasts .toast-held .toast-close { display: inline-flex; align-items: center; justify-content: center; }
.toasts .toast-held .toast-close svg { width: 16px; height: 16px; }
.toasts .toast-held button:focus-visible { outline: 2px solid currentColor; outline-offset: -4px; border-radius: 6px; }
@media (max-width: 980px) {
  /* app/globals.css line 697 pins the stack to the TOP of the screen on the
     ledger. That is where Round 3 photographed it, 197px tall at z-index 60,
     covering the line heading and its reference-price sentence on an iPhone 14.
     Put it back where every other page already keeps it — above the mobile bar,
     out of the reading path. Doubled class for specificity over body:has(.ledger);
     the rule lives here because app/globals.css belongs to another lane. */
  body:has(.ledger) .toasts.toasts { top: auto; bottom: 5.5rem; }
  /* patient-16: when the bottom spot would cover the row just tapped, the toast
     goes to the top instead (set by the layout effect below, phones only). */
  .toasts.toasts[data-place="top"], body:has(.ledger) .toasts.toasts[data-place="top"] { top: calc(4.5rem + env(safe-area-inset-top)); bottom: auto; }
}
`;

function OutboxChip() {
  const n = useOutboxCount();
  const stuck = useStuckCount();
  const [trying, setTrying] = useState(false);
  const [copied, setCopied] = useState(false);

  const tryNow = useCallback(async () => {
    setTrying(true);
    /* The person asked, so this attempt includes the items automatic sending
       gave up on. That is the whole point of the button. */
    try { await flush(true); } finally { setTrying(false); }
  }, []);

  const copyOut = useCallback(async () => {
    const text = stuckText();
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch { setCopied(false); }
  }, []);

  if (n < 1) return null;

  const btn = { color: 'inherit', textDecoration: 'underline', fontSize: 'inherit' } as const;
  return (
    <div className={`toast ${stuck ? 'warn' : 'info'} outbox-chip`} style={{ pointerEvents: 'auto' }} data-outbox={n} data-stuck={stuck}>
      <span className="toast-ic" aria-hidden="true"><Icon.Info /></span>
      <span>
        {stuck > 0
          ? <>{stuckLabel(stuck)} Nothing is lost. Send it again, or copy it out and mail it to us.</>
          : <>{waitingLabel(n)}. Held on this device and sent again the next time you open this site, or now with Try now. Nothing is lost.</>}
        <span className="chip-acts">
          <button type="button" className="link-btn" style={btn} onClick={tryNow} disabled={trying}>
            {trying ? 'Trying…' : 'Try now'}
          </button>
          {stuck > 0 && (
            <button type="button" className="link-btn" style={btn} onClick={copyOut}>
              {copied ? 'Copied' : 'Copy it'}
            </button>
          )}
        </span>
      </span>
    </div>
  );
}

/* THE SENTENCE THE CHIP ALREADY SAYS.
   Pressing a thumb with no signal queues the correction, and lib/store.tsx
   answers with "Saved on this device. It will be sent the moment you are back
   online." — the chip's own fact, in the chip's own words, in a second box
   directly above the chip. Round 3 filtered `ok` toasts and stopped there;
   that toast is a `warn` (the request did not reach us), so it survived the
   filter and Round 4 photographed TWO boxes stating one fact, 227px tall, over
   the ledger, on an iPhone 14.

   Matched on meaning rather than on an exact string so a reworded sentence in
   another lane's file cannot quietly bring the second box back. The store is
   not edited from here: it is right to tell someone their correction is held,
   and it is right that the chip is the one that says it. */
const SAYS_THE_OUTBOX_FACT = /\bon this device\b/i;

/* access2-5: the 429 and 5xx sentences (lib/store.tsx queuedSentence) carry a
   REASON the chip does not ("Several answers on this figure came from your
   network this hour, so the count asked to wait."), then repeat the chip's own
   fact ("Yours is held on this device…"). The filter used to drop the whole
   toast, reason included. Now the sentences BEFORE the chip's fact are kept
   and the chip's fact and what follows it go; a toast that opens with the
   chip's fact ("Saved on this device. It will be sent…") goes entirely. */
export function beyondTheChip(text: string): string {
  const parts = text.replace(/([.!?])\s+/g, '$1\n').split('\n');
  const at = parts.findIndex((x) => SAYS_THE_OUTBOX_FACT.test(x));
  return (at < 0 ? parts : parts.slice(0, at)).join(' ').trim();
}
/* access2-6: a file landing is not about the outbox, so "Downloaded …" is said
   even while the chip is up; the chip and a download never state one fact. */
const SAYS_A_FILE_LANDED = /^Downloaded\b/;

/* access2-8 (WCAG 2.4.11): the stack is fixed at the bottom (the top under the
   header on a phone ledger), so at 200 % zoom or with the chip up it can sit
   over the next line's stepper. When focus lands on something a toast covers,
   the page scrolls just enough to show it. */
function unobscure(region: HTMLElement | null, el: Element | null) {
  if (!region || !(el instanceof HTMLElement) || el === document.body || region.contains(el)) return;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return;
  const hits = [...region.querySelectorAll<HTMLElement>(':scope > .toast')].map((t) => t.getBoundingClientRect())
    .filter((t) => !(r.right <= t.left || r.left >= t.right || r.bottom <= t.top || r.top >= t.bottom));
  if (!hits.length) return;
  const top = Math.min(...hits.map((t) => t.top)), bottom = Math.max(...hits.map((t) => t.bottom));
  const gap = 12;
  if (top > window.innerHeight / 2) window.scrollBy({ top: r.bottom - top + gap, behavior: 'instant' as ScrollBehavior });
  else window.scrollBy({ top: -(bottom - r.top + gap), behavior: 'instant' as ScrollBehavior });
}

export default function Toasts() {
  const { toasts, dismissToast, entries } = useStore();
  const waiting = useOutboxCount();
  const region = useRef<HTMLDivElement>(null);

  /* The held action toast (access2-2). */
  const [held, setHeld] = useState<Toast | null>(null);
  const seen = useRef(0);
  const actBtn = useRef<HTMLButtonElement>(null);
  const heldRef = useRef<{ t: Toast; entries: unknown } | null>(null);
  const extra = (t: Toast | null | undefined) => (t?.action ?? {}) as HeldAction;
  useEffect(() => {
    const newest = [...toasts].reverse().find((t) => t.action);
    if (newest && newest.id > seen.current) {
      seen.current = newest.id;
      const prev = heldRef.current?.t;
      if (prev && (extra(prev).group === undefined || extra(prev).group !== extra(newest).group)) extra(prev).onDrop?.();
      heldRef.current = { t: newest, entries };
      setHeld(newest);
    }
  }, [toasts, entries]);
  /* patient2-2: a Start over Undo goes as soon as the ledger changes after it */
  useEffect(() => {
    const h = heldRef.current;
    if (!h || !extra(h.t).dropOnLedgerChange || h.entries === entries) return;
    heldRef.current = null; setHeld(null); dismissToast(h.t.id); extra(h.t).onDrop?.();
  }, [entries, dismissToast]);
  useEffect(() => {
    if (!held) return;
    /* After the page has re-rendered without the pressed button. */
    const f = requestAnimationFrame(() => requestAnimationFrame(() => actBtn.current?.focus()));
    return () => cancelAnimationFrame(f);
  }, [held]);
  const act = (t: Toast) => { heldRef.current = null; setHeld(null); dismissToast(t.id); t.action!.run(); };
  const close = (t: Toast) => { heldRef.current = null; setHeld(null); dismissToast(t.id); extra(t).onClose?.(); };

  /* access2-7: the latest sentence from announce(), as an addition to this region. */
  const line = useSyncExternalStore(subscribeSaid, () => said, () => said);

  /* One voice. While the chip is up it is the standing statement about whether
     anything reached us; a cheerful "Saved" beside it is the contradiction Round 3
     photographed, and a "held on this device" beside it is the one Round 4 did.
     Warnings that carry a DIFFERENT fact still come through — and at most one of
     them, because two boxes over a phone ledger is the failure, whatever they say. */
  /* MERGE (rehearsal): patient-16 (waypoint-flow, one toast at a time, placed
     clear of the tapped row on a phone) and access2-2/5/6 (waypoint-flow-core,
     the held Undo toast, the chip-reason filter, downloads while the chip is up).
     Timed toasts are one at a time; the held Undo toast is apart from them, so
     a later toast never replaces it (patient2-3). */
  const plain = toasts.filter((t) => !t.action);
  const shown = (waiting > 0
    ? plain
      .map((t) => (SAYS_THE_OUTBOX_FACT.test(t.text) ? { ...t, text: beyondTheChip(t.text) } : t))
      .filter((t) => t.text && (t.kind !== 'ok' || SAYS_A_FILE_LANDED.test(t.text)))
    : plain).slice(-1);
  const urgent = shown.some((t) => t.kind === 'warn');

  /* patient-16: on a phone the stack sits above the bottom bar. If that spot
     covers the row (or, for a tall row, the band around the tap) just tapped,
     it moves to the top; if the top would cover it too, it stays where it
     was. Desktop never changes. */
  const lastTap = useRef<{ el: Element; y: number } | null>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      lastTap.current = t ? { el: t.closest('tr') ?? t.closest('button, a, label, input') ?? t, y: e.clientY } : null;
    };
    document.addEventListener('pointerdown', onDown, { capture: true, passive: true });
    return () => document.removeEventListener('pointerdown', onDown, { capture: true });
  }, []);
  const shownKey = [...shown.map((t) => t.id), held ? `h${held.id}` : ''].filter(Boolean).join(',');
  useLayoutEffect(() => {
    const el = region.current;
    if (!el) return;
    el.removeAttribute('data-place');
    const tap = lastTap.current;
    if (!shownKey || !tap?.el.isConnected || !window.matchMedia?.('(max-width:980px)').matches) return;
    /* A phone ledger row is a card that can be taller than half the screen;
       then the part to keep clear is the band around the finger. */
    const box = tap.el.getBoundingClientRect();
    const row = box.height <= window.innerHeight * 0.4 ? { top: box.top, bottom: box.bottom } : { top: tap.y - 56, bottom: tap.y + 56 };
    const covers = () => { const r = el.getBoundingClientRect(); return r.height > 0 && r.top < row.bottom && r.bottom > row.top; };
    if (!covers()) return;
    el.setAttribute('data-place', 'top');
    if (covers()) el.removeAttribute('data-place');
  }, [shownKey]);

  useEffect(() => {
    const onFocus = (e: FocusEvent) => requestAnimationFrame(() => unobscure(region.current, e.target as Element));
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, []);
  /* a toast that arrives over the focused control moves the page too */
  useEffect(() => { requestAnimationFrame(() => unobscure(region.current, document.activeElement)); }, [shown.length, held, waiting]);

  const actStyle = { pointerEvents: 'auto', color: 'inherit', textDecoration: 'underline', fontWeight: 600, minHeight: 44, padding: '0 .5rem' } as const;
  return (
    <>
      <style>{CHIP_CSS}</style>
      <div
        ref={region}
        className="toasts"
        role="status"
        aria-live={urgent ? 'assertive' : 'polite'}
        aria-atomic="false"
        aria-relevant="additions text"
        aria-label="Notifications"
      >
        <OutboxChip />
        {shown.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="toast-ic" aria-hidden="true">{t.kind === 'ok' ? <Icon.Check /> : <Icon.Info />}</span>
            <span className="sr-only">{t.kind === 'warn' ? 'Warning: ' : t.kind === 'ok' ? 'Done: ' : ''}</span>
            <span>{t.text}</span>
          </div>
        ))}
        {held && (
          <div key={held.id} className={`toast ${held.kind} toast-held`}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); close(held); } }}>
            <span className="toast-ic" aria-hidden="true"><Icon.Info /></span>
            <span className="toast-txt">{held.text}</span>
            <span className="toast-acts">
              <button ref={actBtn} type="button" className="link-btn toast-act" style={actStyle}
                aria-label={(held.action as HeldAction).name || held.action!.label}
                onClick={() => act(held)}>{held.action!.label}</button>
              <button type="button" className="link-btn toast-close" style={{ ...actStyle, textDecoration: 'none', minWidth: 44 }}
                aria-label="Close this message" title="Close" onClick={() => close(held)}><Icon.X /></button>
            </span>
          </div>
        )}
        {line.text && <p key={line.n} className="sr-only">{line.text}</p>}
      </div>
    </>
  );
}

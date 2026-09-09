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

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { useStore } from '@/lib/store';
import { Icon } from './Icons';
import { flush, pendingItems, snapshot, stuckItems, stuckLabel, stuckText, subscribe, waitingLabel } from '@/lib/outbox';

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
@media (max-width: 980px) {
  /* app/globals.css line 697 pins the stack to the TOP of the screen on the
     ledger. That is where Round 3 photographed it, 197px tall at z-index 60,
     covering the line heading and its reference-price sentence on an iPhone 14.
     Put it back where every other page already keeps it — above the mobile bar,
     out of the reading path. Doubled class for specificity over body:has(.ledger);
     the rule lives here because app/globals.css belongs to another lane. */
  body:has(.ledger) .toasts.toasts { top: auto; bottom: 5.5rem; }
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
          ? <>{stuckLabel(stuck)} Nothing is lost — send it again, or copy it out and mail it to us.</>
          : <>{waitingLabel(n)}. Held on this device until you are back online — nothing is lost.</>}
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

export default function Toasts() {
  const { toasts } = useStore();
  const waiting = useOutboxCount();
  /* One voice. While the chip is up it is the standing statement about whether
     anything reached us; a cheerful "Saved" beside it is the contradiction Round 3
     photographed, and a "held on this device" beside it is the one Round 4 did.
     Warnings that carry a DIFFERENT fact still come through — and at most one of
     them, because two boxes over a phone ledger is the failure, whatever they say. */
  const shown = waiting > 0
    ? toasts.filter((t) => t.kind !== 'ok' && !SAYS_THE_OUTBOX_FACT.test(t.text)).slice(-1)
    : toasts;
  const urgent = shown.some((t) => t.kind === 'warn');
  return (
    <div
      className="toasts"
      role="status"
      aria-live={urgent ? 'assertive' : 'polite'}
      aria-atomic="false"
      aria-relevant="additions text"
      aria-label="Notifications"
    >
      <style>{CHIP_CSS}</style>
      <OutboxChip />
      {shown.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span className="toast-ic" aria-hidden="true">{t.kind === 'ok' ? <Icon.Check /> : <Icon.Info />}</span>
          <span className="sr-only">{t.kind === 'warn' ? 'Warning: ' : t.kind === 'ok' ? 'Done: ' : ''}</span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

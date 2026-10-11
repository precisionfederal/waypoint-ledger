'use client';
/* ==========================================================================
   FLOW-FIX core: the controls a person reaches for on the ledger itself.

   patient-10: the ledger had no way to change a count or remove a line; the
   only route was "Edit my journey", about twelve screens down on a phone.
   Each line now carries its own count stepper and a Remove, and a Remove can
   be undone.

   patient-11 / access-4: Start over was a native confirm, then an empty page
   with focus on <body>, nothing announced and no way back. It now confirms in
   the page's own word ("ledger"), takes a snapshot, clears, moves to the top,
   says what happened, and offers Undo.

   FLOW2 access2-2 / access2-3 (round 2, keyboard): Undo sat 67 Tabs away
   inside a toast that left after 10 seconds, and after Undo focus fell to
   <body> (Remove) or to a heading 494 px above the screen (Start over). Now
   the Undo toast stays until it is used or closed (components/Toasts.tsx),
   focus goes straight to its Undo button, Escape or Close puts focus back in
   the ledger, and Undo returns focus to the restored line's own Remove (or,
   for Start over, the top of the page and its heading), scrolled into view.
   Undo puts back only what was taken: lines added or changed after the
   Remove or the Start over are kept.

   access2-4: a stepper at 1 used `disabled`, which dropped keyboard focus to
   <body>. It is now aria-disabled, so focus stays where the person is.
   access2-7: each count was its own live region and was heard as a bare
   "4". The count is announced once, as a sentence with its line name, through
   the app's one live region.
   ========================================================================== */
import { useEffect, useRef } from 'react';
import type { JourneyEntry } from '@/lib/types';
import { useStore } from '@/lib/store';
import { Icon } from './Icons';
import { announce, type HeldAction } from './Toasts';
import css from './LineControls.module.css';

export const START_OVER_CONFIRM = 'Clear the whole ledger? Every line on this device goes. You can undo it.';

/** Focus an element once it exists (React may still be rendering it), scrolled into view. */
function focusWhenThere(find: () => HTMLElement | null | undefined, block: ScrollLogicalPosition = 'center', tries = 8) {
  const go = () => {
    const el = find();
    if (el) {
      if (!el.hasAttribute('tabindex') && !/^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
      el.scrollIntoView({ block, behavior: 'instant' as ScrollBehavior });
      el.focus({ preventScroll: true });
      return;
    }
    if (tries-- > 0) requestAnimationFrame(go);
  };
  requestAnimationFrame(() => requestAnimationFrame(go));
}

const byData = (attr: string, key: string) =>
  [...document.querySelectorAll<HTMLElement>(`[${attr}]`)].find((n) => n.getAttribute(attr) === key) ?? null;

/** The top of the page and its heading: where the ledger starts. */
function landOnTop(sel: string) {
  focusWhenThere(() => {
    const h = document.querySelector<HTMLElement>(sel) ?? document.querySelector<HTMLElement>('main h1');
    if (h) window.scrollTo(0, 0);
    return h;
  }, 'nearest');
}

/* patient2-3: Removes in a row fold into one toast ("Removed 2 lines.") whose
   Undo puts every one of them back. The group lives until its toast is used,
   closed, or replaced by a toast of another kind. */
type Removed = { line: JourneyEntry; at: number; name: string; next?: string };
let removedGroup: Removed[] = [];

/** Clear, then land the person somewhere they can see: the top of the page,
 *  and a toast whose Undo has focus. */
export function useStartOver(): () => void {
  const st = useStore();
  return () => {
    if (!confirm(START_OVER_CONFIRM)) return;
    const before = st.snapshot();
    st.reset();
    /* After the empty ledger has rendered (the page is then short), so the
       jump to the top is not undone by the page shrinking under it. */
    let tries = 0;
    const top = () => { window.scrollTo(0, 0); if (tries++ < 3) requestAnimationFrame(top); };
    requestAnimationFrame(top);
    /* patient2-2: restoring the whole snapshot is exact only while nothing
       changed since, so the toast goes on the next change (Toasts.tsx). */
    const action: HeldAction = {
      label: 'Undo',
      name: 'Undo: put the ledger back',
      group: 'start-over',
      dropOnLedgerChange: true,
      run: () => { st.restore(before); landOnTop('main h1'); },
      onClose: () => landOnTop('#le-h'),
    };
    st.toast('Your ledger is cleared. Nothing was sent.', 'info', action);
  };
}

export function StartOverButton({ className = 'link-btn danger core-hit' }: { className?: string }) {
  const startOver = useStartOver();
  return <button className={className} type="button" onClick={startOver}>Start over</button>;
}

/** The count of one line, with one fewer and one more. */
export function LineStepper({ entry, name }: { entry: JourneyEntry; name: string }) {
  const st = useStore();
  const pressed = useRef(false);
  const atOne = entry.times <= 1;
  /* Said after the count has really changed (the store may cap it per year),
     so the sentence is always the number on the screen. */
  useEffect(() => {
    if (!pressed.current) return;
    pressed.current = false;
    announce(`${name}: ${entry.times} ${entry.times === 1 ? 'time' : 'times'}.`);
  }, [entry.times, name]);
  return (
    <span className="core-step" role="group" aria-label={`How many times: ${name}`}>
      <button type="button" className={css.step} aria-label={`One fewer: ${name}`} aria-disabled={atOne || undefined}
        onClick={() => {
          if (atOne) { announce(`${name}: 1 time. That is the fewest; Remove takes the line off.`); return; }
          pressed.current = true; st.setTimes(entry.key, entry.times - 1);
        }}><Icon.Minus /></button>
      <span className="core-step-n">{entry.times}</span>
      <button type="button" className={css.step} aria-label={`One more: ${name}`} onClick={() => { pressed.current = true; st.setTimes(entry.key, entry.times + 1); }}><Icon.Plus /></button>
    </span>
  );
}

/** Remove one line, with Undo. Focus goes to the toast's Undo, because the
 *  button that was pressed no longer exists. Undo puts back only the removed
 *  lines, each where it was (patient2-2); every other line stays as it is. */
export function RemoveLine({ entry, name }: { entry: JourneyEntry; name: string }) {
  const st = useStore();
  return (
    <button type="button" className="link-btn core-remove" data-remove-key={entry.key} aria-label={`Remove ${name} from the ledger`}
      onClick={() => {
        const before = st.snapshot();
        const at = before.entries.findIndex((e) => e.key === entry.key);
        removedGroup = [...removedGroup, {
          line: at >= 0 ? before.entries[at] : entry, at, name,
          /* the line that will sit where this one was, for a Close without Undo */
          next: before.entries[at + 1]?.key ?? before.entries[at - 1]?.key,
        }];
        const group = removedGroup;
        const last = group[group.length - 1];
        st.remove(entry.key);
        const action: HeldAction = {
          label: 'Undo',
          name: group.length === 1 ? `Undo: put ${name} back` : `Undo: put the ${group.length} lines back`,
          group: 'remove',
          onDrop: () => { if (removedGroup === group) removedGroup = []; },
          run: () => {
            removedGroup = [];
            let now = st.snapshot().entries;
            /* last removed goes back first, so each index means what it meant */
            for (const r of [...group].reverse()) {
              if (now.some((e) => e.key === r.line.key)) continue;
              const i = Math.min(Math.max(r.at, 0), now.length);
              now = [...now.slice(0, i), r.line, ...now.slice(i)];
            }
            st.restore({ ...st.snapshot(), entries: now });
            focusWhenThere(() => byData('data-remove-key', last.line.key));
          },
          onClose: () => {
            removedGroup = [];
            focusWhenThere(() => (last.next ? byData('data-li-key', last.next) ?? byData('data-remove-key', last.next) : null)
              ?? document.querySelector<HTMLElement>('#lines .table-scroll') ?? document.querySelector<HTMLElement>('main h1'));
          },
        };
        st.toast(group.length === 1 ? `Removed ${name}.` : `Removed ${group.length} lines.`, 'info', action);
      }}>
      Remove
    </button>
  );
}

/* ==========================================================================
   Two small pieces shared by /developers and /adopt (PAGES R2, 2026-09-30).

   ShowCall: the example request and its real response, folded behind one row
   under the card that explains them. A developer reads the card, and opens the
   call only when they want it. Native details/summary: Enter and Space open
   it, find-in-page reaches inside it, and it costs no JavaScript.
   ========================================================================== */

import type { ReactNode } from 'react';
import c from './devpages.module.css';

export function ShowCall({ what, children, label = 'the call', flat = false }: {
  /** one line under the row: what is inside, in words */
  what: ReactNode; children: ReactNode; label?: string;
  /** a row of its own, not the foot of a card */
  flat?: boolean;
}) {
  return (
    <details className={`${c.call}${flat ? ` ${c.flat}` : ''}`}>
      <summary>
        <span className={c.callIc} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M8.5 8L4.5 12l4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span className={c.callHead}>
          <span className={c.callLbl}><span className={c.show}>Show {label}</span><span className={c.hide}>Hide {label}</span></span>
          <span className={c.callWhat}>{what}</span>
        </span>
        <span className={c.callChev} aria-hidden="true" />
      </summary>
      <div className={c.callBody}>{children}</div>
    </details>
  );
}

export { c as dp };

'use client';

/* One small button that copies the code block it sits on. The text is passed in,
   never read back out of the page, so what is copied is exactly what is shown. */

import { useState } from 'react';

/* The class comes from the server caller (trust.module.css .copy): importing the CSS module
   here shipped its whole class map to every page that renders the trust Kit (re-merge). */
export default function CopyButton({ text, label, className }: { text: string; label: string; className: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      aria-label={done ? `${label}: copied` : `Copy ${label}`}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); }
        catch { setDone(false); }
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        {done
          ? <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          : <><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>}
      </svg>
      <span aria-hidden="true">{done ? 'Copied' : 'Copy'}</span>
      {/* FLOW adopter-19: many screen readers do not announce a label change on the
          focused button, so the confirmation is also said in a polite status. */}
      <span role="status" aria-live="polite" className="sr-only">{done ? 'Copied.' : ''}</span>
    </button>
  );
}

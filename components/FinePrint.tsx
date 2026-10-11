/* The fine print, one small "i" away. Bo, 2026-09-10: "nobody reads fine print
   ... hide it in a tiny little info button." Every sentence is still on the page
   and still read by a screen reader; it just does not sit between a person and
   the number. A native <details>, so it works with no JavaScript. */
import type { ReactNode } from 'react';

export default function FinePrint({ label = 'The fine print', children }: { label?: string; children: ReactNode }) {
  return (
    <details className="fp">
      <summary aria-label={label} title={label}><span aria-hidden="true">i</span></summary>
      <div className="fp-body">{children}</div>
    </details>
  );
}

/* ==========================================================================
   THE REGISTER'S EXPLANATIONS, READ IN TEN SECONDS (VISUAL-4b register).

   Every "How this is counted" and every folded section on /register used to be
   a paragraph. These five pieces turn the same facts into shapes a reader can
   scan: one plain lead sentence, labelled single lines, a short step strip for
   a process, a two-tile contrast for what a file records and what it does not,
   and a row of "never" chips for what the method refuses to do. No fact lives
   here; every word is passed in by the page. Colours are the product's tokens,
   so the dark theme follows.
   ========================================================================== */
import type { CSSProperties, ReactNode } from 'react';
import x from './explain.module.css';

/** One plain sentence that says what the block under it is about. */
export function Lead({ children }: { children: ReactNode }) {
  return <p className={x.lead}>{children}</p>;
}

type Line = [label: string, text: ReactNode];

/** Labelled single lines ("Counts", "Withheld when", "Updated"), one fact each.
 *  `inline` sets the label in the line itself, for narrow cards. */
export function Lines({ items, inline = false }: { items: (Line | false | null | undefined)[]; inline?: boolean }) {
  const rows = items.filter(Boolean) as Line[];
  return (
    <div className={x.cq}>
      <dl className={`${x.lines}${inline ? ` ${x.inline}` : ''}`} data-explain="">
        {rows.map(([k, v]) => (
          <div key={k} className={x.line}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}

/** A process in two to four steps, left to right where there is room and top
 *  to bottom where there is not (a phone, or the hero's narrow column), with a
 *  quiet arrow between them. */
export function Steps({ steps, label }: { steps: { icon?: ReactNode; title: ReactNode; text?: ReactNode }[]; label: string }) {
  return (
    <div className={x.cq}>
      <ol className={x.steps} aria-label={label} data-explain="" style={{ '--n': steps.length } as CSSProperties}>
        {steps.map((s, i) => (
          <li key={i} className={x.step}>
            <span className={x.num} aria-hidden="true">{s.icon ?? i + 1}</span>
            <span className={x.stepText}>
              <b>{s.title}</b>
              {s.text && <span>{s.text}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** What a source records beside what it leaves out: a solid tile and a dashed one. */
export function Contrast({ shown, missing }: { shown: { label: string; text: ReactNode }; missing: { label: string; text: ReactNode } }) {
  return (
    <ul className={x.contrast} data-explain="">
      <li className={x.cIn}>
        <span className={x.cIc} aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M3.5 9.5h17M3.5 14.5h17M10 9.5V20" /></svg>
        </span>
        <span><b>{shown.label}</b><span>{shown.text}</span></span>
      </li>
      <li className={x.cOut}>
        <span className={x.cIc} aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" strokeDasharray="3 3" /><path d="M8.5 12h7" /></svg>
        </span>
        <span><b>{missing.label}</b><span>{missing.text}</span></span>
      </li>
    </ul>
  );
}

/** What the method never does, as a row of short chips. */
export function Nevers({ items, label }: { items: ReactNode[]; label: string }) {
  return (
    <ul className={x.nevers} aria-label={label} data-explain="">
      {items.map((t, i) => (
        <li key={i}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></svg>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

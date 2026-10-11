'use client';
/* ==========================================================================
   FIND A CONDITION (VISUAL data, 2026-09-30 night).

   The catalog stays static HTML; this island only shows and hides what is
   already on the page. Every condition (a card or a row) carries data-cond
   (its name, other names and code, lower case) and data-kind (federal,
   research or none). Typing filters as you type; nothing is fetched. When a
   match sits inside the folded list of conditions without a figure, the fold
   opens so the match can be seen. The count of matches is announced.
   ========================================================================== */
import { useEffect, useId, useState } from 'react';
import s from './conditions.module.css';

type Kind = 'all' | 'federal' | 'research' | 'none';
const KINDS: { id: Kind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'federal', label: 'Federal figure' },
  { id: 'research', label: 'Research figure' },
  { id: 'none', label: 'No figure yet' },
];

export default function ConditionFilter({ total }: { total: number }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [shown, setShown] = useState(total);
  const id = useId();

  useEffect(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const all = [...document.querySelectorAll<HTMLElement>('[data-cond]')];
    let n = 0;
    let inFold = 0;
    for (const el of all) {
      const hay = el.dataset.cond ?? '';
      const ok = (kind === 'all' || el.dataset.kind === kind) && words.every((w) => hay.includes(w));
      el.hidden = !ok;
      if (ok) { n++; if (el.closest('details[data-sec="no-figure"]')) inFold++; }
    }
    setShown(n);
    const fold = document.querySelector<HTMLDetailsElement>('details[data-sec="no-figure"]');
    if (fold && (words.length || kind === 'none') && inFold > 0) fold.open = true;
    /* the headed groups say nothing when every card under them is hidden */
    for (const g of document.querySelectorAll<HTMLElement>('[data-cond-group]')) {
      g.hidden = !g.querySelector('[data-cond]:not([hidden])');
    }
  }, [q, kind]);

  return (
    <div className={s.cf} role="search" aria-label="Find a condition">
      <label className={s.cfField} htmlFor={`${id}-q`}>
        <span className={s.cfLbl}>Find a condition</span>
        <span className={s.cfBox}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M16 16l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <input id={`${id}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="A name, another name, or an ICD-10-CM code" autoComplete="off" spellCheck={false} />
        </span>
      </label>
      <div className={s.cfKinds} role="group" aria-label="Which figure">
        {KINDS.map((k) => (
          <button key={k.id} type="button" className={s.cfKind} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      <p className={s.cfN} aria-live="polite">
        {shown === total ? `All ${total} conditions shown.` : shown === 0 ? 'No condition matches. Try fewer letters or another name.' : `${shown} of ${total} conditions match.`}
      </p>
    </div>
  );
}

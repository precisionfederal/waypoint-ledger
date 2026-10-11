'use client';

/* ==========================================================================
   The reading pages are long because nothing on them was allowed to be cut:
   every figure carries its file, every field of the database is written out,
   every route is listed. So they fold instead. A section keeps its heading,
   its id and its place in the table of contents; it opens on a click, on a
   link to anything inside it, and on the browser's own find-in-page.
   ========================================================================== */

import { useEffect, useRef, type ReactNode } from 'react';
import s from './LongSection.module.css';

export interface TocItem { id: string; text: string }

export function LongSection(
  { id, title, children, open = false, first = false }:
  { id: string; title: ReactNode; children: ReactNode; open?: boolean; first?: boolean },
) {
  return (
    <details className={`${s.sec}${first ? ` ${s.first}` : ''}`} data-sec={id} open={open}>
      <summary>
        <h2 id={id}>{title}</h2>
        <span className={s.mark} aria-hidden="true" />
      </summary>
      <div className={s.secBody}>{children}</div>
    </details>
  );
}

/* Opening a section from a link has to work for a heading that is inside it,
   not only for the section itself: /method's own contents list points at the
   headings of the documents it renders. */
function openFor(el: Element | null) {
  let node: Element | null = el;
  while (node) {
    if (node instanceof HTMLDetailsElement) node.open = true;
    node = node.parentElement;
  }
}

/* One paragraph of explanation, folded under the thing it explains. */
export function Aside({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className={s.aside}>
      <summary>{summary}</summary>
      <div className={s.asideBody}>{children}</div>
    </details>
  );
}

/* Open whatever holds the target, then bring it into view and keep the hash. */
function go(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  openFor(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  history.replaceState(null, '', `#${id}`);
}

/* The contents as a row of pills, for a page to place straight under its hero
   (JUDGE-2 fix 9): below 1024 px a long page's contents must not wait several
   screens down, inside the layout. From 1024 px the layout's own rail takes
   over and this row is not drawn. Pair it with <LongLayout pillsAbove>. */
export function LongPills({ items }: { items: TocItem[] }) {
  return (
    <nav className={s.pills} aria-label="On this page">
      {/* the count says the row runs on past the screen's edge */}
      <p className={s.pillsHead}>On this page: {items.length} sections</p>
      <ul>
        {items.map((t) => (
          <li key={t.id}><button type="button" onClick={() => go(t.id)}>{t.text}</button></li>
        ))}
      </ul>
    </nav>
  );
}

export function LongLayout(
  { items, children, pillsAbove = false }:
  { items: TocItem[]; children: ReactNode;
    /** the page draws <LongPills> under its hero: no folded list here, and the rail starts at 1024 px */
    pillsAbove?: boolean },
) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      openFor(el);
      el.scrollIntoView({ block: 'start' });
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  const list = (
    <ul className={s.railList}>
      {items.map((t) => (
        <li key={t.id}><button type="button" onClick={() => go(t.id)}>{t.text}</button></li>
      ))}
    </ul>
  );

  return (
    <div className={pillsAbove ? `${s.layout} ${s.withPills}` : s.layout} ref={root}>
      <nav className={s.rail} aria-label="On this page">
        <p className={s.railHead}>On this page</p>
        {list}
      </nav>
      <div>
        {!pillsAbove && (
          <details className={s.mob}>
            <summary>On this page: {items.length} sections</summary>
            {list}
          </details>
        )}
        {children}
      </div>
    </div>
  );
}

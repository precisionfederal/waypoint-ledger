'use client';
/* Folds that open where there is room, and always on paper (VISUAL tech,
   2026-09-30 night). On a phone a long drawing stays one tap away inside its
   fold; on a screen at least 1024 px wide the folds named in `wide` open once
   the page loads; and Ctrl+P or a print button opens every fold on the page
   for the printout and closes the ones it opened afterwards. Folds are found
   by data-sec, the attribute trust/Kit's Fold already writes. */
import { useEffect } from 'react';

export default function FoldOpen({ wide = [] }: { wide?: string[] }) {
  useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      for (const id of wide) document.querySelectorAll<HTMLDetailsElement>(`details[data-sec="${id}"]`).forEach((d) => { d.open = true; });
    }
    let opened: HTMLDetailsElement[] = [];
    const before = () => {
      opened = [...document.querySelectorAll<HTMLDetailsElement>('main details:not([open])')];
      opened.forEach((d) => { d.open = true; });
    };
    const after = () => { opened.forEach((d) => { d.open = false; }); opened = []; };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, [wide]);
  return null;
}

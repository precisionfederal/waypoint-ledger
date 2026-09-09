/* Inline icons. One stroke weight, one size, no library. */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const Icon = {
  Logo: ({ size = 28 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="8" fill="var(--brand)" />
      <path d="M9 21 L13 11 L16 18 L19 11 L23 21" {...P} stroke="#fff" strokeWidth="2.4" />
      <circle cx="16" cy="24" r="1.6" fill="#fff" />
    </svg>
  ),
  Plus: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" {...P} /></svg>,
  Minus: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" {...P} /></svg>,
  X: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" {...P} /></svg>,
  Search: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" {...P} /><path d="M20 20l-3.5-3.5" {...P} /></svg>,
  Check: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" {...P} /></svg>,
  Arrow: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" {...P} /></svg>,
  Back: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" {...P} /></svg>,
  Link: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" {...P} /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" {...P} /></svg>,
  Download: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" {...P} /></svg>,
  Print: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V4h10v4M7 17H4v-6h16v6h-3M8 14h8v6H8z" {...P} /></svg>,
  Up: () => <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11v9H3v-9zM7 11l4-8a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7" {...P} /></svg>,
  Down: () => <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: 'rotate(180deg)' }}><path d="M7 11v9H3v-9zM7 11l4-8a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7" {...P} /></svg>,
  Info: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" {...P} /><path d="M12 11v5M12 8h.01" {...P} /></svg>,
  Shield: () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" {...P} /><path d="M9 12l2 2 4-4" {...P} /></svg>,
  Cite: () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h9l4 4v12H6z" {...P} /><path d="M15 4v4h4M9 13h6M9 17h6" {...P} /></svg>,
  Signal: () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18V10M10 18V5M16 18v-7M22 18H2" {...P} /></svg>,
  Sheet: () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" {...P} /><path d="M9 8h6M9 12h6M9 16h4" {...P} /></svg>,
  Menu: () => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" {...P} /></svg>,
  External: () => <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M19 14v5H5V5h5" {...P} /></svg>,
};

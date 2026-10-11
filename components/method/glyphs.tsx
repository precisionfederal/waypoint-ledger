/* Icons for /method: lucide-style strokes, 1.5 px, currentColor, never announced. */
import type { ReactNode } from 'react';

const SV = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const G = {
  type: <><path d="M4 7V5h16v2M9 19h6M12 5v14" {...SV} /></>,
  rules: <><path d="M9 6h11M9 12h11M9 18h11" {...SV} /><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" {...SV} /></>,
  spark: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5" {...SV} /></>,
  unit: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" {...SV} /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" {...SV} /></>,
  table: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" {...SV} /><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" {...SV} /></>,
  receipt: <><path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z" {...SV} /><path d="M9 8h6M9 11.5h6M9 15h3.5" {...SV} /></>,
  check: <><circle cx="12" cy="12" r="8.5" {...SV} /><path d="M8.5 12.2l2.4 2.4 4.6-4.9" {...SV} /></>,
  map: <><path d="M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2z" {...SV} /><path d="M9 4.5v13M15 6.5v13" {...SV} /></>,
  file: <><path d="M6.5 3.5h7l4 4v13h-11z" {...SV} /><path d="M13.5 3.5v4h4M9 12.5h6M9 16h6" {...SV} /></>,
  code: <><path d="M8.5 8 4.5 12l4 4M15.5 8l4 4-4 4" {...SV} /></>,
  download: <><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" {...SV} /></>,
  clock: <><circle cx="12" cy="12" r="8.5" {...SV} /><path d="M12 7.5V12l3 2" {...SV} /></>,
  plus: <><path d="M12 5v14M5 12h14" {...SV} /></>,
  send: <><path d="M4 12 20 4l-4 16-4-7z" {...SV} /><path d="M12 13l8-9" {...SV} /></>,
  users: <><circle cx="9" cy="8.5" r="3" {...SV} /><path d="M3.5 19c.6-3 2.8-4.7 5.5-4.7s4.9 1.7 5.5 4.7M15.5 5.8a3 3 0 0 1 0 5.4M17.5 14.6c1.6.6 2.7 2.1 3 4.4" {...SV} /></>,
  paper: <><path d="M7 3.5h10v17H7z" {...SV} /><path d="M10 8h4M10 11.5h4M10 15h2" {...SV} /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" {...SV} /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" {...SV} /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...SV} /><circle cx="12" cy="12" r="2.8" {...SV} /></>,
  ban: <><circle cx="12" cy="12" r="8.5" {...SV} /><path d="M6 6l12 12" {...SV} /></>,
  blank: <><rect x="4" y="6" width="16" height="12" rx="2" {...SV} strokeDasharray="2.5 2.5" /><path d="M8 12h8" {...SV} /></>,
  shield: <><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" {...SV} /><path d="M9 12l2 2 4-4" {...SV} /></>,
  people: <><circle cx="12" cy="8" r="3.5" {...SV} /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" {...SV} /></>,
  book: <><path d="M4 5.5A2 2 0 0 1 6 3.5h13v15H6a2 2 0 0 0-2 2z" {...SV} /><path d="M4 20.5v-15M8.5 8h6" {...SV} /></>,
  quote: <><path d="M9.5 7.5H6a1.5 1.5 0 0 0-1.5 1.5v3A1.5 1.5 0 0 0 6 13.5h3.5V17a2.5 2.5 0 0 1-2.5 2.5M19.5 7.5H16a1.5 1.5 0 0 0-1.5 1.5v3a1.5 1.5 0 0 0 1.5 1.5h3.5V17a2.5 2.5 0 0 1-2.5 2.5" {...SV} /></>,
};

export const Glyph = ({ g, size = 22 }: { g: ReactNode; size?: number }) => (
  <svg className="mx-glyph" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{g}</svg>
);

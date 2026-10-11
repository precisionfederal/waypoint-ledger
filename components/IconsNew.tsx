/* Waypoint Ledger icon set 2 (art lane, 2026-09-30 night). Drawn by session 4a (Codex) to match Icons.tsx:
   24 grid, 1.8 stroke, round caps and joins, currentColor, no library, no emoji. Fhir is 4a's v2 (the v1 linked
   squares read as a generic link); WentWithout is v3, a dashed pin over a path line with a gap (v1 and v2 read as a face).
   Decorative by default (aria-hidden, like every icon in Icons.tsx). Pass `title` when the icon is the only thing
   naming what it stands for: it then renders role="img" with an SVG <title> and aria-label. */
import type { ReactNode } from 'react';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export type IconNewProps = { size?: number; title?: string; className?: string };

function Svg({ size = 20, title, className, children }: IconNewProps & { children: ReactNode }) {
  const a11y = title ? { role: 'img' as const, 'aria-label': title } : { 'aria-hidden': true as const, focusable: false as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...a11y}>
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const IconNew = {
  NotSought: (p: IconNewProps = {}) => <Svg {...p}><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M4 21h16" {...P} /><path d="M14 12h1" {...P} /></Svg>,
  Refused: (p: IconNewProps = {}) => <Svg {...p}><path d="M7 3.5h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" {...P} /><path d="M8.5 7.5h5M8.5 11.5l7 6M15.5 11.5l-7 6" {...P} /></Svg>,
  ToldNothing: (p: IconNewProps = {}) => <Svg {...p}><path d="M7 4.5h10a3.5 3.5 0 0 1 3.5 3.5v6a3.5 3.5 0 0 1-3.5 3.5h-5.5L6 21v-3.65A3.5 3.5 0 0 1 3.5 14V8A3.5 3.5 0 0 1 7 4.5Z" {...P} /></Svg>,
  WrongTarget: (p: IconNewProps = {}) => <Svg {...p}><path d="M11.5 6.16A7 7 0 1 0 16.84 11.5" {...P} /><path d="M13 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" {...P} /><path d="M21 3l-6 6M15 5v4h4" {...P} /></Svg>,
  TimeSearching: (p: IconNewProps = {}) => <Svg {...p}><path d="M5 3h10M5 15h10M6 3v2c0 2 1.5 3 4 4s4 2 4 4v2M14 3v2c0 2-1.5 3-4 4s-4 2-4 4v2" {...P} /><path d="M19 9v6a3 3 0 0 1-3 3H7a1.5 1.5 0 0 0 0 3h4" {...P} /></Svg>,
  OutsideMedicine: (p: IconNewProps = {}) => <Svg {...p}><path d="M3 10.5 12 3l9 7.5M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" {...P} /><path d="M13 9l-3 4 4 2-3 6" {...P} /></Svg>,
  Money: (p: IconNewProps = {}) => <Svg {...p}><path d="M18.5 7V4.5L6 6a3 3 0 0 0-3 3v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H6" {...P} /><path d="M21 12h-4a2.5 2.5 0 0 0 0 5h4" {...P} /></Svg>,
  Time: (p: IconNewProps = {}) => <Svg {...p}><path d="M14.5 8.5a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" {...P} /><path d="M8.5 5.5v3l2 1.5M18 9v5a4 4 0 0 1-4 4h-4a2 2 0 0 0 0 4h5" {...P} /></Svg>,
  WorkMissed: (p: IconNewProps = {}) => <Svg {...p}><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 6h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" {...P} /><path d="M8 13.5h8" {...P} /></Svg>,
  UnpaidCare: (p: IconNewProps = {}) => <Svg {...p}><path d="M12 12 7.8 7.8a2.7 2.7 0 0 1 3.8-3.8l.4.4.4-.4a2.7 2.7 0 0 1 3.8 3.8L12 12Z" {...P} /><path d="M3 11v4.5a3 3 0 0 0 1.2 2.4L9 21M3 12.5a1.5 1.5 0 0 1 2.6-1l3.9 4" {...P} /><path d="M21 11v4.5a3 3 0 0 1-1.2 2.4L15 21M21 12.5a1.5 1.5 0 0 0-2.6-1l-3.9 4" {...P} /></Svg>,
  WentWithout: (p: IconNewProps = {}) => <Svg {...p}><path d="M18 8.5c0 4.2-6 9-6 9s-6-4.8-6-9a6 6 0 0 1 12 0Z" strokeDasharray="2.4 2.4" {...P} /><path d="M3 21h6m6 0h6" {...P} /></Svg>,
  Waypoint: (p: IconNewProps = {}) => <Svg {...p}><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" {...P} /><path d="M14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" {...P} /></Svg>,
  Ledger: (p: IconNewProps = {}) => <Svg {...p}><path d="M12 5.5C9 3.8 6 3.5 3 4.5v15c3-1 6-.7 9 1 3-1.7 6-2 9-1v-15c-3-1-6-.7-9 1ZM12 5.5v15" {...P} /><path d="M6.5 9h2M6.5 13h2M15.5 9h2M15.5 13h2" {...P} /></Svg>,
  FederalFile: (p: IconNewProps = {}) => <Svg {...p}><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10L13 3ZM13 3v7h7" {...P} /><path d="M8 15l2.5 2.5L16 12" {...P} /></Svg>,
  Fhir: (p: IconNewProps = {}) => <Svg {...p}><rect x="2.5" y="5" width="19" height="14" rx="1.5" {...P} /><path d="M11 5v4.5a2.7 2.7 0 1 1 0 5V19" {...P} /></Svg>,
  Register: (p: IconNewProps = {}) => <Svg {...p}><path d="M5 3.5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" {...P} /><path d="M7 8v8M12 8v8M17 8v8M6 14.5l12-5" {...P} /></Svg>,
  Community: (p: IconNewProps = {}) => <Svg {...p}><path d="M14.5 6a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM6.5 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM21.5 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" {...P} /><path d="M7 21v-4a5 5 0 0 1 10 0v4M2 20v-2a3 3 0 0 1 3-3M22 20v-2a3 3 0 0 0-3-3" {...P} /></Svg>,
};

export type IconNewName = keyof typeof IconNew;

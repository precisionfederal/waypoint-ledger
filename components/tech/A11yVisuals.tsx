/* ==========================================================================
   /accessibility, drawn (VISUAL tech, 2026-09-30 night). Server components.

   Every ratio drawn here is COMPUTED from the colour pairs below with the
   WCAG 2.1 relative-luminance formula, not typed. tests/tech-a11y.test.ts
   checks that each computed ratio equals the figure the page states in words
   and that each pair is the DESIGN R1 token it names in app/globals.css, so
   the picture and the sentence cannot drift apart.
   ========================================================================== */

import type { ReactNode } from 'react';
import t from './a11y.module.css';

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
};

/* the DESIGN R1 light tokens (app/globals.css :root) */
export const TOK = { ground: '#f5f6f8', surface: '#ffffff', ink: '#111c27', ink2: '#364350', ink3: '#556170', accentInk: '#0a6c65', brandFill: '#10212e', field: '#878f9b', fieldOld: '#e1e5ea' } as const;

/* the night theme's tokens (app/globals.css, :root[data-theme="dark"]); the ring is
   --accent-2 there, the primary button is ink on teal (--on-brand on --brand-fill),
   and the field edge is the #77899c product.css sets for dark */
export const TOK_DARK = { ground: '#06090e', surface: '#122131', ink: '#eef3f8', ink2: '#ccd7e1', ink3: '#a6b5c3', accentInk: '#6fe0d3', brandFill: '#3cc9bb', onBrand: '#04211e', ring: '#5fd8cb', field: '#77899c' } as const;

export interface Pair { what: string; fg: string; bg: string; need: number; kind?: 'text' | 'ring' | 'edge' }
type Tokens = { ground: string; surface: string; ink: string; ink2: string; ink3: string; accentInk: string; brandFill: string; onBrand: string; ring: string; field: string };
/* The same ten roles in either theme, so the light and dark boards are computed the same way. */
const pairsOf = (k: Tokens, button: string): Pair[] => [
  { what: 'Running text on the page', fg: k.ink, bg: k.ground, need: 4.5 },
  { what: 'Running text on a card', fg: k.ink, bg: k.surface, need: 4.5 },
  { what: 'Secondary text', fg: k.ink2, bg: k.ground, need: 4.5 },
  { what: 'Quiet sub-lines', fg: k.ink3, bg: k.ground, need: 4.5 },
  { what: 'Links and teal labels', fg: k.accentInk, bg: k.ground, need: 4.5 },
  { what: button, fg: k.onBrand, bg: k.brandFill, need: 4.5 },
  { what: 'Focus ring, against the page', fg: k.ring, bg: k.ground, need: 3, kind: 'ring' },
  { what: 'Focus ring, against a card', fg: k.ring, bg: k.surface, need: 3, kind: 'ring' },
  { what: 'Text box edge, against a card', fg: k.field, bg: k.surface, need: 3, kind: 'edge' },
  { what: 'Text box edge, against the page', fg: k.field, bg: k.ground, need: 3, kind: 'edge' },
];
export const PAIRS: Pair[] = pairsOf({ ...TOK, onBrand: TOK.surface, ring: TOK.accentInk }, 'White on the primary button');
export const PAIRS_DARK: Pair[] = pairsOf(TOK_DARK, 'Dark text on the primary button');

const MAX = 21;
const pct = (r: number) => `${Math.min(100, ((r - 1) / (MAX - 1)) * 100)}%`;

function Swatch({ p }: { p: Pair }) {
  if (p.kind === 'ring') return <span className={t.sw} style={{ background: p.bg }} aria-hidden="true"><i className={t.swRing} style={{ boxShadow: `0 0 0 2px ${p.bg}, 0 0 0 4px ${p.fg}` }} /></span>;
  if (p.kind === 'edge') return <span className={t.sw} style={{ background: p.bg }} aria-hidden="true"><i className={t.swField} style={{ borderColor: p.fg }} /></span>;
  return <span className={t.sw} style={{ background: p.bg, color: p.fg }} aria-hidden="true">Aa</span>;
}

/** One measured pair: the sample, a 1-to-21 bar with the rule's mark, and the ratio. */
export function Meter({ p, compact = false }: { p: Pair; compact?: boolean }) {
  const r = contrast(p.fg, p.bg);
  return (
    <div className={`${t.meter}${compact ? ` ${t.compact}` : ''}`}>
      <div className={t.bar} aria-hidden="true">
        <span className={t.fill} style={{ width: pct(r) }} />
        <span className={t.need} style={{ left: pct(p.need) }}><b>{p.need}:1</b></span>
      </div>
      {!compact && <Swatch p={p} />}
    </div>
  );
}

export function ContrastBoard({ pairs = PAIRS, theme = 'light' }: { pairs?: Pair[]; theme?: 'light' | 'dark' }) {
  return (
    <figure className={t.board}>
      <figcaption className={t.boardCap}>
        Every colour pair in the {theme} theme, measured. Each bar runs from 1:1 to 21:1; the mark is what WCAG 2.1 asks for that pair.
      </figcaption>
      <table className={t.table}>
        <thead><tr><th scope="col">Pair</th><th scope="col"><span className="sr-only">Sample and </span>measured against the rule</th><th scope="col">Ratio</th><th scope="col">Asks for</th></tr></thead>
        <tbody>
          {pairs.map((p) => (
            <tr key={p.what}>
              <th scope="row">{p.what}</th>
              <td><div className={t.cell}><Swatch p={p} /><Meter p={p} compact /></div></td>
              <td className={t.ratio}>{contrast(p.fg, p.bg).toFixed(2)}:1</td>
              <td className={t.needCol}>{p.need}:1</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

const ICON: Record<string, ReactNode> = {
  ring: <><rect x="5" y="8" width="14" height="8" rx="4" /><rect x="2.5" y="5.5" width="19" height="13" rx="6.5" strokeDasharray="2 2" /></>,
  text: <><path d="M5 18l5-12 5 12M7 13.5h6" /><path d="M16.5 18v-4.5a2.25 2.25 0 0 1 4.5 0V18M16.5 15.5h4.5" /></>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M10 6.5h4M10 10h4M10 13.5h3" /></>,
  touch: <><rect x="4" y="4" width="16" height="16" rx="3" strokeDasharray="2.5 2" /><circle cx="12" cy="12" r="3.5" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.2l2.4 2.4 4.6-4.9" /></>,
  skip: <><path d="M4 12h12M12 7l5 5-5 5" /><path d="M20 5v14" /></>,
  open: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5M12 15.8v.2" /></>,
};
const Ic = ({ k }: { k: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{ICON[k]}</svg>
);

/** A scorecard tile: an icon, a status the card's own sentence supports, the heading and the sentence. */
export function Score({ icon, status, tone = 'met', fig, figLabel, children }: {
  icon: string; status: string; tone?: 'met' | 'open'; fig?: ReactNode; figLabel?: ReactNode; children: ReactNode;
}) {
  return (
    <li className={`${t.score} ${tone === 'open' ? t.open : t.met}`}>
      <div className={t.scoreTop}>
        <span className={t.scoreIc}><Ic k={icon} /></span>
        <span className={t.status}>{status}</span>
      </div>
      {fig != null && <p className={t.fig}><b>{fig}</b>{figLabel && <span>{figLabel}</span>}</p>}
      {children}
    </li>
  );
}

/** The three findings fixed on Sep 30, drawn to scale beside their sentences. */
export function FieldEdge() {
  return (
    <div className={t.pair} aria-hidden="true">
      <span className={t.pairItem}><i className={t.field} style={{ borderColor: TOK.fieldOld }} /><small>before, {contrast(TOK.fieldOld, TOK.surface).toFixed(2)}:1</small></span>
      <span className={t.arrow}>&rarr;</span>
      <span className={t.pairItem}><i className={t.field} style={{ borderColor: TOK.field }} /><small>now, {contrast(TOK.field, TOK.surface).toFixed(2)}:1</small></span>
    </div>
  );
}
export function Toggle() {
  return (
    <div className={t.pair} aria-hidden="true">
      <span className={t.pairItem}><i className={t.tgWrap}><i className={t.tgDot} /></i><small>before, 22 px target</small></span>
      <span className={t.arrow}>&rarr;</span>
      <span className={t.pairItem}><i className={`${t.tgWrap} ${t.tgBig}`}><i className={t.tgDot} /></i><small>now, 44&times;44 px target</small></span>
    </div>
  );
}
export function SurveyRow() {
  return (
    <div className={t.pair} aria-hidden="true">
      <span className={`${t.pairItem} ${t.wide}`}><i className={t.row}><i className={t.radio} /><i className={t.rowText} /></i><small>an 18 px circle inside a 52 px row</small></span>
    </div>
  );
}

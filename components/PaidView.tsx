'use client';
/* ==========================================================================
   WHAT YOU PAID (round 5). The column, the separate total, the roll-up by kind
   of care, and the one form that takes the amounts. Mounted from Ledger.tsx.

   🔴 NOTHING HERE RENDERS UNTIL A LINE CARRIES A PAID AMOUNT, except the
   form, which is closed. With no amount the ledger is the ledger it was:
   no column, no card, no shift (tests/paid-view.test.ts holds it to the
   round-4 markup byte for byte).
   🔴 The person's number is never added to a federal figure. It sits beside
   it, and the difference is counted only on lines that carry both.
   ========================================================================== */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { saidQuote } from '@/lib/said-quote';
import Dialog from './Dialog';
import { Icon } from './Icons';
import { usd } from '@/lib/pricing';
import type { JourneyEntry, PricedLine } from '@/lib/types';
import {
  cleanPaid, gapPhrase, paidArithmetic, paidEachOf, paidOf, paidRowOf, payableLine, signedMoney,
  type PaidSummary,
} from '@/lib/paid';

const money = (n: number) => usd(n, true);

/** The column head. Only mounted when a line carries a paid amount. */
export function PaidHead() {
  return <th scope="col" className="r paid-col">What you paid</th>;
}

/** One line's cell: the amount, the arithmetic when it was for one of several, and the difference. */
export function PaidCell({ line, payable, onEdit }: { line: PricedLine; payable: boolean; onEdit: (key: string) => void }) {
  const r = paidRowOf(line);
  const name = line.entry.item?.label ?? line.entry.raw;
  if (r.paidUsd === null) {
    return (
      <td className="r paid-cell" data-label="What you paid">
        {payable
          ? <button type="button" className="link-btn paid-add" onClick={() => onEdit(line.entry.key)} aria-label={`Add what you paid for ${name}`}>Add</button>
          : <span className="paid-none">–</span>}
      </td>
    );
  }
  const math = paidArithmetic(line.entry, money);
  return (
    <td className="r paid-cell" data-label="What you paid">
      <strong>{money(r.paidUsd)}</strong>
      {math && <span className="paid-sub">{math}</span>}
      <span className={`paid-sub${r.gapUsd !== null && r.gapUsd > 0.005 ? ' paid-over' : ''}`}>
        {r.gapUsd === null ? 'no federal figure to compare' : gapPhrase(r.gapUsd, r.figureName, money)}
      </span>
      <button type="button" className="link-btn paid-add" onClick={() => onEdit(line.entry.key)} aria-label={`Change what you paid for ${name}`}>Change</button>
    </td>
  );
}

/** One sentence under the total: the person's own total, apart from the federal one. */
export function PaidStrip({ s }: { s: PaidSummary }) {
  if (!s.any) return null;
  return (
    <p className="micro paid-strip">
      <b>You paid {usd(s.paidUsd, true)}</b> on {s.paidLines} {s.paidLines === 1 ? 'line' : 'lines'}, by your own figures.
      {' '}That is shown beside the published figures and never added to them. <a href="#paid">See what you paid, by kind of care</a>
    </p>
  );
}

/** The separate total and the roll-up by kind of care. */
export function PaidCard({ s, onEdit }: { s: PaidSummary; onEdit: () => void }) {
  if (!s.any) return null;
  const fig = s.figureName;
  return (
    <section className="card paid-card" id="paid" aria-labelledby="paid-h">
      <div className="card-lbl paid-card-head">
        <p className="lbl" id="paid-h">What you paid</p>
        <button type="button" className="link-btn paid-add" onClick={onEdit}>Change what you paid</button>
      </div>
      <p className="micro">Your own figures, typed on this device. They sit beside the published figures and are never added to them.</p>
      <div className="paid-tiles">
        <div className="paid-tile">
          <span className="paid-v">{usd(s.paidUsd, true)}</span>
          <span className="paid-l">You paid</span>
          <span className="paid-s">on {s.paidLines} {s.paidLines === 1 ? 'line' : 'lines'}</span>
        </div>
        {s.compared > 0 && (
          <>
            <div className="paid-tile">
              <span className="paid-v">{usd(s.comparedFederalUsd, true)}</span>
              <span className="paid-l">The {fig} for the same {s.compared === 1 ? 'line' : `${s.compared} lines`}</span>
              <span className="paid-s">from the ledger above</span>
            </div>
            <div className="paid-tile">
              <span className={`paid-v${(s.gapUsd ?? 0) > 0.005 ? ' paid-over' : ''}`}>{signedMoney(s.gapUsd ?? 0, money)}</span>
              <span className="paid-l">Difference from the {fig}</span>
              <span className="paid-s">what you paid, minus the figure</span>
            </div>
          </>
        )}
      </div>
      {s.noFigureLines > 0 && (
        <p className="micro">
          {usd(s.noFigurePaidUsd, true)} of what you paid is on {s.noFigureLines} {s.noFigureLines === 1 ? 'line' : 'lines'} with no federal figure,
          so there is nothing to compare {s.noFigureLines === 1 ? 'it' : 'them'} with. It still counts in what you paid.
        </p>
      )}
      <div className="table-scroll" tabIndex={0}>
        <table className="paid-roll">
          <caption>What you paid, by kind of care</caption>
          <thead>
            <tr><th scope="col">Kind of care</th><th scope="col" className="r">You paid</th><th scope="col" className="r">The {fig}</th><th scope="col" className="r">Difference</th></tr>
          </thead>
          <tbody>
            {s.groups.map((g) => (
              <tr key={g.key}>
                <th scope="row">{g.label}<small>{g.lines} {g.lines === 1 ? 'line' : 'lines'}</small></th>
                <td className="r" data-label="You paid">{usd(g.paidUsd, true)}</td>
                <td className="r" data-label={`The ${fig}`}>{g.compared ? usd(g.federalUsd, true) : 'none'}</td>
                <td className="r" data-label="Difference">{g.gapUsd === null ? '–' : signedMoney(g.gapUsd, money)}</td>
              </tr>
            ))}
          </tbody>
          {s.groups.length > 1 && (
            <tfoot>
              <tr>
                <th scope="row">All of it</th>
                <td className="r" data-label="You paid">{usd(s.paidUsd, true)}</td>
                <td className="r" data-label={`The ${fig}`}>{s.compared ? usd(s.comparedFederalUsd, true) : 'none'}</td>
                <td className="r" data-label="Difference">{s.gapUsd === null ? '–' : signedMoney(s.gapUsd, money)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="micro">The difference is counted only on lines that carry both numbers. What you paid stays in this browser; it goes with your ledger only if you press Save across devices, and never in a share link.</p>
    </section>
  );
}

/** The foot link that opens the form when no line carries an amount yet. */
export function AddPaidButton({ onClick, any }: { onClick: () => void; any: boolean }) {
  return <button className="link-btn" type="button" onClick={onClick}>{any ? 'Change what you paid' : 'Add what you paid'}</button>;
}

interface Draft { usd: string; each: boolean }

/** The form: every line a person could have paid for, one amount each. */
export function PaidDialog({ open, focusKey, entries, gapKeys, onClose, onSave }: {
  open: boolean;
  /** the line to put the cursor on, when opened from a line */
  focusKey: string | null;
  entries: JourneyEntry[];
  /** lines that are care that did not happen, or a length of time: never paid */
  gapKeys: Set<string>;
  onClose: () => void;
  onSave: (rows: { key: string; usd: number | null; each: boolean }[]) => void;
}) {
  const rows = useMemo(() => entries.filter((e) => payableLine(e, gapKeys.has(e.key))), [entries, gapKeys]);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [bad, setBad] = useState<string | null>(null);
  const first = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const d: Record<string, Draft> = {};
    for (const e of rows) { const p = paidOf(e); d[e.key] = { usd: p === null ? '' : p.toFixed(2), each: paidEachOf(e) }; }
    setDraft(d); setBad(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  /* The keyboard goes back to the control that opened the form (the dialog is
     unmounted on close, so it cannot do this itself). */
  /* A layout effect runs before the dialog's own effect moves focus inside it,
     so what it reads is still the control the person pressed. */
  useLayoutEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    return () => { requestAnimationFrame(() => { if (back && document.contains(back)) back.focus(); }); };
  }, [open]);
  if (!open) return null;

  const save = (ev: React.FormEvent) => {
    ev.preventDefault();
    const out: { key: string; usd: number | null; each: boolean }[] = [];
    for (const e of rows) {
      const d = draft[e.key]; if (!d) continue;
      const usdN = d.usd.trim() === '' ? null : cleanPaid(d.usd);
      if (d.usd.trim() !== '' && usdN === null) { setBad(e.key); document.getElementById(`paid-in-${e.key}`)?.focus(); return; }
      out.push({ key: e.key, usd: usdN, each: d.each });
    }
    onSave(out);
  };
  return (
    <Dialog open onClose={onClose} labelledBy="paid-dlg-title" label="What you paid" initialFocus={first}>
      <div className="drawer-backdrop" onClick={onClose}>
        <aside className="drawer paid-dlg" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-head">
            <div>
              <p className="eyebrow">Your own figures</p>
              <h2 id="paid-dlg-title">What you paid</h2>
            </div>
            <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon.X /></button>
          </div>
          <form className="drawer-body paid-dlg-body" onSubmit={save} noValidate>
            <p className="paid-dlg-lead">Type what you actually paid, out of your own pocket, for any line. Leave a line empty if you do not know. It stays in this browser, beside the published figure, and is never added to it.</p>
            <ul className="paid-dlg-list">
              {rows.map((e) => {
                const d = draft[e.key] ?? { usd: '', each: false };
                const name = e.item?.label ?? (e.raw || 'A step with no federal figure');
                const times = Math.max(1, Math.floor(e.times) || 1);
                return (
                  <li key={e.key} className={bad === e.key ? 'is-bad' : undefined}>
                    <label htmlFor={`paid-in-${e.key}`} className="paid-dlg-name">
                      {name}{times > 1 ? <span> · {times} times</span> : null}
                      <small>{e.item ? (e.raw ? `you said “${saidQuote(e.raw)}”` : 'from a shared link') : 'no federal figure'}</small>
                    </label>
                    <div className="row paid-dlg-row">
                      <span className="cur" aria-hidden="true">$</span>
                      <input
                        id={`paid-in-${e.key}`}
                        ref={(el) => { if (e.key === (focusKey && rows.some((r) => r.key === focusKey) ? focusKey : rows[0]?.key)) first.current = el; }}
                        type="text" inputMode="decimal" autoComplete="off" placeholder="0.00"
                        value={d.usd} aria-invalid={bad === e.key || undefined}
                        aria-describedby={bad === e.key ? `paid-err-${e.key}` : undefined}
                        onChange={(ev) => { const v = ev.target.value; setDraft((p) => ({ ...p, [e.key]: { ...d, usd: v } })); if (bad === e.key) setBad(null); }}
                      />
                      {times > 1 && (
                        <select aria-label={`Is that for all ${times} times, or for each one?`} value={d.each ? 'each' : 'all'}
                          onChange={(ev) => { const each = ev.target.value === 'each'; setDraft((p) => ({ ...p, [e.key]: { ...d, each } })); }}>
                          <option value="all">for all {times} together</option>
                          <option value="each">for each one</option>
                        </select>
                      )}
                    </div>
                    {bad === e.key && <p className="paid-err" id={`paid-err-${e.key}`}>Type an amount in dollars, like 340 or 85.50.</p>}
                  </li>
                );
              })}
            </ul>
            <div className="row paid-dlg-actions">
              <button className="btn primary" type="submit">Keep these amounts</button>
              <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
            </div>
            <p className="micro">Nothing here is sent anywhere. It goes with your ledger only if you press Save across devices.</p>
          </form>
        </aside>
      </div>
    </Dialog>
  );
}

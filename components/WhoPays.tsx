'use client';

/* ==========================================================================
   WHO CARRIES THIS COST — under the total, on every ledger.

   The NIH federal lead asked every team at the 1 Oct Beta for three things on
   every number: who carries it (the health system, the person, or nobody's
   books), and which dollar year and interval it is in. This panel answers from
   published rules only (lib/whopays.ts): the 2026 Original Medicare Part B
   deductible and 20% coinsurance on the Medicare lines, the hospital-published
   private ranges beside them, and the costs nobody prices as counts.

   Nothing here is "your bill". Each figure says its basis, its year and the
   assumption it rests on, on its face.
   ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import { usd } from '@/lib/pricing';
import { COVERAGE_LABEL, type Ctx } from '@/lib/fit';
import { burdenCards, type BurdenCounts } from '@/lib/burdens';
import { loadForgone } from '@/lib/forgone';
import type { GapSummary } from '@/lib/sheet';
import type { PricedLine } from '@/lib/types';
import { PART_B, RATE_PCT, RULE_TEXT, invisibleCounts, whoPays, type ForgoneLike } from '@/lib/whopays';
import s from './WhoPays.module.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

export interface WhoPaysProps {
  lines: readonly PricedLine[];
  ctx: Ctx;
  gaps: Pick<GapSummary, 'cats' | 'months' | 'named'>;
  burdens: BurdenCounts;
  /** On a phone the panel folds to its heading and one line, so her first ledger line stays near the top. */
  compact?: boolean;
}

export default function WhoPays({ lines, ctx, gaps, burdens, compact = false }: WhoPaysProps) {
  const w = useMemo(() => whoPays(lines, ctx), [lines, ctx]);
  const [forgone, setForgone] = useState<ForgoneLike | null>(null);
  /* The care-gone-without counters live on this device (lib/forgone); read them
     after mount and again whenever the panel is looked at. */
  const reread = () => setForgone(loadForgone());
  useEffect(reread, [lines]);
  const unseen = useMemo(() => invisibleCounts({
    months: gaps.months, wordCats: gaps.cats, named: gaps.named, forgone,
    dismissed: burdens.dismissed, trips: burdens.trips,
  }), [gaps, burdens, forgone]);
  const wages = useMemo(() => burdenCards(burdens).filter((c) => c.valueUsd !== null && c.count > 0), [burdens]);

  const m = w.medicare;
  const p = w.private;
  if (!m && !w.other.length && !unseen.length) return null;
  const cov = ctx.coverage && ctx.coverage !== 'medicare' ? COVERAGE_LABEL[ctx.coverage] : null;
  const rules = `${PART_B.year} Medicare rules`;
  const remaining = m ? Math.max(0, m.subjectUsd - m.deductibleAppliedUsd) : 0;

  const body = (
    <>
      {w.reference && m && (
        <p className={s.ref} data-testid="whopays-reference">
          {cov
            ? <>You chose <b>{cov}</b>. The Medicare split below is a reference for someone with Original Medicare, not what your plan pays.</>
            : <>Shown as a reference for someone with Original Medicare. Choose your coverage above and this says whether it describes you.</>}
        </p>
      )}
      <div className={s.grid}>
        {m && (
          <div className={s.tile} data-testid="whopays-program">
            <p className={s.lbl}>The Medicare program pays</p>
            <p className={s.num}>{usd(m.programUsd, true)}</p>
            <p className={s.basis}>{rules} · of {usd(m.approvedUsd, true)} Medicare-approved on {m.lines.length} {m.lines.length === 1 ? 'line' : 'lines'}</p>
          </div>
        )}
        {m && (
          <div className={s.tile} data-testid="whopays-person">
            <p className={s.lbl}>Your share if you had Original Medicare (Part B) and had not met the {PART_B.year} deductible</p>
            <p className={s.num}>{usd(m.personUsd, true)}</p>
            <p className={s.basis}>
              {rules} · {usd(m.deductibleAppliedUsd, true)} deductible{m.deductibleAppliedUsd < m.deductibleUsd ? ` (of ${usd(m.deductibleUsd)})` : ''} + {RATE_PCT} of the remaining {usd(remaining, true)} = {usd(m.coinsuranceUsd, true)}
              {m.noShareUsd > 0 ? ` · ${usd(m.noShareUsd, true)} of lab tests and yearly screenings carry no share` : ''}
            </p>
          </div>
        )}
        {p && (
          <div className={s.tile} data-testid="whopays-private">
            <p className={s.lbl}>With a private plan: what these hospitals negotiated for the same care</p>
            <p className={s.num}>{usd(p.lowUsd)}–{usd(p.highUsd)}</p>
            <p className={s.basis}>
              Hospital files read {p.readOn.map(day).join(', ')} · {p.lines} of {p.lines + p.without} Medicare lines · {p.hospitals} hospitals · a range, never added to the Medicare figures
            </p>
          </div>
        )}
        <div className={`${s.tile} ${s.unseen}`} data-testid="whopays-invisible">
          <p className={s.lbl}>On nobody’s bill</p>
          {unseen.length ? (
            <ul className={s.counts}>
              {unseen.map((c) => <li key={c.id}><b>{c.count}</b> {c.unit} · {c.label}</li>)}
            </ul>
          ) : <p className={s.basis}>Nothing counted yet. Care you went without, and times you were told it was nothing, are counted on this page and never priced.</p>}
          <p className={s.basis}>Counted, never priced: no federal file puts a dollar on them.</p>
        </div>
      </div>

      <details className={s.how}>
        <summary>How each number is worked out</summary>
        {m && (
          <>
            <p className={s.small}>
              <b>Assumptions, stated:</b> Original Medicare Part B, none of the {PART_B.year} deductible paid yet, every clinician accepts the Medicare-approved amount as full payment, and no Medigap, Medicaid or retiree plan pays part of the share. The monthly Part B premium is not included. Medicare Advantage plans set their own copays.
            </p>
            <table className={s.tbl}>
              <caption className="sr-only">Each Medicare line, its approved amount and the Part B rule applied to it</caption>
              <thead><tr><th scope="col">Line</th><th scope="col" className={s.r}>Times</th><th scope="col" className={s.r}>Medicare-approved</th><th scope="col">Part B rule</th></tr></thead>
              <tbody>
                {m.lines.map((l) => (
                  <tr key={l.key}><td>{l.label}</td><td className={s.r}>{l.times}</td><td className={s.r}>{usd(l.approvedUsd, true)}</td><td>{RULE_TEXT[l.rule].short}</td></tr>
                ))}
              </tbody>
            </table>
            <p className={s.small}>
              {usd(m.subjectUsd, true)} is under the deductible-then-{RATE_PCT} rule. The {usd(m.deductibleUsd)} deductible is met once across those lines: {usd(m.deductibleAppliedUsd, true)}. Then {RATE_PCT} × {usd(remaining, true)} = {usd(m.coinsuranceUsd, true)}. Your share: {usd(m.deductibleAppliedUsd, true)} + {usd(m.coinsuranceUsd, true)} = <b>{usd(m.personUsd, true)}</b>. The program: {usd(m.approvedUsd, true)} − {usd(m.personUsd, true)} = <b>{usd(m.programUsd, true)}</b>.
            </p>
            <ul className={s.src}>
              <li>“{PART_B.deductibleSource.quote}.” <a href={PART_B.deductibleSource.url} target="_blank" rel="noopener noreferrer">CMS fact sheet</a></li>
              <li>“{RULE_TEXT['deductible-and-20'].source}.” <a href={RULE_TEXT['deductible-and-20'].url} target="_blank" rel="noopener noreferrer">Medicare.gov</a></li>
              <li>“{RULE_TEXT['no-share-lab'].source}.” <a href={RULE_TEXT['no-share-lab'].url} target="_blank" rel="noopener noreferrer">Medicare.gov</a></li>
            </ul>
          </>
        )}
        {(w.other.length > 0 || wages.length > 0) && (
          <>
            <p className={s.small}><b>On their own basis, never split and never added to the figures above:</b></p>
            <ul className={s.src}>
              {w.other.map((o) => <li key={o.key}>{o.label}: {o.totalUsd === null ? 'no figure describes you' : usd(o.totalUsd, true)} · {o.basis} · {o.year} dollars</li>)}
              {wages.map((c) => <li key={c.kind}>{c.title}: {usd(c.valueUsd, true)} · wages{c.source.year ? ` · ${c.source.year} dollars` : ''} · shown in its own section below</li>)}
            </ul>
          </>
        )}
      </details>
    </>
  );

  if (compact) {
    return (
      <details className={`${s.wrap} ${s.fold}`} data-testid="who-pays" onToggle={reread}>
        <summary>
          <h2 className={s.h}>Who carries this cost</h2>
          {m && <span className={s.sumLine}>Medicare {usd(m.programUsd)} · your share {usd(m.personUsd)} with Original Medicare · {rules}</span>}
        </summary>
        {body}
      </details>
    );
  }
  return (
    <section className={s.wrap} aria-labelledby="whopays-h" data-testid="who-pays">
      <h2 id="whopays-h" className={s.h}>Who carries this cost</h2>
      {body}
    </section>
  );
}

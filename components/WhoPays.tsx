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

import { Suspense, lazy, useEffect, useId, useMemo, useState } from 'react';
import { usd } from '@/lib/pricing';
import { COVERAGE_LABEL, localityOf, type Ctx } from '@/lib/fit';
import { burdenCards, type BurdenCounts } from '@/lib/burdens';
import { loadForgone } from '@/lib/forgone';
import type { GapSummary } from '@/lib/sheet';
import type { PricedLine } from '@/lib/types';
import { PART_B, RATE_PCT, RULE_TEXT, invisibleCounts, whoPays, type ForgoneLike } from '@/lib/whopays';
import { loadPlan, savePlan, type PlanKind } from '@/lib/plan-store';
import s from './WhoPays.module.css';

/* The form and the arithmetic load only when a person picks their own plan or Medicaid. */
const YourPlan = lazy(() => import('./YourPlan'));

const PLAN_KINDS: { key: PlanKind; label: string }[] = [
  { key: 'medicare', label: 'Original Medicare' },
  { key: 'private', label: 'My employer or marketplace plan' },
  { key: 'medicaid', label: 'Medicaid' },
];

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
  /* Whose terms the share is worked out under. Original Medicare until the person
     picks another; a saved choice (this device only) or their coverage above picks it after mount. */
  const [kind, setKind] = useState<PlanKind>('medicare');
  useEffect(() => {
    const saved = loadPlan();
    if (saved.kind !== 'medicare') setKind(saved.kind);
    else if (ctx.coverage === 'employer' || ctx.coverage === 'marketplace') setKind('private');
    else if (ctx.coverage === 'medicaid') setKind('medicaid');
  }, [ctx.coverage]);
  const pick = (k: PlanKind) => { setKind(k); savePlan({ kind: k, terms: loadPlan().terms }); };
  const pid = useId();

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
      {m && (
        <fieldset className={s.pick} data-testid="whopays-plan-pick">
          <legend className={s.pickLg}>Work out your share with</legend>
          <div className={s.pills}>
            {PLAN_KINDS.map((o) => (
              <label key={o.key} className={s.pill} htmlFor={`${pid}-${o.key}`}>
                <input id={`${pid}-${o.key}`} type="radio" name={`${pid}-plan`} value={o.key} checked={kind === o.key} onChange={() => pick(o.key)} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {m && kind !== 'medicare' && (
        <Suspense fallback={<p className={s.small}>Loading your plan&rsquo;s form…</p>}>
          <YourPlan kind={kind} split={m} stateCode={localityOf(ctx.locality)?.state ?? null} />
        </Suspense>
      )}
      <div className={s.grid}>
        {m && (
          <div className={s.tile} data-testid="whopays-program">
            <p className={s.lbl}>The Medicare program pays</p>
            <p className={s.num}>{usd(m.programUsd, true)}</p>
            <p className={s.basis}>{rules} · of {usd(m.approvedUsd, true)} Medicare-approved on {m.lines.length} {m.lines.length === 1 ? 'line' : 'lines'}</p>
            <p className={s.why} data-testid="whopays-why-low"><b>Why this may look low:</b> Medicare&rsquo;s approved amount is a rate the government sets. Private plans and hospital charges are usually higher. Where the table carries the billed charge, it is in each line&rsquo;s drawer.</p>
          </div>
        )}
        {m && (
          <div className={s.tile} data-testid="whopays-person">
            <p className={s.lbl}>Your share if you had Original Medicare (Part B) and had not met the {PART_B.year} deductible</p>
            <p className={s.num}>{usd(m.personUsd, true)}</p>
            <p className={s.basis}>
              {rules} · {usd(m.deductibleAppliedUsd, true)} deductible{m.deductibleAppliedUsd < m.deductibleUsd ? ` (of ${usd(m.deductibleUsd)})` : ''}{remaining > 0 ? <> + {usd(m.coinsuranceUsd, true)} coinsurance ({RATE_PCT} of the remaining {usd(remaining, true)}) = {usd(m.deductibleAppliedUsd + m.coinsuranceUsd, true)}</> : ', all of it under the deductible'}
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
              {usd(m.subjectUsd, true)} is under the deductible-then-{RATE_PCT} rule. The {usd(m.deductibleUsd)} deductible is met once across those lines: {usd(m.deductibleAppliedUsd, true)}. {remaining > 0 ? <>Then {RATE_PCT} × {usd(remaining, true)} = {usd(m.coinsuranceUsd, true)}. </> : `Nothing is left over the deductible, so no ${RATE_PCT} share applies. `}Your share: {usd(m.deductibleAppliedUsd, true)} + {usd(m.coinsuranceUsd, true)} = <b>{usd(m.personUsd, true)}</b>. The program: {usd(m.approvedUsd, true)} − {usd(m.personUsd, true)} = <b>{usd(m.programUsd, true)}</b>.
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

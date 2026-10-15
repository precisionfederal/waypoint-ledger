'use client';

/* ==========================================================================
   YOUR PLAN — inside "Who carries this cost", loaded only when a person picks
   their own plan or Medicaid (components/WhoPays.tsx).

   "Medicare's rate is not what I pay" is the first thing everyone says. Here a
   person types their own plan's terms and sees their own share, with the
   arithmetic on its face (lib/plan-estimate.ts). Every dollar is a Medicare
   figure already on the ledger or a number they typed; the typed numbers stay
   in this browser (localStorage) and are never sent.
   ========================================================================== */

import { useEffect, useId, useMemo, useState } from 'react';
import { usd } from '@/lib/pricing';
import { medicaidFeeScheduleFor, medicaidProgramFor } from '@/lib/fit';
import type { MedicareSplit } from '@/lib/whopays';
import {
  MEDICAID_SOURCE, PREVENTIVE_SOURCE, clampNum, hasTerms, loadPlan, planArithmetic, planEstimate, savePlan,
  MAX_USD, type PlanKind, type PlanTerms,
} from '@/lib/plan-estimate';
import s from './WhoPays.module.css';

type Field = keyof PlanTerms;
const FIELDS: { key: Field; label: string; unit: '$' | '%'; hint?: string }[] = [
  { key: 'deductibleUsd', label: 'Yearly deductible', unit: '$' },
  { key: 'deductibleMetUsd', label: 'Deductible already paid this year', unit: '$' },
  { key: 'coinsurancePct', label: 'Coinsurance after the deductible', unit: '%' },
  { key: 'copayUsd', label: 'Copay per doctor, therapy or ER visit', unit: '$', hint: 'Leave blank if your plan uses coinsurance for visits' },
  { key: 'oopMaxUsd', label: 'Out-of-pocket maximum for the year', unit: '$', hint: 'Leave blank for no cap' },
];

const asText = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

export default function YourPlan({ kind, split, stateCode }: { kind: Exclude<PlanKind, 'medicare'>; split: MedicareSplit; stateCode?: string | null }) {
  if (kind === 'medicaid') return <MedicaidNote stateCode={stateCode} />;
  return <PrivatePlan split={split} />;
}

function PrivatePlan({ split }: { split: MedicareSplit }) {
  const id = useId();
  const [text, setText] = useState<Record<Field, string>>({ deductibleUsd: '', deductibleMetUsd: '', coinsurancePct: '', copayUsd: '', oopMaxUsd: '' });
  useEffect(() => {
    const t = loadPlan().terms;
    setText({
      deductibleUsd: asText(t.deductibleUsd), deductibleMetUsd: asText(t.deductibleMetUsd), coinsurancePct: asText(t.coinsurancePct),
      copayUsd: asText(t.copayUsd), oopMaxUsd: asText(t.oopMaxUsd),
    });
  }, []);
  const terms: PlanTerms = useMemo(() => ({
    deductibleUsd: clampNum(text.deductibleUsd, 0, MAX_USD),
    deductibleMetUsd: clampNum(text.deductibleMetUsd, 0, MAX_USD),
    coinsurancePct: clampNum(text.coinsurancePct, 0, 100),
    copayUsd: clampNum(text.copayUsd, 0, MAX_USD),
    oopMaxUsd: clampNum(text.oopMaxUsd, 0, MAX_USD),
  }), [text]);
  const set = (k: Field, v: string) => {
    const next = { ...text, [k]: v };
    setText(next);
    const t: PlanTerms = {};
    for (const f of FIELDS) { const n = clampNum(next[f.key], 0, f.unit === '%' ? 100 : MAX_USD); if (n !== null) t[f.key] = n; }
    savePlan({ kind: 'private', terms: t });
  };
  const e = useMemo(() => planEstimate(split.lines, terms), [split, terms]);
  const any = hasTerms(terms);
  const money = (n: number) => usd(n, true);

  return (
    <div className={s.plan} data-testid="your-plan">
      <p className={s.small}>Type the numbers from your plan&rsquo;s summary of benefits. They stay in this browser and are never sent.</p>
      <div className={s.form}>
        {FIELDS.map((f) => (
          <label key={f.key} className={s.field} htmlFor={`${id}-${f.key}`}>
            <span className={s.fl}>{f.label} ({f.unit})</span>
            <input
              id={`${id}-${f.key}`} className={s.in} type="text" inputMode="decimal" autoComplete="off"
              value={text[f.key]} onChange={(ev) => set(f.key, ev.target.value)}
              aria-describedby={f.hint ? `${id}-${f.key}-h` : undefined}
            />
            {f.hint && <span id={`${id}-${f.key}-h`} className={s.fh}>{f.hint}</span>}
          </label>
        ))}
      </div>
      <div className={`${s.tile} ${s.mine}`} data-testid="your-plan-share" aria-live="polite">
        <p className={s.lbl}>Your share with your plan&rsquo;s own numbers (an estimate)</p>
        {any ? (
          <>
            <p className={s.num}>{usd(e.shareUsd, true)}</p>
            <p className={s.basis}>{planArithmetic(e, money)}</p>
            <p className={s.basis}>Your plan&rsquo;s part at Medicare&rsquo;s rate: {money(e.approvedUsd)} &minus; {money(e.shareUsd)} = {money(e.planPaysUsd)}</p>
          </>
        ) : <p className={s.basis}>Type at least one of your plan&rsquo;s numbers and your share is worked out here, line by line.</p>}
        <p className={s.basis}>An estimate from your own plan&rsquo;s numbers. Your plan&rsquo;s real allowed amounts can differ from Medicare&rsquo;s; this applies your terms to Medicare&rsquo;s published rate.</p>
      </div>
      {any && (
        <details className={s.how}>
          <summary>Each line under your plan&rsquo;s terms</summary>
          <table className={s.tbl}>
            <caption className="sr-only">Each Medicare line, its approved amount and the rule from your plan applied to it</caption>
            <thead><tr><th scope="col">Line</th><th scope="col" className={s.r}>Times</th><th scope="col" className={s.r}>Medicare-approved</th><th scope="col">Your plan&rsquo;s rule</th></tr></thead>
            <tbody>
              {e.lines.map((l) => (
                <tr key={l.key}>
                  <td>{l.label}</td><td className={s.r}>{l.times}</td><td className={s.r}>{money(l.approvedUsd)}</td>
                  <td>{l.rule === 'copay' ? `copay: ${money(l.copayTotalUsd)}` : l.rule === 'preventive' ? 'yearly screening: $0' : 'deductible, then coinsurance'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={s.small}>
            The deductible left this year ({money(e.deductibleLeftUsd)}) is met once across the lines without a copay, never per line. A copay is never more than the line&rsquo;s Medicare-approved amount.
            {e.capRoomUsd !== null ? ` The year stops at your out-of-pocket maximum${e.terms.deductibleMetUsd > 0 ? ', less what you already paid toward the deductible' : ''}.` : ' No out-of-pocket maximum typed, so no cap is applied.'}
            {' '}Premiums are not included. Out-of-network care can cost more.
          </p>
          {e.preventiveUsd > 0 && (
            <ul className={s.src}>
              <li>Yearly depression and alcohol misuse screenings: &ldquo;{PREVENTIVE_SOURCE.quote}.&rdquo; <a href={PREVENTIVE_SOURCE.url} target="_blank" rel="noopener noreferrer">HealthCare.gov</a></li>
            </ul>
          )}
        </details>
      )}
    </div>
  );
}

function MedicaidNote({ stateCode }: { stateCode?: string | null }) {
  const fs = medicaidFeeScheduleFor(stateCode);
  const pg = medicaidProgramFor(stateCode);
  return (
    <div className={`${s.tile} ${s.mine}`} data-testid="your-plan-medicaid">
      <p className={s.lbl}>With Medicaid, your state sets what you pay</p>
      <p className={s.basis}>
        What you pay under Medicaid is usually small, and your state sets it. No national file publishes your copay, so none is put here.
      </p>
      <ul className={s.src}>
        <li>&ldquo;{MEDICAID_SOURCE.quote}.&rdquo; &ldquo;{MEDICAID_SOURCE.quote2}.&rdquo; <a href={MEDICAID_SOURCE.url} target="_blank" rel="noopener noreferrer">Medicaid.gov</a></li>
        {fs ? (
          <li>{fs.stateName}&rsquo;s own Medicaid fee schedule ({fs.program}): <a href={fs.url} target="_blank" rel="noopener noreferrer">what {fs.program} pays providers</a></li>
        ) : pg ? (
          <li>{pg.stateName}&rsquo;s program is {pg.program}. Its fee schedule page could not be checked, so it is not linked here.</li>
        ) : (
          <li>Choose your state at the top of the ledger and this links your state&rsquo;s own Medicaid fee schedule where one is published.</li>
        )}
      </ul>
    </div>
  );
}

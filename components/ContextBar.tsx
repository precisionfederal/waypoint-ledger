'use client';
/* ==========================================================================
   THE CONTEXT BAR — the three questions that make a federal figure yours.

   Phillips's test is whether a published figure "does or doesn't closely tie
   with their circumstances." A tool that never asks cannot answer it. So the
   ledger asks three things and nothing else: what coverage you have, where you
   live, and what you are looking into. All three stay in this browser
   (localStorage, `waypoint-ledger.ctx.v1` and `waypoint-ledger.condition.v1`).
   None of them is sent with a correction, a share link or a saved ledger — a
   person's diagnosis in particular never leaves the device, which is why the
   condition is read client-side and is not in any URL.

   🔴 IT IS ASKED BEFORE THE NUMBER, NOT AFTER IT.
   The bar used to live only on the ledger, under the total — so a first-time
   visitor met "$1,275" labelled with Medicare figures that describe almost
   nobody this tool is built for, and had to know to go looking. It now opens
   the journey page, above the box you type in, and the ledger arrives already
   fitted. Two shapes, one component:
     · `ask`  — on /journey: the question, asked plainly, skippable.
     · `bar`  — on /ledger: once answered, one line and a Change button, so the
                first thing on a phone screen is the number, not a control.
   ========================================================================== */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { COVERAGE_LABEL, COVERAGE_OPTIONS, STATES, localityOf, soleLocality, type Coverage } from '@/lib/fit';
import s from './ContextBar.module.css';
import ConditionPicker from './ConditionPicker';

export interface ContextBarProps {
  /** `ask` opens the journey page; `bar` sits on the ledger. */
  variant?: 'ask' | 'bar';
}

export default function ContextBar({ variant = 'bar' }: ContextBarProps) {
  const st = useStore();
  const { coverage, locality } = st.ctx;
  const loc = localityOf(locality);
  const stateCode = loc?.state ?? '';
  const group = useMemo(() => STATES.find((g) => g.code === stateCode) ?? null, [stateCode]);
  const answered = !!(coverage || loc);
  /* Skipping is a real answer: it is remembered for this visit only, and the
     figures then say plainly, on every line, that they are national references. */
  const [skipped, setSkipped] = useState(false);
  const [open, setOpen] = useState(false);
  /* 🔴 ON THE LEDGER THE BAR IS ONE LINE, ANSWERED OR NOT.
     The ask belongs on /journey, before the number. On the ledger the full
     three-question panel — six coverage chips, a 54-option state select and ten
     condition chips — pushed the total to y = 1004 px in an 860 px viewport, so
     the count-up played where nobody could see it. One line above the number
     carries the same answer and expands to the same panel on one click; nothing
     is hidden, it is a click instead of a screen.
     The ask never folds itself away mid-answer: answering "who pays" used to
     collapse the panel before the second question could be reached. */
  const collapsed = !open && (skipped || variant === 'bar');

  function pickState(code: string) {
    if (!code) { st.setLocality(undefined); return; }
    const sole = soleLocality(code);
    const g = STATES.find((x) => x.code === code);
    st.setLocality((sole ?? g?.localities[0])?.key);
  }

  /* 🔴 THE CHIP NAMES THE BASIS EVEN WHEN NOBODY HAS ANSWERED.
     "This ledger is not fitted yet · Not answered" told a first-time visitor
     that something was missing without telling them what they were looking at.
     The honest default is a sentence: no coverage chosen, so these are the
     national Medicare reference figures — and the button beside it changes
     that in one tap. */
  const summary = answered
    ? `${coverage ? COVERAGE_LABEL[coverage] : 'National figures'}${loc ? ` · ${loc.displayName}` : ' · national figures'}`
    : 'No coverage chosen — Medicare reference figures, national';

  if (collapsed) {
    return (
      <section className={`${s.bar} ${s.collapsed} ctx-shell`} aria-labelledby="ctx-h">
        <p className={s.sumLine} id="ctx-h">
          <span className={s.sumLbl}>This ledger is fitted for</span>
          <b className={s.sumVal}>{summary}</b>
        </p>
        <button type="button" className={s.change} aria-expanded={false} onClick={() => setOpen(true)}>
          {answered ? 'Change' : 'Answer three questions'}
        </button>
      </section>
    );
  }

  const ask = variant === 'ask';

  return (
    <section className={`${s.bar} ${ask ? s.ask : ''} ctx-shell`} aria-labelledby="ctx-h">
      <div className={s.head}>
        {ask ? (
          <>
            <p className="eyebrow" id="ctx-h">Before the number</p>
            <p className={s.note}>
              Answer these three and every figure on your ledger arrives already labelled for you —
              whether it describes you, is a reference price, or describes nobody in your situation.
              All three stay on this device and are sent with nothing.
            </p>
          </>
        ) : (
          <>
            <p className="eyebrow" id="ctx-h">Who this ledger is for</p>
            <p className={s.note}>Change any answer and every row below re-labels. They stay on this device; none of them is sent with anything you send.</p>
            <button type="button" className={s.change} aria-expanded onClick={() => setOpen(false)}>Done</button>
          </>
        )}
      </div>

      <div className={s.groups}>
        <div className={s.group} role="group" aria-label="Your coverage">
          <p className={s.lbl} id="ctx-cov">{ask ? 'Who pays for your care?' : 'Your coverage'}</p>
          <div className={s.chips}>
            {COVERAGE_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                className={`${s.chip} ${coverage === o.key ? s.on : ''}`}
                aria-pressed={coverage === o.key}
                onClick={() => st.setCoverage(coverage === o.key ? undefined : (o.key as Coverage))}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className={s.group}>
          <p className={s.lbl}>{ask ? 'Where do you live?' : 'Where you live'}</p>
          <div className={s.selects}>
            <label className={s.field}>
              <span className="sr-only">State</span>
              <select value={stateCode} onChange={(e) => pickState(e.target.value)} aria-label="State">
                <option value="">National figures</option>
                {STATES.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
              </select>
            </label>
            {group && group.localities.length > 1 && (
              <label className={s.field}>
                <span className="sr-only">Medicare locality within {group.name}</span>
                <select value={locality ?? ''} onChange={(e) => st.setLocality(e.target.value || undefined)} aria-label={`Medicare locality within ${group.name}`}>
                  {group.localities.map((l) => <option key={l.key} value={l.key}>{l.displayName}</option>)}
                </select>
              </label>
            )}
          </div>
          {group && group.localities.length > 1 && (
            <p className={s.hint}>CMS prices {group.name} in {group.localities.length} localities. Pick yours.</p>
          )}
        </div>

        <ConditionPicker heading={ask ? 'What are you looking into?' : 'What you are looking into'} />
      </div>

      {(coverage || loc) && (
        <p className={s.relabelRow}>
          <span className="ctx-relabel" role="status" aria-live="polite">
            Re-labelled for {coverage ? COVERAGE_LABEL[coverage] : 'national figures'}{loc ? ` · ${loc.displayName}` : ''}
          </span>
          {ask && <Link className={s.go} href="/ledger">See what it cost →</Link>}
        </p>
      )}

      {ask && !answered && (
        <p className={s.skipRow}>
          <button type="button" className={s.skip} onClick={() => setSkipped(true)}>Skip this</button>
          <span className={s.skipNote}>
            You will still get every figure. They will be national Medicare amounts, and each line
            will say so rather than pretend it is yours.
          </span>
        </p>
      )}
    </section>
  );
}

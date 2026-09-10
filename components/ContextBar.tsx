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

   🔴 IT IS ONE LINE UNTIL SOMEBODY WANTS IT.
   Round after round the questionnaire opened first: three columns, six coverage
   chips, a 54-option state select and ten condition chips stood between a person
   and the box they came to type in, and a band reading "THIS LEDGER IS FITTED
   FOR …" sat on top of the largest number on the site. Nothing here was wrong;
   it was simply asked before anyone had a reason to care.

   So every surface now opens as ONE quiet line that states the basis the
   figures are on, with Change beside it. Clicking Change expands the same three
   questions in place — every chip, every note, every stored answer, unchanged.
   Nothing is hidden; it is a click instead of a screen.
     · `ask`  — under the box on /journey: "Priced as … · Change".
     · `line` — under the number on /ledger, in small type: "… · Change".
     · `bar`  — the legacy card shape, kept for any surface still asking for it.
   ========================================================================== */

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { COVERAGE_LABEL, COVERAGE_OPTIONS, STATES, localityOf, soleLocality, type Coverage } from '@/lib/fit';
import type { StateDetection } from '@/lib/state-detect';
import s from './ContextBar.module.css';
import ConditionPicker from './ConditionPicker';

export interface ContextBarProps {
  /** `ask` sits under the journey box; `line` under the ledger's number; `bar` is the card shape. */
  variant?: 'ask' | 'bar' | 'line';
  /* 🔴 WHERE YOU LIVE IS USUALLY ALREADY IN THE SENTENCE.
     "I live in Houston" is a person answering the second question before it is
     asked, and making them find a 54-option select to say it again is the
     tool's problem, not theirs. `lib/state-detect.ts` reads the place out of
     the story deterministically, in this browser, and hands it here with the
     exact words it read. Three things keep that honest: the phrase is shown
     back, one click changes it, and a word that is two places at once
     ("Washington", "Kansas City") arrives as a QUESTION, never as an answer. */
  detected?: StateDetection | null;
}

export default function ContextBar({ variant = 'bar', detected = null }: ContextBarProps) {
  const st = useStore();
  const { coverage, locality } = st.ctx;
  const loc = localityOf(locality);
  const setLocality = st.setLocality;

  /* What the story said, and whether we may act on it. `fromStory` is the
     locality this component set from the person's own words; the moment they
     touch a select themselves, the story stops overriding anything. */
  const readState = detected?.state ?? null;
  const placeQuestion = detected?.ask ?? null;
  const fromStory = useRef<string | null>(null);
  const theyPicked = useRef(false);
  const [narrowedTo, setNarrowedTo] = useState<string | null>(null);

  useEffect(() => {
    if (!st.hydrated || theyPicked.current || !readState) return;
    if (readState.locality) {
      // Never write over an answer somebody gave; only over our own earlier read.
      if (locality && locality !== fromStory.current) return;
      setNarrowedTo(readState.code);
      if (locality === readState.locality) return;
      fromStory.current = readState.locality;
      setLocality(readState.locality);
      return;
    }
    /* CMS prices this state in more than one place and the story did not say
       which. The picker opens on that state; the figures stay national until
       the person picks, because guessing a locality is guessing a price. */
    if (!locality) setNarrowedTo(readState.code);
  }, [st.hydrated, readState, locality, setLocality]);

  const stateCode = loc?.state ?? narrowedTo ?? '';
  const group = useMemo(() => STATES.find((g) => g.code === stateCode) ?? null, [stateCode]);
  const readIt = !!(readState && loc && fromStory.current === loc.key);
  const waitingOnArea = !!(readState && !loc && narrowedTo);
  const answered = !!(coverage || loc);
  /* Closed is the resting state on every surface. Skipping and pressing Done
     are the same gesture as never opening it: the figures then say plainly, on
     every line, that they are national references. */
  const [open, setOpen] = useState(false);
  const collapsed = !open;

  function pickState(code: string) {
    theyPicked.current = true;
    setNarrowedTo(code || null);
    if (!code) { setLocality(undefined); return; }
    const sole = soleLocality(code);
    const g = STATES.find((x) => x.code === code);
    setLocality((sole ?? g?.localities[0])?.key);
  }

  /** They answered the "which Washington?" question themselves. */
  function answerPlace(c: { code: string; locality?: string }) {
    theyPicked.current = true;
    setNarrowedTo(c.code);
    if (c.locality) { setLocality(c.locality); return; }
    setLocality(undefined);
    setOpen(true);
  }

  /* 🔴 THE LINE NAMES THE BASIS EVEN WHEN NOBODY HAS ANSWERED.
     "This ledger is not fitted yet · Not answered" told a first-time visitor
     that something was missing without telling them what they were looking at,
     and "say who pays for your care and this changes" put a to-do item where a
     meaning belongs. The honest default is the basis itself — these are the
     national Medicare reference figures — and Change beside it. */
  /* 🔴 "National figures · Houston" is a contradiction, and it became the
     common case the moment the story started setting the locality: once CMS's
     Houston amount is on the page the figures are NOT national. With no
     coverage answered the honest label for the basis is the schedule itself. */
  const summary = answered
    ? `${coverage ? COVERAGE_LABEL[coverage] : loc ? 'Medicare reference' : 'National figures'}${loc ? ` · ${loc.displayName}` : ' · national figures'}`
    : variant === 'ask' ? 'Medicare reference figures, national' : 'Medicare reference · national';

  /* The question a two-place word asks, put in one line rather than guessed.
     It is the same shape as "· Change", so it reads as part of the line. */
  const placeChoice = placeQuestion && !loc && !theyPicked.current ? (
    <span className={s.fitTxt}>
      You wrote &ldquo;{placeQuestion.phrase}&rdquo; &mdash; which one?
      {placeQuestion.candidates.map((c) => (
        <Fragment key={c.code}>
          {' '}
          <button type="button" className={s.fitChange} onClick={() => answerPlace(c)}>
            {c.code === 'DC' ? 'Washington, D.C.' : c.stateName}
          </button>
        </Fragment>
      ))}
    </span>
  ) : null;

  if (collapsed) {
    const cls = variant === 'ask' ? s.fitLineAsk : variant === 'line' ? s.fitLineNum : s.fitLineBar;
    return (
      <p className={`${s.fitLine} ${cls}`} id="ctx-h">
        <span className={s.fitTxt}>{variant === 'ask' ? 'Priced as ' : ''}{summary}</span>
        {readIt && (
          <span className={s.fitTxt} data-read-from={readState!.phrase}>
            read from &ldquo;{readState!.phrase}&rdquo; in what you typed
          </span>
        )}
        {waitingOnArea && (
          <span className={s.fitTxt} data-read-from={readState!.phrase}>
            you wrote &ldquo;{readState!.phrase}&rdquo; &mdash; CMS prices {readState!.stateName} in{' '}
            {group?.localities.length ?? 0} areas
          </span>
        )}
        {placeChoice}
        <button
          type="button"
          className={s.fitChange}
          aria-expanded={false}
          title="Your coverage, where you live, and what you are looking into"
          aria-label="Change what these figures are priced for: your coverage, where you live, and what you are looking into"
          onClick={() => setOpen(true)}
        >
          {waitingOnArea ? 'Pick your area' : 'Change'}
        </button>
      </p>
    );
  }

  const ask = variant === 'ask';

  return (
    <section className={`${s.bar} ${ask ? s.ask : ''} ctx-shell`} aria-labelledby="ctx-h">
      <div className={s.head}>
        <p className="eyebrow" id="ctx-h">{ask ? 'Before the number' : 'Who this ledger is for'}</p>
        <p className={s.note}>
          {ask
            ? 'Answer these three and every figure on your ledger arrives already labelled for you — whether it describes you, is a reference price, or describes nobody in your situation. All three stay on this device and are sent with nothing.'
            : 'Change any answer and every row below re-labels. They stay on this device; none of them is sent with anything you send.'}
        </p>
        <button type="button" className={s.change} aria-expanded onClick={() => setOpen(false)}>Done</button>
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
          {readIt && (
            <p className={s.hint}>
              Read from what you typed: &ldquo;{readState!.phrase}&rdquo;. Change it and every figure re-labels.
            </p>
          )}
          {placeQuestion && !loc && !theyPicked.current && (
            <p className={s.hint}>
              {placeQuestion.why} You wrote &ldquo;{placeQuestion.phrase}&rdquo;, so nothing is assumed.
            </p>
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
          <button type="button" className={s.skip} onClick={() => setOpen(false)}>Skip this</button>
          <span className={s.skipNote}>
            You will still get every figure. They will be national Medicare amounts, and each line
            will say so rather than pretend it is yours.
          </span>
        </p>
      )}
    </section>
  );
}

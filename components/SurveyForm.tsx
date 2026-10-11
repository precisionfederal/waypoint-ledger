'use client';

/* ==========================================================================
   THE SURVEY — six questions, two minutes, one shareable link.
   /survey?c=<channel> records the recruitment channel so the published sample
   says where it came from. Ranking is done by tapping in order, heaviest first.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from '@/components/IntentLink';
import FinePrint from '@/components/FinePrint';
import { Aside } from './LongSection';
import './FormCards.css';
import { ART, PanelCode, Spot, ThanksMoment, Waypoints, useFlip, useRegisterCounts } from './ContribKit';
import { IconNew } from './IconsNew';

/* The art lane's burden marks (components/IconsNew.tsx), one per burden id, on
   the ranking cards. Decorative: the label beside each names it. */
const BURDEN_ICON: Record<string, (p: { size?: number }) => React.ReactNode> = {
  oop: IconNew.Money, time: IconNew.Time, work: IconNew.WorkMissed, unpaid: IconNew.UnpaidCare, forgone: IconNew.WentWithout,
};
function BurdenMark({ id }: { id: string }) {
  const I = BURDEN_ICON[id];
  return I ? <span className="rank-ico">{I({ size: 20 })}</span> : null;
}
import { normalizeChannel } from '@/lib/survey-def';
import { insuranceChoices } from '@/lib/survey-def';
import { BURDEN_IDS, DECIDERS, DECIDER_IDS, CONTEXT, CONTEXT_KEYS, SURVEY_VERSION, SMALL_CELL_MIN, SEX_POLICY, SEX_POLICY_URL, RESPONDENT_SELF, RESPONDENT_CHILD, ONSET_KEYS, burdensFor, questionsFor, type BurdenId, type DeciderId, type ContextKey } from '@/lib/survey';

/* 🔴 A HALF-ANSWERED SURVEY SURVIVES A RELOAD (FLOW contrib-5). The same
   pattern as the written interview: held for this tab only (sessionStorage),
   written half a second after each change, cleared the moment it is sent or the
   person presses Start fresh. The one-sentence note is never held: the server
   encrypts it and never serves it, so it is not left lying in a browser either.
   Every value is checked against the instrument on the way back in. */
export const SURVEY_DRAFT_KEY = 'waypoint.survey.draft';
export type SurveyDraft = {
  ranking: BurdenId[]; unasked: BurdenId | 'all-asked' | ''; lead: BurdenId | ''; decide: DeciderId | '';
  clinicians: string; context: Partial<Record<ContextKey, string>>;
};
export function cleanSurveyDraft(raw: unknown): SurveyDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const isB = (v: unknown): v is BurdenId => typeof v === 'string' && (BURDEN_IDS as string[]).includes(v);
  const ranking = Array.isArray(d.ranking) ? d.ranking.filter((x, i, a) => isB(x) && a.indexOf(x) === i).slice(0, 5) as BurdenId[] : [];
  const unasked: SurveyDraft['unasked'] = d.unasked === 'all-asked' || isB(d.unasked) ? d.unasked as BurdenId | 'all-asked' : '';
  const lead: SurveyDraft['lead'] = isB(d.lead) ? d.lead : '';
  const decide: SurveyDraft['decide'] = typeof d.decide === 'string' && (DECIDER_IDS as string[]).includes(d.decide) ? d.decide as DeciderId : '';
  const clinicians = typeof d.clinicians === 'string' && /^\d{0,2}$/.test(d.clinicians) ? d.clinicians : '';
  const context: Partial<Record<ContextKey, string>> = {};
  if (d.context && typeof d.context === 'object') {
    for (const [k, v] of Object.entries(d.context as Record<string, unknown>)) {
      if ((CONTEXT_KEYS as string[]).includes(k) && typeof v === 'string' && (CONTEXT[k as ContextKey].options as string[]).includes(v)) context[k as ContextKey] = v;
    }
  }
  const out: SurveyDraft = { ranking, unasked, lead, decide, clinicians, context };
  return surveyDraftIsEmpty(out) ? null : out;
}
export function surveyDraftIsEmpty(d: SurveyDraft): boolean {
  return !d.ranking.length && !d.unasked && !d.lead && !d.decide && !d.clinicians && !Object.keys(d.context).length;
}
function readSurveyDraft(): SurveyDraft | null {
  try { const raw = sessionStorage.getItem(SURVEY_DRAFT_KEY); return raw ? cleanSurveyDraft(JSON.parse(raw)) : null; } catch { return null; }
}
function writeSurveyDraft(d: SurveyDraft | null) {
  try {
    if (!d || surveyDraftIsEmpty(d)) sessionStorage.removeItem(SURVEY_DRAFT_KEY);
    else sessionStorage.setItem(SURVEY_DRAFT_KEY, JSON.stringify(d));
  } catch { /* private mode: the form still works, it just forgets */ }
}

/* flow3-9: when the thank-you replaces the form, its heading ("Recorded") takes focus,
   so a screen reader hears it and focus does not fall to BODY. A stable callback ref:
   it runs once, when the heading mounts. */
const focusOnMount = (el: HTMLElement | null) => { if (el) requestAnimationFrame(() => el.focus({ preventScroll: true })); };

export default function SurveyForm() {
  const [ranking, setRanking] = useState<BurdenId[]>([]);
  const [unasked, setUnasked] = useState<BurdenId | 'all-asked' | ''>('');
  const [lead, setLead] = useState<BurdenId | ''>('');
  const [decide, setDecide] = useState<DeciderId | ''>('');
  const [clinicians, setClinicians] = useState('');
  const [context, setContext] = useState<Partial<Record<ContextKey, string>>>({});
  const [sentence, setSentence] = useState('');
  const [channel, setChannel] = useState('direct');
  /* What the link actually said, when it said something other than the slug it is
     counted under, so the thank-you can say so instead of counting it in silence. */
  const [channelAsTyped, setChannelAsTyped] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [err, setErr] = useState<string | null>(null);
  /* Present only for a paid research-panel answer with the code configured server-side. */
  const [completionCode, setCompletionCode] = useState<string | null>(null);
  /* Keyboard and screen-reader users (round 3, access): a ranked chip leaves the
     pool, so focus used to fall to <body> on every press. The last press is kept
     here so focus can follow it, and the live line says what just happened. */
  const rankRef = useRef<HTMLFieldSetElement>(null);
  const lastTap = useRef<{ id: BurdenId; added: boolean } | null>(null);
  const [rankSaid, setRankSaid] = useState('');
  const [pressedEarly, setPressedEarly] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  /* VISUAL: a ranked card glides to its place (ContribKit useFlip). */
  const snapshot = useFlip(rankRef, [ranking]);
  /* The thank-you reads the register's own count once the answer is in. */
  const counts = useRegisterCounts(state === 'sent');

  useEffect(() => {
    const d = readSurveyDraft();
    if (d) {
      setRanking(d.ranking); setUnasked(d.unasked); setLead(d.lead); setDecide(d.decide);
      setClinicians(d.clinicians); setContext(d.context); setRestoredDraft(true);
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded || state === 'sent') return;
    const t = setTimeout(() => writeSurveyDraft({ ranking, unasked, lead, decide, clinicians, context }), 500);
    return () => clearTimeout(t);
  }, [ranking, unasked, lead, decide, clinicians, context, loaded, state]);

  function startFresh() {
    writeSurveyDraft(null);
    setRanking([]); setUnasked(''); setLead(''); setDecide(''); setClinicians(''); setContext({});
    setRestoredDraft(false); setPressedEarly(false); setRankSaid('');
  }

  useEffect(() => {
    try {
      const c = new URLSearchParams(window.location.search).get('c');
      if (c !== null) {
        const slug = normalizeChannel(c);
        if (slug) setChannel(slug);
        if (slug !== c) setChannelAsTyped(c.slice(0, 60));
      }
    } catch { /* ignore */ }
  }, []);

  /* 🔴 A CHILD'S ILLNESS IS CARRIED BY THE FAMILY. A parent or caregiver
     answering for a child sees the same five burdens, with the same ids, worded
     for the family that carried them. Nothing else about the answer changes. */
  const forChild = context.respondent === RESPONDENT_CHILD;
  const BURDENS = burdensFor(context.respondent);
  const QUESTIONS = questionsFor(context.respondent);
  const complete = ranking.length === 5 && unasked && lead && decide;
  const doneCount = [ranking.length === 5, Boolean(unasked), Boolean(lead), Boolean(decide)].filter(Boolean).length;
  const nextRank = ranking.length + 1;
  const remaining = useMemo(() => BURDENS.filter((b) => !ranking.includes(b.id as BurdenId)), [ranking, BURDENS]);

  /* FLOW contrib-8: a ranked burden moves one place with an arrow, so fixing
     number 2 no longer means taking out and re-tapping four of them. */
  function move(id: BurdenId, by: -1 | 1) {
    const i = ranking.indexOf(id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= ranking.length) return;
    const next = ranking.slice();
    [next[i], next[j]] = [next[j], next[i]];
    snapshot();
    setRanking(next);
    const label = BURDENS.find((b) => b.id === id)?.label ?? '';
    setRankSaid(`Moved ${label} to ${j + 1} of 5.`);
    requestAnimationFrame(() => {
      const box = rankRef.current;
      const btn = box?.querySelector<HTMLButtonElement>(`.rank-picked [data-move="${id}:${by}"]`);
      (btn && !btn.disabled ? btn : box?.querySelector<HTMLButtonElement>(`.rank-picked [data-move="${id}:${-by}"]`))?.focus();
    });
  }

  function tap(id: BurdenId) {
    const added = !ranking.includes(id);
    if (added && ranking.length >= 5) return;
    lastTap.current = { id, added };
    snapshot();
    setRanking((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 5 ? [...p, id] : p));
  }

  /* After a tap: focus the next unranked choice, or, when all five are placed, the
     one just ranked; after an undo, the same burden back in the pool. */
  useEffect(() => {
    const t = lastTap.current;
    const box = rankRef.current;
    if (!t || !box) return;
    lastTap.current = null;
    const label = BURDENS.find((b) => b.id === t.id)?.label ?? '';
    if (t.added) {
      setRankSaid(`Ranked ${ranking.indexOf(t.id) + 1} of 5: ${label}.`);
      const next = box.querySelector<HTMLButtonElement>('.rank-pool button') ?? box.querySelector<HTMLButtonElement>(`.rank-picked button[data-id="${t.id}"]`);
      next?.focus();
    } else {
      setRankSaid(`Took out ${label}. ${ranking.length} of 5 ranked.`);
      box.querySelector<HTMLButtonElement>(`.rank-pool button[data-id="${t.id}"]`)?.focus();
    }
  }, [ranking, BURDENS]);

  /* What is still missing, said in words and tied to the button, so a press
     before the form is ready tells the person exactly what to answer. */
  const missing: { n: number; text: string }[] = [];
  if (ranking.length < 5) missing.push({ n: 1, text: `rank all five in question 1 (${ranking.length} of 5 so far)` });
  if (!unasked) missing.push({ n: 2, text: 'answer question 2' });
  if (!lead) missing.push({ n: 3, text: 'answer question 3' });
  if (!decide) missing.push({ n: 4, text: 'answer question 4' });
  const missingText = missing.length ? `Still to do: ${missing.map((m) => m.text).join(', ')}.` : '';

  function pressSend() {
    if (state === 'sending') return;
    if (!complete) {
      /* FLOW contrib-10: the list of what is missing appears in the sticky
         progress card, which stays on screen, and focus goes to the first
         unanswered question itself (its card), never to one of its choices,
         whose focus ring would read as a selection. */
      /* FLOW access-5: the question can be far above the screen, so it is
         scrolled into view first (smoothly, unless the person asked for reduced
         motion), and only then focused, without a second jump. */
      setPressedEarly(true);
      const first = missing[0]?.n;
      const box = first ? document.querySelector<HTMLFieldSetElement>(`[data-q="${first}"]`) : null;
      if (box) {
        const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        box.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
        box.focus({ preventScroll: true });
      }
      return;
    }
    send();
  }

  async function send() {
    setState('sending'); setErr(null);
    try {
      const res = await fetch('/api/survey', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ranking, unasked, lead, decide, clinicians: clinicians === '' ? null : Number(clinicians), context, sentence: sentence.trim() || undefined, channel, surveyVersion: SURVEY_VERSION }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'The response was not saved.');
      if (typeof j.completionCode === 'string' && j.completionCode) setCompletionCode(j.completionCode);
      writeSurveyDraft(null);
      /* Read by the written interview's thank-you (InterviewForm SURVEY_SENT_KEY), so
         it does not ask this person to rank the burdens again (FLOW contrib-12). */
      try { sessionStorage.setItem('waypoint.survey.sent', '1'); } catch { /* blocked */ }
      setState('sent');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The response was not saved.');
      setState('idle');
    }
  }

  if (state === 'sent') {
    return (
      <section className="step survey fc fc-done">
        <div className="wrap narrow">
          <ThanksMoment
            headingRef={focusOnMount}
            eyebrow="Recorded"
            title="Thank you. Your ranking is now part of the count."
            sub={<>
              Your answer counted. It is published as a frequency distribution with everyone else&rsquo;s, with the number of answers and where they
              came from. Nothing in it identifies you.
            </>}
            count={counts?.survey ?? null}
            countLabel={(n) => (n === 1 ? 'answer in the survey count: yours' : 'answers in the survey count, yours among them')}
            art={ART.thanks}
            notice={<PanelCode code={completionCode} />}
          />
          <div className="ty-grid">
          {/* FLOW contrib-9: what the register will show from this answer, and where. */}
          <div className="survey-shows" data-testid="survey-shows">
            <h2>What the live register will show from it</h2>
            <ul>
              <li>One more answer in the survey count, and your order of the five burdens in the ranking beside everyone else&rsquo;s.</li>
              <li>Your ranking and your three answers in the open CSV, with the day it arrived and never the time.</li>
              <li>What you said about yourself only as counts, and only where at least {SMALL_CELL_MIN} answers give the same one.</li>
              {forChild && <li>Answers about a child are read as their own group, so they never reshape the adult answers. The group is shown once it holds {SMALL_CELL_MIN} answers.</li>}
              {channel !== 'direct' && (
                <li>Answers that came through the &ldquo;{channel}&rdquo; link are also counted on their own page:{' '}
                  <Link href={`/register/channel?c=${encodeURIComponent(channel)}`}>see that link&rsquo;s count</Link>.</li>
              )}
            </ul>
            <p><Link href="/register/live">See your answer counted on the live register</Link></p>
          </div>
          {channelAsTyped !== null && (
            <p className="micro" data-testid="channel-note">
              {channel === 'direct'
                ? <>The link you followed carried the label &ldquo;{channelAsTyped}&rdquo;, which we could not read, so your answer is counted as a direct answer.</>
                : <>The link you followed carried the label &ldquo;{channelAsTyped}&rdquo;. Your answer is counted under &ldquo;{channel}&rdquo;.</>}
            </p>
          )}
          <div className="survey-next" data-testid="interview-invite">
            <h2>Ten more minutes? The written interview helps us most.</h2>
            <p>
              Ten questions about your search, answered in your own words. They tell us what a ranking cannot.
            </p>
            <Link className="btn primary" href={`/interview?c=${encodeURIComponent(channel)}${forChild ? '&r=carer' : ''}`}>Answer the written interview</Link>
          </div>
          </div>
          <div className="step-actions ty-onward">
            <Link className="btn ghost" href="/register/live">See the register</Link>
            <Link className="btn ghost" href="/journey">{forChild ? 'Price the search' : 'Price your own journey'}</Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="step survey fc">
      <div className="wrap narrow">
        <header className="fc-head">
          <div className="fc-head-copy">
            <p className="eyebrow">Four required questions, about two minutes; the rest are optional</p>
            <h1>Which cost of looking for a diagnosis weighed most?</h1>
            <p className="sub">
              Rank the five burdens. Nothing here identifies you.
            </p>
          </div>
          <Spot art={ART.survey} className="fc-hero" eager />
        </header>

        {/* PAGES DETAIL (2026-09-30): a visible progress line over the four
            questions the count needs. It counts, it asks nothing. */}
        {/* FLOW4 flow4-8: an organization's link says so before the first
            question, so the advocate testing it and her members can see it worked. */}
        {channel !== 'direct' && (
          <p className="micro fc-channel" data-testid="channel-before">
            Your answer is counted with the answers that came through the link labelled &ldquo;{channel}&rdquo;.
          </p>
        )}
        {restoredDraft && (
          <p className="fc-restored" role="status" data-testid="survey-restored">
            <span>Restored your answers from earlier in this tab.</span>
            <button type="button" className="btn ghost small" onClick={startFresh}>Start fresh</button>
          </p>
        )}

        <div className="fc-progress" data-testid="survey-progress">
          <p className="fc-progress-t"><b>{doneCount} of 4</b> required questions answered</p>
          <div className="fc-wp" role="progressbar" aria-label="Required questions answered" aria-valuemin={0} aria-valuemax={4} aria-valuenow={doneCount}>
            <Waypoints done={[ranking.length === 5, Boolean(unasked), Boolean(lead), Boolean(decide)]} />
          </div>
          <p className="fc-still" role="alert" data-testid="survey-still" hidden={!(pressedEarly && !complete)}>{pressedEarly && !complete ? missingText : ''}</p>
        </div>

        {/* Asked first because it changes the wording of everything below it.
            Optional: leaving it alone is recorded as "not stated". */}
        <fieldset className="q" data-testid="respondent">
          <legend>Who is answering? <span className="micro">optional</span></legend>
          <div className="choice-grid">
            {[RESPONDENT_SELF, RESPONDENT_CHILD].map((o) => (
              <Choice key={o} name="respondent" value={o} label={o} checked={context.respondent === o}
                      onChange={() => setContext((p) => ({ ...p, respondent: p.respondent === o ? undefined : o }))} />
            ))}
          </div>
          <p className="micro">
            {forChild
              ? 'From here on, “the child” means the person who was ill. The questions below are worded for you and the family: count what the search cost you, not only the child. Your own age, further down, is yours.'
              : 'If the illness began in childhood and you are answering for a child you care for, choose the second, and the questions below are worded for the family that carried the cost.'}
          </p>
        </fieldset>

        <fieldset className="q q-rank" ref={rankRef} data-q="1" tabIndex={-1} data-done={ranking.length === 5 || undefined}>
          <legend><span className="q-n">1</span>{QUESTIONS.rank}</legend>
          <p className="micro">Tap them in order. First tap is the heaviest. Tap a ranked one to take it out; use the arrows to move it.</p>
          <p className="sr-only" aria-live="polite" data-testid="rank-said">{rankSaid}</p>
          <div className="rank-board">
          <div className="rank-order">
          <p className="rank-end" aria-hidden="true">Heaviest</p>
          <ol className="rank-picked">
            {ranking.map((id, i) => {
              const b = BURDENS.find((x) => x.id === id)!;
              return (
                <li key={id} data-flip={id}>
                  <button type="button" className="rank-chip on" data-id={id} onClick={() => tap(id)} aria-pressed="true"><span className="rank-n">{i + 1}</span><BurdenMark id={id} />{b.label}</button>
                  <button type="button" className="rank-move" data-move={`${id}:-1`} disabled={i === 0} onClick={() => move(id, -1)}
                    aria-label={i === 0 ? `${b.label} is already first` : `Move ${b.label} up to ${i}`}><span aria-hidden="true">&uarr;</span></button>
                  <button type="button" className="rank-move" data-move={`${id}:1`} disabled={i === ranking.length - 1} onClick={() => move(id, 1)}
                    aria-label={i === ranking.length - 1 ? `${b.label} is already last` : `Move ${b.label} down to ${i + 2}`}><span aria-hidden="true">&darr;</span></button>
                </li>
              );
            })}
          </ol>
          {/* The places still open, drawn as empty slots so the five read as one scale. Decorative. */}
          {ranking.length < 5 && (
            <ol className="rank-slots" aria-hidden="true" start={nextRank}>
              {Array.from({ length: 5 - ranking.length }, (_, k) => <li key={nextRank + k}><span className="rank-n">{nextRank + k}</span></li>)}
            </ol>
          )}
          <p className="rank-end" aria-hidden="true">Lightest</p>
          </div>
          {remaining.length > 0 && (
            <div className="rank-pool">
              <p className="micro">{ranking.length === 0 ? 'Heaviest first:' : `Next, number ${nextRank}:`}</p>
              {remaining.map((b) => (
                <button key={b.id} type="button" className="rank-chip" data-id={b.id} data-flip={b.id} onClick={() => tap(b.id as BurdenId)} aria-pressed="false"><BurdenMark id={b.id} />{b.label}</button>
              ))}
            </div>
          )}
          </div>
        </fieldset>

        <fieldset className="q" data-q="2" tabIndex={-1} data-done={Boolean(unasked) || undefined}>
          <legend><span className="q-n">2</span>{QUESTIONS.unasked}</legend>
          <div className="choice-grid">
            {BURDENS.map((b) => <Choice key={b.id} name="unasked" value={b.id} label={b.label} checked={unasked === b.id} onChange={() => setUnasked(b.id as BurdenId)} />)}
            <Choice name="unasked" value="all-asked" label="Someone asked about all of them" checked={unasked === 'all-asked'} onChange={() => setUnasked('all-asked')} />
          </div>
        </fieldset>

        <fieldset className="q" data-q="3" tabIndex={-1} data-done={Boolean(lead) || undefined}>
          <legend><span className="q-n">3</span>{QUESTIONS.lead}</legend>
          <div className="choice-grid">
            {BURDENS.map((b) => <Choice key={b.id} name="lead" value={b.id} label={b.label} checked={lead === b.id} onChange={() => setLead(b.id as BurdenId)} />)}
          </div>
        </fieldset>

        <fieldset className="q" data-q="4" tabIndex={-1} data-done={Boolean(decide) || undefined}>
          <legend><span className="q-n">4</span>{QUESTIONS.decide}</legend>
          <div className="choice-grid">
            {DECIDERS.map((d) => <Choice key={d.id} name="decide" value={d.id} label={d.label} checked={decide === d.id} onChange={() => setDecide(d.id as DeciderId)} />)}
          </div>
        </fieldset>

        <fieldset className="q">
          <legend><span className="q-n">5</span>{QUESTIONS.clinicians}</legend>
          <label className="q-num">
            <input type="number" min={0} max={99} inputMode="numeric" value={clinicians} placeholder="0" onChange={(e) => setClinicians(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} />
            <span>clinicians</span>
          </label>
        </fieldset>

        {/* Q6 — asked on the face of the form, not inside the disclosure below.
            The Federal Sprint Lead for the Invisible Illness track asked every
            team on 26 August 2026 to be intentional about sex differences where
            relevant; an ask answered inside a collapsed panel is not an answer.
            Optional like every context field: "Prefer not to say" is recorded as
            the stated answer it is, and leaving it alone is recorded as
            "not stated". Neither is ever filled in for you. */}
        <fieldset className="q q-sex">
          <legend><span className="q-n">6</span>{forChild ? 'The child’s sex' : CONTEXT.sex.label} <span className="micro">optional</span></legend>
          <FinePrint label="Why we ask about sex"><p>
            Asked because the federal prevalence files we cite are published by sex, and because NIH expects sex to be accounted for
            as a biological variable in the research it funds:{' '}
            <a href={SEX_POLICY_URL} target="_blank" rel="noopener noreferrer">{SEX_POLICY}</a>. It is published only as a count.
            Where a federal file is silent on sex, <Link href="/method#sex">/method</Link> says so.
          </p></FinePrint>
          <div className="choice-grid">
            {CONTEXT.sex.options.map((o: string) => (
              <Choice key={o} name="sex" value={o} label={o} checked={context.sex === o}
                      onChange={() => setContext((p) => ({ ...p, sex: p.sex === o ? undefined : o }))} />
            ))}
          </div>
          <p className="micro">
            Published on <Link href="/register">the register</Link> only where at least {SMALL_CELL_MIN} answers give the same one,
            under the same rule as the state. Below that it is withheld and the withholding is counted in public.
          </p>
        </fieldset>

        {/* Q7 — when it began. On the face of the form, with bands below 18,
            because an instrument that only offers adult ages tells a person who
            fell ill at eleven that the survey is not for them. */}
        <fieldset className="q" data-testid="onset">
          <legend><span className="q-n">7</span>{forChild ? 'When did it begin for the child, and when was it given a name?' : 'When did it begin, and when was it given a name?'} <span className="micro">optional</span></legend>
          <div className="ctx-grid">
            {(['onset_age', 'diagnosis_age'] as ContextKey[]).map((k) => (
              <label key={k} className="field">
                <span>{forChild ? CONTEXT[k].label.replace('Age when', 'The child’s age when') : CONTEXT[k].label}</span>
                <select value={context[k] ?? ''} onChange={(e) => setContext((p) => ({ ...p, [k]: e.target.value || undefined }))}>
                  <option value="">Prefer not to say</option>
                  {CONTEXT[k].options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                {forChild && k === 'onset_age' && <span className="micro">The child can be an adult child.</span>}
              </label>
            ))}
          </div>
          <p className="micro">
            An illness that began before 18 is read as its own group on <Link href="/register/live">the register</Link>, so it never quietly reshapes the adult-onset answers,
            and a group is published only once it holds at least {SMALL_CELL_MIN} answers.
          </p>
        </fieldset>

        <details className="q q-optional">
          <summary>Optional: who you are, so the sample can say who it covers</summary>
          <p className="micro">Used only to publish who answered and who did not. Leave any of these blank.</p>
          <div className="ctx-grid">
            {(CONTEXT_KEYS as ContextKey[]).filter((k) => k !== 'sex' && !(ONSET_KEYS as string[]).includes(k)).map((k) => (
              <label key={k} className="field">
                <span>{CONTEXT[k].label}</span>
                <select value={context[k] ?? ''} onChange={(e) => setContext((p) => ({ ...p, [k]: e.target.value || undefined }))}>
                  <option value="">Prefer not to say</option>
                  {k === 'insurance'
                    ? insuranceChoices(forChild).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
                    : CONTEXT[k].options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className="micro">
            Your state is published on <Link href="/register">the register</Link> only where at least {SMALL_CELL_MIN} answers name the same one.
            Below that it is withheld, and the withholding is counted in public, so a small count can never point at a person.
          </p>
          <label className="field">
            <span>One sentence on what the search cost you (optional, held privately, never published word for word)</span>
            <textarea rows={2} maxLength={280} value={sentence} onChange={(e) => setSentence(e.target.value)} placeholder="Only if you want to." />
          </label>
        </details>

        {err && <p className="match-note miss" role="alert">{err}</p>}

        <div className="step-actions">
          {/* Focusable while incomplete (aria-disabled, never disabled), so a
              keyboard sweep reaches it and a press says what is missing. */}
          <button type="button" className="btn primary lg" aria-disabled={!complete || state === 'sending'}
                  aria-describedby={complete || pressedEarly ? undefined : 'survey-missing'}
                  style={!complete || state === 'sending' ? { opacity: 0.55 } : undefined} onClick={pressSend}>
            {state === 'sending' ? 'Sending…' : 'Add my ranking to the count'}
          </button>
          {!complete && <p className="micro" id="survey-missing">{missingText}</p>}
        </div>
        <Aside summary="Why we ask">
          <p>
            Federal cost studies decide how to weigh money, time and lost work by analyst judgment. We are
            asking those who carried it. Everything you answer is published only as a count, alongside
            the number of answers and where they came from.
          </p>
        </Aside>
        <div className="fp-row">
          <p className="micro" style={{ margin: 0 }}>
            Read <Link href="/privacy">what is recorded</Link>. See <Link href="/register">the register</Link> for what everyone has said so far.
          </p>
          <FinePrint label="Survey version"><p>Instrument version {SURVEY_VERSION}. Burden ids: {BURDEN_IDS.join(', ')}.</p></FinePrint>
        </div>
      </div>
    </section>
  );
}

function Choice({ name, value, label, checked, onChange }: { name: string; value: string; label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className={`choice ${checked ? 'on' : ''}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

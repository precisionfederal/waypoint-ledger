'use client';

/* ==========================================================================
   THE WRITTEN INTERVIEW — the user-research guide, answered in writing, on the
   person's own time. Ten questions, skip any. Consent is recorded in the
   person's own choice: notes only, quote anonymously, or quote by name.
   Answers are held privately and never served by any endpoint.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from '@/components/IntentLink';
import './FormCards.css';
import { ART, PanelCode, Spot, ThanksMoment, Waypoints, useRegisterCounts } from './ContribKit';
import { INTERVIEW_QUESTIONS } from '@/lib/survey';
import { INTERVIEW_RESPONDENT_SELF, INTERVIEW_RESPONDENT_CARER, interviewQuestionsFor, normalizeChannel } from '@/lib/survey-def';

type Consent = 'notes' | 'quote-anonymously' | 'quote-by-name';
/* The ids are the same in both wordings (lib/survey-def.js), so a draft reads back either way. */
const QS = INTERVIEW_QUESTIONS as [string, string][];

/* 🔴 ANSWERS SURVIVE A LOOK AWAY (R3 brainfog BF-05), AND A NIGHT'S SLEEP
   (FLOW contrib-7). A person wrote question 1, followed this page's own link to
   the example ledger, came back, and question 1 was empty; an advocate writing a
   long interview in two sittings lost the first. The answers are now held on
   this device (localStorage) for DRAFT_DAYS days, written half a second after
   each change, and cleared the moment they are sent or the person presses Clear.
   On a shared computer the person ticks one box and the draft is held for this
   tab only (sessionStorage), as before. The name and the email are never held:
   only the answers and the two choices. */
export const DRAFT_KEY = 'waypoint.interview.draft';
export const SHARED_KEY = 'waypoint.interview.shared';
export const DRAFT_DAYS = 7;
const DAY_MS = 86_400_000;
export type Draft = { answers: Record<string, string>; consent: Consent | ''; followUp: boolean; respondent?: string; savedAt?: number };

/** A stored draft, checked against the instrument; null when empty, malformed or older than DRAFT_DAYS. */
export function parseDraft(raw: string | null, now = Date.now()): Draft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<Draft>;
    const savedAt = typeof d.savedAt === 'number' && Number.isFinite(d.savedAt) ? d.savedAt : undefined;
    if (savedAt !== undefined && now - savedAt > DRAFT_DAYS * DAY_MS) return null;
    const answers: Record<string, string> = {};
    if (d.answers && typeof d.answers === 'object') {
      for (const [k, v] of Object.entries(d.answers)) if (typeof v === 'string' && QS.some(([id]) => id === k)) answers[k] = v.slice(0, 3000);
    }
    const consent = d.consent === 'notes' || d.consent === 'quote-anonymously' || d.consent === 'quote-by-name' ? d.consent : '';
    const respondent = d.respondent === INTERVIEW_RESPONDENT_SELF || d.respondent === INTERVIEW_RESPONDENT_CARER ? d.respondent : '';
    const out: Draft = { answers, consent, followUp: d.followUp === true, respondent, savedAt };
    return draftIsEmpty(out) ? null : out;
  } catch { return null; }
}
export function draftIsEmpty(d: Draft): boolean {
  return !Object.values(d.answers).some((a) => a.trim()) && !d.consent && !d.followUp && !d.respondent;
}
function readShared(): boolean {
  try { return sessionStorage.getItem(SHARED_KEY) === '1'; } catch { return false; }
}
function readDraft(): Draft | null {
  let local: Draft | null = null, tab: Draft | null = null;
  try {
    local = parseDraft(localStorage.getItem(DRAFT_KEY));
    if (!local) localStorage.removeItem(DRAFT_KEY);
  } catch { /* storage blocked */ }
  try { tab = parseDraft(sessionStorage.getItem(DRAFT_KEY)); } catch { /* storage blocked */ }
  if (local && tab) return (tab.savedAt ?? 0) >= (local.savedAt ?? 0) ? tab : local;
  return tab ?? local;
}
/** Writes the draft where the person chose; returns when it was saved, or null when nothing is held. */
function writeDraft(d: Draft | null, shared: boolean): number | null {
  const clear = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* blocked */ }
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* blocked */ }
  };
  if (!d || draftIsEmpty(d)) { clear(); return null; }
  const at = Date.now();
  const body = JSON.stringify({ ...d, savedAt: at });
  try {
    if (shared) { localStorage.removeItem(DRAFT_KEY); sessionStorage.setItem(DRAFT_KEY, body); }
    else { sessionStorage.removeItem(DRAFT_KEY); localStorage.setItem(DRAFT_KEY, body); }
    return at;
  } catch { return null; /* private mode: the form still works, it just forgets */ }
}

/* Mirrors isSubstantive in cf/functions/api/interview.js, so the button only lights for answers the server accepts. */
export function substantive(a: string): boolean {
  const t = a.trim();
  return t.length >= 20 && t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length >= 4;
}

/* FLOW contrib-6: a long answer grows its box, up to most of the screen, so the
   writer can reread it. CSS field-sizing does it where supported; this is the rest. */
function grow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  const cap = Math.round(window.innerHeight * 0.6);
  el.style.height = `${Math.min(el.scrollHeight + 2, Math.max(cap, 160))}px`;
}

/* Set by the survey when it is sent in this tab (components/SurveyForm.tsx). */
export const SURVEY_SENT_KEY = 'waypoint.survey.sent';

/* judge-2 #11a: ten empty boxes at once are a wall for a tired reader. The first
   FIRST_SHOWN questions open; the rest wait behind one button. Three answers of
   a sentence or more is the server's own rule (isSubstantive), so three boxes is
   a complete interview. A draft that holds a later answer opens them all. */
export const FIRST_SHOWN = 3;

export default function InterviewForm() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState<Consent | ''>('');
  const [name, setName] = useState('');
  const [followUp, setFollowUp] = useState(false);
  const [email, setEmail] = useState('');
  const [channel, setChannel] = useState('direct');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [err, setErr] = useState<string | null>(null);
  /* Present only for a paid research-panel answer with the code configured server-side. */
  const [completionCode, setCompletionCode] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [shared, setShared] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [didSurvey, setDidSurvey] = useState(false);
  /* access2-1: Clear asks first, says what it did, and puts the person back at
     question 1, instead of wiping every answer in one silent press. */
  const [confirmClear, setConfirmClear] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [clearedSaid, setClearedSaid] = useState('');
  const keepRef = useRef<HTMLButtonElement>(null);
  const clearBtnRef = useRef<HTMLButtonElement>(null);
  const boxes = useRef<Record<string, HTMLTextAreaElement | null>>({});
  /* The thank-you reads the register's own interview count once it is sent. */
  const counts = useRegisterCounts(state === 'sent');
  /* Who is answering (R4 content request 1): a parent or caregiver gets the
     questions worded for them. Optional; the ids stay the same. */
  const [respondent, setRespondent] = useState<string>('');
  const questions = interviewQuestionsFor(respondent) as [string, string][];
  const carer = respondent === INTERVIEW_RESPONDENT_CARER;

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const slug = normalizeChannel(q.get('c')); if (slug) setChannel(slug);
      if (q.get('r') === 'carer') setRespondent(INTERVIEW_RESPONDENT_CARER);
    } catch { /* ignore */ }
    try { setDidSurvey(sessionStorage.getItem(SURVEY_SENT_KEY) === '1'); } catch { /* blocked */ }
    setShared(readShared());
    const d = readDraft();
    if (d) {
      setAnswers(d.answers); setConsent(d.consent); setFollowUp(d.followUp); if (d.respondent) setRespondent(d.respondent);
      setSavedAt(d.savedAt ?? null);
      setTouched(Object.fromEntries(Object.keys(d.answers).map((k) => [k, true])));
      if (QS.slice(FIRST_SHOWN).some(([qid]) => (d.answers[qid] ?? '').trim())) setShowAll(true);
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored || state === 'sent') return;
    const t = setTimeout(() => setSavedAt(writeDraft({ answers, consent, followUp, respondent }, shared)), 500);
    return () => clearTimeout(t);
  }, [answers, consent, followUp, respondent, restored, state, shared]);
  /* Restored answers get their full height once they are on the page. */
  useEffect(() => { if (restored) Object.values(boxes.current).forEach(grow); }, [restored]);

  const chooseShared = useCallback((on: boolean) => {
    setShared(on);
    try { if (on) sessionStorage.setItem(SHARED_KEY, '1'); else sessionStorage.removeItem(SHARED_KEY); } catch { /* blocked */ }
  }, []);
  function clearDraft() {
    writeDraft(null, shared);
    setAnswers({}); setConsent(''); setFollowUp(false); setRespondent(''); setTouched({}); setSavedAt(null);
    Object.values(boxes.current).forEach((el) => { if (el) el.style.height = ''; });
    setConfirmClear(false);
    setShowAll(false);
    setClearedSaid('Your draft is cleared.');
    /* flow3-9: bring the first box to the middle of the screen before focusing it;
       at 1440x900 it sat at y 858, under the fold, after "Clear them". */
    requestAnimationFrame(() => {
      const first = boxes.current[questions[0]?.[0] ?? ''];
      first?.scrollIntoView({ block: 'center' });
      first?.focus({ preventScroll: true });
    });
  }
  useEffect(() => { if (confirmClear) keepRef.current?.focus(); }, [confirmClear]);

  const filled = Object.values(answers).filter(substantive).length;
  const ready = filled >= 3 && consent && (consent !== 'quote-by-name' || name.trim()) && (!followUp || email.trim());

  async function send() {
    setState('sending'); setErr(null);
    try {
      const res = await fetch('/api/interview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, consent, name: name.trim() || undefined, followUp, email: email.trim() || undefined, channel, respondent: respondent || undefined }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'The interview was not saved.');
      if (typeof j.completionCode === 'string' && j.completionCode) setCompletionCode(j.completionCode);
      writeDraft(null, shared);
      setState('sent'); window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setErr(e instanceof Error ? e.message : 'The interview was not saved.'); setState('idle'); }
  }

  if (state === 'sent') {
    return (
      <section className="step survey fc fc-done">
        <div className="wrap narrow">
          <ThanksMoment
            eyebrow="Received"
            title="Thank you. This is the kind of evidence the tool is built from."
            sub={<>What you wrote is held privately. What changes because of it is published on the register as &ldquo;a user said this, so we changed that&rdquo;, and you are quoted only in the way you chose.</>}
            count={counts?.interviews ?? null}
            countLabel={(n) => (n === 1 ? 'written interview on the register: yours' : 'written interviews on the register, yours among them')}
            art={ART.thanks}
            notice={<PanelCode code={completionCode} />}
          />
          {/* FLOW contrib-12: someone who just ranked the burdens is not asked to again. */}
          {didSurvey ? (
            <div className="step-actions ty-onward" data-testid="interview-next">
              <Link className="btn primary" href="/register/live">See the register</Link>
              <Link className="btn ghost" href="/journey">{carer ? 'Price the search' : 'Price your own journey'}</Link>
            </div>
          ) : (
            <div className="step-actions ty-onward" data-testid="interview-next">
              <Link className="btn primary" href="/survey">Rank the five burdens (two minutes)</Link>
              <Link className="btn ghost" href="/register/live">See the register</Link>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="step survey fc">
      <div className="wrap narrow">
        <header className="fc-head">
          <div className="fc-head-copy">
            <p className="eyebrow">Written interview · answer any three or more · your own time</p>
            <h1>{carer ? 'Tell us what looking for a diagnosis cost you and your family.' : 'Tell us what looking for a diagnosis actually cost you.'}</h1>
            <p className="sub">
              These are the same questions we ask in a live interview. Skip any. Write as much or as little as you like.
            </p>
          </div>
          <Spot art={ART.interview} className="fc-hero" eager />
        </header>
        <p className="fc-note">
          Before you start, open the <a href="/sheet?example" target="_blank" rel="noopener">example ledger</a> (it opens in a new tab) so question 8 has something to argue with.
          {shared
            ? ' What you write here is kept in this tab only, until you send it or close the tab.'
            : ` What you write here is kept on this device for ${DRAFT_DAYS} days, so you can finish it later; sending it or pressing Clear removes it.`}
        </p>

        <div className="fc-restored fc-draft" data-testid="interview-draft" data-saved={savedAt ? 'yes' : undefined}>
          <span className="fc-draft-t">
            <span className="fc-draft-dot" aria-hidden="true" key={savedAt ?? 0} />
            {savedAt
              ? `Saved ${shared ? 'in this tab' : 'on this device'} at ${new Date(savedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.`
              : clearedSaid || 'Nothing saved yet.'}
          </span>
          <span className="sr-only" role="status" data-testid="draft-cleared">{clearedSaid}</span>
          {savedAt && !confirmClear && <button type="button" className="btn ghost small" ref={clearBtnRef} onClick={() => { setClearedSaid(''); setConfirmClear(true); }}>Clear my draft</button>}
          {savedAt && confirmClear && (
            <span className="fc-confirm" role="group" aria-label="Clear all your answers?" data-testid="clear-confirm"
              onKeyDown={(e) => { if (e.key === 'Escape') { setConfirmClear(false); requestAnimationFrame(() => clearBtnRef.current?.focus()); } }}>
              <span className="fc-confirm-q">Clear all your answers? This cannot be undone.</span>
              <button type="button" className="btn small fc-danger" onClick={clearDraft}>Clear them</button>
              <button type="button" className="btn ghost small" ref={keepRef}
                onClick={() => { setConfirmClear(false); requestAnimationFrame(() => clearBtnRef.current?.focus()); }}>Keep them</button>
            </span>
          )}
          <label className="check">
            <input type="checkbox" checked={shared} onChange={(e) => chooseShared(e.target.checked)} />
            <span>This is a shared computer: keep it in this tab only</span>
          </label>
        </div>

        {/* PAGES DETAIL (2026-09-30): a visible progress line. Three substantive
            answers let it send; the bar fills toward that. */}
        <div className="fc-progress" data-testid="interview-progress">
          <p className="fc-progress-t"><b>{filled} of {questions.length}</b> answered &middot; at least three to send</p>
          <div className="fc-wp" role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={filled}>
            <Waypoints done={questions.map(([qid]) => substantive(answers[qid] ?? ''))} />
          </div>
        </div>

        <fieldset className="q">
          <legend>Who is answering? <span className="micro">optional</span></legend>
          <div className="choice-grid">
            <label className={`choice ${respondent === INTERVIEW_RESPONDENT_SELF ? 'on' : ''}`}><input type="radio" name="respondent" checked={respondent === INTERVIEW_RESPONDENT_SELF} onChange={() => setRespondent(INTERVIEW_RESPONDENT_SELF)} onClick={() => { if (respondent === INTERVIEW_RESPONDENT_SELF) setRespondent(''); }} /><span>Me, about my own illness</span></label>
            <label className={`choice ${carer ? 'on' : ''}`}><input type="radio" name="respondent" checked={carer} onChange={() => setRespondent(INTERVIEW_RESPONDENT_CARER)} onClick={() => { if (carer) setRespondent(''); }} /><span>{INTERVIEW_RESPONDENT_CARER}</span></label>
          </div>
          {carer && <p className="micro">The questions below are worded for you and the family. Where it says the person you care for, read your child&rsquo;s name, or theirs.</p>}
        </fieldset>

        <ol className="int-list">
          {(showAll ? questions : questions.slice(0, FIRST_SHOWN)).map(([id, q], i) => {
            const a = answers[id] ?? '';
            const short = touched[id] && a.trim() !== '' && !substantive(a);
            return (
              <li key={id} className="q" data-done={substantive(a) || undefined}>
                <label className="field">
                  <span><span className="q-n">{i + 1}</span>{q}</span>
                  <textarea rows={4} maxLength={3000} value={a} placeholder="Skip if you like."
                    ref={(el) => { boxes.current[id] = el; }}
                    aria-describedby={short ? `short-${id}` : undefined}
                    onBlur={() => setTouched((p) => (p[id] ? p : { ...p, [id]: true }))}
                    onChange={(e) => { const el = e.target; setAnswers((p) => ({ ...p, [id]: el.value })); grow(el); }} />
                </label>
                {/* FLOW contrib-13: the box that does not count yet says so. */}
                {short && <p className="int-short" id={`short-${id}`}>A sentence or two, please: this one is too short to count yet.</p>}
              </li>
            );
          })}
        </ol>
        {!showAll && questions.length > FIRST_SHOWN && (
          <div className="int-more" data-testid="interview-more">
            <p>Three answers of a sentence or more are enough to send. Want to skip one, or say more? There are {questions.length - FIRST_SHOWN} more questions.</p>
            <button type="button" className="btn ghost"
              onClick={() => { setShowAll(true); requestAnimationFrame(() => boxes.current[questions[FIRST_SHOWN][0]]?.focus()); }}>
              Show the other {questions.length - FIRST_SHOWN} questions
            </button>
          </div>
        )}

        <fieldset className="q">
          <legend>How may we use what you wrote?</legend>
          <div className="choice-grid">
            <label className={`choice ${consent === 'notes' ? 'on' : ''}`}><input type="radio" name="consent" checked={consent === 'notes'} onChange={() => setConsent('notes')} /><span>Learn from it, never quote it</span></label>
            <label className={`choice ${consent === 'quote-anonymously' ? 'on' : ''}`}><input type="radio" name="consent" checked={consent === 'quote-anonymously'} onChange={() => setConsent('quote-anonymously')} /><span>Quote me, without my name</span></label>
            <label className={`choice ${consent === 'quote-by-name' ? 'on' : ''}`}><input type="radio" name="consent" checked={consent === 'quote-by-name'} onChange={() => setConsent('quote-by-name')} /><span>Quote me by name</span></label>
          </div>
          {consent === 'quote-by-name' && (
            <label className="field"><span>The name to use</span><input type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
          )}
          <label className="check">
            <input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} />
            <span>Tell me when there is a new version to look at</span>
          </label>
          {followUp && (
            <label className="field"><span>Email for that one message, and nothing else</span><input type="email" inputMode="email" autoComplete="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          )}
        </fieldset>

        {err && <p className="match-note miss" role="alert">{err}</p>}
        <div className="step-actions">
          <button type="button" className="btn primary lg" disabled={!ready || state === 'sending'} onClick={send}>{state === 'sending' ? 'Sending…' : 'Send my answers'}</button>
          {!ready && <p className="micro">{filled < 3 ? `Write a sentence or two for at least three (${filled} so far).` : 'Choose how we may use it.'}</p>}
        </div>
        <p className="micro fc-note">Only our team reads them, through a private admin screen. They are never published, and no public page, endpoint or export carries them. <Link href="/privacy">What is recorded.</Link></p>
      </div>
    </section>
  );
}

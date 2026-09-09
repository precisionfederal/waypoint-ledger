'use client';

/* ==========================================================================
   THE WRITTEN INTERVIEW — the user-research guide, answered in writing, on the
   person's own time. Ten questions, skip any. Consent is recorded in the
   person's own choice: notes only, quote anonymously, or quote by name.
   Answers are held privately and never served by any endpoint.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { INTERVIEW_QUESTIONS } from '@/lib/survey';

type Consent = 'notes' | 'quote-anonymously' | 'quote-by-name';
const QS = INTERVIEW_QUESTIONS as [string, string][];

export default function InterviewForm() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState<Consent | ''>('');
  const [name, setName] = useState('');
  const [followUp, setFollowUp] = useState(false);
  const [email, setEmail] = useState('');
  const [channel, setChannel] = useState('direct');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try { const c = new URLSearchParams(window.location.search).get('c'); if (c && /^[a-z0-9-]{1,24}$/.test(c)) setChannel(c); } catch { /* ignore */ }
  }, []);

  const filled = Object.values(answers).filter((a) => a.trim()).length;
  const ready = filled >= 3 && consent && (consent !== 'quote-by-name' || name.trim()) && (!followUp || email.trim());

  async function send() {
    setState('sending'); setErr(null);
    try {
      const res = await fetch('/api/interview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, consent, name: name.trim() || undefined, followUp, email: email.trim() || undefined, channel }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'The interview was not saved.');
      setState('sent'); window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setErr(e instanceof Error ? e.message : 'The interview was not saved.'); setState('idle'); }
  }

  if (state === 'sent') {
    return (
      <section className="step survey">
        <div className="wrap narrow">
          <p className="eyebrow">Received</p>
          <h1>Thank you. This is the kind of evidence the tool is built from.</h1>
          <p className="sub">What you wrote is held privately. What changes because of it is published on the register as &ldquo;a user said this, so we changed that&rdquo;, and you are quoted only in the way you chose.</p>
          <div className="step-actions">
            <Link className="btn primary" href="/survey">Rank the five burdens (two minutes)</Link>
            <Link className="btn ghost" href="/register">See the register</Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="step survey">
      <div className="wrap narrow">
        <p className="eyebrow">Written interview · answer any three or more · your own time</p>
        <h1>Tell us what looking for a diagnosis actually cost you.</h1>
        <p className="sub">
          These are the same questions we ask in a live interview. Skip any. Write as much or as little as you like.
          Before you start, open the <Link href="/sheet?example">example ledger</Link> so question 8 has something to argue with.
        </p>

        <ol className="int-list">
          {QS.map(([id, q], i) => (
            <li key={id} className="q">
              <label className="field">
                <span><span className="q-n">{i + 1}</span>{q}</span>
                <textarea rows={3} maxLength={3000} value={answers[id] ?? ''} onChange={(e) => setAnswers((p) => ({ ...p, [id]: e.target.value }))} placeholder="Skip if you like." />
              </label>
            </li>
          ))}
        </ol>

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
          {!ready && <p className="micro">{filled < 3 ? `Answer at least three (${filled} so far).` : 'Choose how we may use it.'}</p>}
        </div>
        <p className="micro">Your answers are held privately and never served by any endpoint. <Link href="/privacy">What is recorded.</Link></p>
      </div>
    </section>
  );
}

'use client';

/* ==========================================================================
   THE SURVEY — six questions, two minutes, one shareable link.
   /survey?c=<channel> records the recruitment channel so the published sample
   says where it came from. Ranking is done by tapping in order, heaviest first.
   ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Aside } from './LongSection';
import { BURDENS, BURDEN_IDS, DECIDERS, QUESTIONS, CONTEXT, CONTEXT_KEYS, SURVEY_VERSION, SMALL_CELL_MIN, SEX_POLICY, SEX_POLICY_URL, type BurdenId, type DeciderId, type ContextKey } from '@/lib/survey';

export default function SurveyForm() {
  const [ranking, setRanking] = useState<BurdenId[]>([]);
  const [unasked, setUnasked] = useState<BurdenId | 'all-asked' | ''>('');
  const [lead, setLead] = useState<BurdenId | ''>('');
  const [decide, setDecide] = useState<DeciderId | ''>('');
  const [clinicians, setClinicians] = useState('');
  const [context, setContext] = useState<Partial<Record<ContextKey, string>>>({});
  const [sentence, setSentence] = useState('');
  const [channel, setChannel] = useState('direct');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try { const c = new URLSearchParams(window.location.search).get('c'); if (c && /^[a-z0-9-]{1,24}$/.test(c)) setChannel(c); } catch { /* ignore */ }
  }, []);

  const complete = ranking.length === 5 && unasked && lead && decide;
  const nextRank = ranking.length + 1;
  const remaining = useMemo(() => BURDENS.filter((b) => !ranking.includes(b.id as BurdenId)), [ranking]);

  function tap(id: BurdenId) {
    setRanking((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 5 ? [...p, id] : p));
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
      setState('sent');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The response was not saved.');
      setState('idle');
    }
  }

  if (state === 'sent') {
    return (
      <section className="step survey">
        <div className="wrap narrow">
          <p className="eyebrow">Recorded</p>
          <h1>Thank you. Your ranking is now part of the count.</h1>
          <p className="sub">
            It is published as a frequency distribution with everyone else&rsquo;s, with the number of people who answered and where they
            came from. Nothing in it identifies you.
          </p>
          <div className="step-actions">
            <Link className="btn primary" href="/register">See the register</Link>
            <Link className="btn ghost" href="/journey">Price your own journey</Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="step survey">
      <div className="wrap narrow">
        <p className="eyebrow">Two minutes, six questions</p>
        <h1>Which cost of looking for a diagnosis weighed most?</h1>
        <p className="sub">
          Rank the five burdens. Nothing here identifies you.
        </p>

        <fieldset className="q">
          <legend><span className="q-n">1</span>{QUESTIONS.rank}</legend>
          <p className="micro">Tap them in order. First tap is the heaviest. Tap again to undo.</p>
          <ol className="rank-picked" aria-live="polite">
            {ranking.map((id, i) => {
              const b = BURDENS.find((x) => x.id === id)!;
              return <li key={id}><button type="button" className="rank-chip on" onClick={() => tap(id)} aria-pressed="true"><span className="rank-n">{i + 1}</span>{b.label}</button></li>;
            })}
          </ol>
          {remaining.length > 0 && (
            <div className="rank-pool">
              <p className="micro">{ranking.length === 0 ? 'Heaviest first:' : `Next, number ${nextRank}:`}</p>
              {remaining.map((b) => (
                <button key={b.id} type="button" className="rank-chip" onClick={() => tap(b.id as BurdenId)} aria-pressed="false">{b.label}</button>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset className="q">
          <legend><span className="q-n">2</span>{QUESTIONS.unasked}</legend>
          <div className="choice-grid">
            {BURDENS.map((b) => <Choice key={b.id} name="unasked" value={b.id} label={b.label} checked={unasked === b.id} onChange={() => setUnasked(b.id as BurdenId)} />)}
            <Choice name="unasked" value="all-asked" label="Someone asked about all of them" checked={unasked === 'all-asked'} onChange={() => setUnasked('all-asked')} />
          </div>
        </fieldset>

        <fieldset className="q">
          <legend><span className="q-n">3</span>{QUESTIONS.lead}</legend>
          <div className="choice-grid">
            {BURDENS.map((b) => <Choice key={b.id} name="lead" value={b.id} label={b.label} checked={lead === b.id} onChange={() => setLead(b.id as BurdenId)} />)}
          </div>
        </fieldset>

        <fieldset className="q">
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
        <fieldset className="q">
          <legend><span className="q-n">6</span>{CONTEXT.sex.label} <span className="micro">optional</span></legend>
          <p className="micro">
            Asked because the federal prevalence files we cite are published by sex, and because NIH expects sex to be accounted for
            as a biological variable in the research it funds &mdash;{' '}
            <a href={SEX_POLICY_URL} target="_blank" rel="noopener noreferrer">{SEX_POLICY}</a>. It is published only as a count.
            Where a federal file is silent on sex, <Link href="/method#sex">/method</Link> says so.
          </p>
          <div className="choice-grid">
            {CONTEXT.sex.options.map((o: string) => (
              <Choice key={o} name="sex" value={o} label={o} checked={context.sex === o}
                      onChange={() => setContext((p) => ({ ...p, sex: p.sex === o ? undefined : o }))} />
            ))}
          </div>
          <p className="micro">
            Published on <Link href="/register">the register</Link> only where at least {SMALL_CELL_MIN} people have given the same answer,
            under the same rule as the state. Below that it is withheld and the withholding is counted in public.
          </p>
        </fieldset>

        <details className="q q-optional">
          <summary>Optional: who you are, so the sample can say who it covers</summary>
          <p className="micro">Used only to publish who answered and who did not. Leave any of these blank.</p>
          <div className="ctx-grid">
            {(CONTEXT_KEYS as ContextKey[]).filter((k) => k !== 'sex').map((k) => (
              <label key={k} className="field">
                <span>{CONTEXT[k].label}</span>
                <select value={context[k] ?? ''} onChange={(e) => setContext((p) => ({ ...p, [k]: e.target.value || undefined }))}>
                  <option value="">Prefer not to say</option>
                  {CONTEXT[k].options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className="micro">
            Your state is published on <Link href="/register">the register</Link> only where at least {SMALL_CELL_MIN} people have named the same one.
            Below that it is withheld, and the withholding is counted in public, so a small count can never point at a person.
          </p>
          <label className="field">
            <span>One sentence on what the search cost you (optional, held privately, never published word for word)</span>
            <textarea rows={2} maxLength={280} value={sentence} onChange={(e) => setSentence(e.target.value)} placeholder="Only if you want to." />
          </label>
        </details>

        {err && <p className="match-note miss" role="alert">{err}</p>}

        <div className="step-actions">
          <button type="button" className="btn primary lg" disabled={!complete || state === 'sending'} onClick={send}>
            {state === 'sending' ? 'Sending…' : 'Add my ranking to the count'}
          </button>
          {!complete && <p className="micro">{ranking.length < 5 ? `Rank all five (${ranking.length} of 5 so far).` : 'Answer questions 2 to 4.'}</p>}
        </div>
        <Aside summary="Why we ask">
          <p>
            Federal cost studies decide how to weigh money, time and lost work by analyst judgment. We are
            asking the people who carried it. Everything you answer is published only as a count, alongside
            how many people answered and where they came from.
          </p>
        </Aside>
        <p className="micro">
          Read <Link href="/privacy">what is recorded</Link>. See <Link href="/register">the register</Link> for what everyone has said so far.
          Instrument version {SURVEY_VERSION}. Burden ids: {BURDEN_IDS.join(', ')}.
        </p>
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

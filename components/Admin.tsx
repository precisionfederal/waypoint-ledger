'use client';

/* ==========================================================================
   THE ADMIN CONSOLE — the private side of the register.

   Written interviews are held encrypted at rest and are never served by a public
   endpoint. This page is the only place they can be read, and it is the place the
   published change log is written from, so that every "a user said X, so we changed
   Y" on /register can be traced back to the interview that caused it.

   🔴 Two rules this file enforces in the interface itself:
   1. CONSENT DECIDES THE QUOTE. The copy button offers a name only where the writer
      chose "quote me by name", an unnamed quote where they chose "quote me
      anonymously", and refuses to copy anything at all where they chose "notes only".
   2. NOTHING IS STORED. The token lives in sessionStorage and dies with the tab; no
      interview text is written anywhere by this page.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { INTERVIEW_QUESTIONS } from '@/lib/survey-def';

const TOKEN_KEY = 'waypoint.admin.token';
const QUESTION = new Map<string, string>(INTERVIEW_QUESTIONS as [string, string][]);

type Tab = 'interviews' | 'corrections' | 'changes' | 'stats';

interface Interview {
  id: string;
  consent: 'notes' | 'quote-anonymously' | 'quote-by-name';
  name?: string | null;
  email?: string | null;
  answers?: Record<string, string> | null;
  channel?: string;
  followUp?: boolean; follow_up?: number;
  receivedAt?: string; received_at?: string;
  reviewedAt?: string | null; reviewed_at?: string | null;
}
interface CorrectionRow {
  id: string; priceId?: string; price_id?: string; verdict: string;
  believedValueUsd?: number | null; believed_usd?: number | null; note?: string | null;
  priceTableVersion?: string; table_version?: string;
  receivedAt?: string; received_at?: string;
}
interface ChangeRow {
  id: string; date: string; said: string; changed: string; who: string;
  sourceInterviewId?: string | null; source_interview_id?: string | null;
}
interface Stats {
  tables?: Record<string, number>;
  events?: { day: string; name: string; count: number }[];
}

const at = (r: { receivedAt?: string; received_at?: string }) => r.receivedAt ?? r.received_at ?? '';
const reviewed = (r: Interview) => r.reviewedAt ?? r.reviewed_at ?? null;
const day = (iso: string) => (iso ? iso.slice(0, 10) : '—');
const pickList = <T,>(j: Record<string, unknown>, ...keys: string[]): T[] => {
  for (const k of keys) if (Array.isArray(j[k])) return j[k] as T[];
  return [];
};

const CONSENT_LABEL: Record<string, string> = {
  'quote-by-name': 'may be quoted by name',
  'quote-anonymously': 'may be quoted without a name',
  notes: 'notes only — do not quote',
};

export default function Admin() {
  const [token, setToken] = useState('');
  const [entry, setEntry] = useState('');
  const [tab, setTab] = useState<Tab>('interviews');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [since, setSince] = useState('');

  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [changes, setChanges] = useState<ChangeRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [form, setForm] = useState({ date: '', who: '', said: '', changed: '', sourceInterviewId: '' });

  useEffect(() => {
    try { setToken(sessionStorage.getItem(TOKEN_KEY) || ''); } catch { /* private mode */ }
  }, []);

  const call = useCallback(async (path: string, init: RequestInit = {}, quiet = false): Promise<Record<string, unknown> | null> => {
    if (!token) return null;
    const res = await fetch(path, {
      ...init,
      headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), authorization: `Bearer ${token}`, ...(init.headers || {}) },
    });
    if (res.status === 401 || res.status === 403) {
      try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
      setToken(''); setErr('That token was refused. Enter it again.');
      return null;
    }
    let body: Record<string, unknown> = {};
    try { body = (await res.json()) as Record<string, unknown>; } catch { /* a body is not guaranteed */ }
    if (!res.ok) { if (!quiet) setErr(typeof body.error === 'string' ? body.error : `${path} returned ${res.status}.`); return null; }
    setErr(null);
    return body;
  }, [token]);

  const load = useCallback(async (which: Tab) => {
    if (!token) return;
    setBusy(true);
    try {
      if (which === 'interviews') {
        const j = await call(`/api/admin/interviews${since ? `?since=${encodeURIComponent(since)}` : ''}`);
        if (j) setInterviews(pickList<Interview>(j, 'interviews', 'rows', 'results'));
      } else if (which === 'corrections') {
        const j = await call('/api/admin/corrections');
        if (j) setCorrections(pickList<CorrectionRow>(j, 'corrections', 'rows', 'results'));
      } else if (which === 'changes') {
        // The private list first; the published log is the fallback where only
        // POST and DELETE are exposed under /api/admin.
        const j = (await call('/api/admin/changes', {}, true)) ?? (await call('/api/changes', {}, true));
        if (j) setChanges(pickList<ChangeRow>(j, 'changes', 'rows', 'results'));
      } else {
        const j = await call('/api/admin/stats');
        if (j) setStats(j as Stats);
      }
    } finally { setBusy(false); }
  }, [call, since, token]);

  useEffect(() => { void load(tab); }, [load, tab]);

  const quoteFor = (iv: Interview, qid: string): string | null => {
    const text = iv.answers?.[qid];
    if (!text || iv.consent === 'notes') return null;
    const attribution = iv.consent === 'quote-by-name' && iv.name ? iv.name : 'a person who wrote to Waypoint Ledger';
    return `“${text.trim()}” — ${attribution}`;
  };

  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); }
    catch { setErr('The browser refused clipboard access. Select the text and copy it by hand.'); }
  };

  const markReviewed = async (id: string) => {
    const j = await call(`/api/admin/interviews/${id}/reviewed`, { method: 'POST', body: '{}' });
    if (j) void load('interviews');
  };

  const addChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = JSON.stringify({
      date: form.date, who: form.who, said: form.said, changed: form.changed,
      ...(form.sourceInterviewId ? { sourceInterviewId: form.sourceInterviewId } : {}),
    });
    const j = await call('/api/admin/changes', { method: 'POST', body });
    if (j) { setForm({ date: '', who: '', said: '', changed: '', sourceInterviewId: '' }); void load('changes'); }
  };

  const removeChange = async (id: string) => {
    const j = await call(`/api/admin/changes/${id}`, { method: 'DELETE' });
    if (j) void load('changes');
  };

  const unreviewed = useMemo(() => interviews.filter((i) => !reviewed(i)).length, [interviews]);

  if (!token) {
    return (
      <section className="step page narrow">
        <div className="wrap">
          <p className="eyebrow">Private</p>
          <h1>Waypoint Ledger console</h1>
          <p className="sub">Written interviews are encrypted at rest and are not served by any public endpoint. This page reads them with the admin token and nothing else.</p>
          {err && <div className="notice warn"><p>{err}</p></div>}
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              const t = entry.trim();
              if (!t) return;
              try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* private mode */ }
              setToken(t); setEntry(''); setErr(null);
            }}
          >
            <label className="field" htmlFor="admin-token"><span>Admin token</span></label>
            <input id="admin-token" type="password" autoComplete="off" value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="Bearer token" />
            <div className="row" style={{ marginTop: '.75rem' }}>
              <button className="btn primary" type="submit" disabled={!entry.trim()}>Open the console</button>
            </div>
            <p className="micro" style={{ marginTop: '.75rem' }}>Held in this tab only, and forgotten when it closes.</p>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section className="step">
      <div className="wrap">
        <div className="row between">
          <div>
            <p className="eyebrow">Private</p>
            <h1>Console</h1>
          </div>
          <button
            className="link-btn"
            onClick={() => { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } setToken(''); }}
          >Lock</button>
        </div>

        <div className="tabs" role="tablist" aria-label="Console sections">
          {([['interviews', `Interviews${unreviewed ? ` (${unreviewed} unread)` : ''}`], ['corrections', 'Corrections'], ['changes', 'Change log'], ['stats', 'Stats']] as [Tab, string][]).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>

        {err && <div className="notice warn"><p>{err}</p></div>}
        {busy && <p className="micro">Loading…</p>}

        {tab === 'interviews' && (
          <>
            <div className="row" style={{ marginBottom: '.75rem' }}>
              <label className="field" htmlFor="since"><span>Received on or after</span></label>
              <input id="since" type="date" value={since} onChange={(e) => setSince(e.target.value)} style={{ maxWidth: '12rem' }} />
              <button className="btn ghost small" onClick={() => void load('interviews')}>Apply</button>
            </div>
            {!interviews.length && !busy && <p className="sub">No written interviews yet.</p>}
            {interviews.map((iv) => (
              <article className="card" key={iv.id}>
                <div className="row between">
                  <p className="lbl">{day(at(iv))} · {CONSENT_LABEL[iv.consent] ?? iv.consent} · {iv.channel || 'direct'}</p>
                  {reviewed(iv)
                    ? <span className="micro">read {day(String(reviewed(iv)))}</span>
                    : <button className="btn ghost small" onClick={() => void markReviewed(iv.id)}>Mark read</button>}
                </div>
                {iv.consent === 'quote-by-name' && iv.name && <p className="micro">Name to use in a quote: <strong>{iv.name}</strong></p>}
                {iv.email && <p className="micro">Asked to hear back: {iv.email}</p>}
                {Object.entries(iv.answers ?? {}).map(([qid, text]) => {
                  const q = quoteFor(iv, qid);
                  return (
                    <div key={qid} className="dist">
                      <h3>{QUESTION.get(qid) ?? qid}</h3>
                      <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
                      {q
                        ? <button className="link-btn" onClick={() => void copy(`${iv.id}:${qid}`, q)}>{copied === `${iv.id}:${qid}` ? 'Copied' : 'Copy as a quote'}</button>
                        : <p className="micro">Notes only — this writer did not consent to be quoted.</p>}
                    </div>
                  );
                })}
                <p className="micro">Interview {iv.id}</p>
              </article>
            ))}
          </>
        )}

        {tab === 'corrections' && (
          <section className="card table-card">
            <div className="table-scroll">
              <table className="ledger-table">
                <thead><tr><th scope="col">Received</th><th scope="col">Published figure</th><th scope="col">Verdict</th><th scope="col" className="r">Said they paid</th><th scope="col">What they wrote</th><th scope="col">Table</th></tr></thead>
                <tbody>
                  {corrections.map((c) => (
                    <tr key={c.id}>
                      <td>{day(at(c))}</td>
                      <td>{c.priceId ?? c.price_id}</td>
                      <td>{c.verdict}</td>
                      <td className="r">{typeof (c.believedValueUsd ?? c.believed_usd) === 'number' ? `$${c.believedValueUsd ?? c.believed_usd}` : '—'}</td>
                      <td>{c.note || '—'}</td>
                      <td>{c.priceTableVersion ?? c.table_version ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!corrections.length && !busy && <p className="sub" style={{ padding: '1rem' }}>No corrections yet.</p>}
          </section>
        )}

        {tab === 'changes' && (
          <>
            <form className="card" onSubmit={addChange}>
              <p className="lbl">Publish a change</p>
              <p className="micro">This is what /register shows as “a user said this, so we changed that”. Write it in their words, not ours.</p>
              <label className="field"><span>Date</span><input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
              <label className="field"><span>Who said it</span><input type="text" required maxLength={600} value={form.who} onChange={(e) => setForm({ ...form, who: e.target.value })} placeholder="a person who wrote to us / Dr John Phillips, NIH" /></label>
              <label className="field"><span>What they said</span><textarea required maxLength={600} value={form.said} onChange={(e) => setForm({ ...form, said: e.target.value })} /></label>
              <label className="field"><span>What changed</span><textarea required maxLength={600} value={form.changed} onChange={(e) => setForm({ ...form, changed: e.target.value })} /></label>
              <label className="field"><span>Interview it came from (optional)</span><input type="text" maxLength={80} value={form.sourceInterviewId} onChange={(e) => setForm({ ...form, sourceInterviewId: e.target.value })} /></label>
              <button className="btn primary" type="submit">Publish it</button>
            </form>
            {changes.map((c) => (
              <article className="card" key={c.id}>
                <div className="row between">
                  <p className="lbl">{c.date} · {c.who}</p>
                  <button className="link-btn danger" onClick={() => void removeChange(c.id)}>Remove</button>
                </div>
                <p><strong>Said:</strong> {c.said}</p>
                <p><strong>Changed:</strong> {c.changed}</p>
                {(c.sourceInterviewId ?? c.source_interview_id) && <p className="micro">From interview {c.sourceInterviewId ?? c.source_interview_id}</p>}
              </article>
            ))}
            {!changes.length && !busy && <p className="sub">Nothing published yet.</p>}
          </>
        )}

        {tab === 'stats' && stats && (
          <>
            <div className="reg-grid">
              {Object.entries(stats.tables ?? {}).map(([name, n]) => (
                <div className="reg-stat" key={name}><p className="lbl">{name.replace(/_/g, ' ')}</p><p className="mid-num">{n}</p></div>
              ))}
            </div>
            <div className="dist">
              <h3>Requests counted, last 30 days</h3>
              <ul className="dist-list">
                {(stats.events ?? []).map((e) => <li key={`${e.day}:${e.name}`}><span>{e.day} · {e.name}</span><b>{e.count}</b></li>)}
              </ul>
              {!(stats.events ?? []).length && <p className="micro">No counted requests yet.</p>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

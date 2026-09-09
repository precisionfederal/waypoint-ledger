'use client';
/* ==========================================================================
   "I already lived this. Do I have to type it again?"

   For anyone on Medicare, the answer should be no: CMS already holds every
   claim it processed for them and, since 2018, hands it to the person on
   request through the Blue Button 2.0 API. This component asks for that
   record, matches each billed line against the published federal price table,
   and shows the person what it found BEFORE anything enters their ledger.

   🔴 THREE RULES THIS COMPONENT KEEPS, VISIBLY.

   1. It renders NOTHING until the connection is real. `configured` comes from
      the server and is false until CMS has issued this site sandbox
      credentials. No button, no heading, not the words. A capability we have
      not proved does not get to appear on a page describing itself.

   2. It shows the whole result, including the misses. Every code Medicare sent
      that this table has no row for is listed with its count and its dates. A
      tool that quietly drops what it could not price is telling the person
      their journey was cheaper than it was.

   3. It never names a code it was not given a name for. CMS sends a
      description on some lines and not others, and there is no free federal
      file that describes both CPT and HCPCS Level II codes. So an unnamed code
      stays a bare code with a sentence saying why. A plausible guess on a
      medical code is worse than a blank.

   Nothing imported here is sent anywhere. The claims are read by the Worker,
   reduced to a code and a date, mapped in this browser, and held in the same
   local ledger as anything typed by hand.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { TABLE } from '@/lib/table';
import { usd } from '@/lib/pricing';
import { useStore } from '@/lib/store';
import { mapLines, importSummary, type ClaimLine, type ImportResult } from '@/lib/bluebutton';

interface Status { ok: boolean; configured: boolean; connected: boolean; environment: string }
interface ClaimsPayload { ok: boolean; error?: string; claimCount: number; lines: ClaimLine[]; truncated: boolean; note: string | null }

type Phase = 'checking' | 'off' | 'ready' | 'loading' | 'loaded' | 'error';

const dateRange = (a: string | null, b: string | null) =>
  (!a ? 'date not given' : a === b || !b ? a : `${a} – ${b}`);

export default function ImportClaims() {
  const st = useStore();
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<Phase>('checking');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [meta, setMeta] = useState<{ truncated: boolean; note: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ kind: string; why: string | null } | null>(null);
  const [added, setAdded] = useState(false);

  /** Groups waiting for their occurrence count, keyed by the raw line text.
   *  `addItem` does not hand back the key it minted, so the count is applied on
   *  the next render, when the entry it created is visible in the store. */
  const pendingTimes = useRef<Map<string, number>>(new Map());

  /* What came back from CMS, if the person has just returned from signing in. */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const kind = q.get('medicare');
    if (kind) setOutcome({ kind, why: q.get('why') });
  }, []);

  useEffect(() => {
    let live = true;
    fetch('/api/bluebutton/status', { headers: { accept: 'application/json' } })
      .then((r) => r.json())
      .then((j: Status) => {
        if (!live) return;
        setStatus(j);
        setPhase(j && j.configured ? 'ready' : 'off');
      })
      .catch(() => { if (live) setPhase('off'); });
    return () => { live = false; };
  }, []);

  const load = useCallback(async () => {
    setPhase('loading'); setErr(null);
    try {
      const res = await fetch('/api/bluebutton/claims', { headers: { accept: 'application/json' } });
      const j: ClaimsPayload = await res.json();
      if (!res.ok || !j.ok) {
        setErr(j?.error || 'Medicare could not be read just now.');
        setPhase('error');
        if (res.status === 401) setStatus((s) => (s ? { ...s, connected: false } : s));
        return;
      }
      setResult(mapLines(j.lines || [], TABLE, j.claimCount));
      setMeta({ truncated: Boolean(j.truncated), note: j.note ?? null });
      setPhase('loaded');
    } catch {
      setErr('This device could not reach Medicare just now.');
      setPhase('error');
    }
  }, []);

  /* Connected and just back from CMS: read the claims without another click. */
  useEffect(() => {
    if (status?.configured && status?.connected && phase === 'ready') void load();
  }, [status?.configured, status?.connected, phase, load]);

  /* Apply the occurrence counts once the store has minted keys for the new lines. */
  useEffect(() => {
    if (!pendingTimes.current.size) return;
    for (const e of st.entries) {
      const want = pendingTimes.current.get(e.raw);
      if (want !== undefined && e.times !== want) { st.setTimes(e.key, want); pendingTimes.current.delete(e.raw); }
      else if (want !== undefined) pendingTimes.current.delete(e.raw);
    }
  }, [st]);

  const addAll = useCallback(() => {
    if (!result) return;
    for (const g of result.matched) {
      const entry = result.entries.find((e) => e.item?.id === g.item.id);
      if (!entry) continue;
      pendingTimes.current.set(entry.raw, entry.times);
      st.addItem(g.item, entry.raw);
    }
    setAdded(true);
  }, [result, st]);

  const disconnect = useCallback(async () => {
    try { await fetch('/api/bluebutton/disconnect', { method: 'POST' }); } catch { /* the cookie is gone either way */ }
    setStatus((s) => (s ? { ...s, connected: false } : s));
    setResult(null); setPhase('ready'); setOutcome(null); setAdded(false);
  }, []);

  /* 🔴 THE SWITCH. Until CMS has issued credentials and a sign-in has really
     round-tripped, this component is not on the page in any form. */
  if (phase === 'checking' || phase === 'off' || !status?.configured) return null;

  return (
    <section className="notice" aria-labelledby="bb-h">
      <h2 id="bb-h" style={{ margin: '0 0 .35rem', fontSize: '1.05rem' }}>Bring in your Medicare record</h2>
      <p style={{ margin: '0 0 .6rem' }}>
        If you have Medicare, CMS already holds the claims it processed for you. You can sign in at
        Medicare and let this page read them, so you do not have to remember and retype years of visits
        and tests. It reads what care happened and when. It does not read, keep or show what anyone
        was paid — every dollar on this page stays a published federal figure you can open and check.
      </p>
      <p className="micro" style={{ margin: '0 0 .8rem' }}>
        Nothing is stored on this server. The claims are read once, turned into service codes and dates,
        and matched in this browser. Your ledger stays on this device unless you choose to save it.
        {status.environment === 'sandbox'
          ? ' This connection is to the CMS Blue Button 2.0 sandbox, which holds synthetic test records, not live Medicare data.'
          : null}
      </p>

      {outcome?.kind === 'cancelled' && (
        <p className="micro">You stopped at the Medicare sign-in. Nothing was read, and nothing changed here.</p>
      )}
      {outcome?.kind === 'failed' && (
        <p className="warn-txt">{outcome.why || 'That sign-in did not finish. You can try again.'}</p>
      )}

      {!status.connected && (
        <p style={{ margin: 0 }}>
          <a className="btn" href="/api/bluebutton/start">Sign in at Medicare</a>
        </p>
      )}

      {phase === 'loading' && <p className="micro">Reading your claims from Medicare…</p>}
      {phase === 'error' && (
        <>
          <p className="warn-txt">{err}</p>
          <p style={{ margin: 0 }}><button type="button" className="btn ghost" onClick={() => void load()}>Try again</button></p>
        </>
      )}

      {phase === 'loaded' && result && (
        <>
          <p style={{ margin: '.4rem 0' }}><strong>{importSummary(result)}</strong></p>
          {meta?.note && <p className="micro">{meta.note}</p>}

          {result.matched.length > 0 && (
            <div className="table-scroll">
              <table className="ledger-table">
                <caption className="sr-only">Medicare claim lines this table has a published figure for</caption>
                <thead>
                  <tr>
                    <th scope="col">Care</th>
                    <th scope="col" className="r">Times</th>
                    <th scope="col">When</th>
                    <th scope="col" className="r">Published figure, each</th>
                  </tr>
                </thead>
                <tbody>
                  {result.matched.map((g) => (
                    <tr key={g.item.id}>
                      <td>
                        {g.item.label}
                        <span className="li-sub mono">{g.item.code}</span>
                      </td>
                      <td className="r">{g.lines.length}</td>
                      <td className="mono">{dateRange(g.firstServicedOn, g.lastServicedOn)}</td>
                      <td className="r">{usd(g.item.valueUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.unmatched.length > 0 && (
            <>
              <p style={{ margin: '.8rem 0 .3rem' }}>
                <strong>Medicare billed {result.unmatched.length} code{result.unmatched.length === 1 ? '' : 's'} this
                table has no published figure for.</strong> They are listed rather than dropped, because a
                journey is not cheaper for being unpriced. Nothing here is guessed at.
              </p>
              <ul className="gap-counts">
                {result.unmatched.map((u) => (
                  <li key={u.code}>
                    <span className="mono">{u.code}</span>{' '}
                    {u.display
                      ? <>— {u.display}</>
                      : <span className="micro">— Medicare sent no description with this code, so none is shown.</span>}{' '}
                    <span className="micro">
                      {u.count} line{u.count === 1 ? '' : 's'}, {dateRange(u.firstServicedOn, u.lastServicedOn)}
                      {u.reason === 'ambiguous'
                        ? ` · this code is more than one row here (${u.candidates.map((c) => c.label).join('; ')}) and the claim did not say which, so it is left for you to choose`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {result.linesWithoutCode > 0 && (
            <p className="micro">
              {result.linesWithoutCode} billed line{result.linesWithoutCode === 1 ? '' : 's'} arrived with no
              procedure code at all. Counted here, and left out of the ledger rather than filled in.
            </p>
          )}

          <p style={{ margin: '.8rem 0 0', display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            {result.matched.length > 0 && (
              <button type="button" className="btn" onClick={addAll} disabled={added}>
                {added
                  ? `Added ${result.matched.length} line${result.matched.length === 1 ? '' : 's'}`
                  : `Add ${result.matched.length} line${result.matched.length === 1 ? '' : 's'} to my ledger`}
              </button>
            )}
            <button type="button" className="btn ghost" onClick={() => void disconnect()}>Disconnect from Medicare</button>
          </p>
        </>
      )}
    </section>
  );
}

'use client';

/* ==========================================================================
   CARE GONE WITHOUT — directly under the total, because the people who
   answered the burden survey ranked it the heaviest of the five.

   A count, never a price: no federal file attaches a dollar to care that did
   not happen, so no dollar appears here and nothing here is added to the
   total above. See lib/forgone.ts for the rules.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from '@/components/IntentLink';
import { TABLE_VERSION } from '@/lib/table';
import { gapPrefill } from '@/lib/mapper';
import { sharedRaw, useStore } from '@/lib/store';
import {
  EMPTY_FORGONE, FORGONE_MAX, forgoneEntered, forgoneGapBody, forgoneRank, forgoneRankSentence,
  forgoneRows, loadForgone, saveForgone, surveyIsEmpty, type ForgoneCategory, type ForgoneCounts, type ForgoneRank,
} from '@/lib/forgone';
import { teamTestsPhrase } from '@/lib/team-tests';
import { Icon } from './Icons';

/** FINAL-1011 honest: the "X of Y" sentence already leaves our own test answers
 *  out (/api/survey teamTests); when any are marked it says so inside the
 *  sentence. Kept here, not in lib/forgone.ts, which the journey map also loads. */
export function rankLine(rank: ForgoneRank, teamTests: unknown): string {
  const s = forgoneRankSentence(rank);
  const ours = teamTestsPhrase(teamTests);
  return ours ? s.replace(/\.$/, ` (${ours} and not counted).`) : s;
}

const TAP = { width: '2.75rem', height: '2.75rem' } as const;

/* 🔴 COMPACT UNDER THE TOTAL (round 2 decision). At 1728x860, after "Add these
   5", the total, this band's ranking sentence AND the first ledger line with its
   Right/Wrong buttons are all in the first screen. So the band is one strip:
   the heading, the live sentence from /api/survey, and one button that opens
   the two counters in place. Nothing that was in it is gone; it is one click
   away, and the strip itself never claims more than the survey says. */
export default function CareGoneWithout() {
  const st = useStore();
  const rows = useMemo(() => forgoneRows(), []);
  const [c, setC] = useState<ForgoneCounts>(EMPTY_FORGONE);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [rank, setRank] = useState<ForgoneRank | null>(null);
  const [teamTests, setTeamTests] = useState(0);
  const [noAnswers, setNoAnswers] = useState(false);
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const sentTotal = useRef(0);

  /* What the person already said on /journey that the mapper read as care they
     did not get. Shown with their own sentence; used to fill an empty box once. */
  /* A line opened from a share link carries the counter, not the words (R3 c1
     C1): it is counted here, and never quoted as "what you wrote". */
  const isShared = (e: (typeof st.entries)[number]) => !e.item && !!e.gapCategory && e.raw === sharedRaw(null, e.gapCategory);
  const carried = useMemo(
    () => gapPrefill(st.entries.filter((e) => !isShared(e)).map((e) => ({ raw: e.raw, times: e.times })))
      .lines.filter((l) => l.category === 'care-not-sought' || l.category === 'care-denied'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.entries],
  );
  const sharedCarried = useMemo(
    () => st.entries.filter(isShared)
      .filter((e) => e.gapCategory === 'care-not-sought' || e.gapCategory === 'care-denied')
      .map((e) => ({ category: e.gapCategory as ForgoneCategory, amount: Math.max(1, e.times) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.entries],
  );

  useEffect(() => {
    const saved = loadForgone();
    if (forgoneEntered(saved) === 0 && (carried.length || sharedCarried.length)) {
      const pre = { ...EMPTY_FORGONE };
      for (const l of [...carried, ...sharedCarried]) pre[l.category as ForgoneCategory] = Math.min(FORGONE_MAX, pre[l.category as ForgoneCategory] + l.amount);
      setC(pre);
    } else setC(saved);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (ready) saveForgone(c); }, [c, ready]);

  useEffect(() => {
    let live = true;
    fetch('/api/survey').then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!live) return;
      setRank(forgoneRank(j));
      setTeamTests(Number(j?.teamTests) || 0);
      setNoAnswers(surveyIsEmpty(j));
    }).catch(() => { /* no sentence rather than a stale one */ });
    return () => { live = false; };
  }, []);

  function bump(k: ForgoneCategory, d: number) {
    setC((p) => ({ ...p, [k]: Math.max(0, Math.min(FORGONE_MAX, p[k] + d)) }));
    setSendState('idle'); setSendMsg(null);
  }
  function setN(k: ForgoneCategory, v: string) {
    const n = Math.max(0, Math.min(FORGONE_MAX, Math.floor(Number(v) || 0)));
    setC((p) => ({ ...p, [k]: n }));
    setSendState('idle'); setSendMsg(null);
  }

  async function send() {
    const body = forgoneGapBody(c, TABLE_VERSION);
    if (!body) return;
    setSendState('sending'); setSendMsg(null);
    try {
      const r = await fetch('/api/gap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d && d.ok) { sentTotal.current = Object.values(body.counts).reduce((a, b) => a + (b ?? 0), 0); setSendState('sent'); }
      else { setSendState('error'); setSendMsg(typeof d?.error === 'string' ? d.error : 'The count could not be recorded just now. Nothing was saved, and you can try again.'); }
    } catch {
      setSendState('error'); setSendMsg('The count could not be sent. You may be offline. Nothing left this device.');
    }
  }

  const entered = forgoneEntered(c);
  const counted = c['care-not-sought'] + c['care-denied'];

  return (
    <section className="cgw" aria-labelledby="forgone-h" data-testid="care-gone-without">
      <div className="cgw-bar">
        <div className="cgw-head">
          <h2 id="forgone-h" className="cgw-h">Care you went without</h2>
          {rank ? (
            <p className="cgw-rank" data-testid="forgone-rank">{rankLine(rank, teamTests)} <Link href="/register/live">See the ranking</Link></p>
          ) : noAnswers ? (
            <p className="cgw-rank" data-testid="forgone-rank-empty">The burden survey has no answers yet. <Link href="/survey">Rank the five burdens</Link></p>
          ) : (
            <p className="cgw-rank">Counted, never priced.</p>
          )}
        </div>
        <button type="button" className="btn small ghost cgw-toggle" aria-expanded={open} aria-controls="forgone-panel" onClick={() => setOpen((o) => !o)}>
          {open ? <Icon.Minus /> : <Icon.Plus />}
          {open ? 'Hide the counters' : counted > 0 ? `Count it (${counted} so far)` : 'Count it'}
        </button>
      </div>
      {!open && carried.length > 0 && (
        <p className="micro cgw-carried">
          From what you wrote: {carried.map((l) => `“${l.raw.replace(/[.\s]+$/, '')}”`).join(', ')}. Counted, never priced.
        </p>
      )}

      <div id="forgone-panel" className="cgw-panel" hidden={!open}>
        <p className="cgw-lede">
          The total above prices care that happened. Care you needed and did not get leaves no bill, no claim and no row in
          any federal cost file. National surveys count that it happened; none attaches a dollar to it. So it has no price
          here, and it is never given one. Count it instead.
        </p>

        <div className="cgw-grid">
          {rows.map((row) => (
            <article key={row.id} className="cgw-card">
              <h3 className="cgw-card-h">{row.label}</h3>
              <p className="micro" style={{ margin: 0 }}>{row.prompt}</p>
              <div className="cgw-counter">
                <div className="stepper-n" role="group" aria-label={row.prompt} style={{ minHeight: '2.75rem' }}>
                  <button type="button" aria-label={`Fewer: ${row.label}`} style={TAP} onClick={() => bump(row.id, -1)}><Icon.Minus /></button>
                  <input type="number" min={0} max={FORGONE_MAX} inputMode="numeric" value={c[row.id]} aria-label={row.prompt}
                    style={{ height: '2.75rem', width: '3.6rem' }} onChange={(e) => setN(row.id, e.target.value)} />
                  <button type="button" aria-label={`More: ${row.label}`} style={TAP} onClick={() => bump(row.id, 1)}><Icon.Plus /></button>
                </div>
                <span className="micro" style={{ margin: 0 }}>{c[row.id] === 1 ? row.unit.replace(/s$/, '') : row.unit}</span>
                <span className="blank">{c[row.id] > 0 ? 'counted, not priced' : 'no price, by design'}</span>
              </div>
              <p className="micro" style={{ margin: 0 }}>For example: {row.examples.slice(0, 3).join(' · ')}</p>
              {carried.filter((l) => l.category === row.id).map((l, i) => (
                <p key={i} className="micro cgw-said">From what you wrote: &ldquo;{l.raw}&rdquo;</p>
              ))}
            </article>
          ))}
        </div>

        <div className="cgw-foot">
          {/* 🔴 NO GREY SLAB (judge J6, desktop F15). The send button exists only
              once there is something to send, and it is as wide as its words. */}
          {entered > 0 && (
            <button className="btn small primary" type="button" disabled={sendState === 'sending' || sendState === 'sent'} onClick={() => void send()}>
              {sendState === 'sending' ? 'Adding…' : 'Add it to the public count'}
            </button>
          )}
          <p className="micro" role="status" aria-live="polite" style={{ margin: 0 }}>
            {sendState === 'sent'
              ? <span className="sent-ok"><Icon.Check /> Added to the public count of care that produced zero rows.</span>
              : sendState === 'error' ? <span style={{ color: 'var(--flag-ink)' }}>{sendMsg}</span>
                : 'Only the numbers go. No name, no journey, no diagnosis, no IP address.'}
          </p>
          <p className="micro" style={{ margin: 0 }}>
            Kept only in this browser until you send it. <Link href="/gap">Count the rest of what went uncounted</Link>
          </p>
        </div>
      </div>
    </section>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import gapData from '@/data/invisible-events.json';
import { gapPrefill, type GapPrefillLine } from '@/lib/mapper';
import { useStore } from '@/lib/store';

type Cat = {
  id: string; label: string; prompt: string; examples: string[];
  whyInvisible: string; unit: string;
};

/** The public aggregate, exactly as GET /api/gap returns it. */
interface GapAggregate {
  ok: boolean;
  respondents: number;
  firstAt?: string; lastAt?: string;
  gap?: { category: string; respondentsReporting: number; totalReported: number; meanPerRespondent: number }[];
  communityWeights?: { category: string; rankedFirstBy: number; rankedAtAllBy: number }[];
  note?: string;
}
const CATS = gapData.categories as Cat[];
const labelOf = (id: string) => CATS.find((c) => c.id === id)?.label ?? id;
function ordinal(n: number): string {
  const r100 = n % 100, r10 = n % 10;
  const suffix = r100 >= 11 && r100 <= 13 ? 'th' : r10 === 1 ? 'st' : r10 === 2 ? 'nd' : r10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
const WEIGHTING = gapData.weighting;
const VERSION = gapData._version as string;

/**
 * 🔴 THE CORE PANEL.
 * Everything above this in the app prices what federal data already contains.
 * This panel collects what it does not — and then asks the affected person to
 * rank it, which is the community-elicited weighting Dr. Phillips asked for as
 * the first question of the sprint.
 */
export default function GapPanel({ context, onDone, onBack }: {
  context?: Record<string, string>;
  onDone: () => void;
  onBack: () => void;
}) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [ranking, setRanking] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [agg, setAgg] = useState<GapAggregate | null>(null);
  const [aggErr, setAggErr] = useState(false);
  const [carried, setCarried] = useState<GapPrefillLine[]>([]);

  /* 🔴 The person already told us. Whatever they typed on /journey that the
     mapper refused to price — a specialist they never saw, a referral they were
     denied, four years of searching — arrives here as a number already in its
     box, with the sentence it came from printed beside it. Nothing is sent, and
     every box is still theirs to change: this fills the form, it never answers
     it for them. */
  const st = useStore();
  const prefilled = useRef(false);
  useEffect(() => {
    if (!st.hydrated || prefilled.current || !st.entries.length) return;
    prefilled.current = true;
    const { counts: from, lines } = gapPrefill(st.entries.map((e) => ({ raw: e.raw, times: e.times })));
    if (!lines.length) return;
    setCarried(lines);
    setCounts((p) => ({ ...from, ...p }));
  }, [st.hydrated, st.entries]);

  // The return trip: as soon as their row lands, read the public aggregate back
  // and show them where they sit in it. Counts only, with the N they belong to.
  useEffect(() => {
    if (!sent) return;
    let live = true;
    fetch('/api/gap', { headers: { accept: 'application/json' } })
      .then((r) => r.json())
      .then((j: GapAggregate) => { if (live && j?.ok) setAgg(j); else if (live) setAggErr(true); })
      .catch(() => { if (live) setAggErr(true); });
    return () => { live = false; };
  }, [sent]);

  const reported = CATS.filter((c) => counts[c.id] > 0);

  function toggleRank(id: string) {
    setRanking((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }

  async function send() {
    setSending(true); setErr(null);
    try {
      const res = await fetch('/api/gap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counts, ranking,
          note: note.trim() || undefined,
          context, tableVersion: VERSION,
        }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Report was not saved.');
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Report was not saved.');
    }
    setSending(false);
  }

  if (sent) {
    return (
      <section className="step">
        <div className="wrap">
          <p className="eyebrow">Recorded</p>
          <h2>That is now countable.</h2>
          <p className="sub">
            What you just reported does not exist in MEPS, HCUP or Medicare claims — not as a small
            number, as <em>no number at all</em>. It is now one row in a structured count of what
            those files miss, with nothing in it that identifies you.
          </p>
          {agg && agg.respondents > 0 && (
            <div className="gap-back">
              <p className="eyebrow">Where that sits, right now</p>
              <p className="gap-back-n">
                You are the <b>{ordinal(agg.respondents)}</b> person to add a row to this count.
              </p>
              {!!agg.communityWeights?.length && (
                <>
                  <h3>Which burden people put first</h3>
                  <ul className="gap-bars">
                    {agg.communityWeights.slice(0, 6).map((w) => {
                      const top = Math.max(1, ...agg.communityWeights!.map((x) => x.rankedFirstBy));
                      return (
                        <li key={w.category}>
                          <span className="gb-l">{labelOf(w.category)}</span>
                          <span className="gb-track" aria-hidden="true">
                            <span className="gb-fill" style={{ width: `${(w.rankedFirstBy / top) * 100}%` }} />
                          </span>
                          <span className="gb-v">{w.rankedFirstBy} of {agg.respondents}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              {!!agg.gap?.length && (
                <>
                  <h3>What people have counted so far</h3>
                  <ul className="gap-counts">
                    {agg.gap.slice(0, 6).map((g) => (
                      <li key={g.category}>
                        <span>{labelOf(g.category)}</span>
                        <b>{g.totalReported.toLocaleString('en-US')}</b>
                        <i>{g.respondentsReporting} {g.respondentsReporting === 1 ? 'person' : 'people'} reporting</i>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="micro">
                Counts as entered, no weighting of our own, no extrapolation to a population — a
                description of the {agg.respondents} {agg.respondents === 1 ? 'person' : 'people'} who
                have answered{agg.firstAt ? `, since ${agg.firstAt.slice(0, 10)}` : ''}.
              </p>
            </div>
          )}
          {aggErr && (
            <p className="sub">Your row is saved. The running count could not be read just now.</p>
          )}
          <p className="sub">
            The aggregate is public and always will be:{' '}
            <a href="/api/gap" target="_blank" rel="noopener noreferrer">/api/gap</a>
          </p>
          <div className="step-actions">
            <button className="btn primary" onClick={onDone}>See what to do with all of this</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="step">
      <div className="wrap">
        <p className="sub">
          Care you needed and did not get produces no row in any federal file. Counting it here is the only way it exists.
        </p>
        <p className="sub">
          Nothing below is required, and nothing you enter identifies you.
        </p>

        {carried.length > 0 && (
          <div className="gap-back">
            <p className="eyebrow">Carried over from your own sentences</p>
            <ul className="gap-counts">
              {carried.map((l, i) => (
                <li key={`${l.raw}-${i}`}>
                  <span>“{l.raw}”</span>
                  <b>{l.amount}</b>
                  <i>{labelOf(l.category)} · {l.unit === 'months' ? 'months' : l.amount === 1 ? 'occasion' : 'occasions'}</i>
                </li>
              ))}
            </ul>
            <p className="micro">
              Those lines carried no federal figure, so they were never priced. The numbers below start
              from them and are yours to change. Nothing has been sent yet.
            </p>
          </div>
        )}

        <div className="gap-grid">
          {CATS.map((c) => (
            <article key={c.id} className={`gap-card ${counts[c.id] > 0 ? 'on' : ''}`}>
              <h3>{c.label}</h3>
              <p className="gap-prompt">{c.prompt}</p>
              <p className="gap-eg">{c.examples.slice(0, 3).map((e) => `“${e}”`).join(' · ')}</p>
              <label className="gap-input">
                <input
                  type="number" min={0} max={10000} inputMode="numeric"
                  value={counts[c.id] ?? ''}
                  placeholder="0"
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setCounts((p) => ({ ...p, [c.id]: Number.isFinite(v) && v >= 0 ? v : 0 }));
                  }}
                />
                <span>{c.unit}</span>
              </label>
              <details className="gap-why">
                <summary>Why no dataset has this</summary>
                <p>{c.whyInvisible}</p>
              </details>
            </article>
          ))}
        </div>

        {reported.length > 0 && (
          <div className="weighting">
            <p className="eyebrow">The question the economists keep asking</p>
            <h3>{WEIGHTING.question}</h3>
            <p className="sub">{WEIGHTING.instruction}</p>
            <div className="rank-row">
              {reported.map((c) => {
                const pos = ranking.indexOf(c.id);
                return (
                  <button
                    key={c.id}
                    className={`rank-chip ${pos >= 0 ? 'on' : ''}`}
                    aria-pressed={pos >= 0}
                    onClick={() => toggleRank(c.id)}
                  >
                    {pos >= 0 && <span className="rank-n">{pos + 1}</span>}
                    {c.label}
                  </button>
                );
              })}
            </div>
            <p className="micro">
              We report these as a frequency distribution across everyone who answers — how many
              people put each one first. We never turn them into a weighted index of our own. The
              weights belong to the people who carry the burden.
            </p>

            <label className="gap-note">
              <span>Anything else this cost you? (optional, and it stays de-identified)</span>
              <textarea
                rows={3} maxLength={400} value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Only if you want to."
              />
            </label>
          </div>
        )}

        {err && <p className="match-note miss">{err}</p>}

        <div className="step-actions">
          <button
            className="btn primary"
            disabled={sending || (!reported.length && !ranking.length)}
            onClick={send}
          >
            {sending ? 'Sending…' : 'Add this to the count'}
          </button>
          <button className="btn ghost" onClick={onBack}>Back</button>
          <button className="btn ghost" onClick={onDone}>Skip this</button>
        </div>
      </div>
    </section>
  );
}

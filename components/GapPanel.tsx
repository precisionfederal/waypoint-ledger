'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReveal } from './DataVisual';
import { IconNew, type IconNewName } from './IconsNew';
import gapData from '@/data/invisible-events.json';
import { TABLE_VERSION } from '@/lib/table';
import { gapPrefill, type GapPrefillLine } from '@/lib/mapper';
import { useStore } from '@/lib/store';

type Cat = {
  id: string; label: string; prompt: string; examples: string[];
  whyInvisible: string; unit: string;
};

/** The public aggregate, exactly as GET /api/gap returns it. */
interface GapAggregate {
  ok: boolean;
  /** JUDGE-4 #6: reports received. `respondents` on /api/gap is senders (a
   *  deprecated alias), so this panel used to print senders as reports. */
  reports?: number;
  submissions?: number;
  respondents: number;
  firstAt?: string; lastAt?: string;
  gap?: { category: string; respondentsReporting: number; totalReported: number; meanPerRespondent: number }[];
  communityWeights?: { category: string; rankedFirstBy: number; rankedAtAllBy: number }[];
  note?: string;
}
const CATS = gapData.categories as Cat[];
/** Reports received, from the field that says so; older bodies carry it as submissions. */
const reportsOf = (a: GapAggregate) => a.reports ?? a.submissions ?? a.respondents;
const labelOf = (id: string) => CATS.find((c) => c.id === id)?.label ?? id;
function ordinal(n: number): string {
  const r100 = n % 100, r10 = n % 10;
  const suffix = r100 >= 11 && r100 <= 13 ? 'th' : r10 === 1 ? 'st' : r10 === 2 ? 'nd' : r10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
const WEIGHTING = gapData.weighting;
const VERSION = gapData._version as string;

/* One line icon per kind of uncounted care (ART lane's IconsNew; critic-9: the six
   spot pictures read as one repeated thumbnail at card size). Decorative: the
   card's own heading names the kind. */
const CAT_ICON: Record<string, IconNewName> = {
  'care-not-sought': 'NotSought', 'care-denied': 'Refused', dismissed: 'ToldNothing',
  'wrong-track': 'WrongTarget', 'time-searching': 'TimeSearching', 'life-lost': 'OutsideMedicine',
};
/* FINAL-1011 (susan): "Care that made you worse" has no drawing in IconsNew yet, so
   its line icon lives here, on the same 24 grid, 1.8 stroke and round joins: a
   cross for the care, then a line that runs level and falls away. Decorative,
   like the rest; the card's heading names the kind. */
const LOCAL_ICON: Record<string, () => ReactNode> = {
  'care-made-worse': () => (
    <svg width={26} height={26} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 3.5v6M4 6.5h6" {...IP} strokeWidth={1.8} />
      <path d="M3.5 14h5l4 4 3-3 5 4.5" {...IP} strokeWidth={1.8} />
      <path d="M20.5 15v4.5H16" {...IP} strokeWidth={1.8} />
    </svg>
  ),
};
const IP = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/** The aggregate's bars grow once, when they are first seen. */
function GrowList({ children, className }: { children: ReactNode; className: string }) {
  const ref = useReveal<HTMLUListElement>();
  return <ul ref={ref} className={className}>{children}</ul>;
}

/**
 * 🔴 THE CORE PANEL.
 * Everything above this in the app prices what federal data already contains.
 * This panel collects what it does not — and then asks the affected person to
 * rank it, which is the community-elicited weighting Dr. Phillips asked for as
 * the first question of the sprint.
 */
export default function GapPanel({ context, onDone, onBack, renderMap }: {
  context?: Record<string, string>;
  onDone: () => void;
  onBack: () => void;
  /** Optional: a drawing of the gap that follows what has been counted (the /gap page passes one). */
  renderMap?: (counts: Record<string, number>, sent: boolean) => ReactNode;
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
  /* critic-21: the call to action never looks dead. With nothing entered it stays
     the primary button, says it is not ready (aria-disabled), and on a press points
     at the first counter instead of sending. */
  const nothing = !reported.length && !ranking.length;
  const [hint, setHint] = useState(false);
  const ask = () => {
    if (!nothing) { send(); return; }
    setHint(true);
    const first = document.querySelector<HTMLInputElement>('.gap-card input');
    first?.focus();
  };
  const setCount = (id: string, v: number) => setCounts((p) => ({ ...p, [id]: Math.max(0, Math.min(10000, v)) }));

  /* The confirmation replaces the form, which may have been scrolled far down:
     bring its heading into view and give it focus, so a screen reader hears it. */
  const doneH = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!sent || !doneH.current) return;
    const h = doneH.current;
    const top = h.getBoundingClientRect().top + window.scrollY - 120;
    if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top) });
    h.focus({ preventScroll: true });
  }, [sent]);

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
          context, tableVersion: TABLE_VERSION,
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
      <section className="step gp-done">
        <div className="wrap">
          <div className="gp-done-head">
            <svg className="gp-done-mark" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
              <circle className="gp-done-ring" cx="32" cy="32" r="29" pathLength={1} />
              <path className="gp-done-tick" d="M20 33.5l8 8 16-17" pathLength={1} />
            </svg>
            <div>
              <p className="eyebrow">Recorded</p>
              <h2 ref={doneH} tabIndex={-1}>That is now countable.</h2>
            </div>
          </div>
          <p className="sub">
            What you just reported does not exist in MEPS, HCUP or Medicare claims: not as a small
            number, as <em>no number at all</em>. It is now one row in a structured count of what
            those files miss, with nothing in it that identifies you.
          </p>
          {renderMap?.(counts, true)}
          {agg && reportsOf(agg) > 0 && (
            <div className="gap-back">
              <p className="eyebrow">Where that sits, right now</p>
              <p className="gap-back-n">
                Yours is the <b>{ordinal(reportsOf(agg))}</b> report on this count.
              </p>
              {!!agg.communityWeights?.length && (
                <>
                  <h3>Which burden each report put first</h3>
                  <GrowList className="gap-bars">
                    {agg.communityWeights.slice(0, CATS.length).map((w) => {
                      const top = Math.max(1, ...agg.communityWeights!.map((x) => x.rankedFirstBy));
                      return (
                        <li key={w.category}>
                          <span className="gb-l">{labelOf(w.category)}</span>
                          <span className="gb-track" aria-hidden="true">
                            <span className="gb-fill" style={{ width: `${(w.rankedFirstBy / top) * 100}%` }} />
                          </span>
                          <span className="gb-v">{w.rankedFirstBy} of {reportsOf(agg)}</span>
                        </li>
                      );
                    })}
                  </GrowList>
                </>
              )}
              {!!agg.gap?.length && (
                <>
                  <h3>What the reports have counted so far</h3>
                  <ul className="gap-counts">
                    {agg.gap.slice(0, CATS.length).map((g) => (
                      <li key={g.category}>
                        <span>{labelOf(g.category)}</span>
                        <b>{g.totalReported.toLocaleString('en-US')}</b>
                        <i>in {g.respondentsReporting} {g.respondentsReporting === 1 ? 'report' : 'reports'}</i>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="micro">
                Counts as entered, no weighting of our own, no extrapolation to a population: a
                description of the {reportsOf(agg)} {reportsOf(agg) === 1 ? 'report' : 'reports'} received{agg.firstAt ? `, since ${agg.firstAt.slice(0, 10)}` : ''}.
              </p>
            </div>
          )}
          {aggErr && (
            <p className="sub">Your row is saved. The running count could not be read just now.</p>
          )}
          <p className="sub">
            The aggregate is public and always will be:{' '}
            <a href="/api/gap" target="_blank" rel="noopener noreferrer">/api/gap</a>
            {' · '}<a href="/register/live#uncounted">See the count on the register &rarr;</a>
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
        {renderMap?.(counts, false)}
        <p className="sub">
          Care you needed and did not get leaves no row in any federal <b>cost</b> file: MEPS&rsquo;s event
          files, HCUP, Medicare claims. National surveys (<a href="https://www.cdc.gov/nchs/nhis/index.html" target="_blank" rel="noopener noreferrer">NHIS</a>, the National Health Interview Survey, and{' '}
          <a href="https://meps.ahrq.gov/mepsweb/about_meps/survey_back.jsp" target="_blank" rel="noopener noreferrer">MEPS</a>&rsquo;s own access-to-care questions) do count
          that it happened, to a share of the population; none of them attaches a dollar to it, and none of them is
          yours. This is the count of it, one report at a time.
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
          {CATS.map((c, i) => {
            const n = counts[c.id] ?? 0;
            return (
            <article key={c.id} className={`gap-card ${n > 0 ? 'on' : ''}`} aria-labelledby={`gp-${c.id}`}>
              <div className="gp-card-head">
                <span className="gp-ic">{CAT_ICON[c.id] ? IconNew[CAT_ICON[c.id]]({ size: 26 }) : LOCAL_ICON[c.id]?.() ?? null}</span>
                <span className="gp-ic-n" aria-hidden="true">{i + 1}</span>
                <h3 id={`gp-${c.id}`}>{c.label}</h3>
              </div>
              <p className="gap-prompt">{c.prompt}</p>
              <ul className="gap-eg" aria-label="For example">
                {c.examples.slice(0, 3).map((e) => <li key={e}>“{e}”</li>)}
              </ul>
              <div className="gap-input">
                <button type="button" className="gp-step" onClick={() => setCount(c.id, n - 1)} disabled={n <= 0}
                  aria-label={`One fewer: ${c.label}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 12h12" {...IP} strokeWidth={2} /></svg>
                </button>
                <label className="gp-num">
                  <span className="sr-only">{c.label}, in {c.unit}</span>
                  <input
                    type="number" min={0} max={10000} inputMode="numeric"
                    value={counts[c.id] ?? ''}
                    placeholder="0"
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setCounts((p) => ({ ...p, [c.id]: Number.isFinite(v) && v >= 0 ? v : 0 }));
                    }}
                  />
                </label>
                <button type="button" className="gp-step" onClick={() => setCount(c.id, n + 1)}
                  aria-label={`One more: ${c.label}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 12h12M12 6v12" {...IP} strokeWidth={2} /></svg>
                </button>
                <span className="gp-unit" aria-hidden="true">{c.unit}</span>
              </div>
              <details className="gap-why">
                <summary>Why no dataset has this</summary>
                <div className="gp-why-body"><p>{c.whyInvisible}</p></div>
              </details>
            </article>
            );
          })}
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
              We report these as a frequency distribution across every report: how many
              put each one first. We never turn them into a weighted index of our own. The
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
            disabled={sending}
            aria-disabled={nothing || undefined}
            aria-describedby={hint && nothing ? 'gp-hint' : undefined}
            onClick={ask}
          >
            {sending ? 'Sending…' : 'Add this to the count'}
          </button>
          <button className="btn ghost" onClick={onBack}>Back</button>
          <button className="btn ghost" onClick={onDone}>Skip this</button>
        </div>
        <p id="gp-hint" className="gp-hint" role="status">{hint && nothing ? 'Put a number in any card.' : ''}</p>
      </div>
    </section>
  );
}

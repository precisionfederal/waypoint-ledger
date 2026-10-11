'use client';

/* ==========================================================================
   /register/channel?c=<label> — one organization's own count.

   What came in through one survey link, read from GET /api/survey/channel,
   which applies the small-cell rule on the server: under 11 answers nothing is
   served but "fewer than 11", and nothing anyone said about themselves is ever
   served per link. This page prints exactly what that endpoint returns.
   ========================================================================== */

import { useEffect, useState } from 'react';
import Link from '@/components/IntentLink';
/* BURDENS from survey-def, not lib/survey: lib/survey pulls the 4 KB column dictionary
   (defect-columns) into this page's own chunk (re-merge: 22,003 bytes against 6,800). */
import { BURDENS, normalizeChannel, SMALL_CELL_MIN } from '@/lib/survey-def';
import s from '@/app/adopt/kit/kit.module.css';
import v from './OrgKitChannel.module.css';
import ThemedImg from './ThemedImg';
import { CountUp, useReveal } from './DataVisual';

interface Rank { burden: string; rankedFirstBy: number; rankedLastBy: number; meanRank: number | null }
interface ChannelAgg {
  ok: boolean; error?: string; channel?: string; n?: number | null; withheld?: boolean; note?: string;
  firstOn?: string; lastOn?: string; ranking?: Rank[]; lead?: Record<string, number>; method?: string; smallCellMin?: number;
}

const labelOf = (id: string) => BURDENS.find((b) => b.id === id)?.label ?? id;

/* VISUAL data (2026-09-30 night): the ranking drawn. One row per cost: how many
   answers put it heaviest, as a bar against the answers through this link, with
   its mean rank printed beside it. The table under it carries the same numbers. */
function RankBars({ ranking, n }: { ranking: Rank[]; n: number }) {
  const grow = useReveal<HTMLUListElement>();
  return (
    <ul ref={grow} className={v.bars} aria-hidden="true">
      {ranking.map((r, i) => (
        <li key={r.burden} style={{ ['--d' as string]: `${i * 80}ms` }}>
          <span className={v.barName}>{labelOf(r.burden)}</span>
          <span className={v.track}><span style={{ width: `${n > 0 ? Math.min(100, (100 * r.rankedFirstBy) / n) : 0}%` }} /></span>
          <span className={v.barVal}><b>{r.rankedFirstBy}</b> heaviest &middot; mean {r.meanRank ?? 'none'}</span>
        </li>
      ))}
    </ul>
  );
}

/** The empty or withheld count, with its picture: a young count, never a broken one. */
function Quiet({ children }: { children: React.ReactNode }) {
  return (
    <div className={`card ${v.quiet}`}>
      <ThemedImg light="/img/v2/empty-register.webp" dark="/img/v2/empty-register-dark.webp" width={480} height={435} alt="" className={v.quietArt} />
      <div className={v.quietBody}>{children}</div>
    </div>
  );
}
const day = (d?: string) => {
  if (!d) return '';
  const t = new Date(`${d}T12:00:00Z`);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

export default function OrgKitChannel() {
  const [label, setLabel] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [agg, setAgg] = useState<ChannelAgg | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'failed'>('idle');

  useEffect(() => {
    try {
      const c = new URLSearchParams(window.location.search).get('c');
      if (c) { setTyped(c); setLabel(normalizeChannel(c)); }
    } catch { /* no query: the lookup box is the page */ }
  }, []);

  useEffect(() => {
    if (!label) return;
    let live = true;
    setState('loading');
    fetch(`/api/survey/channel?c=${encodeURIComponent(label)}`, { headers: { accept: 'application/json' } })
      .then((r) => r.json())
      .then((j: ChannelAgg) => { if (live) { setAgg(j); setState(j.ok ? 'done' : 'failed'); } })
      .catch(() => { if (live) setState('failed'); });
    return () => { live = false; };
  }, [label]);

  const look = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = normalizeChannel(typed);
    setLabel(slug);
    if (slug) history.replaceState(null, '', `?c=${slug}`);
  };

  const min = agg?.smallCellMin ?? SMALL_CELL_MIN;
  const leadTop = agg?.lead ? Object.entries(agg.lead).sort((a, b) => b[1] - a[1]) : [];

  return (
    <section className={`page ${s.kit}`}>
      <div className="wrap">
        <header className={v.hero}>
          <div className={v.heroCopy}>
            <p className="eyebrow">The register &middot; one link</p>
            <h1>{label ? <>Answers through the link labelled &ldquo;{label}&rdquo;</> : 'Answers through one survey link'}</h1>
            <p className="sub">
              A patient organization or clinic that shares the survey with its own label sees its community&rsquo;s
              answers here, counted on their own. Fewer than {min} answers are never shown as a number.
            </p>
          </div>
          {/* VISUAL data: villages each lighting its own copy of the path (ART lane, adopt-hero, 1200x525). Decorative. */}
          <ThemedImg light="/img/v2/adopt-hero.webp" dark="/img/v2/adopt-hero-dark.webp" width={1200} height={525} alt="" className={v.heroArt} loading="eager" fetchPriority="high" />
        </header>

        <form className={`${s.lookup} ${v.lookup}`} onSubmit={look}>
          <label className="field">
            <span>Link label</span>
            <input type="text" value={typed} maxLength={60} spellCheck={false} autoCapitalize="none" onChange={(e) => setTyped(e.target.value)} placeholder="your-org" />
          </label>
          <button type="submit" className="btn primary">Show the count</button>
        </form>
        {typed && label === null && state === 'idle' && <p className={s.warn} role="status">That label has no letters or digits left once it is read.</p>}

        <div aria-live="polite" data-testid="channel-result">
          {state === 'loading' && <p className="micro">Reading the count&hellip;</p>}
          {state === 'failed' && <p className={s.warn}>{agg?.error ?? 'The count could not be read right now. Nothing on this page is guessed, so it shows nothing instead.'}</p>}
          {state === 'done' && agg && agg.n === 0 && (
            <Quiet><p><strong>{agg.note}</strong></p><p className="micro">The link is <span className={s.mono}>/survey?c={agg.channel}</span>. <Link href={`/adopt/kit?c=${encodeURIComponent(agg.channel ?? label ?? "")}`}>Make its QR code and flyer</Link>.</p></Quiet>
          )}
          {state === 'done' && agg && agg.withheld && (
            <Quiet>
              <p><strong>Fewer than {min} answers so far.</strong> {agg.note}</p>
              <p className="micro">This is the same rule the whole register follows: a count this small could point at a person, so it is not published, not here and not by date.</p>
            </Quiet>
          )}
          {state === 'done' && agg && typeof agg.n === 'number' && agg.n > 0 && (
            <>
              <div className={`${s.stats} ${v.stats}`}>
                <div className={s.stat}><b data-testid="channel-n"><CountUp value={agg.n} /></b><span>answers through this link</span></div>
                <div className={s.stat}><b>{day(agg.firstOn)}</b><span>first answer (the day, never the time)</span></div>
                <div className={s.stat}><b>{day(agg.lastOn)}</b><span>latest answer</span></div>
              </div>
              <h2>How these answers ranked the five costs</h2>
              <div className={`card ${v.chart}`}>
                <RankBars ranking={agg.ranking ?? []} n={agg.n} />
              </div>
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Ranking of the five costs through this link">
                <table className="ledger-table">
                  <thead><tr><th scope="col">Cost</th><th scope="col">Mean rank (1 is heaviest)</th><th scope="col">Ranked heaviest by</th></tr></thead>
                  <tbody>
                    {(agg.ranking ?? []).map((r) => (
                      <tr key={r.burden}><th scope="row">{labelOf(r.burden)}</th><td>{r.meanRank ?? 'none'}</td><td>{r.rankedFirstBy} answers</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {leadTop.length > 0 && (
                <p>A tool should lead with: {leadTop.map(([k, v], i) => <span key={k}>{i ? '; ' : ''}{labelOf(k)} ({v})</span>)}.</p>
              )}
              <p className="micro">{agg.method}</p>
            </>
          )}
        </div>

        <p className="micro">
          Anyone who has a link can answer through it, so this is a count of answers through the link and never a
          count of an organization&rsquo;s members. Nothing anyone said about themselves is shown per link. The
          whole register is at <Link href="/register/live">/register/live</Link>; to make a link of your own, use{' '}
          <Link href="/adopt/kit">the kit</Link>.
        </p>
      </div>
    </section>
  );
}

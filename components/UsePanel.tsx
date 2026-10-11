'use client';
/* USE, ON THE LIVE REGISTER.

   The Execution row asks whether this is used, not whether it could be. So
   the live register shows how often each real action happened, week by week,
   from the day counting began, read from GET /api/use. Counts of actions, not
   people: there is nothing in the table to count people with. Our own tests
   and known bots are left out and the number left out is printed, so the
   exclusion can be seen working. A small number is shown at its size. */
import { useEffect, useState } from 'react';
import styles from './UsePanel.module.css';

interface UseAction { id: string; label: string; how: string }
interface UseWeek { weekStart: string; counts: Record<string, number> }
export interface UsePayload {
  ok: boolean; since: string | null; asOf: string;
  actions: UseAction[]; weeks: UseWeek[]; weeksTotal: number; weeksShown: number;
  totals: Record<string, number>; total: number;
  programs: Record<string, number>; programTotal: number;
  leftOut: { synthetic: number; bot: number };
}

/** "Oct 5, 2026", the one date form the site prints in prose (FLOW judge-8), read in
 *  UTC so the day never shifts with the reader's clock. */
export function dayLabel(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const t = Date.parse(iso.slice(0, 10) + 'T00:00:00Z');
  return new Date(t).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
const shortDay = (iso: string) => {
  const t = Date.parse(iso.slice(0, 10) + 'T00:00:00Z');
  return new Date(t).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};
const n = (x: number) => x.toLocaleString('en-US');
const plural = (k: number, one: string, many: string) => `${n(k)} ${k === 1 ? one : many}`;

/** Pure. The sentence that says how big the numbers are, in their own size.
 *  The period is named by the day counting began, never by a count of calendar
 *  weeks: counting that began this morning spans "1 week" only on a calendar,
 *  and "in 1 week" would claim seven days that have not passed. */
export function sizeLine(p: UsePayload): string {
  const since = dayLabel(p.since);
  if (p.total === 0) {
    return since
      ? `Nothing has been counted from a browser yet, since counting began on ${since}. That is a count of zero, not a hidden number.`
      : 'Nothing has been counted from a browser yet. That is a count of zero, not a hidden number.';
  }
  return `${plural(p.total, 'action', 'actions')} from a browser${since ? ` since ${since}` : ''}.${p.total < 100 ? ' These are small numbers, shown at their size.' : ''}`;
}

/** Pure. "3 ledgers priced through the open API, 2 story readings" for the program line. */
export function programLine(p: UsePayload): string {
  return p.actions
    .filter((a) => (p.programs[a.id] || 0) > 0)
    .map((a) => `${a.label.charAt(0).toLowerCase()}${a.label.slice(1)}: ${n(p.programs[a.id])}`)
    .join(' · ');
}

export default function UsePanel() {
  const [p, setP] = useState<UsePayload | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    let live = true;
    fetch('/api/use', { headers: { accept: 'application/json' }, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: UsePayload) => { if (!live) return; if (j && j.ok && Array.isArray(j.actions)) { setP(j); setPhase('ok'); } else setPhase('error'); })
      .catch(() => { if (live) setPhase('error'); });
    return () => { live = false; };
  }, []);

  const weeks = p ? [...p.weeks].reverse() : [];   // newest first, beside the total
  /* VISUAL data: each action's total also drawn as a bar against the largest total,
     beside the number it draws; the number is what is read. */
  const top = p ? Math.max(1, ...p.actions.map((a) => p.totals[a.id] || 0)) : 1;
  const bar = (v: number) => <span className={styles.bar} aria-hidden="true"><span style={{ width: `${v > 0 ? Math.max(2, (100 * v) / top) : 0}%` }} /></span>;

  return (
    <section className={`card ${styles.panel}`} aria-labelledby="use-h">
      <h2 id="use-h" className={styles.h}>
        Site use{p?.since ? <>, counted from {dayLabel(p.since)}</> : null} <span className={styles.hNote}>(a separate counter)</span>
      </h2>
      <p className={styles.lede}>
        Counts of actions, never of who took them. One number per day for each thing below, with no cookie, no address and nothing
        anyone typed. Our own tests and known bots are left out.
      </p>

      {phase === 'loading' && <p className={styles.note} role="status">Reading the counts…</p>}
      {phase === 'error' && <p className={styles.note} role="status">The counts could not be read just now. They are unread, not zero.</p>}

      {phase === 'ok' && p && !p.since && (
        <p className={styles.note}>
          Counting starts with the first action after this build went live. Nothing has been counted yet, so there is
          no start date to show.
        </p>
      )}

      {phase === 'ok' && p && p.since && (
        <>
          <p className={styles.size}>{sizeLine(p)}</p>
          <p className={styles.note}>This counter starts on {dayLabel(p.since)} and adds up actions from a browser only: our own tests, known bots and calls from programs are not in it (see below). The tiles above count every stored answer, whoever sent it, from the first one on.</p>
          {/* Phones: one card per action (the table below is hidden there), so no
              column ever runs past the screen. Same numbers, same order. */}
          <p id="use-cards-cap" className={styles.cardsCap}>
            Actions by week, newest first. Weeks start on Monday (UTC). Counting began {dayLabel(p.since)}.
          </p>
          <ul className={styles.cards} aria-labelledby="use-cards-cap">
            {p.actions.map((a) => (
              <li key={a.id} className={styles.cardRow}>
                <div className={styles.cardTop}>
                  <span className={styles.cardName}>{a.label}</span>
                  <span className={styles.cardTotal}><span className={styles.cardTotalLbl}>Since {dayLabel(p.since)}</span> {n(p.totals[a.id] || 0)}</span>
                </div>
                {bar(p.totals[a.id] || 0)}
                <ul className={styles.cardWeeks}>
                  {weeks.map((w) => (
                    <li key={w.weekStart}><span>Week of {shortDay(w.weekStart)}</span> <b>{n(w.counts[a.id] || 0)}</b></li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <div className={styles.scroll} role="region" aria-labelledby="use-cap" tabIndex={0}>
            <table className={styles.table}>
              <caption id="use-cap" className={styles.cap}>
                Actions by week, newest first. Weeks start on Monday (UTC). Counting began {dayLabel(p.since)}.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Action</th>
                  <th scope="col" className={styles.num}>Since {dayLabel(p.since)}</th>
                  {weeks.map((w) => <th scope="col" className={styles.num} key={w.weekStart}>Week of {shortDay(w.weekStart)}</th>)}
                </tr>
              </thead>
              <tbody>
                {p.actions.map((a) => (
                  <tr key={a.id}>
                    <th scope="row"><span className={styles.rowName}>{a.label}</span>{bar(p.totals[a.id] || 0)}</th>
                    <td className={`${styles.num} ${styles.total}`}>{n(p.totals[a.id] || 0)}</td>
                    {weeks.map((w) => <td className={styles.num} key={w.weekStart}>{n(w.counts[a.id] || 0)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.weeksTotal > p.weeksShown && (
            <p className={styles.note}>The table lists the latest {p.weeksShown} weeks; the totals cover all {p.weeksTotal}.</p>
          )}
          {p.programTotal > 0 && (
            <p className={styles.note}>
              Counted apart: {plural(p.programTotal, 'call', 'calls')} from programs rather than a browser, through the open
              API ({programLine(p)}).
            </p>
          )}
          <p className={styles.note}>
            Left out: {plural(p.leftOut.synthetic, 'action', 'actions')} from our own tests, which say who they are, and{' '}
            {plural(p.leftOut.bot, 'action', 'actions')} from known bots and automated browsers.
          </p>
          <details className={styles.how}>
            <summary>How each one is counted</summary>
            <dl>
              {p.actions.map((a) => (
                <div key={a.id}><dt>{a.label}</dt><dd>{a.how}</dd></div>
              ))}
            </dl>
          </details>
          <p className={styles.note}>
            The same counts, as data: <a href="/api/use">/api/use</a>. Read as of {dayLabel(p.asOf)}.
          </p>
        </>
      )}
    </section>
  );
}

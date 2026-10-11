'use client';
/* The live heads of the register, read from /api/integrity?verify=1: we walk
   every chain on request and publish the result, including a failure. If the
   endpoint cannot be reached, this says so; it never shows a stale digest as if
   it were current.
   PAGES R1 (2026-09-30 night): one card per chain instead of a four-column
   table, and each card now lists the fields its chain covers, which /integrity
   has always said "the table above" shows. */
import { useEffect, useState } from 'react';
import s from './IntegrityPanel.module.css';

/* The chain drawing and its in-browser checker (components/tech/ChainDraw.tsx,
   chain.ts) load beside the fetch, not with the page (PERF, 2026-10-01). The
   placeholder stays until both are here, so the cards never move down when the
   drawing arrives. If the drawing cannot load, the cards show without it. */
type Draw = typeof import('./tech/ChainDraw').default;
const loadDraw = () => import('./tech/ChainDraw');

interface Head {
  table: string;
  head: string;
  rows: number;
  updatedAt: string;
  covers: string[];
  unchainedLegacyRows: number | null;
  verified?: { ok: boolean | null; walked?: number; recomputedHead?: string; brokeAt?: number | null; reason?: string | null };
}
interface Payload { ok: boolean; genesis: string; priceTableVersion: string; publishedFigures: number; tables: Head[]; generatedAt: string }

const NAMES: Record<string, [string, string]> = {
  corrections: ['Corrections', 'a thumb on one published figure'],
  gap_reports: ['Gap reports', 'care that was needed and never billed'],
  survey_responses: ['Burden rankings', ''],
  interviews: ['Written interviews', 'arrival, consent and channel only'],
};

const short = (h: string) => (h && h.length === 64 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h || 'none');

const Tick = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function IntegrityPanel() {
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ChainDraw, setChainDraw] = useState<Draw | 'none' | null>(null);

  useEffect(() => {
    let live = true;
    loadDraw().then((m) => { if (live) setChainDraw(() => m.default); }).catch(() => { if (live) setChainDraw('none'); });
    fetch('/api/integrity?verify=1', { headers: { accept: 'application/json' } })
      .then((r) => r.json())
      .then((j) => { if (live) { if (j && j.ok) setD(j); else setErr('The register could not be read just now.'); } })
      .catch(() => { if (live) setErr('The register could not be reached from this device just now.'); });
    return () => { live = false; };
  }, []);

  if (err) return <div className="notice warn"><p>{err} Nothing here is cached, so no digest is shown rather than an old one.</p></div>;
  if (!d || !ChainDraw) return <p className="micro">Reading the heads and walking every chain…</p>;

  return (
    <>
      {ChainDraw !== 'none' && <ChainDraw chains={d.tables} />}
      <ul className={s.heads} aria-label="The current head of each chain in the register">
        {d.tables.map((t) => {
          const [name, what] = NAMES[t.table] ?? [t.table, ''];
          const v = t.verified;
          return (
            <li key={t.table} className={s.card}>
              <div className={s.top}>
                <p className={s.name}>{name}{what && <span className={s.what}>{what}</span>}</p>
                <p className={s.entries}><b>{t.rows.toLocaleString('en-US')}</b> {t.rows === 1 ? 'entry' : 'entries'}</p>
              </div>
              {t.unchainedLegacyRows ? <p className={s.note}>{t.unchainedLegacyRows} written before the chain, not covered</p> : null}
              <dl className={s.facts}>
                <div><dt>Head</dt><dd><code title={t.head}>{short(t.head)}</code></dd></div>
                <div><dt>Table</dt><dd><code>{t.table}</code></dd></div>
                {t.covers?.length ? <div><dt>Covers</dt><dd>{t.covers.join(', ')}</dd></div> : null}
              </dl>
              <p className={`${s.status} ${v?.ok === true ? s.ok : v?.ok === false ? s.bad : s.neutral}`}>
                {v?.ok === true && <><Tick /> <span>Recomputed: matches, {v.walked} row{v.walked === 1 ? '' : 's'} walked</span></>}
                {v?.ok === false && <strong>Does not match at row {String((v.brokeAt ?? 0) + 1)}: {v.reason}</strong>}
                {v?.ok === null && <span>{v.reason}</span>}
                {!v && <span>Not walked</span>}
              </p>
            </li>
          );
        })}
      </ul>
      <p className={`micro ${s.foot}`}>
        Read at {new Date(d.generatedAt).toLocaleString('en-US')} · price table {d.priceTableVersion} · {d.publishedFigures} published figures ·
        raw: <a href="/api/integrity?verify=1">/api/integrity?verify=1</a>
      </p>
    </>
  );
}

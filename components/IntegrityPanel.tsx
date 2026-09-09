'use client';
/* The live heads of the register, read from /api/integrity?verify=1 — we walk
   every chain on request and publish the result, including a failure. If the
   endpoint cannot be reached, this says so; it never shows a stale digest as if
   it were current. */
import { useEffect, useState } from 'react';

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

const NAMES: Record<string, string> = {
  corrections: 'Corrections — a thumb on one published figure',
  gap_reports: 'Gap reports — care that was needed and never billed',
  survey_responses: 'Burden rankings',
  interviews: 'Written interviews (arrival, consent and channel only)',
};

const short = (h: string) => (h && h.length === 64 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h || '—');

export default function IntegrityPanel() {
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/integrity?verify=1', { headers: { accept: 'application/json' } })
      .then((r) => r.json())
      .then((j) => { if (live) { if (j && j.ok) setD(j); else setErr('The register could not be read just now.'); } })
      .catch(() => { if (live) setErr('The register could not be reached from this device just now.'); });
    return () => { live = false; };
  }, []);

  if (err) return <div className="notice warn"><p>{err} Nothing here is cached, so no digest is shown rather than an old one.</p></div>;
  if (!d) return <p className="micro">Reading the heads and walking every chain…</p>;

  return (
    <>
      <div className="table-scroll" tabIndex={0}>
        <table className="ledger-table">
          <caption className="sr-only">The current head of each chain in the register</caption>
          <thead>
            <tr><th scope="col">Chain</th><th scope="col" className="r">Entries</th><th scope="col">Head</th><th scope="col">Recomputed</th></tr>
          </thead>
          <tbody>
            {d.tables.map((t) => (
              <tr key={t.table}>
                <td>
                  {NAMES[t.table] ?? t.table}
                  <span className="li-sub mono">{t.table}</span>
                </td>
                <td className="r">{t.rows.toLocaleString('en-US')}
                  {t.unchainedLegacyRows ? <span className="li-sub">{t.unchainedLegacyRows} written before the chain, not covered</span> : null}
                </td>
                <td className="mono">{short(t.head)}</td>
                <td>
                  {t.verified?.ok === true && <span>Matches, {t.verified.walked} row{t.verified.walked === 1 ? '' : 's'} walked</span>}
                  {t.verified?.ok === false && <strong>Does not match at row {String((t.verified.brokeAt ?? 0) + 1)} — {t.verified.reason}</strong>}
                  {t.verified?.ok === null && <span className="micro">{t.verified.reason}</span>}
                  {!t.verified && <span className="micro">not walked</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="micro">
        Read at {new Date(d.generatedAt).toLocaleString('en-US')} · price table {d.priceTableVersion} · {d.publishedFigures} published figures ·
        raw: <a href="/api/integrity?verify=1">/api/integrity?verify=1</a>
      </p>
    </>
  );
}

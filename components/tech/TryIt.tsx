'use client';
/* /developers hero: one live GET to /api/table/cms-99213, made by this
   browser when the page opens, shown two ways: the figure as a person would
   read it, and the raw JSON exactly as it arrived. Nothing here is a stored
   copy: if the call fails, the panel says so and shows no number at all.
   VISUAL tech, 2026-09-30 night. */
import { useCallback, useEffect, useRef, useState } from 'react';
import t from './tech.module.css';

const PATH = '/api/table/cms-99213';

interface Range { nationalUsd: number; lowUsd: number; lowLocalityName: string; highUsd: number; highLocalityName: string; localityCount: number }
interface Item { id: string; label: string; valueUsd: number; basis: string; year: string; population?: string; sourceTitle?: string; sourceUrl?: string; confidence?: string; code?: string }
interface Res { ok: boolean; version?: string; item?: Item; localityRange?: Range | null }

const usd = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* JSON, coloured with one pass: keys, strings, numbers, literals. Every
   character of the pretty-printed answer stays as it is. */
function Json({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let i = 0;
  for (const m of text.matchAll(/("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?)|\b(true|false|null)\b/g)) {
    const at = m.index ?? 0;
    if (at > i) parts.push(text.slice(i, at));
    const k = m[1] ? (m[2] ? t.key : t.str) : m[3] ? t.num : t.lit;
    parts.push(<span key={at} className={k}>{m[1] ?? m[0]}</span>);
    if (m[2]) parts.push(m[2]);
    i = at + m[0].length;
  }
  parts.push(text.slice(i));
  return <>{parts}</>;
}

export default function TryIt() {
  const [res, setRes] = useState<{ status: number; ms: number; body: Res; raw: string } | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'read' | 'json'>('read');
  const [shown, setShown] = useState(0);
  const [wide, setWide] = useState(true);
  const raf = useRef(0);

  const call = useCallback(async () => {
    setBusy(true); setErr(false);
    const t0 = performance.now();
    try {
      const r = await fetch(PATH, { headers: { accept: 'application/json' }, cache: 'no-store' });
      const body = (await r.json()) as Res;
      if (!body || !body.ok || !body.item) throw new Error('not ok');
      setRes({ status: r.status, ms: Math.round(performance.now() - t0), body, raw: JSON.stringify(body, null, 2) });
    } catch { setRes(null); setErr(true); }
    setBusy(false);
  }, []);

  useEffect(() => { setWide(window.matchMedia('(min-width: 641px)').matches); call(); }, [call]);

  /* the figure rises once to the value the API sent; reduced motion shows it at once */
  const v = res?.body.item?.valueUsd;
  useEffect(() => {
    if (v == null) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(v); return; }
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 520);
      setShown(v * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [v]);

  const it = res?.body.item;
  const lr = res?.body.localityRange;
  const pos = (x: number) => (lr ? ((x - lr.lowUsd) / (lr.highUsd - lr.lowUsd)) * 100 : 0);

  return (
    <section className={t.try} aria-labelledby="try-h">
      <div className={t.tryBar}>
        <span className={t.dots} aria-hidden="true"><i /><i /><i /></span>
        <h2 id="try-h" className={t.tryH}>Try it: a live call from this page</h2>
      </div>
      <div className={t.req}>
        <span className={t.mGet}>GET</span>
        <a className={t.reqUrl} href={PATH}>{PATH}</a>
        <button type="button" className={t.send} onClick={call} disabled={busy}>
          {busy ? 'Calling…' : res ? 'Call again' : 'Send'}
        </button>
      </div>
      <p className={t.status} role="status" aria-live="polite">
        {busy && !res && 'Calling the API from your browser…'}
        {res && <><span className={t.ok}><i aria-hidden="true" />{res.status} OK</span><span>{res.ms} ms</span><span>price table {res.body.version}</span></>}
        {err && !busy && <>The live call could not be made from this device just now. <a href={PATH}>Open {PATH}</a> in a new tab to see the answer.</>}
      </p>

      {res && it && (
        <>
          <div className={t.seg} role="group" aria-label="Show the answer as">
            <button type="button" aria-pressed={view === 'read'} onClick={() => setView('read')}>As a person reads it</button>
            <button type="button" aria-pressed={view === 'json'} onClick={() => setView('json')}>Raw JSON</button>
          </div>
          {view === 'read' ? (
            <div className={t.read}>
              <p className={t.rLabel}>{it.label}</p>
              <p className={t.rFig}>
                <span aria-hidden="true">{usd(shown)}</span><span className="sr-only">{usd(it.valueUsd)}</span>
                <span className={t.rPer}>the {it.year} figure</span>
              </p>
              <ul className={t.chips} aria-label="What this figure is">
                {it.code && <li>{it.code}</li>}
                <li>Basis: {it.basis}</li>
                {it.confidence && <li>{it.confidence.toLowerCase()}</li>}
                <li className={t.chipId}>Row {it.id}</li>
              </ul>
              {/* on a phone the rest of the answer is one tap away; on a wide screen it opens by itself */}
              <details className={t.more} open={wide}>
              <summary>Who it describes{lr ? `, its range across ${lr.localityCount} places` : ''} and its source</summary>
              {it.population && <p className={t.rWho}><b>Who it describes:</b> {it.population}</p>}
              {lr && (
                <figure className={t.range}>
                  <figcaption>Across the {lr.localityCount} places Medicare prices separately</figcaption>
                  <div className={t.track} aria-hidden="true">
                    <span className={t.fill} />
                    <span className={t.nat} style={{ left: `${pos(lr.nationalUsd)}%` }} />
                  </div>
                  <div className={t.ends}>
                    <span><b>{usd(lr.lowUsd)}</b> {lr.lowLocalityName}</span>
                    <span className={t.endsNat}>national <b>{usd(lr.nationalUsd)}</b></span>
                    <span><b>{usd(lr.highUsd)}</b> {lr.highLocalityName}</span>
                  </div>
                </figure>
              )}
              {it.sourceUrl && <p className={t.rSrc}>Source: <a href={it.sourceUrl}>{it.sourceTitle || it.sourceUrl}</a></p>}
              </details>
            </div>
          ) : (
            <pre className={`${t.pre} ${t.tall} ${t.rawPre}`} tabIndex={0} aria-label="The raw JSON answer"><code><Json text={res.raw} /></code></pre>
          )}
        </>
      )}
    </section>
  );
}

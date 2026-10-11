'use client';
/* ==========================================================================
   /integrity: each chain drawn as linked blocks, from the numbers
   /api/integrity?verify=1 returned to this page (rows, head), and a button
   that checks the published files in this browser (components/tech/chain.ts).

   Before the check, a block shows only what the endpoint said: its place in
   the chain, and on the last block the head. After the check, each block
   shows the first eight characters of its published row_hash and whether it
   recomputed (corrections) or linked to the row above (survey, gap). Nothing
   is drawn that the endpoint or the file did not say.
   VISUAL tech, 2026-09-30 night.
   ========================================================================== */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CHECKABLE, GENESIS, checkLinks, parseCsv, recomputeCorrections, type Walk } from './chain';
import t from './chain.module.css';

export interface ChainHead { table: string; head: string; rows: number; verified?: { ok: boolean | null; walked?: number; reason?: string | null } }

const MAXB = 12;
/* block sizes: full, and compact where the chain has under 480 px (phones) */
const SIZE = { full: { BW: 124, BH: 58, GX: 30, GY: 30, PAD: 12, Y1: 22, Y2: 43 }, compact: { BW: 96, BH: 48, GX: 16, GY: 16, PAD: 9, Y1: 19, Y2: 38 } };
const s8 = (h: string) => (h ? h.slice(0, 8) : '');

/** Which blocks to draw: the start, then every row, or the first and last few with a gap between. */
function plan(rows: number): (number | 'gap')[] {
  const all = Array.from({ length: rows + 1 }, (_, i) => i);
  if (all.length <= MAXB) return all;
  return [...all.slice(0, 6), 'gap', ...all.slice(-5)];
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.floor(el.clientWidth)));
    ro.observe(el); setW(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Chain({ c, name, walk, shown }: { c: ChainHead; name: string; walk?: Walk; shown: number }) {
  const [ref, W] = useWidth();
  const small = W > 0 && W < 480;
  const { BW, BH, GX, GY, PAD, Y1, Y2 } = small ? SIZE.compact : SIZE.full;
  const sh = (h: string) => (small ? h.slice(0, 6) : s8(h));
  const sep = small ? ' · ' : ', the ';
  const items = plan(c.rows);
  const cols = Math.max(1, Math.min(items.length, Math.floor((W + GX) / (BW + GX))));
  const lines = Math.ceil(items.length / cols);
  const used = cols * (BW + GX) - GX;
  const ox = Math.max(0, Math.floor((W - used) / 2));
  const pos = items.map((_, i) => {
    const r = Math.floor(i / cols); let k = i % cols; if (r % 2) k = cols - 1 - k;
    return { x: ox + k * (BW + GX), y: r * (BH + GY) + 2, r };
  });
  const H = lines * (BH + GY) - GY + 6;
  const label = c.rows === 0
    ? `${name}: no rows yet, so the head is still the 64 zeros the chain starts from.`
    : `${name}: the chain starts from 64 zeros, then ${c.rows} ${c.rows === 1 ? 'row' : 'rows'}, each hashed with the one before it. The last row's hash is the head, ${s8(c.head)}.`;

  return (
    <div ref={ref} className={t.wrap}>
      {W > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className={t.svg}>
          {pos.slice(0, -1).map((p, i) => {
            const q = pos[i + 1];
            const lit = shown > i;
            if (q.r === p.r) {
              const fwd = q.x > p.x;
              const x1 = fwd ? p.x + BW : p.x, x2 = fwd ? q.x : q.x + BW, y = p.y + BH / 2, mx = (x1 + x2) / 2;
              return <g key={`l${i}`} className={`${t.link}${lit ? ` ${t.linkOn}` : ''}`}><path d={`M${x1} ${y}H${x2}`} /><rect x={mx - 7} y={y - 4.5} width={14} height={9} rx={4.5} /></g>;
            }
            const x = p.x + BW / 2, y1 = p.y + BH, y2 = q.y, my = (y1 + y2) / 2;
            return <g key={`l${i}`} className={`${t.link}${lit ? ` ${t.linkOn}` : ''}`}><path d={`M${x} ${y1}V${y2}`} /><rect x={x - 4.5} y={my - 7} width={9} height={14} rx={4.5} /></g>;
          })}
          {items.map((it, i) => {
            const p = pos[i];
            if (it === 'gap') {
              return <g key="gap" className={t.gapB}><rect x={p.x} y={p.y} width={BW} height={BH} rx={12} /><text x={p.x + BW / 2} y={p.y + BH / 2 + 5} textAnchor="middle">{c.rows - 10} more rows</text></g>;
            }
            const n = it as number;
            const isHead = n === c.rows;
            const isStart = n === 0;
            const h = isStart ? GENESIS : walk && shown >= n ? walk.hashes[n - 1] : isHead ? c.head : '';
            const okv = !isStart && walk && shown >= n ? walk.ok[n - 1] : null;
            const cls = [t.block, isStart ? t.start : '', isHead ? t.head : '', okv === true ? t.ok : '', okv === false ? t.bad : ''].join(' ');
            return (
              <g key={n} className={cls} style={{ ['--d' as string]: `${n * 0.05}s` }}>
                <rect x={p.x} y={p.y} width={BW} height={BH} rx={12} />
                <text x={p.x + PAD} y={p.y + Y1} className={t.bk}>{isStart ? (isHead ? `Start${sep}head` : 'Start') : isHead ? `Row ${n}${sep}head` : `Row ${n}`}</text>
                <text x={p.x + PAD} y={p.y + Y2} className={t.bh}>{h ? `${sh(h)}…` : 'SHA-256'}</text>
                {okv !== null && (
                  <path className={t.mark} d={okv ? `M${p.x + BW - (small ? 20 : 26)} ${p.y + Y2 - 5}l4 4 8-8` : `M${p.x + BW - (small ? 18 : 24)} ${p.y + Y2 - 11}l8 8m0-8l-8 8`} />
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

const NAME: Record<string, string> = { corrections: 'Corrections', gap_reports: 'Gap reports', survey_responses: 'Burden rankings', interviews: 'Written interviews' };

export default function ChainDraw({ chains }: { chains: ChainHead[] }) {
  const [walks, setWalks] = useState<Record<string, Walk>>({});
  const [shown, setShown] = useState<Record<string, number>>({});
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const run = async () => {
    setState('busy'); setWalks({}); setShown({});
    try {
      const out: Record<string, Walk> = {};
      for (const c of chains) {
        const how = CHECKABLE[c.table]; if (!how) continue;
        const r = await fetch(how.file, { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        const text = await r.text();
        /* a CSV this page can check names row_hash in its header; anything else (an offline page, an
           error page) is a failed download, never a chain that does not match */
        if (!/^(?:#[^\n]*\n)*[^\n]*\brow_hash\b/.test(text)) throw new Error('not the published file');
        const rows = parseCsv(text);
        out[c.table] = how.mode === 'recompute' ? await recomputeCorrections(rows, c.head, c.rows) : checkLinks(rows, c.head, c.rows);
      }
      setWalks(out);
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      for (const [k, w] of Object.entries(out)) {
        if (reduce) { setShown((s) => ({ ...s, [k]: w.hashes.length })); continue; }
        for (let i = 1; i <= w.hashes.length; i++) timers.current.push(window.setTimeout(() => setShown((s) => ({ ...s, [k]: i })), 180 * i));
      }
      setState('done');
    } catch { setState('error'); }
  };

  return (
    <section className={t.panel} aria-labelledby="chains-h">
      <div className={t.top}>
        <div>
          <h3 id="chains-h" className={t.h}>Every chain, drawn block by block</h3>
          <p className={t.lead}>
            Check it in this browser: it downloads the published files, recomputes every corrections hash from its fields,
            checks that every survey and gap row links to the row above, and compares the last hash with the head.
          </p>
        </div>
        <button type="button" className={t.btn} onClick={run} disabled={state === 'busy'}>
          {state === 'busy' ? 'Checking…' : state === 'done' ? 'Check again' : 'Check it in this browser'}
        </button>
      </div>
      <p className={t.status} role="status" aria-live="polite">
        {state === 'error' && 'The published files could not be downloaded from this device just now, so nothing was checked.'}
        {state === 'done' && 'Checked in this browser, with nothing sent anywhere. Each chain says what it found below.'}
      </p>
      <ul className={t.list}>
        {chains.map((c) => {
          const w = walks[c.table];
          const how = CHECKABLE[c.table];
          const v = c.verified;
          const n = w ? w.ok.filter(Boolean).length : 0;
          return (
            <li key={c.table} className={t.item}>
              <p className={t.name}><b>{NAME[c.table] ?? c.table}</b><span>{c.rows.toLocaleString('en-US')} {c.rows === 1 ? 'row' : 'rows'}</span></p>
              <Chain c={c} name={NAME[c.table] ?? c.table} walk={w} shown={shown[c.table] ?? 0} />
              <p className={`${t.res}${w ? (w.matchesHead ? ` ${t.resOk}` : ` ${t.resBad}`) : ''}`}>
                {w && w.mode === 'recompute' && (w.matchesHead
                  ? <>Recomputed in your browser: {n} of {w.hashes.length} hashes match, and the last one is the published head.</>
                  : <>Recomputed in your browser: {n} of {w.hashes.length} hashes match; the last one, {s8(w.last)}…, is not the published head {s8(c.head)}….</>)}
                {w && w.mode === 'links' && (w.hashes.length === 0
                  ? (w.matchesHead ? <>The file has no rows, and the head is still the 64 zeros the chain starts from.</> : <>The file has no rows, but the head is not the 64 zeros.</>)
                  : w.matchesHead
                    ? <>Links checked in your browser: all {w.hashes.length} rows link to the row above, and the last one is the published head.</>
                    : <>Links checked in your browser: {n} of {w.hashes.length} rows link to the row above, and the last one is not the published head.</>)}
                {!w && !how && v?.ok === true && <>Not published as a file. Walked on our server: matches, {v.walked} {v.walked === 1 ? 'row' : 'rows'}.</>}
                {!w && !how && v?.ok !== true && <>Not published as a file, so it is walked only on our server.</>}
                {!w && how && <>Published as <a href={how.file}>{how.file.split('/').pop()}</a>. {how.mode === 'recompute' ? 'Every hash can be recomputed from it.' : 'Every link can be checked from it.'}</>}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

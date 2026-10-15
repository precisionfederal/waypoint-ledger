'use client';
/* ==========================================================================
   "I already lived this. Do I have to type it again?"

   For anyone on Medicare, the answer should be no: CMS already holds every
   claim it processed for them and, since 2018, hands it to the person on
   request through the Blue Button 2.0 API. This component asks for that
   record, matches each billed line against the published federal price table,
   and shows the person what it found BEFORE anything enters their ledger.

   🔴 THREE RULES THIS COMPONENT KEEPS, VISIBLY.

   1. It renders NOTHING until the site is connected. `configured` comes from
      the server (GET /api/bluebutton/status) and is false until the sandbox
      credentials are set as Pages secrets. No button, no heading, not the
      words. The static page and the first paint render nothing either, so a
      site without credentials never shifts. Every state of it says "CMS
      sandbox, synthetic beneficiaries" and carries CMS's required notice.

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

import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { TABLE } from '@/lib/table';
import { usd, priceJourney, totals, clampTimes, basisWarning, shownLines } from '@/lib/pricing';
import { useStore } from '@/lib/store';
import {
  resultFromPayload, importSummary, CMS_ATTRIBUTION, ENVIRONMENT_LABEL,
  SYNTHETIC_LINE_LABEL, SYNTHETIC_SOURCE,
  type ClaimsPayload, type ImportResult, type Refusal,
} from '@/lib/bluebutton';
import { syntheticPayload } from '@/lib/bluebutton-synthetic';

export interface BbStatus { ok: boolean; configured: boolean; connected: boolean; environment: string; refusal?: Refusal | null }

export type BbPhase = 'checking' | 'off' | 'ready' | 'loading' | 'loaded' | 'error';

const dateRange = (a: string | null, b: string | null) =>
  (!a ? 'date not given' : a === b || !b ? a : `${a} to ${b}`);

export interface ImportClaimsViewProps {
  status: BbStatus | null;
  phase: BbPhase;
  result?: ImportResult | null;
  meta?: { truncated: boolean; note: string | null } | null;
  err?: string | null;
  outcome?: { kind: string; why: string | null } | null;
  added?: boolean;
  onLoad?: () => void;
  onAddAll?: () => void;
  onDisconnect?: () => void;
}

/** The panel itself, with no state and no network: what it shows is decided
 *  entirely by its props, so every state can be rendered and tested. */
export function ImportClaimsView({
  status, phase, result = null, meta = null, err = null, outcome = null, added = false,
  onLoad, onAddAll, onDisconnect,
}: ImportClaimsViewProps) {
  /* 🔴 THE SWITCH. Unconfigured, or not yet known, means not on the page. */
  if (phase === 'checking' || phase === 'off' || !status?.configured) return null;
  const sandbox = status.environment === 'sandbox';
  const refusal = outcome?.kind === 'failed' ? status.refusal ?? null : null;

  return (
    <section className="notice" aria-labelledby="bb-h">
      <h2 id="bb-h" style={{ margin: '0 0 .35rem', fontSize: '1.05rem' }}>Bring in your Medicare record</h2>
      {sandbox && (
        <p className="micro" style={{ margin: '0 0 .5rem' }}>
          <strong>{ENVIRONMENT_LABEL}.</strong> This connection is to the CMS Blue Button 2.0 sandbox, which
          holds synthetic test records, not live Medicare data.
        </p>
      )}
      <p style={{ margin: '0 0 .6rem' }}>
        If you have Medicare, CMS already holds the claims it processed for you. You can sign in at
        Medicare and let this page read them, so you do not have to remember and retype years of visits
        and tests. It reads what care happened and when. It does not read, keep or show what anyone
        was paid: every dollar on this page stays a published federal figure you can open and check.
      </p>
      <p className="micro" style={{ margin: '0 0 .8rem' }}>
        Nothing is stored on this server. The claims are read once, turned into service codes and dates,
        and matched in this browser. Your ledger stays on this device unless you choose to save it.
      </p>

      {outcome?.kind === 'cancelled' && (
        <p className="micro">You stopped at the Medicare sign-in. Nothing was read, and nothing changed here.</p>
      )}
      {outcome?.kind === 'failed' && (
        <div className="warn-txt" role="status">
          <p style={{ margin: 0 }}>{refusal ? refusal.plain : outcome.why || 'That sign-in did not finish. You can try again.'}</p>
          {refusal?.cmsSaid && (
            <p style={{ margin: '.2rem 0 0' }}>
              CMS said: &ldquo;{refusal.cmsSaid}&rdquo;{refusal.code ? <> <span className="mono">({refusal.code})</span></> : null}
            </p>
          )}
        </div>
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
          <p style={{ margin: 0 }}><button type="button" className="btn ghost" onClick={onLoad}>Try again</button></p>
        </>
      )}

      {phase === 'loaded' && result && (
        <>
          <p style={{ margin: '.4rem 0' }}><strong>{importSummary(result)}</strong></p>
          {meta?.note && <p className="micro">{meta.note}</p>}

          {result.matched.length > 0 && (
            <div className="table-scroll" tabIndex={0}>
              <table className="ledger-table">
                <caption className="sr-only">Medicare claim lines this table has a published figure for{sandbox ? ` (${ENVIRONMENT_LABEL})` : ''}</caption>
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
                      <td className="r">{g.item.valueUsd === null ? 'no published figure' : usd(g.item.valueUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Misses result={result} />

          {result.linesWithoutCode > 0 && (
            <p className="micro">
              {result.linesWithoutCode} billed line{result.linesWithoutCode === 1 ? '' : 's'} arrived with no
              procedure code at all. Counted here, and left out of the ledger rather than filled in.
            </p>
          )}

          <p style={{ margin: '.8rem 0 0', display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            {result.matched.length > 0 && (
              <button type="button" className="btn" onClick={onAddAll} disabled={added}>
                {added
                  ? `Added ${result.matched.length} line${result.matched.length === 1 ? '' : 's'}`
                  : `Add ${result.matched.length} line${result.matched.length === 1 ? '' : 's'} to my ledger`}
              </button>
            )}
            <button type="button" className="btn ghost" onClick={onDisconnect}>Disconnect from Medicare</button>
          </p>
        </>
      )}

      {/* Required by the Blue Button API Terms of Service, verbatim. */}
      <p className="micro" style={{ margin: '.8rem 0 0' }}>{CMS_ATTRIBUTION}</p>
    </section>
  );
}

/** The codes this table has no row for: listed with their counts and dates,
 *  never dropped. Shared by the live import and the CMS example. */
function Misses({ result }: { result: ImportResult }) {
  if (!result.unmatched.length) return null;
  return (
    <>
      <p style={{ margin: '.8rem 0 .3rem' }}>
        <strong>Medicare billed {result.unmatched.length} code{result.unmatched.length === 1 ? '' : 's'} this
        table has no published figure for.</strong> {result.unmatched.length === 1 ? 'It is' : 'They are'} listed rather than dropped, because a
        journey is not cheaper for being unpriced. Nothing here is guessed at.
      </p>
      <ul className="gap-counts">
        {result.unmatched.map((u) => (
          <li key={u.code}>
            <span className="mono">{u.code}</span>{' '}
            {u.display
              ? <>: {u.display}</>
              : <span className="micro">: Medicare sent no description with this code, so none is shown.</span>}{' '}
            <span className="micro">
              {u.count} line{u.count === 1 ? '' : 's'}, {dateRange(u.firstServicedOn, u.lastServicedOn)}
              {u.reason === 'ambiguous'
                ? `. This code is more than one row here (${u.candidates.map((c) => c.label).join('; ')}) and the claim did not say which, so it is left for you to choose`
                : ''}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/* --------------------------------------------------------------------------
   THE CMS EXAMPLE. Shown to anyone, credentials or not, because it reads no
   one's record: the ten synthetic claims CMS publishes with the API, already
   reduced to codes and dates exactly as the Worker reduces a real answer
   (lib/bluebutton-synthetic.ts), then mapped by resultFromPayload(), the same
   call load() makes above. No fetch, no storage, no store: the lines are
   priced and shown here, every one labelled, and never enter a ledger.
   -------------------------------------------------------------------------- */
export function SyntheticImportView({ result, onClose, headingRef }: {
  result: ImportResult;
  onClose?: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const priced = priceJourney(result.entries);
  const t = totals(priced);
  /* judge panel 15 Oct #2.1: the lines that add to the total are the ones totals() counts. */
  const side = new Set(t.beside);
  const inTotal = (l: (typeof priced)[number]) => l.priced && l.totalUsd !== null && !side.has(l);
  const shown = shownLines(priced.filter(inTotal).map((l) => l.totalUsd as number));
  let k = 0;
  const mixed = basisWarning(t.basesUsed);

  return (
    <section className="notice" id="medicare-example" aria-labelledby="bb-ex-h" data-testid="bb-synthetic">
      <h2 id="bb-ex-h" ref={headingRef} tabIndex={-1} style={{ margin: '0 0 .35rem', fontSize: '1.05rem' }}>
        A Medicare import, on a synthetic beneficiary
      </h2>
      <p style={{ margin: '0 0 .5rem' }}>
        <strong>Synthetic data published by CMS. No real person&rsquo;s claims.</strong> These are the ten
        example claims CMS publishes with its Blue Button 2.0 API, for a Medicare beneficiary who does not
        exist. The live sign-in on this page connects to CMS&rsquo;s sandbox of synthetic beneficiaries; real
        Medicare records need CMS production approval.
      </p>
      <p className="micro" style={{ margin: '0 0 .8rem' }}>
        They took the same steps a real import takes: each billed line cut down to a service code and a
        date, then matched in this browser against the published federal price table. Every dollar below
        is a row of that table, never an amount from the claims. This page did not contact CMS, and
        nothing here is stored or added to your ledger.
      </p>

      <p style={{ margin: '.4rem 0' }}><strong>{importSummary(result)}</strong></p>

      {result.matched.length > 0 && (
        <div className="table-scroll" tabIndex={0}>
          <table className="ledger-table">
            <caption className="sr-only">Ledger lines from CMS&rsquo;s synthetic beneficiary, priced from the published federal table</caption>
            <thead>
              <tr>
                <th scope="col">Ledger line</th>
                <th scope="col" className="r">Times</th>
                <th scope="col" className="r">Published figure, each</th>
                <th scope="col" className="r">Line</th>
              </tr>
            </thead>
            <tbody>
              {result.matched.map((g, i) => {
                const line = priced[i];
                const it = g.item;
                const c = clampTimes(it, line.entry.times);
                const lineShown = inTotal(line) ? shown.lines[k++]
                  : line.priced && line.totalUsd !== null ? `${usd(line.totalUsd, true)}, beside the total` : null;
                return (
                  <tr key={it.id} className={line.priced ? undefined : 'is-unpriced'} data-testid="bb-synthetic-line">
                    <td>
                      {it.label}
                      <span className="li-sub"><strong>{SYNTHETIC_LINE_LABEL}</strong></span>
                      <span className="li-sub mono">{it.code} · {dateRange(g.firstServicedOn, g.lastServicedOn)}</span>
                      <span className="li-sub">
                        <a href={it.sourceUrl} target="_blank" rel="noopener noreferrer">{it.sourceTitle}</a>, {it.year}
                      </span>
                    </td>
                    <td className="r" data-label="Times">
                      {c.said}
                      {c.capped && <span className="li-sub">{cappedNote(c.times, g.firstServicedOn, g.lastServicedOn)}</span>}
                    </td>
                    <td className="r" data-label="Published figure, each">{it.valueUsd === null ? 'no published figure' : usd(it.valueUsd, true)}</td>
                    <td className="r" data-label="Line">{lineShown ?? 'not priced'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {t.pricedCount > 0 && (
        <p style={{ margin: '.6rem 0 0' }}>
          Sum of the {t.pricedCount} priced line{t.pricedCount === 1 ? '' : 's'}, published figure times count:{' '}
          <strong data-testid="bb-synthetic-total">{shown.total}</strong>
          <span className="micro"> ({SYNTHETIC_LINE_LABEL})</span>
        </p>
      )}
      {mixed && <p className="warn-txt">{mixed}</p>}

      <Misses result={result} />

      {result.linesWithoutCode > 0 && (
        <p className="micro">
          {result.linesWithoutCode} billed line{result.linesWithoutCode === 1 ? '' : 's'} arrived with no
          procedure code at all. Counted here, and left out rather than filled in.
        </p>
      )}

      <p className="micro" style={{ margin: '.8rem 0 0' }}>
        Where this comes from: the example{' '}
        <span className="mono">{SYNTHETIC_SOURCE.example}</span> in{' '}
        <a href={SYNTHETIC_SOURCE.docsUrl} target="_blank" rel="noopener noreferrer">the Blue Button 2.0 API specification</a>,
        published by CMS. CMS&rsquo;s <a href={SYNTHETIC_SOURCE.aboutUrl} target="_blank" rel="noopener noreferrer">API
        documentation</a> says its sandbox holds synthetic Medicare enrollee data.
      </p>
      <p className="micro" style={{ margin: '.4rem 0 0' }}>{CMS_ATTRIBUTION}</p>
      {onClose && (
        <p style={{ margin: '.8rem 0 0' }}>
          <button type="button" className="btn ghost small" onClick={onClose}>Close the example</button>
        </p>
      )}
    </section>
  );
}

/** A once-a-year code: the cap is one per 12-month period, so a run of claims
 *  longer than a year could have been allowed more than once. Say so, and say
 *  that this ledger still prices one, rather than imply a single year. */
export function cappedNote(priced: number, first: string | null, last: string | null): string {
  const base = `${priced} priced: CMS pays this once in a 12-month period`;
  if (!first || !last) return base;
  const days = (Date.parse(last) - Date.parse(first)) / 86400000;
  if (!(days >= 365)) return base;
  return `${base}. These claims run from ${first.slice(0, 4)} to ${last.slice(0, 4)}, so more than one may have been allowed; this ledger prices ${priced === 1 ? 'one' : priced}, the lowest it can stand behind`;
}

/** The example, mapped once on mount. MedicareImport's SYNTHETIC_TRY button opens it. */
export function SyntheticImport({ onClose }: { onClose?: () => void }) {
  const [result] = useState<ImportResult>(() => resultFromPayload(syntheticPayload(), TABLE));
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => { h.current?.focus({ preventScroll: false }); }, []);
  return <SyntheticImportView result={result} onClose={onClose} headingRef={h} />;
}

/** `initialStatus` is the answer the gate (MedicareImport) already has, so the
 *  status is asked for once per page, not twice. */
export default function ImportClaims({ initialStatus = null }: { initialStatus?: BbStatus | null }) {
  const st = useStore();
  const [status, setStatus] = useState<BbStatus | null>(initialStatus);
  const [phase, setPhase] = useState<BbPhase>(
    initialStatus ? (initialStatus.configured ? 'ready' : 'off') : 'checking',
  );
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
    if (kind) setOutcome({ kind, why: whyText(q.get('why')) });
  }, []);

  useEffect(() => {
    if (initialStatus) return undefined;
    let live = true;
    fetch('/api/bluebutton/status', { headers: { accept: 'application/json' } })
      .then((r) => r.json())
      .then((j: BbStatus) => {
        if (!live) return;
        setStatus(j);
        setPhase(j && j.configured ? 'ready' : 'off');
      })
      .catch(() => { if (live) setPhase('off'); });
    return () => { live = false; };
  }, [initialStatus]);

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
      setResult(resultFromPayload(j, TABLE));
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

  return (
    <ImportClaimsView
      status={status} phase={phase} result={result} meta={meta} err={err} outcome={outcome} added={added}
      onLoad={() => void load()} onAddAll={addAll} onDisconnect={() => void disconnect()}
    />
  );
}

/* 🔴 THE URL NEVER WRITES ON THIS PAGE (security S-16). `why` arrives in the
   address bar, so anyone can put words there. Only the short codes the Medicare
   callback sends are shown, as this page's own sentences (and the older
   sentences themselves, for a link minted before the callback moved to codes).
   Anything else falls back to the plain default sentence. CMS's own words, when
   it refused, come from /api/bluebutton/status (an HttpOnly cookie the callback
   set), never from the URL. */
const WHY_BY_CODE: Record<string, string> = {
  expired: 'That sign-in link had expired. Please start again.',
  'state-mismatch': 'That sign-in did not start on this site. Please start again.',
  unreachable: 'Could not reach the Medicare sandbox to finish signing in.',
  refused: 'The Medicare sandbox refused the sign-in.',
};
const KNOWN_WHY = new Set(Object.values(WHY_BY_CODE));

export function whyText(raw: string | null): string | null {
  if (!raw) return null;
  if (Object.prototype.hasOwnProperty.call(WHY_BY_CODE, raw)) return WHY_BY_CODE[raw];
  if (KNOWN_WHY.has(raw)) return raw;
  return null;
}

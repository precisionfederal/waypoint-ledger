'use client';

/* ==========================================================================
   THE REGISTER — everything the public has told the government through this
   tool, published as counts with their N, their denominator, their dates,
   their recruitment channels and who is not in the sample.

   Three rules this page keeps:
   1. No count without its denominator and the date it was counted.
   2. A correction is addressed to the body that published the row it is about,
      and leaves here in a form that body can act on without our bundle.
   3. A cell too small to publish without identifying somebody is withheld, and
      the withholding is counted in public.

   Reads one endpoint, /api/register. Free text is never shown.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TABLE } from '@/lib/table';
import { usd } from '@/lib/pricing';
import gapData from '@/data/invisible-events.json';
import spRaw from '@/data/state-prices.json';
import { BURDENS, DECIDERS, QUESTIONS, CONTEXT, CONTEXT_KEYS, SMALL_CELL_MIN, suppressSmallCells, SEX_POLICY, SEX_POLICY_URL, SEX_ASK_ORIGIN, type ContextKey } from '@/lib/survey';
import {
  publisherOf, documentOf, fitRate, citationText, correctionsCsv,
  PUBLISHER_FULL, PUBLISHER_ROUTE, type CiteRow, type Publisher,
} from '@/lib/register-cite';

interface CorrRow { priceId: string; confirmedRight: number; flaggedWrong: number; publicMedianBelievedUsd: number | null }
interface GapRow { category: string; respondentsReporting: number; totalReported: number; meanPerRespondent: number }
interface WeightRow { category: string; rankedFirstBy: number; rankedAtAllBy: number }
interface Gap { respondents: number; firstAt?: string; lastAt?: string; gap: GapRow[]; communityWeights: WeightRow[]; coverage?: Record<string, Record<string, number>> }
interface RankRow { burden: string; rankedFirstBy: number; rankedLastBy: number; meanRank: number | null }
interface SexGroup { sex: string; n: number; ranking: RankRow[] }
interface RankingBySex { min: number; stated: number; notStated: number; groups: SexGroup[]; withheldGroups: number; withheldResponses: number; why?: string; method?: string }
interface Survey { n: number; firstAt?: string; lastAt?: string; channels?: Record<string, number>; ranking?: RankRow[]; rankingBySex?: RankingBySex; unasked?: Record<string, number>; lead?: Record<string, number>; decide?: Record<string, number>; clinicians?: { n: number; median?: number; mean?: number; max?: number }; coverage?: Record<string, Record<string, number>> }
interface Interviews { n: number; firstAt?: string; lastAt?: string; consent?: Record<string, number> }
interface Change { id?: string; date: string; said: string; changed: string; who: string }
interface RegisterPayload {
  ok?: boolean;
  corrections?: { summary?: CorrRow[]; senders?: number; sends?: number; figures?: number };
  gap?: Partial<Gap>;
  survey?: Survey;
  interviews?: Interviews;
  changes?: Change[];
  firstAt?: string;
  lastAt?: string;
  generatedAt?: string;
}

const SP = spRaw as unknown as { localities: unknown[]; items: Record<string, unknown> };
/** Denominators that never move with the sample: what this tool prices, and how finely. */
const PRICED_ROWS = TABLE.length;
const LOCALITY_ROWS = Object.keys(SP.items).length;
const LOCALITIES = SP.localities.length;

const CAT_LABEL: Record<string, string> = Object.fromEntries((gapData.categories as { id: string; label: string }[]).map((c) => [c.id, c.label]));
const B_LABEL: Record<string, string> = Object.fromEntries(BURDENS.map((b) => [b.id, b.label]));
const D_LABEL: Record<string, string> = Object.fromEntries(DECIDERS.map((d) => [d.id, d.label]));
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
const CHANNEL_LABEL: Record<string, string> = { direct: 'Direct link', demo: 'TOPx demo call', lca: 'Long COVID Alliance', solve: 'Solve M.E.', plrc: 'Patient-Led Research Collaborative', bench: 'Precision Federal clinician bench', ames: 'Ames, Iowa community', linkedin: 'LinkedIn' };

/** How many rows of the price table each body published — the denominator for a correction. */
const ROWS_BY_PUBLISHER = TABLE.reduce<Record<string, number>>((m, it) => {
  const p = publisherOf(it.sourceTitle);
  m[p] = (m[p] ?? 0) + 1;
  return m;
}, {});
const ROWS_BY_DOCUMENT = TABLE.reduce<Record<string, number>>((m, it) => {
  m[it.sourceTitle] = (m[it.sourceTitle] ?? 0) + 1;
  return m;
}, {});
const PUBLISHER_ORDER: Publisher[] = ['CMS', 'AHRQ', 'BLS', 'Published research'];

function download(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the manual path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/* ONE STATE, READ THE SAME WAY EVERYWHERE.

   Round 3 turned /api/** off and watched: the banner said the register could not
   be read, and six sections underneath went on saying "loading" forever with no
   way to try again — because the error lived in `err` while `d` stayed null and
   every section tested `d`. A page whose whole claim is integrity cannot behave
   like that while it is broken. There is now one machine, three states, and
   every section renders from it. */
type Phase = 'loading' | 'ok' | 'error';

/** The one failure line, wherever a section would otherwise have rendered a
 *  count. Same words every time, and always a way out. */
function Failed({ onRetry, busy }: { onRetry: () => void; busy: boolean }) {
  return (
    <p className="match-note miss reg-failed" role="status">
      This section could not be read right now. Nothing has been lost.{' '}
      <button type="button" className="link-btn" onClick={onRetry} disabled={busy}>
        {busy ? 'Trying…' : 'Try again'}
      </button>
    </p>
  );
}

export default function Register() {
  const [d, setD] = useState<RegisterPayload | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');

  const load = useCallback(() => {
    setPhase('loading');
    fetch('/api/register')
      .then((r) => r.json())
      .then((j: RegisterPayload) => {
        if (j && j.ok !== false) { setD(j); setPhase('ok'); }
        else throw new Error('not ok');
      })
      .catch(() => { setD(null); setPhase('error'); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const failed = phase === 'error';
  const busy = phase === 'loading';
  const err = failed ? 'The register could not be read right now. Nothing has been lost — every count below is unread, not zero.' : null;
  /* The counts a section prints while it is waiting or broken. "loading" is only
     ever true of the loading state. */
  const sigN = (text: string) => (phase === 'ok' ? text : failed ? 'unread' : 'loading');

  const corr: CorrRow[] | null = d ? (Array.isArray(d.corrections?.summary) ? d.corrections!.summary! : []) : null;
  const gap: Gap | null = d ? { respondents: d.gap?.respondents ?? 0, firstAt: d.gap?.firstAt, lastAt: d.gap?.lastAt, gap: d.gap?.gap ?? [], communityWeights: d.gap?.communityWeights ?? [], coverage: d.gap?.coverage } : null;
  const sv: Survey | null = d ? (d.survey ?? { n: 0 }) : null;
  const iv: Interviews | null = d ? (d.interviews ?? { n: 0 }) : null;
  const changes: Change[] = d?.changes ?? [];
  const asOf = d?.generatedAt ?? '';

  const nCorr = corr ? corr.reduce((a, r) => a + r.confirmedRight + r.flaggedWrong, 0) : 0;
  /* Published by the server from the stored per-figure keys; never computed here,
     and the keys themselves never leave the server. */
  const senders = d?.corrections?.senders;
  const loaded = !!(d && corr && gap && sv && iv);
  const firstAt = loaded ? d!.firstAt : undefined;
  const lastAt = loaded ? d!.lastAt : undefined;

  /* Every thumbed row, joined to the federal row it is bound to. This is the object an
     agency needs; the aggregate alone is not enough to act on. */
  const cites: CiteRow[] = useMemo(() => (corr ?? []).flatMap((r) => {
    const it = TABLE.find((t) => t.id === r.priceId);
    if (!it) return [];
    return [{
      priceId: r.priceId, label: it.label, code: it.code, valueUsd: it.valueUsd, year: it.year,
      basis: it.basis, geography: it.geography, population: it.population,
      sourceTitle: it.sourceTitle, sourceUrl: it.sourceUrl,
      confirmedRight: r.confirmedRight, flaggedWrong: r.flaggedWrong, medianBelievedUsd: r.publicMedianBelievedUsd,
    }];
  }), [corr]);
  const orphanCites = (corr ?? []).filter((r) => !TABLE.find((t) => t.id === r.priceId));

  const groups = useMemo(() => {
    const byPub = new Map<Publisher, Map<string, CiteRow[]>>();
    for (const c of cites) {
      const p = publisherOf(c.sourceTitle);
      if (!byPub.has(p)) byPub.set(p, new Map());
      const docs = byPub.get(p)!;
      if (!docs.has(c.sourceTitle)) docs.set(c.sourceTitle, []);
      docs.get(c.sourceTitle)!.push(c);
    }
    return PUBLISHER_ORDER.filter((p) => byPub.has(p)).map((p) => ({
      publisher: p,
      documents: [...byPub.get(p)!.entries()]
        .map(([title, rows]) => ({ title, rows: rows.sort((a, b) => b.flaggedWrong - a.flaggedWrong) }))
        .sort((a, b) => b.rows.length - a.rows.length),
    }));
  }, [cites]);

  return (
    <section className="step register">
      <div className="wrap">
        <p className="eyebrow">The register</p>
        <h1>What the public has told the government through this tool</h1>
        <p className="sub">
          Every row below is a count of what people actually sent: a thumb on a published federal figure, an event no dataset recorded,
          or a ranking of which cost weighed most. Published with its N, its denominator, its dates and where the people came from.
          Nothing identifies anyone.
        </p>
        {err && (
          <p className="match-note miss" role="alert">
            {err}{' '}
            <button type="button" className="link-btn" onClick={load} disabled={busy}>
              {busy ? 'Trying…' : 'Try again'}
            </button>
          </p>
        )}

        <div className="reg-grid">
          <Stat n={loaded ? nCorr : null} label={nCorr === 1 ? 'thumb on a published federal figure' : 'thumbs on published federal figures'}
            sub={loaded ? `on ${corr!.length} of ${PRICED_ROWS} priced rows · counted ${day(asOf)}` : undefined} />
          {/* "no reports yet" is a claim about the register. When the register could
              not be read it is a claim we have no right to make, so it is not made. */}
          <Stat n={loaded ? gap!.respondents : null} label="people reporting uncounted care"
            sub={!loaded ? (failed ? 'unread' : undefined) : gap!.respondents > 0 ? `first ${day(gap!.firstAt)} · latest ${day(gap!.lastAt)}` : 'no reports yet'} />
          <Stat n={loaded ? sv!.n : null} label="burden rankings"
            sub={!loaded ? (failed ? 'unread' : undefined) : sv!.n > 0 ? `first ${day(sv!.firstAt)} · latest ${day(sv!.lastAt)}` : 'no rankings yet'} />
          <Stat n={loaded ? iv!.n : null} label="written interviews"
            sub={!loaded ? (failed ? 'unread' : undefined) : iv!.n > 0 ? `first ${day(iv!.firstAt)} · latest ${day(iv!.lastAt)}` : 'none yet'} />
        </div>
        <p className="micro">
          {loaded && (nCorr + gap!.respondents + sv!.n + iv!.n) > 0
            ? <>First entry {day(firstAt)} · latest {day(lastAt)} · read as of {day(asOf)} · self-selected sample, read as one · counts, never estimates.</>
            : loaded ? <>Nothing recorded yet. The first thumb, report or ranking will appear here the moment it is sent. Read as of {day(asOf)}.</>
            : failed ? <>These four counts could not be read. They are unread, not zero.</>
            : 'Loading…'}
        </p>
        {failed && <Failed onRetry={load} busy={busy} />}

        {/* The denominator a statistician asks for before they read a single count:
            how many senders, not how many sends. Published only when it is known. */}
        {phase === 'ok' && nCorr > 0 && (
          <p className="micro">
            {nCorr} {nCorr === 1 ? 'correction' : 'corrections'} from {senders ?? 0} distinct {(senders ?? 0) === 1 ? 'sender' : 'senders'} across
            {' '}{corr!.length} of {PRICED_ROWS} published figures. A sender here is one browser on one network, not a verified person: we ask for no
            account and no identity. One browser is refused a second thumb on the same figure, and one network may send at most 3 corrections about
            one figure in an hour and 8 in a day, so a page reloaded a hundred times still moves a count by three. What that resists, and what it does
            not, is written out on <Link href="/integrity">how the count is kept honest</Link>.
          </p>
        )}

        {/* ---------------- who published what each section is about ---------------- */}
        <div className="reg-routes">
          <h2 className="rr-h">Who published the figures each section is about</h2>
          <ul>
            <li><b>Corrections</b> — bound to one row of one published file. Of the {PRICED_ROWS} rows this tool prices,
              {' '}{ROWS_BY_PUBLISHER['CMS'] ?? 0} were published by CMS, {ROWS_BY_PUBLISHER['AHRQ'] ?? 0} by AHRQ (MEPS and HCUP),
              {' '}{ROWS_BY_PUBLISHER['BLS'] ?? 0} by BLS, and {ROWS_BY_PUBLISHER['Published research'] ?? 0} come from published research
              rather than a federal file. Each correction below is grouped under the body that published it.</li>
            <li><b>Care that produced zero rows</b> — about what MEPS and HCUP (AHRQ) and Medicare claims (CMS) do not record at all.
              No published figure exists to correct; this is the count of the absence.</li>
            <li><b>The burden ranking</b> — the stated basis for weighing kinds of burden, the question NIH health economists
              put to every cost-of-illness estimate. Published as a distribution with its N, with no weighting scheme of ours underneath.</li>
          </ul>
          <p className="micro">
            We publish no agency inbox we have not verified, so nothing here mails anyone automatically. Every correction below copies out
            as a citation block — the row, the file, the figure and the count — that a person at the publishing body can act on directly.
          </p>
        </div>

        {/* ---------------- the burden ranking ---------------- */}
        <h2 className="sig-h">Which cost weighed most, ranked by the people who carried it <span className="sig-n">{sv ? sigN(`${sv.n} ${sv.n === 1 ? 'person' : 'people'} answered`) : sigN('')}</span></h2>
        <p className="sub">{QUESTIONS.rank} Five burdens, ranked by each person. Reported as how many put each first, how many put it last, and the mean position. No weighting scheme of ours underneath.</p>
        {failed && <Failed onRetry={load} busy={busy} />}
        {sv && sv.n === 0 && <EmptyRankChart />}
        {sv && sv.n > 0 && sv.ranking && (
          <>
            <RankChart rows={sv.ranking.map((r) => ({ label: B_LABEL[r.burden] ?? r.burden, first: r.rankedFirstBy, last: r.rankedLastBy, mean: r.meanRank }))} n={sv.n} />
            <div className="reg-cols">
              <Dist title={QUESTIONS.unasked} data={sv.unasked} labels={{ ...B_LABEL, 'all-asked': 'Someone asked about all of them' }} n={sv.n} />
              <Dist title={QUESTIONS.lead} data={sv.lead} labels={B_LABEL} n={sv.n} />
              <Dist title={QUESTIONS.decide} data={sv.decide} labels={D_LABEL} n={sv.n} />
              <div className="dist">
                <h3>{QUESTIONS.clinicians}</h3>
                {sv.clinicians && sv.clinicians.n > 0
                  ? <p className="big-num">{sv.clinicians.median}<span className="big-lab">median · mean {sv.clinicians.mean} · most {sv.clinicians.max} · {sv.clinicians.n} of {sv.n} answered</span></p>
                  : <p className="micro">No one has answered this yet — 0 of {sv.n}.</p>}
              </div>
            </div>
            <Coverage
              title="Who answered the ranking, and who did not"
              coverage={sv.coverage}
              keys={(CONTEXT_KEYS as ContextKey[]).filter((k) => k !== 'state' && k !== 'sex')}
              labels={Object.fromEntries((CONTEXT_KEYS as ContextKey[]).map((k) => [k, CONTEXT[k].label]))}
              n={sv.n}
            />
            <SexCoverage counts={sv.coverage?.sex} bySex={sv.rankingBySex} n={sv.n} />
            <StateCoverage counts={sv.coverage?.state} n={sv.n} />
            <div className="dist">
              <h3>Where they came from <span className="dist-n">{sv.n} of {sv.n} carry a channel</span></h3>
              <ul className="dist-list">{Object.entries(sv.channels ?? {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => <li key={k}><span>{CHANNEL_LABEL[k] ?? k}</span><b>{v}<i> of {sv.n}</i></b></li>)}</ul>
            </div>
          </>
        )}

        {/* ---------------- corrections, grouped by who published the row ---------------- */}
        <h2 className="sig-h">Corrections on published federal figures <span className="sig-n">{corr ? sigN(`${nCorr} ${nCorr === 1 ? 'thumb' : 'thumbs'} · ${corr.length} of ${PRICED_ROWS} rows`) : sigN('')}</span></h2>
        <p className="sub">
          Each ledger line carries a thumb, and a thumb is bound to the exact published row the price came from. They are grouped here under the
          body that published the row, then under the file it is in, so enough of them on one row is something that body can act on.
          {' '}{LOCALITY_ROWS} of the {PRICED_ROWS} rows also carry a figure for each of the {LOCALITIES} Medicare localities, so a correction can be
          read against the figure for the place the person actually lives.
        </p>
        {failed && <Failed onRetry={load} busy={busy} />}
        {corr && corr.length === 0 && <p className="sub">No corrections yet — 0 of {PRICED_ROWS} priced rows have a thumb. The first thumb on any ledger line will appear here.</p>}
        {groups.map((g) => (
          <PublisherBlock key={g.publisher} publisher={g.publisher} documents={g.documents} asOf={asOf} />
        ))}
        {orphanCites.length > 0 && (
          <p className="micro">{orphanCites.length} {orphanCites.length === 1 ? 'correction refers' : 'corrections refer'} to a row that is no longer in the published table. It is counted here and kept in the export, never dropped.</p>
        )}

        {/* ---------------- the gap ---------------- */}
        <h2 className="sig-h">Care that produced zero rows in federal data <span className="sig-n">{gap ? sigN(`${gap.respondents} ${gap.respondents === 1 ? 'person' : 'people'} reporting`) : sigN('')}</span></h2>
        <p className="sub">MEPS, HCUP and CMS claims record care that was delivered and billed. A visit that never happened, a test that was refused, months lost waiting: none of it leaves a row. This is the count of it, out of {gap ? gap.respondents : 0} {gap && gap.respondents === 1 ? 'person who' : 'people who'} answered.</p>
        {failed && <Failed onRetry={load} busy={busy} />}
        {gap && gap.gap.length === 0 && <p className="sub">No reports yet. <Link href="/gap">Report what no dataset counted.</Link></p>}
        {gap && gap.gap.length > 0 && (
          <>
            <div className="table-scroll" tabIndex={0}>
              <table className="ledger-table">
                <caption className="tbl-cap">Of {gap.respondents} {gap.respondents === 1 ? 'person' : 'people'}, first {day(gap.firstAt)}, latest {day(gap.lastAt)}.</caption>
                <thead><tr><th scope="col">What happened</th><th scope="col" className="r">People reporting</th><th scope="col" className="r">Events reported</th><th scope="col" className="r">Per person</th></tr></thead>
                <tbody>{gap.gap.map((g) => <tr key={g.category}><td>{CAT_LABEL[g.category] ?? g.category}</td><td className="r">{g.respondentsReporting}<i className="of"> of {gap.respondents}</i></td><td className="r">{g.totalReported}</td><td className="r">{g.meanPerRespondent}</td></tr>)}</tbody>
              </table>
            </div>
            {gap.communityWeights.length > 0 && (
              <div className="dist"><h3>Which uncounted cost hurt most <span className="dist-n">of {gap.respondents} reporting</span></h3>
                <ul className="dist-list">{gap.communityWeights.map((w) => <li key={w.category}><span>{CAT_LABEL[w.category] ?? w.category}</span><b>{w.rankedFirstBy} first · {w.rankedAtAllBy} ranked<i> of {gap.respondents}</i></b></li>)}</ul>
              </div>
            )}
          </>
        )}

        {/* ---------------- interviews ---------------- */}
        <h2 className="sig-h">Written interviews <span className="sig-n">{iv ? sigN(`${iv.n} so far`) : sigN('')}</span></h2>
        <p className="sub">Held privately, never served. What changes because of them is published here as &ldquo;a user said this, so we changed that&rdquo;, with quotes only where the writer chose to be quoted. <Link href="/interview">Give one.</Link></p>
        <ChangeLog changes={changes} loaded={loaded} failed={failed} onRetry={load} busy={busy} />

        {/* ---------------- downloads ---------------- */}
        <h2 className="sig-h">Take the data</h2>
        <p className="sub">De-identified CSV, the data dictionary that describes every field, and the method. An agency, a researcher or a committee staffer can use these without asking us. The corrections file carries the federal file, its SHA-256 and the line each figure was read from, so a correction can be routed to the office that published the number.</p>
        <div className="dl-grid">
          <a className="dl-card" href="/api/export/survey.csv">
            <span className="dl-fmt">CSV</span><h3>Burden rankings</h3>
            <p>One row per response: the five burdens in the order that person put them, with the date and the channel.</p>
          </a>
          <a className="dl-card" href="/api/export/corrections.csv">
            <span className="dl-fmt">CSV</span><h3>Corrections, ready to route</h3>
            <p>Every thumb joined to the federal file behind the figure: the file by name, its URL, its SHA-256, the line the figure was read from, the audit verdict, the counts and the fit rate. An analyst at the agency that published the number can act on it without opening this site.</p>
          </a>
          <a className="dl-card" href="/api/export/corrections.json" target="_blank" rel="noopener noreferrer">
            <span className="dl-fmt">JSON</span><h3>The same file, machine-readable</h3>
            <p>A DCAT distribution carrying its own column contract, the price-table version, the audit date, and the CY2024 charge an uninsured person is billed against where CMS publishes one.</p>
          </a>
          <a className="dl-card" href="/api/export/gap.csv">
            <span className="dl-fmt">CSV</span><h3>Uncounted care</h3>
            <p>Care that produced no row in any federal file, counted by category with its denominator.</p>
          </a>
          {cites.length > 0 && (
            <button type="button" className="dl-card" onClick={() => download(`waypoint-corrections-with-provenance-${(asOf || '').slice(0, 10) || 'today'}.csv`, correctionsCsv(cites, asOf))}>
              <span className="dl-fmt">CSV</span><h3>Corrections with full provenance</h3>
              <p>The same corrections, joined to the file, the code, the year, the basis and the source URL of each row.</p>
            </button>
          )}
          <a className="dl-card" href="/data/dictionary.csv">
            <span className="dl-fmt">CSV</span><h3>Data dictionary</h3>
            <p>Every field in every export above: what it means, its type, and how it is counted.</p>
          </a>
          <a className="dl-card" href="/api/register" target="_blank" rel="noopener noreferrer">
            <span className="dl-fmt">JSON</span><h3>Everything on this page</h3>
            <p>The whole register as one document, the same one this page reads. No key, no sign-in.</p>
          </a>
          <Link className="dl-card" href="/method">
            <span className="dl-fmt">METHOD</span><h3>How every figure is made</h3>
            <p>The file, the row and the arithmetic behind each of the {PRICED_ROWS} priced rows.</p>
          </Link>
        </div>
        <p className="micro">
          Method: every figure on this page is a count of responses exactly as entered. No weighting scheme of ours, no imputation, no
          extrapolation to a population. The sample is self-selected and recruited through the channels listed; it describes the people who
          answered and nobody else. A raw N with its denominator and a date is published with every number so it can be read as what it is.
          Any cell holding fewer than {SMALL_CELL_MIN} responses in a named place is withheld and counted as withheld.
        </p>
      </div>
    </section>
  );
}

function Stat({ n, label, sub }: { n: number | null; label: string; sub?: string }) {
  return (
    <div className={`reg-stat${n === 0 ? ' is-zero' : ''}`}>
      <p className="big-num">{n === null ? '…' : n}</p>
      <p className="big-lab">{label}</p>
      {sub && <p className="reg-sub">{sub}</p>}
    </div>
  );
}

/* Every correction on one publisher's rows, grouped by the file the row lives in. */
function PublisherBlock({ publisher, documents, asOf }: { publisher: Publisher; documents: { title: string; rows: CiteRow[] }[]; asOf: string }) {
  const thumbs = documents.reduce((a, doc) => a + doc.rows.reduce((b, r) => b + r.confirmedRight + r.flaggedWrong, 0), 0);
  const rows = documents.reduce((a, doc) => a + doc.rows.length, 0);
  const published = ROWS_BY_PUBLISHER[publisher] ?? 0;
  return (
    <div className="pub-block">
      <h3 className="pub-h">
        {publisher} <span className="pub-full">{PUBLISHER_FULL[publisher]}</span>
        <span className="pub-n">{thumbs} {thumbs === 1 ? 'thumb' : 'thumbs'} on {rows} of {published} {published === 1 ? 'row' : 'rows'} we price from {publisher}</span>
      </h3>
      <p className="micro">{PUBLISHER_ROUTE[publisher]}</p>
      {documents.map((doc) => <DocumentBlock key={doc.title} title={doc.title} rows={doc.rows} asOf={asOf} />)}
    </div>
  );
}

function DocumentBlock({ title, rows, asOf }: { title: string; rows: CiteRow[]; asOf: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const inTable = ROWS_BY_DOCUMENT[title] ?? rows.length;
  const url = rows[0]?.sourceUrl;
  const site = typeof window === 'undefined' ? '' : window.location.origin;
  const fileSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

  async function copyOne(r: CiteRow) {
    const ok = await copyText(citationText(r, asOf, site));
    setCopied(ok ? r.priceId : null);
    if (ok) setTimeout(() => setCopied((c) => (c === r.priceId ? null : c)), 4000);
  }

  return (
    <div className="doc-block">
      <h4 className="doc-h">{documentOf(title)}</h4>
      <p className="micro">
        {rows.length} of the {inTable} {inTable === 1 ? 'row' : 'rows'} we price from this file {rows.length === 1 ? 'has' : 'have'} at least one thumb.
        {url && <> <a href={url} target="_blank" rel="noopener noreferrer">The published file</a>.</>}
      </p>
      <div className="table-scroll" tabIndex={0}>
        <table className="ledger-table">
          <thead>
            <tr>
              <th scope="col">Published figure</th><th scope="col" className="r">Published</th>
              <th scope="col" className="r">Fits</th><th scope="col" className="r">Does not fit</th>
              <th scope="col" className="r">Fit rate</th><th scope="col" className="r">Median said paid</th>
              <th scope="col">Send it on</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rate = fitRate(r.confirmedRight, r.flaggedWrong);
              return (
                <tr key={r.priceId}>
                  <td>{r.label}<span className="li-sub">{r.priceId}{r.code ? ` · ${r.code}` : ''} · {r.year}</span></td>
                  <td className="r">{r.valueUsd === null ? '—' : usd(r.valueUsd, true)}</td>
                  <td className="r">{r.confirmedRight}</td>
                  <td className="r">{r.flaggedWrong}</td>
                  <td className="r">{rate === null ? '—' : `${rate}%`}<i className="of"> of {r.confirmedRight + r.flaggedWrong}</i></td>
                  <td className="r">{r.medianBelievedUsd === null ? '—' : usd(r.medianBelievedUsd)}</td>
                  <td><button type="button" className="cite-btn" onClick={() => copyOne(r)} aria-label={`Copy the citation block for ${r.label}`}>{copied === r.priceId ? 'Copied' : 'Copy citation'}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="doc-actions">
        <button type="button" className="btn ghost sm" onClick={() => download(`waypoint-corrections-${fileSlug}.csv`, correctionsCsv(rows, asOf))}>Download this file&rsquo;s corrections (CSV)</button>
        <span className="micro" aria-live="polite">{copied ? 'Citation copied — paste it into a message to the publisher.' : 'Each row copies out as a citation block: the row id, the code, the figure, its basis and the count.'}</span>
      </div>
    </div>
  );
}

function Dist({ title, data, labels, n }: { title: string; data?: Record<string, number>; labels: Record<string, string>; n: number }) {
  const rows = Object.entries(data ?? {}).sort((a, b) => b[1] - a[1]);
  const answered = rows.reduce((a, [, v]) => a + v, 0);
  return (
    <div className="dist">
      <h3>{title} <span className="dist-n">{answered} of {n} answered</span></h3>
      <ul className="dist-list">{rows.map(([k, v]) => <li key={k}><span>{labels[k] ?? k}</span><b>{v}<i> of {n}</i></b></li>)}</ul>
    </div>
  );
}

function Coverage({ title, coverage, keys, labels, n }: { title: string; coverage?: Record<string, Record<string, number>>; keys: readonly string[]; labels: Record<string, string>; n: number }) {
  if (!coverage) return null;
  return (
    <div className="dist coverage">
      <h3>{title} <span className="dist-n">of {n} who answered</span></h3>
      <p className="micro">Optional self-description. &ldquo;Not stated&rdquo; is reported, never filled in. Anyone absent from these rows is absent from the sample.</p>
      <div className="cov-grid">
        {keys.map((k) => (
          <div key={k}>
            <h4>{labels[k] ?? k}</h4>
            <ul className="dist-list">{Object.entries(coverage[k] ?? {}).sort((a, b) => b[1] - a[1]).map(([v, c]) => <li key={v}><span>{v}</span><b>{c}<i> of {n}</i></b></li>)}</ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/* THE SEX CELL — the Federal Sprint Lead's ask, answered as a published count.

   Two things are published here and they are not the same thing: WHO ANSWERED,
   under the same small-cell rule as the state; and HOW EACH SEX RANKED THE FIVE
   BURDENS, which the API suppresses on the server before it is served, because
   a cross-tabulation narrows the group twice. "Prefer not to say" is a stated
   answer and appears as one; leaving the question alone appears as "not stated".
   Neither is ever filled in. Where a federal file cannot be read by sex, /method
   says which file and where it stops. */
function SexCoverage({ counts, bySex, n }: { counts?: Record<string, number>; bySex?: RankingBySex; n: number }) {
  const raw = { ...(counts ?? {}) };
  delete raw['not stated'];
  const stated = Object.values(raw).reduce((a, b) => a + b, 0);
  const { shown, suppressedCells, suppressedTotal } = suppressSmallCells(raw);
  const rows = Object.entries(shown).sort((a, b) => b[1] - a[1]);
  const groups = bySex?.groups ?? [];
  return (
    <div className="dist coverage sex-cov">
      <h3>Sex <span className="dist-n">{stated} of {n} answered</span></h3>
      <p className="micro">
        {SEX_ASK_ORIGIN} Asked as sex, not gender, because sex is the variable the federal prevalence files we cite are published by, and
        because NIH expects it to be accounted for as a biological variable in the research it funds &mdash;{' '}
        <a href={SEX_POLICY_URL} target="_blank" rel="noopener noreferrer">{SEX_POLICY}</a>. A count under {SMALL_CELL_MIN} in one
        answer can identify a person, so it is withheld &mdash; and the withholding is counted here rather than hidden, under the same
        rule as the state.
      </p>
      {rows.length > 0 ? (
        <ul className="dist-list">{rows.map(([k, c]) => <li key={k}><span>{k}</span><b>{c}<i> of {n}</i></b></li>)}</ul>
      ) : (
        <p className="micro">No answer has reached {SMALL_CELL_MIN} responses yet, so no sex cell is published.</p>
      )}
      <p className="micro">
        {suppressedCells === 0
          ? `Nothing withheld: every sex cell published above is at or over ${SMALL_CELL_MIN}.`
          : `Withheld: ${suppressedCells} ${suppressedCells === 1 ? 'answer' : 'answers'} holding ${suppressedTotal} ${suppressedTotal === 1 ? 'response' : 'responses'} between them, each under ${SMALL_CELL_MIN}.`}
        {' '}{n - stated} of {n} did not answer.
      </p>

      <h4 className="doc-h">How each sex ranked the five burdens</h4>
      {groups.length > 0 ? (
        <>
          <div className="table-scroll" tabIndex={0}>
            <table className="ledger-table">
              <thead>
                <tr>
                  <th scope="col">Burden</th>
                  {groups.map((g) => <th key={g.sex} scope="col" className="r">{g.sex}<span className="li-sub">n {g.n}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {BURDENS.map((b) => (
                  <tr key={b.id}>
                    <th scope="row">{B_LABEL[b.id] ?? b.id}</th>
                    {groups.map((g) => {
                      const r = g.ranking.find((x) => x.burden === b.id);
                      return <td key={g.sex} className="r">{r?.meanRank ?? '—'}<i className="of"> mean place · {r?.rankedFirstBy ?? 0} first</i></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="micro">{bySex?.method}</p>
        </>
      ) : (
        <p className="micro">
          No sex group has reached {SMALL_CELL_MIN} responses, so no ranking is published by sex.
          {bySex && bySex.withheldGroups > 0 && ` Withheld: ${bySex.withheldGroups} ${bySex.withheldGroups === 1 ? 'group' : 'groups'} holding ${bySex.withheldResponses} ${bySex.withheldResponses === 1 ? 'response' : 'responses'} between them.`}
          {' '}The cross-tabulation is suppressed on the server, before it is served, and not in this page.
        </p>
      )}
    </div>
  );
}

/* A state health department looking for its own count, and the rule that keeps a
   small count from identifying the person behind it. */
function StateCoverage({ counts, n }: { counts?: Record<string, number>; n: number }) {
  const raw = { ...(counts ?? {}) };
  delete raw['not stated'];
  const stated = Object.values(raw).reduce((a, b) => a + b, 0);
  const { shown, suppressedCells, suppressedTotal } = suppressSmallCells(raw);
  const rows = Object.entries(shown).sort((a, b) => b[1] - a[1]);
  return (
    <div className="dist coverage state-cov">
      <h3>Where they live <span className="dist-n">{stated} of {n} named a state or territory</span></h3>
      <p className="micro">
        Optional, from the 56 states, districts and territories. A count under {SMALL_CELL_MIN} in a named place can identify a person,
        so it is withheld — and the withholding is counted here rather than hidden. That threshold is ours; it is stated in the data
        dictionary and applied to every published state cell.
      </p>
      {rows.length > 0 ? (
        <ul className="dist-list">{rows.map(([s, c]) => <li key={s}><span>{s}</span><b>{c}<i> of {n}</i></b></li>)}</ul>
      ) : (
        <p className="micro">No state has reached {SMALL_CELL_MIN} responses yet, so no state row is published.</p>
      )}
      <p className="micro">
        {suppressedCells === 0
          ? `Nothing withheld: every state cell published above is at or over ${SMALL_CELL_MIN}.`
          : `Withheld: ${suppressedCells} ${suppressedCells === 1 ? 'state or territory' : 'states or territories'} holding ${suppressedTotal} ${suppressedTotal === 1 ? 'response' : 'responses'} between them, each under ${SMALL_CELL_MIN}. ${n - stated} of ${n} did not name a place.`}
      </p>
    </div>
  );
}

/* The change log is written from real interviews and published from the database.
   An empty log is printed as empty; nothing here is ever a placeholder. */
function ChangeLog({ changes, loaded, failed, onRetry, busy }: { changes: Change[]; loaded: boolean; failed: boolean; onRetry: () => void; busy: boolean }) {
  if (failed) return <Failed onRetry={onRetry} busy={busy} />;
  if (!loaded) return <p className="micro">Loading…</p>;
  if (!changes.length) return <p className="micro">No changes logged yet — 0 published. Each entry will read: a user said this, so we changed that, with the date.</p>;
  return (
    <>
      <p className="micro">{changes.length} published {changes.length === 1 ? 'change' : 'changes'}, newest first.</p>
      <ul className="changes">{changes.map((c, i) => <li key={c.id ?? i}><span className="ch-date">{c.date}</span><p><b>{c.who} said:</b> {c.said}</p><p><b>So we changed:</b> {c.changed}</p></li>)}</ul>
    </>
  );
}

/* ==========================================================================
   THE RANKING CHART.

   The legend was two <text> elements carrying a class written for a flexbox
   div, so it had no fill of its own and painted black — invisible in dark mode.
   The legend is HTML now, every glyph inside the SVG carries a theme token, and
   the axis says what the bars are measured against: the number of people who
   answered. No scheme of ours is drawn on top of the counts.
   ========================================================================== */
const CHART_GEOM = { W: 760, rowH: 66, left: 14, right: 168, top: 26, axis: 50 };

function ChartKey() {
  return (
    <p className="chart-key">
      <span><i className="k-first" />put it first</span>
      <span><i className="k-last" />put it last</span>
    </p>
  );
}

/** Ticks a reader can count against: 0, a quarter, a half, three quarters, all of N. */
function axisTicks(n: number): number[] {
  if (n <= 4) return Array.from({ length: n + 1 }, (_, i) => i);
  return [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(n * f));
}

function RankChart({ rows, n }: { rows: { label: string; first: number; last: number; mean: number | null }[]; n: number }) {
  const { W, rowH, left, right, top, axis } = CHART_GEOM;
  const max = Math.max(1, n);
  const H = top + rows.length * rowH + axis;
  const span = W - left - right;
  const ticks = axisTicks(n);
  const baseY = top + rows.length * rowH;
  return (
    <figure className="chart">
      <ChartKey />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Burden ranking by ${n} ${n === 1 ? 'respondent' : 'respondents'}`}>
        {ticks.map((t) => {
          const x = left + (span * t) / max;
          return (
            <g key={t}>
              <line x1={x} y1={top - 8} x2={x} y2={baseY} className="chart-grid" />
              <text x={x} y={baseY + 18} textAnchor={t === 0 ? 'start' : 'middle'} className="chart-axis">{t}</text>
            </g>
          );
        })}
        <line x1={left} y1={baseY} x2={left + span} y2={baseY} className="chart-base" />
        {rows.map((r, i) => {
          const y = top + i * rowH;
          const wF = (span * r.first) / max, wL = (span * r.last) / max;
          return (
            <g key={r.label}>
              <text x={left} y={y + 12} className="chart-label">{r.label}</text>
              <rect x={left} y={y + 20} width={Math.max(wF, 2)} height={13} rx={3} className="chart-fill-first" />
              <rect x={left} y={y + 36} width={Math.max(wL, 2)} height={13} rx={3} className="chart-fill-any" />
              <text x={left + span + 10} y={y + 34} className="chart-val">{r.first} first · {r.last} last</text>
              <text x={left + span + 10} y={y + 50} className="chart-val">mean rank {r.mean ?? '—'}</text>
            </g>
          );
        })}
        <text x={left} y={H - 6} className="chart-axis">people, out of {n} who answered</text>
      </svg>
      <figcaption>Of {n} {n === 1 ? 'person' : 'people'}: how many put each burden first (dark) and last (light), with its mean position from 1 (heaviest) to 5. Counts as entered — no weighting scheme of ours underneath.</figcaption>
    </figure>
  );
}

/**
 * The empty chart. Same geometry, the five real burdens on the axis, and every
 * bar at zero — because zero is the true value. It invites the first answer
 * instead of printing a sentence where a chart should be.
 */
function EmptyRankChart() {
  const { W, rowH, left, right, top, axis } = CHART_GEOM;
  const labels = BURDENS.map((b) => b.label);
  const H = top + labels.length * rowH + axis;
  const span = W - left - right;
  const baseY = top + labels.length * rowH;
  return (
    <figure className="chart is-empty">
      <ChartKey />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The burden ranking, with no responses yet">
        <line x1={left} y1={baseY} x2={left + span} y2={baseY} className="chart-base" />
        <line x1={left} y1={top - 8} x2={left} y2={baseY} className="chart-grid" />
        <text x={left} y={baseY + 18} className="chart-axis">0</text>
        {labels.map((label, i) => {
          const y = top + i * rowH;
          return (
            <g key={label}>
              <text x={left} y={y + 12} className="chart-label">{label}</text>
              <rect x={left} y={y + 20} width={span} height={13} rx={3} className="ghost-bar" />
              <rect x={left} y={y + 36} width={span} height={13} rx={3} className="ghost-bar" />
              <text x={left + span + 10} y={y + 42} className="chart-val">0 first · 0 last</text>
            </g>
          );
        })}
      </svg>
      <figcaption>Nobody has ranked yet. The bars fill from real answers only — nothing here is ever seeded.</figcaption>
      <div className="chart-invite">
        <Link className="btn primary" href="/survey">Be the first, in two minutes</Link>
        <p>Five burdens, ranked heaviest to lightest. No account, no name, no diagnosis.</p>
      </div>
    </figure>
  );
}

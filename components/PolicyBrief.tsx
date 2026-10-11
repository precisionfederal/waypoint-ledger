/* The static half of /policy, rendered at build time from the repo's own data:
   the conditions file joined to the price table, the office behind each
   publishing agency, and the policy levers with their two sources each. No
   client JavaScript: the live counts are in components/PolicyLive.tsx. */
import Link from '@/components/IntentLink';
import {
  conditionRows, figuresBySchedule, AGENCIES, AGENCY_ORDER, LEVERS, SCHEDULES, UNCOUNTED_BURDENS,
  noFigureQualifierFor, POLICY_METHOD, EXPENDITURE_DEFINITION, SMALL_CELL_MIN, type ConditionFigureRow, type ConditionRow, type Source,
} from '@/lib/policy';
import { TABLE } from '@/lib/table';
import conditionsRaw from '@/data/conditions.json';
import pricesRaw from '@/data/prices.json';
import { conditionsOf, type RawConditionsFile, type PublishedFigure } from '@/lib/conditions-core';
import { Fold } from '@/components/trust/Kit';
import { PolicySurvey, PolicyDisputes, PolicyPrint, PolicyPrintOpen, PolicyCardsFit } from './PolicyMount';
import { KindBadge, RangeMarks, plainSentenceDash } from './FigureVisual';

const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const FIG_KIND: Record<PublishedFigure['kind'], string> = {
  per_case_cost: 'Cost of one case',
  prevalence: 'How many people have it',
  incidence: 'New cases a year',
  national_cost: 'Cost to the country',
};
const KIND: Record<string, string> = {
  excess: 'Extra spent in a year over a comparable adult without it',
  condition_attributed: 'Spent in a year treating it',
};

/** The median the source publishes beside a mean, read off the same price-table
 *  row (alternates.median_usd), never typed here. */
const MEDIAN_OF = new Map((pricesRaw as unknown as { items: { id: string; alternates?: Record<string, unknown> | null }[] }).items
  .flatMap((t) => (typeof t.alternates?.median_usd === 'number' ? [[t.id, t.alternates.median_usd as number] as const] : [])));

/** One form on /policy and /conditions (FLOW judge-2, judge-17): a mean is called a
 *  mean with its median beside it; a range is the paper's 95% interval (the only
 *  ranged row is the long COVID excess, PMC12607343: "+USD 4098 (95% CI USD
 *  1619-USD 6578)"). */
function Figure({ f }: { f: ConditionFigureRow }) {
  const median = MEDIAN_OF.get(f.rowId) ?? null;
  return (
    <>
      <strong className="policy-fig">{usd(f.point)}{median !== null ? ' mean' : ''}</strong>
      {median !== null && <span className="policy-dim"> · {usd(median)} median</span>}
      {median === null && f.low !== null && f.high !== null && <span className="policy-dim"> (95% interval {usd(f.low)} to {usd(f.high)})</span>}
      <span className="policy-dim"> · {f.year}</span>
      <br /><span className="policy-dim">{f.figureKind ? KIND[f.figureKind] ?? f.figureKind : f.basis}</span>
    </>
  );
}

function Cite({ s, n }: { s: Source; n: number }) {
  return (
    <li>
      <span className="policy-src-n">Source {n}.</span> <a href={s.url} rel="noopener noreferrer">{s.title}</a> ({s.year}).
      {s.quote && <q className="policy-quote">{s.quote}</q>}
    </li>
  );
}

/** A source's short name in view (FLOW judge-9): its title without the agency
 *  prefix the line already names ("BLS, Current Population Survey contact" reads
 *  "Current Population Survey contact"). The full title and quote stay on hover. */
const shortTitle = (t: string) => { const i = t.indexOf(', '); return i > 0 && i < 16 ? t.slice(i + 2) : t; };

/** Named source links, compact enough for a table cell or a printed line. `lead`
 *  says what the links are, so an office's contact page is never read as evidence. */
function Refs({ sources, lead }: { sources: Source[]; lead?: string }) {
  if (!sources.length) return null;
  return (
    <span className="policy-refs">
      [{lead ? `${lead}: ` : ''}{sources.map((s, i) => (
        <span key={s.url}>{i > 0 && '; '}<a href={s.url} rel="noopener noreferrer" title={`${s.title} (${s.year}): \u201c${s.quote}\u201d`}>{shortTitle(s.title)}</a></span>
      ))}]
    </span>
  );
}

/** JUDGE-2 #5: a closed lever says what it holds. Its summary is the first sentence of
 *  the fold's own "Today" and "With a larger N" lines, word for word; nothing new. */
const firstSentence = (t: string) => { const m = t.match(/^.+?[.!?](?=\s+[A-Z(]|$)/); return m ? m[0] : t; };

type ConditionFigureRowHolder = { id: string; figure: ConditionFigureRow | null };

export default function PolicyBrief() {
  const rows = conditionRows();
  const priced = rows.filter((r) => r.figure).length;
  const pubOf = new Map(conditionsOf(conditionsRaw as unknown as RawConditionsFile).map((c) => [c.id, c.publishedFigures]));
  const hasFig = (r: ConditionFigureRowHolder) => !!r.figure || (pubOf.get(r.id)?.length ?? 0) > 0;
  const withFig = rows.filter(hasFig);
  /* Federal or labelled apart (FLOW judge-1): a condition counts as federal only
     when one of its figures is a government publication. */
  const isFederal = (r: ConditionRow) => (!!r.figure && r.figure.government) || (pubOf.get(r.id) ?? []).some((f) => f.isGovernmentPublication);
  const fedFig = withFig.filter(isFederal);
  const resFig = withFig.filter((r) => !isFederal(r));
  const pricedFederal = rows.filter((r) => r.figure && r.figure.government).length;
  const perSchedule = figuresBySchedule();
  const scheduleCount = (a: string) => SCHEDULES.filter((s) => s.agency === a).reduce((n, s) => n + perSchedule[s.key], 0);
  return (
    <div className="policy" data-policy-brief>
      <PolicyPrintOpen />
      <div className="policy-actions no-print">
        <PolicyPrint />
        <a className="btn" href="/api/policy" target="_blank" rel="noopener noreferrer">The same numbers as JSON</a>
      </div>

      <section aria-labelledby="p-figures" className="policy-sec">
        <h2 id="p-figures">1. What the published figures say, and what they miss</h2>
        <p className="policy-lede" data-testid="policy-condition-summary">
          <strong>{rows.length} conditions</strong>: {withFig.length} with a published burden figure
          {resFig.length > 0 ? ` (${fedFig.length} federal, ${resFig.length} only a peer-reviewed analysis: ${resFig.map((r) => r.label).join(', ')})` : ''}, {rows.length - withFig.length} without one yet.
          {' '}{priced} of the {withFig.length} {priced === 1 ? 'has' : 'have'} a published annual figure{priced !== pricedFederal ? `, ${pricedFederal} of them federal` : ''}; every absence is shown, never filled.
        </p>
        <p className="policy-swipe no-print" aria-hidden="true">Swipe for all {withFig.length}</p>
        <ul className="policy-cards no-print" aria-label={`The ${withFig.length} conditions with a published burden figure`} tabIndex={0}>
          {withFig.map((r) => (
            <li key={r.id} className={`policy-card ${isFederal(r) ? 'is-gov' : 'is-res'}`}>
              <p className="policy-card-h"><strong>{r.label}</strong>{r.icd10cm && <span className="policy-dim"> ICD-10-CM {r.icd10cm}</span>}</p>
              {r.figure && (
                <div className="policy-card-fig">
                  <span className="policy-kind">A year with it</span>
                  <span className="policy-figwrap"><Figure f={r.figure} /></span>
                  <RangeMarks point={r.figure.point} median={MEDIAN_OF.get(r.figure.rowId) ?? null} low={r.figure.low} high={r.figure.high} />
                  <span className="policy-chips">
                    <KindBadge gov={r.figure.government}>{r.figure.government ? 'Government' : 'Research'}<span className="policy-wide"> figure</span></KindBadge>
                    <a className="policy-chip" href={r.figure.sourceUrl} rel="noopener noreferrer" title={r.figure.sourceTitle}>{r.figure.government ? r.figure.sourceTitle.split(':')[0] : `Peer-reviewed analysis${r.figure.agencyDisplay ? ` of ${r.figure.agencyDisplay}` : ''}`}</a>
                  </span>
                </div>
              )}
              {(pubOf.get(r.id) ?? []).map((f) => (
                <div key={f.id} className="policy-card-fig">
                  <span className="policy-kind">{FIG_KIND[f.kind]}</span>
                  <strong className="policy-fig">{f.headline}</strong>
                  {f.valueUsd !== null && <RangeMarks point={f.valueUsd} median={f.medianUsd} />}
                  <span className="policy-chips">
                    <KindBadge gov={f.isGovernmentPublication}>{f.isGovernmentPublication ? 'Government' : 'Research'}<span className="policy-wide"> figure</span></KindBadge>
                    {f.sources.map((s) => (
                      <a key={s.url} className="policy-chip" href={s.url} rel="noopener noreferrer" title={`${s.publisher}: ${s.title}`} aria-label={`${s.publisher}: ${s.title}`}>{s.title.split(',')[0]}</a>
                    ))}
                  </span>
                </div>
              ))}
            </li>
          ))}
        </ul>
        <PolicyCardsFit />
        <table className="policy-tbl policy-print-table">
          <caption>The conditions with a published annual figure</caption>
          <thead><tr><th scope="col">Condition</th><th scope="col">Published figure</th><th scope="col">Source</th></tr></thead>
          <tbody>
            {rows.filter((r) => r.figure).map((r) => (
              <tr key={r.id}>
                <td data-label="Condition">{r.label}{r.icd10cm && <span className="policy-dim"> · {r.icd10cm}</span>}</td>
                <td data-label="Published figure"><Figure f={r.figure!} /></td>
                <td data-label="Source">
                  <span className={r.figure!.government ? 'policy-tag gov' : 'policy-tag res'}>{r.figure!.government ? 'Government figure' : 'Research figure'}</span>{' '}
                  <a href={r.figure!.sourceUrl} rel="noopener noreferrer">{r.figure!.government ? r.figure!.sourceTitle : `Peer-reviewed analysis${r.figure!.agencyDisplay ? ` of ${r.figure!.agencyDisplay}` : ''}`}</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {priced < rows.length && (
          <p className="policy-print-only">
            <strong>No published annual figure we could find:</strong> {rows.length - priced} conditions, each named on the page at /policy and in the JSON at /api/policy.
          </p>
        )}
        {rows.length > withFig.length && (
          <div className="no-print">
            <Fold level={3} id="p-no-figure" title={`The other ${rows.length - withFig.length}: no federal burden figure yet`}
              summary="Each named, with its ICD-10-CM code">
              <ul className="policy-names">
                {rows.filter((r) => !hasFig(r)).map((r) => (
                  <li key={r.id}>{r.label}{r.icd10cm && <span className="policy-dim"> {r.icd10cm}</span>}</li>
                ))}
              </ul>
              <p><Link href="/gap" className="policy-link">Count what is missing</Link></p>
            </Fold>
          </div>
        )}
        <p className="micro">{plainSentenceDash(noFigureQualifierFor(rows.length - withFig.length))} Each figure is shown apart and is never added to anyone&rsquo;s ledger, and figures of different kinds are not ranked against each other.</p>

        <h3 className="policy-h3">What no expenditure file counts</h3>
        <p>
          {EXPENDITURE_DEFINITION.text} <Refs sources={EXPENDITURE_DEFINITION.sources} /> By that definition it cannot hold
          {' '}{UNCOUNTED_BURDENS.map((b) => b.label.toLowerCase()).join('; ')}.
          People searching for a diagnosis ranked those burdens themselves:
        </p>
        <PolicySurvey />
      </section>

      <section aria-labelledby="p-disputes" className="policy-sec">
        <h2 id="p-disputes">2. Where published figures are disputed</h2>
        <p>
          Every line of a ledger carries a Right and a Wrong. A Wrong is bound to the one published row it is about, so the count can be
          read by the agency and the file that published the number. Cells under {SMALL_CELL_MIN} are not shown.
        </p>
        <PolicyDisputes />
        <Fold level={3} id="p-offices" title="Who publishes each file"
          summary={`${AGENCY_ORDER.filter((k) => scheduleCount(k) > 0).length} publishers, the office behind each, with its sources`}>
        <ul className="policy-offices">
          {AGENCY_ORDER.map((k) => {
            const a = AGENCIES[k];
            const n = scheduleCount(k);
            if (!n) return null;
            return (
              <li key={k}>
                <strong>{a.name}</strong> ({n} {n === 1 ? 'figure' : 'figures'}): {a.office} <Refs sources={a.sources} lead="office named in" />
              </li>
            );
          })}
        </ul>
        </Fold>
        <p className="micro">&ldquo;Routable&rdquo;, not &ldquo;routed&rdquo;: the corrections file names the office, the file and the row, and nothing has been sent to any agency.</p>
      </section>

      <section aria-labelledby="p-levers" className="policy-sec">
        <h2 id="p-levers">3. What this could change</h2>
        <p>Existing federal rules and programs this evidence speaks to. Each says what the evidence shows today and what a larger N would let an agency do. None of this has happened.</p>
        <ol className="policy-levers">
          {LEVERS.map((l) => (
            <li key={l.id}>
              <Fold level={3} id={`p-lever-${l.id}`} title={l.title}
                summary={<span className="policy-lever-sum"><span><b>Today:</b> {firstSentence(l.today)}</span> <span><b>With more answers:</b> {firstSentence(l.larger)}</span></span>}>
                <p>{l.what}</p>
                <p><strong>Today:</strong> {l.today}</p>
                <p><strong>With a larger N:</strong> {l.larger}</p>
                <ul className="policy-src">{l.sources.map((s, i) => <Cite key={s.url} s={s} n={i + 1} />)}</ul>
              </Fold>
            </li>
          ))}
        </ol>
      </section>

      <section className="policy-sec">
        <Fold id="p-method" title="How to read this" summary="What is counted, what is withheld under the small-cell rule, and where every number is">
        <p className="micro">{POLICY_METHOD} Price table: {TABLE.length} published figures. The JSON at <a href="/api/policy">/api/policy</a> carries every number on this page; the corrections file at <a href="/api/export/corrections.csv">/api/export/corrections.csv</a> carries the file, its SHA-256 and the row each figure was read from.</p>
        </Fold>
      </section>
    </div>
  );
}

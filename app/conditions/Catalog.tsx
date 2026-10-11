/* ==========================================================================
   /conditions: every condition, its figure, what the tool prices for it,
   and how to add one. Rendered at build time from the catalog (a pure function
   of data/conditions.json, data/prices.json and the reader), so nothing on
   this page is typed by hand except the words around the data.

   Each condition is a card: its name, its ICD-10-CM code, its figure and the
   sources behind it are in view; the code's title, both quotes, the method
   notes and the example sentence sit behind "Details" (the trust Kit's Fold,
   native details/summary, so find-in-page and a #fragment still reach them).

   No hooks and no client state: the unit suite renders this component with a
   conditions file that has one extra entry in it and reads the HTML.
   ========================================================================== */

import React from 'react';
import Link from '@/components/IntentLink';
import type { CatalogEntry, PricedExample } from '@/lib/conditions-catalog';
import type { PublishedFigure } from '@/lib/conditions-core';
import { Fold } from '@/components/trust/Kit';
import { KindBadge, RangeMarks, plainDash, plainSentenceDash } from '@/components/FigureVisual';
import ConditionFilter from './ConditionFilter';
import ThemedImg from '@/components/ThemedImg';
import s from './conditions.module.css';

const usd0 = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const usd2 = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const KIND_WORDS: Record<PublishedFigure['kind'], string> = {
  per_case_cost: 'Cost of one case',
  prevalence: 'How many people have it',
  incidence: 'New cases a year',
  national_cost: 'Cost to the country',
};

function Who({ gov }: { gov: boolean }) {
  return <KindBadge gov={gov}>{gov ? 'Government figure' : 'Research figure'}</KindBadge>;
}

/** What the filter reads: every name a person might type, and the code. */
const searchText = (e: CatalogEntry) =>
  [e.condition.label, ...e.condition.alsoCalled, e.condition.icd10cm ?? ''].join(' ').toLowerCase();
const kindOf = (e: CatalogEntry) =>
  hasFederalFigure(e) ? 'federal'
    : (e.benchmark.kind === 'figure' || e.condition.publishedFigures.length > 0) ? 'research' : 'none';

/** A source as a chip: the publisher in view, the full title for a screen reader and on hover. */
function SourceChip({ href, publisher, title }: { href: string; publisher: string; title: string }) {
  return (
    <a className={s.src} href={href} target="_blank" rel="noopener noreferrer" title={title} aria-label={`${publisher}: ${title}`}>
      {publisher}
    </a>
  );
}

/** The full record of one published figure, inside Details. */
function FigureBlock({ f }: { f: PublishedFigure }) {
  return (
    <div className={s.fig} data-testid={`figure-${f.id}`}>
      <p className={s.figHead}>
        <span className={s.kind}>{KIND_WORDS[f.kind]}</span>
        <Who gov={f.isGovernmentPublication} />
      </p>
      <p className={s.figNumSm}>{f.headline}</p>
      <p className={s.figText}>{f.measures}</p>
      <p className={s.figMeta}>{f.population}. Data year: {f.year}.</p>
      <p className={s.figMeta}>{f.publisherNote}</p>
      <ol className={s.sources}>
        {f.sources.map((src) => (
          <li key={src.url}>
            <a href={src.url} target="_blank" rel="noopener noreferrer">{src.publisher}: {src.title}</a>
            <span className={s.quote}>&ldquo;{src.quote}&rdquo;</span>
            <span className={s.read}>Read {src.readOn}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ExampleTable({ ex, id }: { ex: PricedExample; id: string }) {
  return (
    <div className={s.example}>
      <p className={s.exLbl}>An example sentence, read by the same reader as the home page</p>
      <blockquote className={s.sentence}>{ex.sentence}</blockquote>
      <div className={s.tblWrap} tabIndex={0} role="region" aria-label={`What the tool read in the example for ${id}`}>
        <table className={`${s.tbl} ${s.stack}`}>
          <thead>
            <tr><th scope="col">Words</th><th scope="col">Read as</th><th scope="col" className={s.num}>Priced at</th></tr>
          </thead>
          <tbody>
            {ex.lines.map((l, i) => (
              <tr key={i}>
                <td data-label="Words" className={s.words}>{l.raw}</td>
                <td data-label="Read as">
                  {l.itemLabel
                    ? <>{plainDash(l.itemLabel, ': ')}{l.code ? <span className={s.code}> {l.code}</span> : null}{l.times > 1 ? <> &times; {l.times}</> : null}</>
                    : <span className={s.unpriced}>Unpriced, by name{l.reason ? `: ${l.reason}` : ''}</span>}
                </td>
                <td data-label="Priced at" className={s.num}>{l.lineUsd !== null ? usd2(l.lineUsd) : 'Unpriced'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                The priced lines ({ex.pricedCount}){ex.unpricedCount ? `, with ${ex.unpricedCount} unpriced and left out rather than guessed` : ''}
              </th>
              <td className={s.num}>{usd2(ex.pricedTotalUsd)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className={s.figMeta}>
        {ex.composedFrom} Priced at the national Medicare-allowed amounts for {ex.years.join(', ') || 'the table year'},
        the same figures the ledger uses before you choose a state.
      </p>
    </div>
  );
}

/** The tool's figure, drawn as the lines it is made of: one segment per priced
 *  line, in the order the sentence named them, on this figure's own scale. The
 *  list under it is the text of the drawing; unpriced lines are named, never drawn. */
function Composition({ lines }: { lines: PricedExample['lines'] }) {
  const priced = lines.filter((l) => l.lineUsd !== null && l.lineUsd > 0);
  const total = priced.reduce((a, l) => a + (l.lineUsd ?? 0), 0);
  if (!priced.length || total <= 0) return null;
  return (
    <div className={s.comp}>
      <span className={s.compBar} aria-hidden="true">
        {priced.map((l, i) => <span key={i} style={{ width: `${(100 * (l.lineUsd ?? 0)) / total}%` }} />)}
      </span>
      <ol className={s.compList}>
        {priced.map((l, i) => (
          <li key={i}><i aria-hidden="true" />{l.itemLabel ? plainDash(l.itemLabel, ': ') : l.raw}{l.times > 1 ? <> &times; {l.times}</> : null}<b>{usd2(l.lineUsd ?? 0)}</b></li>
        ))}
      </ol>
    </div>
  );
}

/** The published side's words, each a single string so a copy of the page reads
 *  "Mean per reported case: $1,333. Median: $478.": each label once, beside its own value. */
export const meanLine = (mean: number) => `Mean per reported case: ${usd0(mean)}.`;
export const medianLine = (median: number) => `Median: ${usd0(median)}.`;

/** Lyme first, because it is the one where a published per-case cost can be set
 *  beside a journey the tool prices. Every entry with such a pair gets a panel. */
export function ValidationPanel({ entry }: { entry: CatalogEntry }) {
  const f = entry.condition.publishedFigures.find((x) => x.compareWithJourney);
  const ex = entry.example;
  if (!f || !ex || f.valueUsd === null) return null;
  return (
    <section className={`card ${s.validate}`} aria-labelledby={`validate-${entry.condition.id}`} data-testid="validation-panel">
      {/* VISUAL data: a path out of a woodland edge (4a, lyme-hero v2 and its night copy, 1200x525; critic R2 new-6). Decorative only. */}
      {entry.condition.id === 'lyme' && (
        <ThemedImg light="/img/v2/lyme-hero.webp" dark="/img/v2/lyme-hero-dark.webp" width={1200} height={525} alt="" className={s.valArt} />
      )}
      <p className="lbl">Checking the tool against a published figure</p>
      <h2 id={`validate-${entry.condition.id}`}>{`${entry.condition.label}: two numbers, side by side, never added`}</h2>
      <div className={s.pair}>
        <div className={`${s.side} ${s.sidePub}`}>
          <p className={s.kind}>{f.dollarsYear ? `Published (${f.dollarsYear} dollars)` : 'Published'}</p>
          <p className={s.bigNum}>{usd0(f.valueUsd)}</p>
          {/* FINAL-1011 lyme: no "$0" at the start of this line (beside a cost it reads as a
              value), and no words on the marks: the sentence under it names each mark once,
              with the mark's own key in front, and each label sits beside its own value. */}
          <RangeMarks point={f.valueUsd} median={f.medianUsd} zero={false} words={false} />
          <p className={s.figText} data-testid="validate-mean-median">
            <span className={s.keyRow}><i className={s.keyMean} aria-hidden="true" />{meanLine(f.valueUsd)}</span>
            {f.medianUsd !== null && <> <span className={s.keyRow}><i className={s.keyMed} aria-hidden="true" />{medianLine(f.medianUsd)}</span></>}
          </p>
          <p className={s.figText}>{f.measures}</p>
          <p className={s.figMeta}>
            <Who gov={f.isGovernmentPublication} />{' '}
            <a href={f.sources[0]?.url} target="_blank" rel="noopener noreferrer">{f.sources[0]?.title}</a>
          </p>
        </div>
        <span className={s.never} aria-hidden="true">Never added</span>
        <div className={`${s.side} ${s.sideTool}`}>
          <p className={s.kind}>{`This tool (${ex.years.join(', ')} dollars)`}</p>
          <p className={s.bigNum}>{usd2(ex.pricedTotalUsd)}</p>
          <Composition lines={ex.lines} />
          <p className={s.figText}>
            {`What the example sentence below prices to: ${ex.pricedCount} priced lines at national Medicare-allowed amounts${ex.unpricedCount ? `, and ${ex.unpricedCount} unpriced line${ex.unpricedCount > 1 ? 's' : ''} named and left out` : ''}.`}
          </p>
          {/* lib/store.tsx COMPOSED_EXAMPLES: the same sentence, on the ledger. A full page
              load (a plain link), because the store reads ?example= once, when it starts. */}
          {entry.condition.id === 'lyme' && (
            <p className={s.figMeta}>An example we wrote, not anyone&rsquo;s record: <a href="/ledger?example=lyme" data-testid="validate-open-example">open it on the ledger, line by line</a></p>
          )}
        </div>
      </div>
      <Fold level={3} id={`validate-${entry.condition.id}-why`} title="What each one measures, and why they differ"
        summary={`${f.differsFromJourney.length + 1 + (ex.unpricedCount > 0 ? 1 : 0)} reasons, and why the two are never added`}>
        <ul className={s.why}>
          {f.differsFromJourney.map((w) => <li key={w}>{w}</li>)}
          <li>
            Different years: the published figure is in {f.dollarsYear} dollars and the tool&rsquo;s is in{' '}
            {ex.years.join(', ')} dollars. Neither is adjusted into the other.
          </li>
          {ex.unpricedCount > 0 && (
            <li>
              Care the table has no row for is missing from the tool&rsquo;s figure on purpose: it is named and left
              out rather than filled with a guess.
            </li>
          )}
        </ul>
      </Fold>
      <p className={s.figMeta}>
        The two are never added, blended or divided into each other. The published figure describes{' '}
        {f.population.charAt(0).toLowerCase() + f.population.slice(1)}; the tool prices the care one person names
        at today&rsquo;s federal rates.
      </p>
    </section>
  );
}

/** A short name for a year figure's source: the publication's own name for a
 *  government brief, "Peer-reviewed analysis of <survey>" for research. */
const yearSourceName = (gov: boolean, title: string, agency: string | null) =>
  gov ? title.split(':')[0] : `Peer-reviewed analysis${agency ? ` of ${agency}` : ''}`;

function Icd({ code, billable }: { code: string | null; billable: boolean | null }) {
  return code
    ? <span className={s.icd}>ICD-10-CM <span className={s.code}>{code}</span>{billable === false ? <span className={s.icdNote}> category</span> : null}</span>
    : <span className={`${s.icd} ${s.icdNone}`}>No single ICD-10-CM code</span>;
}

type YearBenchmark = Extract<CatalogEntry['benchmark'], { kind: 'figure' }>;

/** A year figure in one form on every page (FLOW judge-2, judge-17). Where the
 *  price-table row carries the median the source publishes, the mean is called a
 *  mean and the median sits beside it. A range is printed as the paper's 95%
 *  interval: the only ranged row is meps2022-longcovid-excess-total, whose source
 *  (Neba et al. 2025, PMC12607343) reads "+USD 4098 (95% CI USD 1619-USD 6578)";
 *  tests/flow-judge.test.ts fails if another ranged row arrives unchecked. */
export function YearFigure({ b }: { b: YearBenchmark }) {
  if (b.median !== null) {
    return <>{usd0(b.point)} mean<span className={s.range}> · {usd0(b.median)} median</span></>;
  }
  return <>{usd0(b.point)}{b.low !== null && b.high !== null ? <span className={s.range}> (95% interval {usd0(b.low)} to {usd0(b.high)})</span> : null}</>;
}

/** Federal or labelled apart: a condition counts as having a federal burden figure
 *  only when one of its figures is a government publication. */
export const hasFederalFigure = (e: CatalogEntry) =>
  (e.benchmark.kind === 'figure' && e.benchmark.isGovernmentPublication)
  || e.condition.publishedFigures.some((f) => f.isGovernmentPublication);

/** One condition with a figure: what a reader scans is in view, the record is behind Details. */
function Entry({ e }: { e: CatalogEntry }) {
  const c = e.condition;
  const b = e.benchmark;
  return (
    <article className={`${s.entry} ${hasFederalFigure(e) ? s.entryGov : s.entryRes}`} id={c.id} aria-labelledby={`${c.id}-h`}
      data-cond={searchText(e)} data-kind={kindOf(e)}>
      <header className={s.entryHead}>
        <h3 id={`${c.id}-h`} className={s.name}>{c.label}</h3>
        <Icd code={c.icd10cm} billable={c.icd10cmBillable} />
      </header>

      {b.kind === 'figure' && (
        <div className={s.hl}>
          <p className={s.kind}>A year with it</p>
          <p className={s.figNum}><YearFigure b={b} /></p>
          <RangeMarks point={b.point} median={b.median} low={b.low} high={b.high} />
          <p className={s.hlMeta}>{plainDash(b.figureKindLabel)}. {b.year}.</p>
          <p className={s.chips}>
            <Who gov={b.isGovernmentPublication} />
            <SourceChip href={b.sourceUrl} publisher={yearSourceName(b.isGovernmentPublication, b.sourceTitle, b.agencyDisplay)} title={b.sourceTitle} />
          </p>
        </div>
      )}
      {c.publishedFigures.map((f) => (
        <div className={s.hl} key={f.id}>
          <p className={s.kind}>{KIND_WORDS[f.kind]}</p>
          <p className={s.figNum}>{f.headline}</p>
          {f.valueUsd !== null && <RangeMarks point={f.valueUsd} median={f.medianUsd} />}
          <p className={s.chips}>
            <Who gov={f.isGovernmentPublication} />
            {f.sources.map((src) => <SourceChip key={src.url} href={src.url} publisher={src.publisher} title={src.title} />)}
          </p>
        </div>
      ))}

      <Fold level={3} id={`${c.id}-details`}
        title={<>Details<span className="sr-only"> for {c.label}</span></>}
        summary={c.publishedFigures.length ? 'The code, both quotes, who counted and how, an example' : 'The code, the source, what the tool prices, an example'}>
        {c.alsoCalled.length > 0 && <p className={s.aka}>Also called {c.alsoCalled.join(', ')}</p>}
        <dl className={s.facts}>
          <dt>Diagnosis code</dt>
          <dd>
            {c.icd10cm
              ? <>ICD-10-CM <span className={s.code}>{c.icd10cm}</span>, &ldquo;{c.icd10cmTitle}&rdquo;{c.icd10cmBillable === false ? ' (a category heading; the billable codes sit under it)' : ''}. Checked in the CDC/NCHS files for FY2026 and FY2027.</>
              : <>None, on purpose. {c.icd10cmBlankReason}</>}
          </dd>
          <dt>A year with it</dt>
          <dd>
            {b.kind === 'figure'
              ? <><strong><YearFigure b={b} /></strong>, {plainDash(b.figureKindLabel)}. {b.year}. <a href={b.sourceUrl} target="_blank" rel="noopener noreferrer">{b.isGovernmentPublication ? b.sourceTitle : plainDash(b.sourceTitle)}</a> <Who gov={b.isGovernmentPublication} /></>
              : <>No published figure. {b.reason}</>}
          </dd>
          <dt>What the tool prices</dt>
          <dd>
            Every visit, test and procedure a person types, one line each, from the same federal table as every other
            condition. A year of living with it is priced only where a year figure exists above.
          </dd>
        </dl>
        {c.publishedFigures.length > 0 && (
          <div className={s.figs}>
            <p className={s.exLbl}>Published about it, shown apart and never added to a ledger</p>
            {c.publishedFigures.map((f) => <FigureBlock key={f.id} f={f} />)}
          </div>
        )}
        {c.definitionCaveat && <p className={s.figMeta}>{plainDash(c.definitionCaveat, ': ')}</p>}
        {e.example && <ExampleTable ex={e.example} id={c.id} />}
      </Fold>
    </article>
  );
}

/** A row for a condition with no verified burden figure yet: its code, the
 *  absence in words, and what the tool prices. Compact, because there are many. */
function ListedRow({ e }: { e: CatalogEntry }) {
  const c = e.condition;
  return (
    <tr id={c.id} data-cond={searchText(e)} data-kind={kindOf(e)}>
      <th scope="row">{c.label}</th>
      <td data-label="ICD-10-CM">
        {c.icd10cm
          ? <><span className={s.code}>{c.icd10cm}</span> {c.icd10cmTitle}{c.icd10cmBillable === false ? ' (category heading)' : ''}</>
          : 'None, on purpose'}
      </td>
      <td data-label="Priced">
        {e.benchmark.kind === 'none' ? 'No verified federal burden figure yet. ' : ''}
        Every visit and test priced line by line{e.example ? <>; <a href={`#${c.id}-example`}>example below</a></> : null}.
      </td>
    </tr>
  );
}

export default function Catalog({ entries, schemaHref, qualifier }:
  { entries: CatalogEntry[]; schemaHref: string; qualifier?: string }) {
  const coded = entries.filter((e) => e.condition.icd10cm).length;
  const yearFigure = entries.filter((e) => e.benchmark.kind === 'figure').length;
  const hasFigure = (e: CatalogEntry) => e.benchmark.kind === 'figure' || e.condition.publishedFigures.length > 0;
  const withFigure = entries.filter(hasFigure);
  const federal = withFigure.filter(hasFederalFigure);
  const research = withFigure.filter((e) => !hasFederalFigure(e));
  const yearFederal = entries.filter((e) => e.benchmark.kind === 'figure' && e.benchmark.isGovernmentPublication).length;
  const without = entries.filter((e) => !hasFigure(e));
  const withPanel = entries.filter((e) => e.example && e.condition.publishedFigures.some((f) => f.compareWithJourney));
  const examplesWithout = without.filter((e) => e.example);
  return (
    <section className="page">
      <div className="wrap">
        <header className={s.hero}>
          <div className={s.heroCopy}>
            <p className="eyebrow">Conditions</p>
            <h1>Every condition this tool reads, and the figure behind each</h1>
            <p className="lede">
              A condition here is data, not code. Each one below is a single entry in one file, and the reader, the price
              table and this page are the same for all of them. To add one, you add an entry; nothing else changes.
            </p>
          </div>
          {/* VISUAL data: the conditions hero (ART lane, 1200x525). Decorative: the heading beside it says what it shows. */}
          <ThemedImg light="/img/v2/conditions-hero.webp" dark="/img/v2/conditions-hero-dark.webp" width={1200} height={525} alt="" className={s.heroArt} loading="eager" fetchPriority="high" />
        </header>
        <p className={s.counts} data-testid="condition-counts">
          <span><strong>{entries.length}</strong> conditions</span>
          <span><strong>{coded}</strong> with a diagnosis code checked in the CDC/NCHS file</span>
          <span><strong>{federal.length}</strong> with a federal burden figure</span>
          {research.length > 0 && (
            <span><strong>{research.length}</strong> with only a peer-reviewed figure ({research.map((e) => e.condition.label).join(', ')})</span>
          )}
          <span><strong>{yearFigure}</strong> with a figure for a year{yearFigure !== yearFederal ? `, ${yearFederal} of them federal` : ''}</span>
          <span><strong>{without.length}</strong> priceable, no verified burden figure yet</span>
        </p>

        {withPanel.map((e) => <ValidationPanel key={e.condition.id} entry={e} />)}

        <ConditionFilter total={entries.length} />

        <h2 className={s.h2} id="with-figure">
          With a published burden figure ({withFigure.length}{research.length > 0 ? `: ${federal.length} federal, ${research.length} peer-reviewed` : ''})
        </h2>
        <nav aria-label="Conditions with a figure" className={s.jump}>
          {withFigure.map((e) => <a key={e.condition.id} href={`#${e.condition.id}`}>{e.condition.label}</a>)}
          <a href="#no-figure" className={s.jumpMore}>The other {without.length}</a>
        </nav>
        <div className={s.grid} data-cond-group="">
          {withFigure.map((e) => <Entry key={e.condition.id} e={e} />)}
        </div>

        <Fold id="no-figure" title={`Priceable, no verified federal burden figure yet (${without.length})`}
          summary={`Each with its ICD-10-CM code and what the tool prices${examplesWithout.length ? `; ${examplesWithout.length} with an example sentence` : ''}`}>
          <p className={s.figText}>
            Every visit, test and procedure for these is priced from the same federal table, line by line. What is missing is
            a published figure for the condition itself that we have read in two sources. {qualifier ? plainSentenceDash(qualifier) : qualifier}
          </p>
          <div className={s.tblWrap} tabIndex={0} role="region" aria-label="Conditions with no verified federal burden figure yet">
            <table className={`${s.tbl} ${s.stack} ${s.list}`}>
              <thead>
                <tr><th scope="col">Condition</th><th scope="col">ICD-10-CM code, CDC/NCHS FY2026 and FY2027</th><th scope="col">What the tool prices</th></tr>
              </thead>
              <tbody>{without.map((e) => <ListedRow key={e.condition.id} e={e} />)}</tbody>
            </table>
          </div>
          {examplesWithout.length > 0 && <h3 className={s.h3}>Example sentences, read by the same reader</h3>}
          {examplesWithout.map((e) => (
            <Fold key={e.condition.id} level={3} id={`${e.condition.id}-example`} title={e.condition.label}
              summary={`${e.example!.pricedCount} priced ${e.example!.pricedCount === 1 ? 'line' : 'lines'}, ${usd2(e.example!.pricedTotalUsd)}${e.example!.unpricedCount ? `; ${e.example!.unpricedCount} unpriced by name` : ''}`}>
              {e.condition.nationalContext && <p className={s.figMeta}>{e.condition.nationalContext}</p>}
              <ExampleTable ex={e.example!} id={e.condition.id} />
            </Fold>
          ))}
        </Fold>

        <section className={`card ${s.add}`} aria-labelledby="add-h" id="add">
          <h2 id="add-h">How to add a condition</h2>
          <p>For an agency, a clinic or an advocacy group that wants its condition read the same way.</p>
          <ol className={s.steps}>
            <li>
              <strong>Write one entry</strong> in <code>data/conditions.json</code>. Its shape is published as a
              JSON Schema: <a href={schemaHref}>{schemaHref}</a>. Every field is required; a blank is written as
              null with the reason beside it.
            </li>
            <li>
              <strong>Name the diagnosis code</strong> exactly as the CDC/NCHS ICD-10-CM file prints it, or null with
              a reason. The check re-reads the code in the FY2026 and FY2027 files.
            </li>
            <li>
              <strong>Cite the figure twice.</strong> A figure about the condition goes in <code>published_figures</code>{' '}
              with two sources and the exact sentence from each. A year-ahead figure must already be a verified row of
              the price table; with none, the product says there is none and counts the gap.
            </li>
            <li>
              <strong>Run the checks.</strong> <code>python3 data/verify_conditions.py</code> fetches every source and
              fails if a sentence or a code is not where the entry says it is. <code>npm test</code> validates every
              entry against the schema.
            </li>
            <li>
              <strong>Nothing else.</strong> The chips, the year-ahead card and this page read the file. No component
              names a condition.
            </li>
          </ol>
          <p className={s.figMeta}>
            The whole procedure for another condition, state or population is on <Link href="/adopt">Adopt this</Link>;
            how every figure is made is on <Link href="/method">the method page</Link>.
          </p>
        </section>
      </div>
    </section>
  );
}

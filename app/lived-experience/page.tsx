import type { Metadata } from 'next';
import Link from '@/components/IntentLink';
import { shareCard } from '@/lib/og';
import { SELECTABLE } from '@/lib/table';
import { usd, JOURNEY_TOTAL_BASIS } from '@/lib/pricing';
import {
  COMPOSITE_LABEL, FEATURES, LIVED_SOURCES, RESEARCH_JOURNEYS, SOURCE_KINDS, THEMES,
  JOURNEY_BOX, findingById, ledgerOf, sourceIdsOf, storyOf, type LivedFinding, type LivedSource,
} from '@/lib/research-journeys';
import OpenInTool from './OpenInTool';
import './lived.css';

const TITLE = 'What patients told researchers, and what we built for it';
const DESCRIPTION = 'Published research on living with long COVID, POTS, ME/CFS, Lyme disease, Ehlers-Danlos syndrome, lupus and sickle cell disease, quoted word for word, made into labelled composite journeys and priced by the same reader as your own.';
export const metadata: Metadata = { title: 'Lived experience, from published research', description: DESCRIPTION, ...shareCard(TITLE, DESCRIPTION, '/lived-experience') };

/* 🔴 WHAT THIS PAGE IS, SAID ON ITS FACE (Bo, 2026-10-11: "We never say these are
   live interviews and live feedback"). Every finding is a published report,
   study or testimony, quoted verbatim with the place it says it. Every journey
   is a composite of steps those sources document, labelled as one, priced by
   running its sentence through the reader and the table (priceSentence), so
   no number on this page is typed. Our own direct input lives on /register. */

const NUM = new Map(LIVED_SOURCES.map((s, i) => [s.id, i + 1]));
const ITEM = new Map(SELECTABLE.map((i) => [i.id, i]));
const FINDINGS = LIVED_SOURCES.reduce((n, s) => n + s.findings.length, 0);
const CONDITIONS = ['long COVID', 'POTS', 'ME/CFS', 'Lyme disease', 'Ehlers-Danlos syndrome', 'lupus', 'sickle cell disease'];
const KIND_LABEL: Record<string, string> = {
  'federal patient research': 'Federal patient research',
  'national academies': 'National Academies',
  'patient-organization survey': 'Patient-organization survey',
  'peer-reviewed qualitative/survey': 'Peer-reviewed study',
  'public testimony': 'Senate testimony',
};
const years = (n: number) => (Number.isInteger(n) ? String(n) : n < 1 ? `${Math.round(n * 52)} weeks` : n.toFixed(1).replace(/\.0$/, ''));

function Cite({ f }: { f: string }) {
  const hit = findingById(f);
  if (!hit) return null;
  const n = NUM.get(hit.source.id);
  return <a className="le-cite" href={`#src-${hit.source.id}`}>[{n}]</a>;
}

function Quote({ f }: { f: LivedFinding & { source?: LivedSource } }) {
  const hit = findingById(f.id)!;
  return (
    <li className="le-quote">
      <p className="le-quote-finding">{f.finding} <Cite f={f.id} /></p>
      <blockquote>
        <p>&ldquo;{f.quote}&rdquo;</p>
        <footer><a href={hit.source.url} target="_blank" rel="noopener noreferrer">{hit.source.publisher}, {hit.source.year}</a> · {f.locator}</footer>
      </blockquote>
    </li>
  );
}

export default function LivedExperiencePage() {
  const kinds = SOURCE_KINDS.map((k) => ({ k, n: LIVED_SOURCES.filter((s) => s.kind === k).length }));
  return (
    <section className="page le-page">
      <div className="wrap">
        <header className="le-hero">
          <p className="eyebrow">Lived experience, from published research</p>
          <h1 className="page-h1">{TITLE}</h1>
          <p className="le-what">
            This page gathers what people living with {CONDITIONS.slice(0, -1).join(', ')} and {CONDITIONS.at(-1)} have
            told researchers, federal design teams, the National Academies and the U.S. Senate: {LIVED_SOURCES.length} published
            sources and {FINDINGS} findings, each quoted word for word with a link to the page it is on. We then put the steps
            those sources document into {RESEARCH_JOURNEYS.length} typical journeys and priced them with the same reader and the
            same federal figures as your own ledger. <strong>These journeys are composites drawn from published research. They
            are not interviews, and they are not real people.</strong> What people have said to us directly is counted on
            the <Link href="/register">register and its change log</Link>.
          </p>
          <ul className="le-kinds" aria-label="Sources by kind">
            {kinds.filter((x) => x.n).map((x) => <li key={x.k}><b>{x.n}</b> {KIND_LABEL[x.k]}</li>)}
          </ul>
        </header>

        <section className="le-sec" aria-labelledby="le-table-h">
          <h2 id="le-table-h">What the research reports, and what Waypoint does about it</h2>
          <ol className="le-rows">
            {THEMES.map((t) => {
              const fs = LIVED_SOURCES.flatMap((s) => s.findings).filter((f) => f.theme === t.theme);
              if (!fs.length) return null;
              const shown = fs.slice(0, 2);
              return (
                <li key={t.theme} className="le-row">
                  <div className="le-row-l">
                    <p className="le-row-h">Patients report: {t.report}</p>
                    <ul className="le-row-f">
                      {shown.map((f) => <li key={f.id}>{f.finding} <Cite f={f.id} /></li>)}
                    </ul>
                    {fs.length > shown.length ? <p className="le-row-more">{fs.length - shown.length} more {fs.length - shown.length === 1 ? 'finding' : 'findings'} on this, in the sources below</p> : null}
                  </div>
                  <div className="le-row-r">
                    <p className="le-row-h">Waypoint does</p>
                    <ul className="le-row-f">
                      {t.features.map((k) => <li key={k}>{FEATURES[k].line} <Link href={FEATURES[k].href}>{FEATURES[k].page}</Link></li>)}
                    </ul>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="le-sec" aria-labelledby="le-j-h">
          <h2 id="le-j-h">Six composite journeys, priced</h2>
          <p className="le-note">
            Each phrase is a step a source documents, cited beside it. Prices come from running the sentence through the
            reader, at {JOURNEY_TOTAL_BASIS}. Counts stay at one unless a source gives the number, so every total
            here understates what the research describes.
          </p>
          <div className="le-journeys">
            {RESEARCH_JOURNEYS.map((j) => {
              const story = storyOf(j);
              const priced = ledgerOf(story);
              const stepFor = (raw: string) => j.steps.find((s) => s.said === raw || raw.includes(s.said) || s.said.includes(raw));
              const used = new Set(priced.lines.map((l) => stepFor(l.raw)?.said).filter(Boolean));
              return (
                <article key={j.id} id={`journey-${j.id}`} className="le-card">
                  <header>
                    <p className="le-cond">{j.condition}</p>
                    <h3>{j.title}</h3>
                    <p className="le-label">{COMPOSITE_LABEL}</p>
                  </header>
                  <p className="le-time">
                    {j.years
                      ? <>What the sources report: <b>{years(j.years.low)} to {years(j.years.high)} years</b>, {j.years.measure}. {j.years.findings.map((f) => <Cite key={f} f={f} />)}</>
                      : <>{j.span} {j.steps[0].findings.slice(0, 1).map((f) => <Cite key={f} f={f} />)}</>}
                  </p>
                  <ol className="le-lines" aria-label={`The ${j.condition} composite, line by line`}>
                    {priced.lines.map((l, i) => {
                      const step = stepFor(l.raw);
                      const item = l.itemId ? ITEM.get(l.itemId) : undefined;
                      return (
                        <li key={i} className={l.lineUsd === null ? 'le-line un' : 'le-line'}>
                          <span className="le-said">{l.raw}{l.times > 1 ? <span className="le-x"> ×{l.times}</span> : null} {step?.findings.map((f) => <Cite key={f} f={f} />)}</span>
                          {l.lineUsd !== null && item
                            ? <span className="le-fig"><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="le-code">{item.code ? `${item.code} · ` : ''}{item.agencyDisplay ?? item.agency ?? 'CMS'} {l.year}</a><b className="money">{usd(l.lineUsd, true)}</b></span>
                            : <span className="le-why">{l.reason ?? 'kept by name, unpriced'}</span>}
                        </li>
                      );
                    })}
                    {j.steps.filter((s) => !used.has(s.said)).map((s) => (
                      <li key={s.said} className="le-line un"><span className="le-said">{s.said} {s.findings.map((f) => <Cite key={f} f={f} />)}</span><span className="le-why">read with the line before it, not a separate unit of care</span></li>
                    ))}
                  </ol>
                  <p className="le-total">
                    <span>{priced.pricedCount} priced lines{priced.unpricedCount ? `, ${priced.unpricedCount} kept by name and unpriced` : ''}</span>
                    <b className="money">{usd(priced.pricedTotalUsd, true)}</b>
                  </p>
                  <details className="le-more">
                    <summary>What the research says</summary>
                    <ul className="le-quotes">{j.whatTheResearchSays.map((f) => { const h = findingById(f); return h ? <Quote key={f} f={h.finding} /> : null; })}</ul>
                  </details>
                  <div className="le-does">
                    <p className="le-row-h">What Waypoint does</p>
                    <ul className="le-row-f">{j.whatWaypointDoes.map((k) => <li key={k}>{FEATURES[k].line} <Link href={FEATURES[k].href}>{FEATURES[k].page}</Link></li>)}</ul>
                  </div>
                  <div className="le-act">
                    <OpenInTool story={story} condition={j.condition} href={JOURNEY_BOX} />
                    <span className="le-src-n">{sourceIdsOf(j).length} sources</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="le-sec" aria-labelledby="le-src-h">
          <h2 id="le-src-h">The {LIVED_SOURCES.length} sources</h2>
          <p className="le-note">
            Every source was fetched on {LIVED_SOURCES[0].retrieved} and its text saved with the code; the fingerprint
            (SHA-256) below is of that saved text, and a test fails if any quote on this page is not in it word for word.
            Forums and social media were not used.
          </p>
          <ol className="le-sources">
            {LIVED_SOURCES.map((s) => (
              <li key={s.id} id={`src-${s.id}`} className="le-source">
                <span className="le-kind">{KIND_LABEL[s.kind]}</span>
                <a className="le-src-t" href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                <span className="le-src-m">
                  {s.organization ? `${s.organization} · ` : ''}{s.publisher}, {s.year} · {s.where} · {s.findings.length} {s.findings.length === 1 ? 'finding' : 'findings'} · SHA-256 <code>{s.sha256.slice(0, 12)}</code>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </section>
  );
}

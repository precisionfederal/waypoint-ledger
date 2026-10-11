'use client';
/* The live half of /policy: the survey ranking, uncounted care and the
   disputes rollup, read from GET /api/policy. Everything small-celled is
   already folded on the server; this only prints what came back. One fetch
   is shared by every part on the page. */
import { useEffect, useState } from 'react';
import { Fold } from './trust/Kit';
import { SENDER_MEANS, CORRECTIONS_NOT_BY_SENDER } from '@/lib/count-words';
import { teamTestsPhrase } from '@/lib/team-tests';

type Cell = {
  key: string; label: string; figuresPublished: number; shown: boolean;
  sends: number | null; right: number | null; wrong: number | null; withAmount: number | null;
  firstOn: string | null; lastOn: string | null;
};
type GapDoc = { respondents: number; submissions?: number; reports?: number; senders?: number; senderBasis?: string | null;
  categories: { id: string; label: string; unit: string; reporting: number | null }[] };
type Withheld = { cells: number; sends: number; label: string };
type Doc = {
  generatedOn: string; smallCellMin: number;
  uncounted: {
    survey: { n: number; submissions: number; answers?: number; senders?: number; rankedAnswers?: number | null; rankedAnswersOf?: string | null; firstOn: string | null; lastOn: string | null; readAs: string;
      ranking: { burden: string; label: string; meanRank: number | null; rankedFirstBy: number | null; countedByFederalFiles: boolean }[] };
    gap: GapDoc;
  };
  disputes: { sends: number; teamTests?: number; firstOn: string | null; lastOn: string | null; rule: string;
    byAgency: Cell[]; bySchedule: Cell[]; withheld: { byAgency: Withheld; bySchedule: Withheld } };
};

let pending: Promise<Doc | null> | null = null;
const read = () => (pending ||= fetch('/api/policy').then((r) => (r.ok ? r.json() : null)).catch(() => null));

function useDoc() {
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined);
  useEffect(() => { let on = true; read().then((d) => { if (on) setDoc(d); }); return () => { on = false; }; }, []);
  return doc;
}

const few = (min: number) => `fewer than ${min}`;


/** One N for the ranking, the same count the live register prints over it.
 *  FLOW5 flow5-1: since flow3-4 the ranking is computed over the answers about
 *  the person's own illness (survey.js headline), and /api/policy carries that
 *  count as `rankedAnswers` with its words in `rankedAnswersOf`. When it is
 *  fewer than every answer, the N says both: "3 answers about the person's own
 *  illness, of 7 answers from 2 senders". An older body without it reads as
 *  before: every answer, with the senders beside it. */
export function rankingN(s: { n: number; submissions: number; answers?: number; senders?: number; rankedAnswers?: number | null; rankedAnswersOf?: string | null }): string {
  /* JUDGE-4 #6: the named fields first; n (senders here) and submissions are the
     deprecated aliases an older body carries. */
  const answers = s.answers || s.submissions || s.n;
  const senders = s.senders ?? s.n;
  const a = `${answers} ${answers === 1 ? 'answer' : 'answers'}`;
  const from = senders > 0 && senders < answers ? ` from ${senders} ${senders === 1 ? 'sender' : 'senders'}` : '';
  const ranked = s.rankedAnswers;
  if (typeof ranked === 'number' && ranked < answers) {
    const of = (s.rankedAnswersOf || '').replace(/^answers? /, '');
    return `${ranked} ${ranked === 1 ? 'answer' : 'answers'}${of ? ` ${of}` : ''}, of ${a}${from}`;
  }
  return from ? `${a}${from}, every answer ranked` : a;
}
/** The uncounted-care N (JUDGE-3 #3). /api/policy publishes distinct senders as
 *  `respondents` and the reports as `submissions` (withSenders, the same split
 *  /api/gap returns), so the N is the reports with the senders beside it, never
 *  the senders called reports. The senders are printed only when the server
 *  says they are distinct senders (senderBasis 'senders'); otherwise the
 *  sender count is not known and is left out. */
export function gapN(g: Pick<GapDoc, 'respondents' | 'submissions' | 'reports' | 'senders' | 'senderBasis'>): string {
  const reports = g.reports || g.submissions || g.respondents || 0;
  const senders = g.senders ?? g.respondents;
  const r = `${reports} ${reports === 1 ? 'report' : 'reports'}`;
  if (reports === 0 || g.senderBasis !== 'senders' || !(senders > 0)) return r;
  return `${r} from ${senders} ${senders === 1 ? 'sender' : 'senders'}`;
}
/** How many of the kinds of care at least one report named. A small cell is
 *  printed as "fewer than N" (reporting null) but was still named. */
export function gapNamed(g: Pick<GapDoc, 'categories'>): string {
  const named = g.categories.filter((c) => c.reporting !== 0).length;
  return `${named} of the ${g.categories.length} kinds of care named`;
}
const span = (a: string | null, b: string | null) => (a ? (a === b ? a : `${a} to ${b}`) : '');

function State({ doc }: { doc: Doc | null | undefined }) {
  if (doc === undefined) return <p className="micro" role="status">Reading the register&hellip;</p>;
  return <p className="micro" role="status">The register could not be read right now. These counts are unread, not zero.</p>;
}

export function PolicySurvey() {
  const doc = useDoc();
  if (!doc) return <State doc={doc} />;
  const { survey, gap } = doc.uncounted;
  const min = doc.smallCellMin;
  return (
    <>
    <div className="policy-pair">
      <div>
      {survey.ranking.length > 0 && <Fold level={3} id="p-ranking" title="How people ranked the burdens"
        summary={`Heaviest first: ${survey.ranking[0].label}. N = ${rankingN(survey)}.`}>
      <table className="policy-tbl">
        <caption>How people ranked the five burdens of a search for a diagnosis, heaviest first. N = {rankingN(survey)}{survey.firstOn ? `, ${span(survey.firstOn, survey.lastOn)}` : ''}.</caption>
        <thead><tr><th scope="col">Order</th><th scope="col">Burden</th><th scope="col">Average place (lower is heavier)</th><th scope="col">Ranked heaviest by</th></tr></thead>
        <tbody>
          {survey.ranking.map((r, i) => (
            <tr key={r.burden}>
              <td data-label="Order">{i + 1}</td>
              <td data-label="Burden">{r.label}{r.countedByFederalFiles ? '' : <span className="policy-tag">no federal cost file</span>}</td>
              <td className="num" data-label="Average place">{r.meanRank ?? 'none'}</td>
              <td className="num" data-label="Ranked heaviest by">{r.rankedFirstBy ?? few(min)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </Fold>}
      {survey.n === 0 && <p className="micro">Burden ranking: no answers yet, N = 0. The ranking appears here as people answer the survey.</p>}
      {survey.n > 0 && survey.readAs !== 'finding' && <p className="micro">{rankingN(survey)}: fewer than {min} senders, so read this order as a signal to test, not a finding.</p>}
      </div>
      <Fold level={3} id="p-gap" title="Care no dataset recorded"
        summary={`${gapNamed(gap)}, from the uncounted-care reports. N = ${gapN(gap)}.`}>
      <table className="policy-tbl">
        <caption>Care no dataset recorded, from the uncounted-care reports. N = {gapN(gap)}; {gapNamed(gap)}.</caption>
        <thead><tr><th scope="col">What was reported</th><th scope="col">Reports naming it</th></tr></thead>
        <tbody>
          {gap.categories.map((c) => <tr key={c.id}><td data-label="What was reported">{c.label}</td><td className="num" data-label="Reports naming it">{c.reporting ?? few(min)}</td></tr>)}
        </tbody>
      </table>
      </Fold>
    </div>
    <p className="micro">{SENDER_MEANS}</p>
    </>
  );
}

function Rollup({ cells, withheld, head, min }: { cells: Cell[]; withheld: Withheld; head: string; min: number }) {
  return (
    <table className="policy-tbl">
      <thead>
        <tr><th scope="col">{head}</th><th scope="col">Figures</th><th scope="col">Corrections</th><th scope="col">Said wrong</th><th scope="col">With amount paid</th><th scope="col">Dates</th></tr>
      </thead>
      <tbody>
        {cells.map((c) => (
          <tr key={c.key}>
            <td data-label={head}>{c.label}</td>
            <td className="num" data-label="Figures">{c.figuresPublished}</td>
            {c.shown
              ? <><td className="num" data-label="Corrections">{c.sends}</td><td className="num" data-label="Said wrong">{c.wrong}</td><td className="num" data-label="With amount paid">{c.withAmount}</td><td className="num" data-label="Dates">{span(c.firstOn, c.lastOn) || 'none'}</td></>
              : <td colSpan={4} data-label="Corrections">{few(min)}, not shown</td>}
          </tr>
        ))}
      </tbody>
      {withheld.cells > 0 && (
        <tfoot><tr><td colSpan={6}>{withheld.label}: {withheld.sends} {withheld.sends === 1 ? 'correction' : 'corrections'} across {withheld.cells} {withheld.cells === 1 ? 'cell' : 'cells'}</td></tr></tfoot>
      )}
    </table>
  );
}

export function PolicyDisputes() {
  const doc = useDoc();
  if (!doc) return <State doc={doc} />;
  const d = doc.disputes;
  const min = doc.smallCellMin;
  return (
    <>
      <p className="micro">
        N = {d.sends} {d.sends === 1 ? 'correction' : 'corrections'}
        {teamTestsPhrase(d.teamTests) ? ` · ${teamTestsPhrase(d.teamTests)}` : ''}
        {d.firstOn ? `, ${span(d.firstOn, d.lastOn)}` : ''}. {CORRECTIONS_NOT_BY_SENDER} Read on {doc.generatedOn}.
      </p>
      <Fold level={3} id="p-by-agency" title="By the agency that published the figure"
        summary={`${d.byAgency.length} agencies, the same rule`}>
        <Rollup cells={d.byAgency} withheld={d.withheld.byAgency} head="Agency" min={min} />
      </Fold>
      <Fold level={3} id="p-by-schedule" title="By fee schedule or file" summary={`${d.bySchedule.length} schedules and files, the same rule`}>
        <Rollup cells={d.bySchedule} withheld={d.withheld.bySchedule} head="Schedule or file" min={min} />
      </Fold>
      <p className="micro">{d.rule}</p>
    </>
  );
}

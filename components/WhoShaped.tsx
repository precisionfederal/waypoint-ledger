/* ==========================================================================
   WHO SHAPED THIS: every real input, what we built from it, and where it stands.

   🔴 ROWS COME ONLY FROM THE RECORD, read on 11 October 2026 and again on
   13 October 2026 (GET /api/register: survey n 107, channels paid-panel 102,
   advocate 4, direct 1; care gone without ranked first by 43 of 106 answers
   about the person's own illness; interviews n 14; GET /api/changes n 5):
   - GET /api/changes on waypointledger.org: two published changes, both dated
     1 October 2026 (the four survey answers; the advocate of 12 September).
   - GET /api/register: 4 survey answers, all through patient advocates,
     9 to 15 September 2026, all four ranking care gone without first; one
     written interview, 14 September 2026, held privately; corrections: one
     figure flagged wrong by one sender, 1 October 2026.
   - The federal leads at Office Hours 1, 20 August 2026
     (intel/FEDERAL-LEAD-FEEDBACK-ON-WAYPOINT-VERBATIM.md), named by role and
     paraphrased, never quoted.
   - HHS's Health+ reports, cited on /method#hhs-research since 30 September.
   No private person is named. Team tests are not inputs and are not here.
   tests/who-shaped-this.test.ts pins every row to its proof link.
   ========================================================================== */
import Link from 'next/link';
import s from './WhoShaped.module.css';

export type Status = 'live' | 'in-progress' | 'not-yet';
export const STATUS_LABEL: Record<Status, string> = { live: 'Live', 'in-progress': 'In progress', 'not-yet': 'Not yet' };

export interface ProofLink { href: string; label: string; external?: boolean }
export interface ShapedRow {
  id: string;
  /** Who, by role only. */
  who: string;
  /** When we heard it, as the record dates it; null for a gap no one reported. */
  heard: string | null;
  /** What they asked or told us, paraphrased. */
  input: string;
  /** What we built, or what is not built yet. */
  built: string;
  /** When it went live, or null. */
  builtOn: string | null;
  status: Status;
  proof: ProofLink[];
}

export const READ_ON = '13 October 2026';

export const ROWS: ShapedRow[] = [
  {
    id: 'thumbs',
    who: 'The sprint’s federal lead, at office hours',
    heard: '20 Aug 2026',
    input: 'Federal price data is sometimes wrong. Let people give each cited figure a thumbs up or down, so the public becomes a signal to government about where the errors and gaps are.',
    built: 'A thumb on every priced line, bound to the exact federal row it judges. Every verdict is counted in the open on the register. So far one figure has been flagged wrong, by one sender.',
    builtOn: '21 Aug 2026',
    status: 'live',
    proof: [
      { href: '/register#corrections', label: 'Corrections on the register' },
      { href: '/api/corrections', label: 'The count as open data', external: true },
    ],
  },
  {
    id: 'coverage',
    who: 'An NIH health economist, at office hours',
    heard: '20 Aug 2026',
    input: 'Citing a source is not enough. Show who is and is not covered by the data, whether a figure applies broadly or narrowly, and whether it fits the person reading it.',
    built: 'Every line says who its published figure describes and who it does not, read from the source file itself. The source cards on the method page do the same for each file.',
    builtOn: '21 Aug 2026',
    status: 'live',
    proof: [
      { href: '/method#sources', label: 'Who each file describes' },
      { href: '/ledger', label: 'Open any line on the ledger' },
    ],
  },
  {
    id: 'health-plus',
    who: 'The sprint’s federal lead, at office hours',
    heard: '20 Aug 2026',
    input: 'Start from the diagnosis-journey research HHS already paid for: the Health+ reports on Lyme disease, long COVID and sickle cell disease.',
    built: 'We read all three. The method page cites them, and the page of what patients told researchers is built on them and on the National Academies, patient-organization surveys and Senate testimony, each finding quoted with a link to its page.',
    builtOn: '30 Sep 2026',
    status: 'live',
    proof: [
      { href: '/method#hhs-research', label: 'Built on HHS’s own research' },
      { href: '/lived-experience', label: 'What patients told researchers' },
      { href: 'https://www.hhs.gov/sites/default/files/healthplus-lyme-disease-hcd-report.pdf', label: 'The Lyme report (HHS)', external: true },
    ],
  },
  {
    id: 'forgone',
    who: 'People answering the burden survey: 4 through patient advocates, then over 100 through a paid research panel',
    heard: '9 Sep to 13 Oct 2026',
    input: 'All four advocate answers ranked care they went without as the heaviest of the five costs. Across 106 answers about the person’s own illness, it was still ranked first most often, by 43.',
    built: 'Care you went without now sits right under the ledger total: care you needed and did not seek, and care you asked for and were refused. It is a count, never a dollar figure, and one button adds it to the public count.',
    builtOn: '1 Oct 2026',
    status: 'live',
    proof: [
      { href: '/register#rank', label: 'The ranking, with its count' },
      { href: '/api/changes', label: 'Change log entry', external: true },
    ],
  },
  {
    id: 'child-onset',
    who: 'A patient advocate who fell ill as a child, by email',
    heard: '12 Sep 2026',
    input: 'The questions assumed someone who was a working adult when they got sick. Word them for people who got sick as children, so the cost a parent or caregiver carries is counted too.',
    built: 'The survey asks who is answering, the age when symptoms began and the age at diagnosis, with bands under 18. A parent answering for a child sees the costs worded for the family. Those answers are read as their own group, hidden until it holds 11.',
    builtOn: '1 Oct 2026',
    status: 'live',
    proof: [
      { href: '/register#changes', label: 'What changed, on the register' },
      { href: '/api/changes', label: 'Change log entry', external: true },
    ],
  },
  {
    id: 'interview-0914',
    who: 'An advocate living with ME/CFS, in a written interview',
    heard: '14 Sep 2026',
    input: 'A written interview, held privately. It is never served by any endpoint, and nothing from it is quoted here.',
    built: 'Care that made you worse is now counted, never priced, and an invasive exercise test is named on the ledger and left unpriced with the reason, instead of being priced as the standard test.',
    builtOn: '11 Oct 2026',
    status: 'live',
    proof: [
      { href: '/register#interviews', label: 'Written interviews, counted' },
      { href: '/api/changes', label: 'Change log entry', external: true },
    ],
  },
  {
    id: 'interview-plain',
    who: 'A participant living with a brain injury, in a written interview through the paid panel',
    heard: '13 Oct 2026',
    input: 'Some of the top of the ledger read as if a machine wrote it.',
    built: 'The top of the ledger is rewritten in plain words. It now opens by saying these are Medicare’s published prices for the care you listed, and that this is not your bill.',
    builtOn: '13 Oct 2026',
    status: 'live',
    proof: [
      { href: '/ledger', label: 'The ledger' },
      { href: '/api/changes', label: 'Change log entry', external: true },
    ],
  },
  {
    id: 'interview-meds',
    who: 'A participant describing postpartum depression, in a written interview through the paid panel',
    heard: '13 Oct 2026',
    input: 'Five years of prescribed medication showed nothing on the ledger.',
    built: 'Naming a kind of medicine, such as an antidepressant, antibiotics or steroids, now adds a prescriptions line with the one published federal figure for it, a yearly median kept beside the total, never inside it.',
    builtOn: '13 Oct 2026',
    status: 'live',
    proof: [
      { href: '/ledger', label: 'The ledger' },
      { href: '/api/changes', label: 'Change log entry', external: true },
    ],
  },
  {
    id: 'agency',
    who: 'Every input above',
    heard: null,
    input: 'The point of the thumbs is that an agency sees them.',
    built: 'Nothing has been delivered to an agency yet. The corrections, the ranking and the change log are public and open data, ready to hand over, but none has gone to HHS or CMS.',
    builtOn: null,
    status: 'not-yet',
    proof: [{ href: '/register', label: 'The register, as it stands' }],
  },
  {
    id: 'small-n',
    who: 'The first four survey answers',
    heard: '9 to 15 Sep 2026',
    input: 'Four answers is a small sample, and all four came through patient advocates.',
    built: 'On 13 October, over 100 more people answered through a paid research panel, shown on the register as their own channel. The ranking is published with its count, never as a share of anyone, and any group under 11 answers stays hidden.',
    builtOn: '13 Oct 2026',
    status: 'live',
    proof: [
      { href: '/register#rank', label: 'The ranking and its count' },
      { href: '/survey', label: 'Add your answer' },
    ],
  },
];

function Proof({ p }: { p: ProofLink }) {
  return p.external
    ? <a href={p.href} target="_blank" rel="noopener noreferrer">{p.label}</a>
    : <Link href={p.href} prefetch={false}>{p.label}</Link>;
}

export default function WhoShaped() {
  const count = (st: Status) => ROWS.filter((r) => r.status === st).length;
  const inputs = ROWS.filter((r) => r.id !== 'agency' && r.id !== 'small-n').length;
  return (
    <>
      <ul className={s.glance} aria-label="At a glance">
        <li><strong>{inputs}</strong><span>real inputs</span></li>
        <li><strong>{count('live')}</strong><span>of {ROWS.length} rows live</span></li>
        {count('in-progress') > 0 && <li><strong>{count('in-progress')}</strong><span>in progress</span></li>}
        <li><strong>{count('not-yet')}</strong><span>not yet</span></li>
      </ul>

      <div className={s.scroll} tabIndex={0} role="region" aria-label="Who shaped this, row by row">
        <table className={s.tbl}>
          <caption className="sr-only">Each real input, what we built from it, when, and where it stands</caption>
          <thead>
            <tr>
              <th scope="col">What we heard</th>
              <th scope="col">What we built</th>
              <th scope="col">When</th>
              <th scope="col">Status</th>
              <th scope="col">Proof</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.id} id={r.id} data-status={r.status}>
                <th scope="row" data-label="What we heard">
                  <span className={s.who}>{r.who}</span>
                  <span className={s.input}>{r.input}</span>
                </th>
                <td data-label="What we built">{r.built}</td>
                <td data-label="When" className={s.when}>
                  {r.heard && <span>Heard {r.heard}</span>}
                  {r.builtOn && <span>Built {r.builtOn}</span>}
                </td>
                <td data-label="Status">
                  <span className={`${s.pill} ${s[r.status.replace('-', '')]}`}>{STATUS_LABEL[r.status]}</span>
                </td>
                <td data-label="Proof">
                  <ul className={s.proof}>{r.proof.map((p) => <li key={p.href + p.label}><Proof p={p} /></li>)}</ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

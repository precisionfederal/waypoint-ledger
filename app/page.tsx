'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useStore, ITEMS } from '@/lib/store';
import { usd } from '@/lib/pricing';
import { LivePreviewChips, useLivePreview } from '@/components/JourneyBuilder';
import { Icon } from '@/components/Icons';
import { agencyOf, agencyTally } from '@/lib/fit';

/* Who published the rows this tool prices from, counted off the table itself.
   Four bodies, not four badges — and the number beside each is the real count
   of rows in data/prices.json, so the strip cannot drift from the data. */
const PUBLISHERS = agencyTally(ITEMS);
const PUBLISHER_FULL: Record<string, string> = {
  CMS: 'Centers for Medicare & Medicaid Services',
  'AHRQ MEPS': 'AHRQ · Medical Expenditure Panel Survey',
  'AHRQ HCUP': 'AHRQ · Healthcare Cost and Utilization Project',
  BLS: 'Bureau of Labor Statistics',
  GSA: 'General Services Administration',
};

const EXAMPLE = 'saw my regular doctor three times, then a cardiologist, an echo and a Holter, then the ER once when my heart was racing';

/* The worked example, drawn from the price table at render time. Every figure on
   this page is a row of data/prices.json — none of it is typed into the page. */
const PREVIEW = [
  { said: 'my regular doctor, six times', id: 'cms-99214', n: 6 },
  { said: 'a cardiologist', id: 'cms-99204', n: 1 },
  { said: 'an echo', id: 'cms-img-echo', n: 1 },
  { said: 'the ER, twice', id: 'cms-ed-99284-complete', n: 2 },
  { said: 'MRI of my brain', id: 'cms-img-mri-brain-nc', n: 1 },
];

export default function Home() {
  const st = useStore();
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">For anyone who spent years getting a diagnosis</p>
            <h1>What did your diagnostic search actually cost?</h1>
            <p className="hero-line">The care you needed and never got produces $0 in federal data.</p>
            <p className="hero-who">I built this so a person who spent years getting a diagnosis can add up what it cost from the government&rsquo;s own published figures, line by line, and send back the ones that are wrong. It will never invent a number. <span>Bo Peng · Precision Federal · Ames, Iowa</span></p>
            <p className="lede">Type the visits, tests and scans the way you remember them. Waypoint Ledger prices each one from a published federal figure, cites the source on every line, and never invents a number.</p>
            <div className="cta-row">
              <Link className="btn primary lg" href={st.entries.length ? '/ledger' : '/journey'}>{st.entries.length ? 'Open my ledger' : 'Price my journey'} <Icon.Arrow /></Link>
              <Link className="btn ghost lg" href="/register">See the register</Link>
            </div>
            <p className="micro">Free · no account · what you type stays in this browser unless you save it · add it to your home screen and it prices with no signal</p>
          </div>
          <HeroBuilder />
        </div>
      </section>

      <section className="gap-pitch">
        <div className="wrap gap-grid">
          <div>
            <p className="eyebrow">The part no dataset can see</p>
            <h2>The care you needed and never got produces $0 in federal data.</h2>
            <p>Every federal cost file records care that was delivered and billed. A visit you could not get, a test you were denied, months lost waiting: none of it leaves a row. Waypoint Ledger counts it, and asks the people who carried it which cost hurt most.</p>
            <div className="row wrap-sm">
              <Link className="btn primary" href="/survey">Rank the five burdens, two minutes <Icon.Arrow /></Link>
              <Link className="btn ghost" href="/gap">Count what never happened</Link>
            </div>
          </div>
          <div className="zero-card"><p className="zero-num">$0</p><p>rows you generate in federal health data for every visit you needed and could not get</p></div>
        </div>
      </section>

      <section className="trust">
        <div className="wrap trust-row">
          <span className="lbl">Every figure published by</span>
          {PUBLISHERS.map((a) => (
            <span key={a.agency} className="trust-pub">
              {PUBLISHER_FULL[a.agency] ?? a.agency}
              <em>{a.lines} {a.lines === 1 ? 'row' : 'rows'}</em>
            </span>
          ))}
        </div>
      </section>

      <section className="how">
        <div className="wrap">
          <p className="eyebrow">How it works</p>
          <h2>Three steps. No codes, no bills, no dates.</h2>
          <div className="how-grid">
            <article><span className="how-n">1</span><h3>Describe it</h3><p>“Saw my regular doctor three times, then a cardiologist, an echo and a Holter, then the ER.” One sentence is enough. We split it into steps.</p></article>
            <article><span className="how-n">2</span><h3>See what it cost</h3><p>Each step maps to a standard unit of care and is priced at one published federal figure, with its year, basis and population beside it. Anything with no figure stays blank and named.</p></article>
            <article><span className="how-n">3</span><h3>Act on it</h3><p>Print the appointment sheet for your next visit. Flag a figure that is not you, and it goes back to the agency that published it.</p></article>
          </div>
        </div>
      </section>

      <section className="features">
        <div className="wrap">
          <div className="feat-grid">
            <article><span className="feat-ic"><Icon.Cite /></span><h3>Cited on every line</h3><p>A figure without a source is a rumor. Each line shows who the number describes, and who it does not, and links to the federal file.</p></article>
            <article><span className="feat-ic"><Icon.Signal /></span><h3>Your correction counts</h3><p>Mark a figure wrong and say what you paid. Corrections are bound to the exact published row, so an agency can see where its data misses.</p></article>
            <article><span className="feat-ic"><Icon.Sheet /></span><h3>Built for the next appointment</h3><p>One printed page with every step, every cost and three questions worth asking. A clinician who sees the whole search orders differently.</p></article>
            <article><span className="feat-ic"><Icon.Shield /></span><h3>Nothing leaves your device unless you send it</h3><p>No account. Your journey is built and priced in this browser. It reaches us only if you press Save and share — and that save hands you a code that deletes it. A share link carries units and counts, never names. Install it to your home screen and the whole price table comes with it, so a waiting room with no bars still works.</p></article>
          </div>
        </div>
      </section>

      <section className="faq">
        <div className="wrap">
          <h2>Questions people ask</h2>
          <details><summary>Is this what I will be billed?</summary><p>No. Most figures are Medicare allowed amounts: the price the federal program pays plus the patient share. For a working-age adult on private coverage they are usually a floor. An uninsured person may be billed the charge, which is higher. The ledger says which basis each line uses.</p></details>
          <details><summary>Where do the numbers come from?</summary><p>The 2026 Medicare physician and hospital fee schedules, the Clinical Laboratory Fee Schedule, the Medical Expenditure Panel Survey, HCUP and the Bureau of Labor Statistics. Every row links to its file, and <Link href="/method">How it is made</Link> shows the arithmetic.</p></details>
          <details><summary>Does an AI price anything?</summary><p>No. A deterministic matcher maps your words to a unit of care. A published table prices the unit. No model, average or estimate produces a dollar figure anywhere in this tool.</p></details>
          <details><summary>What happens to what I type?</summary><p>It stays in your browser. If you choose to flag a figure, we record only which figure, your verdict, and optionally what you paid. See <Link href="/privacy">Privacy</Link>.</p></details>
        </div>
      </section>

      <section className="cta-band">
        <div className="wrap row between wrap-sm">
          <div><h2>Start with one sentence.</h2><p>It takes about two minutes to see what your search has cost.</p></div>
          <Link className="btn primary lg" href="/journey">Price my journey <Icon.Arrow /></Link>
        </div>
      </section>
    </>
  );
}

/**
 * THE PRODUCT IN THE HERO — not a picture of it.
 *
 * Empty, it shows a worked example priced live from the table. As soon as
 * someone types, the same live parse the /journey page uses turns their
 * sentence into cited, priced chips before they click anything.
 */
function HeroBuilder() {
  const st = useStore();
  const [story, setStory] = useState('');
  const preview = useLivePreview(story);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Focus on a desktop pointer only: autofocus on a phone throws up the
    // keyboard before the person has read anything.
    if (window.matchMedia?.('(min-width:900px) and (pointer:fine)').matches) ref.current?.focus();
  }, []);

  const rows = PREVIEW.map((p) => ({ ...p, it: ITEMS.find((i) => i.id === p.id) })).filter((r) => r.it);
  const exampleTotal = rows.reduce((a, r) => a + (r.it!.valueUsd ?? 0) * r.n, 0);

  function add() {
    if (!story.trim()) return;
    // The chips she saw are the lines she gets: the AI reader's fills ride along when the read is for this exact sentence.
    if (!preview.pending && preview.segments.length) st.addSegments(preview.segments); else st.addStory(story);
    window.location.href = '/ledger';
  }

  return (
    <div className="hero-live">
      <div className="hl-card">
        <label htmlFor="hero-story" className="lbl">Tell it the way you remember it</label>
        <textarea id="hero-story" ref={ref} rows={3} value={story} onChange={(e) => setStory(e.target.value)}
          placeholder={`e.g. ${EXAMPLE}`} />
        {preview.segments.length > 0 ? (
          <>
            <LivePreviewChips preview={preview} onExample={(t) => setStory((s) => (s.trim() ? `${s.replace(/[\s,]+$/, '')}, ${t}` : t))} />
            <p className="hl-cited"><Icon.Cite /> Every figure cited to a published federal file</p>
            <div className="hl-foot">
              <p className="hl-total"><span className="lbl">So far</span> <b>{usd(preview.previewTotal)}</b></p>
              <button className="btn primary" type="button" onClick={add}>Add these {preview.segments.length} <Icon.Arrow /></button>
            </div>
          </>
        ) : (
          <>
            <p className="hl-eg-lbl">A worked example, priced from the table as this page loads</p>
            <ul className="hl-eg">
              {rows.map((r) => (
                <li key={r.id}>
                  <span className="hl-said">{r.said}</span>
                  <span className="hl-unit"><i className="hl-src">{agencyOf(r.it!)}</i>{r.it!.label}</span>
                  <b>{usd((r.it!.valueUsd ?? 0) * r.n)}</b>
                </li>
              ))}
            </ul>
            <p className="hl-cited"><Icon.Cite /> Every figure cited to a published federal file</p>
            <div className="hl-foot">
              <p className="hl-total"><span className="lbl">What the published prices add up to</span> <b>{usd(exampleTotal)}</b></p>
              <button className="btn primary" type="button" onClick={() => { st.loadExample(); window.location.href = '/ledger'; }}>Open this example <Icon.Arrow /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useStore, ITEMS } from '@/lib/store';
import { TABLE } from '@/lib/table';
import { usd } from '@/lib/pricing';
import { LivePreviewChips, useLivePreview } from '@/components/JourneyBuilder';
import { Icon } from '@/components/Icons';
import { agencyOf, agencyTally } from '@/lib/fit';

/* Who published the rows this tool prices from, counted off the table itself.
   Bodies, not badges — and the number beside each is the real count of rows in
   data/prices.json, so the strip cannot drift from the data. It counts the whole
   table, not the selectable subset: the MEPS, HCUP, BLS and GSA rows carry the
   context figures the ledger shows beside the money, and they are published
   figures too. */
const PUBLISHERS = agencyTally(TABLE);
const PUBLISHER_FULL: Record<string, string> = {
  CMS: 'Centers for Medicare & Medicaid Services',
  'AHRQ MEPS': 'AHRQ · Medical Expenditure Panel Survey',
  'AHRQ HCUP': 'AHRQ · Healthcare Cost and Utilization Project',
  BLS: 'Bureau of Labor Statistics',
  GSA: 'General Services Administration',
};

const EXAMPLE = 'saw my regular doctor three times, then a cardiologist, an echo and a Holter, then the ER once when my heart was racing';

/* The worked example, drawn from the price table at render time. Every figure on
   this page is a row of data/prices.json — none of it is typed into the page.
   Three rows, not nine: the three that read fastest. The button opens the full
   example on the ledger, and the total below says it totals these three, so the
   longer ledger is an expansion of a promise and never a contradiction of it. */
const PREVIEW = [
  { said: 'my regular doctor, six times', id: 'cms-99214', n: 6 },
  { said: 'a cardiologist', id: 'cms-99204', n: 1 },
  { said: 'the ER, twice', id: 'cms-ed-99284-complete', n: 2 },
];

export default function Home() {
  return (
    <>
      {/* THE FIRST FIVE SECONDS: a label, a question, one sentence, and the box.
          Everything else about this tool — who made it, what it refuses to do,
          what it costs — sits under the box or behind one click below. */}
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Years to a diagnosis</p>
            <h1>What did your diagnostic search actually cost?</h1>
            <p className="hero-line">Type it the way you remember it. Every figure comes from a published federal file.</p>
          </div>
          <HeroBuilder />
        </div>
        <div className="wrap hero-foot">
          <p className="hero-who">I built this so a person who spent years getting a diagnosis can add up what it cost from the government&rsquo;s own published figures. It will never invent a number.<span>Bo Peng · Precision Federal · Ames, Iowa</span></p>
        </div>
      </section>

      <section className="gap-pitch">
        <div className="wrap gap-grid">
          <div>
            <p className="eyebrow">The part no dataset sees</p>
            <h2>The costs no dataset counted</h2>
            <p>Every federal cost file records care that was delivered and billed. A visit you could not get, a test you were denied, months lost waiting: none of it leaves a row. Waypoint Ledger counts it, and asks the people who carried it which cost hurt most.</p>
            <div className="row wrap-sm">
              <Link className="btn primary" href="/gap">Count what never happened <Icon.Arrow /></Link>
              <Link className="btn ghost" href="/survey">Rank the five burdens</Link>
            </div>
          </div>
          <div className="zero-card"><p className="zero-say">Every visit you needed and could not get produces no row in any federal file. Not $0 &mdash; no row at all.</p></div>
        </div>
      </section>

      <section className="how">
        <div className="wrap">
          <p className="eyebrow">How it works</p>
          <h2>Every figure opens</h2>
          <div className="how-grid">
            <article><span className="how-n">1</span><h3>Describe it</h3><p>One sentence in your own words. No codes, no bills, no dates.</p></article>
            <article><span className="how-n">2</span><h3>See what it cost</h3><p>Each step is priced at one published federal figure, with its year and basis beside it.</p></article>
            <article><span className="how-n">3</span><h3>Act on it</h3><p>Print the appointment sheet. Flag a figure that is not you.</p></article>
          </div>

          {/* The four publishers, counted off the table, kept as one quiet row
              rather than a band of its own. */}
          <div className="trust-row how-pub">
            <span className="lbl">Every figure published by</span>
            {PUBLISHERS.map((a) => (
              <span key={a.agency} className="trust-pub">
                {PUBLISHER_FULL[a.agency] ?? a.agency}
                <em>{a.lines} {a.lines === 1 ? 'row' : 'rows'}</em>
              </span>
            ))}
          </div>

          {/* Every sentence this page used to open with is still here, word for
              word, one click down: the four questions, the four things the tool
              does, and the long form of the three steps above. */}
          <div className="faq">
            <details>
              <summary>Questions people ask</summary>
              <div className="qa-in">
                <details><summary>Is this what I will be billed?</summary><p>No. Most figures are Medicare allowed amounts: the price the federal program pays plus the patient share. For a working-age adult on private coverage they are usually a floor. An uninsured person may be billed the charge, which is higher. The ledger says which basis each line uses.</p></details>
                <details><summary>Where do the numbers come from?</summary><p>The 2026 Medicare physician and hospital fee schedules, the Clinical Laboratory Fee Schedule, the Medical Expenditure Panel Survey, HCUP and the Bureau of Labor Statistics. Every row links to its file, and <Link href="/method">How it is made</Link> shows the arithmetic.</p></details>
                <details><summary>Does an AI price anything?</summary><p>No. A deterministic matcher maps your words to a unit of care. A published table prices the unit. No model, average or estimate produces a dollar figure anywhere in this tool.</p></details>
                <details><summary>What happens to what I type?</summary><p>It stays in your browser. If you choose to flag a figure, we record only which figure, your verdict, and optionally what you paid. See <Link href="/privacy">Privacy</Link>.</p></details>
                <details><summary>What the three steps do, in full</summary><p><b>Describe it.</b> “Saw my regular doctor three times, then a cardiologist, an echo and a Holter, then the ER.” One sentence is enough. We split it into steps.</p><p><b>See what it cost.</b> Each step maps to a standard unit of care and is priced at one published federal figure, with its year, basis and population beside it. Anything with no figure stays blank and named.</p><p><b>Act on it.</b> Print the appointment sheet for your next visit. Flag a figure that is not you, and it goes back to the agency that published it.</p></details>
                <details><summary>Cited on every line</summary><p>A figure without a source is a rumor. Each line shows who the number describes, and who it does not, and links to the federal file.</p></details>
                <details><summary>Your correction counts</summary><p>Mark a figure wrong and say what you paid. Corrections are bound to the exact published row, so an agency can see where its data misses.</p></details>
                <details><summary>Built for the next appointment</summary><p>One printed page with every step, every cost and three questions worth asking. A clinician who sees the whole search orders differently.</p></details>
                <details><summary>Nothing leaves your device unless you send it</summary><p>No account. Your journey is built and priced in this browser. It reaches us only if you press Save and share — and that save hands you a code that deletes it. A share link carries units and counts, never names. Install it to your home screen and the whole price table comes with it, so a waiting room with no bars still works.</p></details>
              </div>
            </details>
          </div>
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
            <p className="hl-cited"><Icon.Cite /> Free · no account · every figure cited to a published federal file</p>
            <div className="hl-foot">
              <p className="hl-total"><span className="lbl">So far</span> <b>{usd(preview.previewTotal)}</b></p>
              <button className="btn primary" type="button" onClick={add}>Add these {preview.segments.length} <Icon.Arrow /></button>
            </div>
          </>
        ) : (
          <>
            {/* The sample is not the person's answer. It sits in its own tinted
                inset, with its own label and its own total, so nobody reads our
                three rows as theirs. Same type sizes as before. */}
            <div className="hl-sample">
              <p className="hl-eg-lbl">Not your numbers yet &mdash; an example, priced from the table as this page loads</p>
              <ul className="hl-eg">
                {rows.map((r) => (
                  <li key={r.id}>
                    <span className="hl-said">{r.said}</span>
                    <span className="hl-unit"><i className="hl-src">{agencyOf(r.it!)}</i>{r.it!.label}</span>
                    <b>{usd((r.it!.valueUsd ?? 0) * r.n)}</b>
                  </li>
                ))}
              </ul>
              <p className="hl-total"><span className="lbl">These three published figures</span> <b>{usd(exampleTotal)}</b></p>
            </div>
            <p className="hl-cited"><Icon.Cite /> Free · no account · every figure cited to a published federal file</p>
            {/* The loudest control is the person's own next move. Empty, it is a
                prompt that puts the cursor in the box; the moment there is text
                it is the same add action the typed state uses. The example is a
                ghost beside it, never the thing the eye lands on first. */}
            <div className="hl-foot is-empty">
              {story.trim() ? (
                <button className="btn primary" type="button" onClick={add}>Add everything <Icon.Arrow /></button>
              ) : (
                <button className="btn primary" type="button" onClick={() => ref.current?.focus()}>Start with one sentence <Icon.Arrow /></button>
              )}
              <button className="btn ghost" type="button" onClick={() => { st.loadExample(); window.location.href = '/ledger'; }}>See it done with an example</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

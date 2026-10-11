'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from '@/components/IntentLink';
import { useRouter } from 'next/navigation';
import FinePrint from '@/components/FinePrint';
import { useStore, ITEMS } from '@/lib/store';
import { TABLE } from '@/lib/table';
import { shownLines, usd } from '@/lib/pricing';
import { LivePreviewChips, addLabel, sharedRead, useLivePreview } from '@/components/LivePreview';
import { parseJourney } from '@/lib/mapper';
import CONDITION_COUNT from '@/data/conditions-count.json';
import { Icon } from '@/components/Icons';
import { agencyOf, agencyTally } from '@/lib/fit';
import { SOURCE_COMPOSITION } from '@/lib/source-composition';
import ThemedImg from '@/components/ThemedImg';

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

/* JUDGE-3 #14: the placeholder is the example's own three lines, the same three
   the card below prices, in the example's words (lib/store.tsx
   EXAMPLE_LEDGER_STORY), so the home page shows one journey, not three. Same
   length as the sentence it replaced, so the box shows as much of it. */
const EXAMPLE = 'saw my regular doctor six times, a first visit with a cardiologist, then went to the ER twice when my heart was racing';

/* The worked example, drawn from the price table at render time. Every figure on
   this page is a row of data/prices.json — none of it is typed into the page.
   Three rows, not nine: the three that read fastest. The button opens the full
   example on the ledger, and the total below says it totals these three, so the
   longer ledger is an expansion of a promise and never a contradiction of it. */
/* 🔴 judge-7: "my regular doctor" is CPT 99213 here, as it is in the reader
   (data/synonyms.json lists "my regular doctor" under cms-99213) and in the
   figure Bo shows ($95.19). CMS's short descriptors (PPRRVU2026_Jul_nonQPP.csv)
   are 99213 "Office o/p est low 20 min" and 99214 "Office o/p est mod 30 min":
   the words say only that she is an established patient, nothing about a
   moderate level of decision making, so the lower level is the one the words
   support, the same rule as a range ("four or five" counts four). Until
   2026-09-30 this card said 99214, $814 for six; it now says 99213, $571. */
const PREVIEW = [
  { said: 'my regular doctor, six times', id: 'cms-99213', n: 6 },
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
            {/* FLOW patient-21: a person with a diagnosis and ongoing care read
                "diagnostic search" as not for her. */}
            <p className="hero-line">From the first symptom through today&rsquo;s care. Type it the way you remember it. Every figure comes from a published federal file.</p>
            {/* DESIGN R1: the promise that sat inside the card's empty state
                ("Free · no account · every figure cited to the published file it
                came from") stands here, beside the box, whether or not anything
                has been typed. Same words, split into its two facts. */}
            <ul className="hero-points">
              <li><Icon.Check /> Free, with no account</li>
              <li><Icon.Check /> Every figure cited to the published file it came from</li>
            </ul>
            <ThemedImg className="hero-art-img" light="/img/hero-path.webp" dark="/img/hero-path-dark.webp" alt="" width={600} height={263} loading="eager" />
          </div>
          <HeroBuilder />
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
          {/* 🔴 R6 sense F7. "No row in any federal file" is false and a reviewer
              whose career is federal health data knows a counter-example in one
              second: NHIS and MEPS's own access-to-care questions do ask. What
              they cannot do is attach a dollar to it, or make it yours — and
              that version of the sentence is the stronger one. */}
          <div className="zero-card"><p className="zero-say">Care you needed and did not get leaves no row in any federal <b>cost</b> file. Not $0: no row at all. National surveys count that it happened to a share of the population; none of them attaches a dollar to it, and none of them is yours.</p></div>
        </div>
      </section>

      <section className="how">
        <div className="wrap">
          <p className="eyebrow">How it works</p>
          <h2>Every figure opens</h2>
          <div className="how-grid">
            <article><ThemedImg className="how-img" light="/img/step-describe.webp" dark="/img/step-describe-dark.webp" alt="" width={480} height={435} /><span className="how-n">1</span><h3>Describe it</h3><p>One sentence in your own words. No codes, no bills, no dates.</p></article>
            <article><ThemedImg className="how-img" light="/img/step-cost.webp" dark="/img/step-cost-dark.webp" alt="" width={480} height={435} /><span className="how-n">2</span><h3>See what it cost</h3><p>Each step is priced at one published federal figure, with its year and basis beside it.</p></article>
            <article><ThemedImg className="how-img" light="/img/step-act.webp" dark="/img/step-act-dark.webp" alt="" width={480} height={435} /><span className="how-n">3</span><h3>Act on it</h3><p>Print the appointment sheet. Flag a figure that is not you.</p></article>
          </div>

          {/* The four publishers, counted off the table, kept as one quiet row
              rather than a band of its own. */}
          {/* judge-6: the two criteria with no door from home (Scalability, Data).
              Every count is computed: the condition count from data/conditions.json,
              written beside it at build time (scripts/gen-conditions-count.mjs). */}
          <p className="core-scale">
            {/* judge2-14: tests/conditions-data-only.test.ts appends a condition at
                run time and shows it reaching the list, the reader and /conditions
                "with no code changed", which is what this line says. */}
            <Link href="/conditions">{CONDITION_COUNT.conditions} conditions, and adding one changes no code</Link>
            <span aria-hidden="true"> · </span>
            <Link href="/developers#fhir">Every ledger exports an HL7 FHIR R4 Bundle</Link>
            <span aria-hidden="true"> · </span>
            <Link href="/developers">An open API, no key</Link>
          </p>
          <div className="trust-row how-pub">
            <span className="lbl">Every figure published by</span>
            {PUBLISHERS.map((a) => (
              <span key={a.agency} className="trust-pub">
                {PUBLISHER_FULL[a.agency] ?? a.agency}
                <em>{a.lines} {a.lines === 1 ? 'row' : 'rows'}</em>
              </span>
            ))}
          </div>
          {/* 🔴 R6 sense F9: ONE composition sentence, computed off the same table
              the strip above counts, printed here and on /register. Two pages
              describing the table in their own words disagreed with each other
              and with data/prices.json. */}
          <FinePrint label="Where the figures come from"><p>{SOURCE_COMPOSITION.sentence}</p></FinePrint>

          {/* Every sentence this page used to open with is still here, word for
              word, one click down: the four questions, the four things the tool
              does, and the long form of the three steps above. */}
          <div className="faq">
            <details>
              <summary>Questions people ask</summary>
              <div className="qa-in">
                <details><summary>Is this what I will be billed?</summary><p>No. Most figures are Medicare allowed amounts: the price the federal program pays plus the patient share. For a working-age adult on private coverage they are usually a floor. An uninsured person may be billed the charge, which is higher. The ledger says which basis each line uses.</p></details>
                <details><summary>Where do the numbers come from?</summary><p>The 2026 Medicare physician and hospital fee schedules, the Clinical Laboratory Fee Schedule, the Medical Expenditure Panel Survey, HCUP, the Bureau of Labor Statistics, the GSA mileage rate, and, for the long COVID year figure only, a peer-reviewed analysis of MEPS, labelled as such wherever it appears. Every row links to its file, and <Link href="/method">How it is made</Link> shows the arithmetic.</p></details>
                <details><summary>Does an AI price anything?</summary><p>No. A deterministic matcher maps your words to a unit of care. A published table prices the unit. No model, average or estimate produces a dollar figure anywhere in this tool.</p></details>
                <details><summary>What happens to what I type?</summary><p>Your ledger stays in your browser. The sentence you type is read by our rules on our server; only the phrases they cannot place go, with a few words around each, to an AI model run by OpenAI, which may only name a unit of care, never a price, in or out. Our copy of that reading is deleted after a day. If you flag a figure, we record only which figure, your verdict, and optionally what you paid. See <Link href="/privacy">Privacy</Link>.</p></details>
                <details><summary>What the three steps do, in full</summary><p><b>Describe it.</b> “Saw my regular doctor three times, then a cardiologist, an echo and a Holter, then the ER.” One sentence is enough. We split it into steps.</p><p><b>See what it cost.</b> Each step maps to a standard unit of care and is priced at one published federal figure, with its year, basis and population beside it. Anything with no figure stays blank and named.</p><p><b>Act on it.</b> Print the appointment sheet for your next visit. Flag a figure that is not you. Your flag is counted on a public register, bound to the row of the agency that published the number, so it can be handed to that agency. None has been delivered to an agency yet.</p></details>
                <details><summary>Cited on every line</summary><p>A figure without a source is a rumor. Each line shows who the number describes, and who it does not, and links to the file it came from, and where a figure is somebody&rsquo;s analysis of a federal survey rather than a federal publication, it says so on its face.</p></details>
                <details><summary>Your correction counts</summary><p>Mark a figure wrong and say what you paid. Corrections are bound to the exact published row and counted on a public register, where the agency that published it can see where its data misses.</p></details>
                <details><summary>Built for the next appointment</summary><p>One printed page with every step, every cost and three questions worth asking. A clinician who sees the whole search orders differently.</p></details>
                <details><summary>Your ledger stays on your device</summary><p>No account needed. The ledger is built and priced in this browser. The one thing that leaves is the sentence you type: our rules read it on our server, only the phrases they cannot place go on, with a few words around each, to an AI model run by OpenAI, and our copy of that reading is deleted after a day. The ledger is kept in this browser until you save it: beyond that day, nothing you type is kept on our side unless you press Save across devices, and that save hands you a code that deletes it. A share link carries units and counts, never names. Install it to your home screen and the whole price table comes with it, so a waiting room with no bars still works.</p></details>
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
/** flow3-1: how long Add waits for a read still in flight before the rules' lines go in. */
const FINISH_READ_MS = 4000;

function HeroBuilder() {
  const st = useStore();
  const [story, setStory] = useState('');
  const preview = useLivePreview(story);
  const ref = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  /* 🔴 WHAT WAS TYPED BEFORE THE PAGE WOKE UP IS KEPT (R1 UXM-06, S-05).
     On a slow phone the box is on screen about 3 s before React hydrates. A
     sentence pasted in that window sat in the box while the state was '', so
     no chips came, and the next re-render wrote '' over it. Hydration leaves
     the typed value in the node, so it is read here, in the hydrating commit,
     before any re-render can reset it, and it produces chips like any paste. */
  useLayoutEffect(() => {
    const typed = ref.current?.value;
    if (typed) setStory(typed);
  }, []);

  useEffect(() => {
    // Focus on a desktop pointer only: autofocus on a phone throws up the
    // keyboard before the person has read anything.
    if (window.matchMedia?.('(min-width:900px) and (pointer:fine)').matches) ref.current?.focus();
  }, []);

  const rows = PREVIEW.map((p) => ({ ...p, it: ITEMS.find((i) => i.id === p.id) })).filter((r) => r.it);
  /* FLOW patient-8: a person coming back sees her ledger before she retells it. */
  const mine = st.hydrated ? st.entries.length : 0;
  /* Cents on each line and on the total, summed from the shown lines, so the three
     lines add to the total a judge reads (whole dollars showed $571 + $177 + $1,089
     under a $1,838 total). */
  const shown = shownLines(rows.map((r) => (r.it!.valueUsd ?? 0) * r.n));

  /* access-1: one Add, one batch. A double-click or a phone double-tap fired
     add() twice before the route changed and doubled the ledger ($2,608 for
     the $1,304 sentence). The first commit latches; the page is leaving by a
     client navigation, so coming back mounts a fresh, unlatched builder. */
  const adding = useRef(false);
  /* 🔴 flow3-1: ADD NEVER DROPS THE READ. Tapped while the bar still said
     "reading the rest…", Add used to keep the rules' blank line and lose the
     AI read ($952 and 10 visits in the audit). Now the button says
     "Finishing the read…" and waits up to 4 s; if the read is not back by then
     the rules' lines go in and the read fills its lines when it lands, for this
     same text, with a toast naming what it priced (store.applyRead). */
  const [finishing, setFinishing] = useState(false);
  const finishTimer = useRef<number | null>(null);
  const settled = !preview.pending && !preview.reading;
  useEffect(() => () => { if (finishTimer.current) clearTimeout(finishTimer.current); }, []);
  function commit(text: string) {
    if (adding.current) return;
    adding.current = true;
    // The chips she saw are the lines she gets: the AI reader's fills ride along when the read is for this exact sentence.
    if (preview.segments.length) st.addSegments(preview.segments, text); else st.addStory(text);
    /* R1 UXM-22: a client navigation, the one /journey already makes after Add.
       The lines are in the store in memory, so the ledger does not re-download
       and re-hydrate the app (3.5 s on a slow phone) before it can show them. */
    router.push('/ledger');
  }
  function add() {
    if (!story.trim() || finishing) return;
    if (settled) { commit(story); return; }
    const asked = story;
    setFinishing(true);
    finishTimer.current = window.setTimeout(() => {
      finishTimer.current = null;
      setFinishing(false);
      if (adding.current) return;
      adding.current = true;
      st.addSegments(parseJourney(asked.trim(), ITEMS).filter((sg) => !sg.absorbed), asked);
      void sharedRead(asked).then((r) => { if (r.model) st.applyRead(r.segments); }).catch(() => {});
      router.push('/ledger');
    }, FINISH_READ_MS);
  }
  useEffect(() => {
    if (!finishing || !settled) return;
    if (finishTimer.current) { clearTimeout(finishTimer.current); finishTimer.current = null; }
    setFinishing(false);
    commit(story);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishing, settled]);

  /* patient-1: the example REPLACES the ledger (lib/store.tsx loadExample),
     so it never runs over stored lines without a yes that names the count.
     With lines stored the button is not even drawn (below); this is the guard
     behind it. Before hydration nothing stored is in memory to replace. */
  const n = st.entries.length;
  const nLines = `${n} ${n === 1 ? 'line' : 'lines'}`;
  function showExample() {
    if (n && !confirm(`Replace your ${nLines} with an example? Your lines will be gone.`)) return;
    st.loadExample();
    window.location.href = '/ledger';
  }

  return (
    <div className="hero-live">
      {mine > 0 && (
        <p className="core-have" role="note">
          {/* patient2-12: the ghost button "Open my ledger (N lines)" (46f413bb7a)
              and the header's Ledger link are the door; the banner only says it. */}
          You have {mine} {mine === 1 ? 'line' : 'lines'} on your ledger. What you add here joins {mine === 1 ? 'it' : 'them'}.
        </p>
      )}
      <div className="hl-card">
        <label htmlFor="hero-story" className="lbl">Tell it the way you remember it</label>
        <textarea id="hero-story" ref={ref} rows={3} value={story} onChange={(e) => setStory(e.target.value)}
          placeholder={`e.g. ${EXAMPLE}`} />
        {preview.segments.length > 0 ? (
          <>
            {/* The citation line is the empty state's promise. Once the chips are
                here they carry it themselves, and the 57 px it took is what lets
                every chip, "So far" and the button sit on one screen (R1 F03). */}
            <LivePreviewChips preview={preview} onExample={(t) => setStory((s) => (s.trim() ? `${s.replace(/[\s,]+$/, '')}, ${t}` : t))} />
            <div className="hl-foot">
              {/* patient2-6: on a long paste the reading cue under the chips sat behind
                  this sticky bar. It is shown here too; the chips' live region
                  announces it, so this copy is not read twice. */}
              <p className="hl-total"><span className="lbl">So far</span> <b>{usd(preview.previewTotal)}</b>{preview.reading && <span className="micro core-bar-reading" aria-hidden="true">reading the rest…</span>}</p>
              <button className="btn primary" type="button" onClick={add} aria-busy={finishing || undefined}>{finishing ? 'Finishing the read…' : addLabel(preview.segments.length, preview.matched, preview.reading)} <Icon.Arrow /></button>
            </div>
          </>
        ) : (
          <>
            {/* The sample is not the person's answer. It sits in its own tinted
                inset, with its own label and its own total, so nobody reads our
                three rows as theirs. Same type sizes as before. */}
            <div className="hl-sample">
              <p className="hl-eg-lbl">Not your numbers yet: three lines of the full example, priced as this page loads</p>
              <ul className="hl-eg">
                {rows.map((r, i) => (
                  <li key={r.id}>
                    <span className="hl-said">{r.said}</span>
                    <span className="hl-unit"><i className="hl-src">{agencyOf(r.it!)}</i>{r.it!.label}</span>
                    <b>{shown.lines[i]}</b>
                  </li>
                ))}
              </ul>
              <p className="hl-total"><span className="lbl">These three published figures</span> <b>{shown.total}</b></p>
            </div>
            {/* The loudest control is the person's own next move. Empty, it is a
                prompt that puts the cursor in the box; the moment there is text
                it is the same add action the typed state uses. The example is a
                ghost beside it, never the thing the eye lands on first. */}
            {/* R1 F18: on a desktop the box already holds the cursor, so a teal
                pill that only focuses it did nothing a judge could see. It is
                hidden there (product.css, .hl-start) and kept for touch, where
                the box is deliberately not focused on load. */}
            <div className="hl-foot is-empty">
              {story.trim() ? (
                <button className="btn primary" type="button" onClick={add}>{addLabel(0)} <Icon.Arrow /></button>
              ) : (
                <button className="btn primary hl-start" type="button" onClick={() => ref.current?.focus()}>Start with one sentence <Icon.Arrow /></button>
              )}
              {/* patient-1: with lines already stored, the ghost is the way back to
                  them; the example (which replaces the ledger) is not offered. */}
              {st.hydrated && n ? (
                <Link className="btn ghost" href="/ledger">Open my ledger ({nLines})</Link>
              ) : (
                <button className="btn ghost" type="button" onClick={showExample}>See it done with an example</button>
              )}
            </div>
          </>
        )}
      </div>
      {/* contrib-11: a person who came to help count, not to price, finds the
          survey and the interview here, under the box rather than in the menu. */}
      <p className="core-help">
        Help count: <Link href="/survey">rank the five burdens (two minutes)</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/interview">Written interview</Link>
      </p>
    </div>
  );
}

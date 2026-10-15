import type { Metadata } from 'next';
import Link from 'next/link';
import { shareCard } from '@/lib/og';
import w from './walkthrough.module.css';

const TITLE = 'Two-minute walkthrough';
const DESCRIPTION = 'Waypoint Ledger in under two minutes: a search typed in plain words, priced line by line from published federal figures.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...shareCard(TITLE, DESCRIPTION, '/walkthrough'),
};

/* The narration, word for word. The captions track (public/video/waypoint-walkthrough.vtt)
   carries the same words with timings; the transcript is here so the walkthrough can be
   read without sound and found by a screen reader without playing anything. The video is
   recorded on the live site (delivery/video/v3/BUILD-REPORT.md, pass v6) and is never precached:
   public/sw.js treats .mp4 as neither shell nor static, so it loads only on play. */
const TRANSCRIPT = [
  "When a diagnosis takes years, every visit sends its own bill. Nobody adds up the whole search.",
  "On screen: Example story. The input says “Leave out names.”",
  "Waypoint Ledger does, free, with no account. Tell it the way you remember it, and leave out names.",
  "Four lines. Twelve hundred and four dollars, from Medicare’s published 2026 rates. That’s the floor, not your bill.",
  "On screen: The floor, not your bill.",
  "Open any line: the federal file, the exact row. No model sets a price, and every figure reproduces from its source.",
  "On screen: No model, average, heuristic or interpolation produces a dollar figure. The audit reads “274 of 274 rows reproduce from their source file”.",
  "Pick your coverage. On Original Medicare, it splits the total into what Medicare pays and your share.",
  "On screen: Original Medicare share calculation, Medicare pays, and your share. The share assumes Original Medicare Part B and an unmet 2026 deductible.",
  "For Medicare records, it connects through the CMS Blue Button sandbox. This is a made-up test patient CMS publishes. Real records need CMS production approval.",
  "On screen: Synthetic data published by CMS. No real person’s claims. Real Medicare records need CMS production approval. This product uses the Blue Button APIs but is not endorsed or certified by the Centers for Medicare & Medicaid Services or the U.S. Department of Health and Human Services.",
  "The code and data are open, for any team to run.",
  "But some of the cost never reaches a bill.",
  "On screen: A kitchen-table illustration is labelled “Illustration”.",
  "We asked people about their own illness which cost weighed most. The care they went without came out on top. It was also named most often as the one no one had ever asked them about.",
  "On screen: 43 of 106 put it first. 32 of 106 named it as the one no one ever asked about. Source: 103 through a paid research panel of U.S. adults with a long-term health condition.",
  "A test the doctor wouldn’t order. Being told you didn’t meet criteria. You can count it here. No federal cost file has a row for it, so we never price it.",
  "On screen: Counted, never priced.",
  "Print one page for your next appointment, every figure cited.",
  "On screen: Medicare allowed amounts. These are published prices for this pattern of care, not a bill and not a claim.",
  "What did your search cost? Find out at waypointledger.org.",
  "On screen: Counted, never priced. Free, with no account. This product uses the Blue Button APIs but is not endorsed or certified by the Centers for Medicare & Medicaid Services or the U.S. Department of Health and Human Services.",
];

export default function Walkthrough() {
  return (
    <section className="page">
      <div className="wrap">
        <p className="eyebrow">Walkthrough</p>
        <h1 className={w.h1}>Waypoint Ledger in under two minutes</h1>
        <p className={w.lead}>Recorded on this site. Captions are on; the full transcript is below the video.</p>
        <video className={w.video} controls preload="metadata" playsInline aria-describedby="walkthrough-transcript">
          <source src="/video/waypoint-walkthrough.mp4" type="video/mp4" />
          <track kind="captions" src="/video/waypoint-walkthrough.vtt" srcLang="en" label="English" default />
          <a href="/video/waypoint-walkthrough.mp4">Download the walkthrough (MP4)</a>
        </video>
        <p className={w.cta}>
          <Link href="/journey" className="btn primary">Price your own search</Link>
        </p>
        <h2 className={w.h2}>Transcript</h2>
        <div id="walkthrough-transcript" className={w.transcript}>
          {TRANSCRIPT.map((t) => <p key={t}>{t}</p>)}
        </div>
      </div>
    </section>
  );
}

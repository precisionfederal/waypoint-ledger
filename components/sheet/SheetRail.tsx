/* ==========================================================================
   THE SHEET'S RAIL (screen only, never on paper).
   The page beside it is the document; this is the print dialog around it: the
   three actions, and how to use the page at an appointment in three steps.
   Every step repeats a sentence the page itself already states: the print
   button, the three questions at its foot, and the line that every figure is
   published U.S. federal data, cited, and not a bill, a claim or a diagnosis.
   ========================================================================== */
import Link from '@/components/IntentLink';
import ThemedImg from '../ThemedImg';

const print = () => window.print();

export default function SheetRail() {
  return (
    <aside className="sheet-rail no-print" aria-label="Appointment sheet actions">
      <div className="sheet-tools">
        <p className="eyebrow">Appointment sheet</p>
        <div className="st-actions">
          <button type="button" className="btn primary" onClick={print}>Print</button>
          <button type="button" className="btn ghost" onClick={print}>Save as PDF</button>
          <Link className="btn ghost st-back" href="/ledger">Back to the ledger</Link>
        </div>
      </div>
      <section className="sheet-guide" aria-labelledby="sheet-guide-h">
        {/* decorative: a path climbing to a sheet at the hilltop; the night twin through
            ThemedImg, the site's one themed-image switch (no CSS content:url swap) */}
        <ThemedImg className="sg-art" light="/img/v2/4b-sheet-spot.webp" dark="/img/v2/4b-sheet-spot-dark.webp" width={480} height={320} alt="" loading="eager" />
        <h2 id="sheet-guide-h">How to use this at your appointment</h2>
        <ol className="sg-steps">
          <li className="sg-1"><b>Print it, or save it as a PDF.</b> Save as PDF opens the same print window; choose it there.</li>
          <li className="sg-2"><b>Hand it over and ask.</b> Three questions are printed on the page, under the lines.</li>
          <li className="sg-3"><b>Point to the sources.</b> Every figure is published U.S. federal data, cited on the page. Not a bill, not a claim, not a diagnosis.</li>
        </ol>
      </section>
    </aside>
  );
}

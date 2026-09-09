import type { Metadata } from 'next';
import Stepper from '@/components/Stepper';
import ContextBar from '@/components/ContextBar';
import JourneyBuilder from '@/components/JourneyBuilder';
export const metadata: Metadata = { title: 'Price a journey' };
export default function JourneyPage() {
  return (
    <section className="page">
      <div className="wrap">
        <Stepper current={1} />
        <h1>Describe your journey the way you remember it</h1>
        <p className="sub">Plain language. No codes, no bills, no dates. We split it into steps and price each from a published federal figure, or say plainly that no figure exists.</p>
        {/* The honest version of the promise. What you type stays in this browser
            until you press Save; Save sends it here so its link opens elsewhere,
            and it hands back a code that deletes it. Anything stronger than this
            would be a sentence the Save button contradicts. */}
        <p className="micro">What you type stays in this browser. It is sent to this site only if you press <strong>Save and share</strong>, and that save comes back with a code that deletes it.</p>
        {/* 🔴 Asked BEFORE the number, never after it. Two answers here and the
            ledger arrives already labelled for this person; skipped, and every
            line says plainly that it is a national reference. */}
        <ContextBar variant="ask" />
        <JourneyBuilder />
      </div>
    </section>
  );
}

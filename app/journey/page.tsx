import type { Metadata } from 'next';
import JourneyBuilder from '@/components/JourneyBuilder';
export const metadata: Metadata = { title: 'Price my journey' };

/* 🔴 THE BOX IS THE PAGE.
   This opening used to be a step-pill row, a heading, a two-line promise, a
   privacy paragraph and a three-column questionnaire — about seventy words and
   two full screens on a phone before the thing you came to do. Nothing here was
   untrue and nothing has been deleted: the privacy sentence is under the box in
   the builder's own foot and on /privacy, and the three fit questions are one
   line under the box with Change beside them. What is left above the box is the
   step, the instruction, and one sentence. */
export default function JourneyPage() {
  return (
    <section className="page">
      <div className="wrap">
        <p className="eyebrow">Step 1 of 3</p>
        <h1>Describe it the way you remember it</h1>
        <p className="sub">Plain language, no codes and no dates. Every phrase becomes a priced, cited line.</p>
        <JourneyBuilder />
      </div>
    </section>
  );
}

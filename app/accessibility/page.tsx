import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Accessibility',
  description: 'What we target, what we have measured, what is not conformant yet, and how to tell us when something blocks you.',
};

export default function Accessibility() {
  return (
    <section className="page narrow">
      <div className="wrap prose">
        <p className="eyebrow">Accessibility</p>
        <h1>Accessibility statement</h1>
        <p className="lede">
          This tool is for people who are often exhausted, often in pain, and often reading on a phone in a waiting
          room. If any part of it keeps you out, that is a defect, and we want the report.
        </p>

        <h2>What we aim at</h2>
        <p>
          <strong>WCAG 2.1 Level AA</strong>, which is the standard the Revised Section 508 rules point to for federal
          use. We build to it deliberately rather than testing for it afterwards: one <code>h1</code> per page, real
          headings in order, labels tied to their controls, a skip link, a visible focus indicator, no colour used as
          the only carrier of meaning, no motion for anyone whose system asks for less of it.
        </p>

        <h2>What we measured, and when</h2>
        <p>
          Measured 9 September 2026 in Chrome, driven by Playwright, at 1280&times;1000 and on an iPhone 14 profile,
          across the landing page, the journey builder, the ledger, the register and this section:
        </p>
        <ul>
          <li>
            <strong>Focus is visible on every control.</strong> A focused primary button computes a two-layer ring — a
            2&nbsp;px white halo and a 2&nbsp;px ring in <code>#087871</code>, which is <strong>4.81:1</strong> against
            the page background and <strong>5.34:1</strong> against a card. WCAG 2.1 SC 1.4.11 asks for 3:1.
          </li>
          <li>
            <strong>Body text contrast.</strong> Running text is <strong>8.57:1</strong>, headings{' '}
            <strong>15.52:1</strong>, quiet sub-lines <strong>5.71:1</strong>, white on the dark band{' '}
            <strong>14.88:1</strong>. SC 1.4.3 asks for 4.5:1 for normal text.
          </li>
          <li>
            <strong>Nothing runs off the side of a phone.</strong> Horizontal overflow measured 0&nbsp;px on the pages
            above at 390&nbsp;px wide, and no text is set below 12&nbsp;px anywhere.
          </li>
          <li>
            <strong>Touch targets.</strong> On the ledger at phone width, no control is smaller than 24&times;24&nbsp;px
            (WCAG 2.2 SC 2.5.8). Twenty-one of twenty-three are smaller than the 44&times;44&nbsp;px comfort target we
            would prefer — see below.
          </li>
          <li>
            <strong>No console or page errors</strong> on any route we walked, on either profile.
          </li>
          <li>
            A skip link is the first thing in the tab order; the page declares <code>lang=&quot;en&quot;</code>;
            animation and scrolling are switched off for <code>prefers-reduced-motion: reduce</code>; a forced-colours
            (high contrast) mode gets a solid outline instead of a shadow ring.
          </li>
        </ul>

        <h2>What is not conformant yet</h2>
        <ul>
          <li>
            <strong>Touch targets below 44&times;44&nbsp;px.</strong> Most navigation and footer links on a phone are
            about 36&nbsp;px tall. They meet the 24&times;24&nbsp;px minimum in WCAG 2.2 and the inline-link exception
            covers links inside a sentence, but a bigger target is easier for a hand that shakes, and we are raising
            them.
          </li>
          <li>
            <strong>No screen-reader pass yet.</strong> We have not completed a VoiceOver, NVDA or JAWS walk of the
            whole flow. Until we have, we will not claim it works well with one — we will only say the markup was
            built for it.
          </li>
          <li>
            <strong>No independent audit.</strong> Everything above is our own measurement, and you can reproduce it:
            the site is open source under Apache-2.0 and the numbers come from the browser, not from us.
          </li>
        </ul>

        <h2>If something blocks you</h2>
        <p>
          Write to <a href="mailto:bo@precisionfederal.com">bo@precisionfederal.com</a>. Tell us the page, what you
          were using (browser, screen reader, phone), and what happened. We answer every message, we will send you the
          information another way if you need it now, and what we change because of you gets published on{' '}
          <a href="/register">the register</a> with the date.
        </p>
        <p className="micro">
          Statement first published 9 September 2026 by Precision Federal, Ames, Iowa. Related:{' '}
          <a href="/privacy">privacy</a>, <a href="/integrity">how the count is kept honest</a>,{' '}
          <a href="/.well-known/security.txt">security contact</a>.
        </p>
      </div>
    </section>
  );
}

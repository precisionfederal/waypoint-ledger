import type { Metadata } from 'next';
import { shareCard } from '@/lib/og';
import { Fold, TI, trust as s } from '@/components/trust/Kit';
import FoldOpen from '@/components/tech/FoldOpen';
import { ContrastBoard, FieldEdge, Meter, PAIRS, PAIRS_DARK, Score, SurveyRow, Toggle, contrast } from '@/components/tech/A11yVisuals';
import a from '@/components/tech/a11y.module.css';

const TITLE = 'Accessibility';
const DESCRIPTION = 'What we target, what we have measured, what is not conformant yet, and how to tell us when something blocks you.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...shareCard(TITLE, DESCRIPTION, '/accessibility'),
};

const CONTACT = 'https://precisionfederal.com/contact';

/* PAGES R1 (2026-09-30): the statement as cards, re-measured after DESIGN R1.
   Every figure below was measured on 30 September 2026: contrast from the
   DESIGN R1 tokens (app/globals.css) with the WCAG 2.1 relative-luminance
   formula and checked against getComputedStyle on the rendered pages; touch
   targets, overflow and type size by Playwright at 390 px; axe-core 4.x.
   The 9 September figures they replace are in git history. */
export default function Accessibility() {
  return (
    <section className="page">
      <div className="wrap">
        <p className="eyebrow">Accessibility</p>
        <h1 className={a.h1}>Accessibility statement</h1>
        <p className={s.lead}>
          This tool is for people who are often exhausted, often in pain, and often reading on a phone in a waiting
          room. If any part of it keeps you out, that is a defect, and we want the report.
        </p>

        {/* VISUAL tech (2026-09-30 night): the four measured numbers, each with its picture.
            The two ratios are computed from the DESIGN R1 tokens (components/tech/A11yVisuals.tsx);
            tests/tech-a11y.test.ts checks they are the figures this page states in words. */}
        <div className={a.swipe} tabIndex={0} role="region" aria-label="At a glance; on a narrow screen, scroll sideways">
        <ul className={a.glance}>
          <li className={a.gTile}>
            <span className={a.gIc}><TI.target /></span>
            <span className={a.gBig}>WCAG 2.1 AA</span>
            <span className={a.gText}>the standard the Revised Section 508 rules point to for federal use</span>
            <span className={a.levels} aria-hidden="true"><span>A</span><span>AA</span></span>
          </li>
          <li className={a.gTile}>
            <span className={a.gIc}><TI.eye /></span>
            <span className={a.gBig}>{contrast(PAIRS[0].fg, PAIRS[0].bg).toFixed(2)}:1</span>
            <span className={a.gText}>running text on the page background, light theme, measured Sep 30, 2026 (SC 1.4.3 asks for 4.5:1)</span>
            <div className={a.gPic}><Meter p={PAIRS[0]} /></div>
          </li>
          <li className={a.gTile}>
            <span className={a.gIc}><TI.shield /></span>
            <span className={a.gBig}>{contrast(PAIRS[6].fg, PAIRS[6].bg).toFixed(2)}:1</span>
            <span className={a.gText}>the focus ring against the page background, light theme (SC 1.4.11 asks for 3:1)</span>
            <div className={a.gPic}><Meter p={PAIRS[6]} /></div>
          </li>
          <li className={a.gTile}>
            <span className={a.gIc}><TI.device /></span>
            <span className={a.gBig}>0 px</span>
            <span className={a.gText}>horizontal overflow at 390 px wide on the eleven pages measured</span>
            <span className={a.phone} aria-hidden="true"><span className={a.phoneF}><i /><i /><i /><i /></span>390 px</span>
          </li>
        </ul>
        </div>

        <div className={s.grid}>
          <div className={s.card}>
            <h2 className={s.h2} style={{ marginTop: 0, fontSize: '1.375rem' }}>What we aim at</h2>
            <p>
              <strong>WCAG 2.1 Level AA</strong>, which is the standard the Revised Section 508 rules point to for federal
              use. We build to it deliberately rather than testing for it afterwards: one <code>h1</code> per page, real
              headings in order, labels tied to their controls, a skip link, a visible focus indicator, no colour used as
              the only carrier of meaning, no motion for anyone whose system asks for less of it.
            </p>
          </div>
          <div className={s.card}>
            <h2 className={s.h2} style={{ marginTop: 0, fontSize: '1.375rem' }}>If something blocks you</h2>
            <p>
              Write to us through <a href={CONTACT}>Contact</a>. Tell us the page, what you
              were using (browser, screen reader, phone), and what happened. We answer every message, we will send you the
              information another way if you need it now, and what we change because of you gets published on{' '}
              <a href="/register">the register</a> with the date.
            </p>
            <a className="btn primary" href={CONTACT}>Contact</a>
          </div>
        </div>

        <h2 className={s.h2}>What we measured, and when</h2>
        <p className={s.h2sub}>
          Measured Sep 30, 2026 in Chrome, driven by Playwright, at 1440&times;900 and at 390&times;844 with touch,
          across the landing page, the journey builder, the ledger, the live register, the survey, the method page and
          the privacy, adoption, developer, account and accessibility pages:
        </p>
        <Fold id="contrast-board" level={3} title="Every colour pair in the light theme, measured" summary="Ten pairs, each drawn against the ratio WCAG 2.1 asks for">
          <ContrastBoard />
        </Fold>
        <Fold id="contrast-board-dark" level={3} title="Every colour pair in the dark theme, measured" summary="The same ten pairs, computed from the dark theme's own colours">
          <ContrastBoard pairs={PAIRS_DARK} theme="dark" />
        </Fold>
        <FoldOpen wide={['contrast-board', 'contrast-board-dark']} />
        <p className={a.themeNote}>
          The ratios in the cards below are for the light theme. The dark theme&rsquo;s are in the second table, computed
          the same way from its own colours: running text is {contrast(PAIRS_DARK[0].fg, PAIRS_DARK[0].bg).toFixed(2)}:1
          on the page and the focus ring {contrast(PAIRS_DARK[6].fg, PAIRS_DARK[6].bg).toFixed(2)}:1.
        </p>
        <ul className={a.cards}>
          <Score icon="ring" status="Meets SC 1.4.11" fig="5.80:1" figLabel="against the page, light theme">
            <h3>Focus is visible on every control.</h3>
            <p>In the light theme, a focused button computes a two-layer ring: a
              2&nbsp;px white halo and a 2&nbsp;px ring in <code>#0a6c65</code>, which is <strong>5.80:1</strong> against
              the page background and <strong>6.28:1</strong> against a card. WCAG 2.1 SC 1.4.11 asks for 3:1.</p>
          </Score>
          <Score icon="text" status="Meets SC 1.4.3" fig="15.93:1" figLabel="running text, light theme">
            <h3>Text contrast.</h3>
            <p>In the light theme, running text is <strong>15.93:1</strong> on the page and <strong>17.22:1</strong> on a card, secondary text{' '}
              <strong>9.36:1</strong>, quiet sub-lines <strong>5.83:1</strong>, links and teal labels{' '}
              <strong>5.80:1</strong>, and white on the primary button <strong>16.42:1</strong>. SC 1.4.3 asks for 4.5:1 for normal text.</p>
          </Score>
          <Score icon="phone" status="Measured" fig="0 px" figLabel="overflow at 390 px">
            <h3>Nothing runs off the side of a phone.</h3>
            <p>Horizontal overflow measured 0&nbsp;px on every page
              above at 390&nbsp;px wide, and no text is set below 12&nbsp;px anywhere (the smallest is 12.25&nbsp;px, in code samples).</p>
          </Score>
          <Score icon="touch" status="Measured" fig="44 px" figLabel="smallest target outside a sentence">
            <h3>Touch targets.</h3>
            <p>On the pages above at phone width, every control outside a sentence has a target at least 44&nbsp;px tall
              (on the survey, the whole 52&nbsp;px answer row is the target; at the foot of every page, the information
              toggle&rsquo;s 22&nbsp;px circle has a 44&times;44&nbsp;px target). Links inside a sentence are covered by the inline exception in WCAG 2.2 SC 2.5.8.</p>
          </Score>
          <Score icon="check" status="axe-core" fig="0" figLabel="WCAG 2.1 A or AA violations">
            <h3>An automated check</h3>
            <p>axe-core found no WCAG 2.1 A or AA violation on the privacy, adoption, developer, account and
              accessibility pages, at either size, with every folded section open.</p>
          </Score>
          <Score icon="skip" status="In place">
            <h3>Skip link, language, motion, high contrast</h3>
            <p>A skip link is the first thing in the tab order (on the home page the story box takes focus when the page opens, so the skip link is one Shift+Tab back from it); every page declares <code>lang=&quot;en&quot;</code>;
              animation and scrolling are switched off for <code>prefers-reduced-motion: reduce</code>; a forced-colours
              (high contrast) mode gets a solid outline instead of a shadow ring.</p>
          </Score>
        </ul>

        <h2 className={s.h2}>Checked and fixed on Sep 30, 2026</h2>
        <p className={s.h2sub}>Three findings of this re-measure. Two were fixed the same day; the third already met the rule once the whole target was measured. Each was measured again on the rendered pages.</p>
        <div className={a.swipe} tabIndex={0} role="region" aria-label="The three findings; on a narrow screen, scroll sideways">
        <ul className={`${a.cards} ${a.cardsRow}`}>
          <Score icon="text" status="Fixed Sep 30">
            <h3>Text box edges</h3>
            <p>
              In the light theme, the outline of a text box was <code>#e1e5ea</code>, 1.27:1 against white, where SC 1.4.11 asks for 3:1. It is
              now <code>#878f9b</code>: <strong>3.26:1</strong> against white and <strong>3.02:1</strong> against the page background.
            </p>
            <FieldEdge />
          </Score>
          <Score icon="touch" status="Fixed Sep 30">
            <h3>Information toggle</h3>
            <p>
              The toggle at the foot of every page was a 22&nbsp;px target, under the 24&times;24&nbsp;px minimum in
              WCAG 2.2. It keeps its 22&nbsp;px circle and now has a <strong>44&times;44&nbsp;px</strong> target, centred on it.
            </p>
            <Toggle />
          </Score>
          <Score icon="check" status="Already met">
            <h3>Survey answers</h3>
            <p>
              Each answer&rsquo;s 18&nbsp;px circle sits inside a label that is the whole target:
              <strong> 52&nbsp;px</strong> tall, measured 324&times;52&nbsp;px on a 390&nbsp;px phone.
            </p>
            <SurveyRow />
          </Score>
        </ul>
        </div>

        <h2 className={s.h2}>What is not conformant yet</h2>
        <ul className={a.cards}>
          <Score icon="open" status="Not yet" tone="open">
            <h3>No screen-reader pass yet</h3>
            <p>
              We have not completed a VoiceOver, NVDA or JAWS walk of the
              whole flow. Until we have, we will not claim it works well with one: we will only say the markup was
              built for it.
            </p>
          </Score>
          <Score icon="open" status="Not yet" tone="open">
            <h3>No independent audit</h3>
            <p>
              Everything above is our own measurement, and you can reproduce it:
              the site is open source under Apache-2.0 and the numbers come from the browser, not from us.
            </p>
          </Score>
        </ul>

        <p className="micro" style={{ marginTop: '2rem' }}>
          Statement first published Sep 9, 2026 by Precision Federal, Ames, Iowa, and re-measured Sep 30, 2026. Related:
        </p>
        <div className={s.actions}>
          <a className="btn ghost" href="/privacy">Privacy</a>
          <a className="btn ghost" href="/integrity">How the count is kept honest</a>
          <a className="btn ghost" href="/.well-known/security.txt">Security contact</a>
        </div>
      </div>
    </section>
  );
}

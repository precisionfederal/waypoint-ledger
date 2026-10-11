/* ==========================================================================
   /privacy: where your words go, drawn. Three places (your device, what
   crosses the wire, what our side keeps) and a fourth band for what is never
   stored. Plain HTML lists inside the boxes, so the diagram is its own text
   equivalent; the arrows are inline SVG and aria-hidden.

   🔴 THE MAP IS THE SAME PROMISE AS THE PROSE ON app/privacy/page.tsx, IN
   FEWER WORDS. Every line is a statement made in full in the folds below it,
   and matches the note under the story box in components/JourneyBuilder.tsx
   ("a phrase the rules cannot read goes, with at most a few words around it,
   to an AI reader (OpenAI)"). Change a statement there and change its line
   here. Nothing on this diagram is a claim the page does not already make.
   ========================================================================== */

import { TI } from '@/components/trust/Kit';
import f from './privacy-visual.module.css';

function Arrow() {
  /* forward: what you send; back, dashed: what comes back (a link, a unit name) */
  return (
    <div className={f.wire} aria-hidden="true">
      <svg viewBox="0 0 56 64" width="56" height="64" focusable="false">
        <path className={f.fwd} d="M4 24 H46" pathLength={1} />
        <path className={f.fwdHead} d="M40 18 L48 24 L40 30" />
        <path className={f.back} d="M52 42 H10" pathLength={1} />
        <path className={f.backHead} d="M16 36 L8 42 L16 48" />
      </svg>
    </div>
  );
}

export default function FlowDiagram() {
  return (
    <figure className={f.flow} aria-labelledby="where" data-pv="">
      <div className={f.row}>
        <section className={`${f.node} ${f.device}`} aria-label="Stays on your device">
          <p className={f.kick}><span className={f.ic}><TI.device /></span>Stays on your device</p>
          <p className={f.who}>This browser, until you press Save or send something</p>
          <ul>
            <li><b>Your journey</b>, in local storage. Start over removes it.</li>
            <li><b>Your coverage and where you live.</b> The fit is worked out on your device.</li>
            <li><b>A shared link&rsquo;s lines</b>, after the <code>#</code>.</li>
          </ul>
        </section>

        <Arrow />

        <section className={`${f.node} ${f.cross}`} aria-label="What crosses the wire">
          <p className={f.kick}><span className={f.ic}><TI.server /></span>What crosses the wire</p>
          <p className={f.hop}>To this site, Precision Federal&rsquo;s server</p>
          <ul>
            <li><b>The words in the box, while you type</b>, so our server runs the same rules again.</li>
            <li><b>A ledger you Save</b>: units, counts and your short phrases.</li>
            <li><b>What you choose to send</b>: a correction, a gap report, a survey or an interview.</li>
          </ul>
          <p className={`${f.hop} ${f.hop2}`}><span className={f.icSm}><TI.reader /></span>From our server to the AI reader (OpenAI). Our server sends it, never your browser</p>
          <ul>
            <li><b>Only a phrase the rules cannot place</b>, each on its own.</li>
            <li><b>At most four words</b> from the phrase before it and four from the phrase after it.</li>
            <li><b>The list of unit names.</b> No price is sent and none comes back.</li>
          </ul>
        </section>

        <Arrow />

        <section className={`${f.node} ${f.kept}`} aria-label="What our side keeps">
          <p className={f.kick}><span className={f.ic}><TI.table /></span>What our side keeps</p>
          <p className={f.who}>Every field is listed below, generated from the database</p>
          <ul>
            <li><b>An AI reader answer</b>, under a one-way hash of what you typed, for one day. Then it is gone.</li>
            <li><b>A ledger you Save.</b> Its delete code only as a one-way hash.</li>
            <li><b>What you choose to send</b>, field by field. A note is never published.</li>
            <li><b>An account</b>, only if you make one.</li>
          </ul>
        </section>
      </div>

      <section className={f.never} aria-label="Never stored">
        <p className={f.kick}><span className={`${f.ic} ${f.icNever}`}><TI.never /></span>Never stored</p>
        <ul>
          <li><b>What follows the <code>#</code></b> in a share link. A browser never sends it to any server.</li>
          <li><b>Your IP address.</b> Only a salted hash, which stops being comparable the next day.</li>
          <li><b>Tracking.</b> No third-party analytics, no advertising, no tracking cookie. One first-party count of actions per day, with no cookie and no identifier, published on the <a href="/register/live">live register</a>.</li>
        </ul>
      </section>
      <figcaption className={f.cap}>Solid arrows: what you send. Dashed: what comes back, such as the link to a saved ledger or the unit name the AI reader chose.</figcaption>
    </figure>
  );
}

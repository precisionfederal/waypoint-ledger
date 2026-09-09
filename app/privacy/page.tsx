import type { Metadata } from 'next';
import { LongLayout, LongSection, type TocItem } from '@/components/LongSection';
import long from '@/components/LongSection.module.css';
import {
  PRIVACY_ENDPOINTS, PRIVACY_GENERATED_ON, PRIVACY_MIGRATIONS, PRIVACY_SCHEMA_FINGERPRINT,
  PRIVACY_COLUMN_COUNT, PRIVACY_TABLE_COUNT, type PrivacyEndpoint,
} from './generated';

export const metadata: Metadata = { title: 'Privacy' };

/* The prose below is written. Everything under "Every field this database has" is
   GENERATED from cf/migrations/*.sql, from the validators as they run, from the
   integrity projection and from the CSV export — scripts/gen-privacy.mjs, run by
   cf/build-static.sh. A column with no plain-English line fails the build, so this
   page cannot quietly fall behind the database. */

function Fields({ e }: { e: PrivacyEndpoint }) {
  return (
    <>
      <h3>
        {e.method === '—' ? e.path : `${e.method} ${e.path}`} <span className="of">{e.table}</span>
      </h3>
      <p>{e.what}</p>
      <p>{e.publicly}</p>
      {e.accepts.length > 0 && (
        <p className="micro">
          What is sent, and where each part lands: {e.accepts.map((a) => `${a.field} → ${a.column}`).join(' · ')}
        </p>
      )}
      <div className="table-scroll" tabIndex={0}>
        <table>
          <caption className="tbl-cap">Every column of {e.table}, written by {e.handler}</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Kept</th>
              <th scope="col">Encrypted</th>
              <th scope="col">Public</th>
              <th scope="col">In the CSV</th>
            </tr>
          </thead>
          <tbody>
            {e.fields.map((f) => (
              <tr key={f.column}>
                <th scope="row">
                  <code>{f.column}</code>
                  <span className="micro"> {f.gloss}</span>
                </th>
                <td>{f.kept}</td>
                <td>{f.encrypted}</td>
                <td>{f.published ? 'yes' : 'no'}</td>
                <td>{f.exported ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {e.notes.map((n) => (
        <p className="micro" key={n}>{n}</p>
      ))}
    </>
  );
}

const TOC: TocItem[] = [
  { id: 'browser', text: 'Your journey stays in this browser' },
  { id: 'reader', text: 'What the AI reader sees' },
  { id: 'save', text: 'If you press Save' },
  { id: 'about-you', text: 'What you tell the ledger about yourself' },
  { id: 'share', text: 'A share link carries no names' },
  { id: 'correction', text: 'What a correction sends' },
  { id: 'gap', text: 'What a gap report sends' },
  { id: 'survey', text: 'What the burden survey sends' },
  { id: 'interview', text: 'What a written interview sends' },
  { id: 'third-party', text: 'No analytics, no advertising, no tracking' },
  { id: 'fields', text: 'Every field this database has' },
  { id: 'who', text: 'Who runs it' },
];

export default function Privacy() {
  return (
    <section className="page narrow">
      <div className={`wrap prose ${long.wide}`}>
        <p className="eyebrow">Privacy</p>
        <h1>What this tool keeps, and what it never sees</h1>
        <p className="sub">Nothing you type is kept anywhere but this browser unless you press Save, send something, or write a phrase our own rules cannot read &mdash; and each of those is described here, field by field.</p>

        <LongLayout items={TOC}>
          <LongSection id="browser" title="Your journey stays in this browser" first open>
            <p>What you type into the ledger is held in this browser&rsquo;s local storage. Clearing your browser data, or pressing &ldquo;Start over&rdquo;, removes it. An account is optional and changes none of that: your journey still lives in this browser. If you make one, we store a random account number, whichever way in you chose (the public half of a passkey, or an email address and a scrambled form of your password that cannot be turned back into it), a ten-word recovery code we keep only the scrambled form of, and the ledgers you press save on. No mail is ever sent to that address. Deleting your account from /account erases all of it; corrections you already sent stay in the public register with the link back to you removed.</p>
          </LongSection>

          {/* 🔴 THE ONE REQUEST THIS PRODUCT MAKES OF AN OUTSIDE COMPANY IS
              DESCRIBED IN THE SAME PLAIN WORDS AS EVERY FIELD BELOW. Read
              cf/functions/api/map.js and components/JourneyBuilder.tsx before
              editing a word of this: the rules run in the browser AND again on
              our server, the model sees only what those rules could not read,
              the catalog it chooses from carries no prices, and the cache holds
              the answer for one day. Nothing here is aspiration. */}
          <LongSection id="reader" title="What the AI reader sees">
            <p>While you type, the words in the box are sent to this site so that the same rules your browser just ran can be run again on our server. Any phrase those rules cannot read is passed on &mdash; that phrase, the list of unit names from the price table, and nothing else &mdash; over an encrypted connection to a model run by OpenAI, which may answer only with a unit name the table already holds. No price is ever sent to a model and no price ever comes back: the published federal table does every bit of the pricing on this side of the wire. The answer, which carries the phrases you typed, is held for one day under a one-way hash of what you typed, so the same sentence is never read twice; after that day it is gone.</p>
            <p className="micro">If the OpenAI key is absent the same request goes to Anthropic, or to Cloudflare&rsquo;s own model on the network that served you this page. If no model answers, the rules&rsquo; answer stands and the line is simply left blank for you to fill in yourself. You can see exactly what is asked and what comes back at <a href="/api/map">POST /api/map</a>, and the rules themselves are in the open source.</p>
          </LongSection>

          <LongSection id="save" title="If you press Save">
            <p>Saving is the one thing that puts your own words on our server: the units of care, their counts and the short phrase you typed for each line, so the link you get back opens the ledger again. Two things come back with that link. A delete code, shown once, which is the only way to remove the save and needs no account &mdash; we keep only a one-way hash of it, so we cannot use it and cannot recover it for you. And a date: an anonymous save stops opening after 180 days, while a save on an account has no expiry. Anyone holding the link can open that ledger, so treat the link as the ledger itself and keep names out of what you type.</p>
          </LongSection>

          <LongSection id="about-you" title="What you tell the ledger about yourself">
            <p>Choosing your coverage and where you live changes which published figure each line shows you. Both answers are held in this browser under <code>waypoint-ledger.ctx.v1</code>, and the fit of a figure to a person is worked out on your own device: neither answer is attached to a correction, a gap report, a share link or a saved ledger.</p>
          </LongSection>

          <LongSection id="share" title="A share link carries no names">
            <p>The link the ledger copies for you carries the units of care, their counts and your short phrases inside the link itself, after the <code>#</code>. A browser never sends that part to any server, so a shared journey of this kind is never stored by us and never arrives here. A link from Save is the other kind: that one is a row in our database, and it is described field by field below.</p>
          </LongSection>

          <LongSection id="correction" title="What a correction sends">
            <p>If you mark a published figure right or wrong, we record the identifier of the figure, your verdict, optionally the amount you say you paid, the version of the price table, and an optional note that is never published and never exported. No name, no diagnosis and no IP address, ever. If you happen to be signed in, the row also records which account sent it, so the site can show you what you have told the government; deleting your account removes that link and leaves the correction counted. If you are not signed in &mdash; the default, and how nearly everyone uses this &mdash; there is no account and nothing about you on the row. The aggregate is public at <a href="/api/corrections">/api/corrections</a>.</p>
            <p>So that one person cannot answer the same figure a hundred times, your browser makes a random identifier for itself the first time you send anything, and keeps it under <code>waypoint-ledger.submitter.v1</code>. It is sent with a correction and the server stores only a truncated hash of it combined with that one price row &mdash; a hash that cannot be joined to your answer on any other row, and that we could not turn back into the identifier if we wanted to. It is used for nothing else and sent nowhere else.</p>
          </LongSection>

          <LongSection id="gap" title="What a gap report sends">
            <p>If you report care you needed and did not get, we record the counts and ranking you entered, an optional note, and any optional context you chose to give (an age band, insurance type, region). Nothing identifies you. The aggregate is public at <a href="/api/gap">/api/gap</a>.</p>
          </LongSection>

          <LongSection id="survey" title="What the burden survey sends">
            <p>Your ranking of five burdens, three multiple-choice answers, an optional clinician count, any optional self-description you chose (age band, coverage, region, state, stage), the channel slug on the link you used, and the time it was received. An optional one-sentence note is encrypted at rest and never published word for word. The aggregate and a de-identified CSV are public, and a cell holding too few people to be safe is withheld from both.</p>
          </LongSection>

          <LongSection id="interview" title="What a written interview sends">
            <p>The answers you wrote, the consent you chose (learn only, quote anonymously, quote by name), a name only if you chose to be quoted by name, and an email address only if you asked to hear about a new version. Interview answers are encrypted at rest and are never served by any endpoint or included in any export. Quotes appear only in the way you chose. To have an interview removed, write to bo@precisionfederal.com.</p>
          </LongSection>

          <LongSection id="third-party" title="No analytics, no advertising, no tracking">
            <p>Your browser makes no third-party request of any kind. The single outside request this product makes is the one above, to the AI reader, and our server makes it &mdash; never your browser, and never with a price in it. The three typefaces are served from this domain (they used to come from Google Fonts, and that was the last outside request left). There is no analytics script, no advertising, no tracking cookie. The only cookie this site can ever set is the session cookie you get if you sign in, and it holds one random value.</p>
          </LongSection>

          <LongSection id="fields" title="Every field this database has">
            <p>When you do send something, every field that lands in our database is listed here &mdash; and this list is generated from the database itself, so it cannot fall behind. A privacy page written as prose drifts from the database the first time an engineer adds a column. So this part is not written. It is generated from the schema itself &mdash; {PRIVACY_COLUMN_COUNT} columns across {PRIVACY_TABLE_COUNT} tables, read from {PRIVACY_MIGRATIONS.join(', ')} &mdash; together with the validators as they actually run, the field list inside the tamper-evidence chain, and the header of each published CSV. <strong>A column added without a plain-English description here fails our build</strong>, so a field cannot ship without appearing on this page.</p>
            <p className="micro">Generated {PRIVACY_GENERATED_ON} &middot; schema fingerprint {PRIVACY_SCHEMA_FINGERPRINT} &middot; <em>Kept</em> says whether the value is always there or only when it applies &middot; <em>Public</em> means the value is served to anyone and, where the register is chained, is inside the hash chain &middot; <em>In the CSV</em> means it is in the open download at /api/export.</p>
            {PRIVACY_ENDPOINTS.map((e) => (
              <Fields e={e} key={e.id} />
            ))}
          </LongSection>

          <LongSection id="who" title="Who runs it">
            <p>Precision Federal, Ames, Iowa. Questions: <a href="mailto:bo@precisionfederal.com">bo@precisionfederal.com</a>.</p>
          </LongSection>
        </LongLayout>
      </div>
    </section>
  );
}

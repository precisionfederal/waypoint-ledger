import type { Metadata } from 'next';
import { shareCard } from '@/lib/og';
import { LongLayout, LongPills, type TocItem } from '@/components/LongSection';
import { Fold, PageHero, TI, trust as s } from '@/components/trust/Kit';
import type { ReactNode } from 'react';
import pv from './privacy.module.css';
import FlowDiagram from '@/components/privacy/FlowDiagram';
import StoreTable from '@/components/privacy/StoreTable';
import PrivacyMotion from '@/components/privacy/PrivacyMotion';
import FieldOverview from '@/components/privacy/FieldOverview';
import {
  PRIVACY_ENDPOINTS, PRIVACY_GENERATED_ON, PRIVACY_MIGRATIONS, PRIVACY_SCHEMA_FINGERPRINT,
  PRIVACY_COLUMN_COUNT, PRIVACY_TABLE_COUNT, type PrivacyEndpoint,
} from './generated';

export const metadata: Metadata = {
  title: 'Privacy',
  ...shareCard('What this tool keeps, and what it never sees', 'Nothing you type is kept anywhere but this browser unless you press Save, send something, or write a phrase our own rules cannot read.', '/privacy'),
};

const CONTACT = 'https://precisionfederal.com/contact';

/* The prose below is written. Everything under "Every field this database has" is
   GENERATED from cf/migrations/*.sql, from the validators as they run, from the
   integrity projection and from the CSV export — scripts/gen-privacy.mjs, run by
   cf/build-static.sh. A column with no plain-English line fails the build, so this
   page cannot quietly fall behind the database.

   PAGES R1 (2026-09-30): the same statements, reorganised. The promise opens the
   page, the map says where words go, and each statement sits behind a one-line
   summary. No statement was dropped or softened; em-dashes became commas,
   colons, parentheses or full stops.

   VISUAL-4b (2026-09-30 night): the same statements again, made visible. A hero
   with the promise, six at-a-glance cards, the words map drawn as a diagram
   (components/privacy/FlowDiagram.tsx), a what-we-store table
   (components/privacy/StoreTable.tsx), and the folds below unchanged in every
   word. The map's lines moved into FlowDiagram.tsx with their 🔴 note. */

function Fields({ e }: { e: PrivacyEndpoint }) {
  const title = !e.method ? e.path : `${e.method} ${e.path}`;
  return (
    <Fold
      id={`fields-${e.id}`}
      level={3}
      title={<>{title} <span className={`of ${pv.of}`}>{e.table}</span></>}
      summary={`${e.fields.length} fields`}
    >
      <p>{e.what}</p>
      <p>{e.publicly}</p>
      {e.accepts.length > 0 && (
        <p className="micro">
          What is sent, and where each part lands: {e.accepts.map((a) => `${a.field} → ${a.column}`).join(' · ')}
        </p>
      )}
      <div className="table-scroll" tabIndex={0}>
        <table className={`${s.tbl} ${pv.fTbl}`}>
          <caption>Every column of {e.table}, written by {e.handler}</caption>
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
                  <span className={`${s.gloss} ${pv.gloss}`}> {f.gloss}</span>
                </th>
                <td data-label="Kept">{f.kept}</td>
                <td data-label="Encrypted">{f.encrypted}</td>
                <td data-label="Public">{f.published ? 'yes' : 'no'}</td>
                <td data-label="In the CSV">{f.exported ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {e.notes.map((n) => (
        <p className="micro" key={n}>{n}</p>
      ))}
    </Fold>
  );
}

const TOC: TocItem[] = [
  { id: 'where', text: 'Where your words go' },
  { id: 'store', text: 'What we store, and for how long' },
  { id: 'browser', text: 'Your journey stays in this browser' },
  { id: 'reader', text: 'What the AI reader sees' },
  { id: 'save', text: 'If you press Save' },
  { id: 'about-you', text: 'What you tell the ledger about yourself' },
  { id: 'share', text: 'A share link carries no names' },
  { id: 'correction', text: 'What a correction sends' },
  { id: 'gap', text: 'What a gap report sends' },
  { id: 'survey', text: 'What the burden survey sends' },
  { id: 'interview', text: 'What a written interview sends' },
  { id: 'third-party', text: 'No third-party analytics, no advertising, no tracking' },
  { id: 'fields', text: 'Every field this database has' },
  { id: 'who', text: 'Who runs it' },
];

/* A fold heading with its icon chip; the icon is aria-hidden, so the heading's
   name (and the contents rail's) is the words alone. */
const T = (icon: ReactNode, text: string) => (
  <><span className={pv.fIc} aria-hidden="true">{icon}</span>{text}</>
);

const Check = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 12.3l2.6 2.6L16 9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function Privacy() {
  return (
    <section className="page">
      <div className="wrap">
        <PrivacyMotion />
        {/* The site's one inner-page hero (Kit PageHero); pv.hero is kept only as the
            anchor the reveal rules key off (".hero ~ [data-pv]"). */}
        <PageHero
          className={pv.hero}
          eyebrow="Privacy"
          title="What this tool keeps, and what it never sees"
          lead="Nothing you type is kept anywhere but this browser unless you press Save, send something, or write a phrase our own rules cannot read."
          art={{ light: '/img/v2/4b-privacy-hero.webp', dark: '/img/v2/4b-privacy-hero-dark.webp', width: 1200, height: 675, position: '55% 0%', mobilePosition: '60% 0%' }}
        >
          <p className={pv.promiseSub}>Each of those is described here, field by field.</p>
          <ul className={pv.points}>
            <li><Check />An account is optional</li>
            <li><Check />No third-party analytics, no advertising, no tracking cookie</li>
            <li><Check />{PRIVACY_COLUMN_COUNT} fields across {PRIVACY_TABLE_COUNT} tables, every one listed below</li>
          </ul>
        </PageHero>
        {/* the contents, straight under the hero below 1024 px (JUDGE-2 fix 9); from 1024 px the rail beside the details */}
        <LongPills items={TOC} />

        {/* 🔴 FLOW contrib-17: a parent deciding whether to tell their child's story
            gets the three answers in the first screen. Every line is true in code:
            the survey form has no name or birth-date field (lib/survey-def.js CONTEXT);
            survey_responses.user_id is set only when signed in (cf/functions/api/survey.js)
            and cut by DELETE /api/me (cf/functions/api/me.js); no endpoint deletes a
            survey row; an interview is removed through Contact. No retention period
            is stated, because none is defined in the code. VISUAL-4b keeps it straight
            under the hero, before the glance cards, so it stays in the first screen. */}
        <section className={pv.answers} aria-labelledby="pv-answers">
          <h2 id="pv-answers" className={pv.h}>Answering the survey or the interview, perhaps for a child</h2>
          <dl className={pv.dl}>
            <div>
              <dt><span className={pv.dIc} aria-hidden="true"><TI.shield /></span>What is kept about the child</dt>
              <dd>No name and no date of birth: the forms have no field for either. Only the answers you choose, such as the age bands when it began and when it was named, and the child&rsquo;s sex if you give it, which are published only as counts.</dd>
            </div>
            <div>
              <dt><span className={pv.dIc} aria-hidden="true"><TI.trash /></span>Taking a survey answer back</dt>
              <dd>A survey answer holds no name, and no account unless you were signed in when you sent it (deleting your account cuts that link). There is nothing to look it up by, so this site has no way to delete one.</dd>
            </div>
            <div>
              <dt><span className={pv.dIc} aria-hidden="true"><TI.mail /></span>Taking an interview back</dt>
              <dd>Write to us through <a href={CONTACT}>Contact</a> and it is removed. Until then it is encrypted, and only our team reads it.</dd>
            </div>
          </dl>
          <p className={pv.more}>In full: <a href="#survey">what the survey sends</a> &middot; <a href="#interview">what an interview sends</a>.</p>
        </section>

        {/* At a glance: six of the page's own facts, one sentence each. Every one is
            stated in full in a fold below; the figures are the ones the page states. */}
        <h2 className={pv.bandH}>At a glance</h2>
        <ul className={pv.glance} aria-label="At a glance">
          <li className={pv.gCard} data-pv="">
            <span className={pv.gIc}><TI.device /></span>
            <span className={pv.gBig}>Your device</span>
            <span className={pv.gText}>Your journey stays in this browser until you press Save or send something.</span>
          </li>
          <li className={pv.gCard} data-pv="">
            <span className={pv.gIc}><TI.server /></span>
            <span className={pv.gBig}>Field by field</span>
            <span className={pv.gText}>Everything that reaches our database is listed below, generated from the database itself.</span>
          </li>
          <li className={pv.gCard} data-pv="">
            <span className={pv.gIc}><TI.reader /></span>
            <span className={pv.gBig}>4 words</span>
            <span className={pv.gText}>At most four words each side of a phrase the rules cannot place reach the AI reader. No price.</span>
          </li>
          <li className={pv.gCard} data-pv="">
            <span className={pv.gIc}><TI.key /></span>
            <span className={pv.gBig}>Optional</span>
            <span className={pv.gText}>An account is optional and changes none of that: your journey still lives in this browser.</span>
          </li>
          <li className={pv.gCard} data-pv="">
            <span className={pv.gIc}><TI.never /></span>
            <span className={pv.gBig}>0</span>
            <span className={pv.gText}>third-party requests made by your browser. No third-party analytics, no advertising, no tracking cookie.</span>
          </li>
          <li className={pv.gCard} data-pv="">
            <span className={pv.gIc}><TI.clock /></span>
            <span className={pv.gBig}>1 day <span className={pv.gSep} aria-hidden="true">/</span> <span data-count="180" aria-hidden="true">180</span><span className="sr-only">180</span> days</span>
            <span className={pv.gText}>An AI reader answer is held one day, then it is gone; an anonymous save stops opening after 180 days.</span>
          </li>
        </ul>

        <h2 id="where" className={s.h2}>Where your words go</h2>
        <p className={s.h2sub}>Your device, what crosses the wire, and what our side keeps. Every line is stated in full below.</p>
        <FlowDiagram />

        <h2 id="store" className={s.h2}>What we store, and for how long</h2>
        <p className={s.h2sub}>One row for each thing that can be kept. The first two are held only in this browser.</p>
        <StoreTable />
        <FieldOverview endpoints={PRIVACY_ENDPOINTS} />

        <LongLayout items={TOC} pillsAbove>
          <h2 className={s.h2} style={{ marginTop: 0 }}>The details</h2>
          <p className={s.h2sub}>Each promise in full. Open any row.</p>

          <Fold id="browser" title={T(<TI.browser />, 'Your journey stays in this browser')} open
            summary="Held in local storage. An account is optional and changes none of that.">
            <p>What you type into the ledger is held in this browser&rsquo;s local storage. Clearing your browser data, or pressing &ldquo;Start over&rdquo;, removes it. An account is optional and changes none of that: your journey still lives in this browser.</p>
            <p>If you make one, we store a random account number, whichever way in you chose (the public half of a passkey, or an email address and a scrambled form of your password that cannot be turned back into it), a ten-word recovery code we keep only the scrambled form of, and the ledgers you press save on. No mail is ever sent to that address.</p>
            <p>Deleting your account from /account erases all of it; corrections you already sent stay in the public register with the link back to you removed.</p>
          </Fold>

          {/* 🔴 THE ONE REQUEST THIS PRODUCT MAKES OF AN OUTSIDE COMPANY IS
              DESCRIBED IN THE SAME PLAIN WORDS AS EVERY FIELD BELOW. Read
              cf/functions/api/map.js and components/JourneyBuilder.tsx before
              editing a word of this: the rules run in the browser AND again on
              our server, the model sees only what those rules could not read,
              the catalog it chooses from carries no prices, and the cache holds
              the answer for one day. Nothing here is aspiration. */}
          <Fold id="reader" title={T(<TI.reader />, 'What the AI reader sees')}
            summary="Only phrases the rules cannot place, with at most four words each side. No price.">
            <p>While you type, the words in the box are sent to this site so that the same rules your browser just ran can be run again on our server. Only the phrases those rules cannot place go any further.</p>
            <p>Each one goes on its own, with at most four words from the phrase just before it and four from the phrase just after it, together with the list of unit names from the price table. The rest of what you wrote stays here, and no price is sent.</p>
            <p>On waypointledger.org these phrases go over an encrypted connection to <strong>OpenAI</strong>, whose model (gpt-5.6-luna, or gpt-5.5 and then gpt-5.4-mini if that one does not answer) may reply only with a unit name the table already holds. No price ever comes back: the published federal table does all of the pricing here.</p>
            <p>The answer, which carries the phrases you typed, is held on our side for one day under a one-way hash of what you typed, so the same sentence is not read twice. After that day it is gone.</p>
            <p className="micro">The code picks the model by which key a copy of this site holds: OpenAI when it has an OpenAI key, which ours does; otherwise Anthropic; otherwise <strong>Cloudflare Workers AI</strong>, Cloudflare&rsquo;s own model on the network that served you this page. Our staging copy has no OpenAI key and uses Cloudflare Workers AI. If the model does not answer, the rules&rsquo; answer stands and the line is left blank for you to fill in. What OpenAI keeps on its side is set by <a href="https://platform.openai.com/docs/guides/your-data" target="_blank" rel="noopener noreferrer">its API data policy</a>. You can see exactly what is sent and what comes back at <a href="/api/map">POST /api/map</a> (add <code>?debug=1</code>), and the rules themselves are in the open source.</p>
          </Fold>

          <Fold id="save" title={T(<TI.open />, 'If you press Save')}
            summary="The one thing that puts your own words on our server. It comes with a delete code.">
            <p>Saving is the one thing that puts your own words on our server: the units of care, their counts and the short phrase you typed for each line, so the link you get back opens the ledger again.</p>
            <p>Two things come back with that link. A delete code, shown once, which is the only way to remove the save and needs no account. We keep only a one-way hash of it, so we cannot use it and cannot recover it for you. And a date: an anonymous save stops opening after 180 days, while a save on an account has no expiry.</p>
            <p>Anyone holding the link can open that ledger, so treat the link as the ledger itself and keep names out of what you type.</p>
          </Fold>

          <Fold id="about-you" title={T(<TI.device />, 'What you tell the ledger about yourself')}
            summary="Your coverage and where you live stay in this browser and ride on nothing you send.">
            <p>Choosing your coverage and where you live changes which published figure each line shows you. Both answers are held in this browser under <code>waypoint-ledger.ctx.v1</code>, and the fit of a figure to a person is worked out on your own device: neither answer is attached to a correction, a gap report, a share link or a saved ledger.</p>
          </Fold>

          <Fold id="share" title={T(<TI.bundle />, 'A share link carries no names')}
            summary="A copied link holds the ledger after the #, the part a browser never sends.">
            <p>The link the ledger copies for you carries only the units of care, their counts, the counter a line belongs in and how many months, never your words or a name, inside the link itself, after the <code>#</code>. A browser never sends that part to any server, so a shared journey of this kind is never stored by us and never arrives here.</p>
            <p>A link from Save is the other kind: that one is a row in our database, and it is described field by field below.</p>
          </Fold>

          <Fold id="correction" title={T(<TI.target />, 'What a correction sends')}
            summary="The figure, your verdict, an optional amount and note. No name, diagnosis or IP address.">
            <p>If you mark a published figure right or wrong, we record the identifier of the figure, your verdict, optionally the amount you say you paid, the version of the price table, and an optional note that is never published and never exported. No name, no diagnosis and no IP address on the row, ever.</p>
            <p>If you happen to be signed in, the row also records which account sent it, so the site can show you what you have flagged; deleting your account removes that link and leaves the correction counted. If you are not signed in (the default, and how nearly everyone uses this), there is no account and nothing about you on the row. The aggregate is public at <a href="/api/corrections">/api/corrections</a>.</p>
            {/* 🔴 R6 sense F13: the field table below is generated from the D1 schema, so a
                KV-side counter derived from the IP is invisible to the generator — the one
                blind spot on the page that says it cannot fall behind. It is written out here. */}
            <p>To stop one person answering the same figure a hundred times, the server also counts sends against a one-way hash of the network address, salted with the date and a secret only the server holds. The address itself is never stored, the hash cannot be turned back into it, it stops being comparable the next day, and nothing derived from it appears in any published row or export. The full description is on <a href="/integrity">the integrity page</a>.</p>
            <p>So that one person cannot answer the same figure a hundred times, your browser makes a random identifier for itself the first time you send anything, and keeps it under <code>waypoint-ledger.submitter.v1</code>. It is sent with a correction and the server stores only a truncated hash of it combined with that one price row: a hash that cannot be joined to your answer on any other row, and that we could not turn back into the identifier if we wanted to. It is used for nothing else and sent nowhere else.</p>
          </Fold>

          <Fold id="gap" title={T(<TI.steps />, 'What a gap report sends')}
            summary="Counts, ranking, an optional note and context. A group under 11 is never named.">
            <p>If you report care you needed and did not get, we record the counts and ranking you entered, an optional note, and any optional context you chose to give (an age band, insurance type, region, and how urban or rural).</p>
            <p>The counts and the ranking are public at <a href="/api/gap">/api/gap</a> and in the open CSV, with the day the report arrived and never the time. The context is published only as counts, and any value fewer than 11 reports gave is not shown: it is counted in one line, &ldquo;fewer than 11, not shown&rdquo;, and never named. The note is never published.</p>
            <p>When you add the ledger&rsquo;s &ldquo;Times you were told it was nothing&rdquo; count, your browser also sends a random identifier it keeps under <code>waypoint-ledger.gap-key.v1</code>, joined to the number. The server keeps a one-way hash of that pair for one day, in a store separate from the reports, so the same number pressed twice is counted once. It is not written to the report, and it is used for nothing else.</p>
          </Fold>

          <Fold id="survey" title={T(<TI.eye />, 'What the burden survey sends')}
            summary="Your ranking and answers go in the open CSV; what you say about yourself, only as counts.">
            <p>Your ranking of five burdens, three multiple-choice answers, an optional clinician count, any optional self-description you chose (who is answering, age band, sex, coverage, region, state, stage, and the age bands when the illness began and when it was diagnosed), the channel slug on the link you used, and the time it was received. An optional one-sentence note is encrypted at rest and never published.</p>
            <p>What is public, and where. The open CSV at <a href="/api/export/survey.csv">/api/export/survey.csv</a> has one row per answer: your ranking, your three answers, the clinician count, the channel, the instrument version and the day it arrived. It never has the time and never has anything you said about yourself.</p>
            <p>What you said about yourself is published only as counts, at <a href="/api/survey">/api/survey</a> and on the register, and any answer fewer than 11 people gave is not shown there: it is counted in one line, &ldquo;fewer than 11, not shown&rdquo;, and never named. The same rule is applied on our server, before anything is sent to a browser.</p>
            <p>An answer about a child carries no name and no date of birth, and is read as its own group on the register. If you were signed in when you sent it, the row also records which account sent it, and deleting your account cuts that link. Otherwise nothing on the row points back to you, so there is no way to find one answer again, and this site has no way to delete one.</p>
          </Fold>

          <Fold id="interview" title={T(<TI.mail />, 'What a written interview sends')}
            summary="Encrypted at rest, read only by our team, quoted only the way you chose.">
            <p>The answers you wrote, who is answering if you chose to say (you, or a parent or caregiver), the consent you chose (learn only, quote anonymously, quote by name), a name only if you chose to be quoted by name, and an email address only if you asked to hear about a new version.</p>
            <p>Interview answers are encrypted at rest. Only our team reads them, through a private admin screen; no public page, endpoint or export carries them. Quotes appear only in the way you chose. To have an interview removed, write to us through <a href={CONTACT}>Contact</a>.</p>
          </Fold>

          <Fold id="third-party" title={T(<TI.never />, 'No third-party analytics, no advertising, no tracking')}
            summary="Your browser makes no third-party request. The only cookie is a sign-in session.">
            <p>Your browser makes no third-party request of any kind. The single outside request this product makes is the one above, to the AI reader, and our server makes it: never your browser, and never with a price in it.</p>
            <p>The three typefaces are served from this domain (they used to come from Google Fonts, and that was the last outside request left). There is no third-party analytics script, no advertising, no tracking cookie. Our own server does keep one number per day for each of a few actions (a story read, a ledger opened, priced, saved or exported, a sheet printed, a correction, a survey answer, an interview), with no cookie, no address, no identifier and nothing you typed; those counts are public on the <a href="/register/live">live register</a>, and our own tests and known bots are left out of them. The only cookie this site can ever set is the session cookie you get if you sign in, and it holds one random value.</p>
          </Fold>

          <Fold id="fields" title={T(<TI.table />, 'Every field this database has')}
            summary={`${PRIVACY_COLUMN_COUNT} columns across ${PRIVACY_TABLE_COUNT} tables, generated from the schema itself.`}>
            <p>When you do send something, every field that lands in our database is listed here, and this list is generated from the database itself, so it cannot fall behind.</p>
            <p>A privacy page written as prose drifts from the database the first time an engineer adds a column. So this part is not written. It is generated from the schema itself ({PRIVACY_COLUMN_COUNT} columns across {PRIVACY_TABLE_COUNT} tables, read from {PRIVACY_MIGRATIONS.join(', ')}), together with the validators as they actually run, the field list inside the tamper-evidence chain, and the header of each published CSV. <strong>A column added without a plain-English description here fails our build</strong>, so a field cannot ship without appearing on this page.</p>
            <p className="micro">Generated {PRIVACY_GENERATED_ON} &middot; schema fingerprint {PRIVACY_SCHEMA_FINGERPRINT}</p>
            <dl className={s.legend}>
              <dt>Kept</dt><dd>Says whether the value is always there or only when it applies.</dd>
              <dt>Public</dt><dd>Means the value is served to anyone row by row (for the three registers with a CSV, that is exactly what the CSV carries); a value published only as a count, like what you say about yourself on the survey, says no here and is explained under its table.</dd>
              <dt>In the CSV</dt><dd>Means it is in the open download at /api/export.</dd>
            </dl>
            {PRIVACY_ENDPOINTS.map((e) => (
              <Fields e={e} key={e.id} />
            ))}
          </Fold>

          <Fold id="who" title={T(<TI.shield />, 'Who runs it')} summary="Precision Federal, Ames, Iowa.">
            <p>Precision Federal, Ames, Iowa. Questions: <a href={CONTACT}>Contact</a>.</p>
          </Fold>
        </LongLayout>
      </div>
    </section>
  );
}

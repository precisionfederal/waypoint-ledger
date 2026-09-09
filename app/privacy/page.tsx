import type { Metadata } from 'next';
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
      <div className="table-scroll">
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

export default function Privacy() {
  return (
    <section className="page narrow">
      <div className="wrap prose">
        <p className="eyebrow">Privacy</p>
        <h1>What this tool keeps, and what it never sees</h1>
        <p className="sub">Nothing you type leaves this browser unless you press Save or send something. When you do send something, every field that lands in our database is listed further down this page &mdash; and that list is generated from the database itself, so it cannot fall behind.</p>

        <h2>Your journey stays in this browser</h2>
        <p>What you type into the ledger is held in this browser&rsquo;s local storage. Clearing your browser data, or pressing &ldquo;Start over&rdquo;, removes it. An account is optional and changes none of that: your journey still lives in this browser. If you make one, we store a random account number, whichever way in you chose (the public half of a passkey, or an email address and a scrambled form of your password that cannot be turned back into it), a ten-word recovery code we keep only the scrambled form of, and the ledgers you press save on. No mail is ever sent to that address. Deleting your account from /account erases all of it; corrections you already sent stay in the public register with the link back to you removed.</p>

        <h2>If you press Save</h2>
        <p>Saving is the one thing that puts your own words on our server: the units of care, their counts and the short phrase you typed for each line, so the link you get back opens the ledger again. Two things come back with that link. A delete code, shown once, which is the only way to remove the save and needs no account &mdash; we keep only a one-way hash of it, so we cannot use it and cannot recover it for you. And a date: an anonymous save stops opening after 180 days, while a save on an account has no expiry. Anyone holding the link can open that ledger, so treat the link as the ledger itself and keep names out of what you type.</p>

        <h2>What you tell the ledger about yourself</h2>
        <p>Choosing your coverage and where you live changes which published figure each line shows you. Both answers are held in this browser under <code>waypoint-ledger.ctx.v1</code>, and the fit of a figure to a person is worked out on your own device: neither answer is attached to a correction, a gap report, a share link or a saved ledger.</p>

        <h2>A share link carries no names</h2>
        <p>The link the ledger copies for you carries the units of care, their counts and your short phrases inside the link itself, after the <code>#</code>. A browser never sends that part to any server, so a shared journey of this kind is never stored by us and never arrives here. A link from Save is the other kind: that one is a row in our database, and it is described field by field below.</p>

        <h2>What a correction sends</h2>
        <p>If you mark a published figure right or wrong, we record the identifier of the figure, your verdict, optionally the amount you say you paid, the version of the price table, and an optional note that is never published and never exported. No name, no diagnosis and no IP address, ever. If you happen to be signed in, the row also records which account sent it, so the site can show you what you have told the government; deleting your account removes that link and leaves the correction counted. If you are not signed in &mdash; the default, and how nearly everyone uses this &mdash; there is no account and nothing about you on the row. The aggregate is public at <a href="/api/corrections">/api/corrections</a>.</p>
        <p>So that one person cannot answer the same figure a hundred times, your browser makes a random identifier for itself the first time you send anything, and keeps it under <code>waypoint-ledger.submitter.v1</code>. It is sent with a correction and the server stores only a truncated hash of it combined with that one price row &mdash; a hash that cannot be joined to your answer on any other row, and that we could not turn back into the identifier if we wanted to. It is used for nothing else and sent nowhere else.</p>

        <h2>What a gap report sends</h2>
        <p>If you report care you needed and did not get, we record the counts and ranking you entered, an optional note, and any optional context you chose to give (an age band, insurance type, region). Nothing identifies you. The aggregate is public at <a href="/api/gap">/api/gap</a>.</p>

        <h2>What the burden survey sends</h2>
        <p>Your ranking of five burdens, three multiple-choice answers, an optional clinician count, any optional self-description you chose (age band, coverage, region, state, stage), the channel slug on the link you used, and the time it was received. An optional one-sentence note is encrypted at rest and never published word for word. The aggregate and a de-identified CSV are public, and a cell holding too few people to be safe is withheld from both.</p>

        <h2>What a written interview sends</h2>
        <p>The answers you wrote, the consent you chose (learn only, quote anonymously, quote by name), a name only if you chose to be quoted by name, and an email address only if you asked to hear about a new version. Interview answers are encrypted at rest and are never served by any endpoint or included in any export. Quotes appear only in the way you chose. To have an interview removed, write to bo@precisionfederal.com.</p>

        <h2>No analytics, no advertising, no third party at all</h2>
        <p>This site makes no third-party request of any kind. The three typefaces are served from this domain (they used to come from Google Fonts, and that was the last outside request left). There is no analytics script, no advertising, no tracking cookie. The only cookie this site can ever set is the session cookie you get if you sign in, and it holds one random value.</p>

        <h2 id="fields">Every field this database has</h2>
        <p>A privacy page written as prose drifts from the database the first time an engineer adds a column. So this part is not written. It is generated from the schema itself &mdash; {PRIVACY_COLUMN_COUNT} columns across {PRIVACY_TABLE_COUNT} tables, read from {PRIVACY_MIGRATIONS.join(', ')} &mdash; together with the validators as they actually run, the field list inside the tamper-evidence chain, and the header of each published CSV. <strong>A column added without a plain-English description here fails our build</strong>, so a field cannot ship without appearing on this page.</p>
        <p className="micro">Generated {PRIVACY_GENERATED_ON} · schema fingerprint {PRIVACY_SCHEMA_FINGERPRINT} · <em>Kept</em> says whether the value is always there or only when it applies · <em>Public</em> means the value is served to anyone and, where the register is chained, is inside the hash chain · <em>In the CSV</em> means it is in the open download at /api/export.</p>
        {PRIVACY_ENDPOINTS.map((e) => (
          <Fields e={e} key={e.id} />
        ))}

        <h2>Who runs it</h2>
        <p>Precision Federal, Ames, Iowa. Questions: <a href="mailto:bo@precisionfederal.com">bo@precisionfederal.com</a>.</p>
      </div>
    </section>
  );
}

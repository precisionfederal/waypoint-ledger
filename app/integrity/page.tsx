import type { Metadata } from 'next';
import { shareCard } from '@/lib/og';
import type { ReactNode } from 'react';
import IntegrityPanel from '@/components/IntegrityPanel';
import ThemedImg from '@/components/ThemedImg';
import './integrity.css';

/* PAGES R1 (2026-09-30 night): the page opens with what the chain proves and
   what it does not, the four controls as cards, and the chain drawn in HTML/CSS
   (the first row starts from 64 zeros, each later row from the hash above it,
   the last hash is the head). The long explanations and the two Python recipes
   sit behind one-line folds. Every sentence the page carried is still here.
   Styles: ./integrity.css, every rule scoped under .ix. */

const TITLE = 'How the count is kept honest';
const DESCRIPTION = 'Every row in the public register is hash-chained to the row before it. The formula, the heads, and how to check them yourself from the published CSVs.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...shareCard(TITLE, DESCRIPTION, '/integrity'),
};

const RECIPE = `# Check our count without trusting us. Python 3, no packages.
import csv, json, hashlib, re, urllib.request

url = "https://waypointledger.org/api/export/corrections.csv"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})  # the site's edge refuses Python's default agent
lines = urllib.request.urlopen(req).read().decode().splitlines()
rows = list(csv.DictReader(l for l in lines if not l.startswith("#")))  # line 1 is a comment: the table version

def cell(s):    # a cell a spreadsheet would execute is stored with a leading
    if s[:1] == "'" and re.match(r"[=+\\-@\\t\\r]", s[1:2]):   # apostrophe: strip it
        return s[1:]
    return s

def num(s):
    if s == "": return None
    return int(s) if "." not in s else float(s)

prev = "0" * 64
for r in rows:
    fields = {
        "received_at":   cell(r["received_at"]),
        "price_id":      cell(r["price_id"]),
        "verdict":       cell(r["verdict"]),
        "believed_usd":  num(r["believed_usd"]),
        "table_version": cell(r["table_version"]) or None,
    }
    canonical = json.dumps(fields, sort_keys=True, separators=(",", ":"))
    prev = hashlib.sha256((prev + canonical).encode()).hexdigest()
    assert prev == r["row_hash"], f'row {r["received_at"]} does not match'

print("head:", prev)  # compare with /api/integrity`;

const LINKS = `# survey.csv and gap.csv: check the links row by row. Python 3, no packages.
import csv, urllib.request

for name, table in (("survey", "survey_responses"), ("gap", "gap_reports")):
    url = f"https://waypointledger.org/api/export/{name}.csv"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})  # the edge refuses Python's default agent
    lines = urllib.request.urlopen(req).read().decode().splitlines()
    rows = list(csv.DictReader(l for l in lines if not l.startswith("#")))
    prev = "0" * 64
    for n, r in enumerate(rows, 1):
        assert r["prev_hash"] == prev, f"{name} row {n} does not link to the row above"
        prev = r["row_hash"]
    print(name, len(rows), "rows, head:", prev, "- compare with", table, "at /api/integrity")`;

const SV = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const Glyph = ({ children, size = 22 }: { children: ReactNode; size?: number }) => (
  <svg className="ix-glyph" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{children}</svg>
);
const LINK = <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" {...SV} /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" {...SV} /></>;
const THUMB = <><path d="M7 11v9H3.5v-9zM7 11l4-8a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7" {...SV} /></>;
const CLOCK = <><circle cx="12" cy="12" r="8.5" {...SV} /><path d="M12 7.5V12l3 2" {...SV} /></>;
const USER = <><circle cx="12" cy="8" r="3.5" {...SV} /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" {...SV} /><path d="M4 4l16 16" {...SV} /></>;
const CHECK = <><circle cx="12" cy="12" r="8.5" {...SV} /><path d="M8.5 12.2l2.4 2.4 4.6-4.9" {...SV} /></>;
const MINUS = <><circle cx="12" cy="12" r="8.5" {...SV} /><path d="M8.5 12h7" {...SV} /></>;
const BAN = <><circle cx="12" cy="12" r="8.5" {...SV} /><path d="M6 6l12 12" {...SV} /></>;
const LOCK = <><rect x="5" y="10.5" width="14" height="10" rx="2" {...SV} /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" {...SV} /></>;
const EYE = <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...SV} /><path d="M4 4l16 16" {...SV} /></>;
const ID = <><rect x="3.5" y="5.5" width="17" height="13" rx="2" {...SV} /><path d="M7.5 10h4M7.5 14h6" {...SV} /><path d="M3 3l18 18" {...SV} /></>;

function Fold({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <details className="ix-fold">
      <summary><span className="ix-fold-t">{summary}</span><span className="ix-chev" aria-hidden="true" /></summary>
      <div className="ix-fold-body">{children}</div>
    </details>
  );
}

const NAV: [string, string][] = [
  ['proves', 'What it proves'],
  ['chain', 'What the chain is'],
  ['heads', 'The heads, right now'],
  ['vote-cost', 'What one vote costs'],
  ['covers', 'What each chain covers'],
  ['check', 'Check it yourself'],
  ['refused', 'What else is refused'],
];

export default function Integrity() {
  return (
    <section className="page ix">
      <div className="wrap">
        <header className="ix-head ix-hero">
          <div className="ix-hero-copy">
            <p className="eyebrow">Integrity</p>
            <h1>How the count is kept honest</h1>
            <p className="lede">
              This tool asks the public to flag where a published federal figure is wrong. A count like that
              is only worth reading if the people reading it can check that nobody edited it afterwards, including us.
            </p>
            <a className="btn primary ix-hero-cta" href="#heads">Check the chain yourself</a>
          </div>
          {/* decorative: waypoints linked one to the next by a thin teal line (VISUAL-art.md); the words are in HTML */}
          <ThemedImg light="/img/v2/integrity-hero.webp" dark="/img/v2/integrity-hero-dark.webp" width={1200} height={525} alt="" className="ix-hero-art" loading="eager" fetchPriority="high" />
        </header>

        <ul className="ix-glance" aria-label="The controls at a glance">
          <li><Glyph>{LINK}</Glyph><b>SHA-256 chain</b><span>Every row is hashed together with the row before it.</span></li>
          <li><Glyph>{THUMB}</Glyph><b>One thumb</b><span>per browser per figure.</span></li>
          <li><Glyph>{CLOCK}</Glyph><b>3 an hour, 8 a day</b><span>per network per figure, at most.</span></li>
          <li><Glyph>{USER}</Glyph><b>No account</b><span>A correction never requires one.</span></li>
        </ul>

        <div className="ix-layout">
          <nav className="ix-nav" aria-label="On this page">
            <p className="ix-nav-h">On this page</p>
            <ul>{NAV.map(([id, t]) => <li key={id}><a href={`#${id}`}>{t}</a></li>)}</ul>
          </nav>

          <div className="ix-main">
            <section className="ix-sec" aria-labelledby="proves">
              <h2 id="proves">What it proves, and what it does not</h2>
              <div className="ix-pair">
                <div className="ix-card is-yes">
                  <p className="ix-card-h"><Glyph>{CHECK}</Glyph> It proves</p>
                  <p>
                    that no row was edited, removed or reordered after it was written without
                    the head changing. If we quietly deleted the corrections that were inconvenient, the head published here would
                    no longer match the file you downloaded.
                  </p>
                </div>
                <div className="ix-card is-no">
                  <p className="ix-card-h"><Glyph>{MINUS}</Glyph> It does not prove</p>
                  <p>
                    that every row came from a different person, or that we published every row
                    we received. Those are different claims, and this page does not make them.
                  </p>
                </div>
              </div>
            </section>

            <section className="ix-sec" aria-labelledby="chain">
              <h2 id="chain">What the chain is</h2>
              <p className="ix-p">When a row arrives it is hashed together with the hash of the row before it:</p>
              <pre className="ix-formula"><code>row_hash = SHA-256( prev_hash + canonical_json(published fields) )</code></pre>
              <ol className="ix-chain" aria-label="How the rows are linked; on a narrow screen, scroll sideways" tabIndex={0}>
                <li className="ix-link is-genesis">
                  <span className="ix-link-k">Start</span>
                  <span className="ix-link-v"><code>000…000</code></span>
                  <span className="ix-link-s">64 zeros</span>
                </li>
                <li className="ix-link">
                  <span className="ix-link-k">Row 1</span>
                  <span className="ix-link-v">SHA-256( zeros + row 1 )</span>
                  <span className="ix-link-s">its row_hash</span>
                </li>
                <li className="ix-link">
                  <span className="ix-link-k">Row 2</span>
                  <span className="ix-link-v">SHA-256( row 1&rsquo;s hash + row 2 )</span>
                  <span className="ix-link-s">its row_hash</span>
                </li>
                <li className="ix-link is-gap" aria-hidden="true"><span className="ix-link-k">…</span></li>
                <li className="ix-link is-head">
                  <span className="ix-link-k">The head</span>
                  <span className="ix-link-v">the last row&rsquo;s hash</span>
                  <span className="ix-link-s">published below and at /api/integrity</span>
                </li>
              </ol>
              <p className="ix-p">
                The first row of each chain uses 64 zeros. <em>Canonical JSON</em> means object keys sorted at every level, no
                whitespace, missing values written as <code>null</code>, so two people in two languages produce the same
                bytes. Both hashes are stored on the row and the current head is published below and at{' '}
                <a href="/api/integrity">/api/integrity</a>.
              </p>
            </section>

            <section className="ix-sec" aria-labelledby="heads">
              <h2 id="heads">The heads, right now</h2>
              <p className="ix-p">
                Each chain below ends in one 64-character number. Change any published row, delete one, or move one, and that
                number changes. We walk every chain on request and print what we get, whether or not it matches.
              </p>
              <IntegrityPanel />
            </section>



            <section className="ix-sec" aria-labelledby="vote-cost">
              <h2 id="vote-cost">What one vote costs</h2>
              <p className="ix-p">
                A demand signal anybody can move a hundred times is not a signal. A correction never requires an account, and
                nothing about an account is used to count one: the controls below have to work without knowing who anyone is,
                and they do.
              </p>
              <p className="ix-aside">
                An optional account exists for one purpose, opening your own saved ledger on another
                device, and a correction sent while signed in is counted exactly like an anonymous one.
              </p>
              <p className="ix-p">Two controls, both stated plainly:</p>
              <div className="ix-pair">
                <div className="ix-card">
                  <p className="ix-card-h"><Glyph>{THUMB}</Glyph> One thumb per browser per figure.</p>
                  <p>
                    A browser sends a random identifier it keeps to itself;
                    the server stores a one-way hash of that identifier, the figure and the table version, mixed with a secret
                    only the server holds, and refuses a second thumb on the same figure.
                  </p>
                  <Fold summary="Why the secret matters">
                    <p>
                      Without it,
                      anyone holding a browser identifier could recompute the stored value and learn whether that browser had
                      spoken. The stored value is useless to everyone but this server, and it is never published or exported.
                    </p>
                  </Fold>
                </div>
                <div className="ix-card">
                  <p className="ix-card-h"><Glyph>{CLOCK}</Glyph> A cooldown per network per figure: 3 in an hour, 8 in a day.</p>
                  <p>
                    Clearing a browser makes a
                    fresh identifier, so the first control alone would be defeated by a person who cleared storage a hundred
                    times. It is now three.
                  </p>
                  <Fold summary="How the network is counted without being kept">
                    <p>
                      The count is kept against a one-way hash of the network address with a daily salt
                      and the same server secret, so it cannot be reversed into an address by anyone holding it, and it stops
                      being comparable the next day. Nothing derived from it is ever stored in a published row.
                    </p>
                  </Fold>
                </div>
              </div>
              <div className="ix-pair">
                <div className="ix-card is-flat">
                  <p className="ix-card-h">What that does not stop</p>
                  <p>
                    Someone determined, with a hundred browsers on a hundred networks.
                    We will not pretend otherwise. What it costs them is now a hundred networks instead of a hundred clicks, and
                    the register publishes the count on every figure and the days the corrections arrived, so the shape of any such push is visible in the numbers we
                    publish rather than hidden inside them.
                  </p>
                </div>
                <div className="ix-card is-flat">
                  <p className="ix-card-h">An honest person is never silenced by this</p>
                  <p>
                    A refusal from the cooldown is a 429, and the
                    browser keeps the correction and sends it when the window turns, so the fourth person in one household, or
                    the fourth patient on one clinic&rsquo;s wifi, loses nothing but a few minutes.
                  </p>
                </div>
              </div>
            </section>

            <section className="ix-sec" aria-labelledby="covers">
              <h2 id="covers">What each chain covers</h2>
              <p className="ix-p">
                Each row as it was written: the fields listed for each chain in the cards above and in{' '}
                <a href="/api/integrity">the endpoint</a>.
              </p>
              <ul className="ix-list">
                <li><Glyph size={20}>{EYE}</Glyph><p>An optional note, the encrypted sentence on a survey, and every word
                  written in an interview were never in the chain: we never publish them, so nobody outside could ever check a
                  hash taken over them.</p></li>
                <li><Glyph size={20}>{ID}</Glyph><p>Two of the three open files now publish less than their chain covers, on purpose.
                  The chain itself was not rewritten: every hash is the
                  hash it was on the day the row arrived, taken over the full row.</p></li>
              </ul>
              <Fold summary={<><strong>survey.csv</strong> and <strong>gap.csv</strong>: what they leave out</>}>
                <p>
                  <strong>survey.csv</strong>{' '}
                  gives the day an answer arrived, never the time, and nothing the person said about themselves (age band, sex,
                  coverage, region, state, stage, who answered, the ages at onset and diagnosis). One row carrying all of that
                  could point at a person, so those answers are published only as counts, at{' '}
                  <a href="/api/survey">/api/survey</a>, and any answer fewer than 11 people gave is not shown there.
                </p>
                <p><strong>gap.csv</strong> gives the day, never the time.</p>
              </Fold>
            </section>

            <section className="ix-sec" aria-labelledby="check">
              <h2 id="check">Check it yourself</h2>
              <div className="ix-pair">
                <div className="ix-card">
                  <p className="ix-card-h">corrections.csv: recompute every hash</p>
                  <p>
                    <strong>corrections.csv</strong> carries every field its chain covers, so you can recompute every hash from the
                    file alone. Download it, walk it from the top, and recompute.
                  </p>
                </div>
                <div className="ix-card">
                  <p className="ix-card-h">survey.csv and gap.csv: check the links</p>
                  <p>
                    <strong>survey.csv and gap.csv</strong> leave out fields their hash was taken over, so from those files you check
                    the links rather than recompute them.
                  </p>
                </div>
              </div>
              <Fold summary="The corrections recipe: the whole method, the same code we run (Python 3, no packages)">
                <p>This is the whole method, the same code we run:</p>
                <pre className="ix-code" tabIndex={0} aria-label="The corrections recipe, Python"><code>{RECIPE}</code></pre>
                <p>
                  One detail the code above handles: a cell that would otherwise begin with <code>=</code>, <code>+</code>,{' '}
                  <code>-</code>, <code>@</code>, a tab or a carriage return is stored with a leading apostrophe, so a
                  spreadsheet reads it as text instead of running it. Strip that one apostrophe before you hash. It is the only
                  thing we do to a published value, and it is reversible.
                </p>
              </Fold>
              <Fold summary="The links recipe for survey.csv and gap.csv, and what it can and cannot show">
                <p>
                  The first <code>prev_hash</code> is 64 zeros, every later one is the{' '}
                  <code>row_hash</code> of the row above, and the last <code>row_hash</code> and the number of rows match the head
                  published above. That shows no row was dropped, added or moved since the head you compare with.
                </p>
                <p>
                  It cannot show
                  that a published answer matches what was hashed; for that we walk every chain over the stored rows ourselves at{' '}
                  <a href="/api/integrity?verify=1">/api/integrity?verify=1</a> and print the result, whether or not it matches.
                </p>
                <pre className="ix-code" tabIndex={0} aria-label="The links recipe, Python"><code>{LINKS}</code></pre>
              </Fold>
              <div className="ix-card is-flat">
                <p className="ix-card-h">The limit of a published hash</p>
                <p>
                  A row hash cannot be turned back into the row. It is still a fingerprint of the whole row, so someone who already
                  knew every answer a particular person gave, and roughly when, could test that guess against it. That is the
                  limit of what a published hash can hide, and we would rather say it than not.
                </p>
              </div>
              <p className="ix-files">
                <span>The files, published oldest first, which is the order they were chained in:</span>
                <a className="ix-file" href="/api/export/corrections.csv">corrections.csv</a>
                <a className="ix-file" href="/api/export/gap.csv">gap.csv</a>
                <a className="ix-file" href="/api/export/survey.csv">survey.csv</a>
              </p>
            </section>

            <section className="ix-sec" aria-labelledby="refused">
              <h2 id="refused">What else is refused</h2>
              <ul className="ix-list is-grid">
                <li><Glyph size={20}>{BAN}</Glyph><p>A correction must name one of the published figures in the price table. An identifier that is not in the table is refused, with that sentence.</p></li>
                <li><Glyph size={20}>{THUMB}</Glyph><p>A second thumb on the same figure from the same browser is refused: <em>you have already told us about this figure.</em></p></li>
                <li><Glyph size={20}>{EYE}</Glyph><p>Free text is never exported, never served publicly, and never included in a share link.</p></li>
                <li><Glyph size={20}>{LOCK}</Glyph><p>Interview answers are encrypted before they are stored; the key is not in the code.</p></li>
              </ul>
            </section>

            <p className="ix-foot">
              <span>The method for the prices themselves is at <a href="/method">how a number is made</a>.</span>
              <span>Security contact and the vulnerability policy: <a href="/.well-known/security.txt">security.txt</a>.</span>
              <span>Accessibility: <a href="/accessibility">our conformance statement</a>.</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

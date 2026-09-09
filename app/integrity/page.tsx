import type { Metadata } from 'next';
import IntegrityPanel from '@/components/IntegrityPanel';

export const metadata: Metadata = {
  title: 'How the count is kept honest',
  description: 'Every row in the public register is hash-chained to the row before it. The formula, the heads, and how to check them yourself from the published CSV.',
};

const PRE: React.CSSProperties = {
  background: 'var(--ground-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)',
  padding: '.9rem 1rem', overflowX: 'auto', fontSize: '.85rem', lineHeight: 1.5, whiteSpace: 'pre',
};

const RECIPE = `# Check our count without trusting us. Python 3, no packages.
import csv, json, hashlib, re, urllib.request

url = "https://waypoint-ledger.pages.dev/api/export/corrections.csv"
rows = list(csv.DictReader(urllib.request.urlopen(url).read().decode().splitlines()))

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

export default function Integrity() {
  return (
    <section className="page narrow">
      <div className="wrap prose">
        <p className="eyebrow">Integrity</p>
        <h1>How the count is kept honest</h1>
        <p className="lede">
          This tool asks the public to tell the government where a published federal figure is wrong. A count like that
          is only worth reading if the people reading it can check that nobody edited it afterwards — including us.
        </p>

        <h2>The heads, right now</h2>
        <p>
          Each chain below ends in one 64-character number. Change any published row, delete one, or move one, and that
          number changes. We walk every chain on request and print what we get, whether or not it matches.
        </p>
        <IntegrityPanel />

        <h2>What the chain is</h2>
        <p>
          When a row arrives it is hashed together with the hash of the row before it:
        </p>
        <pre className="mono" style={PRE}>row_hash = SHA-256( prev_hash + canonical_json(published fields) )</pre>
        <p>
          The first row of each chain uses 64 zeros. <em>Canonical JSON</em> means object keys sorted at every level, no
          whitespace, missing values written as <code>null</code> — so two people in two languages produce the same
          bytes. Both hashes are stored on the row and the current head is published above and at{' '}
          <a href="/api/integrity">/api/integrity</a>.
        </p>

        <h2>What it proves, and what it does not</h2>
        <p>
          <strong>It proves</strong> that no published row was edited, removed or reordered after it was written without
          the head changing. If we quietly deleted the corrections that were inconvenient, the head published here would
          no longer match the file you downloaded.
        </p>
        <p>
          <strong>It does not prove</strong> that every row came from a different person, or that we published every row
          we received. Those are different claims, and this page does not make them.
        </p>

        <h2>What one vote costs</h2>
        <p>
          A demand signal anybody can move a hundred times is not a signal. There are no accounts here and there never
          will be, so the cost of a vote has to be paid without knowing who anyone is. Two controls, both stated plainly:
        </p>
        <ul>
          <li>
            <strong>One thumb per browser per figure.</strong> A browser sends a random identifier it keeps to itself;
            the server stores a one-way hash of that identifier, the figure and the table version, mixed with a secret
            only the server holds, and refuses a second thumb on the same figure. The secret matters: without it,
            anyone holding a browser identifier could recompute the stored value and learn whether that browser had
            spoken. The stored value is useless to everyone but this server, and it is never published or exported.
          </li>
          <li>
            <strong>A cooldown per network per figure: 3 in an hour, 8 in a day.</strong> Clearing a browser makes a
            fresh identifier, so the first control alone would be defeated by a person who cleared storage a hundred
            times. It is now three. The count is kept against a one-way hash of the network address with a daily salt
            and the same server secret, so it cannot be reversed into an address by anyone holding it, and it stops
            being comparable the next day. Nothing derived from it is ever stored in a published row.
          </li>
        </ul>
        <p>
          <strong>What that does not stop:</strong> someone determined, with a hundred browsers on a hundred networks.
          We will not pretend otherwise. What it costs them is now a hundred networks instead of a hundred clicks, and
          the register publishes senders as well as sends so the shape of any such push is visible in the numbers we
          publish rather than hidden inside them.
        </p>
        <p>
          <strong>An honest person is never silenced by this.</strong> A refusal from the cooldown is a 429, and the
          browser keeps the correction and sends it when the window turns — so the fourth person in one household, or
          the fourth patient on one clinic&rsquo;s wifi, loses nothing but a few minutes.
        </p>

        <h2>What each chain covers</h2>
        <p>
          Exactly the columns we publish in the CSV export, and nothing else. An optional note, the encrypted sentence
          on a survey, and every word written in an interview are outside the chain on purpose: we never publish them,
          so nobody outside could ever check a hash taken over them. A hash over data nobody can see proves nothing to
          anybody. The exact field list per chain is in the table above and in{' '}
          <a href="/api/integrity">the endpoint</a>.
        </p>

        <h2>Check it yourself</h2>
        <p>
          Download the register, walk it from the top, and recompute. This is the whole method — the same code we run:
        </p>
        <pre className="mono" style={PRE}>{RECIPE}</pre>
        <p>
          One detail the code above handles: a cell that would otherwise begin with <code>=</code>, <code>+</code>,{' '}
          <code>-</code>, <code>@</code>, a tab or a carriage return is stored with a leading apostrophe, so a
          spreadsheet reads it as text instead of running it. Strip that one apostrophe before you hash. It is the only
          thing we do to a published value, and it is reversible.
        </p>
        <p>
          The files: <a href="/api/export/corrections.csv">corrections.csv</a>,{' '}
          <a href="/api/export/gap.csv">gap.csv</a>, <a href="/api/export/survey.csv">survey.csv</a>. Rows are published
          oldest first, which is the order they were chained in.
        </p>

        <h2>What else is refused</h2>
        <ul>
          <li>A correction must name one of the published figures in the price table. An identifier that is not in the table is refused, with that sentence.</li>
          <li>A second thumb on the same figure from the same browser is refused: <em>you have already told us about this figure.</em></li>
          <li>Free text is never exported, never served publicly, and never included in a share link.</li>
          <li>Interview answers are encrypted before they are stored; the key is not in the code.</li>
        </ul>

        <p className="micro">
          The method for the prices themselves is at <a href="/method">how a number is made</a>. Security contact and
          the vulnerability policy: <a href="/.well-known/security.txt">security.txt</a>. Accessibility:{' '}
          <a href="/accessibility">our conformance statement</a>.
        </p>
      </div>
    </section>
  );
}

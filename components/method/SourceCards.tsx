/* ==========================================================================
   The published files, one card each. Every field is computed by /method at
   build time from data/AUDIT.json (file, agency, hash, retrieved date, rows
   that cite it) and from the rows of public/data/price-table.json that cite
   it (year, basis, population, and the "does not describe" sentence their
   coverage statements carry). A field the data does not hold is left off the
   card; nothing here is typed by hand.
   ========================================================================== */

export interface SourceCard {
  key: string;
  title: string;
  url?: string;
  file?: string;
  agency?: string;
  years: string[];
  bases: string[];
  rows: number;
  /** what the card prices when no row cites the file directly (locality figures, companion figures) */
  feeds?: string | null;
  population?: string | null;
  doesNotDescribe?: string | null;
  sha256?: string;
  error?: string;
  retrieved?: string;
}

/* The first six are the files that price the itemized ledger (the fee
   schedules, the locality indices, the companion charges) and the one figure
   shown apart; the rest open from one fold. Order is the audit's own. */
const SHOWN = 6;
const agencies = (cs: SourceCard[]) => {
  const xs = [...new Set(cs.map((c) => c.agency).filter(Boolean))] as string[];
  return xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? 'federal agencies';
};

export default function SourceCards({ cards, maxRows }: { cards: SourceCard[]; maxRows: number }) {
  const rest = cards.slice(SHOWN);
  return (
    <div className="mx-hashes">
      <div className="mx-tablebar">
        <p className="mx-small">{cards.length} published files. Each hash is shortened to its first 12 characters.</p>
        <label className="mx-toggle">
          <input type="checkbox" />
          <span>Show full hashes and dates</span>
        </label>
      </div>
      <ul className="mx-src-grid" aria-label="The published files behind most figures">
        {cards.slice(0, SHOWN).map((c) => <Card key={c.key} s={c} max={maxRows} />)}
      </ul>
      {rest.length > 0 && (
        <details className="mx-fold mx-src-more">
          <summary>
            <span className="mx-fold-t"><strong>{rest.length} more files</strong>, from {agencies(rest)}</span>
            <span className="mx-chev" aria-hidden="true" />
          </summary>
          <div className="mx-fold-body">
            <ul className="mx-src-grid" aria-label="The other published files">{rest.map((c) => <Card key={c.key} s={c} max={maxRows} />)}</ul>
          </div>
        </details>
      )}
    </div>
  );
}

function Card({ s, max }: { s: SourceCard; max: number }) {
  return (
          <li className="mx-src">
            <p className="mx-src-top">
              {s.agency && <span className="mx-src-ag">{s.agency}</span>}
              {s.years.length > 0 && <span className="mx-src-yr">{s.years.join(', ')}</span>}
            </p>
            <h3 className="mx-src-h">
              {s.url
                ? <a className="mx-rowlink" href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                : s.title}
            </h3>
            {s.file && <p className="mx-src-file"><code>{s.file}</code></p>}
            <dl className="mx-src-dl">
              <div>
                <dt>Prices</dt>
                <dd>
                  {s.rows > 0
                    ? <>{s.rows} {s.rows === 1 ? 'row' : 'rows'}{s.bases.length > 0 && <>, as {s.bases.join(' and ')}</>}</>
                    : s.feeds ?? <span title="No audited row cites this exact file">no row directly</span>}
                  {s.rows > 0 && (
                    <span className="mx-src-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, Math.round((s.rows / max) * 100))}%` }} /></span>
                  )}
                </dd>
              </div>
              {s.population && <div><dt>Describes</dt><dd>{s.population}</dd></div>}
              {s.doesNotDescribe && <div><dt>Doesn&rsquo;t describe</dt><dd>{s.doesNotDescribe}</dd></div>}
              <div className="mx-src-hash">
                <dt>SHA-256</dt>
                <dd className="mx-hash">
                  {s.sha256
                    ? <><span className="mx-hash-short">{s.sha256.slice(0, 12)}&hellip;</span><span className="mx-hash-full">{s.sha256}</span></>
                    : <em>{s.error}</em>}
                </dd>
              </div>
              {s.retrieved && (
                <div className="mx-more-col"><dt>Retrieved</dt><dd>{s.retrieved.startsWith('local') ? 'local copy' : s.retrieved}</dd></div>
              )}
            </dl>
          </li>
  );
}

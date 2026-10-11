/* ==========================================================================
   THE JOURNEY, IN THE ORDER SHE DESCRIBED IT.
   The ledger keeps her lines in the order she typed them and carries no dates,
   so the strip says exactly that: an order, never a timeline with days on it.
   Each stop is the row number the table below uses, the unit's short name and
   how many times. No figure is drawn here: the money stays in the table.
   ========================================================================== */
export interface Stop { key: string; n: number; label: string; times: number; priced: boolean }

export default function JourneyStrip({ stops }: { stops: Stop[] }) {
  const cols = stops.length > 6 ? Math.ceil(stops.length / 2) : stops.length;
  return (
    <section className="sheet-journey" aria-labelledby="sheet-journey-h">
      <h2 id="sheet-journey-h">The journey, in the order I described it</h2>
      {/* up to six stops share one row; more fold into rows of equal columns, so a
          label always has its own column to wrap in. Each stop draws the line to
          the next one in its row; a row's last stop draws none. */}
      <ol className="sj-stops" style={{ ['--sj-n' as string]: cols }}>
        {stops.map((s, i) => (
          <li key={s.key} className={[s.priced ? '' : 'sj-open', (i + 1) % cols === 0 || i === stops.length - 1 ? 'sj-end' : ''].join(' ').trim() || undefined}>
            <span className="sj-dot" aria-hidden="true">{s.n}</span>
            <span className="sj-label">{s.label}</span>
            <span className="sj-times"><span className="sr-only">times: </span><span aria-hidden="true">&times;</span>{s.times}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The unit's name up to its first qualifier: "Doctor's office visit, established
 *  patient…" is "Doctor's office visit" here; the full name prints in the table. */
export const shortUnit = (label: string): string => label.split(/,\s|\s\(|\s\u2014\s/)[0].trim();

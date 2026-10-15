'use client';

/* The ticks inside "Hide before sharing" on the sheet (components/sheet/redact.ts).
   Loaded only when the person opens it, so the sheet itself stays as light as before. */
import type { JourneyEntry } from '@/lib/types';

export default function RedactList({ entries, hidden, onToggle, hideWords, onWords }: {
  entries: readonly JourneyEntry[];
  hidden: ReadonlySet<string>;
  onToggle: (key: string) => void;
  hideWords: boolean;
  onWords: (on: boolean) => void;
}) {
  return (
    <>
      <p className="rd-note">Nothing is hidden unless you tick it. A hidden line leaves the page and its total; the total says how many you hid. Kept on this page only.</p>
      <label className="rd-row rd-words">
        <input type="checkbox" checked={hideWords} onChange={(e) => onWords(e.target.checked)} />
        <span>Hide my own words (what I typed on each line, and my notes)</span>
      </label>
      <ul className="rd-list">
        {entries.map((e, i) => (
          <li key={e.key}>
            <label className="rd-row">
              <input type="checkbox" checked={hidden.has(e.key)} onChange={() => onToggle(e.key)} />
              <span>Hide line {i + 1}: {e.raw.trim() || e.item?.label || 'from a shared link'}</span>
            </label>
          </li>
        ))}
      </ul>
    </>
  );
}

'use client';
/* ==========================================================================
   Read my bill.

   "I already lived this. Do I have to type it all from memory?" A person
   pastes the text of a bill, an Explanation of Benefits or a Medicare Summary
   Notice, or drops the PDF or text file, and the service codes and dates on it
   come back as a checklist. They tick what is theirs; the ticked lines go
   through the store's own addItem, the same path as the search box and chips.

   🔴 THE THREE PROMISES ON ITS FACE, KEPT IN THE CODE.
   1. Read in this browser. The text and the file never leave the tab: nothing
      here calls fetch, and the ledger line's words name the code, not the date
      or the bill's own description.
   2. No dollar amount is read. Every line is priced from Medicare's published
      table; the amounts on the bill are masked before a code is looked for.
   3. Nothing is guessed. A code with two possible rows (the ER's hospital and
      doctor halves) waits for the person to choose; a code we do not carry is
      listed and left off, never estimated.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { usd } from '@/lib/pricing';
import {
  READ_BILL_PROMISE, readBill, linesToAdd, addBillLines, defaultPicks, ignoredSentence, timesOf, SAMPLE_BILL,
  type BillGroup, type BillMatch,
} from '@/lib/read-bill';
import { readPdfText } from '@/lib/read-pdf';
import s from './ReadBill.module.css';

const MAX_FILE = 15 * 1024 * 1024;

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

export function datesLine(g: BillGroup): string {
  if (!g.dates.length) return 'No date of service on the bill';
  const shown = g.dates.slice(0, 3).map(fmtDate).join(', ');
  const more = g.dates.length > 3 ? ` and ${g.dates.length - 3} more` : '';
  return `${g.dates.length === 1 ? 'Date of service' : `${g.dates.length} dates of service`}: ${shown}${more}`;
}

/** Plain words for the ER's two halves; the table's own label follows in brackets. */
function chooseLabel(id: string, label: string): string {
  if (id.endsWith('-facility-only')) return `The hospital's bill (${label})`;
  if (id.endsWith('-physician-only')) return `The doctor's bill (${label})`;
  if (id.endsWith('-complete')) return `One bill for both (${label})`;
  return label;
}

export type ReadState =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'message'; text: string }
  | { kind: 'read'; match: BillMatch; from: string };

export interface ReadBillViewProps {
  text: string;
  state: ReadState;
  picks: Record<string, string | null>;
  added: number | null;
  onText: (t: string) => void;
  onRead: () => void;
  onSample: () => void;
  onFile: (f: File) => void;
  onPick: (code: string, id: string | null) => void;
  onAdd: () => void;
  onClose?: () => void;
}

/** The panel as markup, driven only by its props, so a test can render every state. */
export function ReadBillView(p: ReadBillViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const m = p.state.kind === 'read' ? p.state.match : null;
  const groups = m ? [...m.matched, ...m.choose] : [];
  const ticked = m ? linesToAdd(groups, p.picks) : [];
  const ignored = m ? ignoredSentence(m.ignored) : null;

  return (
    <div className={s.panel}>
      <p className={s.promise}><span aria-hidden="true">🔒</span> {READ_BILL_PROMISE}</p>

      <label htmlFor="bill-text" className={s.lbl}>Paste the text of your bill or statement</label>
      <textarea id="bill-text" className={s.text} rows={6} value={p.text}
        onChange={(e) => p.onText(e.target.value)}
        placeholder="Select all on your bill or statement, copy, and paste it here. Codes look like 99213 or G0463." />

      <div
        className={`${s.drop}${over ? ` ${s.over}` : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) p.onFile(f); }}
      >
        <input ref={fileRef} id="bill-file" type="file" className={s.file} accept=".pdf,.txt,application/pdf,text/plain"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onFile(f); e.target.value = ''; }} />
        <label htmlFor="bill-file" className={s.fileBtn}>Choose a PDF or text file</label>
        <span className={s.dropHint}>or drop it here</span>
      </div>

      <div className={s.actions}>
        <button type="button" className="btn primary" onClick={p.onRead} disabled={!p.text.trim() || p.state.kind === 'reading'}>
          Find the codes
        </button>
        <button type="button" className="link-btn" onClick={p.onSample}>Load a sample bill (made up)</button>
        {p.onClose && <button type="button" className="link-btn" onClick={p.onClose}>Close</button>}
      </div>

      <div aria-live="polite" className={s.live}>
        {p.state.kind === 'reading' && <p className={s.note}>Reading the file in this browser...</p>}
        {p.state.kind === 'message' && <p className={s.msg}>{p.state.text}</p>}
        {m && (
          <div className={s.result}>
            <p className={s.summary}>
              {m.codes === 0
                ? 'No service codes found. Codes look like 99213 (five digits) or G0463 (a letter and four digits). If your bill has none, describe the visit in the box above instead.'
                : `Found ${m.codes} service code${m.codes === 1 ? '' : 's'} ${p.state.kind === 'read' ? p.state.from : ''}. ${groups.length} ${groups.length === 1 ? 'is' : 'are'} in Medicare's published table.`}
            </p>
            {(ignored || m.codes > 0) && (
              <p className={s.note}>
                {ignored ? `${ignored} ` : ''}We price each line from Medicare's published table, never from the amounts on your bill.
              </p>
            )}
          </div>
        )}
      </div>

      {m && groups.length > 0 && (
        <fieldset className={s.list}>
          <legend className={s.legend}>Tick what to add to your ledger</legend>
          <ul className={s.rows}>
            {groups.map((g) => {
              const choose = g.rows.length > 1;
              const id = p.picks[g.code] ?? null;
              const item = id ? g.rows.find((r) => r.id === id) ?? null : (choose ? null : g.rows[0]);
              const cb = `bill-${g.code}`;
              const times = timesOf(g);
              return (
                <li key={g.code} className={s.row}>
                  <input id={cb} type="checkbox" className={s.check} checked={Boolean(id)}
                    disabled={choose && !id}
                    aria-describedby={`${cb}-meta`}
                    onChange={(e) => p.onPick(g.code, e.target.checked ? (item?.id ?? null) : null)} />
                  <div className={s.rowBody}>
                    <label htmlFor={cb} className={s.rowLabel}>
                      <span className={s.code}>{g.code}{g.modifiers.length ? `-${g.modifiers[0]}` : ''}</span>{' '}
                      {choose ? 'Emergency room visit: which bill is this?' : g.rows[0].label}
                    </label>
                    {choose && (
                      <select className={s.select} aria-label={`Which bill code ${g.code} is on`} value={id ?? ''}
                        onChange={(e) => p.onPick(g.code, e.target.value || null)}>
                        <option value="">Choose one to add it</option>
                        {g.rows.map((r) => <option key={r.id} value={r.id}>{chooseLabel(r.id, r.label)} · {usd(r.valueUsd)}</option>)}
                      </select>
                    )}
                    <p id={`${cb}-meta`} className={s.meta}>
                      <span>{datesLine(g)}</span>
                      {g.description && <span>Your bill says: {g.description}</span>}
                      {item && <span>Medicare&apos;s published price: {item.valueUsd === null ? 'none published, left blank' : usd(item.valueUsd)}{times > 1 ? `, counted ${times} times, once per date` : ''}</span>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {m && m.notCarried.length > 0 && (
        <div className={s.miss}>
          <p className={s.missH}>Not in our table yet, so left off and not estimated:</p>
          <ul>
            {m.notCarried.map((g) => (
              <li key={g.code}><span className={s.code}>{g.code}</span>{g.description ? ` ${g.description}` : ''}</li>
            ))}
          </ul>
          <p className={s.note}>You can still describe it in the box above or search for it by name.</p>
        </div>
      )}

      {m && groups.length > 0 && (
        <div className={s.actions}>
          <button type="button" className="btn primary" onClick={p.onAdd} disabled={!ticked.length}>
            {ticked.length ? `Add ${ticked.length} line${ticked.length === 1 ? '' : 's'} to my ledger` : 'Tick a line to add it'}
          </button>
          {p.added !== null && (
            <p className={s.done} role="status">
              Added {p.added} line{p.added === 1 ? '' : 's'}. <Link href="/ledger">See what it cost</Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function messageFor(kind: 'scan' | 'locked' | 'empty' | 'not-pdf' | 'picture' | 'too-big' | 'other'): string {
  switch (kind) {
    case 'scan': return 'This PDF is a picture of the page (a scan), so there is no text in it to read. Open it, copy the lines with the codes and dates, and paste them in the box. Or describe the visits in the box above.';
    case 'locked': return 'This PDF is password-protected, so it cannot be read here. Open it, copy the lines with the codes and dates, and paste them in the box.';
    case 'empty': return 'No text was found in this PDF. Open it, copy the lines with the codes and dates, and paste them in the box.';
    case 'not-pdf': return 'That file does not open as a PDF. Try the PDF your portal gave you, or paste the text.';
    case 'picture': return 'That is a picture, and pictures cannot be read here. Paste the text of the bill instead, or describe the visits in the box above.';
    case 'too-big': return 'That file is over 15 MB. Paste the lines with the codes and dates instead.';
    default: return 'Only PDF and text files can be read here. Paste the text of the bill instead.';
  }
}

export default function ReadBill({ onClose }: { onClose?: () => void }) {
  const st = useStore();
  const [text, setText] = useState('');
  const [state, setState] = useState<ReadState>({ kind: 'idle' });
  const [picks, setPicks] = useState<Record<string, string | null>>({});
  const [added, setAdded] = useState<number | null>(null);
  /** Counts waiting for the store to mint keys for the new lines (as the Medicare import does). */
  const pending = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!pending.current.size) return;
    for (const e of st.entries) {
      const want = pending.current.get(e.raw);
      if (want === undefined) continue;
      if (e.times !== want) st.setTimes(e.key, want);
      pending.current.delete(e.raw);
    }
  }, [st]);

  const run = useCallback((t: string, from: string) => {
    const match = readBill(t);
    setState({ kind: 'read', match, from });
    setPicks(defaultPicks(match));
    setAdded(null);
  }, []);

  const onFile = useCallback(async (f: File) => {
    setAdded(null);
    const name = f.name.toLowerCase();
    if (f.size > MAX_FILE) { setState({ kind: 'message', text: messageFor('too-big') }); return; }
    if (f.type.startsWith('image/') || /\.(png|jpe?g|heic|gif|webp|tiff?)$/.test(name)) { setState({ kind: 'message', text: messageFor('picture') }); return; }
    setState({ kind: 'reading' });
    try {
      if (f.type === 'application/pdf' || name.endsWith('.pdf')) {
        const out = await readPdfText(new Uint8Array(await f.arrayBuffer()));
        if (out.kind !== 'text') { setState({ kind: 'message', text: messageFor(out.kind) }); return; }
        setText(out.text);
        run(out.text, `in your PDF (${out.pages} page${out.pages === 1 ? '' : 's'})`);
        return;
      }
      if (f.type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.csv')) {
        const t = await f.text();
        setText(t);
        run(t, 'in your file');
        return;
      }
      setState({ kind: 'message', text: messageFor('other') });
    } catch {
      setState({ kind: 'message', text: messageFor('empty') });
    }
  }, [run]);

  const onAdd = useCallback(() => {
    if (state.kind !== 'read') return;
    const lines = linesToAdd([...state.match.matched, ...state.match.choose], picks);
    if (!lines.length) return;
    const wait = addBillLines(lines, st.addItem);
    for (const [raw, n] of wait) pending.current.set(raw, n);
    setAdded(lines.length);
  }, [state, picks, st.addItem]);

  return (
    <ReadBillView
      text={text} state={state} picks={picks} added={added}
      onText={setText}
      onRead={() => run(text, 'in what you pasted')}
      onSample={() => { setText(SAMPLE_BILL); run(SAMPLE_BILL, 'on the sample bill'); }}
      onFile={(f) => void onFile(f)}
      onPick={(code, id) => setPicks((p) => ({ ...p, [code]: id }))}
      onAdd={onAdd}
      onClose={onClose}
    />
  );
}

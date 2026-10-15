'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  TEXT_FILE_MAX_CHARS, canRecogniseOnDevice, isTextFile, joinSaid, recognitionCtor,
  recognitionError, recognitionNote, type RecognitionCtor, type RecognitionLike,
} from '@/lib/speech';
import s from './SpeakInput.module.css';

/* "Upload a document instead of typing" (patient advocate, 1 October Beta demo).
   Two ways to fill the story box without typing, both writing into the SAME box,
   so the same live reader turns the words into lines:
   - Speak: the browser's own speech recognition, where it has one. The words
     beside the button say whose service hears the voice (lib/speech.ts
     recognitionNote). Waypoint never touches the audio.
   - A plain .txt file: picked, dropped on the box or pasted into it. Read in the
     browser with File.text(); nothing is uploaded and no parser is added.
   The row holds its 44 px before the page wakes, so nothing below it moves. */

const Mic = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
  </svg>
);
const FileIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" />
  </svg>
);

export default function SpeakInput({ value, onChange, target, lang = 'en-US' }: {
  value: string;
  onChange: (next: string) => void;
  /** the story box: a .txt dropped on it or pasted into it goes in as words */
  target?: RefObject<HTMLTextAreaElement | null>;
  lang?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [C, setC] = useState<RecognitionCtor | null>(null);
  const [onDevice, setOnDevice] = useState(false);
  const [listening, setListening] = useState(false);
  const [msg, setMsg] = useState('');
  const rec = useRef<RecognitionLike | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /* the latest box text, read when a voice or a file arrives */
  const latest = useRef(value);
  latest.current = value;
  const push = useRef(onChange);
  push.current = onChange;

  useEffect(() => {
    setMounted(true);
    const ctor = recognitionCtor();
    setC(() => ctor);
    if (ctor) void canRecogniseOnDevice(ctor, lang).then(setOnDevice);
    return () => { rec.current?.abort(); };
  }, [lang]);

  async function addFile(f: File) {
    if (!isTextFile(f)) { setMsg('Only a plain text (.txt) file can go in the box. For anything else, copy its words and paste them.'); return; }
    let text = '';
    try { text = await f.text(); } catch { setMsg('That file could not be read. Nothing was changed.'); return; }
    text = text.replace(/\r\n?/g, '\n').trim();
    if (!text) { setMsg(`${f.name} has no words in it. Nothing was changed.`); return; }
    if (text.length > TEXT_FILE_MAX_CHARS) { setMsg(`${f.name} is longer than the box takes (${TEXT_FILE_MAX_CHARS.toLocaleString('en-US')} characters). Paste the part about your care instead.`); return; }
    push.current(joinSaid(latest.current, text));
    setMsg(`Added the words from ${f.name}. Nothing was uploaded.`);
  }

  /* Drop and paste on the box itself: only a file is taken over; typed or pasted text is left alone. */
  useEffect(() => {
    const el = target?.current;
    if (!el) return;
    const hasFiles = (d: DataTransfer | null) => !!d && Array.from(d.types ?? []).includes('Files');
    const over = (e: DragEvent) => { if (hasFiles(e.dataTransfer)) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; } };
    const drop = (e: DragEvent) => {
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      void addFile(f);
    };
    const paste = (e: ClipboardEvent) => {
      const f = e.clipboardData?.files?.[0];
      if (!f || !isTextFile(f)) return;
      e.preventDefault();
      void addFile(f);
    };
    el.addEventListener('dragover', over);
    el.addEventListener('drop', drop);
    el.addEventListener('paste', paste);
    return () => { el.removeEventListener('dragover', over); el.removeEventListener('drop', drop); el.removeEventListener('paste', paste); };
    // addFile reads only refs and setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, mounted]);

  function speak() {
    if (listening) { rec.current?.stop(); return; }
    if (!C) return;
    const r = new C();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    if (onDevice) r.processLocally = true;
    const before = latest.current;
    r.onresult = (e) => {
      let said = '';
      for (let i = 0; i < e.results.length; i++) said += `${e.results[i][0]?.transcript ?? ''} `;
      push.current(joinSaid(before, said.replace(/\s+/g, ' ')));
    };
    r.onerror = (e) => { if (e.error !== 'aborted') setMsg(recognitionError(e.error)); };
    r.onend = () => { setListening(false); rec.current = null; };
    rec.current = r;
    try {
      r.start();
      setListening(true);
      setMsg('Listening. Say what happened, then press Stop speaking.');
    } catch {
      setMsg(recognitionError(''));
    }
  }

  return (
    <div className={s.speak}>
      {mounted && (
        <>
          <div className={s.row}>
            {C && (
              <button type="button" className={`${s.btn}${listening ? ` ${s.on}` : ''}`} onClick={speak}>
                <Mic /> {listening ? 'Stop speaking' : 'Speak instead'}
              </button>
            )}
            <button type="button" className={s.btn} onClick={() => fileRef.current?.click()}>
              <FileIcon /> Add a text file
            </button>
            <input ref={fileRef} className={s.file} type="file" accept=".txt,text/plain" tabIndex={-1} aria-hidden="true"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void addFile(f); e.target.value = ''; }} />
          </div>
          {C && <p className={s.note}>{recognitionNote(onDevice)}</p>}
          <p className={s.msg} role="status" aria-live="polite">{msg}</p>
        </>
      )}
    </div>
  );
}

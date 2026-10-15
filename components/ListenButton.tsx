'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { RATES, canSpeak, createReader, pickVoice, voicesReady, type Rate, type ReaderState } from '@/lib/speech';
import s from './ListenButton.module.css';

/* "Is there audio way… I've been flaring really badly this week, so I literally
   can't read" (patient advocate, 1 October Beta demo). One button reads the page
   aloud with the browser's own voice (lib/speech.ts). The sentences are built on
   click from the same figures the page renders, so the voice and the screen
   never differ. Rendered only after mount, and only where the browser can speak:
   a browser with no speechSynthesis never sees the control. */

const Speaker = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 10v4h3l5 4V6L7 10z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);

export default function ListenButton({ script, what = 'this ledger', className = '' }: {
  /** builds the sentences at the moment Listen is pressed, from the page's own figures */
  script: () => string[];
  /** what is read, for the labels: "this ledger", "this sheet" */
  what?: string;
  className?: string;
}) {
  const [ok, setOk] = useState(false);
  const [state, setState] = useState<ReaderState>('idle');
  const [rate, setRate] = useState<Rate>('normal');
  const [at, setAt] = useState<[number, number] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const reader = useRef<ReturnType<typeof createReader> | null>(null);
  const noteId = useId();

  useEffect(() => {
    setOk(canSpeak());
    /* Leaving the page stops the voice; it never reads a page that is gone. */
    return () => { reader.current?.stop(); };
  }, []);

  if (!ok) return null;

  async function start() {
    const synth = window.speechSynthesis;
    const voice = pickVoice(await voicesReady(synth));
    if (voice === null) {
      setNote('This browser offers only online voices, so Listen stays off here: Waypoint does not send your ledger anywhere.');
      return;
    }
    setNote(null);
    reader.current?.stop();
    reader.current = createReader({
      synth: synth as never,
      makeUtterance: (t) => new SpeechSynthesisUtterance(t) as never,
      sentences: script(),
      rate: RATES[rate],
      voice,
      onState: (st) => { setState(st); if (st === 'idle') setAt(null); },
      onIndex: (i, of) => setAt([i + 1, of]),
    });
    reader.current.play();
  }

  const active = state !== 'idle';
  function toggle() {
    if (active) reader.current?.stop();
    else void start();
  }
  function slower() {
    const next: Rate = rate === 'slower' ? 'normal' : 'slower';
    setRate(next);
    reader.current?.setRate(RATES[next]);
  }

  return (
    <div className={`${s.listen} no-print ${className}`} role="group" aria-label={`Listen to ${what}`}>
      <button type="button" className={s.main} aria-pressed={active} onClick={toggle} aria-describedby={noteId}>
        <Speaker /> Listen
      </button>
      {active && (
        <>
          <button type="button" className={s.ctl} onClick={() => (state === 'paused' ? reader.current?.resume() : reader.current?.pause())}>
            {state === 'paused' ? 'Resume' : 'Pause'}
          </button>
          <button type="button" className={s.ctl} onClick={() => reader.current?.stop()}>Stop</button>
        </>
      )}
      <button type="button" className={s.ctl} aria-pressed={rate === 'slower'} onClick={slower}>Slower</button>
      <span className={s.note} id={noteId}>
        {note ?? (at ? `Reading ${at[0]} of ${at[1]}` : `Reads ${what} aloud in this browser's own voice`)}
      </span>
    </div>
  );
}

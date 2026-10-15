/* FINAL-1011 listen: the voice says the screen's numbers, never others.
   "Is there audio way… I've been flaring really badly this week, so I literally
   can't read" (patient advocate, 1 October Beta demo). Listen reads the ledger
   from lib/speech.ts ledgerScript; this file prices the home page's example the
   way components/Ledger.tsx does, renders the total card the ledger renders
   (components/TotalReveal), and holds the spoken script to the same figures. */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { exampleEntries, EXAMPLE_UNPRICED } from '../components/sheet/example';
import TotalReveal from '../components/TotalReveal';
import { priceJourney, totals, usd } from '../lib/pricing';
import { fitOf, totalLabels, type Ctx } from '../lib/fit';
import { UNPRICEABLE } from '../lib/store';
import { gapSummary, monthsPhrase } from '../lib/sheet';
import { TABLE_VERSION } from '../lib/table';
import {
  createReader, dollarYearOf, isTextFile, joinSaid, ledgerScript, pickVoice, recognitionCtor,
  recognitionNote, speakable, spokenLineOf, yearPhrase,
} from '../lib/speech';

function priced(ctx: Ctx) {
  const entries = exampleEntries();
  const fits = new Map(entries.filter((e) => e.item).map((e) => [e.key, fitOf(e.item!, ctx)]));
  const lines = priceJourney(entries, (e) => (e.item ? fits.get(e.key)?.figureUsd ?? null : undefined));
  const sum = totals(lines);
  const gaps = gapSummary(entries, EXAMPLE_UNPRICED.map((id) => UNPRICEABLE.find((u) => u.id === id)?.label).filter((x): x is string => !!x));
  const script = ledgerScript({
    label: 'Published figures for this pattern of care',
    totalUsd: sum.totalUsd, basis: totalLabels(ctx).primary, pricedCount: sum.pricedCount,
    lines: lines.map((l) => spokenLineOf(l, fits.get(l.entry.key))),
    searchingFor: gaps.months > 0 ? monthsPhrase(gaps.months) : null,
    namedUnpriced: gaps.named, agencies: ['CMS'], tableVersion: TABLE_VERSION,
  });
  return { entries, fits, lines, sum, gaps, script, text: script.join(' ') };
}

describe('Listen: the spoken ledger carries the rendered ledger’s numbers', () => {
  const { lines, sum, gaps, script, text } = priced({});

  it('the spoken total is the figure the total card renders', () => {
    const html = renderToStaticMarkup(createElement(TotalReveal, { totalUsd: sum.totalUsd, pricedCount: sum.pricedCount, tableVersion: TABLE_VERSION, label: 'Published figures for this pattern of care' }));
    const rendered = html.match(/class="big-num"[^>]*>([^<]+)</)?.[1];
    expect(rendered).toBe(usd(sum.totalUsd));
    expect(sum.totalUsd).toBeGreaterThan(0);
    expect(script[0]).toContain(`Published figures for this pattern of care: ${rendered}`);
  });

  it('the total says its dollar year, read off the priced rows', () => {
    const years = new Set(lines.filter((l) => l.priced).map((l) => dollarYearOf(l)));
    expect([...years].every((y) => /^\d{4}$/.test(y ?? ''))).toBe(true);
    expect(script[0]).toContain(yearPhrase([...years]));
    expect(script[0]).toMatch(/in \d{4} dollars|each in its own year/);
  });

  it('every priced line is said with its own Line total, to the cent, as the table shows it', () => {
    const pricedLines = lines.filter((l) => l.priced);
    expect(pricedLines.length).toBe(sum.pricedCount);
    for (const l of pricedLines) expect(text).toContain(`${l.entry.item!.label}`), expect(text).toContain(usd(l.totalUsd, true));
  });

  it('no dollar figure is spoken that the page does not show', () => {
    const shown = new Set<string>([usd(sum.totalUsd)]);
    for (const l of lines.filter((x) => x.priced)) { shown.add(usd(l.totalUsd, true)); shown.add(usd(l.entry.item ? (priced({}).fits.get(l.entry.key)?.figureUsd ?? null) : null, true)); }
    const said = text.match(/\$\d{1,3}(?:,\d{3})*(?:\.\d\d)?/g) ?? [];
    expect(said.length).toBeGreaterThan(0);
    for (const d of said) expect(shown.has(d)).toBe(true);
  });

  it('what was counted and never priced is said, and where the figures come from', () => {
    expect(gaps.named.length).toBeGreaterThan(0);
    for (const n of gaps.named) expect(text.toLowerCase()).toContain(n.toLowerCase());
    expect(text).toContain('Named, and left blank, never guessed');
    expect(ledgerScript({ label: 'x', totalUsd: 1, pricedCount: 1, lines: [], searchingFor: '4 years' }).join(' ')).toContain('Counted, never priced: time spent searching, 4 years.');
    expect(script[script.length - 1]).toMatch(/^Where the figures come from: every figure is read from a published U\.S\. federal file/);
    expect(script[script.length - 1]).toContain(`Price table ${TABLE_VERSION}`);
  });

  it('an uninsured ledger says the charge year, CY2024, not the row’s 2026', () => {
    const u = priced({ coverage: 'uninsured' });
    const charged = u.lines.filter((l) => l.priced && u.fits.get(l.entry.key)?.which === 'charge');
    expect(charged.length).toBeGreaterThan(0);
    {
      expect(dollarYearOf(charged[0], u.fits.get(charged[0].entry.key))).toBe('2024');
      expect(u.script[0]).toContain(usd(u.sum.totalUsd));
    }
  });

  it('a suppressed total is never spoken; the headline is said instead', () => {
    const s = ledgerScript({ label: 'x', totalUsd: 1234, pricedCount: 0, lines: [], suppressed: { headline: 'No federal figure describes your coverage', floorUsd: 500, ceilingUsd: null } });
    expect(s.join(' ')).not.toContain('$1,234');
    expect(s[0]).toBe('No federal figure describes your coverage.');
    expect(s[1]).toContain('$500');
  });

  it('two lines with the same unit name are told apart by her own words', () => {
    const firsts = script.filter((x) => x.startsWith('First visit with a new specialist'));
    expect(firsts.length).toBe(2);
    expect(firsts[0]).not.toBe(firsts[1]);
    for (const f of firsts) expect(f).toMatch(/where you said "/);
  });

  it('reads cleanly aloud: no middle dots or dashes left in the script', () => {
    expect(speakable('2 years searching · 2 clinicians named')).toBe('2 years searching, 2 clinicians named');
    for (const s of script) expect(s).not.toMatch(/[·\u2013]/);
  });
});

describe('Listen: the reader', () => {
  function fake() {
    const spoken: string[] = [];
    let cur: { onend: (() => void) | null; onerror: ((e?: unknown) => void) | null; rate: number } | null = null;
    const synth = {
      speak(u: never) { cur = u; spoken.push((u as { text: string }).text); },
      cancel() { const c = cur; cur = null; c?.onerror?.({ error: 'interrupted' }); },
      end() { const c = cur; cur = null; c?.onend?.(); },
      get rate() { return cur?.rate; },
    };
    const makeUtterance = (text: string) => ({ text, rate: 1, lang: '', voice: null, onend: null, onerror: null }) as never;
    return { synth, makeUtterance, spoken };
  }

  it('speaks one sentence at a time, in order, then goes idle', () => {
    const f = fake(); const states: string[] = [];
    const r = createReader({ synth: f.synth, makeUtterance: f.makeUtterance, sentences: ['a', 'b', 'c'], onState: (s) => states.push(s) });
    r.play(); f.synth.end(); f.synth.end(); f.synth.end();
    expect(f.spoken).toEqual(['a', 'b', 'c']);
    expect(r.state).toBe('idle');
    expect(states).toEqual(['playing', 'idle']);
  });

  it('pause keeps the place and resume says that sentence again; stop goes back to the start', () => {
    const f = fake();
    const r = createReader({ synth: f.synth, makeUtterance: f.makeUtterance, sentences: ['a', 'b', 'c'] });
    r.play(); f.synth.end();
    r.pause();
    expect(r.state).toBe('paused');
    expect(f.spoken).toEqual(['a', 'b']);
    r.resume();
    expect(f.spoken).toEqual(['a', 'b', 'b']);
    r.stop();
    expect(r.state).toBe('idle');
    expect(r.index).toBe(0);
  });

  it('slower re-says the current sentence at the slower rate', () => {
    const f = fake();
    const r = createReader({ synth: f.synth, makeUtterance: f.makeUtterance, sentences: ['a', 'b'], rate: 1 });
    r.play(); r.setRate(0.8);
    expect(f.spoken).toEqual(['a', 'a']);
    expect(f.synth.rate).toBe(0.8);
  });

  it('only a voice built into the device is used; remote-only means no voice', () => {
    const v = (name: string, lang: string, localService: boolean, d = false) => ({ name, lang, localService, default: d });
    expect(pickVoice([v('Google US English', 'en-US', false, true), v('Samantha', 'en-US', true)])?.name).toBe('Samantha');
    expect(pickVoice([v('Google US English', 'en-US', false)])).toBeNull();
    expect(pickVoice([])).toBeUndefined();
  });
});

describe('Speak and a text file fill the same box', () => {
  it('dictation is added after what was typed', () => {
    expect(joinSaid('saw my doctor twice', ' then an MRI ')).toBe('saw my doctor twice then an MRI');
    expect(joinSaid('', 'saw a neurologist')).toBe('saw a neurologist');
    expect(joinSaid('typed', '   ')).toBe('typed');
  });
  it('finds the standard or the webkit recognition, and none where there is none', () => {
    class A {} class B {}
    expect(recognitionCtor({ SpeechRecognition: A, webkitSpeechRecognition: B })).toBe(A);
    expect(recognitionCtor({ webkitSpeechRecognition: B })).toBe(B);
    expect(recognitionCtor({})).toBeNull();
  });
  it('the note names who hears the voice, and that Waypoint records nothing', () => {
    expect(recognitionNote(false)).toMatch(/Chrome the audio goes to Google/);
    expect(recognitionNote(false)).toMatch(/Waypoint records nothing/);
    expect(recognitionNote(true)).toMatch(/on this device/);
  });
  it('only plain text files go in', () => {
    expect(isTextFile({ name: 'notes.txt', type: '' })).toBe(true);
    expect(isTextFile({ name: 'x', type: 'text/plain' })).toBe(true);
    expect(isTextFile({ name: 'visit.pdf', type: 'application/pdf' })).toBe(false);
  });
});

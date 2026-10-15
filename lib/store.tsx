'use client';
/* The journey store. One journey per browser, persisted locally; shareable as a
   link that carries only unit ids and counts. Nothing here prices anything. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { JourneyEntry, PriceItem } from './types';
import { TABLE, SELECTABLE } from './table';
import { extractCount, mapUtterance, parseJourney, workdaysSaid } from './mapper';
import { noteWorkdaysSaid } from './workdays-said';
import type { ParsedSegment } from './mapper';
import { applyLateRead, lateReadToast } from './late-read';
import { unpriceableFor } from './price-api';
import { post as outboxPost, startOutbox, queuedCorrections, queuedVerdicts, onOutboxChange } from './outbox';
import type { Coverage, Ctx, GapHint } from './fit';
import { gapHintOf, localityOf } from './fit';
import unpriceableData from '@/data/unpriceable.json';
import { gapLabel, SHARED_NO_FIGURE } from './sheet';
import { paidFieldsIn, paidFieldsOut, withPaid, cleanPaid } from './paid';
import { PATIENT_OPTIONS, patientFromWords, relationFromWords, type Patient, type PatientStratum } from './patient';

export const ITEMS = SELECTABLE;
export const UNPRICEABLE = unpriceableData.items as {
  id: string; label: string; synonyms: string[]; whyUnpriced: string; whatWouldFixIt: string;
}[];

const KEY = 'waypoint-ledger.journey.v2';
const LEGACY = 'waypoint-ledger.journey.v1';
/* Who you are and where you live. Held beside the journey, in this browser only,
   and never sent with a correction, a share link or a saved ledger. */
const CTX_KEY = 'waypoint-ledger.ctx.v1';
const PATIENT_KEY = 'waypoint-ledger.patient.v1';
/* A random id this browser makes for itself so the count can refuse the same
   person answering the same figure twice. The server never stores it: it stores
   a truncated hash of (id + that price row + that table version), which cannot
   be joined across rows, and it is sent with nothing else. */
const SUBMITTER_KEY = 'waypoint-ledger.submitter.v1';
function submitterId(): string {
  try {
    const had = localStorage.getItem(SUBMITTER_KEY);
    if (had) return had;
    const made = crypto.randomUUID();
    localStorage.setItem(SUBMITTER_KEY, made);
    return made;
  } catch { return ''; }
}

/* ==========================================================================
   THE STORY THE PERSON TYPED SURVIVES BACK AND A HARD REFRESH.

   R6 edge #14: "/ledger -> browser Back -> /journey: the textarea is empty."
   The mapped lines survived (localStorage, above); the sentence they wrote did
   not, so they could not edit it — they had to retype it. It is held for this
   TAB only, so closing the tab leaves nothing behind, and it is cleared the
   moment it becomes lines (Add) or the person clears the journey (Start over).
   ========================================================================== */
export const STORY_DRAFT_KEY = 'waypoint.story';
export const STORY_MAX = 2000;

export function readStoryDraft(): string {
  try { return sessionStorage.getItem(STORY_DRAFT_KEY) ?? ''; } catch { return ''; }
}
export function saveStoryDraft(text: string) {
  try { if (text) sessionStorage.setItem(STORY_DRAFT_KEY, text); else sessionStorage.removeItem(STORY_DRAFT_KEY); } catch { /* private mode */ }
}
export function clearStoryDraft() { saveStoryDraft(''); }

/* ==========================================================================
   🔴 A ONCE-A-YEAR CODE IS NEVER MULTIPLIED (R6 data F5).

   "Yearly depression screening at a visit x 6 = $112" is a figure Medicare
   cannot allow in one year, and the line's own label says Yearly. The table
   carries the fact — a row that CMS pays once in a 12-month period — and this
   reads it: `perYear: true` (or `max_per_year: 1`) on the row.

   The field is the figures lane's to add from the CY2024 file. Until it lands,
   PER_YEAR is empty and this guard is inert BY CONSTRUCTION: it never invents
   a frequency rule of its own, because a frequency rule is a fact about a
   federal file, not a guess we may make here. When lib/pricing.ts exports
   clampTimes(item, times), this becomes a call to it and nothing else changes.
   ========================================================================== */
type AnnualHint = PriceItem & { perYear?: boolean; max_per_year?: number };
const PER_YEAR: Set<string> = new Set(
  (TABLE as AnnualHint[]).filter((i) => i.perYear === true || i.max_per_year === 1).map((i) => i.id),
);
export const isPerYear = (id?: string | null): boolean => Boolean(id && PER_YEAR.has(id));

/** The count that may be priced, and how many of the person's own count it
 *  could not price. Never more than once a year for a once-a-year row. */
export function clampPerYear(item: PriceItem | null | undefined, times: number): { times: number; capped: number } {
  const t = Math.max(1, Math.min(365, Math.floor(times) || 1));
  if (!item || !PER_YEAR.has(item.id) || t <= 1) return { times: t, capped: 0 };
  return { times: 1, capped: t - 1 };
}
const perYearNote = (item: PriceItem, said: number) =>
  `${item.label} is paid once in a 12-month period, so it is priced once. You said ${said}.`;

/** A phrase the mapper refused to price, and the counter it belongs in. Held on
 *  the journey so the ledger can render it and /gap can open already filled —
 *  one derivation, read by both, so the two can never disagree. */
export interface JourneyGapHint extends GapHint { key: string; raw: string; times: number }

/* `reason` is the reader's own sentence for a line it left unpriced by name
   ("worn longer than 48 hours…"), kept so the ledger can say it, not a generic
   "no match". Local only: a share link and a saved ledger never carry it. */
/* `paid` (and `paidEach`) is what the person says they actually paid for a
   line (round 5, lib/paid.ts). It is kept WITH THE LINE in this browser, shown
   beside the federal figure and never added to it, goes to the server only
   inside a journey the person chooses to save, and is never carried by a share
   link. */
export interface SavedEntry { raw: string; itemId: string | null; times: number; gapCategory?: string | null; months?: number | null; reason?: string | null; paid?: number; paidEach?: true }
/* `paid` at the top level is the round-4 shape (price id -> amount), read once
   and moved onto the line it belongs to. */
interface Saved { v: 2; savedAt: string; entries: SavedEntry[]; unpriced: string[]; flags: Record<string, 'right' | 'wrong'>; paid?: Record<string, number>; example?: LedgerExampleId }

/** A toast may carry one action ("Undo"); it then stays up long enough to reach (10 s). */
export type ToastAction = { label: string; run: () => void };
export type Toast = { id: number; text: string; kind: 'ok' | 'warn' | 'info'; action?: ToastAction };
/** What Start over and Remove take away, kept so Undo can put it back exactly. */
export interface LedgerSnapshot { entries: JourneyEntry[]; unpricedHits: string[]; flags: Record<string, 'right' | 'wrong'> }
export interface Tally { confirmedRight: number; flaggedWrong: number; n: number }

interface Store {
  entries: JourneyEntry[];
  ctx: Ctx;
  setCoverage: (c: Coverage | undefined) => void;
  setLocality: (localityKey: string | undefined) => void;
  unpricedHits: string[];
  /** care that did not happen, and lengths of time — counted, never priced */
  gapHints: JourneyGapHint[];
  flags: Record<string, 'right' | 'wrong'>;
  /** Sets (or, with null, clears) what the person paid for one line. `each`: the amount is for one of the times. */
  setPaid: (key: string, usd: number | null, each?: boolean) => void;
  sentOk: Record<string, boolean>;
  /** what the public has said about each figure, returned by the count itself */
  tallies: Record<string, Tally>;
  /** figures whose answer is on this device waiting for a connection */
  queued: Record<string, boolean>;
  hydrated: boolean;
  toasts: Toast[];
  toast: (text: string, kind?: Toast['kind'], action?: ToastAction) => void;
  dismissToast: (id: number) => void;
  /** The ledger as it stands, for an Undo. */
  snapshot: () => LedgerSnapshot;
  /** Puts back a snapshot taken before Start over or Remove. */
  restore: (s: LedgerSnapshot) => void;
  addStory: (story: string) => { added: number; matched: number; unpriced: number; merged: number };
  addSegments: (segs: ParsedSegment[], story?: string) => { added: number; matched: number; unpriced: number; merged: number };
  /** flow3-1: an AI read that landed after Add fills the blank lines it priced (lib/late-read.ts). */
  applyRead: (segs: ParsedSegment[]) => number;
  /** judge panel #9: whose illness this is, read from her words or chosen by her (lib/patient.ts). */
  patient: Patient | null;
  setPatient: (stratum: PatientStratum | null) => void;
  addOne: (text: string) => void;
  addItem: (it: PriceItem, raw?: string) => void;
  setTimes: (key: string, times: number) => void;
  remove: (key: string) => void;
  remap: (key: string, itemId: string | null) => void;
  reset: () => void;
  loadExample: () => void;
  /** The example on the ledger ('home' from "See it done with an example", or ?example=lyme), so a page can label it "an example we wrote"; null for a person's own lines. */
  example: LedgerExampleId | null;
  correct: (item: PriceItem, verdict: 'right' | 'wrong', believedValueUsd?: number | null, note?: string, lineKey?: string) => Promise<boolean>;
  clearFlag: (id: string) => void;
  shareUrl: () => string;
  saveJourney: (title?: string) => Promise<SaveResult>;
  saving: boolean;
  /** A saved link was opened while this browser held a different ledger of its
   *  own. Nothing is replaced until the person chooses (auth S3). */
  pendingLink: PendingLink | null;
  openPendingLink: () => void;
  keepLocalLedger: () => void;
}

export interface PendingLink { lines: number; mine: number }

/** Two journeys are the same when every line says the same words, maps to the same unit and counts the same. */
export function sameJourney(a: SavedEntry[], b: SavedEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => String(x.raw ?? '') === String(b[i].raw ?? '') && (x.itemId ?? null) === (b[i].itemId ?? null) && Number(x.times) === Number(b[i].times));
}

/** One saved row back into a ledger line (this browser's own copy). */
function loadSavedRows(rows: SavedEntry[]): JourneyEntry[] {
  return rows.slice(0, 200).map((e) => ({
    key: uid(), raw: String(e.raw ?? '').slice(0, 200),
    times: Math.max(1, Math.min(365, Number(e.times) || 1)),
    item: e.itemId ? TABLE.find((t) => t.id === e.itemId) ?? null : null,
    gapCategory: typeof e.gapCategory === 'string' ? e.gapCategory : null,
    months: typeof e.months === 'number' && Number.isFinite(e.months) ? e.months : null,
    ...(typeof e.reason === 'string' && e.reason ? { reason: e.reason.slice(0, 400) } : {}),
    ...paidFieldsIn(e),
  }) as JourneyEntry);
}

/** The saved copy's lines, with the round-4 paid-by-price-id shape moved onto
 *  the first line of that unit that has none, as the amount for one time (the
 *  Wrong box asks about one figure). */
function rowsOfSaved(st: Saved): JourneyEntry[] {
  let rows = loadSavedRows(st.entries ?? []);
  if (st.paid && typeof st.paid === 'object') {
    for (const [id, v] of Object.entries(st.paid)) {
      const usd = cleanPaid(v);
      const line = usd === null ? undefined : rows.find((e) => e.item?.id === id && typeof e.paid !== 'number');
      if (line && usd !== null) rows = withPaid(rows, line.key, usd, true);
    }
  }
  return rows;
}

/** What a saved copy says, without the moment it was written: two tabs that
 *  hold the same ledger write the same body, so neither writes it back. */
function savedBody(st: Pick<Saved, 'entries' | 'unpriced' | 'flags' | 'example'> | null): string {
  return st ? JSON.stringify([st.entries ?? [], st.unpriced ?? [], st.flags ?? {}, st.example ?? null]) : '';
}

/** patient2-4: keep the keys of lines that did not change, so an open Wrong box
 *  or a stepper in this tab is not reset by another tab's edit. */
export function keepKeys(prev: readonly JourneyEntry[], next: JourneyEntry[]): JourneyEntry[] {
  const pool = new Map<string, string[]>();
  for (const e of prev) {
    const sig = `${e.raw}|${e.item?.id ?? ''}`;
    pool.set(sig, [...(pool.get(sig) ?? []), e.key]);
  }
  return next.map((e) => {
    const list = pool.get(`${e.raw}|${e.item?.id ?? ''}`);
    const key = list?.shift();
    return key ? { ...e, key } : e;
  });
}

/* 🔴 A SAVED LINK CARRIES EVERY LINE, NOT ONLY THE PRICED ONES (auth S5).
   The server has always accepted a line with the person's words and no unit
   (lib/price-api.ts validateJourney). Only priced lines used to be sent, so the
   same ledger reopened on another device lost its blanks and then said "Every
   line carries a published federal figure". Now every line goes, and a real
   cost we will not price (lost work, travel) goes as its own name with no unit;
   on the way back in it is recognised by that name and lands in the same place. */
export function savedRowsOf(entries: JourneyEntry[], unpricedHits: string[]): { rows: { raw: string; itemId: string | null; times: number; paid?: number; paidEach?: true }[]; omitted: number } {
  const all = [
    ...entries.filter((e) => e.item || e.raw.trim()).map((e) => ({ raw: e.raw.trim().slice(0, 200), itemId: e.item?.id ?? null, times: Math.max(1, Math.min(365, e.times)), ...paidFieldsOut(e) })),
    ...unpricedHits.map((id) => UNPRICEABLE.find((u) => u.id === id)).filter((u): u is (typeof UNPRICEABLE)[number] => Boolean(u))
      .map((u) => ({ raw: u.label.slice(0, 200), itemId: null, times: 1 })),
  ];
  return { rows: all.slice(0, 60), omitted: Math.max(0, all.length - 60) };
}

/** A saved journey read back: lines, and the named costs we will not price. */
export function splitSaved(rows: SavedEntry[]): { lines: SavedEntry[]; unpriced: string[] } {
  const lines: SavedEntry[] = []; const unpriced: string[] = [];
  for (const r of rows) {
    const hit = !r.itemId && typeof r.raw === 'string' ? unpriceableFor(r.raw, UNPRICEABLE) : undefined;
    if (hit) { if (!unpriced.includes(hit.id)) unpriced.push(hit.id); continue; }
    lines.push(r);
  }
  return { lines, unpriced };
}

export interface SaveResult { ok: boolean; url?: string; slug?: string; omitted?: number; error?: string; deleteToken?: string; expiresAt?: string | null }

const Ctx = createContext<Store | null>(null);
/** The context itself, exported so a test can render a page against a store it built. */
export const StoreContext = Ctx;
export type { Store };

function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

/* ==========================================================================
   🔴 A SHARE LINK CARRIES NO WORDS (R3 c1 C1, clinician C03).
   The toast promised "only the units and counts, no names" while the link held
   every sentence the person typed, verbatim: a doctor's name, a hospital, a
   diagnosis, all riding in a URL. A share link now carries, per line, only the
   unit id, the count, the counter a line belongs in (refused, not sought, put
   off, cancelled, time spent searching) and a length of time in months. Never
   raw text. Named costs we will not price go as their own ids. The ledger that
   opens it shows the unit labels, and names a line without a figure as such.
   Old links (an array of [words, id, times]) still open.
   ========================================================================== */
export const SHARE_VERSION = 2;
export type ShareRow = [itemId: string | null, times: number, gapCategory: string | null, months: number | null];
export interface SharePayload { v: 2; e: ShareRow[]; u: string[] }

/** The words a line opened from a share link is shown with. Never the sender's words. */
export { SHARED_NO_FIGURE };
export function sharedRaw(item: PriceItem | null, gapCategory: string | null): string {
  if (item) return '';
  if (gapCategory) { const l = gapLabel(gapCategory); return l.charAt(0).toUpperCase() + l.slice(1); }
  return SHARED_NO_FIGURE;
}

export function sharePayload(entries: readonly JourneyEntry[], unpricedHits: readonly string[] = []): SharePayload {
  return {
    v: 2,
    e: entries.map((e) => [
      e.item?.id ?? null,
      Math.max(1, Math.min(365, Math.floor(e.times) || 1)),
      typeof e.gapCategory === 'string' && e.gapCategory ? e.gapCategory : null,
      typeof e.months === 'number' && Number.isFinite(e.months) && e.months > 0 ? Math.floor(e.months) : null,
    ]),
    u: unpricedHits.filter((id) => UNPRICEABLE.some((x) => x.id === id)),
  };
}

export function encodeShare(entries: readonly JourneyEntry[], unpricedHits: readonly string[] = []): string {
  const json = JSON.stringify(sharePayload(entries, unpricedHits));
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(s: string): { entries: JourneyEntry[]; unpriced: string[] } | null {
  try {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b + '='.repeat((4 - (b.length % 4)) % 4))));
    const parsed = JSON.parse(json) as unknown;
    const times = (n: unknown) => Math.max(1, Math.min(365, Number(n) || 1));
    const find = (id: unknown) => (typeof id === 'string' && id ? TABLE.find((t) => t.id === id) ?? null : null);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as SharePayload).v === 2) {
      const p = parsed as SharePayload;
      const rows = Array.isArray(p.e) ? p.e.slice(0, 200) : [];
      const entries = rows.filter(Array.isArray).map(([id, t, gap, months]) => {
        const item = find(id);
        const gapCategory = !item && typeof gap === 'string' && /^[a-z-]{1,40}$/.test(gap) ? gap : null;
        const m = typeof months === 'number' && Number.isFinite(months) && months > 0 ? Math.min(1200, Math.floor(months)) : null;
        return { key: uid(), raw: sharedRaw(item, gapCategory), item, times: times(t), gapCategory, months: m } as JourneyEntry;
      });
      const unpriced = Array.isArray(p.u) ? p.u.filter((id): id is string => typeof id === 'string' && UNPRICEABLE.some((x) => x.id === id)) : [];
      return { entries, unpriced };
    }
    /* a link made before round 4: [words, id, times] per line */
    if (!Array.isArray(parsed)) return null;
    const entries = (parsed as [unknown, unknown, unknown][]).slice(0, 200).filter(Array.isArray).map(([raw, id, t]) => ({
      key: uid(), raw: String(raw ?? '').slice(0, 200), times: times(t), item: find(id),
    }));
    return { entries, unpriced: [] };
  } catch { return null; }
}

/* ==========================================================================
   🔴 TELLING IT AGAIN DOES NOT DOUBLE IT (FLOW patient-8).

   Adding from home appended: "First visit with a new specialist" twice and
   "MRI of the brain" twice, as separate rows, and her total rose without a
   word. A priced line whose unit is ALREADY on the ledger now joins that line:
   the count rises, her new words are kept beside the old ones, and the toast
   says so. Lines in the same batch are never joined (she told them apart),
   nor is a line that carries an amount she paid (that amount was for the
   count it had), nor a line with no unit.
   ========================================================================== */
export interface MergeNote { label: string; added: number; now: number }
export function mergeEntries(prev: readonly JourneyEntry[], add: readonly JourneyEntry[]): { entries: JourneyEntry[]; merged: MergeNote[] } {
  const out = prev.slice();
  const merged: MergeNote[] = [];
  const fresh: JourneyEntry[] = [];
  for (const a of add) {
    const at = a.item ? out.findIndex((e, i) => i < prev.length && e.item?.id === a.item!.id && typeof e.paid !== 'number') : -1;
    if (at < 0) { fresh.push(a); continue; }
    const e = out[at];
    const now = clampPerYear(e.item, e.times + a.times).times;
    const said = e.raw.trim();
    const more = a.raw.trim();
    const raw = !more || said.toLowerCase().includes(more.toLowerCase()) ? said : `${said}; ${more}`.slice(0, 200);
    out[at] = { ...e, raw, times: now };
    merged.push({ label: e.item!.label, added: now - e.times, now });
  }
  return { entries: [...out, ...fresh], merged };
}
export function mergeToast(merged: readonly MergeNote[]): string | null {
  if (!merged.length) return null;
  const one = (m: MergeNote) => `${m.added ? `added ${m.added} to` : 'already on'} ${m.label} (now ${m.now})`;
  const text = merged.slice(0, 3).map(one).join('; ');
  const rest = merged.length > 3 ? `; and ${merged.length - 3} more` : '';
  return `Joined to lines already on your ledger, not doubled: ${text}${rest}.`;
}

/** Missed work said with a number of days goes to the workdays card (lib/burdens.ts). */
function noteWork(raw: string, unId: string) {
  if (unId !== 'lost-work') return;
  const w = workdaysSaid(raw);
  if (w) noteWorkdaysSaid({ raw: raw.trim(), days: w.days, note: w.note });
}

/* ==========================================================================
   🔴 THE WORKED EXAMPLE IS READ BY THE READER (round 2 judge: the example
   priced "the neurologist" at 99205 and "blood work each visit" as a
   metabolic panel ×6, while the reader gives 99204 and a blood count for the
   same words). The example is now one story, read by the same parseJourney a
   person's sentence goes through, so the two can never disagree again. The
   counts are said in the words ("six times", "twice"), so the reader reads
   them. tests/mapper.test.ts pins the result.
   ========================================================================== */
export const EXAMPLE_LEDGER_STORY =
  'saw my regular doctor about the fatigue six times; a first visit with a cardiologist; an echocardiogram; wore a heart monitor; a tilt-table test; blood work six times; went to the ER twice when my heart was racing; an MRI of my brain; the neurologist';
export function exampleLedger(): JourneyEntry[] {
  return parseJourney(EXAMPLE_LEDGER_STORY, ITEMS).filter((s) => !s.absorbed).map((s) => ({ key: uid(), raw: s.raw, item: s.result.item, times: s.times }) as JourneyEntry);
}

/* ==========================================================================
   A SECOND COMPOSED EXAMPLE, BY LINK: /ledger?example=lyme (FINAL-1011 lyme).
   The sentence is the one /conditions prices beside the published Lyme figure
   (data/conditions.json, lyme.example_journey.sentence); tests/lyme-example.test.ts
   fails if the two ever differ, so the ledger and /conditions price one journey.
   It is kept here as a string so the conditions file stays out of the shared
   first-load chunk. Written by us, not anyone's record, and said so when it
   loads. Lyme is one condition among many, never the focus. It never replaces
   lines a person already has: those stay, and the toast says so.
   ========================================================================== */
export const COMPOSED_EXAMPLES = {
  lyme: {
    story: 'found a tick bite and a rash, saw my regular doctor, they did the Lyme blood test and the Western blot, then went back to my doctor, and took doxycycline for three weeks',
    loaded: 'An example we wrote, not anyone\u2019s record: a Lyme disease journey, read by the same reader and priced line by line. Start over to clear it.',
  },
} as const;
export type ComposedExampleId = keyof typeof COMPOSED_EXAMPLES;
/* judge panel 15 Oct #2.2: the home example ("See it done with an example") is an
   example too, labelled on the ledger, and the first words a person types replace it. */
export type LedgerExampleId = ComposedExampleId | 'home';
export const isExampleId = (v: unknown): v is LedgerExampleId => v === 'home' || (typeof v === 'string' && Object.prototype.hasOwnProperty.call(COMPOSED_EXAMPLES, v));
/** What a typed story is added to: the person's own lines, or nothing while an example shows. */
export function storyBase(example: LedgerExampleId | null, entries: JourneyEntry[]): JourneyEntry[] {
  return example === null ? entries : [];
}

/** The composed example a URL asks for (?example=lyme), or null. Anything else is ignored. */
export function composedExampleIn(search: string): ComposedExampleId | null {
  try {
    const v = new URLSearchParams(search).get('example');
    return v && Object.prototype.hasOwnProperty.call(COMPOSED_EXAMPLES, v) ? (v as ComposedExampleId) : null;
  } catch { return null; }
}

/** The composed example as ledger lines, read by the reader a person's sentence goes through. */
export function composedExampleLedger(id: ComposedExampleId): JourneyEntry[] {
  return parseJourney(COMPOSED_EXAMPLES[id].story, ITEMS).filter((s) => !s.absorbed).map((s) => ({ key: uid(), raw: s.raw, item: s.result.item, times: s.times }) as JourneyEntry);
}

/** The reader's sentence for an unpriced line, when it left one. */
export const reasonOf = (e: JourneyEntry): string | null => {
  const r = (e as JourneyEntry & { reason?: unknown }).reason;
  return typeof r === 'string' && r ? r : null;
};

/** One definition, in lib/price-api.ts, used by the pages and by the API. */
export const unpriceableHit = (text: string) => unpriceableFor(text, UNPRICEABLE);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<JourneyEntry[]>([]);
  const [unpricedHits, setUnpriced] = useState<string[]>([]);
  const [flags, setFlags] = useState<Record<string, 'right' | 'wrong'>>({});
  const [sentOk, setSentOk] = useState<Record<string, boolean>>({});
  const [tallies, setTallies] = useState<Record<string, Tally>>({});
  const [queued, setQueued] = useState<Record<string, boolean>>({});
  const [ctx, setCtx] = useState<Ctx>({});
  const [patient, setPatientState] = useState<Patient | null>(null);
  /* judge panel #9: read once from this device; a choice she made is never
     overwritten by what a later sentence seems to say. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PATIENT_KEY);
      const p = raw ? (JSON.parse(raw) as Patient) : null;
      if (p && PATIENT_OPTIONS.some((o) => o.id === p.stratum)) setPatientState({ stratum: p.stratum, from: p.from === 'chosen' ? 'chosen' : 'words' });
      // JUDGE-7 #5: an adult relative's story is read from the words, never chosen.
      else if (p && p.stratum === 'caregiver-adult' && p.relation) setPatientState({ stratum: 'caregiver-adult', from: 'words', relation: p.relation });
    } catch { /* storage off: in memory only */ }
  }, []);
  const keepPatient = useCallback((p: Patient | null) => {
    setPatientState(p);
    try { if (p) localStorage.setItem(PATIENT_KEY, JSON.stringify(p)); else localStorage.removeItem(PATIENT_KEY); } catch { /* in memory only */ }
  }, []);
  const setPatient = useCallback((stratum: PatientStratum | null) => keepPatient(stratum ? { stratum, from: 'chosen' } : null), [keepPatient]);
  const patientRef = useRef<Patient | null>(null);
  useEffect(() => { patientRef.current = patient; }, [patient]);
  const noteStory = useCallback((story: string | undefined) => {
    if (!story || patientRef.current?.from === 'chosen') return;
    const said = patientFromWords(story);
    const relation = said === 'caregiver-adult' ? relationFromWords(story) ?? undefined : undefined;
    if (said && (said !== patientRef.current?.stratum || relation !== patientRef.current?.relation)) { const p: Patient = relation ? { stratum: said, from: 'words', relation } : { stratum: said, from: 'words' }; patientRef.current = p; keepPatient(p); }
  }, [keepPatient]);
  const [hydrated, setHydrated] = useState(false);
  /** Which composed example is on the ledger, so a page can say so on its face; null for a person's own lines. */
  const [example, setExample] = useState<LedgerExampleId | null>(null);
  /* Read by the add actions, so the first story typed over an example replaces it. */
  const exampleRef = useRef<LedgerExampleId | null>(null);
  useEffect(() => { exampleRef.current = example; }, [example]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{ entries: JourneyEntry[]; unpriced: string[] } | null>(null);
  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null);
  const tid = useRef(0);
  /* The entries as of the last render, read by the add actions so a merge is
     computed once, outside a state updater (an updater may run twice). */
  const entriesRef = useRef<JourneyEntry[]>([]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);
  /* patient2-4: the body of the copy this tab last wrote or read, and a
     listener for the other tabs. Phone Safari keeps old tabs open; a line
     removed in one tab used to come back when an older tab wrote its copy.
     Another tab's write now replaces this tab's ledger at once. */
  const lastWritten = useRef<string>('');
  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== KEY && ev.key !== null) return;
      try {
        const raw = ev.key === null ? localStorage.getItem(KEY) : ev.newValue;
        const st = raw ? (JSON.parse(raw) as Saved) : null;
        lastWritten.current = savedBody(st);
        if (!st) { setEntries([]); setUnpriced([]); setFlags({}); setExample(null); return; }
        setEntries(keepKeys(entriesRef.current, rowsOfSaved(st)));
        setUnpriced(st.unpriced ?? []); setFlags(st.flags ?? {}); setExample(isExampleId(st.example) ? st.example : null);
      } catch { /* a copy this tab cannot read is left alone */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /* FLOW patient-16 is fixer PATIENT's (one toast at a time); here only the
     action and its longer life are added. */
  const toast = useCallback((text: string, kind: Toast['kind'] = 'info', action?: ToastAction) => {
    const id = ++tid.current;
    setToasts((p) => [...p.slice(-2), { id, text, kind, ...(action ? { action } : {}) }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), action ? 10000 : 4200);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((p) => p.filter((t) => t.id !== id)), []);

  /* hydrate: a shared journey (?s= saved on the server, #j= carried in the link)
     wins over whatever this browser had saved. */
  useEffect(() => {
    let cancelled = false;
    const stripParam = () => {
      const u = new URL(window.location.href);
      u.searchParams.delete('s');
      history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : '') + u.hash);
    };
    const load = loadSavedRows;

    (async () => {
      /* a saved journey, opened as /ledger?s=<slug> */
      try {
        const slug = new URL(window.location.href).searchParams.get('s');
        if (slug && /^[a-z0-9]{4,32}$/.test(slug)) {
          try {
            const r = await fetch(`/api/journeys/${encodeURIComponent(slug)}`, { headers: { accept: 'application/json' } });
            const j = (await r.json()) as { ok?: boolean; entries?: SavedEntry[] };
            if (cancelled) return;
            if (j?.ok && Array.isArray(j.entries) && j.entries.length) {
              const incoming = splitSaved(j.entries);
              /* 🔴 NEVER REPLACE A LEDGER WITHOUT ASKING (auth S3). A person
                 mid-build who opened a saved link lost their own ledger to it,
                 with only a toast. When this browser holds a different ledger,
                 it stays on screen and the ledger asks which one to keep. */
              let local: Saved | null = null;
              try { const raw = localStorage.getItem(KEY); local = raw ? (JSON.parse(raw) as Saved) : null; } catch { local = null; }
              const localRows = Array.isArray(local?.entries) ? local!.entries : [];
              const localHits = Array.isArray(local?.unpriced) ? local!.unpriced : [];
              const differs = (localRows.length > 0 || localHits.length > 0)
                && !(sameJourney(localRows, incoming.lines) && localHits.length === incoming.unpriced.length && localHits.every((h) => incoming.unpriced.includes(h)));
              if (differs) {
                setEntries(load(localRows)); setUnpriced(localHits); setFlags(local?.flags ?? {});
                setPending({ entries: load(incoming.lines), unpriced: incoming.unpriced });
                setPendingLink({ lines: incoming.lines.length + incoming.unpriced.length, mine: localRows.length + localHits.length });
                setHydrated(true);
                return;
              }
              setEntries(load(incoming.lines)); setUnpriced(incoming.unpriced);
              if (local?.flags) setFlags(local.flags);
              setHydrated(true); stripParam();
              toast('Journey loaded from the link you opened.', 'ok');
              return;
            }
            stripParam();
            toast('That saved journey could not be found. Nothing on this device was changed.', 'warn');
          } catch {
            if (cancelled) return;
            toast('Could not reach the saved journey. Nothing on this device was changed.', 'warn');
          }
        }
      } catch { /* no URL API: fall through to the local journey */ }
      if (cancelled) return;

      try {
        const m = /#j=([A-Za-z0-9_-]+)/.exec(window.location.hash);
        if (m) {
          const d = decodeShare(m[1]);
          if (d && (d.entries.length || d.unpriced.length)) {
            setEntries(d.entries); setUnpriced(d.unpriced); setHydrated(true);
            history.replaceState(null, '', window.location.pathname + window.location.search);
            toast('Journey loaded from the link you opened.', 'ok');
            return;
          }
        }
        const raw = localStorage.getItem(KEY);
        /* ?example=lyme (see COMPOSED_EXAMPLES): loaded only onto an empty ledger. */
        const asked = composedExampleIn(window.location.search);
        if (asked) {
          const u = new URL(window.location.href);
          u.searchParams.delete('example');
          history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : '') + u.hash);
          const mine = raw ? (JSON.parse(raw) as Saved) : null;
          const hasMine = !!mine && ((mine.entries?.length ?? 0) > 0 || (mine.unpriced?.length ?? 0) > 0);
          if (!hasMine) {
            const ex = composedExampleLedger(asked);
            entriesRef.current = ex;
            setEntries(ex); setUnpriced([]); setExample(asked); setHydrated(true);
            toast(COMPOSED_EXAMPLES[asked].loaded, 'info', { label: 'Start over', run: () => { setEntries([]); setUnpriced([]); setFlags({}); setExample(null); try { localStorage.removeItem(KEY); } catch { /* */ } } });
            return;
          }
          toast('Your own lines are kept. The example only opens on an empty ledger: start over first, then open the link again.', 'warn');
        }
        if (raw) {
          const st = JSON.parse(raw) as Saved;
          lastWritten.current = savedBody(st);
          setEntries(rowsOfSaved(st));
          setUnpriced(st.unpriced ?? []); setFlags(st.flags ?? {});
          /* The example's label outlives the full-page load "See it done with an example" makes. */
          if (isExampleId(st.example)) { exampleRef.current = st.example; setExample(st.example); }
        } else {
          const old = localStorage.getItem(LEGACY);
          if (old) {
            const st = JSON.parse(old) as { entries: SavedEntry[] };
            setEntries(load(st.entries ?? []));
          }
        }
      } catch { /* storage unavailable: run in memory */ }
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [toast]);

  const dropSlug = useCallback(() => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete('s');
      history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : '') + u.hash);
    } catch { /* no URL API */ }
  }, []);
  const openPendingLink = useCallback(() => {
    if (!pending) return;
    setEntries(pending.entries); setUnpriced(pending.unpriced);
    setPending(null); setPendingLink(null); dropSlug();
    toast('Journey loaded from the link you opened.', 'ok');
  }, [pending, dropSlug, toast]);
  const keepLocalLedger = useCallback(() => {
    setPending(null); setPendingLink(null); dropSlug();
    toast('Kept your ledger. The link was not opened.', 'info');
  }, [dropSlug, toast]);

  /* anything that could not be delivered is retried when the connection returns */
  useEffect(() => { startOutbox(); }, []);

  /* An answer waiting on this device is still this person's answer: read the
     outbox back so the thumb they pressed is still pressed after a reload, and
     follow it as the queue drains. A verdict already in state wins — it is the
     newer one. Both maps are keyed by price id, which is what these return. */
  useEffect(() => {
    const sync = () => { setQueued(queuedCorrections()); setFlags((p) => ({ ...queuedVerdicts(), ...p })); };
    sync();
    return onOutboxChange(sync);
  }, []);

  /* the context is loaded and saved on its own key, so clearing a journey never
     forgets who you are and forgetting who you are never clears a journey */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CTX_KEY);
      if (!raw) return;
      const c = JSON.parse(raw) as Ctx;
      setCtx({
        coverage: typeof c.coverage === 'string' ? (c.coverage as Coverage) : undefined,
        locality: typeof c.locality === 'string' && localityOf(c.locality) ? c.locality : undefined,
      });
    } catch { /* storage unavailable: run in memory */ }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (ctx.coverage || ctx.locality) localStorage.setItem(CTX_KEY, JSON.stringify(ctx));
      else localStorage.removeItem(CTX_KEY);
    } catch { /* ignore */ }
  }, [ctx, hydrated]);

  const setCoverage = useCallback((c: Coverage | undefined) => setCtx((p) => ({ ...p, coverage: c })), []);
  const setLocality = useCallback((localityKey: string | undefined) => setCtx((p) => ({ ...p, locality: localityKey })), []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const s: Saved = { v: 2, savedAt: new Date().toISOString(), entries: entries.map((e) => ({ raw: e.raw, itemId: e.item?.id ?? null, times: e.times, gapCategory: e.gapCategory ?? null, months: e.months ?? null, ...(!e.item && reasonOf(e) ? { reason: reasonOf(e) } : {}), ...paidFieldsOut(e) })), unpriced: unpricedHits, flags, ...(example ? { example } : {}) };
      const keep = entries.length || unpricedHits.length;
      const body = keep ? savedBody(s) : '';
      /* patient2-4: a copy that only repeats what another tab just wrote is not
         written back, so two open tabs never trade the same ledger forever. */
      if (body === lastWritten.current) return;
      lastWritten.current = body;
      if (keep) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY);
    } catch { /* ignore */ }
  }, [entries, unpricedHits, flags, example, hydrated]);

  /* judge panel 15 Oct #2.2: a typed story over an example starts from an empty
     ledger. The example's lines, its named cost and its thumbs go; nothing of the
     person's own is touched, because while an example shows there is none. */
  const clearExampleFor = useCallback((): JourneyEntry[] => {
    const base = storyBase(exampleRef.current, entriesRef.current);
    if (exampleRef.current === null) return base;
    exampleRef.current = null;
    setExample(null); setEntries([]); setUnpriced([]); setFlags({});
    entriesRef.current = base;
    toast('The example was cleared; these are your lines.', 'info');
    return base;
  }, [toast]);

  const addStory = useCallback((story: string) => {
    const base = clearExampleFor();
    noteStory(story);
    const segs = parseJourney(story.trim(), ITEMS);
    const add: JourneyEntry[] = []; let matched = 0, unpriced = 0; const annual: string[] = [];
    for (const s of segs) {
      const un = unpriceableHit(s.raw);
      if (un) { setUnpriced((p) => (p.includes(un.id) ? p : [...p, un.id])); unpriced++; noteWork(s.raw, un.id); continue; }
      const cap = clampPerYear(s.result.item, s.times);
      if (cap.capped && s.result.item) annual.push(perYearNote(s.result.item, s.times));
      add.push({ key: uid(), raw: s.raw, item: s.result.item, times: cap.times, gapCategory: s.result.gapCategory, months: s.result.months, ...(!s.result.item && s.result.reason ? { reason: s.result.reason } : {}) } as JourneyEntry);
      if (s.result.item) matched++;
    }
    const m = mergeEntries(base, add);
    entriesRef.current = m.entries;
    setEntries(m.entries);
    for (const n of annual) toast(n, 'info');
    const joined = mergeToast(m.merged);
    if (joined) toast(joined, 'info');
    return { added: add.length, matched, unpriced, merged: m.merged.length };
  }, [toast, noteStory, clearExampleFor]);

  /** Add what the live preview already read — the AI reader's fills included — so the chip
   *  a person saw is the line she gets. Absorbed fragments never become lines. */
  const addSegments = useCallback((segs: ParsedSegment[], story?: string) => {
    const base = clearExampleFor();
    noteStory(story ?? segs.map((s) => s.raw).join('. '));
    const add: JourneyEntry[] = []; let matched = 0, unpriced = 0; const annual: string[] = [];
    for (const s of segs) {
      if (s.absorbed) continue;
      const un = unpriceableHit(s.raw);
      if (un) { setUnpriced((p) => (p.includes(un.id) ? p : [...p, un.id])); unpriced++; noteWork(s.raw, un.id); continue; }
      const cap = clampPerYear(s.result.item, s.times);
      if (cap.capped && s.result.item) annual.push(perYearNote(s.result.item, s.times));
      add.push({ key: uid(), raw: s.raw, item: s.result.item, times: cap.times, gapCategory: s.result.gapCategory, months: s.result.months, source: s.source ?? 'rules', modelWhy: s.modelWhy ?? null, ...(!s.result.item && s.result.reason ? { reason: s.result.reason } : {}) } as JourneyEntry);
      if (s.result.item) matched++;
    }
    const m = mergeEntries(base, add);
    entriesRef.current = m.entries;
    setEntries(m.entries);
    for (const n of annual) toast(n, 'info');
    const joined = mergeToast(m.merged);
    if (joined) toast(joined, 'info');
    return { added: add.length, matched, unpriced, merged: m.merged.length };
  }, [toast, noteStory, clearExampleFor]);

  const applyRead = useCallback((segs: ParsedSegment[]) => {
    const r = applyLateRead(entriesRef.current, segs);
    if (!r.upgraded.length) return 0;
    const ups = new Set(r.upgraded.map((u) => u.key));
    const next = r.entries.map((e) => (ups.has(e.key) ? { ...e, times: clampPerYear(e.item, e.times).times } : e));
    entriesRef.current = next;
    setEntries(next);
    const msg = lateReadToast(r.upgraded.map((u) => ({ ...u, times: next.find((e) => e.key === u.key)?.times ?? u.times })));
    if (msg) toast(msg, 'info');
    return r.upgraded.length;
  }, [toast]);

  const addOne = useCallback((text: string) => {
    const t = text.trim(); if (!t) return;
    clearExampleFor();
    const un = unpriceableHit(t);
    if (un) { setUnpriced((p) => (p.includes(un.id) ? p : [...p, un.id])); noteWork(t, un.id); toast(`“${t}” is a real cost we will not price. ${un.whyUnpriced.split('.')[0]}.`, 'warn'); return; }
    const { text: clean, times } = extractCount(t);
    const m = mapUtterance(clean || t, ITEMS);
    const cap = clampPerYear(m.item, times);
    if (cap.capped && m.item) toast(perYearNote(m.item, times), 'info');
    setEntries((p) => [...p, { key: uid(), raw: t, item: m.item, times: cap.times, gapCategory: m.gapCategory, months: m.months }]);
    toast(m.item ? `Matched to ${m.item.label}.` : `No federal figure matches “${t}”. Kept on your journey, unpriced.`, m.item ? 'ok' : 'warn');
  }, [toast, clearExampleFor]);

  const addItem = useCallback((it: PriceItem, raw?: string) => {
    clearExampleFor();
    setEntries((p) => {
      const existing = p.find((e) => e.item?.id === it.id && !raw);
      if (existing) return p.map((e) => (e.key === existing.key ? { ...e, times: clampPerYear(it, e.times + 1).times } : e));
      return [...p, { key: uid(), raw: raw ?? (it.synonyms[0] || it.label), item: it, times: 1 }];
    });
    toast(`${it.label} added.`, 'ok');
  }, [toast, clearExampleFor]);

  const setTimes = useCallback((key: string, times: number) => {
    setEntries((p) => p.map((e) => {
      if (e.key !== key) return e;
      const cap = clampPerYear(e.item, times);
      if (cap.capped && e.item) toast(perYearNote(e.item, Math.floor(times)), 'info');
      return { ...e, times: cap.times };
    }));
  }, [toast]);
  const remove = useCallback((key: string) => setEntries((p) => p.filter((e) => e.key !== key)), []);
  const remap = useCallback((key: string, itemId: string | null) => {
    setEntries((p) => p.map((e) => (e.key === key ? { ...e, item: itemId ? TABLE.find((t) => t.id === itemId) ?? null : null } : e)));
  }, []);
  /* Start over clears the typed sentence too (R6 edge #14): the draft outlives
     a refresh, never a person saying "clear this". */
  const reset = useCallback(() => { setExample(null); setEntries([]); setUnpriced([]); setFlags({}); setSentOk({}); clearStoryDraft(); try { localStorage.removeItem(KEY); localStorage.removeItem(LEGACY); } catch { /* */ } if (patientRef.current?.from === 'words') keepPatient(null); }, [keepPatient]);

  const snapshotRef = useRef<LedgerSnapshot>({ entries: [], unpricedHits: [], flags: {} });
  useEffect(() => { snapshotRef.current = { entries, unpricedHits, flags }; }, [entries, unpricedHits, flags]);
  const snapshot = useCallback((): LedgerSnapshot => ({ ...snapshotRef.current }), []);
  const restore = useCallback((sn: LedgerSnapshot) => {
    entriesRef.current = sn.entries;
    setEntries(sn.entries); setUnpriced(sn.unpricedHits); setFlags(sn.flags);
  }, []);

  const loadExample = useCallback(() => {
    const ex = exampleLedger();
    entriesRef.current = ex;
    setEntries(ex);
    setUnpriced(['lost-work']);
    exampleRef.current = 'home';
    setExample('home');
  }, []);

  const correct = useCallback(async (item: PriceItem, verdict: 'right' | 'wrong', believedValueUsd: number | null = null, note?: string, lineKey?: string) => {
    setFlags((p) => ({ ...p, [item.id]: verdict }));
    /* The amount typed in the Wrong box is also this person's own paid amount
       for that line, for one time (it answers one figure). It is kept on the
       line whether or not the send reaches the server. */
    const usd = verdict === 'wrong' && note !== 'not-described' ? cleanPaid(believedValueUsd) : null;
    if (usd !== null) {
      setEntries((p) => {
        const line = (lineKey ? p.find((e) => e.key === lineKey) : undefined) ?? p.find((e) => e.item?.id === item.id);
        return line ? withPaid(p, line.key, usd, true) : p;
      });
    }
    const r = await outboxPost('/api/corrections', {
      priceId: item.id, verdict, believedValueUsd, ...(note ? { note } : {}),
      priceTableVersion: TABLE_VERSION_SAFE(), submitterId: submitterId(),
    });
    const d = r.data as { tally?: Tally; already?: boolean } | null;
    const already = !!d?.already;
    setSentOk((p) => ({ ...p, [item.id]: r.ok || already }));
    setQueued((p) => ({ ...p, [item.id]: r.queued }));
    if (d?.tally && typeof d.tally.n === 'number') setTallies((p) => ({ ...p, [item.id]: d.tally! }));
    toast(r.ok
      ? (note === 'not-described'
          ? 'Counted. This row now carries a report that no published figure describes you.'
          : verdict === 'wrong' ? 'Sent. It is counted against that exact published figure.' : 'Thank you. Confirmation recorded.')
      : already
        ? 'You have already answered on this figure. It is counted once.'
        : r.queued
          ? queuedSentence(r.status)
          : 'Could not record it. Nothing was saved.', r.ok || already ? 'ok' : 'warn');
    return r.ok || already;
  }, [toast]);
  const clearFlag = useCallback((id: string) => { setFlags((p) => { const c = { ...p }; delete c[id]; return c; }); }, []);
  const setPaid = useCallback((key: string, usd: number | null, each = false) => setEntries((p) => withPaid(p, key, usd, each)), []);

  const shareUrl = useCallback(() => `${window.location.origin}/ledger#j=${encodeShare(entries, unpricedHits)}`, [entries, unpricedHits]);

  /* 🔴 CARE THAT DID NOT HAPPEN IS NEVER PRICED, AND A LENGTH OF TIME IS NOT A
     UNIT OF CARE. The mapper refuses those phrases and names the counter they
     belong in; this turns that answer into something both the ledger and the
     gap report can read, so the person never types it twice. */
  const gapHints = useMemo<JourneyGapHint[]>(() => {
    const out: JourneyGapHint[] = [];
    for (const e of entries) {
      if (e.item) continue;
      /* The mapper's own answer for the words, and, for a line whose words were
         never shared (it came from a share link), the counter the link named. */
      const h = gapHintOf(mapUtterance(e.raw, ITEMS))
        ?? (e.gapCategory ? gapHintOf({ item: null, gapCategory: e.gapCategory, months: e.months ?? null }) : null);
      if (h) out.push({ ...h, key: e.key, raw: e.raw, times: e.times });
    }
    return out;
  }, [entries]);

  /* Saves the journey on the server and returns a short link anyone can open.
     Only units and counts are sent: no name, no date, no free text beyond the
     words you typed for each step. Steps with no federal figure go too, as the
     words with no unit, so the link opens the same ledger, blanks included. */
  const saveJourney = useCallback(async (title?: string): Promise<SaveResult> => {
    const { rows, omitted } = savedRowsOf(entries, unpricedHits);
    if (!rows.length) {
      toast('Nothing to save yet.', 'warn');
      return { ok: false, error: 'Nothing to save.', omitted };
    }
    setSaving(true);
    try {
      const r = await fetch('/api/journeys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: rows,
          ...(title ? { title: title.slice(0, 120) } : {}),
        }),
      });
      const j = (await r.json()) as { ok?: boolean; url?: string; slug?: string; error?: string; deleteToken?: string; expiresAt?: string | null };
      if (!j?.ok || !j.slug) {
        toast(j?.error || 'Could not save the journey. Nothing was stored.', 'warn');
        return { ok: false, error: j?.error || 'Could not save the journey.', omitted };
      }
      const url = j.url || `${window.location.origin}/ledger?s=${j.slug}`;
      toast(omitted ? `Saved. The link holds the first 60 lines; ${omitted} more stayed on this device.` : 'Saved. The link opens this ledger on any device, blanks included.', 'ok');
      return { ok: true, url, slug: j.slug, omitted, deleteToken: j.deleteToken, expiresAt: j.expiresAt ?? null };
    } catch {
      toast('Could not reach the server. Nothing was saved.', 'warn');
      return { ok: false, error: 'Could not reach the server.', omitted };
    } finally { setSaving(false); }
  }, [entries, unpricedHits, toast]);

  const value = useMemo<Store>(() => ({ entries, ctx, patient, setPatient, setCoverage, setLocality, unpricedHits, gapHints, flags, setPaid, sentOk, tallies, queued, hydrated, toasts, toast, dismissToast, snapshot, restore, addStory, addSegments, applyRead, addOne, addItem, setTimes, remove, remap, reset, loadExample, example, correct, clearFlag, shareUrl, saveJourney, saving, pendingLink, openPendingLink, keepLocalLedger }),
    [entries, ctx, patient, setPatient, setCoverage, setLocality, unpricedHits, gapHints, flags, setPaid, sentOk, tallies, queued, hydrated, toasts, toast, dismissToast, snapshot, restore, addStory, addSegments, applyRead, addOne, addItem, setTimes, remove, remap, reset, loadExample, example, correct, clearFlag, shareUrl, saveJourney, saving, pendingLink, openPendingLink, keepLocalLedger]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

import { TABLE_VERSION } from './table';
function TABLE_VERSION_SAFE() { return TABLE_VERSION; }

/* 🔴 ACCESS-8: "held until you are back online" was said to a person who was
   online. lib/outbox.ts queues on no answer (offline), on 429 (the per-network
   cap on one figure) and on 5xx; each now says which, and what happens next is
   what startOutbox does: it sends again when the site is opened or the tab
   comes back, and the chip's Try now sends at once. */
export function queuedSentence(status: number | null): string {
  if (status === 429) return 'Several answers on this figure came from your network this hour, so the count asked to wait. Yours is held on this device and is sent again the next time you open this site, or press Try now.';
  if (status !== null && status >= 500) return 'The count did not answer just now. Yours is held on this device and is sent again the next time you open this site, or press Try now.';
  return 'Saved on this device. It will be sent the moment you are back online.';
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

/** The store when a provider is above, else null: for a mount that also renders alone (tests, static markup). */
export function useStoreMaybe(): Store | null {
  return useContext(Ctx);
}

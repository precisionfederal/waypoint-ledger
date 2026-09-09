'use client';
/* The journey store. One journey per browser, persisted locally; shareable as a
   link that carries only unit ids and counts. Nothing here prices anything. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { JourneyEntry, PriceItem } from './types';
import { TABLE, SELECTABLE } from './table';
import { extractCount, mapUtterance, parseJourney } from './mapper';
import type { ParsedSegment } from './mapper';
import { unpriceableFor } from './price-api';
import { post as outboxPost, startOutbox, queuedCorrections, queuedVerdicts, onOutboxChange } from './outbox';
import type { Coverage, Ctx, GapHint } from './fit';
import { gapHintOf, localityOf } from './fit';
import unpriceableData from '@/data/unpriceable.json';

export const ITEMS = SELECTABLE;
export const UNPRICEABLE = unpriceableData.items as {
  id: string; label: string; synonyms: string[]; whyUnpriced: string; whatWouldFixIt: string;
}[];

const KEY = 'waypoint-ledger.journey.v2';
const LEGACY = 'waypoint-ledger.journey.v1';
/* Who you are and where you live. Held beside the journey, in this browser only,
   and never sent with a correction, a share link or a saved ledger. */
const CTX_KEY = 'waypoint-ledger.ctx.v1';
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

/** A phrase the mapper refused to price, and the counter it belongs in. Held on
 *  the journey so the ledger can render it and /gap can open already filled —
 *  one derivation, read by both, so the two can never disagree. */
export interface JourneyGapHint extends GapHint { key: string; raw: string; times: number }

interface SavedEntry { raw: string; itemId: string | null; times: number; gapCategory?: string | null; months?: number | null }
interface Saved { v: 2; savedAt: string; entries: SavedEntry[]; unpriced: string[]; flags: Record<string, 'right' | 'wrong'> }

export type Toast = { id: number; text: string; kind: 'ok' | 'warn' | 'info' };
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
  sentOk: Record<string, boolean>;
  /** what the public has said about each figure, returned by the count itself */
  tallies: Record<string, Tally>;
  /** figures whose answer is on this device waiting for a connection */
  queued: Record<string, boolean>;
  hydrated: boolean;
  toasts: Toast[];
  toast: (text: string, kind?: Toast['kind']) => void;
  addStory: (story: string) => { added: number; matched: number; unpriced: number };
  addSegments: (segs: ParsedSegment[]) => { added: number; matched: number; unpriced: number };
  addOne: (text: string) => void;
  addItem: (it: PriceItem, raw?: string) => void;
  setTimes: (key: string, times: number) => void;
  remove: (key: string) => void;
  remap: (key: string, itemId: string | null) => void;
  reset: () => void;
  loadExample: () => void;
  correct: (item: PriceItem, verdict: 'right' | 'wrong', believedValueUsd?: number | null, note?: string) => Promise<boolean>;
  clearFlag: (id: string) => void;
  shareUrl: () => string;
  saveJourney: (title?: string) => Promise<SaveResult>;
  saving: boolean;
}

export interface SaveResult { ok: boolean; url?: string; slug?: string; omitted?: number; error?: string; deleteToken?: string; expiresAt?: string | null }

const Ctx = createContext<Store | null>(null);

function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

function encode(entries: JourneyEntry[]): string {
  const payload = entries.map((e) => [e.raw, e.item?.id ?? null, e.times]);
  const json = JSON.stringify(payload);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decode(s: string): JourneyEntry[] | null {
  try {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b + '='.repeat((4 - (b.length % 4)) % 4))));
    const arr = JSON.parse(json) as [string, string | null, number][];
    if (!Array.isArray(arr)) return null;
    return arr.slice(0, 200).map(([raw, id, times]) => ({
      key: uid(), raw: String(raw).slice(0, 200), times: Math.max(1, Math.min(365, Number(times) || 1)),
      item: id ? TABLE.find((t) => t.id === id) ?? null : null,
    }));
  } catch { return null; }
}

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
  const [hydrated, setHydrated] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [saving, setSaving] = useState(false);
  const tid = useRef(0);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++tid.current;
    setToasts((p) => [...p.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4200);
  }, []);

  /* hydrate: a shared journey (?s= saved on the server, #j= carried in the link)
     wins over whatever this browser had saved. */
  useEffect(() => {
    let cancelled = false;
    const stripParam = () => {
      const u = new URL(window.location.href);
      u.searchParams.delete('s');
      history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : '') + u.hash);
    };
    const load = (rows: SavedEntry[]): JourneyEntry[] =>
      rows.slice(0, 200).map((e) => ({
        key: uid(), raw: String(e.raw ?? '').slice(0, 200),
        times: Math.max(1, Math.min(365, Number(e.times) || 1)),
        item: e.itemId ? TABLE.find((t) => t.id === e.itemId) ?? null : null,
        gapCategory: typeof e.gapCategory === 'string' ? e.gapCategory : null,
        months: typeof e.months === 'number' && Number.isFinite(e.months) ? e.months : null,
      }));

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
              setEntries(load(j.entries)); setHydrated(true); stripParam();
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
          const e = decode(m[1]);
          if (e && e.length) {
            setEntries(e); setHydrated(true);
            history.replaceState(null, '', window.location.pathname + window.location.search);
            toast('Journey loaded from the link you opened.', 'ok');
            return;
          }
        }
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const st = JSON.parse(raw) as Saved;
          setEntries(load(st.entries));
          setUnpriced(st.unpriced ?? []); setFlags(st.flags ?? {});
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
      const s: Saved = { v: 2, savedAt: new Date().toISOString(), entries: entries.map((e) => ({ raw: e.raw, itemId: e.item?.id ?? null, times: e.times, gapCategory: e.gapCategory ?? null, months: e.months ?? null })), unpriced: unpricedHits, flags };
      if (entries.length || unpricedHits.length) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY);
    } catch { /* ignore */ }
  }, [entries, unpricedHits, flags, hydrated]);

  const addStory = useCallback((story: string) => {
    const segs = parseJourney(story.trim(), ITEMS);
    const add: JourneyEntry[] = []; let matched = 0, unpriced = 0;
    for (const s of segs) {
      const un = unpriceableHit(s.raw);
      if (un) { setUnpriced((p) => (p.includes(un.id) ? p : [...p, un.id])); unpriced++; continue; }
      add.push({ key: uid(), raw: s.raw, item: s.result.item, times: s.times, gapCategory: s.result.gapCategory, months: s.result.months });
      if (s.result.item) matched++;
    }
    setEntries((p) => [...p, ...add]);
    return { added: add.length, matched, unpriced };
  }, []);

  /** Add what the live preview already read — the AI reader's fills included — so the chip
   *  a person saw is the line she gets. Absorbed fragments never become lines. */
  const addSegments = useCallback((segs: ParsedSegment[]) => {
    const add: JourneyEntry[] = []; let matched = 0, unpriced = 0;
    for (const s of segs) {
      if (s.absorbed) continue;
      const un = unpriceableHit(s.raw);
      if (un) { setUnpriced((p) => (p.includes(un.id) ? p : [...p, un.id])); unpriced++; continue; }
      add.push({ key: uid(), raw: s.raw, item: s.result.item, times: s.times, gapCategory: s.result.gapCategory, months: s.result.months });
      if (s.result.item) matched++;
    }
    setEntries((p) => [...p, ...add]);
    return { added: add.length, matched, unpriced };
  }, []);

  const addOne = useCallback((text: string) => {
    const t = text.trim(); if (!t) return;
    const un = unpriceableHit(t);
    if (un) { setUnpriced((p) => (p.includes(un.id) ? p : [...p, un.id])); toast(`“${t}” is a real cost we will not price. ${un.whyUnpriced.split('.')[0]}.`, 'warn'); return; }
    const { text: clean, times } = extractCount(t);
    const m = mapUtterance(clean || t, ITEMS);
    setEntries((p) => [...p, { key: uid(), raw: t, item: m.item, times, gapCategory: m.gapCategory, months: m.months }]);
    toast(m.item ? `Matched to ${m.item.label}.` : `No federal figure matches “${t}”. Kept on your journey, unpriced.`, m.item ? 'ok' : 'warn');
  }, [toast]);

  const addItem = useCallback((it: PriceItem, raw?: string) => {
    setEntries((p) => {
      const existing = p.find((e) => e.item?.id === it.id && !raw);
      if (existing) return p.map((e) => (e.key === existing.key ? { ...e, times: Math.min(365, e.times + 1) } : e));
      return [...p, { key: uid(), raw: raw ?? (it.synonyms[0] || it.label), item: it, times: 1 }];
    });
    toast(`${it.label} added.`, 'ok');
  }, [toast]);

  const setTimes = useCallback((key: string, times: number) => {
    setEntries((p) => p.map((e) => (e.key === key ? { ...e, times: Math.max(1, Math.min(365, Math.floor(times) || 1)) } : e)));
  }, []);
  const remove = useCallback((key: string) => setEntries((p) => p.filter((e) => e.key !== key)), []);
  const remap = useCallback((key: string, itemId: string | null) => {
    setEntries((p) => p.map((e) => (e.key === key ? { ...e, item: itemId ? TABLE.find((t) => t.id === itemId) ?? null : null } : e)));
  }, []);
  const reset = useCallback(() => { setEntries([]); setUnpriced([]); setFlags({}); setSentOk({}); try { localStorage.removeItem(KEY); localStorage.removeItem(LEGACY); } catch { /* */ } }, []);

  const loadExample = useCallback(() => {
    const pick = (id: string) => ITEMS.find((i) => i.id === id) ?? null;
    setEntries([
      { key: uid(), raw: 'saw my regular doctor about the fatigue', item: pick('cms-99214'), times: 6 },
      { key: uid(), raw: 'first visit with a cardiologist', item: pick('cms-99204'), times: 1 },
      { key: uid(), raw: 'echocardiogram', item: pick('cms-img-echo'), times: 1 },
      { key: uid(), raw: 'wore a heart monitor', item: pick('cms-test-holter'), times: 1 },
      { key: uid(), raw: 'tilt-table test', item: pick('cms-test-tilt-table'), times: 1 },
      { key: uid(), raw: 'blood work each visit', item: pick('cms-lab-cmp'), times: 6 },
      { key: uid(), raw: 'went to the ER when my heart was racing', item: pick('cms-ed-99284-complete'), times: 2 },
      { key: uid(), raw: 'MRI of my brain', item: pick('cms-img-mri-brain-nc'), times: 1 },
      { key: uid(), raw: 'the neurologist', item: pick('cms-99205'), times: 1 },
    ]);
    setUnpriced(['lost-work']);
  }, []);

  const correct = useCallback(async (item: PriceItem, verdict: 'right' | 'wrong', believedValueUsd: number | null = null, note?: string) => {
    setFlags((p) => ({ ...p, [item.id]: verdict }));
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
          : verdict === 'wrong' ? 'Sent. Your correction is now bound to that published figure.' : 'Thank you. Confirmation recorded.')
      : already
        ? 'You have already answered on this figure. It is counted once.'
        : r.queued
          ? 'Saved on this device. It will be sent the moment you are back online.'
          : 'Could not record it. Nothing was saved.', r.ok || already ? 'ok' : 'warn');
    return r.ok || already;
  }, [toast]);
  const clearFlag = useCallback((id: string) => setFlags((p) => { const c = { ...p }; delete c[id]; return c; }), []);

  const shareUrl = useCallback(() => `${window.location.origin}/ledger#j=${encode(entries)}`, [entries]);

  /* 🔴 CARE THAT DID NOT HAPPEN IS NEVER PRICED, AND A LENGTH OF TIME IS NOT A
     UNIT OF CARE. The mapper refuses those phrases and names the counter they
     belong in; this turns that answer into something both the ledger and the
     gap report can read, so the person never types it twice. */
  const gapHints = useMemo<JourneyGapHint[]>(() => {
    const out: JourneyGapHint[] = [];
    for (const e of entries) {
      if (e.item) continue;
      const h = gapHintOf(mapUtterance(e.raw, ITEMS));
      if (h) out.push({ ...h, key: e.key, raw: e.raw, times: e.times });
    }
    return out;
  }, [entries]);

  /* Saves the journey on the server and returns a short link anyone can open.
     Only units and counts are sent: no name, no date, no free text beyond the
     words you typed for each step. Steps with no federal figure cannot be
     stored server-side, so they are reported back as omitted. */
  const saveJourney = useCallback(async (title?: string): Promise<SaveResult> => {
    const priced = entries.filter((e) => e.item);
    const omitted = entries.length - priced.length;
    if (!priced.length) {
      toast('Nothing to save yet: a saved link carries priced steps only.', 'warn');
      return { ok: false, error: 'No priced steps to save.', omitted };
    }
    setSaving(true);
    try {
      const r = await fetch('/api/journeys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: priced.slice(0, 60).map((e) => ({ raw: e.raw.slice(0, 200), itemId: e.item!.id, times: Math.max(1, Math.min(99, e.times)) })),
          ...(title ? { title: title.slice(0, 120) } : {}),
        }),
      });
      const j = (await r.json()) as { ok?: boolean; url?: string; slug?: string; error?: string; deleteToken?: string; expiresAt?: string | null };
      if (!j?.ok || !j.slug) {
        toast(j?.error || 'Could not save the journey. Nothing was stored.', 'warn');
        return { ok: false, error: j?.error || 'Could not save the journey.', omitted };
      }
      const url = j.url || `${window.location.origin}/ledger?s=${j.slug}`;
      toast(omitted ? `Saved. ${omitted} step${omitted === 1 ? '' : 's'} with no federal figure stayed on this device.` : 'Saved. The link opens this ledger on any device.', 'ok');
      return { ok: true, url, slug: j.slug, omitted, deleteToken: j.deleteToken, expiresAt: j.expiresAt ?? null };
    } catch {
      toast('Could not reach the server. Nothing was saved.', 'warn');
      return { ok: false, error: 'Could not reach the server.', omitted };
    } finally { setSaving(false); }
  }, [entries, toast]);

  const value = useMemo<Store>(() => ({ entries, ctx, setCoverage, setLocality, unpricedHits, gapHints, flags, sentOk, tallies, queued, hydrated, toasts, toast, addStory, addSegments, addOne, addItem, setTimes, remove, remap, reset, loadExample, correct, clearFlag, shareUrl, saveJourney, saving }),
    [entries, ctx, setCoverage, setLocality, unpricedHits, gapHints, flags, sentOk, tallies, queued, hydrated, toasts, toast, addStory, addSegments, addOne, addItem, setTimes, remove, remap, reset, loadExample, correct, clearFlag, shareUrl, saveJourney, saving]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

import { TABLE_VERSION } from './table';
function TABLE_VERSION_SAFE() { return TABLE_VERSION; }

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

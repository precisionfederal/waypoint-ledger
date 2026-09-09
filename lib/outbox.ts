/* ==========================================================================
   THE OUTBOX — a correction is never silently lost.

   A person in a hospital basement with no bars presses a thumb. The POST fails.
   Today the thumb would look sent. Here it goes into a queue in this browser's
   own storage, the interface can say "waiting to send", and it goes out on the
   next load or the moment the connection comes back.

   Privacy: the queue holds exactly what the POST would have carried and nothing
   more — no name, no journey, no diagnosis, no identifier we invented. It lives
   in localStorage on this device only, and an item is deleted the moment the
   server confirms it.

   NOTHING IS EVER SILENTLY DISCARDED. Round 3 found the opposite: `tries`
   climbed once per page load, twelve loads deleted the item, and afterwards the
   thumb still rendered as pressed with no chip and no trace. Twelve ordinary
   opens is a week, not an edge case, and the one thing we asked a sick person
   for was gone without a word. Now an item that has run out of automatic tries,
   or that has waited longer than MAX_AGE_MS, becomes STUCK: it stays in this
   browser for good, the interface says so in plain words, and the person can
   press Try now or copy the correction out as text and mail it themselves. An
   item leaves this queue in exactly one way — the server answered.
   ========================================================================== */

export const OUTBOX_KEY = 'waypoint-ledger.outbox.v1';
/** Storage guard only. The ledger itself caps at 200 rows, so a queue this deep
 *  cannot be reached by a person; it exists so a loop in some future caller can
 *  never fill a browser's storage. */
const MAX_ITEMS = 200;
/** How many automatic attempts before the interface stops trying quietly and
 *  starts telling the truth out loud. */
export const MAX_TRIES = 12;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface OutboxItem {
  id: string;
  url: string;
  body: unknown;
  queuedAt: string;
  tries: number;
  /** Automatic sending has given up. The item is kept; the person is told. */
  stuck?: boolean;
}

export interface PostResult {
  /** The server answered and saved it. */
  ok: boolean;
  /** It could not be delivered and is now in the queue on this device. */
  queued: boolean;
  status: number | null;
  data: Record<string, unknown> | null;
}

const canUse = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
const listeners = new Set<(n: number) => void>();

function notify() {
  const n = pending();
  for (const fn of listeners) { try { fn(n); } catch { /* a listener must never break a flush */ } }
}

/** Subscribe to the queue length. Returns an unsubscribe. */
export function onOutboxChange(fn: (n: number) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function readOutbox(): OutboxItem[] {
  if (!canUse()) return [];
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const cutoff = Date.now() - MAX_AGE_MS;
    return list
      .filter((i: OutboxItem) => i && typeof i.url === 'string' && typeof i.id === 'string')
      /* Age no longer deletes anything. It marks the item stuck, which is a
         statement on the screen rather than a silent removal. */
      .map((i: OutboxItem) => (i.stuck || (Date.parse(i.queuedAt) > cutoff && i.tries < MAX_TRIES) ? i : { ...i, stuck: true }));
  } catch { return []; }
}

function write(list: OutboxItem[]) {
  if (!canUse()) return;
  try {
    if (list.length) window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-MAX_ITEMS)));
    else window.localStorage.removeItem(OUTBOX_KEY);
  } catch { /* a full or blocked storage must never break the page */ }
  notify();
}

export const pending = (): number => readOutbox().length;

/** Put one request in the queue. The same request is never queued twice. */
export function enqueue(url: string, body: unknown): OutboxItem {
  const item: OutboxItem = {
    id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
    url, body, queuedAt: new Date().toISOString(), tries: 0,
  };
  const list = readOutbox();
  const key = url + JSON.stringify(body);
  if (!list.some((i) => i.url + JSON.stringify(i.body) === key)) { list.push(item); write(list); }
  return item;
}

export function remove(id: string) {
  write(readOutbox().filter((i) => i.id !== id));
}

/** A response the server itself produced: 4xx included. Only a network failure
 *  or a server that says it saved nothing is worth trying again. */
const worthRetrying = (status: number | null) => status === null || status >= 500 || status === 429;

/* 429 is on that list on purpose. A correction can be refused because this
   network has already sent the cap for that one figure in this window (the
   per-figure cooldown in cf/functions/api/corrections.js). That is a "later",
   not a "no", so the fourth person in one house keeps their correction and it
   goes out when the window turns. */

async function send(url: string, body: unknown): Promise<{ status: number | null; data: Record<string, unknown> | null }> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data: Record<string, unknown> | null = null;
    try { data = await r.json(); } catch { data = null; }
    return { status: r.status, data };
  } catch { return { status: null, data: null }; }
}

/** POST, and queue it here if it could not be delivered. This is the call the
 *  interface makes: it never reports "sent" for something that is not sent. */
export async function post(url: string, body: unknown): Promise<PostResult> {
  const { status, data } = await send(url, body);
  const ok = Boolean(data && (data as { ok?: boolean }).ok);
  if (!ok && worthRetrying(status)) { enqueue(url, body); return { ok: false, queued: true, status, data }; }
  return { ok, queued: false, status, data };
}

/** Try the queue once, oldest first. Safe to call at any time.
 *
 *  Automatic flushes skip items already marked stuck, so a dead endpoint is not
 *  retried on every page load forever. `flush(true)` — what the "Try now"
 *  button calls — tries everything, because the person asked. */
export async function flush(force = false): Promise<{ sent: number; left: number; stuck: number }> {
  let list = readOutbox();
  if (!list.length) return { sent: 0, left: 0, stuck: 0 };
  let sent = 0;
  for (const item of [...list]) {
    if (item.stuck && !force) continue;
    const { status, data } = await send(item.url, item.body);
    const ok = Boolean(data && (data as { ok?: boolean }).ok);
    if (ok || !worthRetrying(status)) {
      /* The server answered. Either it saved it, or it told us why it never
         will (a repeat thumb, a figure that is not in the table). Both are
         answers; neither is worth asking again. */
      list = list.filter((i) => i.id !== item.id);
      if (ok) sent++;
    } else {
      /* Out of automatic tries: keep it, mark it, and say so. Never drop it. */
      list = list.map((i) => (i.id === item.id ? { ...i, tries: i.tries + 1, stuck: i.tries + 1 >= MAX_TRIES } : i));
    }
    write(list);
  }
  return { sent, left: list.length, stuck: list.filter((i) => i.stuck).length };
}

let started = false;
/** Flush now, on the next connection, and when the tab comes back. Idempotent. */
export function startOutbox() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const go = () => { void flush(); };
  window.addEventListener('online', go);
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') go(); });
  /* Another tab of this site flushed or queued something: this tab's chip must
     agree with the storage both tabs read. */
  window.addEventListener('storage', (e) => { if (e.key === OUTBOX_KEY) notify(); });
  go();
}

/* ==========================================================================
   READING THE QUEUE — so an interface can tell the truth after a reload.

   The queue is the ONLY record that a correction is still on this device.
   Before this, "waiting to send" lived in React state, so a reload showed a
   pressed thumb with no explanation while the item sat in localStorage. Every
   reader below derives from the storage itself, so the screen and the queue
   cannot disagree.
   ========================================================================== */

/** The raw serialized queue: a stable primitive, safe as a React snapshot.
 *  Two calls with no change between them return the identical string. */
export function snapshot(): string {
  if (!canUse()) return '';
  try { return window.localStorage.getItem(OUTBOX_KEY) ?? ''; } catch { return ''; }
}

/** Subscribe to any change in the queue. Returns an unsubscribe.
 *  The callback shape React wants: no arguments. */
export function subscribe(fn: () => void): () => void {
  return onOutboxChange(() => fn());
}

/** Everything still waiting on this device, oldest first. */
export const pendingItems = (): OutboxItem[] => readOutbox();

/** Corrections still waiting, as { priceId: body }. A correction is the only
 *  kind of item the ledger renders a state for, so it is the only kind read
 *  by figure here. */
export function pendingCorrections(): Record<string, { verdict: 'right' | 'wrong'; queuedAt: string }> {
  const out: Record<string, { verdict: 'right' | 'wrong'; queuedAt: string }> = {};
  for (const it of readOutbox()) {
    if (!it.url.endsWith('/api/corrections')) continue;
    const b = it.body as { priceId?: unknown; verdict?: unknown } | null;
    const priceId = b && typeof b.priceId === 'string' ? b.priceId : null;
    const verdict = b && (b.verdict === 'right' || b.verdict === 'wrong') ? b.verdict : null;
    if (priceId && verdict) out[priceId] = { verdict, queuedAt: it.queuedAt };
  }
  return out;
}

/** { priceId: true } for every correction still waiting — the exact shape the
 *  ledger's `queued` map holds, so it can be hydrated from storage on mount. */
export function queuedCorrections(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of Object.keys(pendingCorrections())) out[k] = true;
  return out;
}

/** { priceId: verdict } for every correction still waiting — so the thumb a
 *  person pressed offline is still pressed after a reload, and it is pressed
 *  the way they pressed it. */
export function queuedVerdicts(): Record<string, 'right' | 'wrong'> {
  const out: Record<string, 'right' | 'wrong'> = {};
  for (const [k, v] of Object.entries(pendingCorrections())) out[k] = v.verdict;
  return out;
}

/** One human sentence for a queue of n items. Never says "sent". */
export const waitingLabel = (n: number): string =>
  n === 1 ? '1 correction waiting to send' : `${n} corrections waiting to send`;

/** Everything automatic sending has given up on. Still here, still countable. */
export const stuckItems = (): OutboxItem[] => readOutbox().filter((i) => i.stuck);

/** The sentence for the give-up case. Says what happened and where it is. */
export const stuckLabel = (n: number): string =>
  n === 1
    ? `1 correction has not reached us after ${MAX_TRIES} tries. It is still on this device.`
    : `${n} corrections have not reached us after ${MAX_TRIES} tries. They are still on this device.`;

/** The stuck corrections as plain text a person can paste into an email. No
 *  identifier we invented, no free text they did not type here: the figure, what
 *  they said about it, and when. */
export function stuckText(): string {
  const rows = stuckItems();
  if (!rows.length) return '';
  const lines = rows.map((it) => {
    const b = (it.body ?? {}) as { priceId?: unknown; verdict?: unknown; believedValueUsd?: unknown };
    const priceId = typeof b.priceId === 'string' ? b.priceId : '(unknown figure)';
    const verdict = b.verdict === 'wrong' ? 'this figure is wrong for me' : 'this figure is right for me';
    const believed = typeof b.believedValueUsd === 'number' ? ` · what I paid: $${b.believedValueUsd}` : '';
    return `- ${priceId}: ${verdict}${believed} (first tried ${it.queuedAt})`;
  });
  return [
    'Waypoint Ledger — a correction that did not reach the server.',
    'Sent by hand because the site could not deliver it.',
    '',
    ...lines,
    '',
    'bo@precisionfederal.com',
  ].join('\n');
}

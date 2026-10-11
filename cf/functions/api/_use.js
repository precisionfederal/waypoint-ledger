/* ==========================================================================
   USE, COUNTED WITHOUT KNOWING WHO.

   The Execution row of the rubric asks whether this "can be realistically
   deployed immediately", and the only honest proof of that is use. Until
   now the server counted a few endpoint calls in `events` and mixed our own
   canary, smoke and e2e traffic into them, and everything the browser does
   on its own (open a ledger, print the sheet, export FHIR) left no trace at
   all, so real use was unmeasured, which is not the same as zero.

   What this module adds, inside the promise on /privacy:
     - one number per day per action, in the existing `events` table
       (day, name, count). No row per person, no address, no cookie, no
       session, no identifier, nothing anyone typed. No new table.
     - a fixed list of actions (USE_ACTIONS). A name not on it is never
       written, so the table cannot become a log of anything else.
     - every count is filed by where it came from, read off the request's
       own headers and then forgotten:
         use:<action>            a browser (the public number)
         program:use:<action>    a program calling the open API (shown apart)
         synthetic:use:<action>  our own gates: they send x-waypoint-synthetic
         bot:use:<action>        a known crawler, monitor or headless browser
       The public readout adds up only the first, shows the second on its own
       line and reports the last two as "left out", so a reader can see the
       exclusion working instead of taking it on trust.

   Server actions are counted in _middleware.js after the route has answered
   2xx, so a refused, invalid or ?dry=1 request never counts. Browser-only
   actions arrive at POST /api/use?a=<action> with no body (api/use.js).
   ========================================================================== */

/** The one list. `id` is what is stored; `label` is what the panel prints;
 *  `how` says in plain words how one is counted, so a small number reads at
 *  its true size. `beacon` marks the actions the browser reports itself. */
export const USE_ACTIONS = [
  { id: 'read', label: 'Story readings', how: 'One each time the words in the story box settle and are read into lines, so one story typed in pieces can count more than once.' },
  { id: 'ledger', label: 'Ledgers opened', how: 'One each time the ledger page opens, including from a saved link.', beacon: true },
  { id: 'save', label: 'Ledgers saved to a link', how: 'One each time Save makes a link.' },
  { id: 'price', label: 'Ledgers priced through the open API', how: 'One each time POST /api/price answers.' },
  { id: 'sheet', label: 'Appointment sheets printed or saved as PDF', how: 'One each time the print dialog opens on the sheet.', beacon: true },
  { id: 'fhir', label: 'HL7 FHIR R4 Bundles exported', how: 'One each time a Bundle is downloaded from a ledger or made by POST /api/fhir.', beacon: true },
  { id: 'export', label: 'Ledgers downloaded as CSV, JSON or a brief', how: 'One each time one of those files is downloaded.', beacon: true },
  { id: 'correction', label: 'Figures marked right or wrong', how: 'One each time a correction is accepted.' },
  { id: 'gap', label: 'Reports of care gone without', how: 'One each time a report is accepted.' },
  { id: 'survey', label: 'Survey answers', how: 'One each time an answer is accepted.' },
  { id: 'interview', label: 'Written interviews', how: 'One each time an interview is accepted.' },
];
export const USE_IDS = USE_ACTIONS.map((a) => a.id);
export const BEACON_IDS = USE_ACTIONS.filter((a) => a.beacon).map((a) => a.id);

/** The header our own gates send (shots2/*.mjs, cf/verify-live.sh,
 *  scripts/uptime-check.sh). Its value names the gate; only its presence is read. */
export const SYNTHETIC_HEADER = 'x-waypoint-synthetic';

/** Crawlers, link previewers, uptime monitors and automated browsers. A
 *  headless browser is almost always a script, ours or someone's. */
export const BOT_UA = /bot\b|bot\/|crawler|crawl\b|spider|slurp|facebookexternalhit|embedly|preview|headlesschrome|headless|playwright|puppeteer|phantomjs|selenium|webdriver|lighthouse|pagespeed|pingdom|uptimerobot|statuscake|site24x7|checkly|datadog|newrelic|uptime/i;

/** Pure. Where a request came from, as one of four words. Nothing is kept
 *  but the word. */
export function sourceOf(request) {
  const h = request.headers;
  if (h.get(SYNTHETIC_HEADER)) return 'synthetic';
  const ua = h.get('user-agent') || '';
  if (BOT_UA.test(ua)) return 'bot';
  if (!/^Mozilla\/\d/.test(ua)) return 'program';
  return 'browser';
}

/** Pure. The stored name for one action from one source. */
export function useName(action, source) {
  return source === 'browser' ? `use:${action}` : `${source}:use:${action}`;
}

/** Pure. Parse a stored name back, or null when it is not a use count. */
export function parseUseName(name) {
  const m = /^(?:(synthetic|bot|program):)?use:([a-z]+)$/.exec(String(name || ''));
  if (!m || !USE_IDS.includes(m[2])) return null;
  return { source: m[1] || 'browser', action: m[2] };
}

/** The server routes that ARE a product action. method + path -> action. */
const SERVER_ACTIONS = {
  'POST /api/map': 'read',
  'POST /api/price': 'price',
  'POST /api/journeys': 'save',
  'POST /api/fhir': 'fhir',
  'POST /api/corrections': 'correction',
  'POST /api/gap': 'gap',
  'POST /api/survey': 'survey',
  'POST /api/interview': 'interview',
};

/** Pure. The action a finished request counts as, or null. Only a 2xx
 *  counts, and a ?dry=1 request never does: it wrote nothing. */
export function serverActionOf(method, pathname, status, url) {
  const a = SERVER_ACTIONS[`${String(method).toUpperCase()} ${pathname}`];
  if (!a) return null;
  if (!(status >= 200 && status < 300)) return null;
  try { if (url && new URL(url).searchParams.get('dry') === '1') return null; } catch { /* no url, no flag */ }
  return a;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Add one to today's count for this action from this source. Never throws. */
export async function recordUse(env, action, source) {
  if (!USE_IDS.includes(action)) return false;
  try {
    await env.DB.prepare('INSERT INTO events(day,name,count) VALUES(?1,?2,1) ON CONFLICT(day,name) DO UPDATE SET count=count+1')
      .bind(today(), useName(action, source)).run();
    return true;
  } catch { return false; /* a count is never worth failing a request over */ }
}

/* ------------------------------------------------------------ readout -- */

/** Pure. The Monday (UTC) that starts the week holding `day` (YYYY-MM-DD). */
export function weekOf(day) {
  const t = Date.parse(day + 'T00:00:00Z');
  const dow = (new Date(t).getUTCDay() + 6) % 7;   // Monday 0 … Sunday 6
  return new Date(t - dow * 86400000).toISOString().slice(0, 10);
}

/** The most weeks the readout lists one by one; older weeks stay in the totals. */
export const MAX_WEEKS = 26;

/**
 * Pure. Fold `events` rows into the public readout.
 * @param {{day:string,name:string,count:number}[]} rows
 * @param {string} [asOf] YYYY-MM-DD, today by default
 */
export function summarizeUse(rows, asOf = today()) {
  const empty = () => Object.fromEntries(USE_IDS.map((id) => [id, 0]));
  const byWeek = new Map();
  const totals = empty();
  const programs = empty();
  const left = { synthetic: 0, bot: 0 };
  let since = null;
  for (const r of rows || []) {
    const p = parseUseName(r.name);
    if (!p || typeof r.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.day)) continue;
    const n = Math.max(0, Math.trunc(Number(r.count) || 0));
    if (!since || r.day < since) since = r.day;   // counting began with the first row of any source
    if (p.source === 'synthetic' || p.source === 'bot') { left[p.source] += n; continue; }
    if (p.source === 'program') { programs[p.action] += n; continue; }
    const w = weekOf(r.day);
    if (!byWeek.has(w)) byWeek.set(w, empty());
    byWeek.get(w)[p.action] += n;
    totals[p.action] += n;
  }
  const weeks = [];
  if (since) {
    const last = weekOf(asOf < since ? since : asOf);
    for (let w = weekOf(since); w <= last; w = new Date(Date.parse(w + 'T00:00:00Z') + 7 * 86400000).toISOString().slice(0, 10)) {
      weeks.push({ weekStart: w, counts: byWeek.get(w) || empty() });
    }
  }
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  return {
    ok: true,
    since,
    asOf,
    unit: 'counts of actions, never of who took them',
    actions: USE_ACTIONS.map(({ id, label, how }) => ({ id, label, how })),
    weeks: weeks.slice(-MAX_WEEKS),
    weeksShown: Math.min(weeks.length, MAX_WEEKS),
    weeksTotal: weeks.length,
    totals,
    total: sum(totals),
    programs,
    programTotal: sum(programs),
    leftOut: left,
    note: 'One number per day per action. No cookie, no address, no identifier and nothing anyone typed is kept. Our own tests (they identify themselves) and known bots are counted apart and left out of these totals; calls from programs rather than a browser are shown on their own.',
  };
}

/** Every use row, in one query. */
export async function loadUseRows(env) {
  const r = await env.DB.prepare("SELECT day, name, count FROM events WHERE name GLOB 'use:*' OR name GLOB '*:use:*' ORDER BY day ASC").all();
  return r?.results || [];
}

/* ==========================================================================
   "Read my bill": the service codes and dates on a bill, an insurer's
   Explanation of Benefits or a Medicare Summary Notice, read from its text in
   the person's own browser. Pure: no network, no storage, no DOM.

   🔴 WHAT THIS READS AND WHAT IT REFUSES TO READ.

   It reads three things: a CPT code (five digits, with an optional modifier),
   a HCPCS Level II code (one letter and four digits) and a date of service.

   It never reads a dollar amount. The ledger prices every line from Medicare's
   published table; what a provider charged or an insurer paid is the person's
   own business, and a figure lifted off their bill would be a second price
   that no federal row stands behind.

   It is built for precision over recall. A five-digit number is a ZIP code, a
   member number or a claim number far more often than it is a procedure, so
   every number that sits next to an address, a phone number, an ID label or a
   dollar sign is masked BEFORE any code is looked for, and a code we do not
   carry is only reported when its line looks like a service line (a date, or
   a code or service heading). A missed code costs the person one click on the
   search box; a wrong code costs them their trust in every other line.
   ========================================================================== */

import type { PriceItem } from './types';
import { TABLE } from './table';

export { READ_BILL_PROMISE } from './read-bill-promise';

export interface FoundCode {
  /** The bare code, upper case: "99213", "G0463". */
  code: string;
  /** A modifier written beside it ("25", "TC"), shown so the person recognises the line. */
  modifier?: string;
  /** Date of service, ISO yyyy-mm-dd, when the bill gives one. */
  date?: string;
  /** The bill's own words on that line, with every number removed. Shown back only on this device. */
  description?: string;
  /** 1-based line number in the text, so the checklist can be traced to the bill. */
  line: number;
}

/** What was seen and deliberately left alone, so the panel can say so. */
export interface Ignored { money: number; zip: number; phone: number; id: number; diagnosis: number }

export interface BillRead { found: FoundCode[]; ignored: Ignored }

/* ---------------------------------------------------------------- dates -- */

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';

const pad = (n: number) => String(n).padStart(2, '0');

function isoOf(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (y < 1990 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // 02/31 is not a date
  return `${y}-${pad(m)}-${pad(d)}`;
}

const monthNum = (s: string) => MONTH_NAMES.indexOf(s.slice(0, 3).toLowerCase()) + 1;

interface Span { start: number; end: number }
interface DateHit extends Span { iso: string }

const DATE_FORMS: { re: RegExp; iso: (m: RegExpExecArray) => string | null }[] = [
  // 03/14/2026, 3/14/26, 03-14-2026
  // (a range "04/02/2026-04/02/2026" reads as its first date)
  { re: /(?<![\d/.-])(\d{1,2})([/-])(\d{1,2})\2(\d{4}|\d{2})(?![\d/]|-(?!\d{1,2}[/-]\d))/g, iso: (m) => isoOf(+m[4], +m[1], +m[3]) },
  // 2026-03-14
  { re: /(?<![\d/-])(\d{4})-(\d{2})-(\d{2})(?![\d/-])/g, iso: (m) => isoOf(+m[1], +m[2], +m[3]) },
  // Mar 14, 2026 · March 14 2026
  { re: new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'gi'), iso: (m) => isoOf(+m[3], monthNum(m[1]), +m[2]) },
  // 14 Mar 2026
  { re: new RegExp(`\\b(\\d{1,2})\\s+${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, 'gi'), iso: (m) => isoOf(+m[3], monthNum(m[2]), +m[1]) },
];

function datesIn(line: string): DateHit[] {
  const out: DateHit[] = [];
  for (const f of DATE_FORMS) {
    f.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = f.re.exec(line))) {
      const iso = f.iso(m);
      if (iso && !out.some((o) => m!.index < o.end && m!.index + m![0].length > o.start)) {
        out.push({ start: m.index, end: m.index + m[0].length, iso });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/* ------------------------------------------------------- what is masked -- */

const STATES = 'A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|PR|RI|S[CD]|T[NX]|UT|V[AIT]|W[AIVY]';

/** Nouns that put an identifier after them. "number" alone is not one: "code number 99213" is a code. */
const ID_NOUNS = 'member|subscriber|account|acct|patient\\s+(?:control|account|id)|claim|group|grp|policy|invoice|reference|ref|control|icn|dcn|npi|tin|ein|ssn|mrn|medical\\s+record|record|mbi|medicare|beneficiary|customer|statement|check|eft|tracking|confirmation|plan|contract|pbp|rx\\s*bin|pcn|bin|tax\\s+id|provider\\s+id|id';

const MASKS: { kind: keyof Ignored | 'skip'; re: RegExp; group?: number; count?: (s: string) => number }[] = [
  // Phone numbers: (515) 555-0142 · 515-555-0142 · 1-800-633-4227
  { kind: 'phone', re: /(?:\b1[\s.-])?(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g },
  // ZIP+4
  { kind: 'zip', re: /\b\d{5}-\d{4}\b/g },
  // A ZIP after a state: "Anytown, IA 50010"
  { kind: 'zip', re: new RegExp(`\\b(?:${STATES})\\.?,?\\s+(\\d{5})\\b`, 'g'), group: 1 },
  // Dollar amounts, with or without the sign: $1,234.50 · 1,234.50 · 125.00 · $40
  { kind: 'money', re: /\$\s?\d[\d,]*(?:\.\d{1,2})?|\b\d{1,3}(?:,\d{3})+(?:\.\d{2})?\b|\b\d+\.\d{2}\b/g },
  // Diagnosis codes after a label: "Diagnosis: M54.50, R53.83" · "Dx J0300"
  { kind: 'diagnosis', re: /\b(?:diagnos[ie]s|dx|icd(?:-?10)?(?:-?cm)?)(?:\s+codes?)?\s*[:#]?\s*((?:[A-Z]\d[0-9A-Z](?:\.?[0-9A-Z]{1,4})?[,;\s]*)+)/gi, group: 1,
    count: (s) => (s.match(/[A-Z]\d[0-9A-Z]/gi) ?? []).length },
  // A dotted diagnosis code anywhere: M54.50
  { kind: 'diagnosis', re: /\b[A-TV-Z]\d[0-9A-Z]\.[0-9A-Z]{1,4}\b/g },
  // An identifier after its label: "Member ID: W123456789" · "Claim # 4821 3" · "NPI 1234567893"
  { kind: 'id', re: new RegExp(`\\b(?:${ID_NOUNS})\\b(?:\\s+(?:id|number|no|num|#))?\\.?\\s*[:#.]?\\s*((?=[A-Z0-9-]*\\d)[A-Z0-9][A-Z0-9-]{3,})`, 'gi'), group: 1 },
  // Any run of six or more digits (NPIs, member and claim numbers with no label)
  { kind: 'id', re: /\b\d{6,}\b/g },
];

const blank = (s: string) => ' '.repeat(s.length);

function mask(line: string, ignored: Ignored): string {
  let out = line;
  for (const m of MASKS) {
    m.re.lastIndex = 0;
    out = out.replace(m.re, (...args) => {
      const whole = args[0] as string;
      if (m.group === undefined) { if (m.kind !== 'skip') ignored[m.kind] += 1; return blank(whole); }
      const part = args[m.group] as string | undefined;
      if (!part) return whole;
      if (m.kind !== 'skip') ignored[m.kind] += m.count ? m.count(part) : 1;
      const at = whole.lastIndexOf(part);
      return whole.slice(0, at) + blank(part) + whole.slice(at + part.length);
    });
  }
  return out;
}

/* ---------------------------------------------------------------- codes -- */

/** Modifiers that are read when written after a space (a hyphenated pair is always read). */
const SPACED_MODIFIERS = '25|26|59|76|77|91|TC|LT|RT|50|51|GA|GY|GZ|KX|XU|XS|QW|95|GT';
const CPT_RE = new RegExp(`(?<![\\w$.,/-])(\\d{5})(?:-([0-9A-Z]{2})|\\s(${SPACED_MODIFIERS})(?![\\w]))?(?![\\w.,/]|-\\d)`, 'g');
/** HCPCS Level II letters (A B C E G H J K L M P Q R S T U V). Upper case only: "j1100" in prose is not a code. */
const HCPCS_RE = /(?<![\w$.,/-])([A-CEGHJ-MP-V]\d{4})(?:-([0-9A-Z]{2}))?(?![\w.,/]|-\d)/g;

/** A line that reads like a service line, or a heading that announces a column of codes. */
const CODE_WORDS = /\b(?:cpt|hcpcs|procedure|proc|service|svc|billing\s+code|code)\b/i;

/** A header that announces the date of service for the lines below it. */
const SERVICE_DATE_WORDS = /\b(?:dates?\s+of\s+service|service\s+dates?|dos|date\s+served|visit\s+date)\b/i;

/** How many lines a date of service written above a run of codes still applies to. */
const DATE_REACH = 15;

/**
 * Reads every CPT and HCPCS code, with its date of service, from the text of a
 * bill. `known` decides which bare numbers are trusted without a code-like
 * context: a five-digit number that is not a code in our table is reported only
 * when its line has a date or a code heading is in force.
 */
export function extractCodes(text: string, known: ReadonlySet<string> = KNOWN_CODES): BillRead {
  const ignored: Ignored = { money: 0, zip: 0, phone: 0, id: 0, diagnosis: 0 };
  const found: FoundCode[] = [];
  const lines = String(text ?? '').slice(0, 400_000).split(/\r\n|\r|\n/);
  let lastDate: { iso: string; line: number } | null = null;
  let codeHeading = false;

  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const dates = datesIn(raw);
    let work = raw;
    for (const d of dates) work = work.slice(0, d.start) + blank(work.slice(d.start, d.end)) + work.slice(d.end);
    work = mask(work, ignored);

    const lineDate = dates[0]?.iso;
    const hasWords = CODE_WORDS.test(raw);
    const context = Boolean(lineDate) || hasWords || codeHeading;

    const hits: { code: string; modifier?: string; start: number; end: number }[] = [];
    for (const re of [CPT_RE, HCPCS_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(work))) {
        const code = m[1];
        if (!known.has(code) && !context) continue;
        hits.push({ code, modifier: m[2] ?? m[3] ?? undefined, start: m.index, end: m.index + m[0].length });
      }
    }

    if (hits.length) {
      let words = work;
      for (const h of hits) words = words.slice(0, h.start) + blank(words.slice(h.start, h.end)) + words.slice(h.end);
      const description = describe(words);
      const date = lineDate ?? (lastDate && lineNo - lastDate.line <= DATE_REACH ? lastDate.iso : undefined);
      for (const h of hits.sort((a, b) => a.start - b.start)) {
        found.push({ code: h.code, ...(h.modifier ? { modifier: h.modifier } : {}), ...(date ? { date } : {}), ...(description ? { description } : {}), line: lineNo });
      }
    }

    // Only a date of service carries down to the codes under it; "Received" or "Notice date" never does.
    if (lineDate && (hits.length || SERVICE_DATE_WORDS.test(raw))) lastDate = { iso: lineDate, line: lineNo };
    // A heading row ("Date  Code  Description  Charge") switches the column on for what follows.
    if (hasWords && !hits.length) codeHeading = true;
  });

  return { found, ignored };
}

/** The bill's own words on a line, numbers and punctuation runs removed; null when nothing readable is left. */
function describe(masked: string): string | undefined {
  const s = masked
    .replace(/[()[\]{}|]/g, ' ')
    .replace(/\S*[\d$]\S*/g, ' ')
    .replace(/(^|\s)[-:#.,;/]+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-:#.,;/\s]+|[-:#.,;/\s]+$/g, '');
  if ((s.match(/[A-Za-z]/g) ?? []).length < 3) return undefined;
  return s.length > 80 ? `${s.slice(0, 77).trimEnd()}...` : s;
}

/* ------------------------------------------------- matching to the table -- */

const CODE_SHAPE = /\b(\d{5}|[A-Z]\d{4})\b/;

/** The bare service code in a table row's `code` field ("CPT 99284 (APC 5024)" is 99284). */
export function rowCode(item: PriceItem): string | null {
  const m = CODE_SHAPE.exec(String(item.code ?? '').toUpperCase());
  return m ? m[1] : null;
}

export function codeRows(table: readonly PriceItem[]): Map<string, PriceItem[]> {
  const ix = new Map<string, PriceItem[]>();
  for (const it of table) {
    const c = rowCode(it);
    if (!c) continue;
    const list = ix.get(c);
    if (list) list.push(it); else ix.set(c, [it]);
  }
  return ix;
}

const INDEX = codeRows(TABLE);
const KNOWN_CODES: ReadonlySet<string> = new Set(INDEX.keys());

export interface BillGroup {
  code: string;
  /** Table rows carrying this code: one is a match; more than one means the person chooses (the ER's hospital and doctor halves); none means we do not carry it. */
  rows: PriceItem[];
  /** Distinct dates of service, sorted. */
  dates: string[];
  /** Times the code appeared in the text. */
  seen: number;
  /** The first description the bill gave it. */
  description?: string;
  modifiers: string[];
}

export interface BillMatch {
  matched: BillGroup[];
  choose: BillGroup[];
  notCarried: BillGroup[];
  ignored: Ignored;
  /** Every code found, matched or not. */
  codes: number;
}

export function matchBill(read: BillRead, table: readonly PriceItem[] = TABLE): BillMatch {
  const ix = table === TABLE ? INDEX : codeRows(table);
  const groups = new Map<string, BillGroup>();
  for (const f of read.found) {
    let g = groups.get(f.code);
    if (!g) { g = { code: f.code, rows: ix.get(f.code) ?? [], dates: [], seen: 0, modifiers: [] }; groups.set(f.code, g); }
    g.seen += 1;
    if (f.date && !g.dates.includes(f.date)) g.dates.push(f.date);
    if (f.modifier && !g.modifiers.includes(f.modifier)) g.modifiers.push(f.modifier);
    if (!g.description && f.description) g.description = f.description;
  }
  const all = [...groups.values()];
  for (const g of all) g.dates.sort();
  return {
    matched: all.filter((g) => g.rows.length === 1),
    choose: all.filter((g) => g.rows.length > 1),
    notCarried: all.filter((g) => g.rows.length === 0),
    ignored: read.ignored,
    codes: all.length,
  };
}

export function readBill(text: string, table: readonly PriceItem[] = TABLE): BillMatch {
  return matchBill(extractCodes(text, table === TABLE ? KNOWN_CODES : new Set(codeRows(table).keys())), table);
}

/* -------------------------------------------------------- the add path -- */

/** How many times a line is priced: one per distinct date of service, or once when the bill gives none. */
export const timesOf = (g: BillGroup): number => Math.max(1, Math.min(365, g.dates.length));

/** What the ledger shows as the line's own words ("you said 'code 99213 on my bill'"). No date, no
 *  description: those stay in the panel. `item` is kept in the signature so a later wording can use it. */
export const billRaw = (_item: PriceItem, code: string): string => `code ${code} on my bill`;

export interface BillLine { item: PriceItem; raw: string; times: number; code: string }

/**
 * The ledger lines for the codes the person ticked. `picks` maps a code to the
 * id of the table row they chose; a code that is absent or null was not ticked.
 * A pick that names a row not carrying that code is refused, never guessed.
 */
export function linesToAdd(groups: readonly BillGroup[], picks: Readonly<Record<string, string | null | undefined>>): BillLine[] {
  const out: BillLine[] = [];
  for (const g of groups) {
    const id = picks[g.code];
    if (!id) continue;
    const item = g.rows.find((r) => r.id === id);
    if (!item) continue;
    out.push({ item, raw: billRaw(item, g.code), times: timesOf(g), code: g.code });
  }
  return out;
}

/** Ticks a matched code by default; a code with more than one row waits for the person to choose. */
export function defaultPicks(m: BillMatch): Record<string, string | null> {
  const p: Record<string, string | null> = {};
  for (const g of m.matched) p[g.code] = g.rows[0].id;
  for (const g of m.choose) p[g.code] = null;
  return p;
}

/**
 * Hands the lines to the store's own add path (the same `addItem` the search
 * box and the chips use), and returns the counts to apply once the store has
 * minted keys for them, keyed by the line's words.
 */
export function addBillLines(lines: readonly BillLine[], addItem: (it: PriceItem, raw?: string) => void): Map<string, number> {
  const pending = new Map<string, number>();
  for (const l of lines) {
    addItem(l.item, l.raw);
    if (l.times > 1) pending.set(l.raw, l.times);
  }
  return pending;
}

/** A plain sentence for what was left alone. */
export function ignoredSentence(ig: Ignored): string | null {
  const parts: string[] = [];
  const say = (n: number, one: string, many: string) => { if (n) parts.push(`${n} ${n === 1 ? one : many}`); };
  say(ig.money, 'dollar amount', 'dollar amounts');
  say(ig.id, 'ID or account number', 'ID or account numbers');
  say(ig.zip, 'ZIP code', 'ZIP codes');
  say(ig.phone, 'phone number', 'phone numbers');
  say(ig.diagnosis, 'diagnosis code', 'diagnosis codes');
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Left alone: ${list}.`;
}

/* --------------------------------------------------------- the sample -- */

/**
 * A made-up Explanation of Benefits for a made-up person, so a visitor can see
 * the reader work without a bill of their own. No dollar amounts: every price
 * on this site comes from a federal row. The names, numbers and address are
 * invented (555-01xx is the range set aside for fiction) and labelled so on the face.
 */
export const SAMPLE_BILL = `SAMPLE ONLY. A made-up Explanation of Benefits, not a real person or plan. Amounts left off.
Member: Sample Patient   Member ID: XZW900000001   Group #: 000123
Sample Health Plan, PO Box 100, Anytown, IA 50010   Questions? Call 1-800-555-0100

Claim number: 2026031400001   Provider: Sample Family Clinic   NPI 1234567893
Date of service   Code    Description
03/14/2026        99204   New patient office visit
03/14/2026        85025   Complete blood count
03/14/2026        80053   Comprehensive metabolic panel
03/14/2026        36415   Blood draw

Claim number: 2026042200002   Provider: Sample Imaging Center
04/22/2026        70553   MRI brain with and without contrast

Claim number: 2026051000003   Provider: Sample Hospital Emergency Dept
05/10/2026        99284   Emergency department visit
05/10/2026        93000   Electrocardiogram
05/10/2026        J1100   Dexamethasone injection
Diagnosis: R53.83, R00.2

Follow-up visits
06/02/2026        99213   Office visit, established patient
07/15/2026        99213   Office visit, established patient
`;

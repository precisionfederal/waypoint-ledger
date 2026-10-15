/* ==========================================================================
   ZIP → MEDICARE PAYMENT LOCALITY, from CMS's own file.

   A state is not where CMS prices you. California is 27 localities, Texas 8,
   New York 5, and nobody knows which one they live in. Everybody knows their
   ZIP. CMS publishes the answer: the Zip Code to Carrier Locality File
   (ZIP5_OCT2026.txt, every ZIP; ZIP9_OCT2026.txt, the ZIP+4 rows for the ZIPs
   it prices in more than one locality). data/build_zip_locality.py joins each
   row's carrier + pricing locality to the same GPCI2026 rows the prices come
   from, and this module only reads what that script wrote.

   🔴 NOTHING IS GUESSED. A ZIP that is not in CMS's file is reported as not in
   it. A ZIP CMS splits between localities resolves only with the +4 CMS lists;
   without it the person is shown the localities and picks. A typed ZIP never
   leaves the browser: the lookup fetches two whole static files from this
   site, the same bytes for everybody, and no digit of the ZIP is in any URL.
   ========================================================================== */

export interface ZipSource {
  title: string; url: string; page?: string; updated: string;
  effective_quarter?: string; zip5_file?: string; zip5_rows?: number; zip9_file?: string; zip9_rows?: number;
}

export interface ZipBase {
  _source: ZipSource;
  count: number;
  localities: string[];
  /** base64 bitmap, bit z set when ZIP z is in ZIP5 (big-endian within each byte) */
  valid: string;
  /** [count, localityIndex, ...] over the valid ZIPs in ascending order */
  runs: number[];
  /** ZIPs CMS prices in more than one locality, by ZIP+4 */
  split: Record<string, number[]>;
}

/** public/data/zip9-split.json: each split ZIP's listed +4 codes, run-encoded (data/build_zip_locality.py). */
export interface ZipSplit { zips: Record<string, string> }

export type ZipAnswer =
  /** not five digits (with an optional four after a dash or space) */
  | { kind: 'malformed' }
  /** five digits, but not a ZIP in CMS's file */
  | { kind: 'unknown'; zip: string }
  | { kind: 'found'; zip: string; plus4?: string; locality: string; byPlus4: boolean }
  /** CMS prices this ZIP in more than one locality and needs the +4 to say which */
  | { kind: 'split'; zip: string; localities: string[]; plus4?: string; plus4Unlisted?: boolean };

/** "94110", "94110-1234", "94110 1234", "941101234" → parts; anything else → null. */
export function parseZip(input: string): { zip: string; plus4?: string } | null {
  const m = input.trim().match(/^(\d{5})(?:[-\s]?(\d{4}))?$/);
  return m ? { zip: m[1], plus4: m[2] } : null;
}

export interface ZipIndex {
  source: ZipSource;
  /** the ZIP5 answer; for a split ZIP this is the list to pick from */
  zip5(zip: string): ZipAnswer;
  /** resolve a +4 within a split ZIP from CMS's ZIP+4 list */
  plus4(zip: string, plus4: string, nine: ZipSplit): ZipAnswer;
}

export function buildZipIndex(base: ZipBase): ZipIndex {
  const bits = decodeBase64(base.valid);
  const has = (n: number) => n >= 0 && n < 100000 && (bits[n >> 3] & (0x80 >> (n & 7))) !== 0;
  /* Walk the bitmap once, assigning each valid ZIP its run's locality. 42,957
     entries in a typed array: built once, the first time somebody types a ZIP. */
  const loc = new Uint8Array(100000).fill(255);
  let r = 0, left = base.runs[0] ?? 0;
  for (let z = 0; z < 100000; z++) {
    if (!has(z)) continue;
    while (left === 0) { r += 2; left = base.runs[r]; }
    loc[z] = base.runs[r + 1];
    left--;
  }
  return {
    source: base._source,
    zip5(zip) {
      const n = Number(zip);
      if (!/^\d{5}$/.test(zip)) return { kind: 'malformed' };
      if (!has(n)) return { kind: 'unknown', zip };
      const split = base.split[zip];
      if (split) return { kind: 'split', zip, localities: split.map((i) => base.localities[i]) };
      return { kind: 'found', zip, locality: base.localities[loc[n]], byPlus4: false };
    },
    plus4(zip, plus4, nine) {
      const order = base.split[zip] ?? [];
      const p = Number(plus4);
      /* token = gap (base 36) [ "." length-1 (base 36) ] localityPosition (one digit) */
      let end = -1;
      for (const tok of (nine.zips[zip] ?? '').split(' ').filter(Boolean)) {
        const k = Number(tok.slice(-1));
        const [gap, len] = tok.slice(0, -1).split('.');
        const start = end + 1 + parseInt(gap, 36);
        end = start + (len ? parseInt(len, 36) : 0);
        if (p < start) break;
        if (p <= end) return { kind: 'found', zip, plus4, locality: base.localities[order[k]], byPlus4: true };
      }
      return { kind: 'split', zip, plus4, plus4Unlisted: true, localities: order.map((i) => base.localities[i]) };
    },
  };
}

function decodeBase64(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** The whole lookup, given a way to read the two kinds of file. Pure, so the tests drive it from disk. */
export async function resolveZip(
  input: string,
  load: { base: () => Promise<ZipBase>; nine: () => Promise<ZipSplit> },
  cache: { index?: ZipIndex } = {},
): Promise<ZipAnswer & { source?: ZipSource }> {
  const parsed = parseZip(input);
  if (!parsed) return { kind: 'malformed' };
  const index = cache.index ?? (cache.index = buildZipIndex(await load.base()));
  const first = index.zip5(parsed.zip);
  if (first.kind !== 'split') return { ...first, ...(first.kind === 'found' && parsed.plus4 ? { plus4: parsed.plus4 } : {}), source: index.source };
  if (!parsed.plus4) return { ...first, source: index.source };
  return { ...index.plus4(parsed.zip, parsed.plus4, await load.nine()), source: index.source };
}

/* ---- in the browser: fetch from this site, once, only when a ZIP is typed ---- */

const memo: { index?: ZipIndex; base?: Promise<ZipBase>; nine?: Promise<ZipSplit> } = {};

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(path, { credentials: 'omit' });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

export function lookupZip(input: string) {
  return resolveZip(input, {
    base: () => (memo.base ??= getJson<ZipBase>('/data/zip-locality.json').catch((e) => { memo.base = undefined; throw e; })),
    nine: () => (memo.nine ??= getJson<ZipSplit>('/data/zip9-split.json').catch((e) => { memo.nine = undefined; throw e; })),
  }, memo);
}

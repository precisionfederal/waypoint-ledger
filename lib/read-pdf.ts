/* ==========================================================================
   The text layer of a PDF, read in the browser with no library.

   A bill or an Explanation of Benefits saved from a portal is almost always a
   PDF with real text in it. This reads that text the way a viewer would: it
   finds each stream, inflates the compressed ones with the browser's own
   DecompressionStream('deflate'), and pulls the strings shown by the Tj, TJ,
   ' and " operators, turning each move to a new baseline into a line break.
   Fonts that number their glyphs (Identity-H) are decoded through the font's
   own ToUnicode map, which is how most portals write their PDFs.

   A scanned bill has no text layer: it is a picture of the page. That is
   reported as a scan so the person can be asked to paste instead; this file
   never guesses at a picture.

   Nothing here touches the network. The bytes come from a file the person
   dropped or chose, and they stay in this tab.
   ========================================================================== */

export type PdfOutcome =
  | { kind: 'text'; text: string; pages: number }
  | { kind: 'scan'; pages: number }
  | { kind: 'locked' }
  | { kind: 'empty' }
  | { kind: 'not-pdf' };

interface PdfObject { num: number; dict: string; stream: Uint8Array | null }

const latin1 = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return s;
};

/** Inflates a zlib (FlateDecode) stream. Keeps what came out before any error, as viewers do with a damaged tail. */
export async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const run = async (format: 'deflate' | 'deflate-raw'): Promise<Uint8Array> => {
    const ds = new DecompressionStream(format);
    const writer = ds.writable.getWriter();
    writer.write(data as unknown as BufferSource).catch(() => {});
    writer.close().catch(() => {});
    const reader = ds.readable.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); total += value.length;
        if (total > 50_000_000) break; // a page of a bill is never 50 MB of text
      }
    } catch { /* junk after the end of the data: keep what was read */ }
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  };
  const z = await run('deflate');
  if (z.length || data.length < 2) return z;
  return run('deflate-raw');
}

/* -------------------------------------------------------------- objects -- */

function parseObjects(src: string, bin: Uint8Array): PdfObject[] {
  const objs: PdfObject[] = [];
  const re = /(\d+)\s+\d+\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    const end = src.indexOf('endobj', start);
    if (end < 0) break;
    const body = src.slice(start, end);
    const si = body.search(/\bstream(\r\n|\n|\r)/);
    if (si < 0) { objs.push({ num: +m[1], dict: body, stream: null }); re.lastIndex = end; continue; }
    const dict = body.slice(0, si);
    const eol = /\bstream(\r\n|\n|\r)/.exec(body.slice(si))!;
    const dataStart = start + si + eol[0].length;
    const lenM = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    let dataEnd = src.indexOf('endstream', dataStart);
    if (dataEnd < 0) break;
    if (lenM && dataStart + +lenM[1] <= dataEnd) dataEnd = dataStart + +lenM[1];
    else while (dataEnd > dataStart && (src[dataEnd - 1] === '\n' || src[dataEnd - 1] === '\r')) dataEnd--;
    objs.push({ num: +m[1], dict, stream: bin.subarray(dataStart, dataEnd) });
    re.lastIndex = Math.max(end, src.indexOf('endstream', dataStart));
  }
  return objs;
}

const filtersOf = (dict: string): string[] => {
  const m = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict);
  return m ? (m[1].match(/\/\w+/g) ?? []).map((f) => f.slice(1)) : [];
};

async function decode(o: PdfObject): Promise<Uint8Array | null> {
  if (!o.stream) return null;
  const f = filtersOf(o.dict);
  if (!f.length) return o.stream;
  if (f.length === 1 && (f[0] === 'FlateDecode' || f[0] === 'Fl')) return inflate(o.stream);
  return null; // images (DCT, CCITT, JBIG2) and chains we do not read
}

/** The objects packed inside compressed object streams (PDF 1.5+), where font dictionaries usually live. */
function unpackObjStm(dict: string, data: string): PdfObject[] {
  const n = +(/\/N\s+(\d+)/.exec(dict)?.[1] ?? 0);
  const first = +(/\/First\s+(\d+)/.exec(dict)?.[1] ?? 0);
  const head = data.slice(0, first).trim().split(/\s+/).map(Number);
  const out: PdfObject[] = [];
  for (let i = 0; i < n && 2 * i + 1 < head.length; i++) {
    const s = first + head[2 * i + 1];
    const e = 2 * i + 3 < head.length ? first + head[2 * i + 3] : data.length;
    out.push({ num: head[2 * i], dict: data.slice(s, e), stream: null });
  }
  return out;
}

/* ------------------------------------------------------------ ToUnicode -- */

interface CMap { width: number; map: Map<number, string> }

const hexText = (h: string): string => {
  let s = '';
  for (let i = 0; i + 4 <= h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
  if (h.length % 4 === 2) s += String.fromCharCode(parseInt(h.slice(-2), 16));
  return s;
};

export function parseCMap(src: string): CMap {
  const map = new Map<number, string>();
  let width = 1;
  for (const block of src.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    for (const m of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      width = Math.max(width, m[1].length / 2);
      map.set(parseInt(m[1], 16), hexText(m[2]));
    }
  }
  for (const block of src.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    for (const m of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])/g)) {
      width = Math.max(width, m[1].length / 2);
      const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
      if (hi - lo > 65535) continue;
      if (m[3].startsWith('[')) {
        const list = [...m[3].matchAll(/<([0-9A-Fa-f]*)>/g)].map((x) => hexText(x[1]));
        list.forEach((t, i) => map.set(lo + i, t));
      } else {
        const base = m[3].slice(1, -1);
        const head = base.slice(0, -4), last = parseInt(base.slice(-4) || '0', 16);
        for (let c = lo; c <= hi; c++) map.set(c, hexText(head) + String.fromCharCode(last + (c - lo)));
      }
    }
  }
  return { width, map };
}

/* --------------------------------------------------- content operators -- */

type Tok = { t: 'str'; v: string } | { t: 'num'; v: number } | { t: 'name'; v: string } | { t: 'arr'; v: Tok[] } | { t: 'op'; v: string };

function readLiteral(s: string, i: number): [string, number] {
  let depth = 1, out = '';
  i++;
  while (i < s.length && depth > 0) {
    const c = s[i];
    if (c === '\\') {
      const n = s[i + 1];
      const esc: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
      if (n in esc) { out += esc[n]; i += 2; continue; }
      if (/[0-7]/.test(n)) { const o = /^[0-7]{1,3}/.exec(s.slice(i + 1))![0]; out += String.fromCharCode(parseInt(o, 8) & 0xff); i += 1 + o.length; continue; }
      if (n === '\r' || n === '\n') { i += n === '\r' && s[i + 2] === '\n' ? 3 : 2; continue; }
      i += 1; continue;
    }
    if (c === '(') depth++;
    if (c === ')' && --depth === 0) { i++; break; }
    out += c; i++;
  }
  return [out, i];
}

function* tokens(s: string): Generator<Tok> {
  let i = 0;
  const stack: Tok[][] = [];
  const emit = function* (t: Tok): Generator<Tok> { if (stack.length) stack[stack.length - 1].push(t); else yield t; };
  while (i < s.length) {
    const c = s[i];
    if (c === '%') { while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(') { const [v, j] = readLiteral(s, i); i = j; yield* emit({ t: 'str', v }); continue; }
    if (c === '<' && s[i + 1] === '<') { i += 2; yield* emit({ t: 'op', v: '<<' }); continue; }
    if (c === '>' && s[i + 1] === '>') { i += 2; yield* emit({ t: 'op', v: '>>' }); continue; }
    if (c === '<') {
      const j = s.indexOf('>', i);
      const hex = s.slice(i + 1, j < 0 ? s.length : j).replace(/\s/g, '');
      const h = hex.length % 2 ? `${hex}0` : hex;
      let v = '';
      for (let k = 0; k < h.length; k += 2) v += String.fromCharCode(parseInt(h.slice(k, k + 2), 16));
      i = j < 0 ? s.length : j + 1;
      yield* emit({ t: 'str', v });
      continue;
    }
    if (c === '[') { stack.push([]); i++; continue; }
    if (c === ']') { i++; const a = stack.pop(); if (a) yield* emit({ t: 'arr', v: a }); continue; }
    if (c === '/') { const m = /^\/[^\s/<>()[\]{}%]*/.exec(s.slice(i, i + 128))!; i += m[0].length; yield* emit({ t: 'name', v: m[0].slice(1) }); continue; }
    const m = /^[+-]?(?:\d+\.?\d*|\.\d+)/.exec(s.slice(i, i + 32));
    if (m) { i += m[0].length; yield* emit({ t: 'num', v: parseFloat(m[0]) }); continue; }
    const op = /^[^\s/<>()[\]{}%]+/.exec(s.slice(i, i + 32));
    if (op) {
      i += op[0].length;
      if (op[0] === 'BI') { const e = s.indexOf('EI', i); i = e < 0 ? s.length : e + 2; continue; } // inline image: skip its bytes
      yield* emit({ t: 'op', v: op[0] });
      continue;
    }
    i++;
  }
}

function showText(raw: string, cmap: CMap | undefined): string {
  if (!cmap) return raw;
  let out = '';
  for (let i = 0; i < raw.length; i += cmap.width) {
    let code = 0;
    for (let k = 0; k < cmap.width; k++) code = (code << 8) | (raw.charCodeAt(i + k) & 0xff);
    out += cmap.map.get(code) ?? '';
  }
  return out;
}

/**
 * The text a content stream shows, one line per baseline. `fonts` maps a font
 * resource name to its ToUnicode map. Positions are tracked well enough to
 * tell a new line from a new column: a change of baseline is a line break, a
 * jump along the same baseline is a space, and glyphs drawn one at a time stay
 * one word. Glyph widths are estimated at half the font size; nothing here is
 * used for anything but deciding where the breaks go.
 */
export function textOfContent(content: string, fonts: ReadonlyMap<string, CMap> = new Map()): string {
  let out = '';
  let font: CMap | undefined;
  let size = 10, scale = 1, leading = 0;
  let lineX = 0, lineY = 0, x = 0, y = 0;
  let shownY: number | null = null, endX = 0, forceNl = false;
  let ops: Tok[] = [];
  const nl = () => { if (out && !out.endsWith('\n')) out = `${out.trimEnd()}\n`; };
  const sp = () => { if (out && !/\s$/.test(out)) out += ' '; };
  const eff = () => Math.max(0.1, Math.abs(size * scale));
  const show = (text: string) => {
    if (!text) return;
    if (shownY !== null) {
      if (forceNl || Math.abs(y - shownY) > Math.max(1, eff() * 0.3)) nl();
      else if (x - endX > eff() * 0.25 || x < endX - eff() * 2) sp();
    }
    out += text;
    shownY = y;
    x += text.length * eff() * 0.5;
    endX = x;
    forceNl = false;
  };
  const moveTo = (nx: number, ny: number) => { lineX = nx; lineY = ny; x = nx; y = ny; };
  for (const t of tokens(content)) {
    if (t.t !== 'op') { ops.push(t); continue; }
    const nums = ops.filter((o): o is { t: 'num'; v: number } => o.t === 'num').map((o) => o.v);
    switch (t.v) {
      case 'BT': moveTo(0, 0); scale = 1; break;
      case 'Tf': { const n = ops.find((o) => o.t === 'name'); font = n ? fonts.get(n.v as string) : undefined; size = nums[nums.length - 1] ?? size; break; }
      case 'TL': leading = nums[0] ?? leading; break;
      case 'Td': case 'TD': {
        const [tx = 0, ty = 0] = nums.slice(-2);
        if (t.v === 'TD') leading = -ty;
        moveTo(lineX + tx * scale, lineY + ty * scale);
        break;
      }
      case 'Tm': {
        if (nums.length >= 6) { const [a, b, , , e, f] = nums.slice(-6); scale = Math.hypot(a, b) || 1; moveTo(e, f); }
        break;
      }
      case 'T*': moveTo(lineX, lineY - (leading || size) * scale); forceNl = true; break;
      case 'Tj': { const s = ops.find((o) => o.t === 'str'); if (s) show(showText(s.v as string, font)); break; }
      case "'": case '"': {
        moveTo(lineX, lineY - (leading || size) * scale); forceNl = true;
        const s = [...ops].reverse().find((o) => o.t === 'str');
        if (s) show(showText(s.v as string, font));
        break;
      }
      case 'TJ': {
        const a = ops.find((o) => o.t === 'arr');
        for (const e of (a?.v as Tok[] | undefined) ?? []) {
          if (e.t === 'str') show(showText(e.v, font));
          else if (e.t === 'num') { if (e.v < -200) sp(); x -= (e.v / 1000) * eff(); endX = x; }
        }
        break;
      }
      default: break;
    }
    ops = [];
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, '  ').trim();
}

/* ------------------------------------------------------------ the read -- */

const isPdf = (b: Uint8Array) => b.length > 4 && latin1(b.subarray(0, 1024)).includes('%PDF-');

/** Reads the text layer of a PDF file's bytes. */
export async function readPdfText(bytes: Uint8Array): Promise<PdfOutcome> {
  if (!isPdf(bytes)) return { kind: 'not-pdf' };
  const src = latin1(bytes);
  if (/\/Encrypt\s+\d+\s+\d+\s+R|\/Encrypt\s*<</.test(src)) return { kind: 'locked' };

  const objs = parseObjects(src, bytes);
  const decoded = new Map<number, string>();
  for (const o of objs) {
    if (!o.stream) continue;
    if (/\/Subtype\s*\/Image/.test(o.dict)) continue;
    const d = await decode(o);
    if (d) decoded.set(o.num, latin1(d));
  }
  for (const o of objs) {
    if (/\/Type\s*\/ObjStm/.test(o.dict) && decoded.has(o.num)) objs.push(...unpackObjStm(o.dict, decoded.get(o.num)!));
  }

  const byNum = new Map(objs.map((o) => [o.num, o] as const));
  const pages = objs.filter((o) => /\/Type\s*\/Page(?!s)\b/.test(o.dict)).length;

  // Fonts: a resource name ("/F1 7 0 R") whose object is a font with a ToUnicode map.
  const fonts = new Map<string, CMap>();
  for (const o of objs) {
    for (const m of o.dict.matchAll(/\/([^\s/<>()[\]{}%]+)\s+(\d+)\s+\d+\s+R/g)) {
      const f = byNum.get(+m[2]);
      if (!f || !/\/Type\s*\/Font/.test(f.dict)) continue;
      const tu = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(f.dict);
      const cm = tu ? decoded.get(+tu[1]) : undefined;
      if (cm && !fonts.has(m[1])) fonts.set(m[1], parseCMap(cm));
    }
  }

  // Page content: every decoded stream that shows text and is not a font map or an object stream.
  const parts: string[] = [];
  for (const o of objs) {
    const d = decoded.get(o.num);
    if (!d || !/\bBT\b/.test(d) || /begincmap/.test(d) || /\/Type\s*\/(ObjStm|XRef|Metadata)/.test(o.dict)) continue;
    const t = textOfContent(d, fonts);
    if (t) parts.push(t);
  }
  const text = parts.join('\n').replace(/\u0000/g, '');
  if ((text.match(/[A-Za-z0-9]/g) ?? []).length >= 8) return { kind: 'text', text, pages: Math.max(1, pages) };
  if (/\/Subtype\s*\/Image/.test(src)) return { kind: 'scan', pages: Math.max(1, pages) };
  return { kind: 'empty' };
}


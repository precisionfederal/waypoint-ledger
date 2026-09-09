/* ==========================================================================
   qr.ts — a QR Code encoder. Byte mode, versions 1–7, all four ECC levels.
   ISO/IEC 18004.

   Written here rather than installed: the register prints one fixed URL, and
   a page whose whole argument is "you can check this yourself" should not add
   a supply chain to draw a square. Public domain, like the rest of our own
   work on this site.

   Verified module for module against segno 1.6.6, an independent MIT
   implementation: 480 of 480 symbols identical, every version 1–7 × every ECC
   level × every mask, on a payload that exactly fills the symbol, on the
   shortest payload that needs that version, and on the URL the register
   prints. Run it: scripts/qr-verify.mjs, which explains the two places segno
   itself departs from ISO/IEC 18004 (it pads one codeword too many, and its
   automatic mask choice is not the penalty rule) and normalises them.
   ========================================================================== */

export type Ecl = 'L' | 'M' | 'Q' | 'H';

/* Per version: EC codewords per block, then [block count, data codewords per
   block] groups. ISO/IEC 18004 Table 9. Index 0 is unused so index === version. */
type Spec = [number, [number, number][]];
const BLOCKS: Record<Ecl, (Spec | null)[]> = {
  L: [null, [7, [[1, 19]]], [10, [[1, 34]]], [15, [[1, 55]]], [20, [[1, 80]]],
      [26, [[1, 108]]], [18, [[2, 68]]], [20, [[2, 78]]]],
  M: [null, [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]],
      [24, [[2, 43]]], [16, [[4, 27]]], [18, [[4, 31]]]],
  Q: [null, [13, [[1, 13]]], [22, [[1, 22]]], [18, [[2, 17]]], [26, [[2, 24]]],
      [18, [[2, 15], [2, 16]]], [24, [[4, 19]]], [18, [[2, 14], [4, 15]]]],
  H: [null, [17, [[1, 9]]], [28, [[1, 16]]], [22, [[2, 13]]], [16, [[4, 9]]],
      [22, [[2, 11], [2, 12]]], [28, [[4, 15]]], [26, [[4, 13], [1, 14]]]],
};
/* Alignment-pattern centre coordinates, by version. */
const ALIGN: number[][] = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38]];
const ECL_BITS: Record<Ecl, number> = { L: 1, M: 0, Q: 3, H: 2 };

/* ------------------------------------------------------------ GF(256), 0x11D */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/* The generator polynomial for n error-correction codewords: ∏ (x − α^i). */
function genPoly(n: number): number[] {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
    g = next;
  }
  return g;
}

function ecCodewords(data: number[], n: number): number[] {
  const g = genPoly(n);
  const rem = new Array<number>(n).fill(0);
  for (const d of data) {
    const factor = d ^ rem[0];
    rem.shift(); rem.push(0);
    for (let i = 0; i < n; i++) rem[i] ^= mul(g[i + 1], factor);
  }
  return rem;
}

/* -------------------------------------------------------------- the bit stream */
function dataCodewordCount(v: number, ecl: Ecl): number {
  const [, groups] = BLOCKS[ecl][v]!;
  return groups.reduce((a, [n, d]) => a + n * d, 0);
}

function codewords(bytes: number[], v: number, ecl: Ecl): number[] {
  const cap = dataCodewordCount(v, ecl) * 8;
  const bits: number[] = [];
  const push = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(0b0100, 4);                       // byte mode
  push(bytes.length, 8);                 // versions 1–9 use an 8-bit count
  for (const b of bytes) push(b, 8);
  for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);   // terminator
  while (bits.length % 8) bits.push(0);
  const pad = [0xec, 0x11];
  for (let i = 0; bits.length < cap; i++) push(pad[i & 1], 8);
  const cw: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    cw.push(b);
  }
  return cw;
}

/* Split into blocks, add error correction, interleave — Table 9's order. */
function interleave(cw: number[], v: number, ecl: Ecl): number[] {
  const [ecPer, groups] = BLOCKS[ecl][v]!;
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let at = 0;
  for (const [count, len] of groups) {
    for (let i = 0; i < count; i++) {
      const block = cw.slice(at, at + len); at += len;
      dataBlocks.push(block);
      ecBlocks.push(ecCodewords(block, ecPer));
    }
  }
  const out: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) for (const b of dataBlocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecPer; i++) for (const b of ecBlocks) out.push(b[i]);
  return out;
}

/* ------------------------------------------------------------------ the symbol */
const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function formatBits(ecl: Ecl, mask: number): number {
  const data = (ECL_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function versionBits(v: number): number {
  let rem = v;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (v << 12) | rem;
}

function penalty(m: number[][], size: number): number {
  let p = 0;
  const line = (get: (i: number) => number) => {
    let run = 1, score = 0;
    for (let i = 1; i < size; i++) {
      if (get(i) === get(i - 1)) run++;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) score += 3 + (run - 5);
    return score;
  };
  for (let r = 0; r < size; r++) p += line((i) => m[r][i]);
  for (let c = 0; c < size; c++) p += line((i) => m[i][c]);
  for (let r = 0; r < size - 1; r++)
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
    }
  /* Rule 3: the finder-like 1:1:3:1:1 sequence with four light modules on one
     side. Outside the symbol counts as light, which is why the edges are named
     explicitly; a run that fails the light test resumes four modules in, so one
     dark stretch cannot be counted twice. */
  const P3 = [1, 0, 1, 1, 1, 0, 1];
  const finderLike = (get: (i: number) => number) => {
    let score = 0, i = 0;
    while (i + 7 <= size) {
      let hit = true;
      for (let k = 0; k < 7; k++) if (get(i + k) !== P3[k]) { hit = false; break; }
      if (!hit) { i++; continue; }
      let lightBefore = true;
      for (let k = Math.max(0, i - 4); k < i; k++) if (get(k)) { lightBefore = false; break; }
      let lightAfter = true;
      for (let k = i + 7; k < Math.min(size, i + 11); k++) if (get(k)) { lightAfter = false; break; }
      if (i === 0 || i === size - 7 || lightBefore || lightAfter) { score += 40; i += 7; }
      else i += 4;
    }
    return score;
  };
  for (let r = 0; r < size; r++) p += finderLike((i) => m[r][i]);
  for (let c = 0; c < size; c++) p += finderLike((i) => m[i][c]);
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
  const pct = (dark * 100) / (size * size);
  p += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return p;
}

function build(v: number, ecl: Ecl, stream: number[], mask: number): number[][] {
  const size = 17 + 4 * v;
  const m: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const finder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++)
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        fn[r][c] = true;
        const inner = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const ring = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        m[r][c] = inner && (ring || core) ? 1 : 0;
      }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  for (let i = 0; i < size; i++) {
    if (!fn[6][i]) { m[6][i] = i % 2 === 0 ? 1 : 0; fn[6][i] = true; }
    if (!fn[i][6]) { m[i][6] = i % 2 === 0 ? 1 : 0; fn[i][6] = true; }
  }
  /* Alignment patterns sit at every pair of centres except the three corners a
     finder already occupies. The test is the position in the list, not whether
     the module is spoken for: two of them straddle the timing patterns. */
  const centres = ALIGN[v];
  const last = centres.length - 1;
  for (let i = 0; i <= last; i++)
    for (let j = 0; j <= last; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      const r = centres[i], c = centres[j];
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        fn[r + dr][c + dc] = true;
        m[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) === 1 ? 0 : 1;
      }
    }
  /* Reserve the two format-information strips before any data is placed. */
  for (let i = 0; i <= 8; i++) { fn[8][i] = true; fn[i][8] = true; }
  for (let i = 0; i < 8; i++) { fn[8][size - 1 - i] = true; fn[size - 1 - i][8] = true; }
  if (v >= 7)
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      fn[b][a] = true; fn[a][b] = true;
    }

  let bit = 0;
  const bits: number[] = [];
  for (const cwByte of stream) for (let i = 7; i >= 0; i--) bits.push((cwByte >>> i) & 1);
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let i = 0; i < size; i++) {
      const r = upward ? size - 1 - i : i;
      for (const c of [right, right - 1]) {
        if (fn[r][c]) continue;
        m[r][c] = bit < bits.length ? bits[bit] : 0;
        bit++;
      }
    }
    upward = !upward;
  }

  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (!fn[r][c] && MASKS[mask](r, c)) m[r][c] ^= 1;

  const f = formatBits(ecl, mask);
  const fb = (i: number) => (f >>> i) & 1;
  for (let i = 0; i <= 5; i++) m[i][8] = fb(i);
  m[7][8] = fb(6); m[8][8] = fb(7); m[8][7] = fb(8);
  for (let i = 9; i < 15; i++) m[8][14 - i] = fb(i);
  for (let i = 0; i < 8; i++) m[8][size - 1 - i] = fb(i);
  for (let i = 8; i < 15; i++) m[size - 15 + i][8] = fb(i);
  m[size - 8][8] = 1;

  if (v >= 7) {
    const vb = versionBits(v);
    for (let i = 0; i < 18; i++) {
      const b = (vb >>> i) & 1;
      const a = size - 11 + (i % 3), row = Math.floor(i / 3);
      m[row][a] = b; m[a][row] = b;
    }
  }
  return m;
}

/** The module grid, 1 = dark. `mask` forces one of the eight; otherwise the
 *  lowest-penalty mask is chosen, as the standard prescribes. */
export function qrMatrix(text: string, ecl: Ecl = 'M', mask?: number): number[][] {
  const bytes = [...new TextEncoder().encode(text)];
  let v = 0;
  for (let i = 1; i <= 7; i++) {
    if (bytes.length + 2 <= dataCodewordCount(i, ecl)) { v = i; break; }
  }
  if (!v) throw new Error(`qr: ${bytes.length} bytes will not fit a version 1–7 symbol at level ${ecl}`);
  const stream = interleave(codewords(bytes, v, ecl), v, ecl);
  if (mask !== undefined) return build(v, ecl, stream, mask);
  let best: number[][] | null = null, bestScore = Infinity;
  for (let k = 0; k < 8; k++) {
    const m = build(v, ecl, stream, k);
    const s = penalty(m, m.length);
    if (s < bestScore) { bestScore = s; best = m; }
  }
  return best!;
}

/** One SVG path covering every dark module, plus the side of the drawing area
 *  including the four-module quiet zone the standard requires. */
export function qrPath(text: string, ecl: Ecl = 'M', quiet = 4): { side: number; d: string } {
  const m = qrMatrix(text, ecl);
  const n = m.length;
  const parts: string[] = [];
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!m[r][c]) { c++; continue; }
      let w = 1;
      while (c + w < n && m[r][c + w]) w++;
      parts.push(`M${c + quiet} ${r + quiet}h${w}v1h-${w}z`);
      c += w;
    }
  }
  return { side: n + quiet * 2, d: parts.join('') };
}

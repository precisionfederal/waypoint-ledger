/* Builds tiny synthetic PDFs in memory with plain node (zlib only, no PDF
   library), so the in-browser text reader (lib/read-pdf.ts) is tested on real
   PDF structure: FlateDecode content, a numbered-glyph font with a ToUnicode
   map, a scan with no text layer, and a password-protected file. Nothing is
   written to disk; every name and number in them is made up. */
import { deflateSync } from 'node:zlib';

type Obj = string | { dict: string; data: Uint8Array };

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

export function buildPdf(objs: Obj[], trailerExtra = ''): Uint8Array {
  const chunks: Uint8Array[] = [enc('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')];
  let len = chunks[0].length;
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(len);
    const parts = typeof o === 'string'
      ? [enc(`${i + 1} 0 obj\n${o}\nendobj\n`)]
      : [enc(`${i + 1} 0 obj\n<< ${o.dict} /Length ${o.data.length} >>\nstream\n`), o.data, enc('\nendstream\nendobj\n')];
    for (const p of parts) { chunks.push(p); len += p.length; }
  });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  chunks.push(enc(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R ${trailerExtra}>>\nstartxref\n${len}\n%%EOF\n`));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

const flate = (s: string | Uint8Array) => new Uint8Array(deflateSync(typeof s === 'string' ? enc(s) : s));
const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

/** One row of cells: [x, text]. Each cell in its own BT block, the way report writers lay out a table. */
export type Row = [number, string][];

/** A one-page PDF in Helvetica (WinAnsi), its content stream FlateDecode-compressed. */
export function textPdf(rows: Row[]): Uint8Array {
  let y = 740;
  const content = rows.map((row) => {
    const s = row.map(([x, t]) => `BT /F1 10 Tf 1 0 0 1 ${x} ${y} Tm (${esc(t)}) Tj ET`).join('\n');
    y -= 14;
    return s;
  }).join('\n');
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    { dict: '/Filter /FlateDecode', data: flate(content) },
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]);
}

/** A one-page PDF whose font numbers its glyphs (two bytes each) and carries a ToUnicode map,
 *  with lines placed by Td and words separated by TJ kerning, as most portals write them. */
export function cidPdf(lines: string[]): Uint8Array {
  const chars = [...new Set(lines.join(''))].filter((c) => c !== ' ');
  const gid = new Map(chars.map((c, i) => [c, i + 3] as const));
  const hex = (n: number) => n.toString(16).padStart(4, '0').toUpperCase();
  const word = (w: string) => `<${[...w].map((c) => hex(gid.get(c)!)).join('')}>`;
  const body = lines.map((l, i) => `${i ? '0 -14 Td ' : ''}[${l.split(' ').map(word).join(' -278 ')}] TJ`).join('\n');
  const content = `BT /C2_0 9 Tf 72 700 Td\n${body}\nET`;
  const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap
/CMapName /Adobe-Identity-UCS def /CMapType 2 def
1 begincodespacerange <0000> <FFFF> endcodespacerange
${chars.length} beginbfchar
${chars.map((c) => `<${hex(gid.get(c)!)}> <${hex(c.charCodeAt(0))}>`).join('\n')}
endbfchar
endcmap CMapName currentdict /CMap defineresource pop end end`;
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /C2_0 5 0 R >> >> /Contents 4 0 R >>',
    { dict: '/Filter /FlateDecode', data: flate(content) },
    '<< /Type /Font /Subtype /Type0 /BaseFont /SampleSans /Encoding /Identity-H /DescendantFonts [7 0 R] /ToUnicode 6 0 R >>',
    { dict: '/Filter /FlateDecode', data: flate(cmap) },
    '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /SampleSans /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> >>',
  ]);
}

/** A scanned page: one image, no text. */
export function scanPdf(): Uint8Array {
  const pixels = flate(new Uint8Array(64 * 64).fill(200));
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>',
    { dict: '/Filter /FlateDecode', data: flate('q 612 0 0 792 0 0 cm /Im1 Do Q') },
    { dict: '/Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode', data: pixels },
  ]);
}

/** A password-protected file (the /Encrypt entry is all the reader needs to see). */
export function lockedPdf(): Uint8Array {
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [] /Count 0 >>',
    '<< /Filter /Standard /V 2 /R 3 /Length 128 /P -1028 /O <00> /U <00> >>',
  ], '/Encrypt 3 0 R ');
}

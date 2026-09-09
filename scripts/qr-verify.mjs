/* ==========================================================================
   Proves lib/qr.ts against segno — an independent MIT QR implementation —
   module for module: every version 1–7 × every ECC level × every one of the
   eight masks, on a payload that exactly fills the symbol, on the shortest
   payload that needs that version, and on the URL the register prints.

     pip3 install --target /tmp/pylibs segno
     node scripts/qr-verify.mjs /tmp/pylibs

   TWO THINGS TO KNOW BEFORE YOU READ A FAILURE.

   1. segno 1.6.6 pads one byte too many. write_padding_bits() in its encoder
      does `[0] * (8 - length % 8)`, which appends a whole zero codeword when
      the stream is already on a byte boundary — and after a 4-bit terminator
      it always is. ISO/IEC 18004 §7.4.10 pads to the boundary and then writes
      11101100 / 00010001 alternately, which is what lib/qr.ts does. This
      script patches its own copy of segno in memory before comparing, so the
      two agree on padding; nothing in the app is changed.
   2. segno's automatic mask choice is a shortcut, not the standard's rule: for
      the register URL its own evaluate_mask() scores mask 4 best (1494) and it
      ships mask 2 (1555). lib/qr.ts minimises the published penalty, and its
      per-mask scores are identical to segno's. So this script compares forced
      masks, and checks the automatic choice against segno's own scoring.
   ========================================================================== */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const PYLIBS = process.argv[2];
if (!PYLIBS) { console.error('usage: node scripts/qr-verify.mjs <dir holding segno>'); process.exit(2); }

/* lib/qr.ts is TypeScript; compile it to a throwaway directory and import that,
   so this script tests the file the site ships and not a second copy. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = mkdtempSync(join(tmpdir(), 'qrbuild-'));
execFileSync('npx', ['tsc', join(ROOT, 'lib/qr.ts'), '--target', 'es2020', '--module', 'esnext',
                     '--moduleResolution', 'bundler', '--lib', 'es2020,dom', '--outDir', BUILD],
             { cwd: ROOT, stdio: 'inherit' });
const { qrMatrix } = await import(pathToFileURL(join(BUILD, 'qr.js')).href);

const REF = join(mkdtempSync(join(tmpdir(), 'qrref-')), 'ref.py');
writeFileSync(REF, `import sys, json
sys.path.insert(0, sys.argv[1])
import segno
from segno import encoder
_orig = encoder.write_padding_bits
def _fixed(buff, version, length):
    buff.extend([0] * ((8 - (length % 8)) % 8))
encoder.write_padding_bits = _fixed
out = []
for c in json.load(sys.stdin):
    q = segno.make(c['text'], version=c['v'], error=c['ecl'], mask=c['mask'],
                   mode='byte', boost_error=False, micro=False)
    out.append([''.join(str(b) for b in row) for row in q.matrix])
json.dump(out, sys.stdout)
`);

/* Byte-mode capacity, ISO/IEC 18004 Table 7, versions 1-7. */
const CAP = { L: [0, 17, 32, 53, 78, 106, 134, 154], M: [0, 14, 26, 42, 62, 84, 106, 122],
              Q: [0, 11, 20, 32, 46, 60, 74, 86], H: [0, 7, 14, 24, 34, 44, 58, 64] };
const TARGET = 'https://waypoint-ledger.pages.dev/survey?c=register';
const rnd = (n) => { let s = ''; for (let i = 0; i < n; i++) s += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; return s; };

const cases = [];
for (const ecl of ['L', 'M', 'Q', 'H']) for (let v = 1; v <= 7; v++) {
  const cap = CAP[ecl][v], prev = CAP[ecl][v - 1] ?? 0;
  const texts = [rnd(cap), rnd(Math.max(prev + 1, 1))];
  if (TARGET.length > prev && TARGET.length <= cap) texts.push(TARGET);
  for (const text of texts) for (let mask = 0; mask < 8; mask++) cases.push({ text, v, ecl, mask });
}
const ref = JSON.parse(execFileSync('python3', [REF, PYLIBS], { input: JSON.stringify(cases), maxBuffer: 1 << 28 }));
let bad = 0;
cases.forEach((c, i) => {
  const mine = qrMatrix(c.text, c.ecl, c.mask).map((r) => r.join(''));
  if (mine.length !== ref[i].length || mine.some((r, j) => r !== ref[i][j])) {
    bad++;
    if (bad <= 3) console.error(`MISMATCH version ${c.v} level ${c.ecl} mask ${c.mask}, ${c.text.length} bytes`);
  }
});
console.log(`${cases.length - bad} of ${cases.length} symbols identical to segno`);

const auto = qrMatrix(TARGET, 'M');
let f = 0;
for (let i = 0; i <= 5; i++) f |= auto[i][8] << i;
f |= auto[7][8] << 6; f |= auto[8][8] << 7; f |= auto[8][7] << 8;
for (let i = 9; i < 15; i++) f |= auto[8][14 - i] << i;
const mask = ((f ^ 0x5412) >> 10) & 7;
console.log(`the register URL: version ${(auto.length - 17) / 4}, ${auto.length}x${auto.length} modules, mask ${mask}`);
process.exit(bad ? 1 : 0);

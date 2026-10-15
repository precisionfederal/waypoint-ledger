#!/usr/bin/env python3
"""Build data/zip-locality.json and data/zip9-split.json: every U.S. ZIP code resolved to the Medicare payment
locality CMS prices it in, read from CMS's own Zip Code to Carrier Locality File. DERIVED, never estimated.

Source: cms.gov > Medicare > Payment > Fee Schedules > Physician > "Zip Code to Carrier Locality File - Updated
08/13/2026 (ZIP)", https://www.cms.gov/files/zip/zip-code-carrier-locality-file-updated-08-13-2026.zip
  ZIP5_OCT2026.txt  one row per ZIP5: state 1-2, ZIP 3-7, carrier 8-12, pricing locality 13-14, +4 flag 21,
                    effective year/quarter 76-80 (ZIP5lyout.txt)
  ZIP9_OCT2026.txt  one row per ZIP+4, only for ZIPs whose +4 flag is 1: ZIP 3-7, carrier 8-12, locality 13-14,
                    plus four 22-25 (ZIP9lyout.txt)

The join: a ZIP row's (carrier, pricing locality) must equal one row of data/state-prices.json `localities`
(mac, locality), which is CMS's own GPCI2026.csv. Any ZIP whose pair is not in our table is printed and fails the
build: a ZIP we cannot price is never silently pointed at a neighbour.

Usage: python3 data/build_zip_locality.py <dir-with-ZIP5_OCT2026.txt-and-ZIP9_OCT2026.txt>
  -> writes data/zip-locality.json (+ the same file at public/data/zip-locality.json) and public/data/zip9-split.json.
     The app fetches the first only when somebody types a ZIP, and the second only when they type a ZIP+4 for a
     ZIP CMS splits, so neither enters the first-load bundle. Both are whole files: the request carries no digit of
     what was typed (per-prefix shards would put the first three digits of a ZIP in a server log).

Encoding (decoded by lib/zip-locality.ts):
  zip-locality.json  localities  the locality keys ("CA-05") the other fields index into
                     valid       base64 bitmap, bit z set when ZIP z (0-99999) is in ZIP5 (big-endian bits per byte)
                     runs        [count, localityIndex, ...] over the valid ZIPs in ascending order
                     split       {"01434": [i, j]} the ZIPs CMS prices in more than one locality by ZIP+4
  zip9-split.json    zips        {"01434": "10 2me.30 ..."} the listed ZIP+4 values as runs of consecutive codes
                                 sharing a locality. Each space-separated token is: gap from the previous run's end
                                 (base 36; the first run counts from -1), optionally "." + (run length - 1) in base 36,
                                 then one digit = position of the run's locality in that ZIP's `split` list.
                                 A +4 inside no run is not on CMS's list.
"""
import base64, collections, datetime, json, os, shutil, sys

SRC = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, '..', 'public', 'data')
URL = 'https://www.cms.gov/files/zip/zip-code-carrier-locality-file-updated-08-13-2026.zip'
PAGE = 'https://www.cms.gov/medicare/payment/fee-schedules/physician'
TITLE = 'Zip Code to Carrier Locality File - Updated 08/13/2026'

sp = json.load(open(os.path.join(HERE, 'state-prices.json')))
ours = {(l['mac'], l['locality']): f"{l['state']}-{l['locality']}" for l in sp['localities']}
keys = [f"{l['state']}-{l['locality']}" for l in sp['localities']]
idx = {k: i for i, k in enumerate(keys)}

z5, yq5, unmatched = {}, collections.Counter(), collections.Counter()
rows5 = 0
with open(os.path.join(SRC, 'ZIP5_OCT2026.txt'), encoding='latin-1') as f:
    for r in f:
        if len(r.rstrip('\r\n')) < 21: continue
        rows5 += 1
        z, car, loc, yq = r[2:7], r[7:12], r[12:14], r[75:80]
        assert z.isdigit() and z not in z5, z
        k = ours.get((car, loc))
        if not k: unmatched[(r[0:2], z, car, loc)] += 1; continue
        z5[z] = k
        yq5[yq] += 1

z9, rows9 = collections.defaultdict(list), 0
with open(os.path.join(SRC, 'ZIP9_OCT2026.txt'), encoding='latin-1') as f:
    for r in f:
        if len(r.rstrip('\r\n')) < 25: continue
        rows9 += 1
        z, car, loc, p4 = r[2:7], r[7:12], r[12:14], r[21:25]
        k = ours.get((car, loc))
        if not k: unmatched[(r[0:2], z + '-' + p4, car, loc)] += 1; continue
        z9[z].append((int(p4), k))

if unmatched:
    for u, n in unmatched.most_common(50): print('UNMATCHED (state, zip, carrier, locality):', u, n)
    sys.exit(f'{sum(unmatched.values())} ZIP rows name a carrier+locality that is not in data/state-prices.json')
assert len(yq5) == 1, yq5
effective = next(iter(yq5))

# ---- ZIP5: validity bitmap + locality runs over the valid ZIPs in order
bits = bytearray(100000 // 8 + 1)
for z in z5: n = int(z); bits[n >> 3] |= 0x80 >> (n & 7)
runs, prev = [], None
for z in sorted(z5):
    i = idx[z5[z]]
    if i == prev: runs[-2] += 1
    else: runs += [1, i]; prev = i

# ---- ZIP9: only the ZIPs CMS prices in more than one locality need the +4
split, split9, nruns = {}, {}, 0
for z, v in sorted(z9.items()):
    ls = sorted({k for _, k in v}, key=lambda k: idx[k])
    if len(ls) < 2: continue
    split[z] = [idx[k] for k in ls]
    v.sort()
    out, prevp, prevk = [], None, None
    for p, k in v:
        if prevk == k and p == prevp + 1: out[-2] = p
        else: out += [p, p, idx[k]]
        prevp, prevk = p, k
    split9[z] = out
    nruns += len(out) // 3

src = {
    'title': TITLE, 'url': URL, 'page': PAGE, 'updated': '08/13/2026',
    'effective_quarter': effective,
    'zip5_file': 'ZIP5_OCT2026.txt', 'zip5_rows': rows5,
    'zip9_file': 'ZIP9_OCT2026.txt', 'zip9_rows': rows9,
    'join': f'carrier + pricing locality = data/state-prices.json localities mac + locality; '
            f'{len(set(z5.values()))} of {len(keys)} localities reached, 0 ZIP rows unmatched',
    'built': datetime.date.today().isoformat(),
}
base = {
    '_README': 'Every ZIP5 in CMS ZIP5_OCT2026.txt mapped to its Medicare payment locality key (data/state-prices.json). '
               'Built by data/build_zip_locality.py; decoded by lib/zip-locality.ts. Nothing here is estimated.',
    '_source': src,
    'count': len(z5),
    'localities': keys,
    'valid': base64.b64encode(bytes(bits)).decode(),
    'runs': runs,
    'split': split,
}
def b36(n):
    d, o = '0123456789abcdefghijklmnopqrstuvwxyz', ''
    while True:
        o = d[n % 36] + o; n //= 36
        if not n: return o

packed = {}
for z, v in split9.items():
    order, toks, prev = split[z], [], -1
    for i in range(0, len(v), 3):
        s0, e0, k = v[i], v[i + 1], v[i + 2]
        toks.append(b36(s0 - prev - 1) + ('' if e0 == s0 else '.' + b36(e0 - s0)) + str(order.index(k)))
        prev = e0
    packed[z] = ' '.join(toks)
nine = {
    '_README': 'The listed ZIP+4 codes of every ZIP CMS prices in more than one locality, run-encoded (see '
               'data/build_zip_locality.py); decoded by lib/zip-locality.ts against zip-locality.json `split`.',
    '_source': src,
    'count': len(packed),
    'zips': packed,
}
for d in (HERE, PUB):
    os.makedirs(d, exist_ok=True)
    json.dump(base, open(os.path.join(d, 'zip-locality.json'), 'w'), separators=(',', ':'))
json.dump(nine, open(os.path.join(PUB, 'zip9-split.json'), 'w'), separators=(',', ':'))

print(f'{TITLE}: effective {effective}')
print(f'ZIP5 rows {rows5}, ZIPs mapped {len(z5)}, localities reached {len(set(z5.values()))}/{len(keys)}, runs {len(runs)//2}')
print(f'ZIP9 rows {rows9}, ZIPs with +4 rows {len(z9)}, split across localities {len(split)}, +4 runs {nruns}')
for z in ('94110', '77002', '10001', '33101', '02139', '50010', '01434', '20814', '96910'):
    print(' ', z, z5.get(z, 'NOT IN FILE'), 'SPLIT ' + ','.join(keys[i] for i in split[z]) if z in split else '')
for d in (HERE, PUB):
    print(' ', os.path.relpath(os.path.join(d, 'zip-locality.json'), os.path.join(HERE, '..')), os.path.getsize(os.path.join(d, 'zip-locality.json')), 'bytes')
print('  public/data/zip9-split.json', os.path.getsize(os.path.join(PUB, 'zip9-split.json')), 'bytes')

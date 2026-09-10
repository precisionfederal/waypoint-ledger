#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Re-derive every dollar figure in BOTH additions files straight from the CMS source
files, independently of how they were built:

    data/prices-additions-2026-09-08.json   (53 rows, assembled 2026-09-08)
    data/prices-additions-2026-09-09.json   (157 rows, assembled 2026-09-09)

  PFS rows  (confidence DERIVED, code CPT nnnnn): value_usd must equal
            round(total non-facility RVU x conversion factor, 2), both read on the
            unmodified line for that HCPCS code in PPRRVU2026_Jul_nonQPP.csv, and the
            status indicator on that line must be 'A'.
  Lab rows  (confidence VERIFIED): value_usd must equal the RATE printed on the 2026
            unmodified row for that HCPCS in PUF_CLFS_CY2026_Q3V1.csv.

It also re-checks each file's SHA256 against the hash recorded in the JSON, and
re-parses the RVU inputs quoted in each coverage_statement so the sentence a patient
reads is checked against the file too, not just the final number.

Usage:  python3 verify_additions.py [DIR_WITH_CMS_FILES]
Exits non-zero on any FAIL.
"""
import csv, json, os, re, sys, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SRC = ("/private/tmp/claude-501/-Users-bo-Documents-100M-Lifetime-Revenue-Precision-"
               "Federal-Proposal-Builder/5a45513e-1a30-4734-8f49-694b18a231f1/scratchpad/price-table")
SRC = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
RVU_CSV  = os.path.join(SRC, 'rvu26c', 'PPRRVU2026_Jul_nonQPP.csv')
CLAB_CSV = os.path.join(SRC, 'clab',  'PUF_CLFS_CY2026_Q3V1.csv')
ADDITIONS_FILES = [os.path.join(HERE, 'prices-additions-2026-09-08.json'),
                   os.path.join(HERE, 'prices-additions-2026-09-09.json')]

CODE_PREFIX = re.compile(r'^(?:CPT|HCPCS)\s+')

def hcpcs_of(item):
    """The bare HCPCS/CPT code a row cites. A row may write 'CPT 94729, add-on' or
       'HCPCS G0438'; the file is keyed on the code alone."""
    return CODE_PREFIX.sub('', item['code']).split(',')[0].strip()

def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()

def load_rvu(path):
    rows = list(csv.reader(open(path, encoding='latin-1')))
    hi = next(i for i, r in enumerate(rows) if r and r[0].strip() == 'HCPCS')
    out = {}
    for r in rows[hi + 1:]:
        if len(r) < 27 or r[1].strip():        # unmodified (global) lines only
            continue
        code = r[0].strip()
        if code in out:
            continue
        try:
            out[code] = dict(status=r[3].strip(), work=float(r[5]), pe_nf=float(r[6]),
                             mp=float(r[10]), total_nf=float(r[11]), cf=float(r[25]))
        except ValueError:
            continue
    return out

def load_clab(path):
    out = {}
    for r in csv.reader(open(path, encoding='latin-1')):
        if len(r) > 6 and r[0].strip() == '2026' and not r[2].strip():
            out.setdefault(r[1].strip(), float(r[5]))
    return out

def main():
    for p in [RVU_CSV, CLAB_CSV] + ADDITIONS_FILES:
        if not os.path.exists(p):
            print('FATAL missing file: %s' % p); return 2

    rvu, clab = load_rvu(RVU_CSV), load_clab(CLAB_CSV)
    fails = []
    checked = 0
    seen_ids, seen_codes = {}, {}

    # --- the conversion factor must be one value across the whole file
    cfs = {v['cf'] for v in rvu.values() if v['cf'] > 0}
    if len(cfs) != 1:
        fails.append('conversion factor is not constant in the RVU file: %r' % cfs)
    cf = cfs.pop() if len(cfs) == 1 else None
    print('conversion factor read from RVU26C CONV FACTOR column: $%.4f' % cf)

    for additions in ADDITIONS_FILES:
        data = json.load(open(additions))
        print('\n=== %s — %d rows ===' % (os.path.basename(additions), len(data['items'])))
        if cf != data['_conversion_factor']:
            fails.append('%s: conversion factor mismatch: file %r vs JSON %r'
                         % (os.path.basename(additions), cf, data['_conversion_factor']))

        # --- file integrity: each additions file names the bytes it was built from
        src = data.get('_source_files', {})
        for label, path, key in (('PFS csv', RVU_CSV, 'pfs_csv_sha256'),
                                 ('CLFS csv', CLAB_CSV, 'clfs_csv_sha256')):
            got = sha256(path)
            if src.get(key) != got:
                fails.append('%s: %s SHA256 mismatch: recorded %s, actual %s'
                             % (os.path.basename(additions), label, src.get(key), got))
            else:
                print('SHA256 OK  %s  %s' % (label, got))
        checked += len(data['items'])
        run_rows(data, rvu, clab, fails, seen_ids, seen_codes, os.path.basename(additions))

    print('\n%d rows checked across %d files' % (checked, len(ADDITIONS_FILES)))
    if fails:
        print('FAILURES (%d):' % len(fails))
        for f in fails:
            print('  - ' + f)
        return 1
    print('ALL ROWS PASS — every figure reproduces from the CMS source files.')
    return 0


def run_rows(data, rvu, clab, fails, seen_ids, seen_codes, where):
    for it in data['items']:
        rid, code = it['id'], hcpcs_of(it)
        # No id and no code may be claimed twice, here or by the other additions file:
        # two rows for one code is two prices for one unit of care.
        if rid in seen_ids:
            fails.append('%s: id %s already used in %s' % (where, rid, seen_ids[rid]))
        seen_ids[rid] = where
        if code in seen_codes:
            fails.append('%s: %s already priced in %s' % (where, it['code'], seen_codes[code]))
        seen_codes[code] = where
        val = it['value_usd']
        if it['confidence'] == 'DERIVED':
            r = rvu.get(code)
            if not r:
                fails.append('%s: CPT %s not found in RVU file' % (rid, code)); continue
            if r['status'] != 'A':
                fails.append('%s: CPT %s status %r is not A' % (rid, code, r['status'])); continue
            exp = round(r['total_nf'] * r['cf'], 2)
            ok = (abs(exp - val) < 0.005)
            # the components quoted in the coverage statement must also be the file's
            m = re.search(r'This figure is ([\d.]+) Total non-facility RVUs', it['coverage_statement'])
            m2 = re.search(r'sum of ([\d.]+) work \+ ([\d.]+) non-facility practice expense \+ ([\d.]+) malpractice',
                           it['coverage_statement'])
            if not m or abs(float(m.group(1)) - r['total_nf']) > 0.005:
                fails.append('%s: coverage statement RVU total does not match file' % rid); ok = False
            if not m2 or any(abs(float(m2.group(i + 1)) - r[k]) > 0.005
                             for i, k in enumerate(('work', 'pe_nf', 'mp'))):
                fails.append('%s: coverage statement RVU components do not match file' % rid); ok = False
            if not ok and abs(exp - val) >= 0.005:
                fails.append('%s: CPT %s expected %.2f (%.2f RVU x %.4f), JSON says %.2f'
                             % (rid, code, exp, r['total_nf'], r['cf'], val))
            print('%-4s %-34s CPT %-6s %.2f RVU x %.4f = $%8.2f  json $%8.2f'
                  % ('PASS' if ok else 'FAIL', rid, code, r['total_nf'], r['cf'], exp, val))
        elif it['confidence'] == 'VERIFIED':
            rate = clab.get(code)
            if rate is None:
                fails.append('%s: CPT %s not found in CLFS file' % (rid, code)); continue
            ok = abs(round(rate, 2) - val) < 0.005
            if not ok:
                fails.append('%s: CPT %s CLFS rate %.2f, JSON says %.2f' % (rid, code, rate, val))
            # the rate quoted inside the sentence must match too
            m = re.search(r'\$([\d.]+) is the payment amount', it['coverage_statement'])
            if not m or abs(float(m.group(1)) - rate) > 0.005:
                fails.append('%s: coverage statement rate does not match CLFS file' % rid); ok = False
            print('%-4s %-34s CPT %-6s CLFS rate $%8.2f  json $%8.2f'
                  % ('PASS' if ok else 'FAIL', rid, code, rate, val))
        else:
            fails.append('%s: unexpected confidence %r' % (rid, it['confidence']))

if __name__ == '__main__':
    sys.exit(main())

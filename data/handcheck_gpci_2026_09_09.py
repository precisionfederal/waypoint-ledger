#!/usr/bin/env python3
"""Independent hand-check of the locality (GPCI) table: 20 random figures, inputs printed.

Written for the 2026-09-09 audit. It shares no code with data/build_state_prices.py or
data/verify_price_table.py: it reads the two CMS CSVs out of a zip downloaded fresh from
cms.gov in this session, finds the HCPCS line itself, prints every input, and does the
arithmetic here. state-prices.json is the thing on trial.
"""
import csv, json, random, sys, os, hashlib

SRC = sys.argv[1]          # a directory holding PPRRVU2026_Jul_nonQPP.csv and GPCI2026.csv,
                           # extracted from https://www.cms.gov/files/zip/rvu26c-updated-06-30-2026.zip
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
CF = 33.4009

def sha(p):
    return hashlib.sha256(open(p,'rb').read()).hexdigest()

# ---- GPCIs, read by hand out of Addendum E
gpci = {}
with open(os.path.join(SRC,'GPCI2026.csv'), newline='', encoding='latin-1') as f:
    for r in csv.reader(f):
        if len(r) < 7 or not r[0].strip().isdigit(): continue
        st, loc = r[1].strip(), r[2].strip()
        gpci[(st,loc)] = dict(mac=r[0].strip(), name=r[3].strip(),
                              pw=float(r[4]), pe=float(r[5]), mp=float(r[6]))

# ---- every RVU line for a HCPCS, all modifiers
rvu = {}
with open(os.path.join(SRC,'PPRRVU2026_Jul_nonQPP.csv'), newline='', encoding='latin-1') as f:
    for r in csv.reader(f):
        if len(r) < 26: continue
        code = r[0].strip()
        if len(code) != 5 or not (code[:4].isdigit() or code[0].isalpha()): continue
        try: work = float(r[5]); pe = float(r[6]); mp = float(r[10]); tot = float(r[11])
        except ValueError: continue
        rvu.setdefault(code, []).append(dict(mod=r[1].strip(), desc=r[2].strip(), status=r[3].strip(),
                                             work=work, pe_nonfac=pe, mp=mp, total_nonfac=tot,
                                             cf=r[25].strip()))

prices = json.load(open(os.path.join(APP,'data/prices.json'), encoding='utf-8'))
byid = {i['id']: i for i in prices['items']}
sp = json.load(open(os.path.join(APP,'data/state-prices.json'), encoding='utf-8'))

pairs = [(rid, loc) for rid, m in sp['items'].items() for loc in m]
random.seed(20260909)
sample = random.sample(pairs, 20)

print('FILES READ (downloaded fresh from cms.gov this session)')
for m in ('PPRRVU2026_Jul_nonQPP.csv','GPCI2026.csv'):
    p = os.path.join(SRC,m); print('  %-30s sha256 %s  %d bytes' % (m, sha(p), os.path.getsize(p)))
print('  conversion factor read in the file: %s (asserted %s)' % (rvu['99213'][0]['cf'], CF))
print()

bad = 0
for n,(rid,loc) in enumerate(sample, 1):
    item = byid[rid]
    hcpcs = str(item['code']).split()[-1]
    st, lnum = loc.split('-')
    g = gpci[(st,lnum)]
    lines = rvu[hcpcs]
    # pick the line whose national total reproduces the row's published national figure
    pick = None
    for L in lines:
        if round(L['total_nonfac']*CF, 2) == item['value_usd']: pick = L; break
    note = ''
    if pick is None:
        pick = lines[0]; note = '  (no modifier line reproduces the national figure — see below)'
    got = round((pick['work']*g['pw'] + pick['pe_nonfac']*g['pe'] + pick['mp']*g['mp'])*CF, 2)
    want = sp['items'][rid][loc]
    ok = abs(got-want) <= 0.005
    bad += (not ok)
    print('%2d. %-32s %-6s %s' % (n, rid, loc, g['name']))
    print('    RVU line   HCPCS %s mod=%r status=%s  "%s"%s' % (hcpcs, pick['mod'] or '', pick['status'], pick['desc'], note))
    print('    inputs     work %.2f · non-facility PE %.2f · MP %.2f   (file total non-fac %.2f)' % (pick['work'], pick['pe_nonfac'], pick['mp'], pick['total_nonfac']))
    print('    GPCIs      MAC %s  PW %.3f · PE %.3f · MP %.3f' % (g['mac'], g['pw'], g['pe'], g['mp']))
    print('    arithmetic (%.2f×%.3f + %.2f×%.3f + %.2f×%.3f) × %s = %.4f → $%.2f' % (
        pick['work'],g['pw'],pick['pe_nonfac'],g['pe'],pick['mp'],g['mp'],CF,
        (pick['work']*g['pw'] + pick['pe_nonfac']*g['pe'] + pick['mp']*g['mp'])*CF, got))
    print('    table says $%.2f   → %s' % (want, 'PASS' if ok else 'FAIL'))
    print()
print('20 locality figures hand-checked: %d PASS, %d FAIL' % (20-bad, bad))
sys.exit(1 if bad else 0)

#!/usr/bin/env python3
"""Build data/state-prices.json: every CMS Physician Fee Schedule row in data/prices.json re-priced for each
Medicare locality with the CMS formula, from the CMS files themselves. DERIVED, never estimated.

  locality allowed amount = (Work RVU x Work GPCI + Non-facility PE RVU x PE GPCI + MP RVU x MP GPCI) x conversion factor

Sources (CY2026 PFS Relative Value File, July release, RVU26C.zip from cms.gov):
  PPRRVU2026_Jul_nonQPP.csv  (RVUs, conversion factor 33.4009)
  GPCI2026.csv               (Addendum E, final CY2026 GPCIs by state and locality; work GPCI with the 1.0 floor)
Usage: python3 data/build_state_prices.py <dir-with-the-two-csvs>   -> writes data/state-prices.json and prints the audit.
A row is included only when the national figure in prices.json equals the non-facility total RVU x CF to the cent,
which proves the RVU components used here are the ones that made the published figure.
"""
import csv, json, sys, os, datetime
src = sys.argv[1]
CF = 33.4009
HERE = os.path.dirname(os.path.abspath(__file__))
prices = json.load(open(os.path.join(HERE, 'prices.json')))

rvu = {}
with open(os.path.join(src, 'PPRRVU2026_Jul_nonQPP.csv'), newline='', encoding='latin-1') as f:
    for row in csv.reader(f):
        if len(row) < 12 or not row[0] or row[0] == 'HCPCS': continue
        code, mod = row[0].strip(), row[1].strip()
        if mod: continue                      # base code only (no TC/26 modifier splits)
        try: rvu[code] = dict(work=float(row[5]), pe_nf=float(row[6]), mp=float(row[10]), total_nf=float(row[11]), cf=float(row[25]))
        except ValueError: continue

loc = []
with open(os.path.join(src, 'GPCI2026.csv'), newline='', encoding='latin-1') as f:
    for row in csv.reader(f):
        if len(row) < 7 or not row[0].isdigit(): continue
        loc.append(dict(mac=row[0], state=row[1], locality=row[2], name=row[3].replace('*', '').strip(), pw=float(row[4]), pe=float(row[5]), mp=float(row[6])))
assert len(loc) > 100, len(loc)

out, audit = {}, []
for it in prices['items']:
    code = (it.get('code') or '').replace('CPT', '').replace('HCPCS', '').strip().split()[0] if it.get('code') else None
    r = rvu.get(code) if code else None
    if not r or r['total_nf'] == 0 or it.get('value_usd') is None: continue
    national = round(r['total_nf'] * CF, 2)
    if abs(national - it['value_usd']) > 0.011:
        audit.append(f"SKIP {it['id']} code {code}: national {national} != table {it['value_usd']} (not a plain PFS non-facility row)"); continue
    comp = round((r['work'] + r['pe_nf'] + r['mp']) * CF, 2)
    if abs(comp - national) > 0.02:
        audit.append(f"SKIP {it['id']}: component sum {comp} != total {national}"); continue
    out[it['id']] = {f"{l['state']}-{l['locality']}": round((r['work'] * l['pw'] + r['pe_nf'] * l['pe'] + r['mp'] * l['mp']) * CF, 2) for l in loc}
    audit.append(f"OK   {it['id']} code {code}: work {r['work']} pe {r['pe_nf']} mp {r['mp']} -> national {national} (table {it['value_usd']})")

doc = {
  '_README': 'Every figure here is the CMS Physician Fee Schedule formula applied to published CMS inputs: (Work RVU x Work GPCI + Non-facility PE RVU x PE GPCI + MP RVU x MP GPCI) x conversion factor 33.4009. DERIVED. It is the Medicare allowed amount for that locality; for anyone not on Medicare it is a published reference price, not a bill. Rebuild with data/build_state_prices.py.',
  '_version': datetime.date.today().isoformat() + '.1',
  '_source_files': ['RVU26C.zip: PPRRVU2026_Jul_nonQPP.csv (released 06/30/2026)', 'RVU26C.zip: GPCI2026.csv (Addendum E, final CY2026 GPCIs)'],
  '_conversion_factor': CF,
  '_formula': '(work_rvu*pw_gpci + pe_nonfacility_rvu*pe_gpci + mp_rvu*mp_gpci) * 33.4009',
  'localities': loc,
  'items': out,
}
json.dump(doc, open(os.path.join(HERE, 'state-prices.json'), 'w'), separators=(',', ':'))
print('\n'.join(audit))
print(f"\n{len(out)} rows priced across {len(loc)} localities in {len(set(l['state'] for l in loc))} states/territories -> data/state-prices.json")

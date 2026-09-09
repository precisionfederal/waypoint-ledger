#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SOURCE THE CY2024 ALTERNATES — every companion figure on a price row gets the file
it came from, the row inside that file, the field name, the file's SHA-256 and the
date it was retrieved.

The alternates in question are the two CY2024 claims-average figures that ride on
the CMS Physician Fee Schedule rows:

  cy2024_average_submitted_charge_usd   what providers billed, on average
  cy2024_average_allowed_usd            what Medicare allowed, on average

Both are published, per HCPCS code, in one federal file:

  CMS, Medicare Physician & Other Practitioners — by Geography and Service,
  calendar year 2024 (MUP_PHY_R26_P05_V10_D24_Geo.csv)

Neither is computed here. Each is READ out of the single National row for that
code and place of service, and rounded to the cent. The place of service is
chosen by the row's own setting, never by which number happens to match:

  'O'  non-facility / office — every Physician Fee Schedule row in this table is
       the non-facility amount, so the companion figure must be the same setting.
  'F'  facility — only where the table's own figure is a facility figure.

Usage
  python3 data/build_cy2024_alternates.py                # fetch (or reuse cache), rewrite data/prices.json
  python3 data/build_cy2024_alternates.py --check        # change nothing; print what does not reproduce
  python3 data/build_cy2024_alternates.py --file PATH    # use a local copy of the PUF

Exits 1 if any existing figure does not reproduce from the file.
"""
import argparse, csv, hashlib, json, os, sys, time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PRICES = os.path.join(HERE, 'prices.json')
CACHE = os.path.expanduser('~/.cache/waypoint-ledger/sources')
UA = 'WaypointLedger/1.0 (+https://waypoint-ledger.pages.dev; bo@precisionfederal.com)'

DATASET_TITLE = ('CMS, Medicare Physician & Other Practitioners — by Geography and Service, '
                 'calendar year 2024 (released 2026-05)')
DATASET_PAGE = ('https://data.cms.gov/provider-summary-by-type-of-service/'
                'medicare-physician-other-practitioners/'
                'medicare-physician-other-practitioners-by-geography-and-service')
FILE_NAME = 'MUP_PHY_R26_P05_V10_D24_Geo.csv'
FILE_URL = ('https://data.cms.gov/sites/default/files/2026-05/'
            'e534c74b-79b8-4892-8a95-5a17e2dfec9f/MUP_PHY_R26_P05_V10_D24_Geo.csv')

# The one place-of-service rule, stated rather than fitted.
FACILITY_ROWS = {'cms-ed-99284-physician-only'}
# Alternates that name a facility-setting figure explicitly, whatever the row's own setting.
FACILITY_KEYS = {'cy2024_physician_component_average_submitted_charge_usd'}

CHARGE_KEYS = ('cy2024_average_submitted_charge_usd',
               'cy2024_physician_component_average_submitted_charge_usd')
ALLOWED_KEY = 'cy2024_average_allowed_usd'


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def obtain(path_arg):
    if path_arg:
        return path_arg
    os.makedirs(CACHE, exist_ok=True)
    out = os.path.join(CACHE, 'phygeo.csv')
    if not os.path.exists(out):
        req = urllib.request.Request(FILE_URL, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=900) as r, open(out, 'wb') as f:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                f.write(b)
    return out


def national_rows(path, codes):
    """{code: {place_of_service: row}} for the National geography only."""
    out = {}
    with open(path, newline='', encoding='latin-1') as f:
        for r in csv.DictReader(f):
            if r.get('Rndrng_Prvdr_Geo_Lvl') != 'National':
                continue
            c = r.get('HCPCS_Cd', '').strip()
            if c in codes:
                out.setdefault(c, {})[r.get('Place_Of_Srvc', '').strip()] = r
    return out


def code_of(item):
    c = (item.get('code') or '').replace('CPT ', '').replace('HCPCS ', '')
    c = c.split(',')[0].split(' ')[0].strip()
    return c or None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true', help='verify only; write nothing')
    ap.add_argument('--file', help='local copy of %s' % FILE_NAME)
    a = ap.parse_args()

    data = json.load(open(PRICES, encoding='utf-8'))
    items = data['items']
    targets = [i for i in items
               if any(k.startswith('cy2024') and isinstance((i.get('alternates') or {}).get(k), (int, float))
                      for k in (i.get('alternates') or {}))]
    codes = {code_of(i) for i in targets} - {None}

    path = obtain(a.file)
    digest = sha256(path)
    retrieved = time.strftime('%Y-%m-%d')
    rows = national_rows(path, codes)

    figures = failures = 0
    for it in targets:
        alt = it['alternates']
        code = code_of(it)
        pos = 'F' if it['id'] in FACILITY_ROWS else 'O'
        rec = (rows.get(code) or {}).get(pos)
        # An alternate that names the facility component uses the facility row of the same code.
        rec_fac = (rows.get(code) or {}).get('F')
        if rec is None and rec_fac is None:
            print('MISS  %-28s code %s is not in the National rows of the file' % (it['id'], code))
            failures += 1
            continue

        checks = []
        for k in CHARGE_KEYS:
            v = alt.get(k)
            if not isinstance(v, (int, float)):
                continue
            src = rec_fac if k in FACILITY_KEYS else rec
            if src is None:
                print('MISS  %-28s %s: no %s row for %s' % (it['id'], k, 'F' if k in FACILITY_KEYS else pos, code))
                failures += 1
                continue
            checks.append((k, v, round(float(src['Avg_Sbmtd_Chrg']), 2), 'Avg_Sbmtd_Chrg',
                           'F' if k in FACILITY_KEYS else pos))
        v = alt.get(ALLOWED_KEY)
        if isinstance(v, (int, float)) and rec is not None:
            checks.append((ALLOWED_KEY, v, round(float(rec['Avg_Mdcr_Alowd_Amt']), 2), 'Avg_Mdcr_Alowd_Amt', pos))

        ok = True
        for k, have, want, field, p in checks:
            figures += 1
            if abs(have - want) > 0.005:
                print('FAIL  %-28s %s: table $%.2f, file $%.2f (%s, POS %s)'
                      % (it['id'], k, have, want, field, p))
                failures += 1
                ok = False
            else:
                print('OK    %-28s %s $%.2f  (%s, National, POS %s)' % (it['id'], k, have, field, p))
        if not ok or a.check:
            continue

        # ---- the provenance block, written next to the figures it describes
        alt['cy2024_source_title'] = DATASET_TITLE
        alt['cy2024_source_url'] = DATASET_PAGE
        alt['cy2024_source_file'] = FILE_NAME
        alt['cy2024_source_file_url'] = FILE_URL
        alt['cy2024_source_file_sha256'] = digest
        alt['cy2024_source_row'] = ('Rndrng_Prvdr_Geo_Lvl=National, HCPCS_Cd=%s, Place_Of_Srvc=%s'
                                    % (code, pos))
        alt['cy2024_place_of_service'] = ('O — provider office / non-facility setting' if pos == 'O'
                                          else 'F — facility setting (hospital or ASC)')
        alt['cy2024_retrieved'] = retrieved
        if any(k in alt for k in CHARGE_KEYS):
            alt['cy2024_charge_field'] = 'Avg_Sbmtd_Chrg'
        if isinstance(alt.get(ALLOWED_KEY), (int, float)):
            alt['cy2024_allowed_field'] = 'Avg_Mdcr_Alowd_Amt'
        if rec is not None:
            alt['cy2024_total_services'] = round(float(rec['Tot_Srvcs']), 1)
            alt['cy2024_rendering_providers'] = int(float(rec['Tot_Rndrng_Prvdrs']))
        alt['cy2024_method'] = (
            'READ, not computed. CMS publishes one National row per HCPCS code per place of service '
            'in this file, and this figure is that row\'s field, rounded to the cent. Nothing is '
            'averaged, weighted or adjusted here. Open the file, filter to the row named above, and '
            'you will see the same number.')

    if not a.check and not failures:
        data['_cy2024_alternates'] = {
            'source_title': DATASET_TITLE,
            'source_url': DATASET_PAGE,
            'file': FILE_NAME,
            'file_url': FILE_URL,
            'file_sha256': digest,
            'retrieved': retrieved,
            'figures': figures,
            'rule': 'National geography; place of service chosen by the row\'s own setting; '
                    'read to the cent, never computed.',
        }
        json.dump(data, open(PRICES, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

    print('\n%s: %d figures checked against %s (sha256 %s), %d failed'
          % ('CHECKED' if a.check else 'WROTE data/prices.json', figures, FILE_NAME, digest[:16], failures))
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())

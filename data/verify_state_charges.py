#!/usr/bin/env python3
"""Re-read EVERY figure in data/state-charges.json from the CMS file it cites.

Same standard as data/verify_price_table.py: a figure that cannot be re-read from the
published file, to the cent, is a FAIL — not a warning. It also checks the three
promises the file makes about itself:
  · the file it cites hashes to the SHA-256 it records (and to the one data/prices.json cites)
  · every National figure equals the companion figure already published in data/prices.json
  · every state listed in states_missing really has no cell in the file, and no state
    appears in both by_state and states_missing

Usage: python3 data/verify_state_charges.py [path-to-MUP_PHY_..._Geo.csv]   (exit 1 on any FAIL)
"""
import csv, json, os, sys, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT = os.path.expanduser('~/.cache/waypoint-ledger/sources/phygeo.csv')
CENT = 0.011


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT
    doc_path = os.path.join(HERE, 'state-charges.json')
    if not os.path.exists(doc_path):
        print('FAIL data/state-charges.json does not exist. Build it: python3 data/build_state_charges.py')
        return 1
    doc = json.load(open(doc_path, encoding='utf-8'))
    prices = json.load(open(os.path.join(HERE, 'prices.json'), encoding='utf-8'))
    alt_of = {i['id']: (i.get('alternates') or {}) for i in prices['items']}
    fails, checked = [], 0

    if not os.path.exists(path):
        print('UNVERIFIED %s is not on disk; nothing was checked.' % path)
        return 1
    have = sha256(path)
    for label, want in (('state-charges.json', doc['_source']['file_sha256']),
                        ('prices.json', (prices.get('_cy2024_alternates') or {}).get('file_sha256'))):
        if want and have != want:
            fails.append('the file hashes %s; %s cites %s' % (have[:16], label, want[:16]))

    # every figure this document publishes, keyed by the cell it claims to have read
    want_cells = {}
    for pid, it in doc['items'].items():
        for key, fig in it['figures'].items():
            want_cells.setdefault((it['code'], fig['place_of_service']), []).append((pid, key, fig))
    codes = {c for c, _ in want_cells}

    grid = {}
    with open(path, newline='', encoding='latin-1') as f:
        for r in csv.DictReader(f):
            code = (r.get('HCPCS_Cd') or '').strip()
            if code not in codes:
                continue
            lvl = r.get('Rndrng_Prvdr_Geo_Lvl')
            if lvl not in ('National', 'State'):
                continue
            where = 'National' if lvl == 'National' else (r.get('Rndrng_Prvdr_Geo_Desc') or '').strip()
            grid.setdefault((code, (r.get('Place_Of_Srvc') or '').strip()), {})[where] = r

    for (code, pos), figs in sorted(want_cells.items()):
        cellset = grid.get((code, pos), {})
        for pid, key, fig in figs:
            field = fig['field']
            nat = cellset.get('National')
            if nat is None:
                fails.append('%s %s: no National row for %s POS %s' % (pid, key, code, pos))
                continue
            checked += 1
            got = round(float(nat[field]), 2)
            if abs(got - fig['national_usd']) > CENT:
                fails.append('%s %s: National %s is $%.2f in the file, $%.2f in the document'
                             % (pid, key, field, got, fig['national_usd']))
            published = alt_of.get(pid, {}).get(key)
            if isinstance(published, (int, float)) and abs(float(published) - fig['national_usd']) > CENT:
                fails.append('%s %s: prices.json publishes $%.2f, this document says $%.2f'
                             % (pid, key, float(published), fig['national_usd']))
            for state, cell in fig['by_state'].items():
                checked += 1
                r = cellset.get(state)
                if r is None:
                    fails.append('%s %s: %s is published here but has no cell in the file' % (pid, key, state))
                    continue
                got = round(float(r[field]), 2)
                if abs(got - cell[0]) > CENT:
                    fails.append('%s %s %s: file gives $%.2f, the document says $%.2f'
                                 % (pid, key, state, got, cell[0]))
                if int(float(r['Tot_Srvcs'])) != cell[1]:
                    fails.append('%s %s %s: service count differs' % (pid, key, state))
            for state in fig['states_missing']:
                checked += 1
                if state in fig['by_state']:
                    fails.append('%s %s: %s is in by_state AND states_missing' % (pid, key, state))
                elif state in cellset:
                    fails.append('%s %s: %s is called withheld but the file publishes a cell for it'
                                 % (pid, key, state))

    for f in fails:
        print('FAIL ' + f)
    print('%d figures re-read from %s: %d FAIL' % (checked, doc['_source']['file'], len(fails)))
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())

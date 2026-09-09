#!/usr/bin/env python3
"""Build data/state-charges.json: the CY2024 STATE-level average submitted charge and
average Medicare allowed amount, per state, for every price-table row that already carries
a CY2024 National companion figure.

WHY THIS FILE EXISTS. The ledger's fitting bar asks a person for their state, and then, for
an uninsured person, shows a NATIONAL average charge — because data/verify_price_table.py
reads the same 42 MB CMS file with `if Rndrng_Prvdr_Geo_Lvl != 'National': continue`. That
file publishes State rows too. Nothing is derived here and no figure is estimated: the state
figure is read to the cent from the same file, at the same place of service the row already
uses, and the file's SHA-256 is checked against the hash the audit recorded before a single
figure is taken from it.

  source: CMS, Medicare Physician & Other Practitioners — by Geography and Service, CY2024
          MUP_PHY_R26_P05_V10_D24_Geo.csv
  fields: Avg_Sbmtd_Chrg   — what providers billed, on average (a CHARGE)
          Avg_Mdcr_Alowd_Amt — what Medicare allowed, on average (an ALLOWED amount)
  key:    Rndrng_Prvdr_Geo_Lvl=State, Rndrng_Prvdr_Geo_Desc=<state>, HCPCS_Cd=<code>,
          Place_Of_Srvc=<the row's own setting>

WHERE CMS IS SILENT IS ALSO PUBLISHED. CMS suppresses a cell with fewer than 11 beneficiaries
by omitting the row, so a state with no row is a published absence, not a zero. Every id
carries `states_missing`, the list of states CMS publishes no cell for, so the product can say
so on the line and count the gap instead of showing a national figure as if it were local.

Usage:  python3 data/build_state_charges.py [path-to-MUP_PHY_..._Geo.csv]
        (defaults to the audit's own cache: ~/.cache/waypoint-ledger/sources/phygeo.csv)
Verify: python3 data/verify_state_charges.py   (re-reads every figure from the file; exit 1 on any mismatch)
"""
import csv, json, os, sys, hashlib, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
# The code parser and the place-of-service rule belong to the audit. Importing them
# means this file can never read a different cell than data/verify_price_table.py
# checked — a second copy of that rule would be a disagreement waiting to happen.
from verify_price_table import (ALT_ALLOWED_KEY, ALT_CHARGE_KEYS, ALT_MDCR_FIELD,
                                FACILITY_ALT_KEYS, FACILITY_ALT_ROWS, hcpcs_of)

DEFAULT = os.path.expanduser('~/.cache/waypoint-ledger/sources/phygeo.csv')
OUT = os.path.join(HERE, 'state-charges.json')

FILE_NAME = 'MUP_PHY_R26_P05_V10_D24_Geo.csv'
FILE_URL = ('https://data.cms.gov/sites/default/files/2026-05/'
            'e534c74b-79b8-4892-8a95-5a17e2dfec9f/MUP_PHY_R26_P05_V10_D24_Geo.csv')
SOURCE_TITLE = ('CMS, Medicare Physician & Other Practitioners — by Geography and Service, '
                'calendar year 2024 (released 2026-05)')
LANDING = ('https://data.cms.gov/provider-summary-by-type-of-service/'
           'medicare-physician-other-practitioners/'
           'medicare-physician-other-practitioners-by-geography-and-service')
CHARGE_FIELD = 'Avg_Sbmtd_Chrg'


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def figures_wanted(prices):
    """[(price_id, code, key, field, pos, published_national_usd)] — one entry per CY2024
    companion figure the price table already publishes and the audit already re-read."""
    out = []
    for it in prices['items']:
        alt = it.get('alternates') or {}
        if not alt.get('cy2024_source_row'):
            continue
        code = hcpcs_of(it)
        if not code:
            continue
        for key in ALT_CHARGE_KEYS + (ALT_ALLOWED_KEY,):
            if not isinstance(alt.get(key), (int, float)):
                continue
            pos = 'F' if (key in FACILITY_ALT_KEYS or it['id'] in FACILITY_ALT_ROWS) else 'O'
            field = ALT_MDCR_FIELD if key == ALT_ALLOWED_KEY else CHARGE_FIELD
            out.append((it['id'], code, key, field, pos, round(float(alt[key]), 2)))
    return out


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT
    if not os.path.exists(path):
        print('NOT BUILT: %s is not on disk. This script never downloads; point it at the file.' % path)
        return 1
    prices = json.load(open(os.path.join(HERE, 'prices.json'), encoding='utf-8'))
    cited = ((prices.get('_cy2024_alternates') or {}).get('file_sha256') or '')
    have = sha256(path)
    if cited and have != cited:
        print('NOT BUILT: %s hashes %s; data/prices.json cites %s. Refusing to read a different file.'
              % (os.path.basename(path), have[:16], cited[:16]))
        return 1

    want = figures_wanted(prices)
    codes = {c for _, c, _, _, _, _ in want}
    # (code, pos) -> {'National': row, state_name: row}
    cells = {}
    states = set()
    with open(path, newline='', encoding='latin-1') as f:
        for r in csv.DictReader(f):
            code = (r.get('HCPCS_Cd') or '').strip()
            if code not in codes:
                continue
            lvl = r.get('Rndrng_Prvdr_Geo_Lvl')
            if lvl not in ('National', 'State'):
                continue
            pos = (r.get('Place_Of_Srvc') or '').strip()
            where = 'National' if lvl == 'National' else (r.get('Rndrng_Prvdr_Geo_Desc') or '').strip()
            if not where:
                continue
            if lvl == 'State':
                states.add(where)
            cells.setdefault((code, pos), {})[where] = r

    all_states = sorted(states)
    items, excluded, audit = {}, {}, []
    for pid, code, key, field, pos, published in want:
        grid = cells.get((code, pos), {})
        nat = grid.get('National')
        if nat is None:
            excluded['%s · %s' % (pid, key)] = ('CMS publishes no National row for %s at place of service %s '
                                                'in %s' % (code, pos, FILE_NAME))
            audit.append('SKIP %-40s %-52s no National cell' % (pid, key))
            continue
        got = round(float(nat[field]), 2)
        if abs(got - published) > 0.011:
            # Reading a different cell than the audited one. Say so; never publish it.
            excluded['%s · %s' % (pid, key)] = (
                '%s at %s, POS %s reads $%.2f in %s; data/prices.json publishes $%.2f for this figure, so the '
                'state cells under it would not be the same measure' % (field, code, pos, got, FILE_NAME, published))
            audit.append('SKIP %-40s %-52s national $%.2f != published $%.2f' % (pid, key, got, published))
            continue
        by_state = {}
        for st in all_states:
            r = grid.get(st)
            if r is None:
                continue
            by_state[st] = [round(float(r[field]), 2), int(float(r['Tot_Srvcs'])), int(float(r['Tot_Rndrng_Prvdrs']))]
        missing = [st for st in all_states if st not in by_state]
        items.setdefault(pid, {'code': code, 'figures': {}})['figures'][key] = dict(
            field=field, place_of_service=pos, national_usd=got,
            national_services=int(float(nat['Tot_Srvcs'])),
            by_state=by_state, states_published=len(by_state), states_missing=missing,
            source_row=('Rndrng_Prvdr_Geo_Lvl=State, Rndrng_Prvdr_Geo_Desc=<state>, HCPCS_Cd=%s, '
                        'Place_Of_Srvc=%s, field %s' % (code, pos, field)))
        audit.append('OK   %-40s %-52s %3d states published, %2d withheld by CMS'
                     % (pid, key, len(by_state), len(missing)))

    doc = {
        '_README': ('CY2024 figures BY STATE, read to the cent from the CMS file named below, at the same '
                    'place of service and in the same field the audited National companion figure on that '
                    'row came from. Nothing is derived, averaged or estimated. A submitted charge is what '
                    'providers billed, not what anyone paid; it is never added to an allowed amount or to a '
                    'total. A state that CMS publishes no cell for is listed in states_missing — a published '
                    'absence, not a zero. A figure whose National cell does not equal the figure already '
                    'published in data/prices.json is not published here at all; the reason is in _excluded. '
                    'Rebuild: data/build_state_charges.py · verify: data/verify_state_charges.py'),
        '_version': datetime.date.today().isoformat() + '.1',
        '_source': dict(title=SOURCE_TITLE, landing_url=LANDING, file=FILE_NAME, file_url=FILE_URL,
                        file_sha256=have, retrieved=datetime.date.today().isoformat(),
                        charge_field=CHARGE_FIELD, allowed_field=ALT_MDCR_FIELD),
        '_by_state_columns': ['usd', 'total_services', 'rendering_providers'],
        '_suppression': ('CMS omits a cell drawn from fewer than 11 beneficiaries, so a state absent from '
                         'by_state is a cell CMS does not publish. Those states are listed in states_missing '
                         'and are counted, never filled in with the national figure.'),
        '_states': all_states,
        '_excluded': excluded,
        'items': items,
    }
    json.dump(doc, open(OUT, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
    print('\n'.join(audit))
    print('\n%d price rows · %d figures · %d states · %d excluded · %s -> %s (%d bytes)'
          % (len(items), sum(len(v['figures']) for v in items.values()), len(all_states), len(excluded),
             FILE_NAME, os.path.relpath(OUT, HERE), os.path.getsize(OUT)))
    return 0


if __name__ == '__main__':
    sys.exit(main())

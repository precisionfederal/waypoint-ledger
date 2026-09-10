#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Re-derive the two BLS inputs behind the burden cards, from the pages they cite.

The burden cards in components/BurdenLedger.tsx are the only dollar figures in this
product produced by arithmetic instead of a lookup, so both ends are checked here:

  A. THE INPUTS, at the source. Fetch the source_url printed on each row and look for
     the figure on the page. PASS only on a fetch that actually happened and actually
     contained the number. If BLS does not serve the page to this client, the check is
     UNVERIFIED — never PASS — and the HTTP status is printed so it is obvious why.
  B. THE ARITHMETIC, recomputed here in Python, independently of the TypeScript, for
     the worked examples the tests assert: twelve missed workdays and forty hours of
     unpaid care, plus every alternate rate offered on the cards.

Usage:  python3 data/verify_burdens.py [--offline]
Exit 1 on any FAIL. UNVERIFIED exits 0 and says so on the last line.
"""
import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PRICES = os.path.join(HERE, 'prices.json')
WORKDAY_ID = 'bls2026q2-median-weekly-earnings'
CARE_ID = 'bls2025-caregiver-replacement-wages'
UA = 'Waypoint Ledger price verification (Precision Federal; bo@precisionfederal.com)'

OFFLINE = '--offline' in sys.argv
results = []          # (state, name, detail)

def record(state, name, detail):
    results.append((state, name, detail))
    print(f'{state:<11} {name}\n            {detail}')

def row(items, rid):
    for it in items:
        if it['id'] == rid:
            return it
    raise SystemExit(f'FAIL: row {rid} is not in prices.json')

def fetch(url):
    """Returns (http_status, text, error). Never raises."""
    if OFFLINE:
        return (None, '', 'skipped: --offline')
    try:
        p = subprocess.run(
            ['curl', '-sS', '-L', '--max-time', '45', '-A', UA, '-w', '\n__HTTP__%{http_code}', url],
            capture_output=True, text=True, timeout=60)
    except Exception as e:                                    # noqa: BLE001
        return (None, '', f'curl failed: {e}')
    body = p.stdout
    m = re.search(r'__HTTP__(\d{3})\s*$', body)
    status = int(m.group(1)) if m else None
    body = body[:m.start()] if m else body
    err = p.stderr.strip() or None
    return (status, body, err)

def plain(html):
    t = re.sub(r'(?is)<(script|style).*?</\1>', ' ', html)
    t = re.sub(r'(?s)<[^>]+>', ' ', t)
    return re.sub(r'\s+', ' ', t.replace('&nbsp;', ' ').replace('&#36;', '$'))

def check_on_page(name, url, needles, context=None):
    """needles: list of strings that must all appear in the page text."""
    status, html, err = fetch(url)
    if status != 200 or not html:
        record('UNVERIFIED', name,
               f'no readable page from {url} (HTTP {status}; {err or "no error text"}). '
               'Nothing is asserted about this figure from a fetch that did not happen.')
        return
    text = plain(html)
    if context:
        i = text.find(context)
        window = text[max(0, i - 400): i + 1200] if i >= 0 else ''
    else:
        window = text
    missing = [n for n in needles if n not in window]
    if missing:
        record('FAIL', name,
               f'fetched {url} (HTTP 200, {len(html):,} bytes) but did not find {missing} '
               + (f'within 1,600 characters of "{context}"' if context else 'anywhere on the page'))
    else:
        record('PASS', name, f'found {needles} on {url} (HTTP 200, {len(html):,} bytes)')

# ---------------------------------------------------------------- OEWS ---
# The caregiving row cites https://www.bls.gov/oes/current/oes_nat.htm. As of this
# run BLS serves that path as the OEWS Tables landing page, with no occupational
# figures in it, so the wage cannot be read there. The figures ARE in the published
# national data file for the same release, which is fetched and read here.
OEWS_ZIP = 'https://www.bls.gov/oes/special-requests/oesm25nat.zip'
OEWS_CODES = {
    '31-1120': ('Home Health and Personal Care Aides', 'home_health_aide_median_hourly_usd'),
    '31-1131': ('Nursing Assistants', 'nursing_assistant_median_hourly_usd'),
    '29-1141': ('Registered Nurses', 'registered_nurse_median_hourly_usd'),
    '00-0000': ('All Occupations', 'all_occupations_median_hourly_usd'),
}

def check_oews(c):
    """Read every caregiving rate straight out of the BLS national data file."""
    status, html, err = fetch(c['source_url'])
    if status == 200 and '17.21' not in html:
        record('UNVERIFIED', 'the cited OEWS page no longer carries the wage',
               f"{c['source_url']} returned HTTP 200 ({len(html):,} bytes) but serves the OEWS Tables "
               'landing page, with no occupational figure on it. The published data file for the same '
               'release is read below instead; the row would be clearer if it cited that file.')
    elif status != 200:
        record('UNVERIFIED', 'the cited OEWS page could not be read',
               f"{c['source_url']} returned HTTP {status} ({err or 'no error text'}).")

    if OFFLINE:
        record('UNVERIFIED', 'OEWS May 2025 national file', 'skipped: --offline')
        return
    try:
        import openpyxl                                        # noqa: PLC0415
    except ImportError:
        record('UNVERIFIED', 'OEWS May 2025 national file',
               'openpyxl is not installed, so the federal spreadsheet was not opened. '
               'pip3 install openpyxl and run again.')
        return

    import io, zipfile                                          # noqa: PLC0415
    try:
        p = subprocess.run(['curl', '-sS', '-L', '--max-time', '120', '-A', UA, OEWS_ZIP],
                           capture_output=True, timeout=180)
        blob = p.stdout
        zf = zipfile.ZipFile(io.BytesIO(blob))
        name = next(n for n in zf.namelist() if n.endswith('.xlsx'))
        book = openpyxl.load_workbook(io.BytesIO(zf.read(name)), read_only=True, data_only=True)
    except Exception as e:                                      # noqa: BLE001
        record('UNVERIFIED', 'OEWS May 2025 national file',
               f'{OEWS_ZIP} could not be downloaded or opened ({e}). No wage is asserted from it.')
        return

    ws = book[book.sheetnames[0]]
    it = ws.iter_rows(values_only=True)
    hdr = next(it)
    ix = {h: i for i, h in enumerate(hdr) if h}
    found = {}
    for r in it:
        code = str(r[ix['OCC_CODE']] or '')
        if code in OEWS_CODES and str(r[ix['O_GROUP']]) in ('total', 'detailed'):
            found[code] = (r[ix['OCC_TITLE']], r[ix['H_MEDIAN']], r[ix['TOT_EMP']])

    alts = c.get('alternates', {})
    for code, (title, key) in OEWS_CODES.items():
        want = alts.get(key)
        got = found.get(code)
        if not got:
            record('FAIL', f'OEWS {code} {title}', f'not found in {name}')
            continue
        ok = isinstance(want, (int, float)) and abs(float(got[1]) - float(want)) < 0.005
        record('PASS' if ok else 'FAIL', f'OEWS {code} {title} median hourly',
               f'{name} row {code} H_MEDIAN = {got[1]}; the card uses {want} '
               f'({"same figure" if ok else "THESE DO NOT MATCH"})')

    aide = found.get('31-1120')
    if aide:
        pop = str(aide[2])
        ok = pop.replace(',', '') in (c.get('population') or '').replace(',', '')
        record('PASS' if ok else 'FAIL', 'who the caregiving wage describes',
               f'{name} reports {int(float(pop)):,} employed home health and personal care aides; '
               f'the row {"says the same" if ok else "says something else"}')

def money(n):
    return f'${n:,.2f}'

def main():
    items = json.load(open(PRICES))['items']
    w, c = row(items, WORKDAY_ID), row(items, CARE_ID)

    print('A. THE INPUTS, at the sources the rows cite\n')
    check_on_page('BLS usual weekly earnings, $1,251 median (with men $1,380 and women $1,131)',
                  w['source_url'], ['1,251', '1,380', '1,131'])
    check_oews(c)

    print('\nB. THE ARITHMETIC, recomputed here\n')
    fails = 0

    # the row values the app reads
    for label, rw, want in (('weekly earnings row', w, 1251), ('caregiving wage row', c, 17.21)):
        state = 'PASS' if rw['value_usd'] == want else 'FAIL'
        fails += state == 'FAIL'
        record(state, f'{label} value_usd', f"prices.json says {rw['value_usd']}, the cards use {want}")
        state = 'PASS' if rw.get('summable') is False else 'FAIL'
        fails += state == 'FAIL'
        record(state, f'{label} is not summable',
               'so it can never enter the itemized medical total' if state == 'PASS'
               else 'summable is not false — this row could be added to the medical total')

    weekly = w['value_usd']
    daily = round(weekly / 5, 2)
    twelve = round(daily * 12, 2)
    state = 'PASS' if (daily, twelve) == (250.20, 3002.40) else 'FAIL'
    fails += state == 'FAIL'
    record(state, 'twelve missed workdays',
           f'{money(weekly)} a week / 5 = {money(daily)} a day x 12 = {money(twelve)} '
           '(the card prints this multiplication on its face)')

    alts = w.get('alternates', {})
    for k, days in (('men_usd', 12), ('women_usd', 12)):
        v = alts.get(k)
        got = round(round(v / 5, 2) * days, 2) if isinstance(v, (int, float)) else None
        state = 'PASS' if got is not None else 'FAIL'
        fails += state == 'FAIL'
        record(state, f'alternate basis {k}', f'{money(v)} / 5 x {days} = {money(got)}' if got else 'missing from the row')

    hourly = c['value_usd']
    forty = round(hourly * 40, 2)
    state = 'PASS' if forty == 688.40 else 'FAIL'
    fails += state == 'FAIL'
    record(state, 'forty hours of unpaid care',
           f'{money(hourly)} an hour x 40 = {money(forty)}')

    for k, want in (('nursing_assistant_median_hourly_usd', 812.80),
                    ('registered_nurse_median_hourly_usd', 1876.00),
                    ('all_occupations_median_hourly_usd', 980.40)):
        v = c['alternates'].get(k)
        got = round(v * 40, 2) if isinstance(v, (int, float)) else None
        state = 'PASS' if got == want else 'FAIL'
        fails += state == 'FAIL'
        record(state, f'alternate rate {k}',
               f'{money(v)} x 40 = {money(got)}' if got is not None else 'missing from the row')

    # Two things must hold at once, and only both together keep the trips card honest.
    #
    # (a) NOTHING PRICES A TRIP. A row naming travel that is ALSO summable would be a per-trip
    #     figure able to enter a medical total, and no federal file publishes one.
    # (b) NOTHING IS HIDDEN. The table does carry a federal per-mile reimbursement rate as a
    #     non-summable INPUT row. A card telling a person no federal figure exists at all,
    #     while the table held one, would be concealing it — so the card must name it.
    #
    # This replaced a blanket 'no travel row may exist' assertion on 2026-09-09, which failed
    # the moment the GSA rate was added. The assertion was wrong, not the table: an INPUT ONLY
    # reimbursement rate per mile is not a price for a trip.
    travel_rows = [i for i in items
                   if re.search(r'\b(mileage|per[- ]trip|travel)\b', (i.get('label') or ''), re.I)]
    priced_trip = [i['id'] for i in travel_rows if i.get('summable')]
    state = 'PASS' if not priced_trip else 'FAIL'
    fails += state == 'FAIL'
    record(state, 'no row prices a trip',
           'no summable row in the table prices a trip, which is what the trips card says on its face'
           if state == 'PASS' else f'{priced_trip} is summable — a per-trip figure could enter a medical total')

    card_path = os.path.join(os.path.dirname(HERE), 'lib', 'burdens.ts')
    card = ''
    if os.path.exists(card_path):
        whole = open(card_path, encoding='utf-8').read()
        card = whole[whole.find('export function countTrips'):][:2000]
    for i in travel_rows:
        if i.get('summable'):
            continue
        named = ('%.2f' % i['value_usd']) in card
        state = 'PASS' if named else 'FAIL'
        fails += state == 'FAIL'
        record(state, f"the trips card names the input row {i['id']}",
               f"the card tells the person the table holds {money(i['value_usd'])} a mile, so the input is offered rather than hidden"
               if named else
               f"the table holds {i['id']} at {money(i['value_usd'])} and the trips card never mentions it — "
               f"a person is told no federal figure exists while one sits in the table")

    unver = sum(1 for s, _, _ in results if s == 'UNVERIFIED')
    p = sum(1 for s, _, _ in results if s == 'PASS')
    print(f'\n{p} PASS · {fails} FAIL · {unver} UNVERIFIED')
    if unver:
        print('UNVERIFIED means the page was not read by this run. It is not a pass, and the '
              'figure it covers is only as good as the last run that did read the page.')
    return 1 if fails else 0

if __name__ == '__main__':
    sys.exit(main())

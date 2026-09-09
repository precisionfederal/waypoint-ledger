#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ANNOTATE THE PRICE TABLE — the fields the app needs on the face of a row, added
from published federal sources only, so a stranger can re-run this and get the
same file.

It adds, and never invents:
  agency / agency_display   which federal body published the figure, from the
                            row's own source_url (a lookup, not a judgement).
  loinc + loinc_long_common_name
                            the NLM order code for a lab row, confirmed by an
                            exact-code query to the NLM Clinical Table Search
                            Service. A code whose returned name does not name
                            the same test is OMITTED — never guessed.
  alternates.facility_setting_physician_payment_usd
                            for the office-visit E/M codes: what Medicare pays
                            the SAME CPT code when the visit happens inside a
                            hospital clinic. Read as the FACILITY total RVU on
                            the unmodified line of the CMS RVU file and
                            multiplied by the conversion factor printed in that
                            same file. DERIVED, formula on the face.
  gsa2026-pov-mileage-rate  one new row, only when the GSA page is fetched in
                            this run and the rate is read out of it.

Usage:  python3 data/annotate_price_table.py [--rvu DIR] [--no-net]
Exits non-zero if anything it was asked to add could not be sourced.
"""
import argparse, csv, json, os, re, sys, html, time
import urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PRICES = os.path.join(HERE, 'prices.json')
DEFAULT_RVU = ("/private/tmp/claude-501/-Users-bo-Documents-100M-Lifetime-Revenue-Precision-"
               "Federal-Proposal-Builder/5a45513e-1a30-4734-8f49-694b18a231f1/scratchpad/price-table")
UA = 'WaypointLedger/1.0 (+https://waypoint-ledger.pages.dev; bo@precisionfederal.com)'

# ---------------------------------------------------------------- agency
# Which federal body published the file the row cites. Keyed on the source URL
# so it cannot drift from the citation.
AGENCY_BY_HOST_PATH = [
    ('cms.gov',        'CMS',  'CMS'),
    ('meps.ahrq.gov',  'AHRQ', 'AHRQ MEPS'),
    ('hcup-us.ahrq.gov', 'AHRQ', 'AHRQ HCUP'),
    ('bls.gov',        'BLS',  'BLS'),
    ('gsa.gov',        'GSA',  'GSA'),
]
# The two long-COVID rows cite a peer-reviewed analysis of MEPS hosted at PMC.
# The DATA is AHRQ MEPS; the analysis is the cited article. Both are named.
PMC_ROWS = {'meps2022-longcovid-excess-total': ('AHRQ', 'AHRQ MEPS'),
            'meps2022-longcovid-excess-out-of-pocket': ('AHRQ', 'AHRQ MEPS')}

# ---------------------------------------------------------------- LOINC
# Candidate order codes. Each is CONFIRMED against the NLM service before it is
# written: the service must return that exact code and the returned long common
# name must contain every word in the second element. A row not listed here has
# no LOINC written — the four we could not pin to one unambiguous order code
# (troponin, allergen-specific IgE, and the two Lyme serologies) are left out on
# purpose rather than guessed at.
LOINC_CANDIDATES = {
    'cms-lab-cbc':               ('57021-8',  ['CBC', 'Differential']),
    'cms-lab-cmp':               ('24323-8',  ['Comprehensive metabolic']),
    'cms-lab-bmp':               ('24321-2',  ['Basic metabolic']),
    'cms-lab-tsh':               ('3016-3',   ['Thyrotropin']),
    'cms-lab-ana':               ('5048-4',   ['Nuclear Ab']),
    'cms-lab-esr':               ('30341-2',  ['Sedimentation Rate']),
    'cms-lab-crp':               ('1988-5',   ['C reactive protein']),
    'cms-lab-hscrp':             ('30522-7',  ['C reactive protein', 'High sensitivity']),
    'cms-lab-ddimer':            ('48065-7',  ['D-dimer']),
    'cms-lab-ferritin':          ('2276-4',   ['Ferritin']),
    'cms-lab-vitamin-d':         ('62292-8',  ['Hydroxyvitamin D3']),
    'cms-lab-b12':               ('2132-9',   ['Cobalamin']),
    'cms-lab-a1c':               ('4548-4',   ['Hemoglobin A1c']),
    'cms-lab-lipid-panel':       ('24331-1',  ['Lipid', 'panel']),
    'cms-lab-free-t4':           ('3024-7',   ['Thyroxine', 'free']),
    'cms-lab-glucose':           ('2345-7',   ['Glucose']),
    'cms-lab-urinalysis':        ('24356-8',  ['Urinalysis', 'panel']),
    'cms-lab-urine-culture':     ('630-4',    ['Bacteria identified', 'Urine']),
    'cms-lab-covid-pcr':         ('94500-6',  ['SARS-CoV-2']),
    'cms-lab-magnesium':         ('19123-9',  ['Magnesium']),
    'cms-lab-ck':                ('2157-6',   ['Creatine kinase']),
    'cms-lab-bnp':               ('30934-4',  ['Natriuretic peptide B']),
    'cms-lab-pt-inr':            ('5902-2',   ['Prothrombin time']),
    'cms-lab-ptt':               ('14979-9',  ['aPTT']),
    'cms-lab-ena':               ('90228-8',  ['Extractable nuclear antigen']),
    'cms-lab-dsdna':             ('5130-0',   ['DNA double strand Ab']),
    'cms-lab-free-testosterone': ('2991-8',   ['Testosterone Free']),
    'cms-lab-fsh':               ('15067-2',  ['Follitropin']),
    'cms-lab-estradiol':         ('2243-4',   ['Estradiol']),
    'cms-lab-prolactin':         ('2842-3',   ['Prolactin']),
    'cms-lab-iron-binding':      ('2500-7',   ['Iron binding capacity']),
    'cms-lab-folate':            ('2284-8',   ['Folate']),
    'cms-lab-syphilis':          ('24110-9',  ['Treponema pallidum']),
    'cms-lab-hep-b-surface-ag':  ('5196-1',   ['Hepatitis B virus surface Ag']),
    'cms-lab-hep-c-ab':          ('16128-1',  ['Hepatitis C virus Ab']),
    'cms-lab-hiv':               ('56888-1',  ['HIV 1+2 Ab']),
}
LOINC_API = 'https://clinicaltables.nlm.nih.gov/api/loinc_items/v3/search'
LOINC_SOURCE = ('NLM Clinical Table Search Service, LOINC table '
                '(https://clinicaltables.nlm.nih.gov/apidoc/loinc_items/v3/doc.html)')

# ------------------------------------------- the hospital-clinic E/M comparison
# The office-visit codes: what the same CPT pays the physician when the visit
# happens in a hospital-owned clinic instead of a freestanding office.
EM_ROWS = ['cms-99202', 'cms-99203', 'cms-99204', 'cms-99205',
           'cms-99211', 'cms-99212', 'cms-99213', 'cms-99214', 'cms-99215']


def get(url, timeout=45):
    req = urllib.request.Request(url, headers={'User-Agent': UA,
                                               'Accept': 'text/html,application/json,*/*'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def load_rvu(path):
    """FACILITY and NON-FACILITY totals from the unmodified line of each code."""
    rows = list(csv.reader(open(path, encoding='latin-1')))
    hi = next(i for i, r in enumerate(rows) if r and r[0].strip() == 'HCPCS')
    out = {}
    for r in rows[hi + 1:]:
        if len(r) < 27 or r[1].strip():
            continue
        code = r[0].strip()
        if code in out:
            continue
        try:
            out[code] = dict(status=r[3].strip(), work=float(r[5]), pe_nf=float(r[6]),
                             pe_fac=float(r[8]), mp=float(r[10]),
                             total_nf=float(r[11]), total_fac=float(r[12]), cf=float(r[25]))
        except ValueError:
            continue
    return out


def confirm_loinc(code, must_contain):
    q = LOINC_API + '?' + urllib.parse.urlencode(
        {'terms': code, 'df': 'LOINC_NUM,LONG_COMMON_NAME', 'maxList': 8, 'sf': 'LOINC_NUM'})
    data = json.loads(get(q, 25))
    for row in (data[3] or []):
        if row[0] == code:
            name = row[1]
            if all(w.lower() in name.lower() for w in must_contain):
                return name
            return None
    return None


def gsa_mileage():
    """Read the current privately-owned-automobile rate off the GSA page."""
    url = ('https://www.gsa.gov/travel/plan-a-trip/transportation-airfare-rates-pov-rates/'
           'pov-mileage-reimbursement')
    raw = get(url).decode('utf-8', 'replace')
    text = re.sub(r'<script.*?</script>|<style.*?</style>', '', raw, flags=re.S)
    text = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', text)))
    eff = re.search(r'Current mileage rates effective ([A-Z][a-z]+ \d{1,2}, \d{4})', text)
    m = re.search(r'no government-owned automobile was authorized or available\s*\$?(\d?\.\d{2,3})'
                  r'\s*per mile', text)
    if not m or not eff:
        return None
    return {'rate': float(m.group(1)), 'effective': eff.group(1), 'url': url,
            'quote': m.group(0).strip()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rvu', default=DEFAULT_RVU,
                    help='directory holding rvu26c/PPRRVU2026_Jul_nonQPP.csv')
    ap.add_argument('--no-net', action='store_true',
                    help='skip everything that needs a fetch (LOINC, GSA)')
    a = ap.parse_args()

    data = json.load(open(PRICES, encoding='utf-8'))
    items = data['items']
    by_id = {i['id']: i for i in items}
    problems, added = [], []

    # ---- agency -----------------------------------------------------------
    for it in items:
        url = it.get('source_url') or ''
        ag = PMC_ROWS.get(it['id'])
        if not ag:
            for host, agency, disp in AGENCY_BY_HOST_PATH:
                if host in url:
                    ag = (agency, disp); break
        if not ag:
            problems.append('%s: no agency could be read from source_url %r' % (it['id'], url))
            continue
        it['agency'], it['agency_display'] = ag
    added.append('agency on %d rows' % sum(1 for i in items if i.get('agency')))

    # ---- facility-setting physician payment for the office-visit codes -----
    rvu_csv = os.path.join(a.rvu, 'rvu26c', 'PPRRVU2026_Jul_nonQPP.csv')
    if not os.path.exists(rvu_csv):
        rvu_csv = os.path.join(a.rvu, 'PPRRVU2026_Jul_nonQPP.csv')
    if os.path.exists(rvu_csv):
        rvu = load_rvu(rvu_csv)
        n = 0
        for rid in EM_ROWS:
            it = by_id.get(rid)
            if not it:
                problems.append('%s: row missing' % rid); continue
            code = (it.get('code') or '').replace('CPT ', '').strip()
            r = rvu.get(code)
            if not r:
                problems.append('%s: CPT %s not in the RVU file' % (rid, code)); continue
            fac = round(r['total_fac'] * r['cf'], 2)
            alt = it.setdefault('alternates', {})
            alt['facility_setting_physician_payment_usd'] = fac
            alt['facility_setting_total_rvu'] = r['total_fac']
            alt['_facility_setting_note'] = (
                'DERIVED, same file, same conversion factor. What Medicare pays the DOCTOR for this '
                'exact CPT code when the visit happens inside a hospital-owned clinic instead of a '
                'freestanding office: %.2f facility total RVUs x $%.4f = $%.2f. It is lower than the '
                'office figure because the practice-expense half of the payment moves to the hospital, '
                'which bills its own facility fee (HCPCS G0463) on top. The two bills together are what '
                'the visit costs Medicare in that setting.' % (r['total_fac'], r['cf'], fac))
            n += 1
        added.append('facility-setting payment on %d E/M rows' % n)
    else:
        problems.append('RVU file not found at %s — facility figures not written' % rvu_csv)

    # ---- LOINC ------------------------------------------------------------
    if a.no_net:
        added.append('LOINC skipped (--no-net)')
    else:
        ok = 0
        for rid, (code, words) in LOINC_CANDIDATES.items():
            it = by_id.get(rid)
            if not it:
                problems.append('%s: row missing' % rid); continue
            name = confirm_loinc(code, words)
            if not name:
                problems.append('%s: LOINC %s did not confirm at NLM — omitted' % (rid, code))
                it.pop('loinc', None); it.pop('loinc_long_common_name', None)
                it.pop('loinc_source', None)
                continue
            it['loinc'] = code
            it['loinc_long_common_name'] = name
            it['loinc_source'] = LOINC_SOURCE
            ok += 1
            time.sleep(0.1)
        added.append('LOINC on %d lab rows' % ok)

    # ---- GSA mileage row --------------------------------------------------
    if a.no_net:
        added.append('GSA mileage skipped (--no-net)')
    else:
        g = gsa_mileage()
        if not g:
            problems.append('GSA POV page did not yield a rate — no mileage row written')
        else:
            row = {
                'id': 'gsa2026-pov-mileage-rate',
                'label': 'INPUT ONLY — the federal mileage rate for driving your own car',
                'plain_language_synonyms': ['mileage', 'driving to appointments', 'gas money',
                                            'miles driven', 'travel to the doctor'],
                'value_usd': g['rate'],
                'out_of_pocket_usd': None,
                'basis': 'rate',
                'attribution': 'not_applicable',
                'summable': False,
                'mutually_exclusive_with': [],
                'bundles_ancillaries': False,
                'year': 'effective %s' % g['effective'],
                'geography': 'United States, one national rate',
                'population': 'Federal employees travelling on official business. NOT patients.',
                'coverage_statement': (
                    '🔴 THIS IS NOT A MEDICAL PRICE AND NOBODY WILL PAY IT TO YOU. It is the rate the '
                    'federal government reimburses its OWN employees, per mile, for driving a personal '
                    'car on official travel — $%.2f a mile, effective %s. It is in this table for one '
                    'reason: the driving a long diagnostic search costs is real, and the only published '
                    'federal figure that puts a dollar on a mile is this one. If you count your miles '
                    'with it you are borrowing the government\'s own number for its own travel, which is '
                    'a defensible thing to do and a different thing from a bill.\n\n'
                    'It cannot be added to any medical line here: those are prices for care, this is a '
                    'reimbursement rate for transport. It sits in its own stack, always.\n\n'
                    'Who it describes: federal travellers. Who it does NOT describe: patients, whose '
                    'actual cost per mile depends on the car, the fuel price and the year, and for whom '
                    'no federal agency publishes a figure at all. The IRS publishes a separate and lower '
                    'MEDICAL mileage deduction rate; it is a tax rule, not a price, and it is not this.'
                ) % (g['rate'], g['effective']),
                'source_title': ('U.S. General Services Administration, POV mileage reimbursement rates, '
                                 'automobile rate effective %s' % g['effective']),
                'source_url': g['url'],
                'confidence': 'VERIFIED',
                'code': None,
                'agency': 'GSA',
                'agency_display': 'GSA',
                'alternates': {
                    '_quote_read_on_the_page': g['quote'],
                },
            }
            existing = by_id.get(row['id'])
            if existing:
                items[items.index(existing)] = row
            else:
                items.append(row)
            added.append('GSA mileage row $%.2f/mile effective %s' % (g['rate'], g['effective']))

    data['_annotated'] = time.strftime('%Y-%m-%d')
    with open(PRICES, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.write('\n')

    for line in added:
        print('added:', line)
    if problems:
        print('\nNOT ADDED (%d):' % len(problems))
        for p in problems:
            print('  -', p)
        return 1
    print('\n%d rows in the table.' % len(items))
    return 0


if __name__ == '__main__':
    sys.exit(main())

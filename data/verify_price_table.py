#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VERIFY EVERY ROW OF THE WAYPOINT LEDGER PRICE TABLE, from the published sources.

This is the whole audit, not a sample. It fetches each cited federal file from
its published URL (or reuses a local cache), records the SHA256 of what it
fetched, and then re-derives or re-reads every dollar figure in data/prices.json.

  PASS        the figure was recomputed from, or found in, the cited source
              in a context that names the measure.
  FAIL        the source says something else. Exit code 1.
  UNVERIFIED  the source could not be fetched or parsed in this run, or the
              figure is not machine-checkable from the file's text layer. Never
              a pass; never silently a failure either — it is the honest third
              answer, and it is printed with its reason.

Nothing here trusts the file it is checking: the expected values come from the
sources, and prices.json is the thing on trial.

Usage
  python3 data/verify_price_table.py                 # fetch what it needs, check all rows
  python3 data/verify_price_table.py --offline       # cache only; anything missing is UNVERIFIED
  python3 data/verify_price_table.py --local DIR     # also look in DIR for the CMS CSVs
  python3 data/verify_price_table.py --cache DIR     # where downloads live (default ~/.cache/waypoint-ledger)

Writes data/AUDIT.json. Exits 1 on any FAIL, 0 otherwise.
"""
import argparse, csv, hashlib, html, io, json, os, re, shutil, subprocess, sys, time, zipfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PRICES = os.path.join(HERE, 'prices.json')
AUDIT = os.path.join(HERE, 'AUDIT.json')
UA = 'WaypointLedger/1.0 (+https://waypoint-ledger.pages.dev; bo@precisionfederal.com)'
CF = 33.4009  # read from the file, then asserted against this

# --------------------------------------------------------------------------- sources
SOURCES = {
    'rvu': dict(url='https://www.cms.gov/files/zip/rvu26c-updated-06-30-2026.zip',
                member='PPRRVU2026_Jul_nonQPP.csv', kind='csv',
                title='CMS CY2026 National Physician Fee Schedule Relative Value File (RVU26C, July release)'),
    'gpci': dict(url='https://www.cms.gov/files/zip/rvu26c-updated-06-30-2026.zip',
                 member='GPCI2026.csv', kind='csv',
                 title='CMS CY2026 Geographic Practice Cost Indices, Addendum E (RVU26C, July release)'),
    'phygeo': dict(url='https://data.cms.gov/sites/default/files/2026-05/'
                       'e534c74b-79b8-4892-8a95-5a17e2dfec9f/MUP_PHY_R26_P05_V10_D24_Geo.csv',
                   kind='csv',
                   title='CMS, Medicare Physician & Other Practitioners — by Geography and Service, '
                         'calendar year 2024'),
    'clfs': dict(url='https://www.cms.gov/files/zip/26clabq3.zip',
                 member='PUF_CLFS_CY2026_Q3V1.csv', kind='csv',
                 title='CMS Clinical Laboratory Fee Schedule, CY2026 Q3 public use file'),
    'oppsb': dict(url='https://www.cms.gov/files/zip/january-2026-opps-addendum-b.zip',
                  member='Addendum B', member_ext='.csv', kind='csv',
                  file='2026 January Web Addendum B.12.29.25.csv',
                  title='CMS January 2026 Hospital Outpatient PPS Addendum B'),
    'oews': dict(url='https://www.bls.gov/oes/special-requests/oesm25nat.zip',
                 member='national_M2025_dl.xlsx', kind='xlsx',
                 title='BLS Occupational Employment and Wage Statistics, May 2025 national estimates'),
    'meps2014t1': dict(url='https://meps.ahrq.gov/data_stats/summ_tables/hc/mean_expend/2014/table1.pdf',
                       kind='pdf', title='AHRQ MEPS HC Summary Table 1, 2014'),
    'st484': dict(url='https://meps.ahrq.gov/data_files/publications/st484/stat484.pdf', kind='pdf',
                  title='AHRQ MEPS Statistical Brief #484'),
    'st532': dict(url='https://meps.ahrq.gov/data_files/publications/st532/stat532.pdf', kind='pdf',
                  title='AHRQ MEPS Statistical Brief #532'),
    'st560': dict(url='https://meps.ahrq.gov/data_files/publications/st560/stat560.pdf', kind='pdf',
                  title='AHRQ MEPS Statistical Brief #560'),
    'st562': dict(url='https://meps.ahrq.gov/data_files/publications/st562/stat562.pdf', kind='pdf',
                  title='AHRQ MEPS Statistical Brief #562'),
    'st568': dict(url='https://meps.ahrq.gov/data_files/publications/st568/stat568.pdf', kind='pdf',
                  title='AHRQ MEPS Statistical Brief #568'),
    'sb311': dict(url='https://hcup-us.ahrq.gov/reports/statbriefs/sb311-ED-visit-costs-2021.pdf',
                  kind='pdf', title='AHRQ HCUP Statistical Brief #311'),
    'edccr': dict(url='https://hcup-us.ahrq.gov/db/ccr/ed-ccr/SummaryStats_edcc2021neds.PDF',
                  kind='pdf', title='AHRQ HCUP ED cost-to-charge ratio summary statistics, 2021'),
    'partb': dict(url='https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles',
                  kind='html', title='CMS fact sheet, 2026 Medicare Parts A and B premiums and deductibles'),
    'partd': dict(url='https://www.cms.gov/files/document/final-cy-2026-part-d-redesign-program-instruction.pdf',
                  kind='pdf', title='CMS Final CY2026 Part D Redesign Program Instructions'),
    'blswk': dict(url='https://www.bls.gov/news.release/wkyeng.nr0.htm', kind='html',
                  title='BLS Usual Weekly Earnings of Wage and Salary Workers, second quarter 2026'),
    'pmc': dict(url='https://pmc.ncbi.nlm.nih.gov/articles/PMC12607343/', kind='html',
                title='Long COVID Is Associated with Excess Direct Healthcare Expenditures Among Adults '
                      'in the United States (MEPS 2022), PubMed Central'),
    'gsa': dict(url='https://www.gsa.gov/travel/plan-a-trip/transportation-airfare-rates-pov-rates/'
                    'pov-mileage-reimbursement', kind='html',
                title='GSA privately owned vehicle mileage reimbursement rates'),
}

CACHE = os.path.expanduser('~/.cache/waypoint-ledger/sources')
STATE = {}          # key -> dict(path, sha256, bytes, retrieved, error)
TEXT = {}           # key -> extracted text
OFFLINE = False
LOCAL_DIRS = []


# --------------------------------------------------------------------------- plumbing
def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def file_name(key):
    """The federal file we actually read, by the name its publisher gave it.

    A correction routed back to CMS or AHRQ has to name a file a person there can
    pull up. `member` is the file inside the zip; `file` overrides it where the
    archive's real member name differs from the pattern we match on."""
    s = SOURCES[key]
    if s.get('file') or s.get('member'):
        return s.get('file') or s['member']
    # a landing page has no file name; the last real path segment is what it is called
    parts = [x for x in s['url'].split('?')[0].split('/') if x]
    return parts[-1] if parts else s['url']


def _find_local(member):
    for d in LOCAL_DIRS:
        for root, _dirs, files in os.walk(d):
            for f in files:
                if f == member:
                    return os.path.join(root, f)
    return None


def fetch(key):
    """Return the local path of the source's payload, downloading if needed."""
    if key in STATE:
        return STATE[key].get('path')
    s = SOURCES[key]
    os.makedirs(CACHE, exist_ok=True)
    ext = {'pdf': '.pdf', 'html': '.html', 'csv': '.csv', 'xlsx': '.xlsx'}[s['kind']]
    out = os.path.join(CACHE, key + ext)
    raw = os.path.join(CACHE, key + '.download')

    if not os.path.exists(out):
        local = _find_local(s['member']) if s.get('member') and s['kind'] in ('csv', 'xlsx') else None
        if local:
            shutil.copyfile(local, out)
            STATE[key] = dict(path=out, sha256=sha256(out), bytes=os.path.getsize(out),
                              retrieved='local copy: %s' % local, url=s['url'], title=s['title'],
                              file=file_name(key))
            return out
        if OFFLINE:
            STATE[key] = dict(path=None, error='not in cache and --offline', url=s['url'], title=s['title'])
            return None
        try:
            req = urllib.request.Request(s['url'], headers={
                'User-Agent': UA, 'Accept': 'text/html,application/pdf,application/zip,*/*',
                'Accept-Language': 'en-US,en;q=0.9'})
            with urllib.request.urlopen(req, timeout=90) as r:
                body = r.read()
        except Exception as e:                                    # noqa: BLE001
            STATE[key] = dict(path=None, error='fetch failed: %s' % e, url=s['url'], title=s['title'])
            return None
        if s['url'].endswith('.zip'):
            open(raw, 'wb').write(body)
            try:
                z = zipfile.ZipFile(raw)
                names = [n for n in z.namelist()
                         if s['member'] in os.path.basename(n)
                         and (not s.get('member_ext') or n.endswith(s['member_ext']))]
                if not names:
                    STATE[key] = dict(path=None, error='zip has no member matching %r' % s['member'],
                                      url=s['url'], title=s['title'])
                    return None
                open(out, 'wb').write(z.read(sorted(names, key=len)[0]))
            except Exception as e:                                # noqa: BLE001
                STATE[key] = dict(path=None, error='zip unreadable: %s' % e, url=s['url'], title=s['title'])
                return None
        else:
            open(out, 'wb').write(body)

    STATE[key] = dict(path=out, sha256=sha256(out), bytes=os.path.getsize(out),
                      retrieved=time.strftime('%Y-%m-%d'), url=s['url'], title=s['title'],
                      file=file_name(key))
    return out


def text(key):
    """Plain text of a PDF or HTML source, cached in memory."""
    if key in TEXT:
        return TEXT[key]
    p = fetch(key)
    if not p:
        TEXT[key] = None
        return None
    kind = SOURCES[key]['kind']
    if kind == 'pdf':
        if not shutil.which('pdftotext'):
            STATE[key]['error'] = 'pdftotext is not installed'
            TEXT[key] = None
            return None
        txt = p + '.txt'
        subprocess.run(['pdftotext', '-layout', p, txt], check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        TEXT[key] = open(txt, encoding='utf-8', errors='replace').read() if os.path.exists(txt) else None
    elif kind == 'html':
        s = open(p, encoding='utf-8', errors='replace').read()
        s = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', s, flags=re.S)
        TEXT[key] = re.sub(r'[ \t]+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s)))
    else:
        TEXT[key] = None
    return TEXT[key]


def flat(key):
    """Whitespace-collapsed text, for narrative regexes that cross line breaks."""
    t = text(key)
    return re.sub(r'\s+', ' ', t) if t else None


# --------------------------------------------------------------------------- CMS files
def load_rvu():
    p = fetch('rvu')
    if not p:
        return None
    rows = list(csv.reader(open(p, encoding='latin-1')))
    hi = next((i for i, r in enumerate(rows) if r and r[0].strip() == 'HCPCS'), None)
    if hi is None:
        return None
    out = {}
    for r in rows[hi + 1:]:
        if len(r) < 27 or r[1].strip():          # unmodified (global) lines only
            continue
        code = r[0].strip()
        if code in out:
            continue
        try:
            out[code] = dict(status=r[3].strip(), work=float(r[5]), pe_nf=float(r[6]),
                             pe_fac=float(r[8]), mp=float(r[10]), total_nf=float(r[11]),
                             total_fac=float(r[12]), cf=float(r[25]))
        except ValueError:
            continue
    return out


def load_clfs():
    p = fetch('clfs')
    if not p:
        return None
    out = {}
    for r in csv.reader(open(p, encoding='latin-1')):
        if len(r) > 6 and r[0].strip() == '2026' and not r[2].strip():
            out.setdefault(r[1].strip(), float(r[5]))
    return out


def load_gpci():
    """{state-locality: (work, pe, mp)} from Addendum E."""
    p = fetch('gpci')
    if not p:
        return None
    out = {}
    for r in csv.reader(open(p, encoding='latin-1')):
        if len(r) < 7 or not r[0].strip().isdigit():
            continue
        try:
            out['%s-%s' % (r[1].strip(), r[2].strip())] = (float(r[4]), float(r[5]), float(r[6]))
        except ValueError:
            continue
    return out or None


def load_phygeo(codes):
    """{hcpcs: {place_of_service: row}} for the National geography only.

    42 MB of claims data, so it is read once, filtered to the codes the table
    actually carries, and never held whole."""
    p = fetch('phygeo')
    if not p:
        return None
    out = {}
    with open(p, newline='', encoding='latin-1') as f:
        for r in csv.DictReader(f):
            if r.get('Rndrng_Prvdr_Geo_Lvl') != 'National':
                continue
            c = (r.get('HCPCS_Cd') or '').strip()
            if c in codes:
                out.setdefault(c, {})[(r.get('Place_Of_Srvc') or '').strip()] = r
    return out


def load_opps():
    p = fetch('oppsb')
    if not p:
        return None
    out = {}
    for r in csv.reader(open(p, encoding='latin-1')):
        if len(r) < 8:
            continue
        code = r[0].strip().strip('"')
        if not re.fullmatch(r'[0-9A-Z]{5}', code):
            continue
        try:
            pay = float(r[5].replace('$', '').replace(',', '').strip())
            copay = float(r[7].replace('$', '').replace(',', '').strip())
        except ValueError:
            continue
        out.setdefault(code, dict(apc=r[3].strip(), payment=pay, min_copay=copay))
    return out


def load_oews():
    p = fetch('oews')
    if not p:
        return None
    try:
        import openpyxl
    except ImportError:
        STATE['oews']['error'] = 'openpyxl is not installed'
        return None
    wb = openpyxl.load_workbook(p, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    it = ws.iter_rows(values_only=True)
    hdr = list(next(it))
    ic, im, ie, itl = (hdr.index('OCC_CODE'), hdr.index('H_MEDIAN'),
                       hdr.index('TOT_EMP'), hdr.index('OCC_TITLE'))
    out = {}
    for r in it:
        c = r[ic]
        if c and c not in out:
            out[c] = dict(median=r[im], emp=r[ie], title=r[itl])
    return out


# --------------------------------------------------------------------------- checks
def near(a, b, tol=0.005):
    return a is not None and b is not None and abs(float(a) - float(b)) < tol


def found(key, pattern, flags=re.I):
    """Search the flattened text of a source. Returns the matched string or None."""
    t = flat(key)
    if t is None:
        return None
    m = re.search(pattern, t, flags)
    return m.group(0).strip() if m else None


def money(n):
    """Regex fragment matching a dollar figure with or without a thousands comma."""
    s = ('%f' % float(n)).rstrip('0').rstrip('.')
    if '.' in s:
        whole, frac = s.split('.')
    else:
        whole, frac = s, ''
    if len(whole) > 3:
        whole = whole[:-3] + ',?' + whole[-3:]
    return r'\$?' + whole + (r'\.' + frac if frac else '')


# Rows read out of a document's narrative, with the words that must sit beside
# the number for the match to count as naming the same measure.
NARRATIVE = {
    'meps2018-retail-rx-out-of-pocket':
        ('st532', r'median out-of-pocket spending for drugs[^.]{0,200}?\$54 in 2018'),
    'meps2013-primary-care-visit':
        ('st484', r'means for primary care providers.{0,200}?of \$166, \$161, and \$143,'
                  r'.{0,60}?below the national average'),
    'meps2013-psychiatry-visit':
        ('st484', r'pediatricians, and psychiatrists.{0,90}?of \$166, \$161, and \$143'),
    'meps2013-cardiology-visit':
        ('st484', r'cardiologists \(\$303\)'),
    'meps2022-benchmark-heart-disease':
        ('st562', r'\$4,900 per (adult|individual)'),
    'meps2022-benchmark-diabetes':
        ('st568', r'\$5,810 per adult with treated diabetes'),
    'meps2022-population-baseline':
        ('st560', r'2022 \$147,071 \$67,321 \$44,595 \$13,158 \$374 \$6,765'),
    'hcup2021-ed-facility-cost':
        ('sb311', r'average cost per visit of \$750'),
    'cms2026-part-b-deductible':
        ('partb', r'annual deductible for all Medicare Part B beneficiaries will be \$283 in 2026'),
    'cms2026-part-d-oop-cap':
        ('partd', r'annual OOP threshold of \$2,100 for CY ?2026'),
    'bls2026q2-median-weekly-earnings':
        ('blswk', r'Median weekly earnings of full-time workers were \$1,251 in the second quarter of 2026'),
    'meps2014-office-visit-any':
        ('meps2014t1', r'All visits 1,876\.37 52\.86 \$190 \$2\.9 \$28 \$0\.8'),
    'meps2014-hospital-outpatient':
        ('meps2014t1', r'All visits 167\.82 9\.39 \$927 \$58\.0 \$54 \$3\.8'),
    'meps2014-ed-visit':
        ('meps2014t1', r'61\.28 1\.95 \$1,048 \$40\.3 \$95 \$6\.8'),
    'gsa2026-pov-mileage-rate':
        ('gsa', r'no government-owned automobile was authorized or available \$?0?\.76 per mile'),
}

# Extra assertions that ride along with a row: (source, regex, what it proves)
EXTRAS = {
    'meps2022-benchmark-heart-disease': [('st562', r'median of \$660', 'median $660')],
    'hcup2021-ed-facility-cost': [
        ('sb311', r'average cost was \$440 for children and \$1,110 for', 'age split $440 / $1,110'),
        ('sb311', r'aggregate costs for ED visits totaled \$80\.3 billion', 'aggregate $80.3B'),
    ],
    'cms2026-part-b-deductible': [
        ('partb', r'standard monthly premium for Medicare Part B enrollees will be \$202\.90',
         'standard premium $202.90')],
    'cms2026-part-d-oop-cap': [('partd', r'Deductible: \$615', 'max deductible $615')],
    'bls2026q2-median-weekly-earnings': [
        ('blswk', r'\$1,380', 'men $1,380'), ('blswk', r'\$1,131', 'women $1,131')],
    'meps2018-retail-rx-out-of-pocket': [
        ('st532', r'95th percentile fell from \$1,369 to \$945', 'p95 $945')],
}


# The CY2024 claims-file alternates. One place-of-service rule, stated not fitted:
# every Physician Fee Schedule row in this table is the NON-FACILITY amount, so its
# companion figure is read from the office row; only a figure that names the facility
# setting is read from the facility row.
ALT_CHARGE_KEYS = ('cy2024_average_submitted_charge_usd',
                   'cy2024_physician_component_average_submitted_charge_usd')
ALT_ALLOWED_KEY = 'cy2024_average_allowed_usd'
ALT_MDCR_FIELD = 'Avg_Mdcr_Alowd_Amt'
FACILITY_ALT_KEYS = {'cy2024_physician_component_average_submitted_charge_usd'}
FACILITY_ALT_ROWS = {'cms-ed-99284-physician-only'}
ALT_PROVENANCE = ('cy2024_source_title', 'cy2024_source_url', 'cy2024_source_file',
                  'cy2024_source_file_sha256', 'cy2024_source_row', 'cy2024_retrieved')


def hcpcs_of(row):
    c = (row.get('code') or '').replace('CPT ', '').replace('HCPCS ', '')
    return c.split(',')[0].split(' ')[0].strip()


def check_alternates(row, phygeo, file_sha):
    """Re-read every CY2024 companion figure on this row in the CMS claims file.

    A companion figure is a dollar amount on the screen. It is audited exactly like
    the row's own figure: the file, the row inside it, the field, and the cent."""
    alt = row.get('alternates') or {}
    keys = [k for k in ALT_CHARGE_KEYS + (ALT_ALLOWED_KEY,) if isinstance(alt.get(k), (int, float))]
    if not keys:
        return []
    code = hcpcs_of(row)
    missing = [f for f in ALT_PROVENANCE if not alt.get(f)]
    out = []
    for k in keys:
        pos = 'F' if (k in FACILITY_ALT_KEYS or row['id'] in FACILITY_ALT_ROWS) else 'O'
        field = ALT_MDCR_FIELD if k == ALT_ALLOWED_KEY else 'Avg_Sbmtd_Chrg'
        have = float(alt[k])
        rec = (phygeo or {}).get(code, {}).get(pos)
        if phygeo is None:
            out.append(dict(key=k, status='UNVERIFIED', value_usd=have,
                            evidence=STATE.get('phygeo', {}).get('error', 'claims file not read in this run')))
            continue
        if rec is None:
            out.append(dict(key=k, status='FAIL', value_usd=have,
                            evidence='no National row for %s at place of service %s' % (code, pos)))
            continue
        want = round(float(rec[field]), 2)
        if abs(have - want) > 0.005:
            out.append(dict(key=k, status='FAIL', value_usd=have,
                            evidence='file gives $%.2f for %s (%s, National, POS %s); the row says $%.2f'
                                     % (want, code, field, pos, have)))
        elif missing:
            out.append(dict(key=k, status='FAIL', value_usd=have,
                            evidence='reproduces, but the row names no %s for it' % ', '.join(missing)))
        elif alt.get('cy2024_source_file_sha256') != file_sha:
            out.append(dict(key=k, status='FAIL', value_usd=have,
                            evidence='the row cites file sha256 %s; the file read here is %s'
                                     % (str(alt.get('cy2024_source_file_sha256'))[:16], file_sha[:16])))
        else:
            out.append(dict(key=k, status='PASS', value_usd=have,
                            evidence='%s = $%.2f on the National %s row for %s'
                                     % (field, want, 'office' if pos == 'O' else 'facility', code)))
    return out


def check_localities(rvu, gpci):
    """Re-derive every figure in data/state-prices.json from the two CMS files.

    The published locality table asserts `locality_audit_status = REPRODUCED` on
    every row. Until this ran, that verdict was written by the generator about its
    own output. It is now this audit's verdict, computed from the sources."""
    path = os.path.join(HERE, 'state-prices.json')
    if not os.path.exists(path):
        return dict(rows=0, figures=0, **{'pass': 0}, fail=0, status='UNVERIFIED',
                    evidence='data/state-prices.json is not present')
    sp = json.load(open(path, encoding='utf-8'))
    if rvu is None or gpci is None:
        return dict(rows=len(sp.get('items', {})), figures=0, **{'pass': 0}, fail=0, status='UNVERIFIED',
                    evidence='one of the two CMS files was not readable in this run')
    prices = {i['id']: i for i in json.load(open(PRICES, encoding='utf-8'))['items']}
    cf = float(sp.get('_conversion_factor') or CF)
    figures = ok = bad = 0
    first = None
    for item_id, byloc in sp.get('items', {}).items():
        row = prices.get(item_id)
        r = rvu.get(hcpcs_of(row)) if row else None
        for key, value in byloc.items():
            figures += 1
            g = gpci.get(key)
            if r is None or g is None:
                bad += 1
                first = first or '%s %s: no RVU or GPCI row to re-derive it from' % (item_id, key)
                continue
            want = round((r['work'] * g[0] + r['pe_nf'] * g[1] + r['mp'] * g[2]) * cf, 2)
            if abs(want - float(value)) > 0.005:
                bad += 1
                first = first or '%s %s: file gives $%.2f, the table says $%s' % (item_id, key, want, value)
            else:
                ok += 1
    return {'rows': len(sp.get('items', {})), 'figures': figures, 'pass': ok, 'fail': bad,
            'status': 'PASS' if figures and not bad else ('FAIL' if bad else 'UNVERIFIED'),
            'formula': sp.get('_formula'), 'conversion_factor': cf,
            'evidence': first or ('%d figures re-derived from PPRRVU2026_Jul_nonQPP.csv and GPCI2026.csv '
                                  'at the cent' % ok)}


def check_hcup_ccr(row):
    t = flat('edccr')
    if t is None:
        return 'UNVERIFIED', 'HCUP CCR summary statistics', 'source not readable in this run'
    m = re.search(r'ccr_neds[^\n]*?993\s+0\s+0\.02\s+1\.49\s+0\.21\s+0\.14', t)
    if not m:
        m = re.search(r'993 0 0\.02 1\.49 0\.21 0\.14', t)
    a = row.get('alternates') or {}
    want = (0.21, 0.14, 0.02, 1.49, 993)
    got = (a.get('mean_ratio_2021'), a.get('std_dev_2021'), a.get('min_2021'),
           a.get('max_2021'), a.get('n_hospitals_2021'))
    if not m:
        return 'UNVERIFIED', 'all-payer ED cost-to-charge ratio row', \
               'the SAS summary line did not parse out of the PDF text layer'
    if got != want:
        return 'FAIL', 'all-payer ED cost-to-charge ratio row', \
               'table says %r, file says %r' % (got, want)
    return 'PASS', 'all-payer ED cost-to-charge ratio, 2021', \
           'N=993 hospitals, min 0.02, max 1.49, mean 0.21, SD 0.14 — read on the summary line'


def check_pmc(row):
    t = flat('pmc')
    if t is None:
        return 'UNVERIFIED', 'long COVID excess expenditure', 'PubMed Central not readable in this run'
    a = row.get('alternates') or {}
    if row['id'].endswith('excess-total'):
        wants = [
            (r'excess total expenditures were \+?USD ?4,?098 \(95% CI USD ?1,?619.{0,4}USD ?6,?578\)',
             '$4,098 with its 95% interval $1,619 to $6,578'),
            (r'USD ?4,?098 \(1,?619.{0,4}6,?578\) 1\.54 \(1\.24.{0,4}1\.93\)',
             'the same figures on the Table 3 line, with the cost ratio 1.54'),
            (r'Total 11,?305\.3 871\.9 7,?668\.8 306\.8 7,?161\.9 226\.0',
             'gross annual spending $11,305.3 long COVID against $7,161.9 no COVID'),
            (r'third-party payers \(\+?USD ?3,?705, ?1,?442.{0,4}5,?968\)',
             'payer share of the excess, $3,705'),
        ]
        proof = []
        for pat, label in wants:
            if not re.search(pat, t, re.I):
                return 'FAIL', 'long COVID excess expenditure', 'not in the article: %s' % label
            proof.append(label)
        for k, v in (('cost_ratio', 1.54), ('excess_paid_by_insurers_usd', 3705),
                     ('gross_annual_spending_long_covid_usd', 11305.3),
                     ('gross_annual_spending_no_covid_usd', 7161.9),
                     ('gross_annual_spending_acute_covid_only_usd', 7668.8)):
            if not near(a.get(k), v, 0.05):
                return 'FAIL', 'long COVID excess expenditure', '%s is %r, article says %r' % (k, a.get(k), v)
        if row.get('value_range_usd') != [1619, 6578]:
            return 'FAIL', 'long COVID excess expenditure', 'the published interval is not on the row'
        return 'PASS', 'read in the cited MEPS 2022 analysis', '; '.join(proof)

    wants = [
        (r'Long COVID USD ?1,?348 \(1,?049.{0,4}1,?648\) 0\.162 USD ?236 \(.{0,3}95.{0,4}566\)',
         'the Table 3 out-of-pocket line: $236 excess, 95% CI -95 to 566, p = 0.162'),
        (r'out-of-pocket differences were small and not statistically significant '
         r'\(\+?USD ?236, ?.{0,3}95 to 566\)', 'the authors\' own sentence that it is not significant'),
    ]
    proof = []
    for pat, label in wants:
        if not re.search(pat, t, re.I):
            return 'FAIL', 'long COVID out-of-pocket excess', 'not in the article: %s' % label
        proof.append(label)
    if a.get('statistically_significant') is not False or row['value_usd'] is not None:
        return 'FAIL', 'long COVID out-of-pocket excess', \
               'a null result must carry no value_usd and statistically_significant false'
    if a.get('ci95') != [-95, 566] or not near(a.get('p_value'), 0.162, 0.0005):
        return 'FAIL', 'long COVID out-of-pocket excess', 'the interval or p-value on the row is not the article\'s'
    return 'PASS', 'read in the cited MEPS 2022 analysis (a null result)', '; '.join(proof)


def check_oews(row):
    o = load_oews()
    if not o:
        return 'UNVERIFIED', 'caregiver replacement wage', \
               STATE.get('oews', {}).get('error', 'OEWS file not readable in this run')
    a = row.get('alternates') or {}
    pairs = [('31-1120', row['value_usd'], 'home health and personal care aides'),
             ('31-1120', a.get('home_health_aide_median_hourly_usd'), 'home health aide alternate'),
             ('31-1131', a.get('nursing_assistant_median_hourly_usd'), 'nursing assistants'),
             ('29-1141', a.get('registered_nurse_median_hourly_usd'), 'registered nurses'),
             ('00-0000', a.get('all_occupations_median_hourly_usd'), 'all occupations')]
    for occ, val, lab in pairs:
        rec = o.get(occ)
        if not rec:
            return 'UNVERIFIED', 'caregiver replacement wage', 'OEWS has no %s' % occ
        if not near(rec['median'], val):
            return 'FAIL', 'caregiver replacement wage', \
                   '%s: table %s, OEWS H_MEDIAN %s' % (lab, val, rec['median'])
    emp = o['31-1120']['emp']
    if '4,305,810' not in (row.get('population') or '') and emp != 4305810:
        return 'FAIL', 'caregiver replacement wage', 'employment count does not match OEWS'
    return 'PASS', '$17.21 median hourly, Home Health and Personal Care Aides (31-1120)', \
           'plus 31-1131 $%.2f, 29-1141 $%.2f, 00-0000 $%.2f, employment %s — all read in the OEWS file' \
           % (o['31-1131']['median'], o['29-1141']['median'], o['00-0000']['median'], f'{emp:,}')


# --------------------------------------------------------------------------- the run
def main():
    global OFFLINE, CACHE, LOCAL_DIRS
    ap = argparse.ArgumentParser()
    ap.add_argument('--offline', action='store_true')
    ap.add_argument('--cache', default=CACHE)
    ap.add_argument('--local', action='append', default=[],
                    help='directory that may already hold the CMS CSVs')
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args()
    OFFLINE, CACHE, LOCAL_DIRS = a.offline, a.cache, a.local

    data = json.load(open(PRICES, encoding='utf-8'))
    items = data['items']
    results = []

    rvu = load_rvu()
    clfs = load_clfs()
    opps = load_opps()
    gpci = load_gpci()
    phygeo = load_phygeo({hcpcs_of(r) for r in items if r.get('code')})
    phygeo_sha = STATE.get('phygeo', {}).get('sha256')

    # the conversion factor must be one number across the whole RVU file
    cf_note = None
    if rvu:
        cfs = {v['cf'] for v in rvu.values() if v['cf'] > 0}
        if len(cfs) != 1:
            cf_note = 'the RVU file does not carry one conversion factor: %r' % cfs
        elif not near(list(cfs)[0], CF, 1e-6):
            cf_note = 'conversion factor is $%.4f in the file, $%.4f expected' % (list(cfs)[0], CF)

    OPPS_EXPECT = {
        'cms-g0463-hospital-clinic-fee': ('G0463', 136.02, 27.21),
        'cms-ed-99284-facility-only': ('99284', 426.30, 85.26),
    }

    for row in items:
        rid, val = row['id'], row['value_usd']
        status = method = evidence = None
        # which federal file this row was checked against, recorded by the branch that
        # checked it. The export joins on it, so a correction can name the file.
        src_key = None

        # ---- 1. physician fee schedule, recomputed
        if rvu is not None and 'pfs-relative-value-files' in (row.get('source_url') or ''):
            src_key = 'rvu'
            code = hcpcs_of(row)
            r = rvu.get(code)
            claimed = row.get('pfs_status_indicator')
            if not r:
                status, method, evidence = 'FAIL', 'PFS re-derivation', '%s is not in the file' % code
            elif claimed:
                # A row that says "CMS publishes units for this code and pays nothing for it".
                # The claim is the finding, so the audit checks the claim, not a dollar amount.
                if r['status'] != claimed:
                    status, method, evidence = 'FAIL', 'PFS status indicator', \
                        '%s carries status %r in the file, not the %r this row claims' \
                        % (code, r['status'], claimed)
                elif val is not None:
                    status, method, evidence = 'FAIL', 'PFS status indicator', \
                        '%s is status %s, a non-covered service, and the row still carries $%s' \
                        % (code, r['status'], val)
                else:
                    status, method = 'PASS', 'PFS status indicator, read in the file'
                    evidence = ('%s carries status %s — non-covered. CMS publishes %.2f work, %.2f '
                                'non-facility practice expense and %.2f malpractice RVUs for it and pays '
                                'nothing, so this row carries no figure' 
                                % (code, r['status'], r['work'], r['pe_nf'], r['mp']))
            elif r['status'] != 'A':
                status, method, evidence = 'FAIL', 'PFS re-derivation', \
                    '%s carries status %r, not A' % (code, r['status'])
            else:
                facility = rid == 'cms-ed-99284-physician-only'
                tot = r['total_fac'] if facility else r['total_nf']
                exp = round(tot * r['cf'], 2)
                setting = 'facility' if facility else 'non-facility'
                if near(exp, val):
                    status = 'PASS'
                    method = 'PFS re-derivation, %s setting' % setting
                    evidence = '%.2f total %s RVUs x $%.4f = $%.2f' % (tot, setting, r['cf'], exp)
                else:
                    status, method = 'FAIL', 'PFS re-derivation, %s setting' % setting
                    evidence = 'file gives $%.2f (%.2f RVU x $%.4f); the table says $%s' \
                               % (exp, tot, r['cf'], val)
            # the RVU components quoted inside the sentence a patient reads
            if status == 'PASS':
                cs = row.get('coverage_statement') or ''
                m = re.search(r'sum of ([\d.]+) work \+ ([\d.]+) non-facility practice expense '
                              r'\+ ([\d.]+) malpractice', cs)
                if m and any(not near(float(m.group(i + 1)), r[k])
                             for i, k in enumerate(('work', 'pe_nf', 'mp'))):
                    status, evidence = 'FAIL', 'the RVU components quoted in the coverage ' \
                                               'statement are not the file\'s'

        # ---- 2. clinical laboratory fee schedule, looked up
        elif clfs is not None and 'clinical-laboratory-fee-schedule' in (row.get('source_url') or ''):
            src_key = 'clfs'
            code = (row.get('code') or '').replace('CPT ', '').strip()
            rate = clfs.get(code)
            if rate is None:
                status, method, evidence = 'FAIL', 'CLFS lookup', 'CPT %s is not on the 2026 file' % code
            elif near(rate, val):
                status, method, evidence = 'PASS', 'CLFS lookup', \
                    'CPT %s pays $%.2f on the CY2026 Q3 file' % (code, rate)
            else:
                status, method, evidence = 'FAIL', 'CLFS lookup', \
                    'file says $%.2f, the table says $%s' % (rate, val)

        # ---- 3. hospital outpatient PPS
        elif rid in OPPS_EXPECT:
            src_key = 'oppsb'
            code, pay, copay = OPPS_EXPECT[rid]
            rec = (opps or {}).get(code)
            if not rec:
                status, method, evidence = 'UNVERIFIED', 'OPPS Addendum B lookup', \
                    STATE.get('oppsb', {}).get('error', 'Addendum B not readable in this run')
            elif near(rec['payment'], val) and near(rec['payment'], pay):
                extra = ''
                alt = (row.get('alternates') or {}).get('hospital_outpatient_minimum_beneficiary_copay_usd')
                if alt is not None and not near(alt, rec['min_copay']):
                    status, method = 'FAIL', 'OPPS Addendum B lookup'
                    evidence = 'minimum copay %s in the table, $%.2f in the file' % (alt, rec['min_copay'])
                else:
                    extra = ', minimum unadjusted copayment $%.2f' % rec['min_copay']
                    status, method = 'PASS', 'OPPS Addendum B lookup'
                    evidence = '%s pays $%.2f under APC %s%s' % (code, rec['payment'], rec['apc'], extra)
            else:
                status, method, evidence = 'FAIL', 'OPPS Addendum B lookup', \
                    'Addendum B pays $%.2f; the table says $%s' % (rec['payment'], val)

        elif rid == 'cms-ed-99284-complete':
            src_key = 'oppsb+rvu'
            fac = (opps or {}).get('99284')
            phys = (rvu or {}).get('99284')
            if not fac or not phys:
                status, method, evidence = 'UNVERIFIED', 'two published figures added', \
                    'one of the two source files was not readable in this run'
            else:
                p = round(phys['total_fac'] * phys['cf'], 2)
                exp = round(fac['payment'] + p, 2)
                if near(exp, val):
                    status, method = 'PASS', 'two published figures added, both re-read'
                    evidence = 'hospital APC %s $%.2f + physician facility payment $%.2f = $%.2f' \
                               % (fac['apc'], fac['payment'], p, exp)
                else:
                    status, method, evidence = 'FAIL', 'two published figures added', \
                        '$%.2f + $%.2f = $%.2f, the table says $%s' % (fac['payment'], p, exp, val)

        # ---- 4. the report-derived rows
        elif rid in NARRATIVE:
            key, pat = NARRATIVE[rid]
            src_key = key
            hit = found(key, pat)
            if hit and val is not None and not re.search(money(val), hit):
                # the sentence is in the document, but it is not the number on the row
                status, method = 'FAIL', 'read in the cited report'
                evidence = 'the source sentence says something other than $%s: %s' \
                           % (val, re.sub(r'\s+', ' ', hit)[:160])
            elif hit:
                status, method = 'PASS', 'read in the cited %s' % ('table' if key.endswith('t1') else 'report')
                evidence = re.sub(r'\s+', ' ', hit)[:220]
            elif flat(key) is None:
                status, method, evidence = 'UNVERIFIED', 'read in the cited report', \
                    STATE.get(key, {}).get('error', 'source not readable in this run')
            else:
                status, method, evidence = 'FAIL', 'read in the cited report', \
                    'the sentence carrying this figure is not in the document: /%s/' % pat

        elif rid == 'hcup2021-ed-cost-to-charge-ratio':
            src_key = 'edccr'
            status, method, evidence = check_hcup_ccr(row)
        elif rid.startswith('meps2022-longcovid'):
            src_key = 'pmc'
            status, method, evidence = check_pmc(row)
        elif rid == 'bls2025-caregiver-replacement-wages':
            src_key = 'oews'
            status, method, evidence = check_oews(row)
        else:
            status, method, evidence = 'UNVERIFIED', 'no checker', \
                'this row has no verification rule — add one before shipping it'

        # ---- extras that ride along
        extras = []
        for key, pat, label in EXTRAS.get(rid, []):
            hit = found(key, pat)
            extras.append({'label': label, 'ok': bool(hit),
                           'evidence': re.sub(r'\s+', ' ', hit)[:160] if hit else 'not found'})
        if any(not e['ok'] for e in extras) and status == 'PASS':
            status = 'FAIL'
            evidence += ' — but a companion figure did not check out'

        # ---- every row must carry its provenance, whatever its figure
        missing = [f for f in ('coverage_statement', 'source_title', 'source_url', 'year',
                               'population', 'geography', 'agency') if not row.get(f)]
        if missing:
            status = 'FAIL'
            evidence = (evidence or '') + ' — missing provenance fields: %s' % ', '.join(missing)

        # ---- the CY2024 companion figures on this row, audited like the row itself
        alts = check_alternates(row, phygeo, phygeo_sha)
        if any(a['status'] == 'FAIL' for a in alts) and status == 'PASS':
            status = 'FAIL'
            evidence = (evidence or '') + ' — but a CY2024 companion figure did not reproduce'

        results.append(dict(id=rid, status=status, value_usd=val, basis=row.get('basis'),
                            alternates=alts,
                            confidence=row.get('confidence'), agency=row.get('agency_display'),
                            code=row.get('code'), loinc=row.get('loinc'),
                            check=method, evidence=evidence, source_url=row.get('source_url'),
                            source_key=src_key, extras=extras))

    n = len(results)
    counts = {s: sum(1 for r in results if r['status'] == s) for s in ('PASS', 'FAIL', 'UNVERIFIED')}

    # ---- the two tables the /method page claims but the audit used not to cover
    alt_rows = [a for r in results for a in r['alternates']]
    alt_counts = {st: sum(1 for a in alt_rows if a['status'] == st)
                  for st in ('PASS', 'FAIL', 'UNVERIFIED')}
    localities = check_localities(rvu, gpci)

    # ---- ONE version string, generated here, read everywhere
    today = time.strftime('%Y-%m-%d')
    prev = str(data.get('_version') or '')
    version = prev if prev.startswith(today) and '-verified' not in prev else today + '.1'
    version_line = ('%d rows · %d reproduce · %d CY2024 companion figures · %s locality figures · '
                    'audited %s' % (n, counts['PASS'], alt_counts['PASS'],
                                    format(localities['pass'], ','), today))

    audit = {
        '_what_this_is': 'Every row of the Waypoint Ledger price table, re-derived or re-read from the '
                         'federal file it cites. PASS means the number was reproduced. UNVERIFIED means '
                         'the source could not be read in that run, or the figure is not machine-checkable '
                         'from the document text layer. It never means "probably fine".',
        'generated': time.strftime('%Y-%m-%d'),
        'table_version': data.get('_version'),
        'rows': n, 'pass': counts['PASS'], 'fail': counts['FAIL'], 'unverified': counts['UNVERIFIED'],
        'alternates': len(alt_rows), 'alternates_pass': alt_counts['PASS'],
        'alternates_fail': alt_counts['FAIL'], 'alternates_unverified': alt_counts['UNVERIFIED'],
        'localities': localities,
        'version': version, 'version_line': version_line,
        'conversion_factor': CF, 'conversion_factor_note': cf_note,
        'sources': {k: {kk: vv for kk, vv in v.items() if kk != 'path'} for k, v in STATE.items()},
        'results': results,
    }
    json.dump(audit, open(AUDIT, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

    # The version string is a RESULT, not a label somebody typed. On a clean run it is
    # written back onto the table so the app, the API, the CSVs and this page cannot
    # disagree about which table they are describing.
    failed_here = counts['FAIL'] or alt_counts['FAIL'] or localities['fail']
    if not failed_here and (data.get('_version') != version or data.get('_audit') != version_line):
        data['_version'] = version
        data['_audit'] = version_line
        json.dump(data, open(PRICES, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

    if not a.quiet:
        for r in results:
            print('%-11s %-34s %-38s %s' % (r['status'], r['id'], (r['check'] or '')[:38],
                                            (r['evidence'] or '')[:80]))
        print()
        for k, v in STATE.items():
            if v.get('sha256'):
                print('  %-11s sha256 %s  %9d bytes  %s' % (k, v['sha256'][:32], v['bytes'], v['retrieved']))
            else:
                print('  %-11s NOT READ: %s' % (k, v.get('error')))
        print('\n%d rows: %d PASS, %d FAIL, %d UNVERIFIED  ->  data/AUDIT.json'
              % (n, counts['PASS'], counts['FAIL'], counts['UNVERIFIED']))
        print('%d CY2024 companion figures: %d PASS, %d FAIL, %d UNVERIFIED'
              % (len(alt_rows), alt_counts['PASS'], alt_counts['FAIL'], alt_counts['UNVERIFIED']))
        print('%s locality figures on %d rows: %s — %s'
              % (format(localities['figures'], ','), localities['rows'], localities['status'],
                 localities['evidence']))
        print('version %s — %s' % (version, version_line))
        if cf_note:
            print('CONVERSION FACTOR: ' + cf_note)
    return 1 if failed_here else 0


if __name__ == '__main__':
    sys.exit(main())

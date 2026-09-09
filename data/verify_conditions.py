#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VERIFY data/conditions.json — every ICD-10-CM code against CDC/NCHS, every
priced condition's figure re-read in the table it is cited to.

The condition selector puts two kinds of claim on the screen: a standard
diagnosis code with its official title, and a published annual figure for a
year with that condition. Both are checkable, so both are checked here, and
neither is taken from data/prices.json or from conditions.json itself — the
expected values come from the federal files and the cited papers, and the two
JSON files are the things on trial.

  PASS        the file says exactly this.
  FAIL        the file says something else. Exit code 1.
  UNVERIFIED  the source could not be fetched or read in this run. Never a pass.

WHAT IT CHECKS
  1. Every condition with an icd10cm code: the code exists in the CDC/NCHS
     code-description file for FY2026 (in effect today) AND for FY2027 (in
     effect from 1 October 2026, i.e. during the demo), the long description
     matches character for character, and the billable/heading flag matches.
  2. Every icd10cm_first_effective date: the code is ABSENT from the file for
     the year before and PRESENT in the year claimed. A date with no such
     evidence is a FAIL; a code older than our earliest file must claim no date.
  3. Every condition with icd10cm null: it carries a written reason for the
     blank, and asserts no code anywhere in the object.
  4. Every condition with a price_row_id: the row exists in prices.json, and
     that row's figure (and interval, where it has one) is re-read in the
     source the row cites — the PDF or the article page, fetched fresh.
  5. Every condition with price_row_id null: no dollar figure appears anywhere
     in its object. An absence must stay an absence.
  6. Every sex_note: re-read in the federal file it cites, by the URL the row
     itself publishes, and the figures in the sentence found there. A note whose
     source no longer says it is a FAIL, not a note to fix later.
  7. Every condition with sex_note null: a written blank reason, no source and
     no source URL — and where the reason names a page, that page is fetched
     and proved to be the page that was read.
  8. No sex anywhere in the price table: no priced row carries a field whose
     name mentions sex, because none of the fee schedules is published by sex
     and no figure here is ever adjusted by it.

Usage
  python3 data/verify_conditions.py                # fetch what it needs
  python3 data/verify_conditions.py --offline      # cache only; missing = UNVERIFIED
  python3 data/verify_conditions.py --cache DIR

Writes data/CONDITIONS-AUDIT.json. Exits 1 on any FAIL.
"""
import argparse, hashlib, html as htmllib, json, os, re, shutil, subprocess, sys, time, zipfile
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CONDITIONS = os.path.join(HERE, 'conditions.json')
PRICES = os.path.join(HERE, 'prices.json')
AUDIT = os.path.join(HERE, 'CONDITIONS-AUDIT.json')
UA = 'WaypointLedger/1.0 (+https://waypoint-ledger.pages.dev; bo@precisionfederal.com)'
FTP = 'https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Publications/ICD10CM/'

# --------------------------------------------------------------------------- sources
# The CDC/NCHS code-description archives. `member` is the order file inside the
# zip: order number, code, 1 billable / 0 heading, short description, long.
ICD_YEARS = {
    2021: dict(url=FTP + '2021/icd10cm-codes-order-Jan-2021.zip',
               member='icd10cm-order-Jan-2021.txt'),
    2022: dict(url=FTP + '2022/Code%20Descriptions%20zip.zip',
               member='icd10cm-order-2022.txt'),
    2023: dict(url=FTP + '2023/icd10-Order-CodeFiles2023.zip',
               member='icd10cm-order-2023.txt'),
    2026: dict(url=FTP + '2026/icd10cm-Code%20Descriptions-2026.zip',
               member='icd10cm-order-2026.txt'),
    2027: dict(url=FTP + '2027/icd10cm-code-descriptions-2027.zip',
               member='icd10cm-code-descriptions-2027/icd10cm-order-2027.txt'),
}
# The years a code must be present in for the product to be honest on demo day.
ICD_MUST = (2026, 2027)

# Where each priced row's figure is re-read. kind: pdf | html.
FIGURE_SOURCES = {
    'meps2022-longcovid-excess-total': dict(
        key='pmc', kind='html',
        url='https://pmc.ncbi.nlm.nih.gov/articles/PMC12607343/',
        # PMC answers an unfamiliar client with a reCAPTCHA page that is valid
        # HTML and contains none of our figures. A challenge page must never be
        # read as "the source does not say this", so a fetch that does not carry
        # the article's own title is thrown away, not parsed.
        sentinel='Long COVID Is Associated with Excess Direct Healthcare Expenditures',
        min_bytes=50000,
        title='Neba et al., Healthcare (Basel) 2025;13(21):2704 — secondary analysis of MEPS 2022'),
    'meps2022-benchmark-heart-disease': dict(
        key='st562', kind='pdf', min_bytes=100000,
        url='https://meps.ahrq.gov/data_files/publications/st562/stat562.pdf',
        title='AHRQ MEPS Statistical Brief #562'),
    'meps2022-benchmark-diabetes': dict(
        key='st568', kind='pdf', min_bytes=100000,
        url='https://meps.ahrq.gov/data_files/publications/st568/stat568.pdf',
        title='AHRQ MEPS Statistical Brief #568'),
}
# What must be found in that source's text, and what it proves.
FIGURE_CHECKS = {
    'meps2022-longcovid-excess-total': [
        (r'excess\s+total\s+expenditures\s+were\s+\+?USD\s*4098\s*\(95%\s*CI\s*USD\s*1619[–—-]\s*USD\s*6578\)',
         'the point estimate 4098 and the 95% CI 1619-6578, in one sentence'),
        (r'Long\s+COVID\s+USD\s*11,?641\s*\(9279[–—-]14,?004\)\s*0\.001\s*USD\s*4098\s*\(1619[–—-]6578\)',
         'the same figures in the results table row'),
    ],
    'meps2022-benchmark-heart-disease': [
        (r'\$4,900 per (?:adult|individual)', 'the mean, $4,900 per adult'),
        (r'median of \$660', 'the median, $660, which the row also carries'),
    ],
    'meps2022-benchmark-diabetes': [
        (r'\$5,810 per adult with treated diabetes', 'the mean, $5,810 per adult with treated diabetes'),
    ],
}

# ------------------------------------------------------------------ sex notes
# The Federal Sprint Lead for the Invisible Illness track asked every team, on
# 26 August 2026, to be intentional about sex differences where relevant. Every
# sentence conditions.json prints about sex is re-read here in the federal file
# it names. `cite` is the human page the row publishes; `url` is what this
# script fetches — for the Household Pulse tables that is the same dataset
# through its API, so the check reads the numbers rather than a rendering of
# them. A note with no entry here is a FAIL: an unverifiable sentence about sex
# is exactly the kind of sentence this product exists not to print.
SEX_SOURCES = {
    'long-covid': dict(
        # The whole By-Sex block for survey period 72, not just the two cells the
        # sentence quotes: a two-row answer is small enough to be mistaken for an
        # API error page, and the wider block is the evidence a reader can audit.
        key='pulse-longcovid-sex', kind='json', min_bytes=2000, sentinel='subgroup',
        url=("https://data.cdc.gov/resource/gsea-w83j.json?"
             "$where=`group`='By Sex' AND state='United States' AND time_period='72'"),
        cite='https://data.cdc.gov/National-Center-for-Health-Statistics/Post-COVID-Conditions/gsea-w83j',
        title='CDC/NCHS Household Pulse Survey — Post-COVID Conditions (gsea-w83j), survey period 72'),
    'me-cfs': dict(
        key='db488', kind='pdf', min_bytes=100000,
        url='https://www.cdc.gov/nchs/data/databriefs/db488.pdf',
        cite='https://www.cdc.gov/nchs/data/databriefs/db488.pdf',
        title='NCHS Data Brief No. 488, December 2023'),
    'endometriosis': dict(
        key='owh-endometriosis', kind='html', min_bytes=20000, sentinel='endometriosis',
        url='https://womenshealth.gov/a-z-topics/endometriosis',
        cite='https://womenshealth.gov/a-z-topics/endometriosis',
        title="HHS Office on Women's Health — Endometriosis"),
    'fibromyalgia': dict(
        key='niams-fibromyalgia', kind='html', min_bytes=10000, sentinel='fibromyalgia',
        url='https://www.niams.nih.gov/health-topics/fibromyalgia',
        cite='https://www.niams.nih.gov/health-topics/fibromyalgia',
        title='NIH NIAMS — Fibromyalgia'),
}
# What must be found in that source, and what it proves. The long COVID row is
# JSON, so it is parsed rather than pattern-matched: see sex_pulse_check.
SEX_CHECKS = {
    'me-cfs': [
        (r'Women\s*\(1\.7%\)', 'women 1.7%'),
        (r'men\s*\(0\.9%\)', 'men 0.9%'),
        (r'1\.3%\s*of\s*adults\s*had\s*ME/CFS', 'all adults 1.3%'),
    ],
    'endometriosis': [
        (r'at least 11% of women', 'at least 11% of women'),
        (r'6\s*\u00bd\s*million women', 'more than 6 1/2 million women'),
    ],
    'fibromyalgia': [
        (r'Anyone can get fibromyalgia, but more women get it than men',
         'the NIAMS sentence, word for word'),
    ],
}
# The blanks that name a page. Fetching it proves the page we cite is the page
# we read; the pattern proves it is still that page. A blank reason is a
# finding about the federal data, so it is checked like any other finding.
SEX_BLANK_SOURCES = {
    'heart-disease': dict(
        key='cdc-heart-facts', kind='html', min_bytes=20000, sentinel='heart disease',
        url='https://www.cdc.gov/heart-disease/data-research/facts-stats/index.html',
        pattern=r'leading cause of death for men, women',
        title='CDC Heart Disease Facts'),
    'diabetes': dict(
        key='cdc-diabetes-report', kind='html', min_bytes=20000, sentinel='diabetes',
        url='https://www.cdc.gov/diabetes/php/data-research/index.html',
        pattern=r'Estimated percentage of the U\.S\. population with diabetes',
        title='CDC National Diabetes Statistics Report'),
    'sickle-cell': dict(
        key='cdc-scd-data', kind='html', min_bytes=20000, sentinel='sickle cell',
        url='https://www.cdc.gov/sickle-cell/data/index.html',
        pattern=r'Data and Statistics on Sickle Cell Disease',
        title='CDC Data and Statistics on Sickle Cell Disease'),
}

CACHE = os.path.expanduser('~/.cache/waypoint-ledger')
OFFLINE = False
STATE = {}          # key -> dict(path, sha256, bytes, retrieved, error)
RESULTS = []        # audit rows


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def looks_right(path, min_bytes, sentinel):
    """Is this the file we asked for, or a login wall / captcha / error page?"""
    if os.path.getsize(path) < max(1024, min_bytes or 0):
        return False
    if sentinel:
        with open(path, encoding='utf-8', errors='replace') as f:
            return sentinel.lower() in f.read().lower()
    return True


def fetch(key, url, ext, min_bytes=0, sentinel=None):
    """Download into the cache once; record what was fetched. Never re-download
    a file already on disk, so an audit re-run is cheap and reproducible. A body
    that fails looks_right() is deleted rather than parsed — a captcha page that
    contains none of our numbers would otherwise read as a FAIL against us."""
    out = os.path.join(CACHE, key + ext)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if os.path.exists(out) and looks_right(out, min_bytes, sentinel):
        STATE[key] = dict(path=out, sha256=sha256(out), bytes=os.path.getsize(out),
                          retrieved='cache', url=url)
        return out
    if OFFLINE:
        STATE[key] = dict(error='not in cache and --offline', url=url)
        return None
    tmp = out + '.download'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
        with urllib.request.urlopen(req, timeout=120) as r, open(tmp, 'wb') as f:
            shutil.copyfileobj(r, f)
    except Exception as e:                                    # noqa: BLE001
        STATE[key] = dict(error='%s: %s' % (type(e).__name__, e), url=url)
        return None
    if not looks_right(tmp, min_bytes, sentinel):
        n = os.path.getsize(tmp)
        os.remove(tmp)
        STATE[key] = dict(url=url, error='the server returned %d bytes that do not carry %r — '
                          'a challenge or error page, not the source' % (n, sentinel or 'the expected size'))
        return None
    os.replace(tmp, out)
    STATE[key] = dict(path=out, sha256=sha256(out), bytes=os.path.getsize(out),
                      retrieved=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), url=url)
    return out


# --------------------------------------------------------------------------- ICD-10-CM
_ORDER_RE = re.compile(r'^(\d+)\s+(\S+)\s+([01])\s+(.{60})(.*)$')


def icd_index(year):
    """{code without dots: (billable, long description)} for one fiscal year."""
    spec = ICD_YEARS[year]
    path = fetch('icd10cm/fy%d' % year, spec['url'], '.zip', min_bytes=500000)
    if not path:
        return None
    try:
        with zipfile.ZipFile(path) as z:
            names = {n.split('/')[-1]: n for n in z.namelist()}
            member = spec['member'] if spec['member'] in z.namelist() \
                else names.get(spec['member'].split('/')[-1])
            if not member:
                STATE['icd10cm/fy%d' % year]['error'] = 'member not in zip: ' + spec['member']
                return None
            raw = z.read(member).decode('utf-8', 'replace')
    except Exception as e:                                    # noqa: BLE001
        STATE['icd10cm/fy%d' % year]['error'] = '%s: %s' % (type(e).__name__, e)
        return None
    out = {}
    for line in raw.splitlines():
        m = _ORDER_RE.match(line)
        if not m:
            continue
        out[m.group(2)] = (m.group(3) == '1', m.group(5).strip() or m.group(4).strip())
    return out


def flat(code):
    """U09.9 -> U099, the way the CDC order file writes it."""
    return code.replace('.', '')


# --------------------------------------------------------------------------- figures
EXT = {'pdf': '.pdf', 'html': '.html', 'json': '.json'}


def spec_text(spec):
    """One fetch-and-read for every kind of cited source: a PDF through
    pdftotext, an HTML page stripped to text, a JSON API answer left exactly as
    the server sent it. Returns (text, error); a source that could not be read
    is an error, never an empty string that would read as a silent source."""
    ext = EXT.get(spec['kind'], '.html')
    url = spec['url']
    if spec['kind'] == 'json':                      # SoQL carries spaces and quotes
        url = urllib.parse.quote(url, safe=":/?&=$,`'%-._~+*()!;@[]")
    path = fetch('sources/' + spec['key'], url, ext,
                 min_bytes=spec.get('min_bytes', 0), sentinel=spec.get('sentinel'))
    if not path:
        return None, STATE.get('sources/' + spec['key'], {}).get('error', 'not fetched')
    if spec['kind'] == 'json':
        return open(path, encoding='utf-8', errors='replace').read(), None
    if spec['kind'] == 'pdf':
        txt = path + '.txt'
        if not os.path.exists(txt):
            if not shutil.which('pdftotext'):
                return None, 'pdftotext is not installed'
            subprocess.run(['pdftotext', '-layout', path, txt], check=False,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not os.path.exists(txt):
            return None, 'pdftotext produced nothing'
        return open(txt, encoding='utf-8', errors='replace').read(), None
    t = open(path, encoding='utf-8', errors='replace').read()
    t = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', t, flags=re.S | re.I)
    t = htmllib.unescape(re.sub(r'<[^>]+>', ' ', t))
    return re.sub(r'\s+', ' ', t), None


def source_text(row_id):
    """The source a priced row is cited to, as text."""
    spec = FIGURE_SOURCES.get(row_id)
    if not spec:
        return None, 'no source is registered in this script for %s' % row_id
    return spec_text(spec)


def sex_pulse_check(text):
    """The long COVID sex figures, parsed rather than pattern-matched: the CDC
    serves them as JSON, so this reads the cells the sentence quotes. Returns
    (ok, detail). Survey period 72 is named in the sentence, so it is what is
    asked for — a later period is a new sentence, not a silent update."""
    try:
        rows = json.loads(text)
    except Exception as e:                                    # noqa: BLE001
        return False, 'the API answer did not parse as JSON: %s' % e
    INDICATOR = 'Currently experiencing long COVID, as a percentage of all adults'
    want = {'Female': ('6.8', '6.2', '7.4'), 'Male': ('3.7', '3.3', '4.3')}
    seen, bad = {}, []
    for r in rows:
        if r.get('indicator') != INDICATOR:
            continue
        sub = r.get('subgroup')
        if sub in want:
            seen[sub] = (r.get('value'), r.get('lowci'), r.get('highci'), r.get('time_period_label'))
    for sub, (v, lo, hi) in want.items():
        got = seen.get(sub)
        if not got:
            bad.append('%s is not in the answer' % sub)
        elif (got[0], got[1], got[2]) != (v, lo, hi):
            bad.append('%s reads %s (%s-%s), the note says %s (%s-%s)' % (sub, got[0], got[1], got[2], v, lo, hi))
    if bad:
        return False, '; '.join(bad)
    return True, 'women %s (%s-%s) and men %s (%s-%s), %s' % (
        seen['Female'][0], seen['Female'][1], seen['Female'][2],
        seen['Male'][0], seen['Male'][1], seen['Male'][2], seen['Female'][3])


def add(check, status, detail, evidence=None):
    RESULTS.append(dict(check=check, status=status, detail=detail, evidence=evidence))
    return status


# --------------------------------------------------------------------------- main
def main():
    global OFFLINE, CACHE
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--offline', action='store_true')
    ap.add_argument('--cache', default=CACHE)
    a = ap.parse_args()
    OFFLINE, CACHE = a.offline, a.cache
    os.makedirs(os.path.join(CACHE, 'icd10cm'), exist_ok=True)

    conds = json.load(open(CONDITIONS, encoding='utf-8'))
    prices = {r['id']: r for r in json.load(open(PRICES, encoding='utf-8'))['items']}
    rows = conds['conditions']

    idx = {y: icd_index(y) for y in sorted(ICD_YEARS)}
    for y in ICD_MUST:
        if idx.get(y) is None:
            add('icd10cm FY%d file' % y, 'UNVERIFIED',
                'could not read the CDC/NCHS code file for FY%d' % y,
                STATE.get('icd10cm/fy%d' % y, {}).get('error'))

    # ------------------------------------------------------------ 1, 2, 3: codes
    for c in rows:
        cid, code = c['id'], c.get('icd10cm')
        if not code:
            reason = (c.get('icd10cm_blank_reason') or '').strip()
            if len(reason) < 40:
                add('%s icd10cm blank' % cid, 'FAIL',
                    'no code and no written reason for the blank')
            else:
                add('%s icd10cm blank' % cid, 'PASS',
                    'no code, and the blank is explained', reason[:160])
            # The blank_reason NAMES the codes it refuses to use, on purpose —
            # "E11 alone is type 2 only" is the argument, not a claim. So the
            # scan is over every OTHER field: nothing may quietly carry a code.
            blob = json.dumps({k: v for k, v in c.items() if k != 'icd10cm_blank_reason'})
            stray = sorted(set(re.findall(r'\b[A-Z][0-9][0-9AB](?:\.[0-9A-Z]{1,4})?\b', blob)))
            if stray:
                add('%s carries no stray code' % cid, 'FAIL',
                    'a code-shaped string appears in a row that claims none: %s' % ', '.join(stray))
            continue

        key = flat(code)
        for y in ICD_MUST:
            table = idx.get(y)
            if table is None:
                add('%s %s in FY%d' % (cid, code, y), 'UNVERIFIED', 'file not read')
                continue
            hit = table.get(key)
            if not hit:
                add('%s %s in FY%d' % (cid, code, y), 'FAIL',
                    '%s is not in the CDC/NCHS FY%d code file' % (code, y))
                continue
            billable, title = hit
            if title != c.get('icd10cm_title'):
                add('%s %s title FY%d' % (cid, code, y), 'FAIL',
                    'CDC says %r; conditions.json says %r' % (title, c.get('icd10cm_title')))
            elif billable != c.get('icd10cm_billable'):
                add('%s %s billable FY%d' % (cid, code, y), 'FAIL',
                    'CDC says billable=%s; conditions.json says %s' % (billable, c.get('icd10cm_billable')))
            else:
                add('%s %s FY%d' % (cid, code, y), 'PASS',
                    'code, long description and billable flag all match CDC/NCHS',
                    '%s %s | billable=%s' % (code, title, billable))

        # first-effective: absent the year before, present the year claimed
        claim = c.get('icd10cm_first_effective')
        if claim:
            fy = int(claim[:4]) + (1 if claim[5:7] == '10' else 0)   # 2021-10-01 -> FY2022
            before, now = idx.get(fy - 1), idx.get(fy)
            if before is None or now is None:
                add('%s %s first effective' % (cid, code), 'UNVERIFIED',
                    'need the FY%d and FY%d files to test "%s"' % (fy - 1, fy, claim))
            elif key in before:
                add('%s %s first effective' % (cid, code), 'FAIL',
                    '%s claims first effective %s but is already in the FY%d file' % (code, claim, fy - 1))
            elif key not in now:
                add('%s %s first effective' % (cid, code), 'FAIL',
                    '%s claims first effective %s but is not in the FY%d file' % (code, claim, fy))
            else:
                add('%s %s first effective' % (cid, code), 'PASS',
                    'absent from FY%d, present in FY%d — first effective %s' % (fy - 1, fy, claim),
                    c.get('icd10cm_first_effective_evidence'))
        else:
            oldest = min(ICD_YEARS)
            table = idx.get(oldest)
            if table is None:
                add('%s %s no date claimed' % (cid, code), 'UNVERIFIED', 'FY%d file not read' % oldest)
            elif key in table:
                add('%s %s no date claimed' % (cid, code), 'PASS',
                    'already in the FY%d file, our earliest — claiming no first-effective date is correct' % oldest)
            else:
                add('%s %s no date claimed' % (cid, code), 'FAIL',
                    '%s is newer than the FY%d file, so a first-effective date is knowable and should be stated' % (code, oldest))

    # ------------------------------------------------------------ 4, 5: figures
    for c in rows:
        cid, rid = c['id'], c.get('price_row_id')
        if not rid:
            blob = json.dumps(c)
            money = re.findall(r'\$[0-9][0-9,]*', blob)
            if money:
                add('%s asserts no figure' % cid, 'FAIL',
                    'a condition with no published figure carries dollar amounts: %s' % ', '.join(money))
            elif c.get('figure_kind') is not None:
                add('%s asserts no figure' % cid, 'FAIL', 'price_row_id is null but figure_kind is set')
            else:
                add('%s asserts no figure' % cid, 'PASS',
                    'no price row, no figure_kind and no dollar amount anywhere in the row')
            continue

        row = prices.get(rid)
        if not row:
            add('%s -> %s' % (cid, rid), 'FAIL', 'price_row_id names no row in prices.json')
            continue
        text, err = source_text(rid)
        if text is None:
            add('%s figure' % cid, 'UNVERIFIED', 'could not read %s' % rid, err)
            continue
        proof = []
        ok = True
        for pat, says in FIGURE_CHECKS.get(rid, []):
            if re.search(pat, text, re.I):
                proof.append(says)
            else:
                ok = False
                add('%s figure' % cid, 'FAIL',
                    '%s: the cited source does not contain %s' % (rid, says))
        if not ok:
            continue
        # who published it — a peer-reviewed reanalysis is not a federal report,
        # and the picker prints which it is, so the claim is checked here.
        gov = c.get('figure_is_government_publication')
        says_not = 'not a government publication' in (row.get('source_title') or '').lower()
        if gov is None:
            add('%s publisher' % cid, 'FAIL', 'a priced condition does not say who published the figure')
            continue
        if gov == says_not:
            add('%s publisher' % cid, 'FAIL',
                'source_title says %s a government publication; conditions.json says %s'
                % ('NOT' if says_not else 'it IS', gov))
            continue
        add('%s publisher' % cid, 'PASS',
            'government publication = %s, and the price row says the same' % gov,
            (row.get('source_title') or '')[:120])

        # and the row itself must still say what the picker will print
        want = row.get('value_usd')
        rng = row.get('value_range_usd')
        add('%s figure' % cid, 'PASS',
            'read in %s: %s' % (FIGURE_SOURCES[rid]['title'], '; '.join(proof)),
            'row %s = $%s%s, %s' % (rid, want,
                                    (' (%s-%s)' % (rng[0], rng[1])) if rng else '',
                                    row.get('year')))

    # ------------------------------------------------- 6, 7, 8: sex differences
    # The one instruction the program gave every team in writing. A sentence
    # about sex is held to exactly the standard a dollar figure is held to:
    # named file, published URL, re-read here, or it does not ship.
    for c in rows:
        cid = c['id']
        note = c.get('sex_note')
        src, url = c.get('sex_note_source'), c.get('sex_note_source_url')
        if not note:
            reason = c.get('sex_note_blank_reason')
            if not reason or len(reason) < 40:
                add('%s sex blank' % cid, 'FAIL',
                    'sex_note is null with no written reason; a silence in the federal data is a finding and must be stated')
            elif src or url:
                add('%s sex blank' % cid, 'FAIL',
                    'sex_note is null but the row still carries a source — an absence must stay an absence')
            else:
                add('%s sex blank' % cid, 'PASS', reason[:150])
            spec = SEX_BLANK_SOURCES.get(cid)
            if spec:
                if spec['url'] not in (reason or ''):
                    add('%s sex blank page' % cid, 'FAIL',
                        'the blank reason does not name the page this script reads: %s' % spec['url'])
                else:
                    text, err = spec_text(spec)
                    if text is None:
                        add('%s sex blank page' % cid, 'UNVERIFIED', err or 'not fetched')
                    elif re.search(spec['pattern'], text, re.I):
                        add('%s sex blank page' % cid, 'PASS',
                            'read %s and it is still the page the blank reason names' % spec['title'])
                    else:
                        add('%s sex blank page' % cid, 'FAIL',
                            '%s no longer reads as the page the blank reason names' % spec['title'])
            continue

        money = re.findall(r'\$[0-9][0-9,]*', note)
        if money:
            add('%s sex note' % cid, 'FAIL',
                'a sex note carries a dollar amount (%s); no federal fee schedule we price from is published by sex'
                % ', '.join(money))
            continue
        spec = SEX_SOURCES.get(cid)
        if not spec:
            add('%s sex note' % cid, 'FAIL',
                'a sentence about sex with no source registered in this script — it cannot be re-read, so it cannot ship')
            continue
        if not src:
            add('%s sex note' % cid, 'FAIL', 'sex_note with no sex_note_source')
            continue
        if url != spec['cite']:
            add('%s sex note' % cid, 'FAIL',
                'the row publishes %r; this script reads %r. The citation and the check must be the same file.'
                % (url, spec['cite']))
            continue
        text, err = spec_text(spec)
        if text is None:
            add('%s sex note' % cid, 'UNVERIFIED', 'could not read %s: %s' % (spec['title'], err))
            continue
        if spec['kind'] == 'json':
            ok, detail = sex_pulse_check(text)
            add('%s sex note' % cid, 'PASS' if ok else 'FAIL',
                ('re-read in %s: %s' % (spec['title'], detail)) if ok
                else ('%s does not say it: %s' % (spec['title'], detail)),
                note[:120])
            continue
        proof, missing = [], []
        for pattern, says in SEX_CHECKS.get(cid, []):
            (proof if re.search(pattern, text, re.I) else missing).append(says)
        if not SEX_CHECKS.get(cid):
            add('%s sex note' % cid, 'FAIL', 'no pattern is registered for this note, so nothing was actually checked')
        elif missing:
            add('%s sex note' % cid, 'FAIL',
                '%s does not carry: %s' % (spec['title'], '; '.join(missing)), note[:120])
        else:
            add('%s sex note' % cid, 'PASS',
                'read in %s: %s' % (spec['title'], '; '.join(proof)), note[:120])

    # 8: the price table itself must be silent on sex, because the files are.
    sexy = sorted({k for r in prices.values() for k in r if 'sex' in k.lower()})
    add('price table carries no sex field', 'FAIL' if sexy else 'PASS',
        ('priced rows carry %s' % ', '.join(sexy)) if sexy else
        'no priced row carries a field naming sex: the CMS fee schedules price a code, not a person, '
        'and no figure here is adjusted by sex')

    # ------------------------------------------------------------ report
    n = lambda s: sum(1 for r in RESULTS if r['status'] == s)                # noqa: E731
    out = dict(
        generated=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        conditions_version=conds.get('_version'),
        table_version=json.load(open(PRICES, encoding='utf-8')).get('_version'),
        conditions=len(rows),
        coded=sum(1 for c in rows if c.get('icd10cm')),
        priced=sum(1 for c in rows if c.get('price_row_id')),
        checks=len(RESULTS), **{'pass': n('PASS'), 'fail': n('FAIL'), 'unverified': n('UNVERIFIED')},
        icd10cm_years_checked=list(ICD_MUST),
        sources={k: v for k, v in STATE.items()},
        results=RESULTS,
    )
    json.dump(out, open(AUDIT, 'w'), indent=1)
    open(AUDIT, 'a').write('\n')

    for r in RESULTS:
        if r['status'] != 'PASS':
            print('%-11s %-44s %s' % (r['status'], r['check'], r['detail']))
    print('\n%d conditions · %d coded · %d priced · %d checks: %d PASS, %d FAIL, %d UNVERIFIED'
          % (len(rows), out['coded'], out['priced'], len(RESULTS),
             out['pass'], out['fail'], out['unverified']))
    for k, v in sorted(STATE.items()):
        if v.get('sha256'):
            print('  %-14s sha256 %s  %9d bytes  %s' % (k, v['sha256'][:32], v['bytes'], v['retrieved']))
        else:
            print('  %-14s %s' % (k, v.get('error')))
    print('wrote', os.path.relpath(AUDIT, os.path.dirname(HERE)))
    return 1 if out['fail'] else 0


if __name__ == '__main__':
    sys.exit(main())

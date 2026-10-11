#!/usr/bin/env python3
"""Build data/private-rates.json (rows with provenance + per-code spreads) and
data/private-rates-summary.json (spreads only, small enough for the browser) from the
extracts written by extract_hpt.py.

What this script does to a number: nothing. Every rate it writes is a string the hospital
published, parsed to a float. The spread is the lowest, the median (the lower middle one when
the count is even, so it is always a printed rate) and the highest of
those published dollar amounts; no average is taken across plans, and no rate is
derived from a percentage.

Rules (each row records which rule placed it, so a reader can redo the sort):
  plan class  read from the payer and plan names as the hospital wrote them
              commercial  - the names say commercial, PPO, HMO, EPO, POS, exchange,
                            marketplace, QHP/IFP, indemnity, open access or self-funded
              medicare_advantage, medicaid, other (workers' comp, auto, TRICARE/VA,
                            transplant, international, public-health programs)
              not_stated  - the names do not say which kind of plan it is
  rate type   negotiated_dollar  fee-schedule or case-rate dollar amount
              percentage         percent of total billed charges (even when the
                                 hospital also printed a dollar figure)
              per_diem           per diem
              other_dollar       methodology "other" with a dollar figure
              algorithm_only     no dollar and no percentage, only an algorithm text
  in spread   commercial  AND  negotiated_dollar  AND  setting outpatient or both
              AND  no modifier  AND  amount > 0
Gross check: a negotiated dollar amount higher than the hospital's own gross charge for
the same line (the row's gross charge; if the row has none, the highest gross charge the
file gives for the same code and description; if none, for the same code) is counted in
notInSpread as above-own-gross-charge, not shown. Such rows exist (a chest X-ray at
$83,053.61 against a $608 gross charge) and are not a price for that item alone.
Distinct rates: within one hospital file, one code and one billing class, rows that
carry the same dollar amount are one rate (hospitals list one contract under many payer
names); N counts those distinct amounts, and the row count is reported beside it.

usage: build_private_rates.py --work <dir with extract-*.jsonl and meta-*.json>
"""
import argparse, json, os, re, statistics
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(os.path.dirname(HERE))

# Checked in order; the first rule whose pattern appears in "payer | plan" decides.
# Named exceptions, each a fact about one payer or product rather than a guess:
#   Devoted Health sells only Medicare Advantage plans, so its "HMO", "PPO" and "POS"
#   lines are Medicare Advantage. BCBS of Texas "Blue Advantage HMO" is a commercial
#   HMO; its name alone does not say so, so it is left as not_stated.
RULES = [
    ('other', r"workers'? ?comp|work comp|wcomp|\bwc\b|\bauto\b|velocity|liability|tricare|\btrcr\b|triwest|champva|\bva\b|veteran|military|transplant|international|global excel|crime victim|correctional|county funding|dept of public health|department of health|screening|ryan white|title v\b|\beap\b|dental|\blogov\b"),
    ('medicaid', r"medicaid|\bmcd\b|mgmcd|mcdstar"),
    ('medicare_advantage', r"medicare|\bmcr|mgmcr|\bmme\b|\bmmp\b|pffs|devoted health"),
    ('medicaid', r"total care|community plan|title 19|title xix|hawk-?i|\bchip\b|tenncare|medi-cal|\|\s*star\w*$"),
    ('not_stated', r"blueadvantagehmo"),
    ('medicare_advantage', r"advantage|\bsnp\b|d-snp|i-snp|c-snp|senior|\bdual|\bpace\b"),
    ('commercial', r"commercial|\bcomm\b|commppo|\bppo\b|optionsppo|\bhmo\b|\bepo\b|eposoa|\bpos\b|exchange|marketplace|\bhix\b|\bqhp\b|\bifp\b|indemnity|open access|self-funded|self funded|smallgroup|employer|employeeshealth"),
]
RULES_C = [(k, re.compile(p, re.I)) for k, p in RULES]


def plan_class(payer, plan):
    text = f"{payer or ''} | {plan or ''}"
    for k, rx in RULES_C:
        m = rx.search(text)
        if m:
            return k, m.group(0)
    return 'not_stated', None


def num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace('$', '').replace(',', '').strip()
    try:
        return float(s)
    except ValueError:
        return None


def rate_type(r):
    m = (r.get('methodology') or '').strip().lower()
    d = num(r.get('negotiatedDollar'))
    p = num(r.get('negotiatedPercentage'))
    if m == 'per diem':
        return 'per_diem'
    if m == 'percent of total billed charges':
        return 'percentage'
    if d is None:
        return 'percentage' if p is not None else 'algorithm_only'
    if m in ('fee schedule', 'case rate'):
        return 'negotiated_dollar'
    return 'other_dollar'


def billing_class(v):
    v = (v or '').strip().lower()
    return v if v in ('professional', 'facility') else 'not_stated'


def setting_of(v):
    return (v or '').strip().lower() or 'not_stated'


def spread(values):
    v = sorted(values)
    # median_low: with an even count, the lower of the two middle rates, so the
    # median shown is always a rate a hospital printed, never the mean of two.
    return {'low': round(v[0], 2), 'median': round(statistics.median_low(v), 2), 'high': round(v[-1], 2)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--work', required=True)
    a = ap.parse_args()
    manifest = json.load(open(os.path.join(HERE, 'sources.json')))
    prices = json.load(open(os.path.join(APP, 'data', 'prices.json')))

    # which ledger lines carry which code
    lines_by_code = defaultdict(list)
    for it in prices['items']:
        for m in re.finditer(r'\b(?:CPT|HCPCS)\s+([A-Z0-9]{5})\b', it.get('code') or ''):
            lines_by_code[m.group(1)].append(it['id'])

    sources = []
    rows_by_code = defaultdict(list)
    for src in manifest['sources']:
        mp = os.path.join(a.work, f"meta-{src['id']}.json")
        ep = os.path.join(a.work, f"extract-{src['id']}.jsonl")
        if not (os.path.exists(mp) and os.path.exists(ep)):
            continue
        meta = json.load(open(mp))
        h = meta['header']
        loc = h.get('location_name')
        if isinstance(loc, list):
            loc = ' | '.join(loc)
        addr = h.get('hospital_address')
        if isinstance(addr, list):
            addr = ' | '.join(addr)
        sources.append({
            'id': src['id'], 'displayName': src['displayName'], 'system': src['system'], 'kind': src['kind'],
            'hospitalName': h.get('hospital_name'), 'locationName': loc, 'address': addr,
            'lastUpdatedOn': h.get('last_updated_on'), 'schemaVersion': h.get('version'),
            'cmsHptUrl': src['cmsHptUrl'], 'fileUrl': src['mrfUrl'], 'fileName': src['file'],
            'innerFile': meta.get('innerFile'), 'bytes': meta['bytes'], 'sha256': meta['sha256'],
            'readAt': meta['downloadedAt'], 'rowsInFile': meta['rowsRead'],
            'rule': '45 CFR 180.50',
        })
        # the hospital's own gross charge for the same line, to catch a negotiated
        # rate that is higher than the hospital's list price for that item
        gross_desc, gross_code = {}, {}
        for line in open(ep):
            r = json.loads(line)
            g = num(r.get('gross'))
            if g is None:
                continue
            kd = (r['code'], r.get('description'))
            gross_desc[kd] = max(g, gross_desc.get(kd, 0))
            gross_code[r['code']] = max(g, gross_code.get(r['code'], 0))
        for line in open(ep):
            r = json.loads(line)
            pc, why = plan_class(r.get('payer'), r.get('plan'))
            rt = rate_type(r)
            bc = billing_class(r.get('billingClass'))
            st = setting_of(r.get('setting'))
            d = num(r.get('negotiatedDollar'))
            excluded = []
            if pc != 'commercial':
                excluded.append('plan:' + pc)
            if rt != 'negotiated_dollar':
                excluded.append('rate:' + rt)
            if st not in ('outpatient', 'both'):
                excluded.append('setting:' + st)
            if r.get('modifiers'):
                excluded.append('modifier')
            if rt == 'negotiated_dollar' and (d is None or d <= 0):
                excluded.append('amount<=0')
            own_gross = num(r.get('gross'))
            gross_basis = 'row'
            if own_gross is None:
                own_gross = gross_desc.get((r['code'], r.get('description')))
                gross_basis = 'same description'
            if own_gross is None:
                own_gross = gross_code.get(r['code'])
                gross_basis = 'same code'
            if own_gross is None:
                gross_basis = None
            if rt == 'negotiated_dollar' and d is not None and own_gross is not None and d > own_gross:
                excluded.append('above-own-gross-charge')
            rows_by_code[r['code']].append({
                'source': src['id'],
                'payer': r.get('payer'), 'plan': r.get('plan'),
                'planClass': pc, 'planClassMatched': why,
                'code': r['code'], 'codeType': r['codeType'],
                'description': r.get('description'), 'modifiers': r.get('modifiers'),
                'setting': st, 'billingClass': bc,
                'rateType': rt, 'methodology': r.get('methodology'),
                'negotiatedDollar': d,
                'negotiatedPercentage': num(r.get('negotiatedPercentage')),
                'negotiatedAlgorithm': r.get('negotiatedAlgorithm'),
                'grossCharge': num(r.get('gross')), 'grossCheckedAgainst': own_gross, 'grossCheckBasis': gross_basis,
                'sourceRow': r.get('sourceRow'),
                'inSpread': not excluded, 'excludedBecause': excluded,
            })

    codes_out = {}
    for code in sorted(rows_by_code):
        rows = rows_by_code[code]
        groups = {}
        for bc in ('professional', 'facility', 'not_stated'):
            inn = [r for r in rows if r['inSpread'] and r['billingClass'] == bc]
            if not inn:
                continue
            distinct = defaultdict(set)
            for r in inn:
                distinct[r['source']].add(round(r['negotiatedDollar'], 2))
            values = [v for s in distinct.values() for v in s]
            per_h = []
            for sid, vs in sorted(distinct.items()):
                vs = sorted(vs)
                per_h.append({'source': sid, 'low': vs[0], 'high': vs[-1], 'rates': len(vs),
                              'rows': sum(1 for r in inn if r['source'] == sid)})
            groups[bc] = {
                **spread(values),
                'rates': len(values), 'rows': len(inn), 'hospitals': len(distinct),
                'plans': len({(r['source'], r['payer'], r['plan']) for r in inn}),
                'byHospital': per_h,
            }
        counted = defaultdict(int)
        for r in rows:
            if r['inSpread']:
                continue
            for why in r['excludedBecause']:
                counted[why] += 1
        codes_out[code] = {
            'code': code, 'codeType': rows[0]['codeType'], 'ledgerLines': lines_by_code.get(code, []),
            'groups': groups, 'rowsRead': len(rows), 'rowsInSpread': sum(1 for r in rows if r['inSpread']),
            'notInSpread': dict(sorted(counted.items())),
        }

    readme = ('Negotiated rates that hospitals publish under the federal hospital price transparency rule '
              '(45 CFR 180.50). These are prices the hospitals themselves posted, not federal figures and not '
              'estimates. Per code and billing class: the lowest, median and highest distinct negotiated dollar '
              'amount among commercial plans, outpatient setting, no modifier; percentage-of-charge, per-diem, '
              '"other" and algorithm-only rates are counted in notInSpread, never converted. No average is taken '
              'across plans. Built by scripts/payer/build_private_rates.py from files listed in sources.')
    common = {
        '_README': readme, 'rule': '45 CFR 180.50', 'ruleTitle': 'Hospital price transparency',
        'builtFrom': 'scripts/payer/sources.json', 'planClassRules': RULES,
        'spreadRule': 'commercial plan AND fee-schedule or case-rate dollar AND setting outpatient or both AND no modifier AND amount > 0 AND amount <= the hospital own gross charge for the line; distinct dollar amounts per hospital, code and billing class',
        'sources': sources,
        'notRead': manifest.get('notRead', []),
    }
    # 1. data/private-rates.json: every row in a spread, columnar, with the sources table
    COLS = ['source', 'payer', 'plan', 'planClassMatched', 'billingClass', 'setting', 'methodology',
            'negotiatedDollar', 'grossCharge', 'grossCheckedAgainst', 'grossCheckBasis',
            'description', 'negotiatedAlgorithm', 'sourceRow']
    full_codes = {}
    for c, v in codes_out.items():
        inn = [r for r in rows_by_code[c] if r['inSpread']]
        full_codes[c] = {**v, 'rowConstants': {'planClass': 'commercial', 'rateType': 'negotiated_dollar',
                                               'modifiers': None, 'code': c, 'codeType': v['codeType']},
                         'rows': [[r[k] for k in COLS] for r in inn]}
    full = {**common, 'rowColumns': COLS, 'codes': full_codes}
    with open(os.path.join(APP, 'data', 'private-rates.json'), 'w') as f:
        json.dump(full, f, separators=(',', ':'))

    # 2. data/private-rates-summary.json: what the browser imports. Only codes a ledger
    #    line carries; spreads, per-hospital ranges and counts; no rows.
    src_slim = [{k: s_[k] for k in ('id', 'displayName', 'system', 'kind', 'hospitalName', 'locationName', 'lastUpdatedOn',
                                    'fileUrl', 'sha256', 'readAt', 'rule')} for s_ in sources]
    summary = {
        '_README': readme, 'rule': common['rule'], 'spreadRule': common['spreadRule'],
        'builtFrom': common['builtFrom'], 'sources': src_slim,
        'notRead': [{'system': n_['system'], 'why': n_['why']} for n_ in common['notRead']],
        'codes': {c: v for c, v in codes_out.items() if v['ledgerLines']},
    }
    with open(os.path.join(APP, 'data', 'private-rates-summary.json'), 'w') as f:
        json.dump(summary, f, separators=(',', ':'))

    # 2b. data/private-rates-client.json: the same summary, packed for the browser
    #     bundle (about a third of the size). lib/private-rates.ts unpacks it.
    #     codes[code] = [codeType initial, rowsRead, {group initial: [low, median, high,
    #     rates, rows, [[source index, low, high, rates, rows], ...]]}, [[leftOutKeys index, count], ...]]
    ids = [s_['id'] for s_ in src_slim]
    keys = sorted({k for v in summary['codes'].values() for k in v['notInSpread']})
    packed = {'_format': 'see scripts/payer/build_private_rates.py, step 2b', 'sources': src_slim,
              'notRead': summary['notRead'], 'leftOutKeys': keys, 'lines': {}, 'codes': {}}
    for c, v in summary['codes'].items():
        for line_id in v['ledgerLines']:
            packed['lines'][line_id] = c
        packed['codes'][c] = [v['codeType'][0], v['rowsRead'],
                              {g[0]: [sp['low'], sp['median'], sp['high'], sp['rates'], sp['rows'],
                                      [[ids.index(h['source']), h['low'], h['high'], h['rates'], h['rows']] for h in sp['byHospital']]]
                               for g, sp in v['groups'].items()},
                              [[keys.index(k), n_] for k, n_ in v['notInSpread'].items()]]
    with open(os.path.join(APP, 'data', 'private-rates-client.json'), 'w') as f:
        json.dump(packed, f, separators=(',', ':'))

    # 2c. data/private-rates-lines.json: hospitals behind each billing group, per ledger
    #     line, and nothing else. lib/fit.ts names the count on every page's first load;
    #     the rates (2b) load only with a line's drawer. lib/private-rate-lines.ts reads it.
    line_counts = {'_format': 'scripts/payer/build_private_rates.py, step 2c: hospitals behind each billing group, per ledger line, from private-rates-client.json. lib/private-rate-lines.ts reads it so the fit sentence can name the count without the rates in the first-load bundle.',
                   'lines': {line_id: {g[0]: len(sp['byHospital']) for g, sp in summary['codes'][c]['groups'].items()}
                             for line_id, c in packed['lines'].items()}}
    with open(os.path.join(APP, 'data', 'private-rates-lines.json'), 'w') as f:
        json.dump(line_counts, f, separators=(',', ':'))

    # 3. public/data/private-rates.csv, every row in a spread with its provenance joined
    #    in, only if it is under 5 MB; otherwise public/data/private-rates-summary.json
    #    alone. The rows stay reachable, per code, at GET /api/private-rates/{code}.
    by_id = {s_['id']: s_ for s_ in sources}
    PROV = ('system', 'hospitalName', 'locationName', 'lastUpdatedOn', 'fileUrl', 'cmsHptUrl', 'sha256', 'readAt', 'rule')
    csv_rows = []
    for c, v in codes_out.items():
        for r in rows_by_code[c]:
            if not r['inSpread']:
                continue
            s_ = by_id[r['source']]
            csv_rows.append({**{k: r[k] for k in ['code', 'codeType', 'payer', 'plan', 'planClass', 'billingClass', 'setting',
                                                  'rateType', 'methodology', 'negotiatedDollar', 'grossCharge',
                                                  'description', 'source', 'sourceRow']},
                             **{('publisher' if k == 'system' else k): s_[k] for k in PROV}})
    with open(os.path.join(APP, 'public', 'data', 'private-rates-summary.json'), 'w') as f:
        json.dump(summary, f, separators=(',', ':'))
    import csv as _csv, io as _io
    buf = _io.StringIO()
    if csv_rows:
        w = _csv.DictWriter(buf, fieldnames=list(csv_rows[0].keys()))
        w.writeheader()
        w.writerows(csv_rows)
    csv_path = os.path.join(APP, 'public', 'data', 'private-rates.csv')
    if len(buf.getvalue().encode()) < 5 * 1024 * 1024:
        open(csv_path, 'w').write(buf.getvalue())
        print(f"public/data/private-rates.csv {len(buf.getvalue().encode())} bytes")
    else:
        if os.path.exists(csv_path):
            os.remove(csv_path)
        print(f"CSV would be {len(buf.getvalue().encode())} bytes (over 5 MB): not published")
    n = sum(len(v) for v in rows_by_code.values())
    print(f"{len(sources)} files, {len(codes_out)} codes, {n} rows, "
          f"{sum(v['rowsInSpread'] for v in codes_out.values())} in a spread")


if __name__ == '__main__':
    main()

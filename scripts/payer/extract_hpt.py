#!/usr/bin/env python3
"""Stream hospital price-transparency files (CMS HPT schema v2/v3, CSV "tall" or JSON)
and write every row that carries one of the target CPT/HCPCS codes, exactly as the
hospital wrote it, to <work>/extract-<id>.jsonl plus <work>/meta-<id>.json.

Python standard library only. Nothing is loaded whole: CSV is read row by row (a zip is
read through zipfile's stream), JSON is decoded one standard_charge_information element
at a time with json.JSONDecoder.raw_decode over a sliding buffer.

No figure is computed here. Each output row is the hospital's own field values.

usage: extract_hpt.py --raw <dir with downloaded files> --work <out dir> [--only id,id]
"""
import argparse, csv, hashlib, io, json, os, re, sys, time, zipfile
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(os.path.dirname(HERE))

csv.field_size_limit(1 << 30)


def target_codes():
    """The codes the ledger prices: every CPT/HCPCS code in data/prices.json plus the
    families named in the work order."""
    codes = set()
    for c in ['99202', '99203', '99204', '99205', '99212', '99213', '99214', '99215',
              '99281', '99282', '99283', '99284', '99285', '93306',
              '95885', '95886', '95887', '95907', '95908', '95909', '95910', '95911', '95912', '95913',
              '70551', '70552', '70553']:
        codes.add(c)
    prices = json.load(open(os.path.join(APP, 'data', 'prices.json')))
    for it in prices['items']:
        for m in re.finditer(r'\b(?:CPT|HCPCS)\s+([A-Z0-9]{5})\b', it.get('code') or ''):
            codes.add(m.group(1))
    return codes


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 22), b''):
            h.update(chunk)
    return h.hexdigest()


CODE_TYPES = {'CPT', 'HCPCS'}


def clean(v):
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        return v if v != '' else None
    return v


# ---------------------------------------------------------------- CSV (tall)

def open_text(path, container):
    if container == 'zip':
        z = zipfile.ZipFile(path)
        names = [n for n in z.namelist() if n.lower().endswith('.csv')]
        if len(names) != 1:
            raise SystemExit(f'{path}: expected one CSV inside the zip, found {names}')
        return io.TextIOWrapper(z.open(names[0]), encoding='utf-8-sig', newline=''), names[0]
    return open(path, encoding='utf-8-sig', newline=''), None


def extract_csv(src, path, codes, out):
    fh, inner = open_text(path, src['container'])
    r = csv.reader(fh)
    meta_keys = next(r)
    meta_vals = next(r)
    meta = {}
    for k, v in zip(meta_keys, meta_vals):
        if k.startswith('To the best of its knowledge'):
            meta['attestation_confirmed'] = v
        else:
            meta[k] = v
    header = next(r)
    idx = {h: i for i, h in enumerate(header)}
    wide = [h for h in header if h.startswith('standard_charge|') and h.count('|') >= 3]
    if 'payer_name' not in idx:
        raise SystemExit(f'{path}: no payer_name column; this is a "wide" CSV ({len(wide)} payer columns) and is not handled')
    code_cols = []
    n = 1
    while f'code|{n}' in idx:
        code_cols.append((idx[f'code|{n}'], idx.get(f'code|{n}|type')))
        n += 1

    def g(row, name):
        i = idx.get(name)
        return clean(row[i]) if i is not None and i < len(row) else None

    seen = kept = 0
    for row in r:
        seen += 1
        hit = None
        allc = []
        for ci, ti in code_cols:
            if ci < len(row) and ti is not None and ti < len(row):
                c = row[ci].strip()
                t = row[ti].strip().upper()
                if c:
                    allc.append({'code': c, 'type': t})
                if t in CODE_TYPES and c in codes and hit is None:
                    hit = (c, t)
        if not hit:
            continue
        kept += 1
        out.write(json.dumps({
            'code': hit[0], 'codeType': hit[1], 'allCodes': allc,
            'description': g(row, 'description'),
            'modifiers': g(row, 'modifiers'),
            'setting': g(row, 'setting'),
            'billingClass': g(row, 'billing_class'),
            'gross': g(row, 'standard_charge|gross'),
            'discountedCash': g(row, 'standard_charge|discounted_cash'),
            'payer': g(row, 'payer_name'),
            'plan': g(row, 'plan_name'),
            'negotiatedDollar': g(row, 'standard_charge|negotiated_dollar'),
            'negotiatedPercentage': g(row, 'standard_charge|negotiated_percentage'),
            'negotiatedAlgorithm': g(row, 'standard_charge|negotiated_algorithm'),
            'methodology': g(row, 'standard_charge|methodology'),
            'sourceRow': seen + 3,
        }) + '\n')
    fh.close()
    return meta, seen, kept, inner


# ---------------------------------------------------------------- JSON (streamed)

class JsonStream:
    def __init__(self, f, chunk=1 << 23):
        self.f, self.chunk, self.buf, self.pos, self.eof = f, chunk, '', 0, False
        self.dec = json.JSONDecoder()

    def fill(self):
        if self.eof:
            return False
        data = self.f.read(self.chunk)
        if not data:
            self.eof = True
            return False
        self.buf = self.buf[self.pos:] + data
        self.pos = 0
        return True

    def skip_ws(self, also=''):
        while True:
            while self.pos < len(self.buf) and (self.buf[self.pos].isspace() or self.buf[self.pos] in also):
                self.pos += 1
            if self.pos < len(self.buf) or not self.fill():
                return

    def peek(self):
        self.skip_ws()
        return self.buf[self.pos] if self.pos < len(self.buf) else ''

    def value(self):
        self.skip_ws()
        while True:
            try:
                v, end = self.dec.raw_decode(self.buf, self.pos)
                # a number at the very end of the buffer may be cut; read more and redo
                if end == len(self.buf) and not self.eof and isinstance(v, (int, float)):
                    raise ValueError
                self.pos = end
                return v
            except ValueError:
                if not self.fill():
                    raise


def iter_json(path):
    """Yield ('meta', key, value) for top-level keys and ('item', element) for each
    element of standard_charge_information, never holding the whole file."""
    with open(path, encoding='utf-8-sig') as f:
        s = JsonStream(f)
        if s.peek() != '{':
            raise SystemExit(f'{path}: not a JSON object')
        s.pos += 1
        while True:
            s.skip_ws(',')
            ch = s.peek()
            if ch == '}':
                return
            key = s.value()
            s.skip_ws()
            if s.peek() != ':':
                raise SystemExit(f'{path}: expected : after {key!r}')
            s.pos += 1
            if key == 'standard_charge_information':
                if s.peek() != '[':
                    raise SystemExit(f'{path}: standard_charge_information is not an array')
                s.pos += 1
                while True:
                    s.skip_ws(',')
                    if s.peek() == ']':
                        s.pos += 1
                        break
                    yield ('item', s.value())
            else:
                yield ('meta', key, s.value())


def extract_json(src, path, codes, out):
    meta = {}
    seen = kept = 0
    for ev in iter_json(path):
        if ev[0] == 'meta':
            k, v = ev[1], ev[2]
            if k == 'modifier_information':
                meta['modifier_information_count'] = len(v) if isinstance(v, list) else None
            elif k == 'attestation':
                meta['attestation_confirmed'] = (v or {}).get('confirm_attestation') if isinstance(v, dict) else v
                meta['attester_name'] = (v or {}).get('attester_name') if isinstance(v, dict) else None
            elif k in ('general_contract_provisions',):
                continue
            else:
                meta[k] = v
            continue
        e = ev[1]
        seen += 1
        cinfo = e.get('code_information') or []
        hit = None
        for ci in cinfo:
            c = str(ci.get('code', '')).strip()
            t = str(ci.get('type', '')).strip().upper()
            if t in CODE_TYPES and c in codes:
                hit = (c, t)
                break
        if not hit:
            continue
        for sc in e.get('standard_charges') or []:
            mods = sc.get('modifier_code') or sc.get('modifiers')
            if isinstance(mods, list):
                mods = '|'.join(str(m) for m in mods)
            for p in sc.get('payers_information') or []:
                kept += 1
                out.write(json.dumps({
                    'code': hit[0], 'codeType': hit[1],
                    'allCodes': [{'code': str(ci.get('code')), 'type': str(ci.get('type'))} for ci in cinfo],
                    'description': clean(e.get('description')),
                    'modifiers': clean(mods),
                    'setting': clean(sc.get('setting')),
                    'billingClass': clean(sc.get('billing_class') or p.get('billing_class')),
                    'gross': sc.get('gross_charge'),
                    'discountedCash': sc.get('discounted_cash'),
                    'payer': clean(p.get('payer_name')),
                    'plan': clean(p.get('plan_name')),
                    'negotiatedDollar': p.get('standard_charge_dollar'),
                    'negotiatedPercentage': p.get('standard_charge_percentage'),
                    'negotiatedAlgorithm': clean(p.get('standard_charge_algorithm')),
                    'methodology': clean(p.get('methodology')),
                    'sourceRow': seen,
                }) + '\n')
    return meta, seen, kept, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw', required=True)
    ap.add_argument('--work', required=True)
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    os.makedirs(a.work, exist_ok=True)
    manifest = json.load(open(os.path.join(HERE, 'sources.json')))
    codes = target_codes()
    only = set(x for x in a.only.split(',') if x)
    for src in manifest['sources']:
        if only and src['id'] not in only:
            continue
        path = os.path.join(a.raw, src['file'])
        if not os.path.exists(path):
            print(f"{src['id']}: {path} not downloaded; skipped", file=sys.stderr)
            continue
        t0 = time.time()
        done_marker = path + '.done'
        read_at = open(done_marker).read().strip() if os.path.exists(done_marker) else \
            datetime.fromtimestamp(os.path.getmtime(path), timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        digest = sha256_of(path)
        tmp = os.path.join(a.work, f"extract-{src['id']}.jsonl.part")
        with open(tmp, 'w') as out:
            if src['format'] == 'csv-tall':
                meta, seen, kept, inner = extract_csv(src, path, codes, out)
            elif src['format'] == 'json':
                meta, seen, kept, inner = extract_json(src, path, codes, out)
            else:
                raise SystemExit(f"{src['id']}: unknown format {src['format']}")
        os.replace(tmp, os.path.join(a.work, f"extract-{src['id']}.jsonl"))
        info = {
            'id': src['id'], 'file': src['file'], 'bytes': os.path.getsize(path), 'sha256': digest,
            'innerFile': inner, 'downloadedAt': read_at, 'rowsRead': seen, 'rowsWithTargetCode': kept,
            'secondsToRead': round(time.time() - t0, 1), 'header': meta,
        }
        json.dump(info, open(os.path.join(a.work, f"meta-{src['id']}.json"), 'w'), indent=1)
        print(f"{src['id']}: {seen} rows read, {kept} with a target code, {info['secondsToRead']} s, sha256 {digest[:12]}")


if __name__ == '__main__':
    main()

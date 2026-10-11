/* GET /api/private-rates/{code}: what commercial plans negotiated for one CPT or
   HCPCS code at the hospitals whose price-transparency files we read.

   These are hospital-published negotiated rates, required by the federal hospital
   price transparency rule (45 CFR 180). They are not federal figures, not national
   and not typical; they are these hospitals' rates. Each range names its hospitals
   and the sha256 of each file, and every row carries the payer and plan as the
   hospital wrote them, the file, the row and the date the file was read. The spread
   is lowest, median and highest of the distinct dollar amounts, never an average.
   `?rows=0` leaves the rows out. Rows and groups whose file does not say whether
   a line is the doctor's or the hospital's fee carry feeType 'unstated'; the site
   never shows them as dollar amounts, only as a count. Built by scripts/payer/build_private_rates.py. */
import { json, bad } from '../_http.js';
import FULL from '../../../../data/private-rates.json';

const MIN_HOSPITALS = 2;
const LABEL = 'Hospital-published negotiated rates (required by the federal hospital price transparency rule, 45 CFR 180)';
const NOT_FEDERAL = 'Rates the hospitals printed in their own files. Not federal figures, not national or typical prices, and never added to a ledger total.';

const SOURCES = Object.fromEntries(FULL.sources.map((s) => [s.id, s]));
const provenance = (id) => {
  const s = SOURCES[id];
  return {
    source: id, hospital: s.displayName, hospitalName: s.hospitalName, publisher: s.system,
    fileUrl: s.fileUrl, cmsHptUrl: s.cmsHptUrl, sha256: s.sha256, readAt: s.readAt,
    fileLastUpdatedOn: s.lastUpdatedOn, schemaVersion: s.schemaVersion, rule: s.rule,
  };
};

export function onRequestGet({ request, params }) {
  const code = String(params.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) {
    return bad(`"${params.code}" is not a CPT or HCPCS code. A code is five letters or digits, like 99213 or G0463.`);
  }
  const c = FULL.codes[code];
  if (!c) {
    return bad(
      `None of the ${FULL.sources.length} hospital files we read gives a commercial negotiated dollar rate for ${code} that `
      + 'meets the rule in spreadRule, or the ledger does not price that code. Try 99213.',
      404,
    );
  }
  const withRows = new URL(request.url).searchParams.get('rows') !== '0';
  const groups = Object.fromEntries(Object.entries(c.groups).map(([g, sp]) => [g, {
    low: sp.low, median: sp.median, high: sp.high,
    rates: sp.rates, rows: sp.rows, hospitalCount: sp.hospitals, plans: sp.plans,
    feeType: g === 'not_stated' ? 'unstated' : g,
    // a group whose files do not say doctor's or hospital's fee is never shown as a range
    shownAsRange: g !== 'not_stated' && sp.hospitals >= MIN_HOSPITALS,
    hospitals: sp.byHospital.map((h) => ({ ...provenance(h.source), low: h.low, high: h.high, rates: h.rates, rows: h.rows })),
  }]));
  const cols = FULL.rowColumns;
  const rows = withRows
    ? c.rows.map((arr) => {
      const r = Object.fromEntries(cols.map((k, i) => [k, arr[i]]));
      return { ...c.rowConstants, ...r, feeType: r.billingClass === 'not_stated' ? 'unstated' : r.billingClass, ...provenance(r.source) };
    })
    : undefined;
  return json(
    {
      ok: true,
      code, codeType: c.codeType,
      label: LABEL, notFederal: NOT_FEDERAL,
      rule: FULL.rule, spreadRule: FULL.spreadRule,
      minHospitalsForARange: MIN_HOSPITALS,
      ledgerLines: c.ledgerLines,
      groups,
      rowsRead: c.rowsRead, rowsInSpread: c.rowsInSpread, notInSpread: c.notInSpread,
      ...(withRows ? { rows } : {}),
    },
    200,
    { 'cache-control': 'public, max-age=3600' },
  );
}

/* ==========================================================================
   THE FILE A FIGURE COMES FROM, ITS ROW, AND WHAT THAT FILE HASHES TO.

   R3 fedexpert FX-03: the drawer under $95.19 showed a file, a row and a
   SHA-256, and all three belonged to the CY2024 claims file behind the $189.25
   charge, not to the fee schedule the $95.19 is derived from. A reviewer who
   pulled that row found $189.25 and $85.37 and no $95.19.

   This names, for every CMS fee-schedule row, the published file its figure is
   read or derived from, the row inside that file, and the columns used. The
   file names, hashes, byte counts and retrieval dates are the ones
   data/verify_price_table.py recorded in data/AUDIT.json when it re-derived
   every row (tests/primary-source.test.ts fails if they drift). Nothing here
   is a figure: the dollar amounts stay on the row itself.
   ========================================================================== */

import type { PriceItem } from './types';

export type PrimaryKey = 'rvu' | 'clfs' | 'oppsb' | 'gpci';

export interface PrimaryFile {
  key: PrimaryKey;
  title: string;
  /** the file inside the download, as CMS names it */
  file: string;
  /** the address CMS publishes the download at */
  url: string;
  sha256: string;
  retrieved: string;
}

/** Copied from data/AUDIT.json `sources` (checked by a test, never edited by hand). */
export const PRIMARY_FILES: Record<PrimaryKey, PrimaryFile> = {
  rvu: {
    key: 'rvu',
    title: 'CMS CY2026 National Physician Fee Schedule Relative Value File (RVU26C, July release)',
    file: 'PPRRVU2026_Jul_nonQPP.csv',
    url: 'https://www.cms.gov/files/zip/rvu26c-updated-06-30-2026.zip',
    sha256: 'b7d197e73211ef6854c213c267d5fa9dec8df995db8e1ee7d44c0556ad7cee21',
    retrieved: '2026-09-09',
  },
  clfs: {
    key: 'clfs',
    title: 'CMS Clinical Laboratory Fee Schedule, CY2026 Q3 public use file',
    file: 'PUF_CLFS_CY2026_Q3V1.csv',
    url: 'https://www.cms.gov/files/zip/26clabq3.zip',
    sha256: 'f5a090789c40fe791b478a735c7cf5399e86726adc788f11829435cb0ca4d7d5',
    retrieved: '2026-09-09',
  },
  oppsb: {
    key: 'oppsb',
    title: 'CMS January 2026 Hospital Outpatient PPS Addendum B',
    file: '2026 January Web Addendum B.12.29.25.csv',
    url: 'https://www.cms.gov/files/zip/january-2026-opps-addendum-b.zip',
    sha256: '1f34d9770231f66b877fc84ce2bd08dceb562309729dfb597e1ff8dafcfc9006',
    retrieved: '2026-09-09',
  },
  gpci: {
    key: 'gpci',
    title: 'CMS CY2026 Geographic Practice Cost Indices, Addendum E (RVU26C, July release)',
    file: 'GPCI2026.csv',
    url: 'https://www.cms.gov/files/zip/rvu26c-updated-06-30-2026.zip',
    sha256: '7850e2987d12e46930e49033f96829b5ae11f60dd1f19965329b38cf08b05264',
    retrieved: '2026-09-09',
  },
};

export interface PrimaryPart {
  file: PrimaryFile;
  /** the row inside the file, by the columns that pick it out */
  row: string;
  /** the columns the figure is read from, or multiplied from */
  fields: string;
  /** which half of a two-part figure this is, when there are two */
  part?: string;
}

/** The HCPCS/CPT code on the row, as the CMS files key it. */
export function hcpcsOf(item: PriceItem): string | null {
  const m = /\b(?:CPT|HCPCS)\s+([A-Z0-9]{5})\b/.exec(item.code ?? '');
  return m ? m[1] : null;
}
const apcOf = (item: PriceItem): string | null => /\bAPC\s+(\d{4})\b/.exec(item.code ?? '')?.[1] ?? null;

const PFS_URL = /pfs-relative-value-files/;
const CLFS_URL = /clinical-laboratory-fee-schedule/;
const OPPS_URL = /hospital-outpatient-pps|addendum-b/;
/** The one physician half priced at the facility rate (the ER physician fee). */
const FACILITY_RVU_ROWS = new Set(['cms-ed-99284-physician-only']);
/** The whole ER encounter: the hospital half from Addendum B plus the physician half. */
const TWO_PART_ROWS = new Set(['cms-ed-99284-complete']);

const rvuRow = (code: string) => `HCPCS ${code}, MOD blank (the global line)`;

/**
 * The file(s) a CMS fee-schedule figure comes from, or [] for a row this does
 * not describe (a survey average, a report, a wage). `locality` adds the
 * geographic index file when the figure shown is the locality one.
 */
export function primarySourceOf(item: PriceItem, opts: { locality?: boolean } = {}): PrimaryPart[] {
  const code = hcpcsOf(item);
  if (!code) return [];
  const url = item.sourceUrl ?? '';
  const out: PrimaryPart[] = [];
  if (TWO_PART_ROWS.has(item.id)) {
    const apc = apcOf(item);
    out.push({ file: PRIMARY_FILES.oppsb, part: 'Hospital half', row: `HCPCS Code ${code}${apc ? `, APC ${apc}` : ''}`, fields: 'Payment Rate' });
    out.push({ file: PRIMARY_FILES.rvu, part: 'Physician half', row: rvuRow(code), fields: 'FACILITY TOTAL (RVUs) × CONV FACTOR' });
    return out;
  }
  if (OPPS_URL.test(url) && !PFS_URL.test(url)) {
    const apc = apcOf(item);
    out.push({ file: PRIMARY_FILES.oppsb, row: `HCPCS Code ${code}${apc ? `, APC ${apc}` : ''}`, fields: 'Payment Rate' });
    return out;
  }
  if (CLFS_URL.test(url)) {
    out.push({ file: PRIMARY_FILES.clfs, row: `YEAR 2026, HCPCS ${code}, MOD blank`, fields: 'RATE' });
    return out;
  }
  if (PFS_URL.test(url)) {
    const status = (item as PriceItem & { pfsStatus?: string }).pfsStatus;
    out.push({
      file: PRIMARY_FILES.rvu,
      row: rvuRow(code),
      fields: status === 'N' ? 'STATUS CODE (N, non-covered: RVUs published, no payment)'
        : opts.locality ? 'WORK RVU, NON-FAC PE RVU and MP RVU, each times its index, then × CONV FACTOR'
        : FACILITY_RVU_ROWS.has(item.id) ? 'FACILITY TOTAL (RVUs) × CONV FACTOR'
          : 'NON-FACILITY TOTAL (RVUs) × CONV FACTOR',
    });
    if (opts.locality && status !== 'N') {
      out.push({ file: PRIMARY_FILES.gpci, row: 'your state and locality', fields: 'PW GPCI, PE GPCI, MP GPCI' });
    }
    return out;
  }
  return out;
}

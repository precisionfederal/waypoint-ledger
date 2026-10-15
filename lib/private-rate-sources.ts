/* ==========================================================================
   THE HOSPITAL FILES BEHIND THE NEGOTIATED RANGES, LISTED (judge panel 15 Oct B-10).

   The ledger shows hospital-published negotiated ranges under each Medicare
   figure, and /method never listed the files. This lists them: each hospital,
   its state, the date on its own file, the date we read it, the link, and how
   many services its file prices that this tool reads. Every count is computed
   from data/private-rates-client.json (the packed spreads, with every source)
   and data/private-rates-lines.json (the ledger lines and how many hospitals
   carry each); nothing here is typed. Server-side only (/method), so none of it
   reaches a first-load bundle.
   ========================================================================== */
import linesPacked from '@/data/private-rates-lines.json';
import { MIN_HOSPITALS, PRIVATE_RATE_CODES, RATE_SOURCES, RATE_SOURCES_NOT_READ, type RateSource } from './private-rates';

export interface HospitalSourceRow {
  id: string;
  name: string;
  system: string;
  /** two-letter state, read from the end of the hospital's display name */
  state: string | null;
  fileUrl: string;
  /** the date the hospital put on its own file */
  fileDated: string;
  /** the day we read it */
  readOn: string;
  /** service codes this hospital's file prices, of the ones this tool reads */
  services: number;
}

export const stateOf = (s: Pick<RateSource, 'displayName'>): string | null => /\b([A-Z]{2})$/.exec(s.displayName.trim())?.[1] ?? null;

export function hospitalSourceRows(): HospitalSourceRow[] {
  return RATE_SOURCES.map((s) => {
    let services = 0;
    for (const c of Object.values(PRIVATE_RATE_CODES)) {
      if (Object.values(c.groups).some((g) => g?.byHospital.some((h) => h.source === s.id))) services++;
    }
    return {
      id: s.id, name: s.displayName, system: s.system, state: stateOf(s),
      fileUrl: s.fileUrl, fileDated: s.lastUpdatedOn, readOn: s.readAt.slice(0, 10), services,
    };
  });
}

type Group = [number, number, number];
const LINES = (linesPacked as unknown as { lines: Record<string, { p?: Group; f?: Group; n?: number }> }).lines;

export interface HospitalSourceSummary {
  hospitals: number;
  states: string[];
  /** service codes priced by at least one of the hospitals */
  services: number;
  /** ledger lines that show a range (two or more hospitals in one billing group) */
  linesWithRange: number;
  notRead: { system: string; why: string }[];
}

export function hospitalSourceSummary(rows = hospitalSourceRows()): HospitalSourceSummary {
  const services = Object.values(PRIVATE_RATE_CODES)
    .filter((c) => Object.values(c.groups).some((g) => (g?.byHospital.length ?? 0) > 0)).length;
  const linesWithRange = Object.values(LINES)
    .filter((l) => [l.p, l.f].some((g) => !!g && g[0] >= MIN_HOSPITALS)).length;
  return {
    hospitals: rows.length,
    states: [...new Set(rows.map((r) => r.state).filter((x): x is string => !!x))].sort(),
    services, linesWithRange, notRead: RATE_SOURCES_NOT_READ,
  };
}

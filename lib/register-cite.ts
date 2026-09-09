/* ==========================================================================
   MAKING A CORRECTION ADDRESSABLE.

   A thumb on a ledger line is bound to one published federal row. For that to
   be worth anything to the agency that published the row, it has to leave this
   site in a form a person at that agency can act on without our bundle: the
   publisher, the document, the row identifier, the code, the published figure,
   its basis, its geography, the population it describes, and the count of what
   the public said about it — with the denominator.

   Everything here is pure and derived from the price table plus the public
   aggregate. No figure is invented; the only arithmetic is a fit rate.
   ========================================================================== */

export type Publisher = 'CMS' | 'AHRQ' | 'BLS' | 'Published research';

/** The publisher, read off the row's own source title. The table writes it first, before the comma. */
export function publisherOf(sourceTitle: string): Publisher {
  const t = (sourceTitle || '').trim();
  if (/^CMS\b/i.test(t) || /Centers for Medicare/i.test(t)) return 'CMS';
  if (/^AHRQ\b/i.test(t) || /Agency for Healthcare Research/i.test(t)) return 'AHRQ';
  if (/Bureau of Labor Statistics/i.test(t) || /^BLS\b/.test(t)) return 'BLS';
  return 'Published research';
}

export const PUBLISHER_FULL: Record<Publisher, string> = {
  CMS: 'Centers for Medicare & Medicaid Services',
  AHRQ: 'Agency for Healthcare Research and Quality',
  BLS: 'U.S. Bureau of Labor Statistics',
  'Published research': 'Peer-reviewed literature (not a federal publication)',
};

/** What a correction on a row from this publisher is about. Stated, never claimed as delivery. */
export const PUBLISHER_ROUTE: Record<Publisher, string> = {
  CMS: 'Fee schedules and outpatient payment files published by CMS. A thumb here is about a CMS-published amount.',
  AHRQ: 'MEPS and HCUP statistical briefs published by AHRQ. A thumb here is about an AHRQ-published estimate.',
  BLS: 'Earnings and wage series published by BLS. A thumb here is about a BLS-published wage figure.',
  'Published research': 'A figure taken from published research, not from a federal file. A thumb here is about that paper.',
};

/** The document a row came from: the source title without the publisher prefix. */
export function documentOf(sourceTitle: string): string {
  const t = (sourceTitle || '').trim();
  const i = t.indexOf(',');
  return i > 0 ? t.slice(i + 1).trim() : t;
}

/** The basis codes carry their meaning in lib/types.ts. An agency reader gets both:
 *  the code it can join on, and the sentence the code means. Nothing is added to either. */
export const BASIS_LABEL: Record<string, string> = {
  charge: 'charge — what was billed',
  allowed: 'allowed amount — the negotiated or fee-schedule amount',
  payment: 'payment — what was actually paid, all sources',
  out_of_pocket: 'out of pocket — what the person paid themselves',
  total_expenditure: 'total expenditure — payment from all sources combined',
  wage: 'wage — earnings, used for valuing time',
};
export const basisLabel = (b: string) => (BASIS_LABEL[b] ? `${b} (${BASIS_LABEL[b].split(' — ')[1]})` : b);

export interface CiteRow {
  priceId: string;
  label: string;
  code?: string;
  valueUsd: number | null;
  year: string;
  basis: string;
  geography: string;
  population: string;
  sourceTitle: string;
  sourceUrl: string;
  confirmedRight: number;
  flaggedWrong: number;
  medianBelievedUsd: number | null;
}

/** Percent of thumbs on this row that said the figure fits. Null when nobody has said anything. */
export function fitRate(right: number, wrong: number): number | null {
  const n = right + wrong;
  return n ? Math.round((right / n) * 100) : null;
}

const money = (n: number | null | undefined) =>
  typeof n === 'number' ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'not published';

/** The block a person copies and pastes into a message to the agency that published the row. */
export function citationText(r: CiteRow, asOf: string, siteUrl: string): string {
  const n = r.confirmedRight + r.flaggedWrong;
  const rate = fitRate(r.confirmedRight, r.flaggedWrong);
  return [
    'PUBLIC CORRECTION REPORT — Waypoint Ledger',
    '',
    `Published figure: ${r.label}`,
    `Row identifier:   ${r.priceId}${r.code ? `  ·  code ${r.code}` : ''}`,
    `Published value:  ${money(r.valueUsd)} (${r.year})`,
    `Basis:            ${basisLabel(r.basis)}`,
    `Geography:        ${r.geography}`,
    `Population:       ${r.population}`,
    `Published by:     ${PUBLISHER_FULL[publisherOf(r.sourceTitle)]}`,
    `Source:           ${r.sourceTitle}`,
    `Source URL:       ${r.sourceUrl}`,
    '',
    `What the public said about this row: ${n} ${n === 1 ? 'response' : 'responses'} — ${r.confirmedRight} say the figure describes them, ${r.flaggedWrong} say it does not${rate === null ? '' : ` (${rate}% say it fits)`}.`,
    r.medianBelievedUsd === null
      ? 'Median amount respondents said they actually paid: none reported.'
      : `Median amount respondents said they actually paid: ${money(r.medianBelievedUsd)} (a demand signal about the published figure; never used to price a ledger).`,
    '',
    'Sample: self-selected members of the public using a free tool. Counts are reported exactly as entered — no weighting, no imputation, no extrapolation to a population.',
    `Counted as of: ${asOf}`,
    siteUrl ? `Method and every source: ${siteUrl}/method` : 'Method and every source: /method',
  ].join('\n');
}

/** CSV cell: quoted where it must be, and never a formula when a spreadsheet opens it. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export const CORRECTIONS_CSV_HEADER = [
  'price_id', 'label', 'code', 'published_value_usd', 'year', 'basis', 'basis_label', 'geography', 'population',
  'source_agency', 'source_document', 'source_url', 'confirmed_right', 'flagged_wrong', 'fit_rate_pct',
  'public_median_believed_usd', 'counted_as_of',
];

/** One CSV a person at the publishing agency can open, sort and act on, with no join to anything of ours. */
export function correctionsCsv(rows: CiteRow[], asOf: string): string {
  const body = rows.map((r) => [
    r.priceId, r.label, r.code ?? '', r.valueUsd ?? '', r.year, r.basis, BASIS_LABEL[r.basis] ?? r.basis, r.geography, r.population,
    publisherOf(r.sourceTitle), documentOf(r.sourceTitle), r.sourceUrl,
    r.confirmedRight, r.flaggedWrong, fitRate(r.confirmedRight, r.flaggedWrong) ?? '',
    r.medianBelievedUsd ?? '', asOf,
  ].map(csvCell).join(','));
  return [CORRECTIONS_CSV_HEADER.join(','), ...body].join('\n') + '\n';
}

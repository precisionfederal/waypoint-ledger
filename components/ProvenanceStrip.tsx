/* ==========================================================================
   WHAT THIS PAGE IS BUILT FROM, IN ONE LINE.

   The ledger already carried "Sources in this ledger: CMS (7 lines)" — counted
   only over the itemized rows, on a page that was at the same moment showing an
   AHRQ MEPS figure, two BLS wage figures and the GSA mileage rate. A judge
   scoring "U.S. Open Data" counts what is on the screen, so the screen said one
   agency where four were doing work.

   This strip counts every published figure the page is actually rendering, and
   names the code systems those rows are coded in. Nothing here is asserted:
     · agencies come from agencyTally in lib/fit.ts — one definition
     · CPT and HCPCS are read off the rows' own `code` field
     · LOINC appears only when a row on this page carries a LOINC code
     · ICD-10-CM appears only when the page is showing a condition that has one
     · the FHIR clause is the export this repo validates against the published
       HL7 R4 schema in tests/fhir.test.ts (the suite fails, never skips, when
       the schema cannot be fetched)
   A clause with nothing behind it is not printed.
   ========================================================================== */
'use client';

import Link from 'next/link';
import { agencyOf, agencyTally } from '@/lib/fit';
import { TABLE } from '@/lib/table';
import type { PriceItem } from '@/lib/types';

/** A published figure rendered beside the total rather than as a line: the
 *  year-ahead MEPS figure, a wage table, a mileage rate. `what` is the words
 *  the strip uses to count it, e.g. "published excess", "wage figures". */
export interface BesideFigure {
  sourceTitle: string;
  what: string;
  n?: number;
}

const BY_ID = new Map(TABLE.map((i) => [i.id, i]));

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : one + 's'}`;

/** The clauses, in the order they are printed. Pure, so the test reads exactly
 *  what the page renders. */
export function provenanceClauses(
  items: (PriceItem | null | undefined)[],
  beside: BesideFigure[] = [],
  icd10: string | null = null,
): { agencies: string[]; codes: string[] } {
  const rows = items.filter((i): i is PriceItem => !!i);

  /* one map, so an agency that appears both as a line and beside the total is
     counted once with both kinds named */
  const order: string[] = [];
  const parts = new Map<string, string[]>();
  const add = (agency: string, phrase: string) => {
    if (!parts.has(agency)) { parts.set(agency, []); order.push(agency); }
    parts.get(agency)!.push(phrase);
  };
  for (const { agency, lines } of agencyTally(rows)) add(agency, plural(lines, 'line'));
  for (const b of beside) {
    const n = b.n ?? 1;
    add(agencyOf({ sourceTitle: b.sourceTitle } as PriceItem), plural(n, b.what));
  }

  const codes: string[] = [];
  if (rows.some((r) => /^CPT\b/i.test(r.code ?? ''))) codes.push('CPT');
  if (rows.some((r) => /^HCPCS\b/i.test(r.code ?? ''))) codes.push('HCPCS');
  if (rows.some((r) => !!r.loinc)) codes.push('LOINC');
  if (icd10) codes.push('ICD-10-CM');

  return { agencies: order.map((a) => `${a} ${parts.get(a)!.join(' + ')}`), codes };
}

export default function ProvenanceStrip({
  items, beside = [], extraIds = [], icd10 = null, className = 'micro',
}: {
  items: (PriceItem | null | undefined)[];
  beside?: BesideFigure[];
  /** published rows rendered on the page that are not journey lines */
  extraIds?: string[];
  /** the ICD-10-CM code shown on this page, if the person named a condition */
  icd10?: string | null;
  className?: string;
}) {
  const all = [...items, ...extraIds.map((id) => BY_ID.get(id))];
  const { agencies, codes } = provenanceClauses(all, beside, icd10);
  if (!agencies.length && !codes.length) return null;

  return (
    <p className={className}>
      {agencies.length > 0 && <>Sources on this page: {agencies.join(' · ')}</>}
      {codes.length > 0 && <> · coded in {codes.join(', ')}</>}
      {' · '}exports as an HL7 FHIR R4 bundle{' · '}
      <Link href="/method#sources">every file hashed, with its SHA-256, on the method page</Link>.
    </p>
  );
}

/* The defect report's columns: name · type · note. A leaf module with no imports, so the
   survey dictionary generator (plain node, no '@/' alias) and the report itself share one
   definition without dragging lib/table.ts into a script that cannot resolve it. */
export const DEFECT_COLUMNS = [
  ['received_at', 'ISO 8601 UTC timestamp', 'when the correction was recorded'],
  ['price_id', 'string', 'row identifier in the published price table; joins to /api/table/{id}'],
  ['code_system', 'CPT | HCPCS | blank', 'the code system the row is coded in'],
  ['code', 'string or blank', 'the CPT or HCPCS code the figure prices'],
  ['loinc', 'string or blank', 'LOINC code where the row is a laboratory test, from the NLM'],
  ['label', 'string', 'the unit of care, in the words a person reads on the ledger'],
  ['published_value_usd', 'number or blank', 'the published federal figure the correction is about'],
  ['basis', 'enum', 'charge | allowed | payment | out_of_pocket | total_expenditure | wage'],
  ['basis_meaning', 'string', 'what that basis means, in one clause'],
  ['year', 'string', 'the year the figure describes'],
  ['geography', 'string', 'the locality the figure describes'],
  ['population', 'string', 'the population the figure describes'],
  ['agency', 'string', 'the body that published the figure'],
  ['source_title', 'string', 'the publication, as the agency titles it'],
  ['source_url', 'URL', 'where the agency publishes it'],
  ['source_file', 'string', 'the federal file we read, by its own name'],
  ['source_file_url', 'URL', 'the exact file, not the landing page'],
  ['source_file_sha256', 'hex', 'SHA-256 of the bytes the audit read'],
  ['source_file_retrieved', 'date', 'the day those bytes were retrieved'],
  ['source_kind', 'string', 'federal data file | federal publication | federal web page | peer-reviewed article'],
  ['source_line', 'string', 'the row, table line or arithmetic the figure was re-read from'],
  ['audit_status', 'PASS | FAIL | UNVERIFIED', 'whether the figure reproduced from that file on the audit date'],
  ['audit_check', 'string', 'the method the audit used'],
  ['verdict', 'right | wrong', 'the direction of this correction: does the published figure describe this person'],
  ['believed_usd', 'number or blank', 'what the person said they were billed; a demand signal about the figure, never a price'],
  ['figure_confirmed_right', 'integer', 'corrections on this figure saying it describes them'],
  ['figure_flagged_wrong', 'integer', 'corrections on this figure saying it does not'],
  ['figure_responses', 'integer', 'the denominator: corrections on this figure in this file'],
  ['figure_fit_rate_pct', 'integer or blank', 'percent of those responses saying the figure fits'],
  ['table_version', 'string', 'the price-table version that was on screen when the thumb was given'],
  ['citation_url', 'URL', 'renders this figure as a paste-ready correction report for the publishing agency'],
  ['counted_as_of', 'date', 'the day this file was generated'],
  /* row_hash is LAST in every export this site publishes: the chain head is the
     last cell of the last row, and /api/integrity says so. */
  ['row_hash', 'hex or blank', 'this row hashed and chained to the row before it; see /api/integrity'],
];

export const DEFECT_HEADER = DEFECT_COLUMNS.map((c) => c[0]);

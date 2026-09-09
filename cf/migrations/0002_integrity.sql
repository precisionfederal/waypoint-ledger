-- 0002 — the register's integrity chain.
-- Every public row is bound to the row before it: row_hash = SHA-256(prev_hash + canonical(published fields)).
-- The formula, the field list and what it does and does not prove: cf/functions/api/_hash.js and /integrity.
-- Rows written before this migration keep NULL hashes; /api/integrity reports them as `unchained` rather than
-- pretending they are covered. Never edit this file after it is applied; add 0003_*.sql.

ALTER TABLE corrections ADD COLUMN prev_hash TEXT;
ALTER TABLE corrections ADD COLUMN row_hash TEXT;
ALTER TABLE gap_reports ADD COLUMN prev_hash TEXT;
ALTER TABLE gap_reports ADD COLUMN row_hash TEXT;
ALTER TABLE survey_responses ADD COLUMN prev_hash TEXT;
ALTER TABLE survey_responses ADD COLUMN row_hash TEXT;
ALTER TABLE interviews ADD COLUMN prev_hash TEXT;
ALTER TABLE interviews ADD COLUMN row_hash TEXT;

-- One thumb per browser per figure per price-table version. The raw browser id never leaves the browser:
-- what is stored is SHA-256(submitterId + ' ' + price_id + ' ' + table_version) truncated to 32 hex chars,
-- so two corrections from one browser cannot be linked to each other, and a repeat on the SAME figure is refused.
ALTER TABLE corrections ADD COLUMN submitter_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_corrections_submitter ON corrections(price_id, submitter_hash);
CREATE INDEX IF NOT EXISTS idx_corrections_row_hash ON corrections(row_hash);

CREATE TABLE IF NOT EXISTS integrity_heads (
  table_name TEXT PRIMARY KEY,
  head_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- The genesis head: 64 zeros. A chain with no rows has this head, and that is a true statement, not a placeholder.
INSERT OR IGNORE INTO integrity_heads (table_name, head_hash, row_count, updated_at)
VALUES ('corrections', '0000000000000000000000000000000000000000000000000000000000000000', 0, '2026-09-09T00:00:00.000Z'),
       ('gap_reports', '0000000000000000000000000000000000000000000000000000000000000000', 0, '2026-09-09T00:00:00.000Z'),
       ('survey_responses', '0000000000000000000000000000000000000000000000000000000000000000', 0, '2026-09-09T00:00:00.000Z'),
       ('interviews', '0000000000000000000000000000000000000000000000000000000000000000', 0, '2026-09-09T00:00:00.000Z');

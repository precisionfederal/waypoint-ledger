-- 0007 — public annotations on chained rows: our own test answers, marked, never deleted.
--
-- The register's tables are append-only and chained (0002): deleting a test answer
-- would move every later hash and break the chain a stranger checks. So a row we
-- wrote ourselves while testing the form is not removed; it is MARKED here, by its
-- row_hash, and every published count leaves it out and says how many it left out
-- ("teamTests"). The CSV exports carry a team_test column, so anyone holding the
-- file sees exactly which rows were ours.
--
-- An annotation never touches the row it marks: the row, its hash and the chain are
-- exactly as written, and /api/integrity?verify=1 still walks every row.
--
-- Annotations are append-only like the rows they mark: the two triggers refuse
-- every UPDATE and DELETE, and (table_name, row_hash, kind) is unique, so a row is
-- marked once. Written only by POST /api/admin/annotations (Bearer ADMIN_TOKEN).
-- Never edit this file after it is applied; add 0008_*.sql.

CREATE TABLE IF NOT EXISTS annotations (
  id         TEXT PRIMARY KEY,
  table_name TEXT NOT NULL CHECK (table_name IN ('corrections', 'gap_reports', 'survey_responses', 'interviews')),
  row_hash   TEXT NOT NULL CHECK (length(row_hash) = 64),
  kind       TEXT NOT NULL CHECK (kind IN ('team-test')),
  note       TEXT,
  at         TEXT NOT NULL,
  UNIQUE (table_name, row_hash, kind)
);
CREATE INDEX IF NOT EXISTS idx_annotations_table ON annotations(table_name, kind);

CREATE TRIGGER IF NOT EXISTS annotations_no_update BEFORE UPDATE ON annotations
BEGIN SELECT RAISE(ABORT, 'annotations are append-only'); END;
CREATE TRIGGER IF NOT EXISTS annotations_no_delete BEFORE DELETE ON annotations
BEGIN SELECT RAISE(ABORT, 'annotations are append-only'); END;

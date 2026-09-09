-- 0006 — the register's read path stops depending on how big the register is,
-- and the write path can be proven without a row in it.
--
-- `agg` holds ONE materialised aggregate per kind, computed by the same pure
-- function the API has always used (aggregateCorrections, aggregateGap,
-- aggregateSurvey, summarizeInterviews) — there is no second implementation to
-- drift. `rows_folded` records how many source rows went into it, so a read can
-- prove the cache is current, and never serve a stale number. The fingerprint is
-- the row count AND the chain head: an append moves the head, a delete moves the
-- count, and a delete followed by an append moves both. If either differs from
-- the cached pair, the rows are folded again and the cache is replaced.
--
-- `canary` exists so POST /api/health can prove D1 accepts a write. It is
-- outside every integrity chain, every CSV export and every aggregate, and its
-- rows are deleted in the same transaction that writes them.

CREATE TABLE IF NOT EXISTS agg (
  kind         TEXT PRIMARY KEY,
  rows_folded  INTEGER NOT NULL DEFAULT 0,
  head_hash    TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canary (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL
);

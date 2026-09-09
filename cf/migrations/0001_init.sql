-- Waypoint Ledger D1 schema. The one definition. Add 0002_*.sql for changes; never edit this file after it is applied.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL, display_name TEXT
);
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL, counter INTEGER NOT NULL DEFAULT 0, transports TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credentials_user ON credentials(user_id);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS journeys (
  id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  share_slug TEXT UNIQUE, title TEXT, entries_json TEXT NOT NULL, table_version TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journeys_user ON journeys(user_id, updated_at);
CREATE TABLE IF NOT EXISTS corrections (
  id TEXT PRIMARY KEY, price_id TEXT NOT NULL, verdict TEXT NOT NULL CHECK (verdict IN ('right','wrong')),
  believed_usd REAL, note TEXT, table_version TEXT, journey_id TEXT, received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_corrections_price ON corrections(price_id);
CREATE TABLE IF NOT EXISTS gap_reports (
  id TEXT PRIMARY KEY, counts_json TEXT NOT NULL, ranking_json TEXT NOT NULL, note TEXT, context_json TEXT,
  table_version TEXT, received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS survey_responses (
  id TEXT PRIMARY KEY, ranking_json TEXT NOT NULL, unasked TEXT NOT NULL, lead TEXT NOT NULL, decide TEXT NOT NULL,
  clinicians INTEGER, context_json TEXT, sentence_enc TEXT, channel TEXT NOT NULL DEFAULT 'direct',
  survey_version TEXT, received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_survey_channel ON survey_responses(channel);
CREATE TABLE IF NOT EXISTS interviews (
  id TEXT PRIMARY KEY, consent TEXT NOT NULL CHECK (consent IN ('notes','quote-anonymously','quote-by-name')),
  name_enc TEXT, answers_enc TEXT NOT NULL, follow_up INTEGER NOT NULL DEFAULT 0, email_enc TEXT,
  channel TEXT NOT NULL DEFAULT 'direct', received_at TEXT NOT NULL, reviewed_at TEXT
);
CREATE TABLE IF NOT EXISTS changes (
  id TEXT PRIMARY KEY, date TEXT NOT NULL, said TEXT NOT NULL, changed TEXT NOT NULL, who TEXT NOT NULL,
  source_interview_id TEXT, published INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  day TEXT NOT NULL, name TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, name)
);

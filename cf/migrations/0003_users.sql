-- 0003_users — an account a person recognises: email and password beside the passkey,
-- and the option to see what they themselves have sent us.
--
-- Everything here is optional and nullable. An anonymous visitor still prices a journey,
-- sends a correction and answers the survey with no row in any of these tables, and a
-- passkey account still has no email address and no password.
--
-- SQLite has no ADD COLUMN ... UNIQUE, so the address is made unique by an index.
-- The partial index is on lower-cased addresses only because every write path
-- normalises the address before it stores it (cf/functions/api/auth/password/_password.js).

ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_salt TEXT;
ALTER TABLE users ADD COLUMN recovery_hash TEXT;
ALTER TABLE users ADD COLUMN updated_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- What a signed-in person sent, so the site can show it back to them ("what I've told
-- the government"). NULL for every anonymous send, which is the default and always will be:
-- these columns are written only when a session cookie is present at the moment of the write.
-- They are never returned by the public endpoints; only /api/me/* reads them.
ALTER TABLE corrections ADD COLUMN user_id TEXT;
ALTER TABLE gap_reports ADD COLUMN user_id TEXT;
ALTER TABLE survey_responses ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_corrections_user ON corrections(user_id, received_at);
CREATE INDEX IF NOT EXISTS idx_gap_user ON gap_reports(user_id, received_at);
CREATE INDEX IF NOT EXISTS idx_survey_user ON survey_responses(user_id, received_at);

-- 0004_journey_privacy — a person who saved a ledger without an account can remove it.
--
-- Before this migration, DELETE /api/journeys/{id} required a session, so the anonymous
-- majority — the people the whole product is designed around — could save a ledger and
-- then had no way on earth to take it back. The privacy page promised deletion from
-- /account; there is no /account for someone who never made one.
--
-- delete_hash: the SHA-256 of a 16-character code handed back once by POST /api/journeys
-- and never stored in readable form, so a copy of this database does not let anyone
-- delete other people's saves, and we cannot recover the code for anyone either.
--
-- expires_at: an anonymous save is kept for 180 days and then stops opening. An account
-- save has no expiry, which is the honest reason to make an account. A row past its date
-- is deleted the next time its link is asked for, so it does not sit here for ever.
ALTER TABLE journeys ADD COLUMN delete_hash TEXT;
ALTER TABLE journeys ADD COLUMN expires_at TEXT;
CREATE INDEX IF NOT EXISTS idx_journeys_expires ON journeys(expires_at);

/* GENERATED FILE — do not edit by hand. Written by scripts/gen-privacy.mjs.
 *
 * Every row below is read from cf/migrations/*.sql, from the write-path validators as they
 * actually run, from PUBLISHED in cf/functions/api/_hash.js and from exportRows() in
 * cf/functions/api/export/[kind].js. Change the database, run the generator; the page follows.
 * A column with no line in data/column-glossary.json fails the build (cf/build-static.sh).
 */
export interface PrivacyField { column: string; gloss: string; kept: string; encrypted: string; published: boolean; exported: boolean; since: string }
export interface PrivacyAccepts { field: string; column: string }
export interface PrivacyEndpoint { id: string; method: string; path: string; table: string; handler: string; what: string; publicly: string; fields: PrivacyField[]; accepts: PrivacyAccepts[]; notes: string[] }

export const PRIVACY_GENERATED_ON = "2026-09-10";
export const PRIVACY_MIGRATIONS = ["0001_init.sql","0002_integrity.sql","0003_users.sql","0004_journey_privacy.sql","0006_agg.sql"];
export const PRIVACY_SCHEMA_FINGERPRINT = "892edf4dbbb8";
export const PRIVACY_COLUMN_COUNT = 97;
export const PRIVACY_TABLE_COUNT = 13;
export const PRIVACY_ENDPOINTS: PrivacyEndpoint[] = [
 {
  "id": "corrections",
  "method": "POST",
  "path": "/api/corrections",
  "table": "corrections",
  "handler": "cf/functions/api/corrections.js",
  "what": "You mark a published federal figure right or wrong.",
  "publicly": "The count for each figure is public at /api/corrections and every published field is in the CSV. Your note is not.",
  "fields": [
   {
    "column": "id",
    "gloss": "A random row number for the correction.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "price_id",
    "gloss": "Which published federal figure you marked. The row is about a figure, not about you.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "verdict",
    "gloss": "Right or wrong, as you pressed it.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "believed_usd",
    "gloss": "The amount you said you actually paid, if you chose to give one.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "note",
    "gloss": "What you typed in the box, if you typed anything. It is never published, never exported and never served by any endpoint.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "table_version",
    "gloss": "Which version of the price table the figure came from when you marked it.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "journey_id",
    "gloss": "A saved-ledger identifier, only if whoever called the API supplied one. This site never sends it, so it is blank on every row this app has written.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "received_at",
    "gloss": "When it arrived.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "prev_hash",
    "gloss": "The hash of the row before yours. This is what makes the public count tamper-evident.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0002_integrity.sql"
   },
   {
    "column": "row_hash",
    "gloss": "The hash of the published fields of your row, chained to the row before it.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0002_integrity.sql"
   },
   {
    "column": "submitter_hash",
    "gloss": "A one-way hash of a random identifier your browser keeps to itself, mixed with this one figure. It refuses a second thumb on the same figure and cannot be joined to your answer on any other figure.",
    "kept": "only when it applies",
    "encrypted": "one-way hash",
    "published": false,
    "exported": false,
    "since": "0002_integrity.sql"
   },
   {
    "column": "user_id",
    "gloss": "The account that sent it, and only if you were signed in, so the site can show you what you have sent. Blank on every anonymous send. Deleting your account clears it and leaves the correction counted.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0003_users.sql"
   }
  ],
  "accepts": [
   {
    "field": "priceId",
    "column": "price_id"
   },
   {
    "field": "verdict",
    "column": "verdict"
   },
   {
    "field": "note",
    "column": "note"
   },
   {
    "field": "believedValueUsd",
    "column": "believed_usd"
   },
   {
    "field": "priceTableVersion",
    "column": "table_version"
   },
   {
    "field": "journeyId",
    "column": "journey_id"
   },
   {
    "field": "submitterId",
    "column": "submitter_hash"
   },
   {
    "field": "receivedAt",
    "column": "received_at"
   }
  ],
  "notes": []
 },
 {
  "id": "gap",
  "method": "POST",
  "path": "/api/gap",
  "table": "gap_reports",
  "handler": "cf/functions/api/gap.js",
  "what": "You report care you needed and did not get.",
  "publicly": "The counts and the ranking are public at /api/gap and in the CSV. Your note is not.",
  "fields": [
   {
    "column": "id",
    "gloss": "A random row number for the report.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "counts_json",
    "gloss": "The counts you entered for care you needed and did not get, by category.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "ranking_json",
    "gloss": "Your ranking of which of those weighed most.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "note",
    "gloss": "An optional note in your own words. Never published, never exported.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "context_json",
    "gloss": "The optional age band, insurance type, region and urbanicity you chose to give. Blank unless you chose them.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "table_version",
    "gloss": "Which version of the price table was live when you sent it.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "received_at",
    "gloss": "When it arrived.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "prev_hash",
    "gloss": "The hash of the row before yours.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0002_integrity.sql"
   },
   {
    "column": "row_hash",
    "gloss": "The hash of the published fields of your row.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0002_integrity.sql"
   },
   {
    "column": "user_id",
    "gloss": "The account that sent it, only if you were signed in. Blank on every anonymous send.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0003_users.sql"
   }
  ],
  "accepts": [
   {
    "field": "counts",
    "column": "counts_json"
   },
   {
    "field": "ranking",
    "column": "ranking_json"
   },
   {
    "field": "note",
    "column": "note"
   },
   {
    "field": "context",
    "column": "context_json"
   },
   {
    "field": "receivedAt",
    "column": "received_at"
   },
   {
    "field": "tableVersion",
    "column": "table_version"
   }
  ],
  "notes": []
 },
 {
  "id": "survey",
  "method": "POST",
  "path": "/api/survey",
  "table": "survey_responses",
  "handler": "cf/functions/api/survey.js",
  "what": "You rank which burden weighed most.",
  "publicly": "The counts are public at /api/survey and in the CSV. Your sentence is not, and a cell too small to be safe is withheld.",
  "fields": [
   {
    "column": "id",
    "gloss": "A random row number for the response.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "ranking_json",
    "gloss": "Your ranking of the five burdens, heaviest first.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "unasked",
    "gloss": "Which burden you said nobody ever asked you about.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "lead",
    "gloss": "Which burden you said a tool should lead with.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "decide",
    "gloss": "Who you said should decide how burdens are weighed.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "clinicians",
    "gloss": "How many clinicians you saw before a diagnosis, if you gave a number.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "context_json",
    "gloss": "The optional age band, coverage, region, state and stage you chose to give. Blank unless you chose them, and a count too small to be safe is withheld from the published table.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "sentence_enc",
    "gloss": "One optional sentence in your own words, encrypted with a key kept outside this database. No endpoint serves it and no export carries it; only the number of sentences held is public.",
    "kept": "only when it applies",
    "encrypted": "encrypted at rest",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "channel",
    "gloss": "The slug on the link you arrived through, so the sample can be described honestly as what it is.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "survey_version",
    "gloss": "Which version of the instrument you answered.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "received_at",
    "gloss": "When it arrived.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0001_init.sql"
   },
   {
    "column": "prev_hash",
    "gloss": "The hash of the row before yours.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0002_integrity.sql"
   },
   {
    "column": "row_hash",
    "gloss": "The hash of the published fields of your row.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": true,
    "exported": true,
    "since": "0002_integrity.sql"
   },
   {
    "column": "user_id",
    "gloss": "The account that sent it, only if you were signed in. Blank on every anonymous send.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0003_users.sql"
   }
  ],
  "accepts": [
   {
    "field": "ranking",
    "column": "ranking_json"
   },
   {
    "field": "unasked",
    "column": "unasked"
   },
   {
    "field": "lead",
    "column": "lead"
   },
   {
    "field": "decide",
    "column": "decide"
   },
   {
    "field": "clinicians",
    "column": "clinicians"
   },
   {
    "field": "context",
    "column": "context_json"
   },
   {
    "field": "sentence",
    "column": "sentence_enc"
   },
   {
    "field": "channel",
    "column": "channel"
   },
   {
    "field": "surveyVersion",
    "column": "survey_version"
   },
   {
    "field": "receivedAt",
    "column": "received_at"
   }
  ],
  "notes": []
 },
 {
  "id": "interview",
  "method": "POST",
  "path": "/api/interview",
  "table": "interviews",
  "handler": "cf/functions/api/interview.js",
  "what": "You write out your own story in the interview form.",
  "publicly": "Only the number of interviews, their dates and how many people chose each consent are public. Nothing you wrote is served by any endpoint or carried by any export.",
  "fields": [
   {
    "column": "id",
    "gloss": "A random row number for the interview.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "consent",
    "gloss": "How you said your writing may be used: notes only, quote anonymously, or quote by name.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "name_enc",
    "gloss": "The name you asked to be quoted under, encrypted at rest. Stored only if you chose to be quoted by name.",
    "kept": "only when it applies",
    "encrypted": "encrypted at rest",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "answers_enc",
    "gloss": "Everything you wrote, encrypted at rest with a key kept outside this database. No endpoint serves it and no export contains it.",
    "kept": "always",
    "encrypted": "encrypted at rest",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "follow_up",
    "gloss": "Whether you ticked the box asking to hear when there is a new version.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "email_enc",
    "gloss": "Your address, encrypted at rest, kept only if you ticked that box, and used for nothing else.",
    "kept": "only when it applies",
    "encrypted": "encrypted at rest",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "channel",
    "gloss": "The slug on the link you arrived through.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "received_at",
    "gloss": "When it arrived.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "reviewed_at",
    "gloss": "When we read it.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "prev_hash",
    "gloss": "The hash of the row before yours, over the four facts we publish about an interview and nothing you wrote.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0002_integrity.sql"
   },
   {
    "column": "row_hash",
    "gloss": "The hash of those four facts: that an interview arrived, when, under which consent, through which channel.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0002_integrity.sql"
   }
  ],
  "accepts": [
   {
    "field": "consent",
    "column": "consent"
   },
   {
    "field": "name",
    "column": "name_enc"
   },
   {
    "field": "answers",
    "column": "answers_enc"
   },
   {
    "field": "followUp",
    "column": "follow_up"
   },
   {
    "field": "email",
    "column": "email_enc"
   },
   {
    "field": "channel",
    "column": "channel"
   },
   {
    "field": "receivedAt",
    "column": "received_at"
   }
  ],
  "notes": []
 },
 {
  "id": "journeys",
  "method": "POST",
  "path": "/api/journeys",
  "table": "journeys",
  "handler": "cf/functions/api/journeys.js",
  "what": "You press Save on a ledger to get a link to it.",
  "publicly": "Nothing here is public. A saved ledger opens for whoever holds its link, and for nobody else.",
  "fields": [
   {
    "column": "id",
    "gloss": "A random identifier for a ledger you pressed Save on.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "user_id",
    "gloss": "The account that saved it, if you were signed in. Blank for an anonymous save, which is the default.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "share_slug",
    "gloss": "The short code in the link you got back. Anyone holding that link can open the ledger, so treat it as the ledger itself.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "title",
    "gloss": "The title you typed for the saved ledger, if you typed one.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "entries_json",
    "gloss": "The units of care, their counts and the short phrases you typed for each line. This is the one place your own words are kept, and only because you pressed Save.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "table_version",
    "gloss": "Which version of the price table the ledger was priced against, so the figures can be reproduced later.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "created_at",
    "gloss": "When it was saved.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "updated_at",
    "gloss": "When it was last changed.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "delete_hash",
    "gloss": "A one-way hash of the delete code you were shown once. It cannot be turned back into the code, so the save can be removed by you and not by us.",
    "kept": "only when it applies",
    "encrypted": "one-way hash",
    "published": false,
    "exported": false,
    "since": "0004_journey_privacy.sql"
   },
   {
    "column": "expires_at",
    "gloss": "When an anonymous save stops opening: 180 days from saving. A save on an account has no expiry.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0004_journey_privacy.sql"
   }
  ],
  "accepts": [
   {
    "field": "entries",
    "column": "entries_json"
   },
   {
    "field": "title",
    "column": "title"
   }
  ],
  "notes": []
 },
 {
  "id": "account",
  "method": "POST",
  "path": "/api/auth/password/signup",
  "table": "users",
  "handler": "cf/functions/api/auth/password/signup.js",
  "what": "You make an optional account so a ledger follows you between devices.",
  "publicly": "Nothing about an account is public, ever.",
  "fields": [
   {
    "column": "id",
    "gloss": "A random account number. Nothing about you is derived from it and nothing about you is stored in it.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "created_at",
    "gloss": "When the account was made.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "display_name",
    "gloss": "A name you typed for yourself, if you chose one. It is never shown to anyone else.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "email",
    "gloss": "The address you signed up with, if you chose an address rather than a passkey. No mail is ever sent to it.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0003_users.sql"
   },
   {
    "column": "password_hash",
    "gloss": "A scrambled form of your password that cannot be turned back into it.",
    "kept": "only when it applies",
    "encrypted": "one-way hash",
    "published": false,
    "exported": false,
    "since": "0003_users.sql"
   },
   {
    "column": "password_salt",
    "gloss": "Random bytes mixed into that scrambling, so two people who chose the same password do not look the same here.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0003_users.sql"
   },
   {
    "column": "recovery_hash",
    "gloss": "A scrambled form of your ten-word recovery code. We keep no readable copy, so we cannot use it and cannot recover it for you.",
    "kept": "only when it applies",
    "encrypted": "one-way hash",
    "published": false,
    "exported": false,
    "since": "0003_users.sql"
   },
   {
    "column": "updated_at",
    "gloss": "When the account was last changed.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0003_users.sql"
   }
  ],
  "accepts": [],
  "notes": []
 },
 {
  "id": "passkey",
  "method": "POST",
  "path": "/api/auth/register/verify",
  "table": "credentials",
  "handler": "cf/functions/api/auth/register/verify.js",
  "what": "You add a passkey to that account.",
  "publicly": "Nothing here is public.",
  "fields": [
   {
    "column": "id",
    "gloss": "The identifier your passkey handed us when you added it.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "user_id",
    "gloss": "Which account the passkey belongs to.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "public_key",
    "gloss": "The public half of your passkey. It can check a signature and nothing else; it cannot unlock anything, here or anywhere.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "counter",
    "gloss": "A number your passkey increases each time it is used, which is how a cloned key is caught.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "transports",
    "gloss": "How the key was presented, as your browser reported it: this device, a USB key, a phone.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "created_at",
    "gloss": "When the passkey was added.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   }
  ],
  "accepts": [],
  "notes": []
 },
 {
  "id": "session",
  "method": "POST",
  "path": "/api/auth/password/login",
  "table": "sessions",
  "handler": "cf/functions/api/auth/password/login.js",
  "what": "You sign in, and the browser holds one cookie until you sign out.",
  "publicly": "Nothing here is public.",
  "fields": [
   {
    "column": "id",
    "gloss": "The random value in the one cookie you get after signing in. It says nothing about you.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "user_id",
    "gloss": "Which account that cookie signs in.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "created_at",
    "gloss": "When you signed in.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "expires_at",
    "gloss": "When the cookie stops working. Signing out deletes the row before then.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   }
  ],
  "accepts": [],
  "notes": []
 },
 {
  "id": "changes",
  "method": "POST",
  "path": "/api/admin/changes",
  "table": "changes",
  "handler": "cf/functions/api/admin/changes.js",
  "what": "We publish \"someone said this, so we changed that\" on the register. Written by us, not by you.",
  "publicly": "The date, what was said, what changed and who is credited are shown on /register. Which interview it came from is not.",
  "fields": [
   {
    "column": "id",
    "gloss": "A row number for a change we made because someone told us something.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "date",
    "gloss": "The date we made the change.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "said",
    "gloss": "What a person told us, written in the form they consented to.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "changed",
    "gloss": "What we changed in the product because of it.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "who",
    "gloss": "Who is credited. Anonymous unless the person asked to be named.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "source_interview_id",
    "gloss": "Which interview it came from, so we can find it again. Never published.",
    "kept": "only when it applies",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "published",
    "gloss": "Whether the entry is shown on the public register.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "created_at",
    "gloss": "When the entry was written.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   }
  ],
  "accepts": [],
  "notes": []
 },
 {
  "id": "events",
  "method": "—",
  "path": "every request",
  "table": "events",
  "handler": "cf/functions/api/_http.js",
  "what": "A daily count of how many times each endpoint was called. One number per day, nothing about who.",
  "publicly": "These totals are not public. They are a daily count with nothing about anyone in them.",
  "fields": [
   {
    "column": "day",
    "gloss": "The date the count belongs to. Nothing else about that day is kept.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "name",
    "gloss": "Which endpoint was called, by its name: corrections, gap, survey, price.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   },
   {
    "column": "count",
    "gloss": "How many times it was called that day, across everyone. There is no row per person, no address and no session in this table.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0001_init.sql"
   }
  ],
  "accepts": [],
  "notes": []
 },
 {
  "id": "agg",
  "method": "—",
  "path": "every accepted row",
  "table": "agg",
  "handler": "cf/functions/api/_counters.js",
  "what": "Nobody sends this. It is the register's own public totals, kept ready so the page reads as fast at a hundred thousand rows as at ten.",
  "publicly": "These are the same counts the register already serves. The table is a cache of them and holds nothing else.",
  "fields": [
   {
    "column": "kind",
    "gloss": "Which register the cached total belongs to.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0006_agg.sql"
   },
   {
    "column": "rows_folded",
    "gloss": "How many rows went into that total, so a total that has fallen behind is spotted and recomputed rather than served.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0006_agg.sql"
   },
   {
    "column": "head_hash",
    "gloss": "The head of the integrity chain the cached total was folded from, so a total can be checked against the register it claims to describe.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0006_agg.sql"
   },
   {
    "column": "payload_json",
    "gloss": "The public totals themselves, exactly as the register already serves them. Counts, never a person.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0006_agg.sql"
   },
   {
    "column": "updated_at",
    "gloss": "When the total was last recomputed.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0006_agg.sql"
   }
  ],
  "accepts": [],
  "notes": []
 },
 {
  "id": "canary",
  "method": "POST",
  "path": "/api/health",
  "table": "canary",
  "handler": "cf/functions/api/health.js",
  "what": "Nobody sends this either. We write one row and delete it in the same breath, to prove the database is accepting writes.",
  "publicly": "Nothing here is public, and nothing here comes from anyone using the site.",
  "fields": [
   {
    "column": "id",
    "gloss": "A random row we write and delete in the same breath to prove the database still accepts writes. It holds nothing else.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0006_agg.sql"
   },
   {
    "column": "at",
    "gloss": "The moment of that test write.",
    "kept": "always",
    "encrypted": "no",
    "published": false,
    "exported": false,
    "since": "0006_agg.sql"
   }
  ],
  "accepts": [],
  "notes": []
 },
 {
  "id": "integrity_heads",
  "method": "—",
  "path": "every accepted row",
  "table": "integrity_heads",
  "handler": "cf/functions/api/_hash.js",
  "what": "The head of each tamper-evidence chain, so an outsider can check the register was not edited.",
  "publicly": "Every head is public at /api/integrity. Publishing it is the whole point: it is what an outsider recomputes to check we did not edit the register.",
  "fields": [
   {
    "column": "table_name",
    "gloss": "Which register the head belongs to.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0002_integrity.sql"
   },
   {
    "column": "head_hash",
    "gloss": "The hash of the newest row, which is the number anyone can recompute for themselves from the published CSV.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0002_integrity.sql"
   },
   {
    "column": "row_count",
    "gloss": "How many rows that register holds.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0002_integrity.sql"
   },
   {
    "column": "updated_at",
    "gloss": "When the head last moved.",
    "kept": "always",
    "encrypted": "no",
    "published": true,
    "exported": false,
    "since": "0002_integrity.sql"
   }
  ],
  "accepts": [],
  "notes": []
 }
];

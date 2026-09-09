#!/bin/bash
# ==========================================================================
# backup-d1.sh — a copy of the system of record, kept off the repo, and proven
# by its own numbers before it is called a backup.
#
# D1 is the only place a correction, a gap report, a survey answer or an
# interview lives. The static export can be rebuilt from git in four minutes;
# a row somebody typed cannot be rebuilt at all. So this runs daily under
# launchd (com.precisionfederal.waypoint-backup) and does four things:
#
#   1  reads /api/health BEFORE the export, and remembers the row counts
#   2  wrangler d1 export --remote          (READ-ONLY on the live database)
#   3  reads /api/health AFTER, and requires every table's row count in the
#      dump to sit between the two readings — a dump taken while a person was
#      typing is allowed to be one row behind or ahead, and nothing else is
#   4  requires every register table to appear as a CREATE TABLE in the file
#
# A backup nobody has restored is a file, not a backup. scripts/restore-d1.sh
# is the other half, and docs/RUNBOOK.md says when to run it.
#
# The file lands in ~/Library/Application Support/precision-federal/
# waypoint-backups/ — never inside the repo, because the dump carries every
# encrypted interview blob and the repo is exported publicly.
#
#   bash scripts/backup-d1.sh              the daily backup, from live D1
#   npm run backup                         the same thing
#   bash scripts/backup-d1.sh --local --state ops3 --origin http://127.0.0.1:8841
#                                          the same code path against a local
#                                          database, which is how the row-count
#                                          arithmetic gets exercised on rows
#                                          without writing a row to production
#
# Exit 0 only when every check above passed. On a failure the file is KEPT
# (a suspect dump is evidence) and the exit code is 1.
# ==========================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="waypoint-ledger"
ORIGIN="${BACKUP_ORIGIN:-https://waypoint-ledger.pages.dev}"
DIR="${WAYPOINT_BACKUP_DIR:-$HOME/Library/Application Support/precision-federal/waypoint-backups}"
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}"
MODE=remote
STATE_NAME=""

while [ $# -gt 0 ]; do
  case "$1" in
    --local)  MODE=local; shift ;;
    --state)  STATE_NAME="$2"; shift 2 ;;
    --origin) ORIGIN="${2%/}"; shift 2 ;;
    --dir)    DIR="$2"; shift 2 ;;
    --retain) RETAIN_DAYS="$2"; shift 2 ;;
    *) printf 'backup-d1: unknown argument %s\n' "$1" >&2; exit 2 ;;
  esac
done
[ "$MODE" = "local" ] && [ -z "$STATE_NAME" ] && { printf 'backup-d1: --local needs --state NAME\n' >&2; exit 2; }

# The six tables a person's typing lands in, health key -> SQL table name.
# health.tables uses short keys; the dump uses the real table names.
HEALTH_KEYS=(corrections gap survey interviews changes journeys)
SQL_TABLES=(corrections gap_reports survey_responses interviews changes journeys)

FAIL=0
PASS=0
ok()   { PASS=$((PASS+1)); printf '  ok    %s\n' "$*"; }
fail() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n' "$*"; }
say()  { printf '%s\n' "$*"; }

command -v jq >/dev/null 2>&1 || { say "backup-d1: jq is required"; exit 2; }

TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
mkdir -p "$DIR" || { say "backup-d1: cannot create $DIR"; exit 2; }
chmod 700 "$DIR" 2>/dev/null
FILE="$DIR/$TS.sql"
META="$DIR/$TS.json"

say "backup-d1: $PROJECT ($MODE) -> $FILE"

# --------------------------------------------------------------------------
# 1  the counts before
BEFORE="$(curl -sS -m 25 "$ORIGIN/api/health" 2>/dev/null)"
BEFORE_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if ! printf '%s' "$BEFORE" | jq -e '.ok == true' >/dev/null 2>&1; then
  fail "/api/health did not answer ok:true before the export — backing up anyway, counts cannot be checked"
  BEFORE=''
else
  ok "/api/health before: $(printf '%s' "$BEFORE" | jq -c '.tables')"
fi
LIVE_COMMIT="$(printf '%s' "$BEFORE" | jq -r '.build.fullCommit // "unknown"' 2>/dev/null)"

# --------------------------------------------------------------------------
# 2  the export. READ-ONLY: `d1 export` runs a SELECT and writes a file.
if [ "$MODE" = "local" ]; then
  ( cd "$ROOT/cf" && npx --no-install wrangler d1 export "$PROJECT" --local --persist-to "$ROOT/cf/.wrangler/state-$STATE_NAME" --output "$FILE" ) >"$DIR/.$TS.export.log" 2>&1
else
  ( cd "$ROOT/cf" && npx --no-install wrangler d1 export "$PROJECT" --remote --output "$FILE" ) >"$DIR/.$TS.export.log" 2>&1
fi
RC=$?
if [ "$RC" -ne 0 ] || [ ! -s "$FILE" ]; then
  fail "wrangler d1 export failed (exit $RC)"
  tail -12 "$DIR/.$TS.export.log" | sed 's/^/      /'
  rm -f "$DIR/.$TS.export.log"
  exit 1
fi
rm -f "$DIR/.$TS.export.log"
chmod 600 "$FILE"
BYTES="$(wc -c <"$FILE" | tr -d ' ')"
ok "exported $BYTES bytes"

# 3  the counts after
AFTER="$(curl -sS -m 25 "$ORIGIN/api/health" 2>/dev/null)"
AFTER_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '%s' "$AFTER" | jq -e '.ok == true' >/dev/null 2>&1 || AFTER=''

# --------------------------------------------------------------------------
# 4  the schema is in the file
TABLES_IN_FILE="$(grep -c 'CREATE TABLE' "$FILE")"
[ "$TABLES_IN_FILE" -ge 6 ] && ok "$TABLES_IN_FILE CREATE TABLE statements" || fail "only $TABLES_IN_FILE CREATE TABLE statements in the dump"
for t in "${SQL_TABLES[@]}"; do
  if grep -qE "CREATE TABLE \"?$t\"? " "$FILE"; then ok "schema: $t"; else fail "the dump has no CREATE TABLE for $t"; fi
done

# --------------------------------------------------------------------------
# 5  the row counts. A dump is taken over a live database, so a table may gain
#    (or, for journeys, lose) a row while it runs. The honest rule is a
#    sandwich: the dump must sit between the reading before and the reading
#    after. Equal readings mean the dump must match them exactly.
COUNTS_JSON='{}'
i=0
for key in "${HEALTH_KEYS[@]}"; do
  t="${SQL_TABLES[$i]}"; i=$((i+1))
  n="$(grep -c "^INSERT INTO \"$t\" " "$FILE")"
  COUNTS_JSON="$(printf '%s' "$COUNTS_JSON" | jq --arg t "$t" --argjson n "$n" '. + {($t): $n}')"
  if [ -z "$BEFORE" ] || [ -z "$AFTER" ]; then
    say "  skip  $t: $n rows in the dump (health was unreadable, so nothing to compare)"
    continue
  fi
  b="$(printf '%s' "$BEFORE" | jq -r --arg k "$key" '.tables[$k] // 0')"
  a="$(printf '%s' "$AFTER"  | jq -r --arg k "$key" '.tables[$k] // 0')"
  lo=$b; hi=$b
  [ "$a" -lt "$lo" ] && lo=$a
  [ "$a" -gt "$hi" ] && hi=$a
  if [ "$n" -ge "$lo" ] && [ "$n" -le "$hi" ]; then
    ok "$t: $n rows, live said $b before / $a after"
  else
    fail "$t: $n rows in the dump, live said $b before and $a after"
  fi
done

# --------------------------------------------------------------------------
# 6  the sidecar. restore-d1.sh reads it to prove the restored copy carries the
#    same rows, so the two halves never disagree about what was in the file.
SHA="$(shasum -a 256 "$FILE" | awk '{print $1}')"
jq -n --arg file "$(basename "$FILE")" --arg at "$TS" --arg sha "$SHA" \
      --argjson bytes "$BYTES" --argjson tables "$TABLES_IN_FILE" \
      --argjson counts "$COUNTS_JSON" --arg commit "$LIVE_COMMIT" \
      --arg beforeAt "$BEFORE_AT" --arg afterAt "$AFTER_AT" --argjson failures "$FAIL" \
      --arg mode "$MODE" --arg origin "$ORIGIN" \
  '{file:$file, takenAt:$at, source:$mode, origin:$origin, sha256:$sha, bytes:$bytes, createTableCount:$tables,
    rowCounts:$counts, liveCommit:$commit, healthReadAt:{before:$beforeAt, after:$afterAt},
    failures:$failures}' > "$META"
chmod 600 "$META"
ok "sidecar $META"

# --------------------------------------------------------------------------
# 7  retention: 30 days of dailies. -maxdepth 1 so this can never walk anything
#    but the backup folder itself.
GONE="$(find "$DIR" -maxdepth 1 -type f \( -name '*.sql' -o -name '*.json' \) -mtime +"$RETAIN_DAYS" -print -delete 2>/dev/null | wc -l | tr -d ' ')"
say "  kept $RETAIN_DAYS days; removed $GONE file(s) older than that"

KEPT="$(find "$DIR" -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')"
say ""
say "$PASS ok, $FAIL failed  ·  $KEPT backup(s) on disk  ·  $FILE"
[ "$FAIL" -eq 0 ] || exit 1

#!/bin/bash
# ==========================================================================
# restore-d1.sh — the other half of the backup, and the only thing that turns
# a .sql file into a backup.
#
# It never touches the live database. It builds a throwaway local D1 out of the
# dump, stands the real stack on top of it, and then asks that stack the same
# questions the live gate asks the origin. If the site runs on the restored
# copy and the row counts match the ones recorded when the dump was taken, the
# backup is proven. If it does not, we found out on a Tuesday instead of on the
# day we needed it.
#
#   bash scripts/restore-d1.sh <file.sql>            prove a backup
#   bash scripts/restore-d1.sh --latest              prove the newest one
#   bash scripts/restore-d1.sh <file> --keep         leave the server running
#   npm run restore:local -- --latest
#
# Options: --port N (default 8841) · --state NAME (cf/.wrangler/state-NAME)
#          --out DIR (a built static export; defaults to the newest of
#          cf/out-ops3, cf/out)
#
# There is no --remote and there never will be: a restore onto the live
# database is a decision a person makes in front of the dashboard, with the
# steps written out in docs/RUNBOOK.md, not a flag on a script.
# ==========================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="waypoint-ledger"
DB_ID="3c6cf7a7-e060-48fd-9e1f-646eb89ad461"
DIR="${WAYPOINT_BACKUP_DIR:-$HOME/Library/Application Support/precision-federal/waypoint-backups}"
PORT=8841
STATE_NAME="restore"
OUT=""
KEEP=0
FILE=""
DEV_PID=""

while [ $# -gt 0 ]; do
  case "$1" in
    --latest) FILE="$(find "$DIR" -maxdepth 1 -type f -name '*.sql' | sort | tail -1)"; shift ;;
    --port)   PORT="$2"; shift 2 ;;
    --state)  STATE_NAME="$2"; shift 2 ;;
    --out)    OUT="$2"; shift 2 ;;
    --keep)   KEEP=1; shift ;;
    --remote) printf 'restore-d1: there is no --remote. A restore onto the live database is in docs/RUNBOOK.md.\n' >&2; exit 2 ;;
    -*)       printf 'restore-d1: unknown option %s\n' "$1" >&2; exit 2 ;;
    *)        FILE="$1"; shift ;;
  esac
done

FAIL=0; PASS=0
ok()   { PASS=$((PASS+1)); printf '  ok    %s\n' "$*"; }
fail() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n' "$*"; }
say()  { printf '%s\n' "$*"; }

cleanup() {
  if [ -n "$DEV_PID" ] && kill -0 "$DEV_PID" 2>/dev/null; then kill "$DEV_PID" 2>/dev/null; wait "$DEV_PID" 2>/dev/null; fi
  DEV_PID=""
  # `wrangler pages dev` runs the worker in a workerd CHILD process, and killing
  # the parent leaves that child holding the port. Measured 2026-09-09: the next
  # run refused to start because pid 94700 was still on 8841 twenty minutes after
  # its wrangler had gone. Only this script's own port is ever touched, and only
  # by the pid that is listening on it — never by a name pattern.
  local held
  held="$(lsof -ti "tcp:$PORT" 2>/dev/null)"
  if [ -n "$held" ]; then kill $held 2>/dev/null; sleep 1; fi
  rm -f "/tmp/wl-restore-$PORT.pid"
}
trap cleanup EXIT INT TERM

[ -n "$FILE" ] || { say "usage: restore-d1.sh <file.sql> | --latest  [--port N] [--state NAME] [--out DIR] [--keep]"; exit 2; }
[ -s "$FILE" ] || { say "restore-d1: no such backup: $FILE"; exit 2; }
command -v jq >/dev/null 2>&1 || { say "restore-d1: jq is required"; exit 2; }

if [ -z "$OUT" ]; then
  for cand in "$ROOT/cf/out-ops3" "$ROOT/cf/out"; do [ -f "$cand/index.html" ] && { OUT="$cand"; break; }; done
fi
[ -n "$OUT" ] && [ -f "$OUT/index.html" ] || { say "restore-d1: no built static export found; run  OUT_NAME=out-ops3 bash cf/build-static.sh"; exit 2; }

STATE="$ROOT/cf/.wrangler/state-$STATE_NAME"
LOG="$(mktemp -t wl-restore)"

say "restore-d1: $FILE"
say "            -> local D1 at cf/.wrangler/state-$STATE_NAME, served from $(basename "$OUT") on port $PORT"

# --------------------------------------------------------------------------
say "the file"
grep -q 'CREATE TABLE' "$FILE" && ok "carries a schema ($(grep -c 'CREATE TABLE' "$FILE") CREATE TABLE)" || { fail "no CREATE TABLE in $FILE"; exit 1; }
META="${FILE%.sql}.json"
if [ -s "$META" ]; then
  SHA_NOW="$(shasum -a 256 "$FILE" | awk '{print $1}')"
  SHA_THEN="$(jq -r '.sha256 // ""' "$META")"
  if [ -z "$SHA_THEN" ]; then say "  (the sidecar records no sha256)"
  elif [ "$SHA_NOW" = "$SHA_THEN" ]; then ok "sha256 matches the sidecar — the file is byte-for-byte what was exported"
  else fail "sha256 $SHA_NOW does not match the sidecar's $SHA_THEN"; fi
else
  say "  (no sidecar next to this dump, so the counts cannot be compared to the day it was taken)"
fi

# --------------------------------------------------------------------------
say "the restore"
if lsof -ti "tcp:$PORT" >/dev/null 2>&1; then fail "port $PORT is already in use (pid $(lsof -ti "tcp:$PORT" | head -1))"; exit 1; fi
rm -rf "$STATE"
( cd "$ROOT/cf" && npx --no-install wrangler d1 execute "$PROJECT" --local --persist-to "$STATE" --file "$FILE" -y ) >"$LOG" 2>&1
if [ $? -ne 0 ]; then tail -15 "$LOG"; fail "the dump would not apply to a fresh local D1"; exit 1; fi
ok "the dump applied to a fresh local database"

( cd "$ROOT/cf" && npx --no-install wrangler pages dev "$OUT" --port "$PORT" --persist-to "$STATE" \
    --d1 DB="$DB_ID" --kv LEDGER ) >"$LOG" 2>&1 &
DEV_PID=$!
printf '%s' "$DEV_PID" > "/tmp/wl-restore-$PORT.pid"
UP=0
for _ in $(seq 1 90); do
  curl -sS -m 3 -o /dev/null "http://127.0.0.1:$PORT/api/health" 2>/dev/null && { UP=1; break; }
  sleep 1
done
[ "$UP" = "1" ] || { tail -20 "$LOG"; fail "the restored stack never answered on port $PORT"; exit 1; }
ok "the site is running on the restored copy (pid $DEV_PID)"

# --------------------------------------------------------------------------
say "the rows came back"
H="$(curl -sS -m 20 "http://127.0.0.1:$PORT/api/health" 2>/dev/null)"
printf '%s' "$H" | jq -e '.ok == true' >/dev/null 2>&1 && ok "/api/health ok:true on the restored copy" || fail "/api/health is not ok on the restored copy"
say "  restored counts: $(printf '%s' "$H" | jq -c '.tables')"
if [ -s "$META" ]; then
  # health uses short keys; the dump and the sidecar use table names.
  MAP='{"corrections":"corrections","gap":"gap_reports","survey":"survey_responses","interviews":"interviews","changes":"changes","journeys":"journeys"}'
  for key in corrections gap survey interviews changes journeys; do
    t="$(printf '%s' "$MAP" | jq -r --arg k "$key" '.[$k]')"
    want="$(jq -r --arg t "$t" '.rowCounts[$t] // 0' "$META")"
    got="$(printf '%s' "$H" | jq -r --arg k "$key" '.tables[$k] // 0')"
    if [ "$want" = "$got" ]; then ok "$t: $got row(s), the same number the dump carried"
    else fail "$t: the restored copy has $got row(s), the dump carried $want"; fi
  done
fi
CHAINS="$(curl -sS -m 30 "http://127.0.0.1:$PORT/api/integrity?verify=1" 2>/dev/null)"
if printf '%s' "$CHAINS" | jq -e '[.tables[].verified.ok] | all' >/dev/null 2>&1; then
  ok "every hash chain still verifies on the restored copy"
else
  fail "a hash chain does not verify on the restored copy: $(printf '%s' "$CHAINS" | jq -c '[.tables[] | {table, verified}]' 2>/dev/null | head -c 300)"
fi

# --------------------------------------------------------------------------
say "the live gate, against the restored copy"
if bash "$ROOT/cf/verify-live.sh" "http://127.0.0.1:$PORT"; then ok "verify-live.sh passed against the restored copy"; else fail "verify-live.sh failed against the restored copy"; fi

say ""
if [ "$KEEP" = "1" ]; then
  say "--keep: the restored stack is still up at http://127.0.0.1:$PORT (pid $DEV_PID). Stop it with: kill $DEV_PID"
  trap - EXIT INT TERM
  rm -f "$LOG"
else
  cleanup
  rm -f "$LOG"
fi
say "$PASS ok, $FAIL failed  ·  $FILE"
[ "$FAIL" -eq 0 ] || exit 1

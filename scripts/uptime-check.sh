#!/bin/bash
# ==========================================================================
# uptime-check.sh — the thing that notices at 3 a.m. when nobody is watching.
#
# Runs every fifteen minutes under launchd (com.precisionfederal.waypoint-uptime)
# and asks the live origin three questions:
#
#   1  does the site answer at all
#   2  is /api/health ok:true with db:'ok'      (D1 is reachable)
#   3  does every hash chain still verify        (/api/integrity?verify=1)
#
# The third one matters more than it looks. The register's whole claim is that
# no published row was edited or reordered after it was written. A site that
# serves 200s while a chain no longer verifies is not up; it is lying, and the
# integrity page says so to anyone who checks.
#
# One bad answer is the internet, not an outage, so it retries. Only when every
# attempt fails does it write ~/.claude/pf-state/WAYPOINT-DOWN.md — the file
# every session on this machine reads at startup — with what failed, when, and
# the exact command to roll back.
#
#   bash scripts/uptime-check.sh                    the live site
#   bash scripts/uptime-check.sh http://127.0.0.1:8841
#   npm run uptime
#
# Exit 0 up, 1 down. It is READ-ONLY: three GETs, no account, no register row.
# ==========================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ORIGIN="${1:-${UPTIME_ORIGIN:-https://waypoint-ledger.pages.dev}}"
ORIGIN="${ORIGIN%/}"
ATTEMPTS="${UPTIME_ATTEMPTS:-3}"
GAP="${UPTIME_GAP:-15}"
STATE_DIR="${PF_STATE_DIR:-$HOME/.claude/pf-state}"
DOWN="$STATE_DIR/WAYPOINT-DOWN.md"
LOG="${UPTIME_LOG:-$ROOT/../ops/UPTIME.log}"

command -v jq >/dev/null 2>&1 || { printf 'uptime-check: jq is required\n' >&2; exit 2; }
mkdir -p "$(dirname "$LOG")" "$STATE_DIR" 2>/dev/null

NOW() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# One pass. Sets WHY (empty means up) plus COMMIT/NGOOD/NCHAINS. It is called
# directly and never as $(attempt): a command substitution is a subshell, and
# the counters it set there would never reach the report written below it.
WHY=""; COMMIT=""; NGOOD=""; NCHAINS=""
attempt() {
  local why="" code health chains commit
  code="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' "$ORIGIN/" 2>/dev/null)"
  [ "$code" = "200" ] || why="the home page answered HTTP ${code:-nothing}"

  health="$(curl -sS -m 25 "$ORIGIN/api/health" 2>/dev/null)"
  if ! printf '%s' "$health" | jq -e '.ok == true and .db == "ok"' >/dev/null 2>&1; then
    why="${why:+$why; }/api/health is not ok:true db:ok — $(printf '%s' "$health" | head -c 200)"
  fi
  commit="$(printf '%s' "$health" | jq -r '.build.commit // "unknown"' 2>/dev/null)"

  chains="$(curl -sS -m 40 "$ORIGIN/api/integrity?verify=1" 2>/dev/null)"
  if ! printf '%s' "$chains" | jq -e '.ok == true and ([.tables[].verified.ok] | length > 0 and all)' >/dev/null 2>&1; then
    why="${why:+$why; }a hash chain does not verify — $(printf '%s' "$chains" | jq -c '[.tables[] | {t:.table, ok:.verified.ok, brokeAt:.verified.brokeAt}]' 2>/dev/null | head -c 300)"
  fi

  NCHAINS="$(printf '%s' "$chains" | jq -r '[.tables[].verified.ok] | length' 2>/dev/null)"
  NGOOD="$(printf '%s' "$chains" | jq -r '[.tables[].verified.ok | select(. == true)] | length' 2>/dev/null)"
  COMMIT="$commit"
  WHY="$why"
}

for i in $(seq 1 "$ATTEMPTS"); do
  attempt
  [ -z "$WHY" ] && break
  [ "$i" -lt "$ATTEMPTS" ] && sleep "$GAP"
done

# ---- RESPONSES WATCH (Bo, 2026-09-09: "did you set up to track the answers?") ----
# Every run reads the public aggregates and keeps a one-line tally in pf-state.
# When any count rises, Bo gets a macOS notification and a dated line in the tally,
# so an answer never lands unseen. Public GETs only; nothing is written to the register.
RESP="$STATE_DIR/WAYPOINT-RESPONSES.md"
sv="$(curl -sS -m 20 "$ORIGIN/api/survey" 2>/dev/null)"
rg="$(curl -sS -m 20 "$ORIGIN/api/register" 2>/dev/null)"
n_survey="$(printf '%s' "$sv" | jq -r '.n // 0' 2>/dev/null)"; n_survey="${n_survey:-0}"
chan="$(printf '%s' "$sv" | jq -c '.channels // {}' 2>/dev/null)"
n_corr="$(printf '%s' "$rg" | jq -r '.corrections.n // .corrections // 0 | if type=="object" then (.n // 0) else . end' 2>/dev/null)"; n_corr="${n_corr:-0}"
n_gap="$(printf '%s' "$rg" | jq -r '.gap.n // .gap // 0 | if type=="object" then (.n // 0) else . end' 2>/dev/null)"; n_gap="${n_gap:-0}"
n_int="$(printf '%s' "$rg" | jq -r '.interviews.n // .interviews // 0 | if type=="object" then (.n // 0) else . end' 2>/dev/null)"; n_int="${n_int:-0}"
prev="$(grep -m1 '^TOTAL ' "$RESP" 2>/dev/null | awk '{print $2}')"; prev="${prev:-0}"
total=$(( ${n_survey:-0} + ${n_corr:-0} + ${n_gap:-0} + ${n_int:-0} ))
if [ "$total" -gt "$prev" ] 2>/dev/null; then
  osascript -e "display notification \"survey $n_survey · corrections $n_corr · gap $n_gap · interviews $n_int\" with title \"Waypoint Ledger: new answer\"" >/dev/null 2>&1 || true
  printf '%s  +%s  survey=%s corrections=%s gap=%s interviews=%s channels=%s\n' "$(NOW)" "$((total - prev))" "$n_survey" "$n_corr" "$n_gap" "$n_int" "$chan" >> "$RESP.log"
fi
{
  printf 'TOTAL %s\n' "$total"
  printf '# Waypoint Ledger — answers on the public register (read %s, every 15 min by com.precisionfederal.waypoint-uptime)\n\n' "$(NOW)"
  printf 'survey answers: %s   by channel: %s\ncorrections (thumbs): %s\ngap reports: %s\nwritten interviews: %s\n\n' "$n_survey" "$chan" "$n_corr" "$n_gap" "$n_int"
  printf 'Every rise is logged in WAYPOINT-RESPONSES.md.log and shown as a Mac notification. Live: %s/register\n' "$ORIGIN"
} > "$RESP"
# ---- end RESPONSES WATCH ----

STAMP="$(NOW)"
if [ -z "$WHY" ]; then
  printf '%s  up    build=%s chains=%s/%s  %s\n' "$STAMP" "${COMMIT:-?}" "${NGOOD:-?}" "${NCHAINS:-?}" "$ORIGIN" >> "$LOG"
  # A DOWN file left behind after the site came back is a false alarm every
  # session on this machine would read at startup. Keep the incident, drop the
  # alarm.
  if [ -f "$DOWN" ]; then
    printf '\n## RECOVERED %s\n\nThe origin answered every check again at %s. This file is the record of the outage, not a live alarm.\n' "$STAMP" "$STAMP" >> "$DOWN"
    mv "$DOWN" "$STATE_DIR/WAYPOINT-DOWN-resolved-$(date -u +%Y%m%dT%H%M%SZ).md"
    printf '%s  note  the site recovered; the alarm was moved to WAYPOINT-DOWN-resolved-*.md\n' "$STAMP" >> "$LOG"
  fi
  printf 'up    %s  build=%s  chains=%s/%s\n' "$ORIGIN" "${COMMIT:-?}" "${NGOOD:-?}" "${NCHAINS:-?}"
  # keep the log bounded without ever losing the recent past
  if [ "$(wc -l <"$LOG" 2>/dev/null || echo 0)" -gt 20000 ]; then tail -n 12000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi
  exit 0
fi

printf '%s  DOWN  %s  %s\n' "$STAMP" "$ORIGIN" "$WHY" >> "$LOG"
# `pages deployment list --json` capitalises its keys (Id, Source, Status) —
# lower-case .id reads as null and the alarm would name no deployment at all.
LAST_ID="$( ( cd "$ROOT/cf" && timeout 30 npx --no-install wrangler pages deployment list --project-name waypoint-ledger --environment production --json 2>/dev/null ) | jq -r '.[1].Id // ""' 2>/dev/null )"
cat > "$DOWN" <<MD
# 🔴 WAYPOINT LEDGER IS DOWN

**$STAMP** — $ORIGIN failed $ATTEMPTS checks in a row, $GAP s apart.

## What failed

$WHY

## What to run, in order

1. Look, in case it is already back:
   bash "$ROOT/scripts/uptime-check.sh"
2. If it is still down, roll the site back to the deployment before this one:
   bash "$ROOT/scripts/rollback.sh"          # lists the last 10, newest first
   bash "$ROOT/scripts/rollback.sh" ${LAST_ID:-<deployment-id>}
   (Cloudflare Pages rolls back from the dashboard; the script prints the exact
   page and the id, and refuses to pretend it did it.)
3. If the data is the problem rather than the build, prove a backup and read
   docs/RUNBOOK.md before touching the live database:
   bash "$ROOT/scripts/restore-d1.sh" --latest

## Where to look

- the log of every check: $LOG
- the runbook: $ROOT/docs/RUNBOOK.md
- the backups: ${WAYPOINT_BACKUP_DIR:-$HOME/Library/Application Support/precision-federal/waypoint-backups}
MD
printf 'DOWN  %s\n      %s\n      wrote %s\n' "$ORIGIN" "$WHY" "$DOWN"
exit 1

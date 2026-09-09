#!/bin/bash
# ==========================================================================
# rotate-secrets.sh — replace a secret and PROVE the old one stopped working.
#
# A rotation nobody verified is a rotation that may not have happened. The
# usual failure is quiet: the new value goes into Cloudflare, the local file
# still holds the old one, and everybody believes the token was changed until
# the day somebody uses the old one and it works. So every path here ends with
# two requests — the new value must be accepted and the old value must be
# refused — and the script exits non-zero if either is not true.
#
#   bash scripts/rotate-secrets.sh admin                    local only (cf/.dev.vars), verified
#   bash scripts/rotate-secrets.sh admin --live             local + Cloudflare Pages, verified locally
#   bash scripts/rotate-secrets.sh interview --i-understand-old-interviews-become-unreadable
#
#   --base URL     the running local stack to verify against (default $WL_BASE
#                  or http://127.0.0.1:8788)
#
# ADMIN_TOKEN is a bearer token: rotating it costs nothing but a re-login.
# INTERVIEW_KEY is the AES-GCM key the interview answers are encrypted WITH.
# Rotating it does not re-encrypt anything, so every interview already on file
# becomes permanently unreadable. This script will not do that without being
# told, in the flag, that you know it.
#
# Nothing here ever prints a secret value. What is printed is the length, the
# first four characters of the SHA-256 of the value as a fingerprint you can
# compare between two machines, and the verdict.
# ==========================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 2

PROJECT="waypoint-ledger"
DEV_VARS="$ROOT/cf/.dev.vars"
ENV_FILE="$HOME/.config/precision-federal/waypoint-admin.env"
BASE="${WL_BASE:-http://127.0.0.1:8788}"

RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; OFF=$'\033[0m'
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
say()  { printf '    %s\n' "$*"; }
die()  { printf '\n%sSTOPPED: %s%s\n' "$RED" "$*" "$OFF"; exit 1; }
ok()   { printf '%s    ok   %s%s\n' "$GRN" "$*" "$OFF"; }

WHICH=""; LIVE=0; INTERVIEW_OK=0
while [ $# -gt 0 ]; do
  case "$1" in
    admin|interview) WHICH="$1" ;;
    --live) LIVE=1 ;;
    --i-understand-old-interviews-become-unreadable) INTERVIEW_OK=1 ;;
    --base) shift; BASE="${1:-}" ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done
[ -n "$WHICH" ] || die "say which secret: admin | interview"

case "$WHICH" in
  admin)     NAME="ADMIN_TOKEN" ;;
  interview) NAME="INTERVIEW_KEY"
             [ "$INTERVIEW_OK" -eq 1 ] || die "rotating INTERVIEW_KEY makes every interview already stored permanently unreadable — nothing re-encrypts them. Pass --i-understand-old-interviews-become-unreadable if that is what you mean." ;;
esac

# --- helpers ---------------------------------------------------------------
fingerprint() { printf '%s' "$1" | shasum -a 256 | cut -c1-8; }
value_of() {  # value_of FILE NAME  — prints the value, never logged by the caller
  [ -r "$2" ] || return 1
  sed -n "s/^$1=//p" "$2" | head -1 | sed 's/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//'
}
probe() {     # probe TOKEN -> http status of an authenticated admin read
  curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
       -H "authorization: Bearer $1" -H "cf-connecting-ip: 127.0.0.$2" \
       "$BASE/api/admin/stats" 2>/dev/null
}

[ -f "$DEV_VARS" ] || die "$DEV_VARS does not exist; there is nothing to rotate locally"

step "1/5  what is there now"
OLD="$(value_of "$NAME" "$DEV_VARS")" || die "could not read $NAME from cf/.dev.vars"
[ -n "$OLD" ] || die "$NAME is empty in cf/.dev.vars"
say "$NAME  ${#OLD} characters, fingerprint $(fingerprint "$OLD")"

step "2/5  the local stack answers, and the current value works"
CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/api/health" 2>/dev/null)"
[ "$CODE" = "200" ] || die "no local stack at $BASE (GET /api/health said '$CODE'). Start one, or pass --base."
if [ "$WHICH" = "admin" ]; then
  CODE="$(probe "$OLD" 11)"
  [ "$CODE" = "200" ] || die "the CURRENT admin token is not being accepted at $BASE (got $CODE). Fix that before rotating, or the verification below proves nothing."
  ok "the current token opens /api/admin/stats"
else
  ok "health is up (INTERVIEW_KEY has no probe endpoint; the check below is that the file changed and the server reloaded)"
fi

step "3/5  generate"
case "$WHICH" in
  admin)     NEW="$(openssl rand -base64 36 | tr -d '\n' | tr '+/' '-_')" ;;   # url-safe, 48 chars
  interview) NEW="$(openssl rand -base64 32 | tr -d '\n')" ;;                  # exactly 32 bytes, base64, as _db.js expects
esac
[ -n "$NEW" ] || die "openssl produced nothing"
[ "$NEW" != "$OLD" ] || die "the new value is the old value; that is not a rotation"
say "$NAME  ${#NEW} characters, fingerprint $(fingerprint "$NEW")"

step "4/5  write it where it is read from"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "$DEV_VARS" "$DEV_VARS.$STAMP.bak" && chmod 600 "$DEV_VARS.$STAMP.bak"
say "cf/.dev.vars backed up to cf/.dev.vars.$STAMP.bak (600, gitignored)"
TMP="$(mktemp -t wl-rot)"; chmod 600 "$TMP"
NEWVAL="$NEW" awk -F= -v n="$NAME" 'BEGIN{OFS="="} $1==n {print n, ENVIRON["NEWVAL"]; done=1; next} {print} END{if(!done) print n, ENVIRON["NEWVAL"]}' "$DEV_VARS" > "$TMP"
mv "$TMP" "$DEV_VARS" && chmod 600 "$DEV_VARS"
ok "cf/.dev.vars now holds fingerprint $(fingerprint "$(value_of "$NAME" "$DEV_VARS")")"

if [ -w "$ENV_FILE" ] || [ ! -e "$ENV_FILE" ]; then
  mkdir -p "$(dirname "$ENV_FILE")"
  [ -e "$ENV_FILE" ] && { cp -p "$ENV_FILE" "$ENV_FILE.$STAMP.bak"; chmod 600 "$ENV_FILE.$STAMP.bak"; }
  TMP="$(mktemp -t wl-rot)"; chmod 600 "$TMP"
  NEWVAL="$NEW" awk -F= -v n="$NAME" 'BEGIN{OFS="="} $1==n {print n, ENVIRON["NEWVAL"]; done=1; next} {print} END{if(!done) print n, ENVIRON["NEWVAL"]}' "$ENV_FILE" > "$TMP" 2>/dev/null
  mv "$TMP" "$ENV_FILE" && chmod 600 "$ENV_FILE"
  ok "${ENV_FILE/#$HOME/~} updated (600)"
else
  printf '%s    note %s is not writable; update it by hand%s\n' "$YEL" "$ENV_FILE" "$OFF"
fi

if [ "$LIVE" -eq 1 ]; then
  step "4b/5  Cloudflare Pages"
  printf '%s    This puts the new %s on the LIVE project "%s".%s\n' "$YEL" "$NAME" "$PROJECT" "$OFF"
  printf '    Type exactly: rotate live\n    > '
  read -r CONFIRM
  [ "$CONFIRM" = "rotate live" ] || die "not confirmed; the local file was still rotated, so put the same value on Pages by hand or re-run"
  printf '%s' "$NEW" | ( cd "$ROOT/cf" && npx wrangler pages secret put "$NAME" --project-name "$PROJECT" ) || die "wrangler pages secret put failed"
  ok "Cloudflare Pages holds fingerprint $(fingerprint "$NEW")"
  say "a Pages secret takes effect on the next deployment: npm run deploy"
fi

step "5/5  prove the old one is dead"
if [ "$WHICH" != "admin" ]; then
  say "INTERVIEW_KEY has no request that can test it without decrypting somebody's answers."
  say "The proof it changed is the fingerprint above. Every interview stored under"
  say "the old key is now unreadable, which is what the flag acknowledged."
  printf '\n%sRotated. Restart the dev server so it re-reads cf/.dev.vars.%s\n' "$GRN" "$OFF"
  exit 0
fi

# `wrangler pages dev` reads cf/.dev.vars once, at start. Measured 2026-09-09:
# ninety seconds after the file changed, the running server on 8843 still only
# accepted the old token. So the server already running is the wrong witness —
# it is testifying about a file it read before the rotation.
#
# The proof therefore gets its own server: a throwaway `wrangler pages dev` on a
# free port with its own state directory, started AFTER the write, which reads
# the rotated file the way production will read the rotated secret. It is killed
# whether the probes pass or fail.
VERIFY_PORT="${WL_VERIFY_PORT:-8899}"
while lsof -ti "tcp:$VERIFY_PORT" >/dev/null 2>&1; do VERIFY_PORT=$((VERIFY_PORT+1)); done
OUT_DIR=""
for d in "$ROOT/cf/out" "$ROOT"/cf/out-*; do [ -d "$d" ] && [ -f "$d/index.html" ] && OUT_DIR="$d" && break; done
[ -n "$OUT_DIR" ] || die "no built export found (cf/out or cf/out-*); run npm run build:static first"
VSTATE="$ROOT/cf/.wrangler/state-rotate-check"
rm -rf "$VSTATE"
say "standing up a throwaway server on port $VERIFY_PORT to read the rotated file"
( cd "$ROOT/cf" && npx wrangler d1 migrations apply "$PROJECT" --local --persist-to "$VSTATE" ) >/dev/null 2>&1 \
  || die "could not apply migrations to the verification state directory"
( cd "$ROOT/cf" && npx wrangler pages dev "$(basename "$OUT_DIR")" --port "$VERIFY_PORT" --persist-to "$VSTATE" \
    --d1 DB=3c6cf7a7-e060-48fd-9e1f-646eb89ad461 --kv LEDGER ) >/tmp/wl-rotate-verify.log 2>&1 &
VPID=$!
cleanup_verify() { if [ -n "${VPID:-}" ] && kill -0 "$VPID" 2>/dev/null; then kill "$VPID" 2>/dev/null; wait "$VPID" 2>/dev/null; fi; rm -rf "$VSTATE"; }
trap cleanup_verify EXIT INT TERM

BASE="http://127.0.0.1:$VERIFY_PORT"
UP=""
for i in $(seq 1 40); do
  [ "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 "$BASE/api/health" 2>/dev/null)" = "200" ] && { UP=yes; break; }
  sleep 1
done
[ -n "$UP" ] || { tail -12 /tmp/wl-rotate-verify.log; die "the verification server never answered on $BASE"; }

CODE="$(probe "$NEW" 12)"
[ "$CODE" = "200" ] || die "a server started AFTER the rotation does not accept the new token (got $CODE). The write did not take."
ok "the NEW token opens /api/admin/stats (200) on a server that read the rotated file"

CODE="$(probe "$OLD" 13)"
case "$CODE" in
  401) ok "the OLD token is refused (401)" ;;
  429) die "the old-token probe got 429 — this network is inside the wrong-token lockout, so 'refused' cannot be distinguished from 'locked out'. Wait for the hour to turn and re-run this one probe." ;;
  200) die "THE OLD TOKEN STILL WORKS. The rotation did not take. Nothing is safe until it does." ;;
  *)   die "the old-token probe returned $CODE, which is neither accepted nor refused" ;;
esac

cleanup_verify; trap - EXIT INT TERM
printf '\n%sRotated and verified: new accepted, old refused.%s\n' "$GRN" "$OFF"
say "Any dev server that was already running still holds the OLD value in memory — restart it."
[ "$LIVE" -eq 1 ] && printf 'Live Pages carries the new value from the next deploy onward.\n'
exit 0

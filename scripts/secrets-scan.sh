#!/bin/bash
# ==========================================================================
# secrets-scan.sh — does anything this site SERVES contain a secret?
#
# The two secrets are ADMIN_TOKEN (reads every interview) and INTERVIEW_KEY
# (decrypts them). Both live in cf/.dev.vars locally and in Cloudflare Pages
# secrets in production. Neither is ever supposed to reach a byte a browser can
# download — but "supposed to" is not a check, and the static export is built by
# a script that inlines files, so the honest question is whether the built tree
# and the git tree contain the value.
#
# This script never prints a secret. It reads the values, writes them to a
# 600 temp file, hands that file to grep -f, and reports the PATH of anything
# that matched. A match is a stop-everything finding; the fix is to rotate
# (scripts/rotate-secrets.sh) and then find how it got there.
#
#   bash scripts/secrets-scan.sh              scan cf/out* and the git tree
#   bash scripts/secrets-scan.sh cf/out-x     scan a named build directory too
#
# Exit 0 clean · exit 1 a secret or a credential pattern was found.
# ==========================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 2

TILDE='~'
RED=$'\033[31m'; GRN=$'\033[32m'; DIM=$'\033[2m'; OFF=$'\033[0m'
FINDINGS=0
say()  { printf '    %s\n' "$*"; }
fail() { printf '%s FOUND  %s%s\n' "$RED" "$*" "$OFF"; FINDINGS=$((FINDINGS+1)); }
pass() { printf '%s ok     %s%s\n' "$GRN" "$*" "$OFF"; }

NEEDLES="$(mktemp -t wl-needles)"; chmod 600 "$NEEDLES"
trap 'rm -f "$NEEDLES"' EXIT INT TERM

# --------------------------------------------------------------------------
# 1. The real values, read from the files that hold them. Only the NAMES are
#    ever printed. A value shorter than 16 characters is not used as a needle:
#    a short string produces false positives and tells you nothing.
# --------------------------------------------------------------------------
printf '\n\033[1m==> the secrets this project actually has\033[0m\n'
NEEDLE_COUNT=0
for SRC in "$ROOT/cf/.dev.vars" "$HOME/.config/precision-federal/waypoint-admin.env"; do
  [ -r "$SRC" ] || { say "absent  ${SRC/#$HOME/$TILDE}"; continue; }
  PERM="$(stat -f '%Lp' "$SRC" 2>/dev/null || stat -c '%a' "$SRC" 2>/dev/null)"
  case "$PERM" in
    600|400) say "$(printf '%-58s mode %s' "${SRC/#$HOME/$TILDE}" "$PERM")" ;;
    *) fail "${SRC/#$HOME/$TILDE} is mode $PERM — a secret file is 600" ;;
  esac
  while IFS= read -r line; do
    case "$line" in ''|'#'*) continue ;; esac
    name="${line%%=*}"; value="${line#*=}"
    value="${value%\"}"; value="${value#\"}"; value="${value%\'}"; value="${value#\'}"
    [ "${#value}" -ge 16 ] || { say "$name is under 16 characters — too short to be a real secret"; continue; }
    printf '%s\n' "$value" >> "$NEEDLES"
    NEEDLE_COUNT=$((NEEDLE_COUNT+1))
    say "$(printf '%-20s %2d characters, will be searched for' "$name" "${#value}")"
  done < "$SRC"
done
[ "$NEEDLE_COUNT" -gt 0 ] || say "${DIM}no secret files readable here; the pattern scan below still runs${OFF}"

# --------------------------------------------------------------------------
# 2. Every built tree, and the git-tracked tree.
# --------------------------------------------------------------------------
printf '\n\033[1m==> is any of them in something we serve or commit\033[0m\n'
TARGETS=()
for d in "$ROOT"/cf/out "$ROOT"/cf/out-* "$@"; do [ -d "$d" ] && TARGETS+=("$d"); done
if [ "$NEEDLE_COUNT" -gt 0 ]; then
  for d in "${TARGETS[@]}"; do
    HITS="$(grep -rlF -f "$NEEDLES" "$d" 2>/dev/null)"
    if [ -n "$HITS" ]; then
      while IFS= read -r f; do fail "a secret value appears in ${f#$ROOT/}"; done <<< "$HITS"
    else
      pass "${d#$ROOT/} carries no secret value ($(find "$d" -type f | wc -l | tr -d ' ') files)"
    fi
  done
  TRACKED="$(git -C "$ROOT" grep -lF -f "$NEEDLES" -- . 2>/dev/null)"
  if [ -n "$TRACKED" ]; then
    while IFS= read -r f; do fail "a secret value is COMMITTED in $f"; done <<< "$TRACKED"
  else
    pass "no secret value in any git-tracked file"
  fi
else
  say "skipped: no values to search for"
fi

# --------------------------------------------------------------------------
# 3. Credential SHAPES, so a secret this script has never seen is still caught.
#    Each pattern is one an automated scanner would flag on a public repo.
# --------------------------------------------------------------------------
printf '\n\033[1m==> credential shapes in the git-tracked tree\033[0m\n'
scan() { # <label> <extended-regex>
  local label="$1" re="$2" hits
  hits="$(git -C "$ROOT" grep -lE "$re" -- . ':(exclude)scripts/secrets-scan.sh' 2>/dev/null)"
  if [ -n "$hits" ]; then
    while IFS= read -r f; do fail "$label in $f"; done <<< "$hits"
  else
    pass "no $label"
  fi
}
scan "private key block"        '-----BEGIN [A-Z ]*PRIVATE KEY-----'
scan "AWS access key id"       'AKIA[0-9A-Z]{16}'
scan "GitHub token"             'gh[pousr]_[A-Za-z0-9]{36,}'
scan "Slack token"              'xox[abprs]-[0-9A-Za-z-]{10,}'
scan "OpenAI key"              'sk-[A-Za-z0-9_-]{32,}'
scan "Cloudflare API token"     'CLOUDFLARE_API_TOKEN[[:space:]]*=[[:space:]]*[A-Za-z0-9_-]{20,}'
scan "hard-coded bearer token"  'Bearer [A-Za-z0-9+/_-]{24,}'
scan "JWT"                      'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.'

# --------------------------------------------------------------------------
# 4. The secret files must not be committable at all.
# --------------------------------------------------------------------------
printf '\n\033[1m==> the secret files cannot be committed\033[0m\n'
for f in cf/.dev.vars .dev.vars .env .env.local; do
  if git -C "$ROOT" ls-files --error-unmatch "$f" >/dev/null 2>&1; then
    fail "$f is tracked by git"
  elif git -C "$ROOT" check-ignore -q "$f" 2>/dev/null; then
    pass "$f is ignored by git"
  else
    say "${DIM}$f is not tracked and not named in .gitignore (it does not exist here)${OFF}"
  fi
done

printf '\n'
if [ "$FINDINGS" -eq 0 ]; then
  printf '%sclean — nothing served or committed carries a secret.%s\n' "$GRN" "$OFF"
  exit 0
fi
printf '%s%d finding(s). Rotate first (bash scripts/rotate-secrets.sh admin --live), then find how it got there.%s\n' "$RED" "$FINDINGS" "$OFF"
exit 1

#!/bin/bash
# ==========================================================================
# bluebutton-switch-on.sh: put the Blue Button SANDBOX credentials on the
# Pages PREVIEW environment, then read /api/bluebutton/status on a preview branch.
#
#   bash scripts/bluebutton-switch-on.sh --env preview --branch bluebutton-night
#   bash scripts/bluebutton-switch-on.sh --env preview --branch bluebutton-night --check-only
#
# Reads ~/.config/precision-federal/portals/bluebutton-sandbox.env (or $BB_ENV_FILE):
#   BB_CLIENT_ID=...
#   BB_CLIENT_SECRET=...
# The file must be mode 600. Values go to wrangler on stdin only: never in an
# argument, never echoed, never logged, and any wrangler line that contains one
# is dropped before it is printed.
#
# 🔴 PREVIEW ONLY. `wrangler pages secret put` defaults to PRODUCTION when --env
# is left out (wrangler 4.130.0: env ??= "production"), so this script refuses
# to run unless it is told --env preview, and passes --env preview itself.
# A Pages secret applies to the NEXT deployment of every preview branch, so after
# the first run deploy with scripts/deploy-preview.sh <branch> and re-run with
# --check-only. It never deploys, never touches production, never runs migrations.
# ==========================================================================
set -euo pipefail
set +x

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="waypoint-ledger"
FILE="${BB_ENV_FILE:-$HOME/.config/precision-federal/portals/bluebutton-sandbox.env}"
ENV_NAME=""
BRANCH=""
CHECK_ONLY=0

die() { printf '\n\033[31mBLUE BUTTON SWITCH-ON STOPPED: %s\033[0m\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --env) ENV_NAME="${2:-}"; shift 2 ;;
    --env=*) ENV_NAME="${1#--env=}"; shift ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    --branch=*) BRANCH="${1#--branch=}"; shift ;;
    --check-only) CHECK_ONLY=1; shift ;;
    *) die "unknown argument '$1' (use --env preview --branch <preview-branch> [--check-only])" ;;
  esac
done

# 1. preview, said out loud, or nothing
[ "$ENV_NAME" = "preview" ] || die "this script only sets PREVIEW secrets; run it with --env preview (got '${ENV_NAME:-nothing}')"

# 2. a named preview branch, never production
[ -n "$BRANCH" ] || die "name the preview branch to check, e.g. --branch bluebutton-night"
case "$(printf '%s' "$BRANCH" | tr '[:upper:]' '[:lower:]')" in
  main|production|prod|master) die "branch '$BRANCH' is production; this script only checks preview branches" ;;
esac
printf '%s' "$BRANCH" | grep -Eq '^[a-z0-9][a-z0-9-]{0,27}$' || die "branch '$BRANCH' must be lowercase letters, digits and dashes"
ALIAS="https://$BRANCH.$PROJECT.pages.dev"

check_status() {
  local body
  body="$(curl -fsS -m 15 "$ALIAS/api/bluebutton/status")" || die "could not read $ALIAS/api/bluebutton/status"
  printf '%s' "$body" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const j = JSON.parse(s);
      console.log(`status ${process.argv[1]}: configured ${j.configured}, environment ${j.environment}`);
      process.exit(j.configured === true && j.environment === "sandbox" ? 0 : 3);
    });' "$ALIAS"
}

if [ "$CHECK_ONLY" = "1" ]; then
  if check_status; then printf '\033[32mBlue Button is on in the sandbox at %s\033[0m\n' "$ALIAS"; exit 0; fi
  die "configured is not true on $ALIAS. If the secrets were just set, deploy that branch first: bash scripts/deploy-preview.sh $BRANCH"
fi

# 3. the credentials file: present, private, complete
[ -f "$FILE" ] || die "no credentials file at $FILE (create the sandbox app first; see winloop/BETA-2026-10-01/BLUEBUTTON.md)"
MODE="$(stat -f '%Lp' "$FILE" 2>/dev/null || stat -c '%a' "$FILE")"
[ "$MODE" = "600" ] || die "$FILE is mode $MODE; run chmod 600 on it first"
case "$FILE" in "$ROOT"/*) die "$FILE is inside the repository; credentials may not live in an open-source tree" ;; esac

value_of() { sed -n "s/^$1=//p" "$FILE" | head -1 | tr -d '\r' | sed -e 's/^"//' -e 's/"$//'; }

for KEY in BB_CLIENT_ID BB_CLIENT_SECRET; do
  V="$(value_of "$KEY")"
  [ -n "$V" ] || die "$FILE has no value for $KEY"
  printf 'setting %s on %s (preview)\n' "$KEY" "$PROJECT"
  # The value travels on stdin. Wrangler's own output is filtered through the
  # value held in the environment (not an argument), so it can never be printed.
  export BB_SWITCH_V="$V"
  ( cd "$ROOT/cf" && printf '%s' "$BB_SWITCH_V" \
      | npx wrangler pages secret put "$KEY" --project-name "$PROJECT" --env preview 2>&1 ) \
    | awk 'index($0, ENVIRON["BB_SWITCH_V"]) == 0' \
    || { unset BB_SWITCH_V V; die "wrangler could not set $KEY"; }
  unset BB_SWITCH_V V
done

printf '\nSecrets set on the preview environment. Names on record:\n'
( cd "$ROOT/cf" && npx wrangler pages secret list --project-name "$PROJECT" --env preview 2>&1 ) \
  | grep -E 'BB_CLIENT_(ID|SECRET)' | sed 's/:.*$/: (value hidden)/' || true

# 4. read the switch on the named preview branch
if check_status; then
  printf '\033[32mBlue Button is on in the sandbox at %s\033[0m\n' "$ALIAS"
else
  printf '\nThe secrets apply to the next deployment. Now run:\n  bash scripts/deploy-preview.sh %s\n  bash scripts/bluebutton-switch-on.sh --env preview --branch %s --check-only\n' "$BRANCH" "$BRANCH"
fi

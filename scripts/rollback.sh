#!/bin/bash
# ==========================================================================
# rollback.sh — put yesterday's site back, and never pretend to have done it.
#
# Cloudflare Pages has no rollback in wrangler. Checked, on this machine:
#   `wrangler pages deployment --help` lists exactly three commands — list,
#   create, tail — and Cloudflare's own page
#   (developers.cloudflare.com/pages/configuration/rollbacks/) describes
#   rollback as four clicks in the dashboard and mentions no API and no CLI.
#
# So this script does the parts a script can do honestly:
#   · lists the last ten production deployments, newest first, with the commit
#     each one carries and how long ago it went out
#   · checks the id you name is really one of them, and tells you which commit
#     you are about to put back and what changed since
#   · prints the exact page to open and the exact menu item to click
#   · EXITS 2, because it did not roll anything back
#   · --check, afterwards, reads /build.json and says which commit is live now
#
# There is a second road that needs no dashboard, and the script prints it too:
# check the good commit out and publish it again through the deploy gate. That
# takes about four minutes and it is a real deploy, with every red light in
# scripts/deploy.sh in front of it.
#
#   bash scripts/rollback.sh                     list the last ten
#   bash scripts/rollback.sh <deployment-id>     the instructions for that one
#   bash scripts/rollback.sh --check             what is live right now
#   npm run rollback
# ==========================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="waypoint-ledger"
ACCOUNT="b16cccaf0099ee0f9751c7e73bd8c7c7"
ORIGIN="${ROLLBACK_ORIGIN:-https://waypoint-ledger.pages.dev}"
DASH="https://dash.cloudflare.com/$ACCOUNT/pages/view/$PROJECT"

command -v jq >/dev/null 2>&1 || { printf 'rollback: jq is required\n' >&2; exit 2; }

deployments() {
  ( cd "$ROOT/cf" && npx --no-install wrangler pages deployment list --project-name "$PROJECT" --environment production --json 2>/dev/null )
}

live_commit() {
  curl -sS -m 20 "$ORIGIN/build.json" 2>/dev/null | jq -r '.shortCommit // .commit // "unknown"' 2>/dev/null
}

if [ "${1:-}" = "--check" ]; then
  printf 'live now: %s is serving commit %s\n' "$ORIGIN" "$(live_commit)"
  exit 0
fi

JSON="$(deployments)"
if ! printf '%s' "$JSON" | jq -e 'type == "array" and length > 0' >/dev/null 2>&1; then
  printf 'rollback: could not list deployments. Is wrangler logged in? (npx wrangler whoami)\n' >&2
  exit 1
fi

LIVE="$(live_commit)"
printf 'the last 10 production deployments of %s  (live now: %s)\n\n' "$PROJECT" "$LIVE"
printf '%s' "$JSON" | jq -r '.[0:10] | to_entries[] | "  [\(.key)]  \(.value.Id)  \(.value.Source)  \(.value.Status)"'
printf '\n'

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  printf 'Name one to roll back to:  bash scripts/rollback.sh <deployment-id>\n'
  exit 0
fi

ROW="$(printf '%s' "$JSON" | jq -c --arg id "$TARGET" '.[] | select(.Id == $id)')"
if [ -z "$ROW" ]; then
  printf 'rollback: %s is not one of this project'"'"'s production deployments.\n' "$TARGET" >&2
  printf '          Copy an Id from the list above.\n' >&2
  exit 2
fi
SHA="$(printf '%s' "$ROW" | jq -r '.Source')"
WHEN="$(printf '%s' "$ROW" | jq -r '.Status')"

printf 'rolling back to %s  —  commit %s, deployed %s\n\n' "$TARGET" "$SHA" "$WHEN"
if git -C "$ROOT" cat-file -e "$SHA^{commit}" 2>/dev/null; then
  printf 'what you would be undoing (commits after %s that are in HEAD):\n' "$SHA"
  git -C "$ROOT" log --oneline --max-count=20 "$SHA..HEAD" -- "$ROOT" 2>/dev/null | sed 's/^/  /'
  printf '\n'
else
  printf '  (commit %s is not in this checkout, so the diff cannot be shown)\n\n' "$SHA"
fi

cat <<INSTRUCTIONS
Cloudflare Pages rolls back from the dashboard. There is no wrangler command and
no documented API for it, so this script will not claim to have done it.

  1  open   $DASH
  2  the    Deployments  tab, then  All deployments
  3  find   $TARGET   (commit $SHA, $WHEN)
  4  click  the ⋯ menu on that row, then  Rollback to this deployment
  5  confirm. Production changes instantly.
  6  prove it:   bash scripts/rollback.sh --check
                 bash cf/verify-live.sh $ORIGIN

Without the dashboard, republish the same commit through the deploy gate:

  cd "$ROOT"
  git checkout $SHA
  npm run deploy          # types, tests, build, the whole stack locally, then publish
  git checkout -          # go back to where you were

INSTRUCTIONS
exit 2

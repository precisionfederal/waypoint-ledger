#!/bin/bash
# ==========================================================================
# deploy.sh — THE ONLY WAY THIS SITE GOES OUT.
#
# Round 3's finding was not a bug in the site. It was that the gate ran AFTER
# the upload: `wrangler pages deploy && sleep 20 && verify-live.sh`. A failing
# check could only report on a site the public was already reading, and
# `--commit-dirty=true` meant the thing being reported on matched no commit —
# live /build.json said `a982b3bc4 dirty:true` while the round's work was
# somewhere else. A deploy that can only describe what already happened is not
# a gate.
#
# So: every red light happens BEFORE anything is published, and the last light
# is a full run of the stack on this machine against local D1 and KV.
#
#   1  the tree is clean, and the stamp is a real commit
#   2  npx tsc --noEmit          types
#   3  npm test                  the unit suite
#   4  npm run build:static      the export, with the generators
#   5  the built tree carries every file verify-live will ask the server for
#   6  wrangler pages dev + migrations, then verify-live.sh and the Playwright
#      e2e against it — the whole stack, locally, before the upload
#   7  d1 migrations apply --remote
#   8  wrangler pages deploy     (no --commit-dirty: step 1 already refused one)
#   9  verify-live.sh against the deployed origin
#
# Any failure exits non-zero. Steps 1-6 all happen before step 8, so a red
# light means nothing was published.
#
#   npm run deploy                 the whole thing
#   PF_DEPLOY_DRY=1 npm run deploy  steps 1-6 only; prints what 7-9 would run
#   ALLOW_DIRTY=1 npm run deploy    stamps a dirty tree on purpose, and says so
#
# Never run by an agent. A human runs it, and a human reads the last line.
# ==========================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 2

PROJECT="waypoint-ledger"
ORIGIN="${DEPLOY_ORIGIN:-https://waypoint-ledger.pages.dev}"
PORT="${DEPLOY_PORT:-8899}"
DRY="${PF_DEPLOY_DRY:-0}"
STATE="$ROOT/cf/.wrangler/state-deploy"
LOG="$(mktemp -t wl-deploy)"
DEV_PID=""

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die()  { printf '\n\033[31mDEPLOY STOPPED: %s\033[0m\n' "$*"; printf 'Nothing was published.\n'; cleanup; exit 1; }
note() { printf '    %s\n' "$*"; }

cleanup() {
  if [ -n "$DEV_PID" ] && kill -0 "$DEV_PID" 2>/dev/null; then kill "$DEV_PID" 2>/dev/null; wait "$DEV_PID" 2>/dev/null; fi
  DEV_PID=""
}
trap cleanup EXIT INT TERM

# --------------------------------------------------------------------------
step "1/9  the tree is clean and the stamp is a real commit"
DIRTY="$(git -C "$ROOT" status --porcelain -- "$ROOT" 2>/dev/null)"
if [ -n "$DIRTY" ]; then
  if [ "${ALLOW_DIRTY:-0}" = "1" ]; then
    note "ALLOW_DIRTY=1 — publishing a tree that matches no commit, on purpose:"
    printf '%s\n' "$DIRTY" | sed 's/^/      /' | head -20
  else
    printf '\n\033[31mThe working tree has uncommitted changes:\033[0m\n'
    printf '%s\n' "$DIRTY" | sed 's/^/      /' | head -40
    die "commit them first, so /build.json names a commit a judge can read. (ALLOW_DIRTY=1 overrides.)"
  fi
fi
HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null)"
[ -n "$HEAD_SHA" ] || die "no git commit found; the build could not be stamped"
note "HEAD $HEAD_SHA"

# --------------------------------------------------------------------------
step "2/9  types"
npx tsc --noEmit -p . || die "TypeScript errors"

step "3/9  unit tests"
npm test || die "the unit suite is red"

step "4/9  static export"
PF_REQUIRE_CLEAN=1 npm run build:static >"$LOG" 2>&1 || { tail -30 "$LOG"; die "the static export failed"; }
note "$(tail -1 "$LOG")"

# --------------------------------------------------------------------------
step "5/9  the built tree carries what verify-live will ask for"
# Every path below is one a check in cf/verify-live.sh (or the pages that make a
# promise about it) will request from the server. A 404 on any of them is a
# broken promise, and it is cheaper to find here than on the origin.
MISSING=0
for f in index.html build.json robots.txt .well-known/security.txt \
         integrity/index.html accessibility/index.html register/index.html \
         method/index.html ledger/index.html journey/index.html \
         data/locality-prices.csv data/dictionary.csv manifest.webmanifest sw.js; do
  # Next's static export writes a page as <name>.html; a trailing-slash export writes <name>/index.html. Either serves the URL.
  alt="${f%/index.html}.html"
  if [ -e "cf/out/$f" ] || { [ "$alt" != "$f" ] && [ -e "cf/out/$alt" ]; }; then printf '    ok    %s\n' "$f"; else printf '    MISSING  %s\n' "$f"; MISSING=$((MISSING+1)); fi
done
[ "$MISSING" -eq 0 ] || die "$MISSING file(s) the live gate asks for are not in cf/out"

# The stamp in the artifact must be the commit we just checked, and not dirty.
STAMP_SHA="$(sed -n 's/.*"commit": *"\([0-9a-f]*\)".*/\1/p' cf/out/build.json | head -1)"
# BSD sed (macOS) has no \| alternation in basic regex; the old pattern matched nothing and every stamp read as dirty.
STAMP_DIRTY="$(grep -o '"dirty": *[a-z]*' cf/out/build.json | head -1 | sed 's/.*: *//')"
[ "$STAMP_SHA" = "$HEAD_SHA" ] || die "cf/out/build.json says $STAMP_SHA but HEAD is $HEAD_SHA"
if [ "$STAMP_DIRTY" != "false" ] && [ "${ALLOW_DIRTY:-0}" != "1" ]; then die "cf/out/build.json is stamped dirty"; fi
note "build.json  $STAMP_SHA  dirty=$STAMP_DIRTY"

# --------------------------------------------------------------------------
step "6/9  the whole stack on this machine (local D1 + KV), then the gate"
# A listener left on the port by an earlier run would answer the gate with its own stale state (seen 2026-09-09: 503s from a server whose state dir had been removed).
if lsof -ti "tcp:$PORT" >/dev/null 2>&1; then die "port $PORT is already in use (pid $(lsof -ti "tcp:$PORT" | head -1)); stop it, or set DEPLOY_PORT"; fi
rm -rf "$STATE"
( cd cf && npx wrangler d1 migrations apply "$PROJECT" --local --persist-to "$STATE" ) >"$LOG" 2>&1 \
  || { tail -20 "$LOG"; die "local D1 migrations failed"; }

( cd cf && npx wrangler pages dev out --port "$PORT" --persist-to "$STATE" \
    --d1 DB=3c6cf7a7-e060-48fd-9e1f-646eb89ad461 --kv LEDGER ) >"$LOG" 2>&1 &
DEV_PID=$!
UP=0
for _ in $(seq 1 60); do
  if curl -sS -m 3 -o /dev/null "http://127.0.0.1:$PORT/api/health" 2>/dev/null; then UP=1; break; fi
  sleep 1
done
[ "$UP" = "1" ] || { tail -20 "$LOG"; die "the local server never answered on port $PORT"; }
note "local server up on $PORT (pid $DEV_PID)"

bash cf/verify-live.sh "http://127.0.0.1:$PORT" || die "verify-live.sh failed against the local stack"
E2E_BASE="http://127.0.0.1:$PORT" node shots2/e2e.mjs || die "the end-to-end run failed against the local stack"
cleanup
note "local stack green"

# --------------------------------------------------------------------------
if [ "$DRY" = "1" ]; then
  printf '\n\033[1mPF_DEPLOY_DRY=1 — every local gate passed. Not publishing.\033[0m\n'
  printf 'What a real run would do next:\n'
  printf '  7  npm run db:migrate:remote\n'
  printf '  8  (cd cf && npx wrangler pages deploy out --project-name %s --branch main)\n' "$PROJECT"
  printf '  9  bash cf/verify-live.sh %s\n' "$ORIGIN"
  exit 0
fi

step "7/9  remote migrations"
npm run db:migrate:remote || die "remote D1 migrations failed"

step "8/9  publish"
# No --commit-dirty: step 1 refused a dirty tree, so the commit wrangler records
# is the commit /build.json names.
( cd cf && npx wrangler pages deploy out --project-name "$PROJECT" --branch main ) || die "wrangler pages deploy failed"

step "9/9  the origin, as the public sees it"
sleep 20
if ! ADMIN_TOKEN="${ADMIN_TOKEN:-}" bash cf/verify-live.sh "$ORIGIN"; then
  printf '\n\033[31mTHE DEPLOY IS LIVE AND THE GATE IS RED.\033[0m\n'
  printf 'Roll back in the Cloudflare Pages dashboard, or fix and run this again.\n'
  exit 1
fi

printf '\n\033[32mdeployed %s  ·  %s  ·  gate green\033[0m\n' "$HEAD_SHA" "$ORIGIN"

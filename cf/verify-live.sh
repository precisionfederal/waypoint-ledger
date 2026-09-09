#!/bin/bash
# ==========================================================================
# verify-live.sh — prove that what we say about the site is true of the site.
#
# Round 1's sharpest finding was not that the hardening was missing. It was
# written and NOT DEPLOYED: the middleware existed on disk while the live origin
# answered OPTIONS with 405 and carried no CSP. So the deploy is the step that
# has to prove itself. This script curls the live origin and exits non-zero if
# any promise on the page is not true of the server.
#
#   bash cf/verify-live.sh                       # the live site
#   bash cf/verify-live.sh http://127.0.0.1:8806 # a local wrangler pages dev
#
# It never writes to the public register — no correction, no gap report, no
# survey answer. It DOES make one throwaway account and one saved journey and
# then erases both, because the last two regressions were write paths that no
# amount of reading could catch. VERIFY_READ_ONLY=1 skips that block.
# ==========================================================================
set -uo pipefail
ORIGIN="${1:-https://waypoint-ledger.pages.dev}"
ORIGIN="${ORIGIN%/}"
FAIL=0
PASS=0

say()  { printf '%s\n' "$*"; }
ok()   { PASS=$((PASS+1)); printf '  ok    %s\n' "$*"; }
fail() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n' "$*"; }

HEADERS="$(curl -sS -m 20 -D - -o /dev/null "$ORIGIN/" 2>/dev/null | tr 'A-Z' 'a-z')"
[ -n "$HEADERS" ] || { say "no answer from $ORIGIN"; exit 2; }

say "verify-live: $ORIGIN"
say "security headers on /"
for h in content-security-policy strict-transport-security x-frame-options x-content-type-options referrer-policy permissions-policy; do
  if printf '%s' "$HEADERS" | grep -q "^$h:"; then ok "$h"; else fail "$h is missing"; fi
done

say "cors preflight"
CODE="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' -X OPTIONS "$ORIGIN/api/survey")"
[ "$CODE" = "204" ] && ok "OPTIONS /api/survey -> 204" || fail "OPTIONS /api/survey -> $CODE (expected 204: the middleware is not live)"

say "endpoints"
check_json() { # path, jq-free grep pattern, label
  local body code
  body="$(curl -sS -m 20 -w $'\n%{http_code}' "$ORIGIN$1")"
  code="$(printf '%s' "$body" | tail -n1)"
  body="$(printf '%s' "$body" | sed '$d')"
  if [ "$code" != "200" ]; then fail "$3 -> HTTP $code"; return; fi
  if printf '%s' "$body" | grep -q "$2"; then ok "$3"; else fail "$3 answered 200 but not with $2"; fi
}
# A BIG FILE IS CHECKED BY ITS FIRST 4 KB, NEVER SLURPED.
# Round 3 got one red light out of twenty-seven and it was this script's fault:
# check_json pulled the whole 2.5 MB locality CSV into a shell variable and then
# could not find a comma in it. The file was healthy the whole time. A gate that
# cries wolf on a healthy file is worse than no gate, because the next red one
# gets waved through. Anything over ~64 KB is checked with a Range request.
check_head() { # path, grep pattern, label — reads only the first 4 KB
  local code body
  body="$(curl -sS -m 30 -r 0-4095 -w $'\n%{http_code}' "$ORIGIN$1" 2>/dev/null)"
  code="$(printf '%s' "$body" | tail -n1)"
  body="$(printf '%s' "$body" | sed '$d' | head -c 4096)"
  case "$code" in
    200|206) : ;;
    *) fail "$3 -> HTTP $code"; return ;;
  esac
  if printf '%s' "$body" | grep -q "$2"; then ok "$3 (first 4 KB, HTTP $code)"; else fail "$3 answered $code but its first 4 KB do not match $2"; fi
}

check_json "/api/health"    '"ok":true'   "GET /api/health"
check_json "/api/integrity" '"genesis"'   "GET /api/integrity"
check_json "/api/corrections" '"ok":true' "GET /api/corrections"
# >>> API LANE (BUILD-4) — the reuse surface is only real if it is live >>>
check_json "/api/citation/cms-99213" '"agencyFullName"' "citation carries the publisher"
check_head "/data/locality-prices.csv" "^price_id,code,label,state,locality" "locality price table published (CSV; the 2.4 MB JSON is checked by tests/locality-table.test.ts)"
CODE="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' -X POST "$ORIGIN/api/price" -H 'content-type: application/json' -d '{"story":"a doctor visit","state":"ZZ"}')"
[ "$CODE" = "400" ] && ok "unknown state is refused, not ignored" || fail "POST /api/price {state:ZZ} -> $CODE"
# <<< API LANE (BUILD-4) <<<

say "the register's own claims"
CSV="$(curl -sS -m 20 "$ORIGIN/api/export/corrections.csv")"
# The header row, not line 1: BUILD-7's data lane put a provenance preamble
# above it (a `#` line naming the price table, the counting date and what the
# counts are not). `head -n1` read that comment and reported a healthy export as
# broken — the same shape of false red that Round 3's 2.5 MB slurp produced. A
# gate that cries wolf on a healthy file is worse than no gate.
CSV_HEADER="$(printf '%s' "$CSV" | grep -v '^[[:space:]]*#' | grep -v '^[[:space:]]*$' | head -n1)"
printf '%s' "$CSV_HEADER" | grep -q 'row_hash' && ok "corrections.csv carries row_hash" || fail "corrections.csv has no row_hash column"
if printf '%s' "$CSV" | tail -n +2 | grep -qE '(^|,)[=+@]'; then
  fail "a csv cell begins with a formula character and was not escaped"
else
  ok "no unescaped formula cell in corrections.csv"
fi

# >>> OPS LANE (BUILD-6) — the site must name a build a judge can go and read >>>
# Round 3 read live /build.json as commit a982b3bc4 with dirty:true, thirty-eight
# minutes older than the work it was supposed to carry. A stamp that names no
# commit turns "we fixed that" and "the site does that" into two claims with no
# way to join them. scripts/deploy.sh refuses a dirty tree; this proves the
# artifact that actually reached the origin kept that promise.
say "the build stamp"
BJ="$(curl -sS -m 20 "$ORIGIN/build.json" 2>/dev/null)"
LIVE_SHA="$(printf '%s' "$BJ" | sed -n 's/.*"commit": *"\([0-9a-f]*\)".*/\1/p' | head -1)"
LIVE_DIRTY="$(printf '%s' "$BJ" | grep -o '"dirty": *[a-z]*' | head -1 | sed 's/.*: *//')"  # BSD sed has no \| alternation
if [ -z "$LIVE_SHA" ] || [ "$LIVE_SHA" = "unknown" ]; then
  fail "/build.json names no commit"
else
  # A dirty stamp is normal on a laptop and a broken promise on the origin, so
  # it is judged by where it is being served from. scripts/deploy.sh refuses a
  # dirty tree outright, so nothing dirty can reach a real origin in the first
  # place; this is the second lock on that door.
  if [ "$LIVE_DIRTY" = "false" ]; then
    ok "/build.json is stamped clean ($LIVE_SHA)"
  else
    case "$ORIGIN" in
      http://127.0.0.1*|http://localhost*|http://0.0.0.0*)
        say "  (this local build is stamped dirty, which is what a working tree is for — not counted as a pass)" ;;
      *)
        fail "/build.json is stamped dirty ($LIVE_SHA): the published artifact matches no commit" ;;
    esac
  fi
  # merge-base --is-ancestor, never `rev-list | grep -q`: under `set -o pipefail`
  # grep -q closes the pipe, git takes SIGPIPE, and the pipeline reports failure
  # on a commit it just found. That is how this check first went red on a commit
  # that was in fact an ancestor.
  APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
  if git -C "$APP_DIR" rev-parse HEAD >/dev/null 2>&1; then
    if git -C "$APP_DIR" merge-base --is-ancestor "$LIVE_SHA" HEAD 2>/dev/null; then
      ok "the live commit is in this checkout's history"
    else
      fail "the live commit $LIVE_SHA is not an ancestor of HEAD in this checkout"
    fi
  else
    say "  (no git checkout here, so the commit could not be joined to a history — not counted as a pass)"
  fi
fi
# <<< OPS LANE (BUILD-6) <<<

say "the small tells"
for path in /.well-known/security.txt /robots.txt /integrity /accessibility; do
  CODE="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' "$ORIGIN$path")"
  [ "$CODE" = "200" ] && ok "$path" || fail "$path -> $CODE"
done
CODE="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' "$ORIGIN/this-page-does-not-exist")"
[ "$CODE" = "404" ] && ok "an unknown path returns 404" || fail "an unknown path returned $CODE"
BODY="$(curl -sS -m 20 "$ORIGIN/this-page-does-not-exist")"
printf '%s' "$BODY" | grep -q 'That page is not here' && ok "the 404 page is ours" || fail "the 404 page is not the branded one"

# the write path, proven without a row in the public register
. "$(cd "$(dirname "$0")" && pwd)/verify-write.sh"

# >>> AUTH LANE (BUILD-4) — the account door, proven by using it >>>
# Round 2 found sign-in answering HTTP 500 on the live origin while 21 tests
# passed in Node: the Workers runtime refuses PBKDF2 above 100,000 iterations
# and nothing but the runtime says so. Reading a page cannot catch that. So this
# block makes a real account at an address that cannot receive mail
# (@verify.invalid, RFC 2606), signs in with it, and deletes it again. If the
# delete does not happen, the script fails loudly rather than leaving a row.
#
# It writes no row to the public register: no correction, no gap report, no
# survey. A users row that is created and erased inside one run, and the
# aggregate counters, are the whole footprint.
#
#   VERIFY_READ_ONLY=1 bash cf/verify-live.sh    # skips exactly this block
say "the account door (a throwaway account, created and erased)"
if [ "${VERIFY_READ_ONLY:-0}" = "1" ]; then
  say "  skip  VERIFY_READ_ONLY=1"
else
  RAND="$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 10)"
  ACCT="zz-verify-$RAND@verify.invalid"
  PWORD='ames iowa winter lane'
  JAR="$(mktemp -t wlverify)"

  post_code() { # url, json body, [extra curl args...]
    local u="$1"; local d="$2"; shift 2
    curl -sS -m 30 -o "$JAR.body" -w '%{http_code}' -X POST "$u" -H 'content-type: application/json' -d "$d" "$@" 2>/dev/null
  }

  CODE="$(post_code "$ORIGIN/api/auth/password/signup" "{\"email\":\"$ACCT\",\"password\":\"$PWORD\"}" -c "$JAR")"
  if [ "$CODE" = "200" ]; then ok "POST /api/auth/password/signup -> 200"; else fail "POST /api/auth/password/signup -> $CODE (this is the request that answered 500 with Cloudflare 1101)"; fi
  if grep -q '"recoveryCode"' "$JAR.body" 2>/dev/null; then ok "sign-up returns a recovery code"; else fail "sign-up returned no recovery code"; fi

  CODE="$(post_code "$ORIGIN/api/auth/password/login" "{\"email\":\"$ACCT\",\"password\":\"$PWORD\"}" -c "$JAR")"
  [ "$CODE" = "200" ] && ok "POST /api/auth/password/login -> 200" || fail "POST /api/auth/password/login -> $CODE"

  # The two failures that must never be a 5xx: a 500 here is the KDF throwing
  # (iteration cap) or the CPU budget running out, and both are invisible locally.
  CODE="$(post_code "$ORIGIN/api/auth/password/login" "{\"email\":\"$ACCT\",\"password\":\"a different phrase here\"}")"
  [ "$CODE" = "401" ] && ok "a wrong password -> 401" || fail "a wrong password -> $CODE (401 expected; a 5xx means the KDF threw)"
  CODE="$(post_code "$ORIGIN/api/auth/password/login" "{\"email\":\"zz-nobody-$RAND@verify.invalid\",\"password\":\"$PWORD\"}")"
  [ "$CODE" = "401" ] && ok "an address with no account -> 401" || fail "an address with no account -> $CODE (401 expected; a 5xx means the decoy hash threw)"

  CODE="$(curl -sS -m 30 -o "$JAR.body" -w '%{http_code}' -X DELETE "$ORIGIN/api/me" -b "$JAR" 2>/dev/null)"
  if [ "$CODE" = "200" ]; then ok "DELETE /api/me erased the throwaway account"; else fail "DELETE /api/me -> $CODE — A TEST ACCOUNT MAY BE LEFT ON $ORIGIN ($ACCT)"; fi
  CODE="$(post_code "$ORIGIN/api/auth/password/login" "{\"email\":\"$ACCT\",\"password\":\"$PWORD\"}")"
  [ "$CODE" = "401" ] && ok "the erased account no longer signs in" || fail "the erased account still answers $CODE"

  # An anonymous save must be removable by the person who made it.
  CODE="$(post_code "$ORIGIN/api/journeys" '{"entries":[{"raw":"saw my regular doctor three times","itemId":"cms-99213","times":3}],"title":"verify-live round trip"}')"
  if [ "$CODE" = "200" ]; then
    ok "POST /api/journeys -> 200"
    SLUG="$(sed -n 's/.*"slug":"\([a-z0-9]*\)".*/\1/p' "$JAR.body")"
    TOKEN="$(sed -n 's/.*"deleteToken":"\([a-z0-9]*\)".*/\1/p' "$JAR.body")"
    if [ -n "$TOKEN" ]; then ok "an anonymous save returns a delete code"; else fail "an anonymous save returned no delete code"; fi
    CODE="$(curl -sS -m 30 -o /dev/null -w '%{http_code}' -X DELETE "$ORIGIN/api/journeys/$SLUG" -H "x-delete-token: $TOKEN" 2>/dev/null)"
    if [ "$CODE" = "200" ]; then ok "the delete code removes the save, with no account"; else fail "DELETE /api/journeys/$SLUG -> $CODE — A TEST JOURNEY MAY BE LEFT ON $ORIGIN ($SLUG)"; fi
    CODE="$(curl -sS -m 30 -o /dev/null -w '%{http_code}' "$ORIGIN/api/journeys/$SLUG" 2>/dev/null)"
    [ "$CODE" = "404" ] && ok "the deleted link no longer opens" || fail "the deleted link answers $CODE"
  else
    fail "POST /api/journeys -> $CODE"
  fi
  rm -f "$JAR" "$JAR.body"
fi
# <<< AUTH LANE (BUILD-4) <<<

say ""
say "$PASS ok, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1

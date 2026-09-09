# ==========================================================================
# verify-write.sh — prove the WRITE path, with no row in the public register.
#
# Sourced by verify-live.sh (it uses that script's ORIGIN, ok() and fail()).
# Round 2's finding: every register table held zero rows, so no write had ever
# been proven in production, and a deploy could publish a site whose forms all
# 500 without a single check going red.
#
# Three things are checked, none of which leaves a row anybody reads:
#   1. ?dry=1 on a public write runs the real validator and the real storage
#      check and returns 200 without inserting — and the published count does
#      not move across it.
#   2. ?dry=1 with a figure that is not published is still refused, so check 1
#      cannot be passing because validation was skipped.
#   3. With ADMIN_TOKEN in the environment, POST /api/health writes and deletes
#      a row in `canary` inside one D1 batch: the INSERT itself, proven, in a
#      table outside every chain, every export and every aggregate.
#   4. WITHOUT any token — the run an outside agency actually makes — the same
#      write path is proven from production's own published record of it:
#      GET /api/health carries the canary stamp and how long after THIS build
#      it was written. Round 4 found the token-gated check red on every run an
#      outsider could make, on the page that asks them to adopt us.
# ==========================================================================

say "the write path (nothing is written to the register)"

WV_N_BEFORE="$(curl -sS -m 20 "$ORIGIN/api/corrections" | grep -o '"flaggedWrong":[0-9]*' | head -n1)"
WV_PRICE_ID="$(curl -sS -m 20 "$ORIGIN/api/table" | grep -o '"id":"[^"]*"' | head -n1 | sed 's/.*:"//;s/"//')"
if [ -z "$WV_PRICE_ID" ]; then
  fail "no published figure could be read from /api/table, so the write path cannot be checked"
else
  WV_BODY="$(curl -sS -m 20 -X POST "$ORIGIN/api/corrections?dry=1" -H 'content-type: application/json' \
    -d "{\"priceId\":\"$WV_PRICE_ID\",\"verdict\":\"right\"}" -w $'\n%{http_code}')"
  WV_CODE="$(printf '%s' "$WV_BODY" | tail -n1)"
  WV_JSON="$(printf '%s' "$WV_BODY" | sed '$d')"
  if [ "$WV_CODE" != "200" ]; then
    fail "POST /api/corrections?dry=1 -> HTTP $WV_CODE (the write path is not answering)"
  elif printf '%s' "$WV_JSON" | grep -q '"dryRun":true'; then
    ok "POST /api/corrections?dry=1 accepted a valid correction without writing it"
  else
    fail "POST /api/corrections?dry=1 answered 200 but not as a dry run: $(printf '%s' "$WV_JSON" | head -c 120)"
  fi
  if printf '%s' "$WV_JSON" | grep -q '"ok":true.*"storage"' || printf '%s' "$WV_JSON" | grep -q '"storage":{"ok":true'; then
    ok "the dry run reached D1: the table and its chain head are there"
  else
    fail "the dry run did not reach D1 (storage.ok is not true)"
  fi
  WV_N_AFTER="$(curl -sS -m 20 "$ORIGIN/api/corrections" | grep -o '"flaggedWrong":[0-9]*' | head -n1)"
  if [ "$WV_N_BEFORE" = "$WV_N_AFTER" ]; then ok "the published count did not move across the dry run"; else fail "the dry run changed the published count ($WV_N_BEFORE -> $WV_N_AFTER)"; fi

  WV_CODE="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' -X POST "$ORIGIN/api/corrections?dry=1" \
    -H 'content-type: application/json' -d '{"priceId":"not-a-published-figure","verdict":"right"}')"
  [ "$WV_CODE" = "400" ] && ok "a dry run still refuses a figure that is not published" || fail "a dry run accepted an unpublished figure (HTTP $WV_CODE)"
fi

# 3a. THE REAL CANARY — only the deploying shell can run it, and there it is a
#     hard failure. Run FIRST so that the public proof below reads the stamp
#     this run just made rather than the previous deploy's.
if [ -n "${ADMIN_TOKEN:-}" ]; then
  WV_BODY="$(curl -sS -m 25 -X POST "$ORIGIN/api/health" -H "authorization: Bearer $ADMIN_TOKEN" -w $'\n%{http_code}')"
  WV_CODE="$(printf '%s' "$WV_BODY" | tail -n1)"
  WV_JSON="$(printf '%s' "$WV_BODY" | sed '$d')"
  if [ "$WV_CODE" = "200" ] && printf '%s' "$WV_JSON" | grep -q '"writePath":{"ok":true'; then
    ok "the D1 write canary round-tripped ($(printf "%s" "$WV_JSON" | grep -o "\"ms\":[0-9]*" | head -n1 | sed "s/.*://") ms)"
  else
    fail "the D1 write canary did not succeed (HTTP $WV_CODE)"
  fi
  printf '%s' "$WV_JSON" | grep -q '"rowsLeftBehind":0' && ok "the canary left no row behind" || fail "the canary left a row behind"
elif [ "${VERIFY_NO_WRITE:-0}" = "1" ]; then
  say "  skip  write canary (VERIFY_NO_WRITE=1, asked for deliberately). Not counted as a pass."
else
  say "  note  the write canary needs ADMIN_TOKEN and is for the deploying shell; the check below proves the same write path without it."
fi

# 3b. THE WRITE PROOF AN OUTSIDER CAN CHECK — no secret, no row, no trust.
#
# ROUND 4 FOUND THE HONEST GATE PERMANENTLY RED FOR EVERY HONEST READER.
# /adopt invites an agency to run this script. R3's rule was right and landed —
# a skip must never print `ok` — and its consequence was that the one check
# proving an INSERT reaches D1 failed on every run anyone outside this laptop
# could make: `28 ok, 1 failed`, and the failure was structural, because they
# can never hold ADMIN_TOKEN. A gate that cannot be green for its own audience
# is not a gate, it is a warning label.
#
# What changed: production stamps KV every time the canary writes, and
# GET /api/health now publishes that stamp beside the build it belongs to.
# So the stranger checks production's own record of a successful write instead
# of being asked for our secret. It is still a real check — it goes red if the
# write path has never run, or ran against a different artifact than the one
# answering (see `provenForThisBuild` in cf/functions/api/health.js).
WV_H="$(curl -sS -m 20 "$ORIGIN/api/health")"
WV_PROVEN="$(printf '%s' "$WV_H" | grep -o '"provenForThisBuild":[a-z]*' | head -n1 | sed 's/.*://')"
WV_AT="$(printf '%s' "$WV_H" | grep -o '"lastWriteOkAt":"[^"]*"' | head -n1 | sed 's/.*:"//;s/"//')"
WV_AFTER="$(printf '%s' "$WV_H" | grep -o '"secondsAfterBuild":-\{0,1\}[0-9]*' | head -n1 | sed 's/.*://')"
if [ "$WV_PROVEN" = "true" ]; then
  ok "the write path was exercised on this origin ${WV_AFTER}s after the build now answering was published (canary stamp $WV_AT, read from /api/health with no token)"
elif [ -z "$WV_PROVEN" ]; then
  fail "/api/health carries no write proof (no canary field): this origin cannot say whether a write has ever reached its database"
else
  # Named separately so the red line says which of the two things is wrong.
  if [ -z "$WV_AT" ]; then
    WV_WHY="no successful write has ever been stamped"
  elif [ -z "$WV_AFTER" ]; then
    WV_WHY="a write was stamped ($WV_AT) but it cannot be joined to this build's own timestamp"
  else
    WV_WHY="the last successful write ($WV_AT) is ${WV_AFTER}s from this build, so it belongs to a different artifact than the one answering"
  fi
  case "$ORIGIN" in
    http://127.0.0.1*|http://localhost*|http://0.0.0.0*)
      say "  skip  the write proof on a local origin: $WV_WHY. Not counted as a pass." ;;
    *)
      fail "the write path is not proven on $ORIGIN: $WV_WHY" ;;
  esac
fi

WV_JSON="$(curl -sS -m 20 "$ORIGIN/api/health")"
printf '%s' "$WV_JSON" | grep -q '"build":{"commit":"' && ok "the site states which build is answering ($(printf '%s' "$WV_JSON" | grep -o '"commit":"[^"]*"' | head -n1 | sed 's/.*:"//;s/"//'))" || fail "/api/health does not carry a build stamp"

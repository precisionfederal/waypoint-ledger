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
  # A SKIP MUST NEVER PRINT ok. Round 3's read: production `lastWriteOkAt` was
  # null, every register table was 0, and this line printed `ok write canary
  # skipped` on every run — so the one check that proves an INSERT reaches D1
  # had never run, and the gate said green. A local origin is exempt (its D1 is
  # a file on this laptop and the canary proves nothing about production); a
  # real origin with no ADMIN_TOKEN in the shell is now a failure, and
  # VERIFY_NO_WRITE=1 is the deliberate way to say "not this run".
  case "$ORIGIN" in
    http://127.0.0.1*|http://localhost*|http://0.0.0.0*)
      say "  skip  write canary (local origin; the canary is about production D1). Not counted as a pass." ;;
    *)
      fail "the write canary did not run: ADMIN_TOKEN is not in this shell, so no INSERT has been proven on $ORIGIN. Export it, or pass VERIFY_NO_WRITE=1 to say so on purpose." ;;
  esac
fi

WV_JSON="$(curl -sS -m 20 "$ORIGIN/api/health")"
printf '%s' "$WV_JSON" | grep -q '"build":{"commit":"' && ok "the site states which build is answering ($(printf '%s' "$WV_JSON" | grep -o '"commit":"[^"]*"' | head -n1 | sed 's/.*:"//;s/"//'))" || fail "/api/health does not carry a build stamp"

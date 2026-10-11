#!/bin/bash
# ==========================================================================
# deploy-preview.sh — publish tonight's tree to a PREVIEW branch of the
# waypoint-ledger Pages project, bound to STAGING data. Never production.
#
#   bash scripts/deploy-preview.sh               build + deploy to branch beta-night
#   bash scripts/deploy-preview.sh <branch>      another preview branch (never main/production)
#   BUILD_ONLY=1 bash scripts/deploy-preview.sh  build cf/out-preview and stop
#   SKIP_BUILD=1 bash scripts/deploy-preview.sh  deploy the cf/out-preview already built
#
# Why this is safe: a deploy to any branch other than the project's production
# branch (main) takes its bindings from [env.preview] in cf/wrangler.toml, which
# points at D1 waypoint-ledger-staging and KV waypoint-ledger-staging. The script
# refuses main/production/master, refuses if [env.preview] is missing or names
# the production D1, and after the upload it reads (GET only) both origins and
# stops loudly if the preview answers with production's register counts.
#
# It never runs migrations, never deploys cf/out, and never writes to production.
# Staging migrations, once per new migration file:
#   (cd cf && npx wrangler d1 migrations apply waypoint-ledger-staging --remote --env preview)
# ==========================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="waypoint-ledger"
PROD_DB="3c6cf7a7-e060-48fd-9e1f-646eb89ad461"
PROD_ORIGIN="https://waypoint-ledger.pages.dev"
BRANCH="${1:-beta-night}"
OUT_NAME="out-preview"

die() { printf '\n\033[31mPREVIEW DEPLOY STOPPED: %s\033[0m\n' "$*" >&2; exit 1; }

# 1. never a production branch
case "$(printf '%s' "$BRANCH" | tr '[:upper:]' '[:lower:]')" in
  main|production|prod|master|"") die "branch '$BRANCH' is production or empty; this script only deploys preview branches" ;;
esac
printf '%s' "$BRANCH" | grep -Eq '^[a-z0-9][a-z0-9-]{0,27}$' || die "branch '$BRANCH' must be lowercase letters, digits and dashes (it becomes a subdomain)"

# 2. the preview block must exist and must not name the production database
TOML="$ROOT/cf/wrangler.toml"
PREVIEW_BLOCK="$(sed -n '/^\[\[env\.preview\.d1_databases\]\]/,/^\[/p' "$TOML")"
[ -n "$PREVIEW_BLOCK" ] || die "cf/wrangler.toml has no [[env.preview.d1_databases]]; a preview deploy would have no staging database"
printf '%s' "$PREVIEW_BLOCK" | grep -q "$PROD_DB" && die "[env.preview] names the production D1 ($PROD_DB)"
grep -q '^\[\[env\.preview\.kv_namespaces\]\]' "$TOML" || die "cf/wrangler.toml has no [[env.preview.kv_namespaces]]"
STAGING_DB="$(printf '%s' "$PREVIEW_BLOCK" | sed -n 's/^database_id *= *"\(.*\)"/\1/p' | head -1)"
printf 'branch %s · staging D1 %s\n' "$BRANCH" "$STAGING_DB"

# 3. build (stamp build.json first, so /api/health and /build.json name this tree)
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  ( cd "$ROOT" && node scripts/gen-build-json.mjs )
  ( cd "$ROOT" && OUT_NAME="$OUT_NAME" bash cf/build-static.sh ) >/tmp/wl-preview-build.$$ 2>&1 \
    || { tail -30 /tmp/wl-preview-build.$$; rm -f /tmp/wl-preview-build.$$; die "the static export failed"; }
  tail -1 /tmp/wl-preview-build.$$; rm -f /tmp/wl-preview-build.$$
fi
[ -f "$ROOT/cf/$OUT_NAME/build.json" ] || die "cf/$OUT_NAME/build.json is missing; build first"
STAMP="$(sed -n 's/.*"shortCommit": *"\([^"]*\)".*/\1/p' "$ROOT/cf/$OUT_NAME/build.json" | head -1)"
DIRTY="$(grep -o '"dirty": *[a-z]*' "$ROOT/cf/$OUT_NAME/build.json" | head -1 | sed 's/.*: *//')"
printf 'cf/%s stamped %s dirty=%s\n' "$OUT_NAME" "$STAMP" "$DIRTY"
[ "${BUILD_ONLY:-0}" = "1" ] && { printf 'BUILD_ONLY=1: built, not deployed.\n'; exit 0; }

# 4. deploy to the preview branch
( cd "$ROOT/cf" && npx wrangler pages deploy "$OUT_NAME" --project-name "$PROJECT" --branch "$BRANCH" --commit-dirty=true )

# 5. read both origins, GET only, and refuse to call it done if preview answers with production's data
ALIAS="https://$BRANCH.$PROJECT.pages.dev"
printf '\npreview alias %s (waiting for it to serve %s)\n' "$ALIAS" "$STAMP"
SEEN=""
for _ in $(seq 1 30); do
  SEEN="$(curl -fsS -m 10 "$ALIAS/api/health" 2>/dev/null | sed -n 's/.*"build":{"commit":"\([^"]*\)".*/\1/p')" || true
  [ "$SEEN" = "$STAMP" ] && break
  sleep 5
done
[ "$SEEN" = "$STAMP" ] || die "the preview alias did not serve build $STAMP within 150 s (last seen: ${SEEN:-nothing})"
survey_n() { curl -fsS -m 15 "$1/api/register" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const n=(k)=>j[k]?.n??j[k]?.total??j[k]?.count??"?";console.log(`survey ${n("survey")} interviews ${n("interviews")}`)})'; }
P="$(survey_n "$ALIAS")"; L="$(survey_n "$PROD_ORIGIN")"
printf 'preview    %s\nproduction %s\n' "$P" "$L"
if [ "$P" = "$L" ] && [ "$P" != "survey 0 interviews 0" ]; then
  die "the preview shows production's register counts; it may be bound to production data. POST nothing to it."
fi
printf '\n\033[32mpreview %s serves %s on staging data\033[0m\n' "$ALIAS" "$STAMP"

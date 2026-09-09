#!/bin/bash
# Static export of the Waypoint Ledger for Cloudflare Pages. The Node API routes are
# replaced by cf/functions/api/*.js (same contracts, KV storage). Output: cf/out
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_NAME="${OUT_NAME:-out}"
STAGE="$ROOT/cf/.stage-$OUT_NAME"
( cd "$ROOT" && node scripts/gen-dictionary.mjs 2>/dev/null && node scripts/gen-price-table.mjs 2>/dev/null && node scripts/gen-locality-table.mjs 2>/dev/null )
# The /privacy field table is generated from cf/migrations/*.sql, the write-path
# validators, the integrity projection and the CSV header. NEVER silence this one:
# a column with no plain-English line in data/column-glossary.json must fail the build,
# which is the whole reason the page can be trusted.
( cd "$ROOT" && node scripts/gen-privacy.mjs )
# >>> OPEN-DATA LANE (BUILD-6) — the catalog a harvester reads, the licence a
# counsel reads, and the source a stranger downloads, all rebuilt from the tree
# so none of the three can go stale against what is actually shipping. >>>
( cd "$ROOT" && node scripts/gen-data-json.mjs )
# (the public export step runs only in the upstream working tree)
# <<< OPEN-DATA LANE (BUILD-6) <<<
rm -rf "$STAGE" "$ROOT/cf/$OUT_NAME"; mkdir -p "$STAGE"
rsync -a --exclude node_modules --exclude .next --exclude cf --exclude shots --exclude shots2 --exclude tests --exclude .wrangler --exclude WORK-ORDERS --exclude 'app/api' --exclude 'data/*.jsonl' "$ROOT/" "$STAGE/"
ln -s "$ROOT/node_modules" "$STAGE/node_modules"
cat > "$STAGE/next.config.mjs" <<'CFG'
/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true, output: 'export', images: { unoptimized: true } };
export default nextConfig;
CFG
( cd "$STAGE" && npx next build )
mv "$STAGE/out" "$ROOT/cf/$OUT_NAME"
rm -rf "$STAGE"
echo "static export at $ROOT/cf/$OUT_NAME"; ls "$ROOT/cf/$OUT_NAME" | head -20

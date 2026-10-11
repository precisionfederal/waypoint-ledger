#!/bin/bash
# The ONE way to run a local wrangler pages dev for waypoint-app.
# 2026-09-10: 63 stale `pages dev` servers (289 node procs, 16.6 GB, swap full)
# piled up because every launch started a new server and never stopped the last.
# This stops every previous waypoint dev server first, then starts one.
set -euo pipefail
PORT="${1:-8899}"
pids=$(ps -Ao pid,args | grep -E "waypoint-app.*wrangler-dist/cli.js pages dev|wp-deploy.*pages dev" | grep -v grep | awk '{print $1}' || true)
[ -n "$pids" ] && { echo "stopping previous dev servers: $pids"; kill -TERM $pids 2>/dev/null || true; sleep 3; kill -KILL $pids 2>/dev/null || true; }
pgrep -x workerd | xargs kill -KILL 2>/dev/null || true
pgrep -x esbuild | xargs kill -KILL 2>/dev/null || true
cd "$(dirname "$0")/.."
exec npx wrangler pages dev out --port "$PORT" --persist-to cf/.wrangler/state-dev --d1 DB=3c6cf7a7-e060-48fd-9e1f-646eb89ad461 --kv LEDGER

#!/bin/bash
# Prints the written interviews from the live KV store (prefix int:). PRIVATE: never served by the site.
# Needs the wrangler OAuth token on this Mac. Usage: bash scripts/read-interviews.sh [survey]   (survey prints the raw survey rows instead)
set -euo pipefail
# The account and KV namespace ids come from the environment or from the ids file
# outside the repository (WL_IDS_FILE overrides its path); they are never published.
IDS="${WL_IDS_FILE:-$HOME/.config/precision-federal/waypoint-ids.env}"
if [ -z "${CF_ACCOUNT_ID:-}" ] || [ -z "${WL_KV_ID:-}" ]; then [ -r "$IDS" ] && . "$IDS"; fi
PRE="${1:-int}:"
ACC="${CF_ACCOUNT_ID:?read-interviews: set CF_ACCOUNT_ID (or put it in $IDS)}"
NS="${WL_KV_ID:?read-interviews: set WL_KV_ID, the LEDGER KV namespace id (or put it in $IDS)}"
TOK=$(python3 -c "import re;print(re.search(r'oauth_token\s*=\s*\"([^\"]+)\"',open('$HOME/Library/Preferences/.wrangler/config/default.toml').read()).group(1))")
API="https://api.cloudflare.com/client/v4/accounts/$ACC/storage/kv/namespaces/$NS"
for k in $(curl -s -H "Authorization: Bearer $TOK" "$API/keys?prefix=$PRE&limit=1000" | python3 -c "import sys,json;[print(k['name']) for k in json.load(sys.stdin)['result']]"); do
  ek=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$k")
  echo "=== $k"; curl -s -H "Authorization: Bearer $TOK" "$API/values/$ek" | python3 -m json.tool
done

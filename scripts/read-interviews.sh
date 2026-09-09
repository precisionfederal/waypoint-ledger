#!/bin/bash
# Prints the written interviews from the live KV store (prefix int:). PRIVATE: never served by the site.
# Needs the wrangler OAuth token on this Mac. Usage: bash scripts/read-interviews.sh [survey]   (survey prints the raw survey rows instead)
set -euo pipefail
PRE="${1:-int}:"; ACC=b16cccaf0099ee0f9751c7e73bd8c7c7; NS=67110cc1483c4af89975e6786c62acee
TOK=$(python3 -c "import re;print(re.search(r'oauth_token\s*=\s*\"([^\"]+)\"',open('$HOME/Library/Preferences/.wrangler/config/default.toml').read()).group(1))")
API="https://api.cloudflare.com/client/v4/accounts/$ACC/storage/kv/namespaces/$NS"
for k in $(curl -s -H "Authorization: Bearer $TOK" "$API/keys?prefix=$PRE&limit=1000" | python3 -c "import sys,json;[print(k['name']) for k in json.load(sys.stdin)['result']]"); do
  ek=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$k")
  echo "=== $k"; curl -s -H "Authorization: Bearer $TOK" "$API/values/$ek" | python3 -m json.tool
done

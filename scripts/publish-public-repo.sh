#!/usr/bin/env bash
# Publish the public export to github.com/precisionfederal/waypoint-ledger.
# The export dir (../waypoint-public) is wiped on every static build, so the git
# mirror lives beside it in ../waypoint-public-git and is rsynced from the export.
# Run only after Bo's yes (given 2026-09-09). Never copies secrets: the export
# script already excludes cf/.dev.vars, .wrangler, backups and the register.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
EXPORT="$HERE/../waypoint-public"
MIRROR="$HERE/../waypoint-public-git"
MSG="${1:-sync from the private working tree $(date -u +%Y-%m-%dT%H:%MZ)}"
bash "$HERE/scripts/export-public-repo.sh" >/dev/null
[ -d "$MIRROR/.git" ] || gh repo clone precisionfederal/waypoint-ledger "$MIRROR" -- -q
rsync -a --delete --exclude .git --exclude node_modules "$EXPORT/" "$MIRROR/"
cd "$MIRROR"
if grep -rIl -e "ADMIN_TOKEN=" -e "INTERVIEW_KEY=" -e "BEGIN PRIVATE" -e "650-966" . --exclude-dir=.git | grep -v "scripts/deploy.sh\|scripts/rotate-secrets.sh\|scripts/publish-public-repo.sh\|docs/RUNBOOK.md" ; then echo "REFUSED: a secret-shaped string is in the export"; exit 2; fi
# The lockfile must let `npm ci` run in CI.
npm install --package-lock-only --ignore-scripts >/dev/null 2>&1
git add -A
git -c user.name="Bo Peng" -c user.email="bo@precisionfederal.com" commit -q -m "$MSG" || { echo "nothing to publish"; exit 0; }
git push -q origin main
echo "published $(git rev-parse --short HEAD) → https://github.com/precisionfederal/waypoint-ledger"

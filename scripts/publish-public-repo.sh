#!/usr/bin/env bash
# Publish the public export to github.com/precisionfederal/waypoint-ledger.
# The export dir (../waypoint-public) is wiped on every static build, so the git
# mirror lives beside it in ../waypoint-public-git and is rsynced from the export.
# Run only after Bo's yes (given 2026-09-09). Never copies secrets: the export
# script already excludes cf/.dev.vars, .wrangler, backups and the register.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
# Private strings (personal numbers, home paths, internal names, account ids) are
# never written in this tree, not even as scan patterns. They live one regex per
# line outside it; see scripts/export-public-repo.sh. No deny-list, no publish.
DENY="${PF_EXPORT_DENY:-$HOME/.config/precision-federal/export-deny.txt}"
refuse() { printf 'REFUSED: %s\n' "$*" >&2; }
if [ ! -s "$DENY" ] || [ ! -r "$DENY" ]; then
  refuse "the deny-list $DENY is missing or empty. Nothing is published without it."; exit 2
fi
# deny_scan <dir>: prints the file, line numbers and deny-list line, never the text.
deny_scan() {
  local dir="$1" n=0 hit=0 pat files names f lines
  while IFS= read -r pat || [ -n "$pat" ]; do
    n=$((n+1))
    case "$pat" in ''|'#'*) continue ;; esac
    if printf '' | grep -qiE -e "$pat" 2>/dev/null; [ "$?" -ge 2 ]; then
      refuse "deny-list line $n is not a valid extended regex ($DENY)"; hit=1; continue
    fi
    files="$(cd "$dir" && grep -rlaiE --exclude-dir=.git --exclude-dir=node_modules -e "$pat" . 2>/dev/null)" || true
    if [ -n "$files" ]; then
      while IFS= read -r f; do
        lines="$(cd "$dir" && { grep -naiE -e "$pat" "$f" 2>/dev/null | LC_ALL=C cut -d: -f1 | head -20 | tr '\n' ','; } || true)"
        refuse "${f#./}:${lines%,} matches deny-list line $n"; hit=1
      done <<< "$files"
    fi
    names="$(cd "$dir" && { find . \( -name .git -o -name node_modules \) -prune -o -print | grep -iE -e "$pat" || true; })"
    if [ -n "$names" ]; then
      while IFS= read -r f; do refuse "the file name ${f#./} matches deny-list line $n"; hit=1; done <<< "$names"
    fi
  done < "$DENY"
  [ "$hit" = 0 ] || return 2
}
EXPORT="$HERE/../waypoint-public"
MIRROR="$HERE/../waypoint-public-git"
MSG="${1:-sync from the private working tree $(date -u +%Y-%m-%dT%H:%MZ)}"
bash "$HERE/scripts/export-public-repo.sh" >/dev/null || { refuse "the export refused (reasons above). Nothing was published."; exit 2; }
[ -d "$MIRROR/.git" ] || gh repo clone precisionfederal/waypoint-ledger "$MIRROR" -- -q
rsync -a --delete --exclude .git --exclude node_modules "$EXPORT/" "$MIRROR/"
cd "$MIRROR"
# A secret VALUE, not a variable name: 16+ token characters after the "=", or a PEM header.
if grep -rIlE -e "(ADMIN_TOKEN|INTERVIEW_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY)=[\"']?[A-Za-z0-9_-]{16,}" -e "BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY" -e "sk-ant-[A-Za-z0-9_-]{8,}" -e "sk-proj-[A-Za-z0-9_-]{8,}" -e "SAM-[0-9a-f]{8}-[0-9a-f]{4}-" -e "AIza[0-9A-Za-z_-]{35}" -e "AKIA[0-9A-Z]{16}" -e "gh[pousr]_[A-Za-z0-9]{30,}" -e "xox[bp]-[0-9A-Za-z-]{10,}" . --exclude-dir=.git --exclude-dir=node_modules --exclude=publish-public-repo.sh ; then echo "REFUSED: a secret-shaped string is in the export"; exit 2; fi
# The lockfile must let `npm ci` run in CI.
npm install --package-lock-only --ignore-scripts >/dev/null 2>&1
# Last look, at exactly what git is about to commit.
deny_scan "$MIRROR" || { refuse "private strings are in the mirror (locations above). Nothing was committed."; exit 2; }
git add -A
git -c user.name="Bo Peng" -c user.email="bo@precisionfederal.com" commit -q -m "$MSG" || { echo "nothing to publish"; exit 0; }
git push -q origin main
echo "published $(git rev-parse --short HEAD) → https://github.com/precisionfederal/waypoint-ledger"

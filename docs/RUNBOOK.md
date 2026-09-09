# Waypoint Ledger — runbook

Everything below is a command that has been run on this machine. Run them from
`runs/TOPX-HHS-PHASE2/waypoint-app`.

| | |
|---|---|
| live site | https://waypoint-ledger.pages.dev |
| system of record | Cloudflare D1 `waypoint-ledger`, id `3c6cf7a7-e060-48fd-9e1f-646eb89ad461` |
| backups | `~/Library/Application Support/precision-federal/waypoint-backups/` (30 days, 05:05 daily) |
| health of the whole thing | `npm run uptime` |
| alarm file every session reads | `~/.claude/pf-state/WAYPOINT-DOWN.md` |
| log of every check | `runs/TOPX-HHS-PHASE2/ops/UPTIME.log` |

---

## The site is down

`~/.claude/pf-state/WAYPOINT-DOWN.md` exists, or a check failed.

1. `npm run uptime` — confirm it is still down, and read which of the three
   questions failed: the page, `/api/health`, or a hash chain.
2. If **the page or /api/health** is failing, it is the build. Go to *A bad
   deploy is live*, below.
3. If **a hash chain does not verify**, the build is fine and the register is
   the problem. Do not deploy anything. Take a backup first
   (`npm run backup`), then read the chain the check named:
   `curl -s 'https://waypoint-ledger.pages.dev/api/integrity?verify=1' | jq '.tables[] | select(.verified.ok != true)'`
   `brokeAt` names the first row whose hash does not follow the one above it.
4. If Cloudflare itself is down (`https://www.cloudflarestatus.com`), there is
   nothing to roll back. Wait, and say so on the log line.

## A bad deploy is live

```
bash scripts/rollback.sh                 # the last 10 production deployments
bash scripts/rollback.sh <deployment-id> # what to click, for that one
```

Cloudflare Pages rolls back **from the dashboard only** — there is no wrangler
command and no documented API, so `rollback.sh` prints the exact page, the exact
menu item and the deployment id, and exits 2 rather than pretending. Four clicks:
Deployments → All deployments → ⋯ on the row → *Rollback to this deployment*.

Then prove it:

```
bash scripts/rollback.sh --check         # which commit is live now
bash cf/verify-live.sh                   # the live gate, against the origin
```

Without the dashboard, republish the good commit through the deploy gate
(`git checkout <sha>` → `npm run deploy` → `git checkout -`). It takes about four
minutes and every red light runs before anything is published.

## A data question — did we lose rows, and can we get them back

```
npm run backup                                   # take one now, before anything else
npm run restore:local -- --latest                # prove the newest backup
npm run restore:local -- <file.sql> --keep       # leave it running to look around
```

`restore-d1.sh` builds a throwaway **local** database from the dump, stands the
real site on it, and checks the restored row counts against the numbers recorded
when the dump was taken, that every hash chain still verifies, and that
`cf/verify-live.sh` passes against it. A backup that has not been restored is a
file, not a backup.

Restoring **onto the live database** is deliberately not a script. It is:

1. `npm run backup` — the current state, whatever it is, before you overwrite it.
2. Read the dump you are about to apply. Know its row counts (`<file>.json`).
3. A backup file carries `CREATE TABLE` for every table, so applying it whole to
   a live database that already has those tables **fails at the first statement**.
   That is the safe failure. To put rows back into an existing database, take a
   data-only dump first:
   `cd cf && npx wrangler d1 export waypoint-ledger --remote --no-schema --output rows.sql`
   and apply the rows you actually mean to restore with
   `npx wrangler d1 execute waypoint-ledger --remote --file rows.sql`. It **adds**
   rows; it never empties a table. Emptying a live table is a decision, not a step.
4. `bash cf/verify-live.sh` and `npm run uptime`.

## A secret leaked

`ADMIN_TOKEN` and `INTERVIEW_KEY` live in `~/.config/precision-federal/waypoint-admin.env`
(mode 600) and `cf/.dev.vars`. Neither is ever printed, committed, or served.

```
cd cf
npx wrangler pages secret put ADMIN_TOKEN --project-name waypoint-ledger
npx wrangler pages secret list --project-name waypoint-ledger
```

Update the same value in `~/.config/precision-federal/waypoint-admin.env` and
`cf/.dev.vars`, then prove the old token is dead:

```
curl -s -o /dev/null -w '%{http_code}\n' -H 'authorization: Bearer <OLD>' \
  https://waypoint-ledger.pages.dev/api/admin/stats     # expect 401
```

🔴 **`INTERVIEW_KEY` is not a password, it is the AES-GCM key the interview
answers are encrypted with, and there is one of it.** Rotating it makes every
interview already stored unreadable — `cf/functions/api/_db.js` takes the key
straight from the env with no key id and no second key. If it must be rotated,
decrypt and re-encrypt every row with the old key still in place, in one pass,
before the new key goes up.

If a secret reached a file: `git log -S'<the value>' --all` to find where, rotate
first, then rewrite history.

## What runs by itself

| job | when | what it does |
|---|---|---|
| `com.precisionfederal.waypoint-backup` | 05:05 daily | `scripts/backup-d1.sh` — read-only export, verified, 30 days kept |
| `com.precisionfederal.waypoint-uptime` | every 15 min | `scripts/uptime-check.sh` — page, health, chains; writes the alarm file |

Both run through `pf-launch.py` under Homebrew python3, because that is the only
identity launchd can start that is allowed to read `~/Documents`. To check them:

```
launchctl list | grep waypoint
tail -20 ~/Library/Logs/pf-waypoint-backup.log
tail -20 ~/Library/Logs/pf-waypoint-uptime.log
launchctl kickstart -k gui/$UID/com.precisionfederal.waypoint-backup
```

Reinstall after a wipe: copy both plists from `scripts/machine/` into
`~/Library/LaunchAgents/`, both `pf-waypoint-*.sh` into `~/Library/Scripts/`, then
`launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.precisionfederal.waypoint-backup.plist`.

## What is not automated, on purpose

- **Nothing here deploys.** `npm run deploy` is run by a person who reads the
  last line.
- **Nothing here writes to the live register.** The backup is a read; the uptime
  check is three GETs; the restore only ever builds a local database.
- **The rollback is four clicks in a browser**, because Cloudflare has not given
  it an API.

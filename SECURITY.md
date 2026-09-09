# Security policy — Waypoint Ledger

Waypoint Ledger asks the public to tell the government where a published federal price is wrong. That only
works if the count can be trusted by someone who assumes we are lying — so the register is designed to be
checked, and the code that keeps it is open. If you can break it, we want to know before a judge, an agency
or a person relying on it does.

## Reporting

Write to **bo@precisionfederal.com**. Machine-readable contact: [`/.well-known/security.txt`](public/.well-known/security.txt).

- We answer every report, including the ones that turn out to be nothing.
- Tell us what you did, what you saw, and what you think it means. A curl line is worth a page of prose.
- We will credit you by name on the register's change log if you want that, and not if you do not.
- Please give us a reasonable window before publishing. We are one small firm; we will not stall you.
- Do not test with other people's data, do not run load or denial-of-service tests against the live site,
  and do not exfiltrate anything. If you need volume, run the stack locally — the whole thing boots with
  `bash cf/build-static.sh && npx wrangler pages dev` and a local D1.

## What we consider serious

| | |
|---|---|
| **Forging the count** | Filing corrections that no person made, filing many under one browser, or writing a row that names no published federal figure. |
| **Editing the past** | Changing, deleting or reordering a published row without the head at `/api/integrity` changing. |
| **Reading what is private** | An optional note, an encrypted survey sentence, or anything written in an interview reaching any public endpoint, export or share link. |
| **Serving a number that is not on a row** | Any dollar figure on any surface that does not trace to a row in `data/prices.json`. That is the product's core promise, and a break in it is a security bug here. |
| **The usual** | Injection into the CSV a policy shop opens, XSS, CSRF on a write path, session handling, secrets in the bundle, headers that let the site be framed. |

## What the code does about it

- **Hash chain.** Every public row carries `prev_hash` and `row_hash`; the head and the method are published at
  `/api/integrity` and explained in plain words at `/integrity`. The formula is in `cf/functions/api/_hash.js`
  and the walk is reproducible from the public CSV.
- **Bound identifiers.** A correction must name one of the published rows in `data/prices.json`, or it is refused.
- **One thumb per browser per figure.** The browser keeps a random id; the server stores only a truncated one-way
  hash of it bound to that figure and that table version, and refuses a repeat. It links nothing to anything else.
- **Nothing that identifies a person is stored** on the write paths: no name, no journey, no diagnosis, no IP,
  no cookie. Rate limiting hashes the IP with a daily salt into KV with a one-hour TTL and never stores the address.
- **Interview answers, names and emails are encrypted at rest** (AES-GCM, `INTERVIEW_KEY`, a Pages secret that is
  not in the repository) and are never served by any endpoint or included in any export.
- **CSV exports are safe to open**: a cell that begins with `=`, `+`, `-`, `@`, a tab or a carriage return is quoted
  and prefixed so a spreadsheet reads data, never a command.
- **Security headers** (CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options`, Referrer-Policy,
  Permissions-Policy), a JSON body cap and per-IP hourly write limits are in `cf/functions/_middleware.js`.
- **The deploy is gated**: `bash cf/verify-live.sh <origin>` curls the deployed site and exits non-zero if the
  headers are missing or `/api/health` or `/api/integrity` does not answer. A build that cannot prove itself
  does not count as shipped.

## Out of scope

Reports from automated scanners with no demonstrated impact; missing headers on third-party domains; social
engineering; anything requiring physical access to a person's unlocked device (the ledger is deliberately kept
in that device's local storage, and we say so on `/privacy`).

## Licence

Apache-2.0. See [LICENSE](LICENSE). Copyright 2026 Precision Federal LLC.

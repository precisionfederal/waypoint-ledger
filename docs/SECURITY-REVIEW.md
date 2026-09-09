# Security review — Waypoint Ledger

**Reviewed 2026-09-09** against OWASP Top 10 (2021) and the ASVS 4.0 Level 1 items that apply to a
static site with Workers APIs, on the local full stack (`wrangler pages dev` on local D1 and KV, port
8843, build `out-security`). Nothing in this review was run against the live origin, and no live secret
was rotated: six people are reading the live site today.

Every item below is a claim with a test behind it. The tests are `tests/security.test.ts` — 50 of them,
34 that read the source and the built export and run everywhere, 16 that need a running stack and are
skipped unless `SEC_BASE` names one. A finding without a test is not in this file.

```
npm test                                                  the source and export half
SEC_BASE=http://127.0.0.1:8843 npm test                   both halves
bash scripts/secrets-scan.sh                              is a secret in anything we serve or commit
bash scripts/rotate-secrets.sh admin                      replace a secret and prove the old one died
```

---

## What was wrong, and what closed it

### 1. `script-src 'unsafe-inline'` — every inline script was allowed, including one we never wrote

**Severity: high.** OWASP A03, A05. **Proof:** the live origin answered on 2026-09-09 with

```
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; …
```

That header is the one thing standing between a single injected string and script execution on this
origin, and `'unsafe-inline'` says yes to any inline script on the page. The register, the corrections
and the survey all accept free text from strangers; the product's promise is that free text is never
served back, and this was the second lock that was not locked.

**Why it had not been fixed:** the site is a Next static export, so it cannot mint a per-request nonce
the way a rendered app does — a nonce has to be written into the HTML, and the HTML here is a file on
disk. Injecting one with HTMLRewriter works until the first `304`: the browser keeps the stored body
with the old nonce and takes the new header from the revalidation, and every script on the page is
refused. A policy that only works when the header and the body are minted together cannot be cached,
and this site is cached.

**The fix** (`cf/functions/_middleware.js`): the policy is a pure function of the bytes being served.
For an HTML response the middleware reads the body, takes the SHA-256 of every inline script in it, and
names those hashes in `script-src`. Same body, same header, always — a cache hit and a fresh render
agree by construction, and a script that was not in the file has no hash and does not run. The result
is memoised per ETag, so a repeated request pays nothing. `object-src 'none'` was added at the same
time.

`'unsafe-hashes'`, with the handler's own hash, appears **only** on a page that has an inline event
handler attribute. Exactly one page does — `public/offline.html`, `onclick="location.reload()"` — so
exactly one page carries the weaker keyword and the other nineteen do not. Removing that one attribute
removes the keyword automatically; the line for it is in the handover at the end.

`style-src 'unsafe-inline'` stays. React writes `style` attributes, and `style-src-attr` has no hash
form that covers them. An inline style cannot execute script.

A `HEAD` has the headers and none of the body, so there is nothing to hash. Answering it with
`script-src 'self'` and no hashes would advertise a policy that would break the page a `GET` returns.
A `HEAD` now repeats the policy for that ETag if a `GET` has been served, and claims none if not.

**Tests:** six, including one that walks every HTML file in the real export and asserts the policy names
the hash of every inline script on that page, and one that asserts an injected script's hash is absent
from the policy the clean page would have been served with.

**After:**

```
script-src 'self' 'sha256-oRJCwY1v6dT8U2pPANzimDk98Jf6QB7bUoPSSI/OxZw=' … (8 hashes on /)
```

---

### 2. The admin token was compared with `===`

**Severity: medium.** OWASP A07, ASVS 2.10.4. **The line** (`cf/functions/api/_db.js`):

```js
return Boolean(env.ADMIN_TOKEN) && a === `Bearer ${env.ADMIN_TOKEN}`;
```

JavaScript's `===` on strings compares length first and then bytes left to right, and returns at the
first difference. The time it takes to say no is therefore a function of how much of the token was
right, and over enough samples that is the token. `/api/admin/interviews` returns every interview
answer in plaintext, so this is the door where it matters.

The lockout in `_middleware.js` — five wrong tokens per network per hour — makes the attack slow rather
than impossible, and "slow" is not the standard for that route.

**The fix:** `constantTimeEquals` in `cf/functions/api/auth/password/_kdf.js`, used by `isAdmin`. It
runs a fixed 512 iterations whatever was sent and folds the length difference into the same
accumulator, so neither the length of the real token nor the position of the first wrong character can
be read off the clock. It is sync, so no admin route had to change.

It is a second function rather than a change to the existing `timingSafeEqual` because the two are for
different jobs: `timingSafeEqual` compares two base64 digests, which are the same length by
construction, so returning `false` on a length mismatch costs nothing there. A bearer token's length is
the attacker's choice.

**Tests:** four, including a source guard that fails if `=== \`Bearer` ever comes back, and a live pair
that proves the right token with a character changed and the right token with something appended are
both refused.

---

### 3. A body with no `content-length` was read in full and refused afterwards

**Severity: medium.** OWASP A04. **The line** (`cf/functions/api/_http.js`):

```js
try { text = await request.text(); } catch { return { error: 'Body must be JSON.' }; }
if (text.length > MAX_BODY) return { error: 'Body too large.' };
```

Two holes in one place. The cap ran on `text.length`, which counts UTF-16 code units, so 16,384
three-byte characters passed a 16 KB cap at 48 KB. And the check ran **after** the whole body was in
memory: the middleware's cap reads `content-length`, a client is not obliged to send one, and a chunked
request was therefore buffered in full and refused second. Refusing a body you have already paid to hold
is not a cap.

**The fix:** `readCapped` counts bytes off the stream as they arrive and cancels the stream the moment
it goes over. `MAX_BODY` is now a byte count, which is what it always said it was.

**Measured:** an 8 MB chunked body now stops after one 64 KB chunk.

```
content-length header: null
result: {"error":"Body too large."} | bytes the producer got to emit: 65536 | ms 1
```

**Tests:** four unit and two live, including the multibyte case that used to pass.

---

### 4. Two passkey routes handed the library's own error text to the caller

**Severity: low.** OWASP A09. `cf/functions/api/auth/register/verify.js` and `.../login/verify.js` both
did `bad(e instanceof Error ? e.message : '…')`. SimpleWebAuthn's messages name the expected relying
party and origin — our configuration, not the caller's. Both now answer with a fixed sentence.

The two places that still read a caught message (`signup.js`, `change.js`) only **test** it for a UNIQUE
constraint and answer in their own words; a test pins that shape.

**Tests:** three, including one that asserts no function anywhere touches `.stack`.

---

### 5. `cf/.dev.vars` was mode 644

**Severity: medium, local.** Found by `scripts/secrets-scan.sh` on its first run. The file holds the
live `ADMIN_TOKEN` and `INTERVIEW_KEY` and was readable by every process on the machine. Now 600, and
the scanner fails if either secret file is ever anything else.

### 6. A rotation backup would not have been gitignored

**Severity: medium, latent.** `.gitignore` had `cf/.dev.vars`, which does not match
`cf/.dev.vars.20260909T195939Z.bak` — the backup `rotate-secrets.sh` writes, holding the value that was
just retired and is still live everywhere the rotation has not reached. `cf/.dev.vars.*` added.

### 7. The CORS preflight said `*` for the three cookie-backed families

**Severity: low.** `OPTIONS /api/admin/…`, `/api/me` and `/api/bluebutton/…` were answered with
`access-control-allow-origin: *` even though the real response never carries it. The browser blocked the
read either way; the header said "this door is open" to anyone reading it. The preflight now omits it
for those three prefixes.

### 8. `security.txt` expired exactly one year out

**Severity: informational.** RFC 9116 §2.5.5 asks for less than a year. It said `2027-09-09`, exactly
365 days from the day it was written. Now `2027-06-30`, and a test fails once it is in the past.

### 9. Hardening added at the same time

- `strict-transport-security` gained `preload`. The site is on `.dev`, a TLD already in the browser
  preload list, so this is a statement of intent that also covers a future custom domain.
- `cross-origin-opener-policy: same-origin` and `cross-origin-resource-policy: same-site`.
- Every API response now carries `default-src 'none'; frame-ancestors 'none'; base-uri 'none'`. JSON and
  CSV are never documents; nothing in them may load or run anything.
- A `429` from the limiter now carries `Retry-After`, the seconds until the hour turns. A machine-
  readable refusal that only a human could act on is half an answer.

---

## What was walked and found sound

Each of these has a test that keeps it sound.

| Item | What was checked | Verdict |
|---|---|---|
| **A03 SQL injection** | Every statement in all 58 functions | Bound parameters only. Four helpers interpolate an **identifier**: `_db.js insert` (literal table names, caller's own keys), `_counters.js` (module-level list), `_hash.js appendChained` (must be a key of `PUBLISHED` or it throws), `me.js` (a hard-coded array). A test lists exactly those four and fails on a fifth. |
| **A01 mass assignment** | Every `insert()` and `appendChained()` call | No write path spreads a request body into a row. Every row is an explicit allowlist of validated fields. Proved live: a correction posted with `id`, `received_at`, `user_id`, `row_hash` and `submitter_hash` set by the caller stored none of them. |
| **A01 access control** | `/api/me`, `/api/me/journeys`, `DELETE /api/me` | Session required; a forged session id opens nothing. `DELETE /api/me` unlinks public contributions before deleting the account, so a half-failure cannot leave a name on a row that outlives it. |
| **A02 crypto at rest** | Interview answers and names | AES-GCM 256 with a random 12-byte IV per value, key from `INTERVIEW_KEY`. |
| **A02 secrets** | Every built tree and every git-tracked file | No secret value appears in any of 29 built exports or anywhere in git. |
| **A07 password hashing** | `_kdf.js` | PBKDF2-SHA256, 100,000 iterations × 5 sequential passes = 500,000, each pass salted by the previous output so they cannot be parallelised. 100,000 is the workerd ceiling; above it WebCrypto throws and the origin answers 1101. Every hash carries its own parameters, so a change never orphans a row, and a sign-in on old parameters rewrites it. |
| **A07 user enumeration** | `POST /api/auth/password/login` | A wrong password and an unknown address return **byte-identical** JSON, and an unknown address is verified against a decoy carrying today's parameters so it costs the same work. Ten wrong attempts per address per hour, keyed by a hash of the address. |
| **A07 recovery codes** | `POST /api/auth/password/recover` | Ten words from 2,048 ≈ 110 bits, stored only as a salted PBKDF2 hash. Proved live: single-use — the second use of the same code returns 401, a fresh code is issued, and every other session is deleted. |
| **A07 session rotation** | signup, login, recover, change | A session id is server-generated and never read from the request, so fixation is not reachable. Recovery deletes **all** sessions; a password change deletes all but the one making it. 30-day expiry checked on every read. |
| **A05 cookies** | `sessionCookie()` | `HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`, and `Secure` whenever the request is https. `Secure` is dropped on http so a local browser will accept it — production is https-only. |
| **A05 CSRF** | Every state-changing route | `SameSite=Lax` means the session cookie is not sent on a cross-site `POST`, `PUT` or `DELETE`, and no state-changing route answers a `GET`. The admin routes take a bearer token, which a browser never attaches by itself. |
| **A04 rate limiting** | Every write path | Per route, per hour, keyed by SHA-256 of the IP with a daily salt and a server pepper, truncated to 24 hex characters. No IP is stored in any row. Proved live: trips at the limit with `429` and `Retry-After`, never a `500`. |
| **A04 admin lockout** | `/api/admin/*` | Five **wrong tokens** per network per hour locks that network out of every admin path, counted after the route has judged the token so an authorised request can never move it. Proved live: locked, and the real admin from a different network was unaffected. |
| **A08 integrity** | `appendChained` | Each published row carries the hash of its predecessor, appended in one D1 batch guarded by the head it read, so two writers in the same millisecond cannot fork the chain. `/api/integrity` republishes the head. |
| **A10 SSRF** | Outbound requests | The only outbound call is the Blue Button OAuth exchange, to a fixed CMS host. No route fetches a caller-supplied URL. |
| **Disclosure** | `/.well-known/security.txt` | RFC 9116 valid: `Contact`, one `Expires` in the future and under a year, `Canonical` matching its own URI, `Preferred-Languages`, `Policy`, and no field the RFC does not define. Served as `text/plain`. |

---

## The two scripts

**`scripts/secrets-scan.sh`** — reads the secret files, writes the values to a 600 temp file, hands that
file to `grep -f`, and reports only the **path** of anything that matched. It never prints a secret. It
searches every built tree and every git-tracked file for the real values, then sweeps the tree for
credential *shapes* (private key blocks, AWS ids, GitHub, Slack and OpenAI tokens, JWTs, hard-coded
bearer tokens) so a secret it has never seen is still caught, and asserts the `.dev.vars` family cannot
be committed. Exit 1 on any finding. It runs in CI on every push.

**`scripts/rotate-secrets.sh`** — a rotation nobody verified is a rotation that may not have happened.
The script generates, writes to `cf/.dev.vars` **and** `~/.config/precision-federal/waypoint-admin.env`
(both 600, both backed up), optionally puts the value on Cloudflare Pages behind a typed confirmation,
and then proves it: **the new value is accepted and the old value is refused**, or the script exits
non-zero.

The proof needs its own server. Measured on 2026-09-09: `wrangler pages dev` reads `.dev.vars` once, at
start, and ninety seconds after the file changed the running server still only accepted the old token.
The server already running is the wrong witness — it is testifying about a file it read before the
rotation. So step 5 stands up a throwaway `wrangler pages dev` on a free port with its own state
directory, started after the write, and kills it either way.

Verified end to end on 2026-09-09, then restored to the original value (fingerprint `7e45be18`) so the
live secret set is unchanged:

```
==> 5/5  prove the old one is dead
    standing up a throwaway server on port 8900 to read the rotated file
    ok   the NEW token opens /api/admin/stats (200) on a server that read the rotated file
    ok   the OLD token is refused (401)

Rotated and verified: new accepted, old refused.
```

`INTERVIEW_KEY` is different in kind: it is the AES-GCM key the interview answers are encrypted **with**,
nothing re-encrypts them, and rotating it makes every interview already on file permanently unreadable.
The script refuses to touch it without
`--i-understand-old-interviews-become-unreadable` in the command.

---

## Not done, and why

- **A dependency audit is not in this review.** It is the `deps` lane's, and its CI job (`deps`) runs
  `npm audit --omit=dev --audit-level=high`, a critical sweep of the whole toolchain, and a licence
  allowlist. This lane deliberately did not add a second copy of that gate.
- **No penetration test of the deployed origin.** Everything here was run against the local stack, on
  purpose: the live site is being read today and these tests create accounts, spend recovery codes and
  trip rate limiters.
- **No formal threat model document.** The scorecard does not ask for one and the review above is the
  useful half of it.
- **`unsafe-hashes` on `/offline`** remains until the `onclick` in `public/offline.html` moves into a
  script. One line, listed below.
- **Unknown fields are ignored, not rejected.** ASVS 5.1.2 prefers rejection. Every write path builds
  its row from an explicit allowlist, so ignoring is not exploitable here, and it is proved by a live
  test that posts forged `id`, `received_at`, `user_id`, `row_hash` and `submitter_hash` and finds none
  of them in the export. Making it a rejection means editing five write-path handlers this lane does not
  own; the line is below.

## Lines another lane must apply

1. **quality lane**, `public/offline.html:54` — replace
   `<button class="btn ghost" type="button" onclick="location.reload()">Try again</button>`
   with `<button class="btn ghost" type="button" id="retry">Try again</button>` and add
   `<script>document.getElementById('retry').addEventListener('click',function(){location.reload()})</script>`.
   That removes the only `'unsafe-hashes'` on the site. Nothing breaks if it is not done.
2. **whoever owns `scripts/deploy.sh`** — add `bash scripts/secrets-scan.sh || die "a secret is in the
   build"` as a step between the static export and the upload. The scan is the only check that reads the
   built tree for the real secret values, and today it only runs when somebody runs it.
3. **whoever owns the write-path handlers** (`corrections.js`, `gap.js`, `survey.js`, `interview.js`,
   `journeys.js`) — if strict rejection is wanted, add to `_http.js` a
   `strict(body, allowed)` helper and call it first in each. This lane did not add the helper because an
   unused export is a promise nobody keeps.

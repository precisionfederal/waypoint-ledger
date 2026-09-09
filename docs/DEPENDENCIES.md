# Dependencies — what Waypoint Ledger runs on, and how it stays clean

Last reviewed **2026-09-09**. Next review **2026-10-09** (monthly).

A tool that prices a stranger's medical journey and publishes its own source is
read by people who check. This file is the answer to two of their questions —
*does anything you ship have a known hole* and *may we lawfully reuse what you
depend on* — written so that each answer is a command, not a claim.

## The bar

| Gate | Command | Today |
|---|---|---|
| Runtime tree, no known holes | `npm audit --omit=dev --audit-level=high` | `found 0 vulnerabilities` |
| Whole tree, nothing critical | `npm audit --audit-level=critical` | exit 0 |
| Every runtime licence publishable | the licence step in `.github/workflows/ci.yml` | 44 packages checked, all permissive |

`.github/workflows/ci.yml` runs all three on every push and every pull request,
in the `deps` job, alongside the `check` job that runs types, tests and the
static export. A red badge is the point of the badge.

## What actually runs

Five direct dependencies. Everything else in the runtime tree is pulled in by
one of them.

| Package | Version | Licence | Where it runs | Why |
|---|---|---|---|---|
| `next` | 15.5.25 | MIT | build machine | Builds the static export in `cf/out`. Nothing of Next's server runs in production — Cloudflare Pages serves files, and `cf/functions/api/**` is the only code with a runtime. |
| `react` | 19.0.0 | MIT | browser | The pages. |
| `react-dom` | 19.0.0 | MIT | browser | Renders and hydrates them. |
| `@simplewebauthn/server` | 13.3.3 | MIT | Cloudflare Worker | Passkey registration and login: `cf/functions/api/auth/{register,login}/{options,verify}.js`. |
| `@simplewebauthn/browser` | 13.3.0 | MIT | browser | The other half of the same handshake, from `lib/auth-client.ts`. |

Two pinned overrides, both in `package.json`:

| Override | Version | Why the override exists |
|---|---|---|
| `postcss` | 8.5.28 | `next@15.5.25` pins `postcss@8.4.31` exactly, and 8.4.31 carries four open advisories (GHSA-qx2v-qp2m-jg93, -6g55-p6wh-862q, -fxqj-rqcc-2cmp, -r28c-9q8g-f849). Without the override the only npm-offered fix is Next 16, a major move. 8.5.28 is a minor bump on the same major; the export builds and all 784 tests pass on it. |
| `sharp` | 0.35.4 | `sharp` before 0.35.4 inherits libheif and libvips CVEs (GHSA-rgj7-g3m4-5g8c, GHSA-f88m-g3jw-g9cj). Both `next` and `miniflare` reach for it; the override makes both take the patched build. |

### The transitive tree

44 packages, all resolved from `package-lock.json`. The shape:

- **`@simplewebauthn/server` → 22 packages** — the eleven `@peculiar/asn1-*`
  modules, `@peculiar/x509`, `@peculiar/utils`, `asn1js`, `pvtsutils`, `pvutils`,
  `tslib` (two copies), `tsyringe`, `reflect-metadata`, `@hexagon/base64`,
  `@levischuck/tiny-cbor`. This is the ASN.1 and X.509 machinery a relying party
  needs to read what an authenticator sends. MIT, BSD-3-Clause and 0BSD throughout.
- **`next` → 11 packages** — `@next/env`, `@next/swc-darwin-arm64`, `styled-jsx`,
  `@swc/helpers`, `client-only`, `caniuse-lite`, `postcss` and its three
  (`nanoid`, `picocolors`, `source-map-js`), and `sharp`.
- **`sharp` → 5 more** — `@img/colour`, `@img/sharp-darwin-arm64`,
  `@img/sharp-libvips-darwin-arm64`, `detect-libc`, `semver`.
- **`react-dom` → 1** — `scheduler`.

Five direct plus 22, 11, 5 and 1 is the whole 44.

Licence census of the runtime tree, counted 2026-09-09: MIT 31, Apache-2.0 5,
BSD-3-Clause 2, ISC 2, 0BSD 2 (`tslib`, twice), CC-BY-4.0 1, LGPL-3.0-or-later 1.

### The two licences worth a sentence

**`@img/sharp-libvips-*` is LGPL-3.0-or-later.** It is an optional platform
binary that Next's image optimiser would use at build time. The export sets
`images: { unoptimized: true }` (see `cf/build-static.sh`), so it is never
invoked, and no byte of it is published:

```
grep -rl "libvips\|@img/sharp" cf/out    # no matches
find cf/out -name node_modules           # nothing
```

`scripts/export-public-repo.sh` excludes `node_modules` from the public
repository as well. The site's own source ships under Apache-2.0; nothing
copyleft travels with it. The CI licence gate allows this one package by name
and fails on any other non-permissive licence.

**`caniuse-lite` is CC-BY-4.0.** Browser-support data read by browserslist
during the build. Attribution is required if the data is redistributed; it is
not redistributed — it is not in `cf/out` and not in the public repository.

## Toolchain (never served to anyone)

| Package | Version | Licence | Why |
|---|---|---|---|
| `typescript` | 5.7.3 | Apache-2.0 | `npx tsc --noEmit -p .` is gate 1 of `scripts/deploy.sh`. |
| `vitest` | 3.2.7 | MIT | 784 unit tests. |
| `wrangler` | 4.130.0 | MIT OR Apache-2.0 | Local D1 + KV, migrations, and the Pages deploy. |
| `ajv` | 8.20.0 | MIT | Schema validation in the generators. |
| `@types/*` | — | MIT | Types only; erased at compile. |

## What changed on 2026-09-09

Every step below was followed by `npx tsc --noEmit -p .`, `npm test`, and a
static build; the whole chain closed with `cf/verify-live.sh` and the Playwright
end-to-end against a local `wrangler pages dev` on port 8844.

| From | To | What it closes |
|---|---|---|
| `next` 15.1.6 | 15.5.25 | The critical cache-poisoning DoS GHSA-67rr-84xm-4c7r and 30 further Next advisories. It also carries the patched `sharp` range. 15.5.25 is the head of npm's `backport` tag for the 15 line. |
| `@simplewebauthn/server` 13.1.1 | 13.3.3 | GHSA-6hxq-p678-4hr2, attestation certificates not proven to chain to a trust anchor. Our registration path asks for `attestationType: 'none'`, so we never requested an attestation certificate and the advisory did not describe a live hole here — the upgrade removes the question rather than answers it. |
| `@simplewebauthn/browser` 13.1.0 | 13.3.0 | Kept in step with the server half. |
| `postcss` 8.4.31 | 8.5.28 (override) | Four advisories, high. |
| `sharp` 0.33.5 / 0.35.4 mixed | 0.35.4 everywhere (override) | libvips and libheif CVEs, high. |
| `wrangler` 4.40.2 | 4.130.0 | Current 4.x. Carries `workerd` 1.20260908.1 and drops the old `miniflare` that pinned vulnerable `sharp`. |
| `vitest` 3.2.4 | 3.2.7 | Latest patch on the 3.2 line. |
| `compatibility_date` 2026-01-01 | 2026-09-09 | `cf/wrangler.toml`. Eight months of Workers-runtime default fixes. Verified green: local server booted with no compatibility warning, 39 verify-live checks ok / 0 failed, 16 end-to-end checks passed / 0 failed. |

## What was deliberately not moved

**Next 16.** `npm audit fix --force` offers `next@16.3.4`. The 15 line has a
supported backport at 15.5.25 that closes every advisory npm raised, so there is
no security reason to cross a major before a demo. Revisit at the October review.

**Vitest 4.** GHSA-82fw-gwwq-j7x9 (path traversal via `@vitest/mocker`'s
redirect mock) is fixed only in `vitest@4.1.11`, a breaking major. Two moderate
findings therefore remain in the *development* tree and are the only findings
anywhere:

```
npm audit --omit=dev   →  found 0 vulnerabilities
npm audit              →  2 moderate severity vulnerabilities
```

Nothing reaches a visitor: `vitest` is not in the runtime tree, is not bundled,
and the advisory needs a malicious test file — every test file in `tests/` is
written here and reviewed here. Moving the test runner across a major while
other work is adding test files is the larger risk today. Scheduled for the
October review, when the suite can be moved in one pass.

## The cadence

Monthly, on the ninth, per the standing package-review rule: update, evaluate
keep-or-drop, and verify after the upgrade.

```
npm outdated                          # what moved
npm audit --omit=dev                  # what matters
npm audit                             # the toolchain too
npm install <pkg>@<version> --save-exact
npx tsc --noEmit -p . && npm test && npm run build:static
bash scripts/deploy.sh                # the full gate, local stack included
```

Rules that hold between reviews:

1. **Exact versions, never ranges,** for anything that can reach production. The
   lockfile is the claim; a range makes the claim unverifiable.
2. **One upgrade at a time,** each one followed by types, tests and a build. A
   batch that goes red tells you nothing about which package did it.
3. **An override needs a reason written next to it** in the table above. An
   override with no reason is a fork nobody remembers making.
4. **No new runtime dependency without a licence check and a sentence here**
   saying what it does that we could not do ourselves. The tree is 44 packages
   and five of them are ours to choose; keep it that way.

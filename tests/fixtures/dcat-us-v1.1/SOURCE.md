# DCAT-US v1.1 JSON Schema — vendored, unmodified

Fetched **2026-09-09** with `curl -sS` from `https://resources.data.gov/schemas/dcat-us/v1.1/schema/<file>`
(byte-identical copies are served from the older canonical host
`https://project-open-data.cio.gov/v1.1/schema/<file>`; each file's own `id` names that host).

| File | SHA-256 |
|---|---|
| catalog.json | `3e5a23ae36361ba36163e1a522f094fb8b39532731e741553f48dbcd4ddaf0d6` |
| dataset.json | `f425894237684d0648b51c6cb6ba1f37823aeec44183c7d2e47d5d0bd2d293b6` |
| distribution.json | `cd1905495b0576855840c12e6a5138ae2952cf9b7bee56ad20df15da841a3774` |
| organization.json | `4ce4f6bb576870f79396f35e713ff3ff55a0e734d2a33b0d7ddf1324bafb4619` |
| vcard.json | `b16075a8aeed2ca512281aeb16b7f3726dd89de25597c56731a67a106235c4b9` |

`tests/data-json.test.ts` re-hashes all five before it validates anything. A schema
edited to make our catalog pass fails the suite instead — which is the only reason
to vendor a copy rather than fetch it at test time.

They are JSON Schema **draft-04**. The test adapts them in memory for `ajv` 8 —
`$schema` → draft-07, `id` → `$id`, and `unicodeRegExp: false` so vcard.json's
draft-04-era email pattern compiles as published — and changes nothing else, except to drop
`bureauCode` and `programCode` from `dataset.json`'s `required` list. That single
deviation is the published guidance, verbatim, from
<https://resources.data.gov/resources/dcat-us/>:

> There are however some fields that have been introduced specifically for use by the
> U.S. Federal Government and have special meaning in that context. These fields are:
> bureauCode, programCode, dataQuality, primaryITInvestmentUII, and systemOfRecords.
> **Non-federal data publishers are encouraged to make use of this schema, but these
> fields should not be seen as required** and may not be relevant for those entities.

We are a company, not an agency. An OMB Circular A-11 bureau code we do not have is
exactly the kind of invented federal identifier this product exists to refuse.

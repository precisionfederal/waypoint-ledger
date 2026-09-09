# Waypoint Ledger — full-stack architecture (v3, 2026-09-09)

Bo, 2026-09-09: "Fill out the backend, all the stuff, so that it's a real full-stack application." This file is the decision. Builders build to it; nobody redesigns it.

## Shape
- **Frontend**: Next.js 15 static export (`app/`, `components/`, `lib/`), served by Cloudflare Pages. PWA: installable, works offline for pricing (the price table ships with the client).
- **Backend**: Cloudflare Pages Functions (Workers runtime) under `cf/functions/api/**`. **D1** (`waypoint-ledger`, id `3c6cf7a7-e060-48fd-9e1f-646eb89ad461`, binding `DB`) is the system of record. **KV** (binding `LEDGER`) holds only rate-limit buckets and passkey challenges (TTL ≤ 10 min). Secrets: `ADMIN_TOKEN`, `INTERVIEW_KEY` (32-byte base64, AES-GCM key for interview answers at rest).
- **One library, both sides**: `lib/mapper.ts`, `lib/pricing.ts`, `lib/table.ts`, `lib/survey-def.js` are imported by the React pages AND by the functions (esbuild bundles TS from `../../../lib/`). No second copy of any rule.
- **Privacy is the precondition**: anonymous by default; no analytics, no cookies except an optional session after a passkey sign-in; no IP stored (rate limiting hashes IP with a daily salt into KV, TTL 1 h); interview answers encrypted at rest; free text never served publicly.
- **Local full stack**: `npm run dev:full` = `bash cf/build-static.sh && npx wrangler pages dev cf/out --d1 DB=waypoint-ledger --kv LEDGER --compatibility-date 2026-01-01` (local D1 + KV, migrations applied with `npm run db:migrate:local`).

## D1 schema — `cf/migrations/0001_init.sql` (the one definition; add migrations, never edit 0001)
users(id TEXT PK, created_at, display_name NULL) · credentials(id TEXT PK, user_id FK, public_key TEXT, counter INTEGER, transports TEXT, created_at) · sessions(id TEXT PK, user_id FK, created_at, expires_at)
journeys(id TEXT PK, user_id NULL FK, share_slug TEXT UNIQUE NULL, title TEXT, entries_json TEXT, table_version TEXT, created_at, updated_at)
corrections(id PK, price_id, verdict CHECK right|wrong, believed_usd REAL NULL, note TEXT NULL, table_version, journey_id NULL, received_at)
gap_reports(id PK, counts_json, ranking_json, note NULL, context_json NULL, table_version, received_at)
survey_responses(id PK, ranking_json, unasked, lead, decide, clinicians INTEGER NULL, context_json NULL, sentence_enc TEXT NULL, channel, survey_version, received_at)
interviews(id PK, consent CHECK notes|quote-anonymously|quote-by-name, name_enc NULL, answers_enc TEXT, follow_up INTEGER, email_enc NULL, channel, received_at, reviewed_at NULL)
changes(id PK, date, said, changed, who, source_interview_id NULL, published INTEGER DEFAULT 1)
events(day TEXT, name TEXT, count INTEGER, PK(day,name))  — aggregate counters only

## API contracts (JSON; every error `{ok:false,error}` with the right status; every success `{ok:true,...}`)
Public, read (CORS `*`, `cache-control: no-store` unless noted):
- `GET /api/health` → `{ok, version, db:'ok'|'down', tableVersion}`
- `GET /api/table` (cache 1 h) → the price table with provenance; `GET /api/table/{id}`
- `POST /api/price` `{story}` or `{items:[{raw,itemId,times}]}` → `{segments:[{raw,times,itemId,label,confidence,valueUsd,basis,year,source,coverage}], totals, basisWarning, unpriced:[{raw,reason}]}` — server-side `parseJourney`/`priceJourney`, same lib as the client. Rate 300/h.
- `GET /api/journeys/{slug}` → a shared journey (entries + table version). `POST /api/journeys` `{entries,title?}` → `{id, slug, url}` (anon allowed; rate 30/h). `PUT/DELETE /api/journeys/{id}` need the session that owns it.
- `GET /api/corrections` · `GET /api/gap` · `GET /api/survey` · `GET /api/interview` (count only) · `GET /api/register` (all four aggregates + changes + firstAt/lastAt in one call) · `GET /api/changes` · `GET /api/export/{corrections|gap|survey}.csv` · `GET /api/openapi.json`
Public, write (rate-limited by hashed IP, body ≤ 16 KB, validated; 20/h each):
- `POST /api/corrections` · `POST /api/gap` · `POST /api/survey` · `POST /api/interview` — same bodies as today (see the existing functions).
Auth (passkeys, `@simplewebauthn/server` v13, rpID = request host, origin = request origin):
- `POST /api/auth/register/options` → options (challenge in KV 5 min) · `POST /api/auth/register/verify` · `POST /api/auth/login/options` · `POST /api/auth/login/verify` → sets `wl_session` cookie (HttpOnly, Secure, SameSite=Lax, 30 d) · `POST /api/auth/logout` · `GET /api/me` → `{user:{id,displayName}|null}` · `GET /api/me/journeys` · `PUT /api/me` `{displayName}` · `DELETE /api/me` (erases the user and everything owned).
Admin (`Authorization: Bearer ADMIN_TOKEN`, never cached, never CORS):
- `GET /api/admin/interviews` (decrypted) · `POST /api/admin/interviews/{id}/reviewed` · `GET /api/admin/corrections?status=` · `POST /api/admin/changes` `{date,said,changed,who,sourceInterviewId?}` · `DELETE /api/admin/changes/{id}` · `GET /api/admin/stats`
Cross-cutting: `cf/functions/_middleware.js` — security headers (CSP, HSTS, nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy), CORS for GET on `/api/*`, rate limiting for POST/PUT/DELETE on `/api/*`, JSON body-size cap, request counter into `events`.

## Frontend surfaces (new or changed)
- `/account` — passkey sign-in ("Save my ledgers across devices"), list of saved journeys, delete account. Header gets a quiet "Save" button. Anonymous flow unchanged.
- `/developers` — the public API, OpenAPI link, three curl examples, the reuse story (an agency or another app prices a journey with one POST).
- `/admin` — token entry (kept in sessionStorage), interviews reader, change-log editor. Not linked from the site.
- `/register` reads `/api/register`; the change log comes from D1, not a constant.
- PWA: `public/sw.js` (precache the export, network-first for `/api/`), `offline.html`, install prompt on the landing page, `manifest.webmanifest` complete.
- Every page: WCAG 2.1 AA (labels, focus, contrast, skip link, aria-live on totals), `prefers-reduced-motion`.

## Tests
- `npm test` = vitest: `lib/mapper`, `lib/pricing`, `lib/survey-def` validators, CSV export, `_http` validation. `npm run e2e` = Playwright against `wrangler pages dev` (full stack, local D1): journey → ledger → thumb → register; survey; interview; passkey (virtual authenticator via CDP); developers API.

## Deploy
`bash cf/build-static.sh && cd cf && npx wrangler d1 migrations apply waypoint-ledger --remote && npx wrangler pages deploy out --project-name waypoint-ledger --commit-dirty=true`. Secrets once: `npx wrangler pages secret put ADMIN_TOKEN --project-name waypoint-ledger` (and `INTERVIEW_KEY`).

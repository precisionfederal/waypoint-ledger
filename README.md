# Waypoint Ledger

A person types the visits and tests they had. Each phrase maps to a standard unit of care. That unit is
priced at **one published federal figure** that carries its year, its basis and the population it describes.
Where no federal file describes the person in front of it, the tool says so and counts the absence instead of
filling it with the nearest number.

**No model, average or interpolation produces a dollar figure anywhere in this codebase.** If you keep one
thing when you adapt this, keep that.

Live: <https://waypoint-ledger.pages.dev> · How to adapt it: <https://waypoint-ledger.pages.dev/adopt> ·
The API: <https://waypoint-ledger.pages.dev/developers>

---

## Run it

```bash
npm install
npm run build:static          # writes the static export to cf/out
npm test                      # the unit suite: the matcher, the pricing rules, the exports, the catalog
```

The front end alone needs nothing else:

```bash
npm run dev                   # http://localhost:3000
```

## Run the whole stack, with the database

The write paths (corrections, care gaps, the burden survey, saved journeys, passkeys) are Cloudflare Pages
Functions over D1 and KV. Locally that is one command once you have created the two resources on your own
Cloudflare account:

```bash
npx wrangler login
npx wrangler d1 create waypoint-ledger            # put the id in cf/wrangler.toml
npx wrangler kv namespace create LEDGER           # put the id in cf/wrangler.toml
npx wrangler pages project create YOUR-PAGES-PROJECT

npm run db:migrate:local                          # applies cf/migrations/*.sql
npm run dev:full                                  # http://localhost:8788 — pages + functions + local D1
```

`cf/wrangler.toml` ships with placeholders (`YOUR_D1_DATABASE_ID`, `YOUR_KV_NAMESPACE_ID`,
`YOUR-PAGES-PROJECT`) so a first run cannot accidentally point at somebody else's project.

Two secrets are optional and only needed for the interview reader and the admin views:

```bash
npx wrangler pages secret put ADMIN_TOKEN   --project-name YOUR-PAGES-PROJECT
npx wrangler pages secret put INTERVIEW_KEY --project-name YOUR-PAGES-PROJECT   # 32 random bytes, base64
```

## Deploy

```bash
npm run db:migrate:remote
npm run build:static
cd cf && npx wrangler pages deploy out --project-name YOUR-PAGES-PROJECT
bash cf/verify-live.sh https://your-deployment-url
```

`verify-live.sh` curls the origin and exits non-zero if any promise the pages make is not true of the server.
Run it after every deploy; a deploy that is not verified is a deploy you are guessing about.

## The two commands that keep the numbers honest

```bash
python3 data/verify_price_table.py     # re-derives every published figure from the file it cites; exit 1 on drift
node    scripts/gen-locality-table.mjs # recomputes every CMS locality figure; exit 1 on one cent of drift
```

A published number that no longer reproduces from its source cannot leave this repository. That is the whole
trust model, and it is two commands long.

## Where things are

| Path | What is in it |
|---|---|
| `data/prices.json` | Every published federal figure, each with its file, year, basis, population and combination rules. |
| `data/state-prices.json` | The Medicare allowed amount for each priced code in each CMS payment locality. |
| `data/conditions.json` | The conditions the picker offers, with ICD-10-CM codes and an explicit null where no figure is published. |
| `lib/` | The matcher, the pricing rules, the fit rules, the survey definition. Imported by both the React app and the Cloudflare Functions — never a second copy. |
| `app/`, `components/` | Next.js 15 app router, static export. |
| `cf/functions/api/` | The API. One file per route. |
| `cf/migrations/` | The whole database schema, in order. Add a migration; never edit `0001_init.sql`. |
| `public/data.json` | The DCAT-US v1.1 catalog describing every open file this project publishes. |
| `tests/` | `npm test`. The suite imports the same modules the app does. |

## Adapting it

`/adopt` on the live site is the procedure, and it is short:

- **Another condition** — one object in `data/conditions.json` pointing at a row that already exists.
- **Another state** — nothing to edit. All 109 CMS payment localities ship with the tool.
- **Another population** — one branch in `lib/fit.ts`, which holds the whole "does this figure describe this
  person" rule in one function.
- **Your own community, counted separately** — append `?c=your-org-slug` to the survey link and every
  response through it carries that channel, in the public export as well as in your own reading of it.

## Licence

- **The software** — Apache License 2.0. See `LICENSE`.
- **The data** — CC0 1.0 (public domain dedication). The federal figures are U.S. Government works and are
  already public domain; our arrangement of them is dedicated to the public domain too. See `NOTICE`.

Attribution is welcome and not required. Corrections are worth more than attribution:
**bo@precisionfederal.com**.

## A note on what this is not

Nothing here is published by, endorsed by, or on behalf of any federal agency. The register's counts are what
members of the public said, published with their N and with small cells suppressed — never a claim about what
anyone owes or paid.

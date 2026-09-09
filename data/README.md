# The price table

110 rows. Every dollar figure was read out of a published U.S. federal file, or is the explicit
product of figures on that file with the formula printed on the face of the number. Nothing is
modelled, averaged, interpolated, inflated or recalled. If a thing has no published federal figure it
is **absent** from this folder and named in `GAPS.md` — it is never filled with an estimate.

Anyone can re-derive all 110 rows from scratch with one command. That is the point of the folder.

```bash
python3 data/verify_price_table.py          # fetch every cited file, hash it, recompute every figure
python3 data/verify_price_table.py --offline   # cache only; anything missing is UNVERIFIED, never a pass
node    scripts/gen-price-table.mjs         # republish public/data/price-table.{csv,json} + dictionary
```

The verifier writes `AUDIT.json` — one record per row: the status, how it was checked, and the
sentence or the arithmetic it found. `/method` renders it. On 2026-09-09 it read all 110 rows
**110 PASS · 0 FAIL · 0 UNVERIFIED**.

## The files

| File | What it is |
|---|---|
| `prices.json` | the table. One object per unit of care, with its basis, year, population, coverage statement, combination rules and source. |
| `conditions.json` | the year-ahead panel as data: condition → a row already in `prices.json`, or an honest null. |
| `state-prices.json` | 47 rows × 109 Medicare localities, built by `build_state_prices.py`, audited in `STATE-PRICES-AUDIT.txt`. |
| `AUDIT.json` | the row-by-row verdict, written by `verify_price_table.py`. |
| `METHOD.md` · `GAPS.md` | how the figures are made, and everything we would not price. Rendered verbatim at `/method`. |
| `unpriceable.json` · `invisible-events.json` | the things a person types that have no federal price, named on purpose. |
| `annotate_price_table.py` | adds the fields the app prints (agency, LOINC, the hospital-setting payment) from their sources. Re-runnable. |
| `verify_price_table.py` | the audit. Exits non-zero on one disagreement. |
| `build_state_prices.py` | builds `state-prices.json` from the CMS RVU and GPCI files. |

## The three kinds of confidence

- **VERIFIED** — the number is a column on the published file. A laboratory rate, an OPPS payment
  rate, a figure printed in a federal report. No arithmetic.
- **DERIVED** — the number is the product of figures on the published file, and the formula is
  written inside the row so you can redo it. Every physician fee schedule row is DERIVED, because CMS
  publishes Relative Value Units and one conversion factor ($33.4009 for CY2026), not dollars.
- **REPORTED** — quoted from a published federal report, with the page.

## The rules that travel with the data

`summable`, `mutually_exclusive_with` and `bundles_ancillaries` are fields, not prose, because a rule
written only in prose is a wish. A MEPS visit average already contains the labs ordered that day; a
CMS allowed amount does not. A whole-year excess figure already contains every visit in the ledger.
Adding across those is the commonest way a cost-of-illness total becomes meaningless, so the table
carries the guard and `lib/table.ts` enforces it.

Two figures on different `basis` values are never summed. The basis legend is in `prices.json`.

## Adding a row

1. Find the published federal file. Not a summary, not a news article, not a model — the file.
2. Read the figure out of it. If it needs arithmetic, the arithmetic is one operation and it goes in
   the coverage statement in words.
3. Write the coverage statement: how the number was made, who it describes, and — the part that
   matters most — **who it does not describe**.
4. Add a check to `verify_price_table.py` so the row re-derives from the source. A row with no
   checker is reported as `no checker` and the test suite fails.
5. `node scripts/gen-price-table.mjs` and commit the published files with it.

A row without step 4 does not ship.

## Licence

The federal figures are U.S. Government works and are in the public domain. The labels, synonyms,
coverage statements, combination rules and this arrangement are dedicated to the public domain by
Precision Federal LLC under CC0 1.0. Take it, fork it, correct it — attribution welcome, not required.
Published copies: `/data/price-table.csv`, `/data/price-table.json`, `/data/price-dictionary.csv`.

# Price table additions — 2026-09-09

**157 rows added**: 116 from the CMS physician fee schedule, 41 from the CMS clinical laboratory
fee schedule. The table goes from 117 published units of care to **274**.

Every dollar figure was read out of, or computed from figures read in, the CMS files named below.
No figure came from a model, a memory, a secondary source or an estimate. A code that was not on an
unmodified line with status indicator **A** (fee schedule) or a printed 2026 **RATE** (lab schedule)
was **omitted and is listed at the foot of this file with the reason**.

## Why these rows

A person types what happened to them, not what a fee schedule calls it. A unit the table does not
hold reads to that person as *"this tool has no figure for me"*. The 117 rows covered the office
visit, the common labs and the big scans; they did not cover the mammogram, the bone density scan,
physical therapy, the skin biopsy, the epidural, the rapid strep test, or the fee for the needle
that drew the blood — all things people say in the first sentence they type.

## Files read

| File | URL | SHA-256 |
|---|---|---|
| PPRRVU2026_Jul_nonQPP.csv | https://www.cms.gov/files/zip/rvu26c-updated-06-30-2026.zip | b7d197e73211ef6854c213c267d5fa9dec8df995db8e1ee7d44c0556ad7cee21 |
| PUF_CLFS_CY2026_Q3V1.csv | https://www.cms.gov/files/zip/26clabq3.zip | f5a090789c40fe791b478a735c7cf5399e86726adc788f11829435cb0ca4d7d5 |

Same two releases the existing rows cite (RVU26C July release, CLFS CY2026 Q3V1), so the whole table
is one vintage. Conversion factor **$33.4009**, READ from the CONV FACTOR column of the RVU file
where it is identical on every line.

## Method

- **Fee schedule rows** (`confidence: DERIVED`): national allowed = total non-facility RVU x
  conversion factor, geographic practice cost indices 1.000, read on the **unmodified** line so the
  figure is the complete service rather than a professional or technical split. Work, non-facility
  practice expense and malpractice RVUs are quoted inside each coverage statement, and the verifier
  re-parses that sentence against the file.
- **Lab rows** (`confidence: VERIFIED`): the RATE printed on the unmodified 2026 row, read directly.
  Each carries `alternates.medicare_beneficiary_cost_share_usd = 0.0` with the MEDICARE-ONLY warning.
- Every row carries ≥6 plain-language phrasings, its CPT/HCPCS code, its file, its year, and a
  coverage statement that says who the figure does **not** describe and that it is a price floor.
- Where a code is only part of an encounter, the coverage statement says so on its face: the four
  emergency-department rows are **the emergency physician's fee only** (the hospital's facility fee
  is a separate row already in the table); 93017 is the stress-test tracing without the physician's
  reading; 93010 is the reading without the tracing; the injection and infusion rows are the fee for
  **giving** the drug, never the drug; the biopsy rows say the pathologist's exam is billed separately.

## What was added

| Family | Rows | Examples |
|---|---|---|
| Emergency department, physician component | 4 | 99281, 99282, 99283, 99285 |
| Virtual, wellness, cognitive | 4 | 98016, G0438, G0439, 99483 |
| Mental health | 6 | 90832, 90792, 90847, 90853, 90839, 96130 |
| Physical, occupational, speech therapy | 8 | 97162, 97163, 97140, 97112, 97530, 97165, 97167, 92507 |
| Chiropractic, acupuncture, massage | 3 | 98941, 97810, 97124 |
| Imaging | 22 | 71045, 73562, 72110, 77067, 77065, 77080, 76536, 76641, 71275, 78452, 78306 |
| Cardiology | 6 | 93017, 93010, 93307, 93312, 93350, 93923 |
| Neurology | 11 | 95816, 95907–95913, 95885, 62270, 95992 |
| Sleep | 3 | 95800, 95806, 95811 |
| Gastroenterology | 10 | 45380, 45385, 45330, 43235, 91110, 91034, 74246, 78264, 91065, G0121 |
| Pulmonary and allergy | 5 | 94060, 94640, 95024, 95044, 95165 |
| Injections and infusions | 10 | 96372, 96365, 96366, 96374, 20605, 20611, 20550, 20552, 64483, 62323 |
| Skin and minor procedures | 8 | 11102, 11104, 17110, 17000, 10060, 12001, 69210, 29125 |
| Eye, ear, throat | 8 | 92014, 92012, 92083, 92134, 92250, 92567, 92588, 31575 |
| Women's health, pathology, day surgery, immunisation | 8 | 57454, 58100, 88305, 29881, 66984, 64721, 19083, 90471 |
| Clinical laboratory | 41 | 36415, 81003, 87880, 87804, 80074, 86364, 84153, 80076, 80069, 81528 |

Lowest figure $2.25 (81003, automated urinalysis). Highest $802.29 (91110, capsule endoscopy).

## One correction to the 2026-09-08 report

That report recorded **36415 (venipuncture)** as unpriced in both official files and did not add it.
It is in fact on the CY2026 Q3 clinical laboratory fee schedule, unmodified row, at **$9.34**:

```
2026,36415,,20260101,N,00009.34,Coll venous bld venipuncture,...
```

It is added here as `cms-lab-venipuncture`. It matters more than its size: it is charged once per
draw on top of every test run on that sample, so a person with four labs from one stick paid for
four tests and one venipuncture, and the table can now show that line instead of hiding it.

## Not added, and why

| Code | Reason |
|---|---|
| 99050, 99051, 99053, 99058, 99060 (after-hours / office emergency) | Status **B** in RVU26C — bundled into the visit; CMS publishes no separately payable amount. "Urgent care" is handled instead by data/synonyms.json, which binds those phrases to the office-visit row an urgent-care centre actually bills (99203), with the reason written in that file's `notes`. |
| 98000–98011 (synchronous audio-video and audio-only telemedicine) | Status **I** — not valid for Medicare, no payable national amount. Telehealth phrasings are bound to the office-visit rows, which is how Medicare pays a telehealth visit. **98016** (brief virtual check-in) is status A and WAS added. |
| 99242–99245 (office consultations) | Status **I** — Medicare does not pay consultation codes. |
| 99441–99443 (telephone visits) | Absent from the file; deleted from the fee schedule. |
| 78815 (PET/CT skull to thigh) | Status **C** — carrier priced; CMS publishes no national amount. |
| 92015 (refraction), 92551 (pure-tone screen) | Status **N** — non-covered; no payable national amount. |
| 90715 and other vaccine products | Status **E** — excluded from the fee schedule (vaccines are paid elsewhere). The **administration** fee, 90471, is status A and was added. |
| 90846 (family therapy without the patient) | Status **R** — restricted coverage. 90847, with the patient present, was added. |
| 94760 (pulse oximetry) | Status **T** — paid only when nothing else is paid that day; no standalone national amount. |
| 94620 (simple pulmonary stress test), 91122 (anorectal manometry) | Not present in PPRRVU2026_Jul_nonQPP.csv. |
| 99417 (prolonged visit add-on) | Status **I**, as recorded on 2026-09-08. |
| S9083, S9088 (urgent-care global codes) | HCPCS Level II codes that appear in neither federal file. No figure was invented; see the synonyms note above. |

## Known gap, carried forward deliberately

These rows carry **no CY2024 average-submitted-charge or average-allowed companion figure**. Those
come from a CMS claims and utilisation file that was not opened here, and recalling or estimating one
would break the only rule. In the line drawer this shows as the "File / Row / SHA-256" block being
absent for an added row while the source link, the code and the RVU arithmetic are all present. The
67 companion figures on the original rows are unaffected.

## Verification

```
python3 data/verify_additions.py     # 210 rows across both additions files: ALL PASS, exit 0
python3 data/verify_price_table.py   # 117 published rows: 117 PASS, 0 FAIL, exit 0
npx vitest run tests/catalog-additions.test.ts   # 11 tests
```

`verify_additions.py` re-reads both CMS CSVs from scratch, re-checks their SHA-256 against the hashes
recorded in each additions file, independently recomputes every `value_usd`, re-parses the RVU inputs
quoted in each coverage statement, and refuses any id or CPT code claimed twice across the two files.

The guard was **proven, not assumed**: tampering one DERIVED value (77080 -> $99.99) and one VERIFIED
value (36415 -> $1.00) produced exactly 2 failures and exit 1; restoring the file returned exit 0.

End to end on a local stack, the sentence *"I had a mammogram, then a bone density scan, then a rapid
strep test, then an epidural steroid injection, and a punch biopsy"* produces five chips, five ledger
lines and five source drawers — $126.26 (CPT 77067), $39.41 (CPT 77080), $16.53 (CPT 87880),
$273.22 (CPT 62323), $121.25 (CPT 11104) — each with its cms.gov link. All five were read by the
deterministic rules; no model was needed.

## The words, not only the rows

`data/synonyms.json` grew from 83 rows / 304 phrases to **180 rows / 445 phrases**, and its `notes`
block from 5 entries to 9. Of the **141 phrases added**, **39 landed on the wrong row** before this
change and **9 matched nothing at all** — measured by re-running mapUtterance over the merged
274-row table with the old synonym file in place:

| The phrase | Used to price | Now prices |
|---|---|---|
| speech therapy | 45-minute psychotherapy | speech-language treatment (92507) |
| oct scan of my eye | CT of the chest | retinal OCT (92134) |
| x ray of my lumbar spine | chest X-ray | lumbar spine X-ray (72110) |
| knee scope operation | colonoscopy | knee arthroscopy (29881) |
| psa blood test | complete blood count | PSA (84153) |
| home sleep test | in-lab overnight study | home sleep apnea test (95800) |

Eight of the 39 were named blood tests all landing on the complete blood count. Every phrase in the
file is proved by tests/mapper.test.ts to map back to its own row, 445 of 445.

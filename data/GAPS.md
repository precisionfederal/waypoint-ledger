# What we could not price, and why

*This is a feature of the tool, not a backlog behind it. The app shows these on the page, in the ledger,
beside the priced lines.*

A tool whose whole claim is *"no estimate we cannot show you"* has to be willing to show you a blank. Every
item below is a real cost of a diagnostic odyssey that we deliberately left unpriced, because no defensible
published figure exists. Each one names what is missing, why, and what would fix it.

Dr. John Phillips of the NIH Office of the Director named lost productivity and caregiver time as *"really
important... but they're also ones that are difficult to capture and difficult to measure,"* and then asked
teams to name the source. **For the hardest one, the honest answer turned out to be that the federal
government publishes the inputs and explicitly declines to publish the answer.** That finding is worth more
than a number would have been.

---

## The four that cost a person real money

### 1. The work you missed

**Status: unpriced. The tool asks for your own pay rather than guessing it.**

Half of this exists and is good. Adults with long COVID missed **2.54 more workdays per year** than adults
without it — adjusted, nationally representative, p < 0.01. Use the *excess* 2.54, never the gross 8 days,
because 4 of those 8 would have been missed anyway.

What is missing is **your wage.** Applying a national median to a specific person is a guess about that
person's pay. Worse, the median is drawn from people **still working full time** — it excludes part-time
workers, the self-employed, and anyone who cut their hours or stopped working because of the illness. The
sickest people leave the denominator, so any lost-work figure built on it is biased downward as a measure of
illness burden, and no other series patches that.

> **What would fix it:** ask for your own hourly or weekly pay and multiply. That is arithmetic on a figure
> you supplied, not an estimate we invented. It is the honest way to price this line and it is how the tool
> does it.

*Two wage figures that circulate widely — $279 a day and $1,106 a week — were dropped. Both were read inside
research papers rather than at the Bureau of Labor Statistics, and the daily one is irreconcilable with the
BLS median we did retrieve directly. We would rather use a figure we opened ourselves.*

---

### 2. Time someone spent caring for you

**Status: unpriced. No federal dollar figure exists, and that is the finding.**

This is the one Phillips flagged as hardest, and the data confirms he was right.

- **BLS publishes the hours** — 0.89 hours a day among people who cared for a household adult, from its
  time-use survey.
- **BLS publishes the wage** — $17.21 an hour for a home health aide, from its occupational survey.
- **BLS has never published their product**, and states in its own *Monthly Labor Review* that putting a
  monetary value on unpaid household work is outside the scope of its work.
- **The health-care agencies cannot help either.** Unpaid time given by a spouse, parent or adult child is
  never billed on a claim, so it can never appear in any CMS dataset. The household survey does not collect it
  in any form.
- **The only per-person long COVID caregiving valuation anywhere is British, in pounds** (£8,726 per patient).
  Converting it would manufacture a number no source published.

And even with both inputs in hand, the answer depends on a choice nobody has made for us. The defensible
replacement wage spans **$17.21 to $46.90 an hour** — a factor of 2.7 — depending on whether the task is
custodial, clinical, or genuinely nursing-level. A different method entirely, valuing what the caregiver *gave
up* by not working, gives **$24.51** and answers a different question, 42% away. Choosing one silently would
be choosing the answer.

> **What would fix it:** state the method and let the reader pick it, showing both numbers side by side with
> the multiplication visible — and labelled as our arithmetic over two cited federal inputs, never as a federal
> statistic.

🔴 **One category error to avoid.** The widely quoted BLS eldercare figure of 3.9 hours a day requires the
person receiving care to be **65 or older with an aging-related condition.** Long COVID is predominantly a
working-age illness. Applying eldercare hours to a 38-year-old is not an approximation, it is the wrong
series.

⚠️ **And a proxy that looks reasonable and is not.** Medicare publishes rates for *paid* home health care.
Substituting a paid aide's rate for a family member's unpaid hours is a category error, not a shortcut — one
is purchased care, the other is not. Note too that the aide's **wage** is not the **price** a family pays: an
agency's billed rate is materially higher because it carries overhead, supervision, insurance and margin, and
BLS does not publish that rate.

---

### 3. Travel to appointments

**Status: unpriced. Needs your actual distance.**

The IRS publishes a medical mileage rate, so the price half exists. The distance half does not: it is specific
to a person and their geography, and rural patients routinely travel an order of magnitude further than urban
ones. A national average here would be most wrong for exactly the people it matters most to. Travel, lodging
and the time cost of reaching a specialty center sit outside every federal health dataset.

> **What would fix it:** ask for the round-trip distance and apply the published IRS rate. Real input,
> published rate, honest arithmetic.

---

### 4. What the delay itself cost you

**Status: unpriced. This is a causal claim, not a price.**

Whether being diagnosed fourteen months late produced worse outcomes and higher costs than being diagnosed
early needs a design that separates the effect of the delay from the effect of being sicker to begin with.
Without one, any number here is a correlation dressed as a cost.

> **What would fix it:** a study design. Until there is one this line is named on the page and left blank,
> because the cost is real even though the figure is not.

---

## The gaps in the money data itself

### 5. What YOU paid, as opposed to what your insurer paid

**Status: no statistically significant figure exists — and that is a finding, not a hole.**

The best national estimate of the *extra* out-of-pocket burden of long COVID was $236 a year with a 95%
interval running from **minus $95 to plus $566.** It crosses zero, at p = 0.162. We carry no number in that
field, because a number in a value field gets rendered and rendering $236 would assert what the source
declines to assert.

The excess landed on payers — about **$3,705 of the $4,098** — not visibly on the patient's wallet.

This does not mean individuals are not hit hard. Averages hide tails, and this estimate does not separate
people with high deductibles or no insurance, who are exactly the people for whom the null result is least
likely to hold.

*Separately: the AHRQ report on 2020 COVID care publishes total payments per event with no out-of-pocket
column at all, so even for acute COVID the patient's share is unavailable there.*

---

### 6. Anything a commercially insured or uninsured person actually paid

**Status: not published by CMS at all.**

Every itemized price in this tool is Medicare's. CMS publishes no commercial-market or uninsured
out-of-pocket data of any kind. This is the largest single limitation of the ledger, and it is why the tool
shows the average submitted **charge** beside every line — that is the number an uninsured person is billed
against, and it runs 2.9 to 8.3 times the Medicare rate depending on the service.

---

### 7. Any per-visit figure newer than 2014

**Status: structurally unavailable at a citable link.**

AHRQ stopped publishing static per-visit expenditure tables after 2014. We probed 2008 through 2016: 2008–2014
return normally, 2015 and 2016 return 404. The data moved into an interactive dashboard whose settings cannot
be driven from a web address, so no per-visit view can be cited at a stable link. **The newest per-visit table
a stranger can open is from 2014.** About a decade of medical price growth sits between it and today, and we
do not inflate it forward, because the moment we adjust a figure it becomes ours rather than the government's.

---

### 8. Long COVID spending broken out by service type

**Status: nobody publishes it.**

Neither AHRQ nor the peer-reviewed analyses decompose long COVID spending into visits versus imaging versus
prescriptions. AHRQ's long COVID report is prevalence only — 13.7% of adults who ever had COVID reported ever
having long COVID — with **zero dollar figures in it.** There is no pie chart to draw. The all-cause service
split may be substituted only if clearly labelled all-cause, which would make it a different fact.

---

### 9. How many visits, tests and specialists an odyssey actually takes

**Status: no federal source publishes a per-patient trajectory.**

This is the other half of every dollar figure, and it is the reason the example journey's **counts are ours
while its prices are not.** CMS prices units and does not count them per patient. The national hospital
databases record visits with **no patient identifier**, so they can never follow one person across visits —
not with more effort, not with a data-use agreement, not in principle. A study of 984 patients at three
academic post-COVID clinics gives referral *probabilities* (64.3% referred to a subspecialty; pulmonology
25.0%, cardiology 22.4%, neurology 9.0%) but counts only care delivered inside those three clinics.

> **What would fix it:** a longitudinal individual-burden study. The 2025 review of this literature names its
> absence as an open gap in the field.

---

### 10. Time from first symptom to diagnosis, in the United States

**Status: no population-based figure.**

The closest proxies are a median of **98 days** from infection to a first post-COVID clinic visit — which
measures when someone reached a specialized clinic, not when anyone named their condition, and describes only
people who successfully got there — and a survey finding that fewer than half of people had a formal diagnosis
on their record at a median of 19.8 months, which was **83% British** and recruited through support groups.
Neither is a U.S. time-to-diagnosis.

---

### 11. Long COVID cost by severity or symptom pattern

**Status: an open gap in the field, named as such by a 2025 peer-reviewed review.**

Every figure available is a population mean over an extremely heterogeneous group with a heavily skewed cost
distribution. There is no published estimate for a mild case versus a severe one.

---

### 12. Costs for anyone this data does not follow

- **Children.** Every U.S. long COVID cost analysis covers adults 18+. The only per-patient pediatric figure
  is French, in euros.
- **The self-employed.** BLS excludes them from every earnings series used here — roughly one worker in ten,
  unpriceable for lost work.
- **Part-time and gig workers.** The lost-work studies restrict to full-time workers averaging 35–100 hours a
  week, excluding the people least protected by paid sick leave.
- **Anyone in a nursing home, in prison, or on active military duty.** Excluded by survey design.
- **People who died.** The survey follows survivors, so the sickest are underrepresented in every figure here.
- **People on Medicare Advantage.** Roughly half of Medicare beneficiaries. Their negotiated rates appear in
  none of these fee schedules.

---

### 13. Everything below the national level

Every figure in this tool is national. Hospital payments in particular are adjusted by each hospital's local
wage index, which moves them by more than 30% in some markets. Occupational wages vary substantially by state.
Where regional cells existed in a source, we dropped them: the agency's own text said the regional differences
were not statistically distinguishable, and presenting them anyway would have been the tool manufacturing
precision the source disclaims.

---

## Figures we found and deliberately did not ship

Honesty runs in both directions. These are real published numbers that we located, checked, and left out.

| Dropped | Why |
|---|---|
| **A $3,571 "average ER charge"** | Would have been the tool's most attractive headline. It is arithmetically invalid — the mean of hospital-level cost-to-charge ratios is not the ratio of national means — and no source publishes it. The prohibition is recorded in the data file so a later pass cannot rediscover it innocently. |
| **A $2,678 person-year COVID total, sitting in the same summable list as its own components** | It already contained the visits beneath it. Run against the app's own code, four ordinary phrases produced a total of $4,314 when the truthful answer was $2,678 or $1,636, with no warning shown. The figure is gone and the app now enforces mutual exclusion in code rather than in prose. |
| **The entire 2020 acute-COVID price table** | Wrong condition and the least representative year available: 2020 was when most insurers waived COVID cost-sharing, so the patient-visible share was atypically low. It was also six years stale. |
| **Regional and metro-area breakdowns** | The agency's own report states the regional differences were *not statistically different*, and the metro difference was significant only at the 0.10 level, against the report's own 0.05 convention. |
| **An "uninsured" cell of $1,124** | Carried the agency's own flag for an unreliable estimate, which had been stripped. It also read *lower* than the insured figure — because uninsured people go without care, not because care is cheaper for them. |
| **A $236 excess out-of-pocket point estimate** | Interval crosses zero. Kept as prose; removed from every numeric field. |
| **A $9,000 per-person and $3.7 trillion national cost estimate** | The source document could not be opened — it returns an access error. Both are model constructs, and roughly 59% of the $3.7 trillion is quality-of-life loss valued in dollars, which is not money anyone paid. A tool claiming *"no estimate we cannot show you"* cannot ship a figure whose source it could not read. |
| **A pooled "all other specialty" average used as a pulmonology price** | It blends about 25 specialties. Using it as a pulmonology figure means averaging a rheumatology consult with an oncology consult and calling the result pulmonology. Replaced with the specialty consult code, with the basis switch disclosed. |
| **A $3.43 monthly "cardiology" cost** | A per-month population average across everyone with COVID, most of whom never saw a cardiologist. Reads as a unit price and understates one by roughly two orders of magnitude. |
| **National aggregates of $168 billion and $6.4 billion in lost earnings** | They measure different phenomena — leaving the workforce versus missing days while still employed — and neither can be divided by a patient count to price one person. |
| **A five-year cumulative excess of $7,124** | The most odyssey-sounding label in the literature attached to a figure that excludes physician fees, laboratory tests, imaging interpretation and pharmacy — which is most of an odyssey. Single health system, and not peer-reviewed. |
| **Household annual spending totals** | Nested three levels deep, so summing across them double counts, and roughly two-thirds of the healthcare total is insurance premiums — money paid whether or not anyone is sick. |
| **Two hospital inpatient means computed by division** | Real inputs, but the quotient is not published by the agency and would be read as a quotation. The COVID one is also acute COVID, which most long COVID patients never experience. |

**Total dropped: 33 figures and figure-groups.** Every one of them was a number we could have shown.

---

## Why this page exists

The blanks above are the part of this tool that is hardest to fake. Anyone can produce a total. Producing a
total *and* an honest list of what is missing from it — including the numbers you chose not to use, and the
one finding that makes your own headline smaller — is the only way a stranger can tell whether the total in
front of them was reasoned or assembled.

If you have a figure for any line above, or you think one of the numbers we did ship is wrong for someone like
you, tell us. That is the point of the tool: it is a demand signal back to the agencies that publish these
numbers, about which ones are missing and which ones do not describe real people.

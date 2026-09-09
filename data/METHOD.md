# How this tool arrives at a number

*Displayed verbatim in the app. Nothing here is marketing copy — every claim in it is checkable against
`prices.json`.*

---

## The one rule

**We never invent a dollar figure.** Every number in this ledger is one you can look up yourself. Each line
carries its source document and a link to it. If we could not find a real published figure for something, the
line is **blank and named** rather than filled with a plausible guess — those blanks are listed in `GAPS.md`
and shown to you on the page, because a missing number is honest and a fabricated one destroys the only claim
this tool makes.

That rule has a cost, and we pay it in public. There are things on the list below that we simply cannot price.

---

## Where the prices come from

**The itemized ledger is priced at the 2026 Medicare fee schedules** — the Physician Fee Schedule for visits,
imaging and testing; the Clinical Laboratory Fee Schedule for blood work; the Hospital Outpatient system for
the fees a hospital bills on its own behalf. These are **allowed amounts**: the approved price for a service,
counting both what the program pays and what the patient owes.

We chose that basis for three reasons, and we will say the fourth thing about it too.

1. **It is current.** These are 2026 rates.
2. **It can price one test.** The household survey that measures what Americans actually pay cannot: it folds
   blood work and imaging invisibly into the visit that ordered them and never itemizes.
3. **It adds up honestly.** Under Medicare rules a lab and a scan are separately billed, so adding them to a
   visit is correct rather than double counting.
4. 🔴 **And it describes the wrong people.** Medicare covers people 65 and older, plus people under 65 who
   qualified through 24 or more months of disability benefits or who have end-stage kidney disease. Long COVID
   falls hardest on working-age adults — on employer coverage, a Marketplace plan, Medicaid, or uninsured.
   **Read the Medicare total as a price floor, not as your bill.** Commercial insurance normally pays above
   Medicare. Every line therefore also carries the average **charge** providers actually submitted in 2024,
   which is roughly what an uninsured person is billed against, so you can see both ends of the range.

---

## Charges, allowed amounts, payments — and three more

A dollar figure about health care is meaningless until you know which kind it is. Six different kinds appear
in this tool, and **every figure is tagged with its own.**

| Basis | What it means | Where it comes from |
|---|---|---|
| **allowed amount** | The approved price: program payment plus your share | CMS fee schedules |
| **payment** | What every payer actually paid, combined | MEPS household survey |
| **out-of-pocket** | What you personally paid | MEPS |
| **charge** | What the provider billed. Almost never what an insured person pays; it is what an **uninsured** person is billed against | CMS claims file |
| **facility cost** | What it cost the **hospital** to produce the service — wages, supplies, utilities | AHRQ's HCUP reports |
| **wage** | Earnings. An input to a lost-time calculation, never a price | BLS |

The sixth one deserves a note. The common shorthand is that HCUP reports charges. That is half wrong in the
half that matters: HCUP's *databases* hold charges, but its published *reports* convert them to hospital
production cost — a number that is none of the other five. We gave it its own label rather than force it into
one that would misdescribe it.

**Never sum across bases. Never average across them.** One emergency room visit appears in this tool as
$544.54 (Medicare allowed), $1,048 (what payers actually paid, 2014) and $750 (what it cost the hospital,
2021). Those are three correct answers to three different questions, not three estimates of one.

---

## Excess, not gross — and where each belongs

The honest way to state the cost of a condition is the **excess**: how much more a person with it spends than
a comparable person without it. The gross figure counts care they would have needed anyway.

For long COVID, the numbers make the point better than the argument does. Adults reporting long COVID spent
about **$11,305** on health care in a year. That sounds like the answer. It is not — a comparable adult who
never had COVID already spent **$7,162**. The adjusted excess is **$4,098 a year, in a range from $1,619 to
$6,578.** Roughly 63% of the gross figure is care that had nothing to do with long COVID.

So the tool shows both, and **keeps them apart**:

- **The headline is the excess** — $4,098 a year, shown as a range because the range is the honest answer.
- **The itemized ledger is gross** — the price of care that actually happened. A fee schedule prices units; it
  cannot by itself produce an excess-over-a-comparable-person figure. That takes a matched study.

🔴 **The two can never be added.** The annual excess figure already contains every visit, test and scan in the
ledger beneath it. Putting both in one sum counts the same care twice. The app enforces this in code, not in a
footnote: every figure carries a `summable` flag and a list of the figures it is mutually exclusive with, and
a whole-year total is marked exclusive with the entire per-event stack.

One more rule that has to live in code rather than prose, because it is not intuitive: **whether a lab can be
added to a visit depends on the source.** Under Medicare, labs are separately billed and can be added. Under
the household survey and the hospital-cost reports, they are already inside the visit's total and adding them
double counts. There is no single global rule, so each figure carries its own `bundles_ancillaries` flag.

---

## What the AI does, and what it is not allowed to do

**The model maps your words to a service. Deterministic code does the pricing. The model never emits a
number.**

When you write *"they scanned my heart"* or *"I had bloodwork done"*, a language model's only job is to decide
which unit of care you are describing — an echocardiogram, a complete blood count. That is a **matching**
problem, and it is what a language model is genuinely good at.

The moment the unit is identified, the model is out of the loop. A lookup in `prices.json` returns the
published figure, its source, its year and its coverage statement. Ordinary arithmetic adds the lines. **No
model, average, heuristic or interpolation anywhere in this app produces a dollar figure.**

This is a structural guarantee, not a policy. The two live in separate modules for exactly this reason, and
the consequence is deliberate: **if a unit of care is not in the table, the line comes back UNPRICED and is
shown to you as unpriced.** The tool would rather show you a blank it can explain than a number it cannot.

Two smaller commitments follow from the same principle:

- **We do not adjust old figures for inflation.** The moment we inflate a number it becomes ours instead of
  the government's. Where a figure is stale we print the year on its face and say so.
- **We record the derivations we refuse to make.** Some tempting arithmetic is invalid in ways that are not
  obvious — dividing an average hospital cost by an average cost-to-charge ratio does not give you an average
  charge, because the mean of ratios is not the ratio of means. Those prohibitions are written into the data
  file so that a later pass cannot rediscover them innocently.

---

## Every figure tells you who it does not cover

Dr. John Phillips of the NIH Office of the Director told this cohort that transparency means conveying not
just the source but *"who is and isn't covered in that data"*, and whether a finding is broadly or narrowly
applicable. We took that literally.

**Every figure in this tool carries a coverage statement in plain English** — required, non-empty, and checked
before the app will render the number. Each one says: who this number describes, **who it does not**, what
year, what geography, what population, and what would make it wrong for you specifically.

Not "Medicare FFS only." That is jargon, and jargon is not a coverage statement. The actual sentence.

---

## What this data does not cover

Stated plainly, because these are the limits you would otherwise have to discover for yourself.

**Whose money it is.** Almost every figure describes what care *cost*, not what *you* paid. The one clean
national estimate of the extra out-of-pocket burden of long COVID could not be distinguished from zero — see
below.

**Working-age people on commercial insurance.** The itemized prices are Medicare's. CMS publishes no
commercial-market data at all. This is the single largest limitation of the ledger and the reason we show the
charge figures beside every line.

**The uninsured paying cash.** Survey expenditures are negotiated payments. Cash and list prices are
systematically higher and appear in no figure here except the charge comparison.

**Anywhere below the national level.** Every figure is national. Hospital payments in particular are adjusted
by each hospital's local wage index, which moves them by more than 30% in some markets.

**Anyone institutionalized.** The household survey excludes people in nursing homes, in prison, and on active
military duty. It also follows survivors, so the sickest are underrepresented.

**How many visits an odyssey actually takes.** The prices are real; **the counts in the example journey are
ours.** No federal source publishes a per-patient trajectory. The hospital databases record visits with no
patient identifier, so they can never follow one person across visits — not with more effort, not with a
data-use agreement, not in principle. We built the sequence from published referral rates and labelled it as
our construction.

**Long COVID broken out by service type.** No source anywhere decomposes long COVID spending into visits
versus imaging versus prescriptions. There is no pie chart to draw.

**Anything that never generates a claim** — over-the-counter medicine, cash-pay therapy, care someone went
without because they could not face another appointment. Invisible to every claims-based source, and real
money all the same.

**Time.** Costs widen rather than resolve. A one-year snapshot understates a lifetime.

---

## The finding we lead with rather than bury

The best nationally representative U.S. evidence found **no statistically significant difference in
out-of-pocket spending between adults with and without long COVID.** The point estimate was $236 a year, but
its interval runs from **minus $95 to plus $566** — it crosses zero, at p = 0.162.

We carry **no number** in that field. A number in a value field gets rendered, and rendering $236 would assert
something the source explicitly declines to assert.

What the data does show is where the money went: of the $4,098 excess, about **$3,705 landed on insurers.**
For the average insured adult, long COVID drives large excess spending that insurance absorbs.

That is uncomfortable for a tool built to show a person what their illness cost them, and it is exactly why it
belongs at the top. **The patient-visible cost systematically understates the illness.** An average also hides
its tail — this estimate does not separate people with high deductibles or no insurance, who are precisely the
people for whom the null result is least likely to hold.

A ledger that headlined a large personal out-of-pocket figure would be more persuasive and less true. Saying
so is the strongest evidence we can offer that this tool reports what the data says.

---

## One thing worth knowing about the data itself

AHRQ stopped publishing its static per-visit expenditure tables after 2014. We checked: the 2015 and 2016
files return 404, and the data moved into an interactive dashboard whose settings cannot be reached from a
fixed web address. **The newest per-visit table a stranger can open at a stable link is from 2014** — about a
decade of medical price growth ago.

That is not a defect in the research. It is a fact about the federal evidence base, and a tool built on public
data should say it out loud rather than paper over it with an inflation adjustment.

---

## Provenance labels

| Label | Meaning |
|---|---|
| **VERIFIED** | Read directly in the cited source document. |
| **DERIVED** | Computed from figures read in the source, using the source's own formula, with the inputs printed on the face of the number so you can redo the arithmetic. CMS publishes relative value units and a conversion factor rather than a dollar column, so every physician fee schedule figure is necessarily derived — calling it "verified" would be a small lie, and small lies are what this tool exists to avoid. |
| **REPORTED** | Read in a secondary source citing the primary. **No figure in this tool carries this label.** Figures we could not open at their primary source were dropped rather than shipped. |

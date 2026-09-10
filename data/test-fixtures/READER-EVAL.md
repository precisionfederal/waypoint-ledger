# The reader: which model, measured

Corpus: `data/test-fixtures/map-eval.json` — 209 sentences, 220 expected units, 39 sentences that must produce nothing.
Harness: `scripts/eval-models.mjs`, reasoning effort `low`, run 2026-09-10 02:58Z.
Same prompt, same catalog (251 selectable rows), same guarantees for every model: the model may only fill a phrase the rules left blank, only with an id the catalog holds, and never sees or returns a figure.

| reader | precision | recall | F1 | false positives | p50 ms | p95 ms | tokens in / out | errors |
|---|---|---|---|---|---|---|---|---|
| rules only (no model) | 74.3% | 68.2% | **71.1%** | 52 | — | — | — | — |
| gpt-5.4-nano | 77.2% | 86.4% | **81.5%** | 56 | 1623 | 4627 | 1,196,882 / 6,099 | 0 |
| gpt-5.4-mini | 78.3% | 88.6% | **83.2%** | 54 | 1041 | 2407 | 1,196,882 / 8,653 | 0 |
| gpt-5.4 | 78.6% | 88.6% | **83.3%** | 53 | 1580 | 2540 | 1,196,882 / 9,738 | 0 |
| gpt-5.5 | 79% | 89.1% | **83.8%** | 52 | 1696 | 3771 | 1,196,882 / 7,512 | 0 |

Precision is the number that matters: a wrong unit puts a federal figure on the page for care the person never had.

## The decision

`OPENAI_MODELS = ['gpt-5.5', 'gpt-5.4-mini']` in `cf/functions/api/map.js`, reasoning effort `low`.
Override without a deploy: set `READER_MODELS` (comma-separated) or `READER_EFFORT` in the environment.

Why gpt-5.5 first:

- It is the strongest reader on every axis measured — F1 83.8%, precision 79%, recall 89.1%.
- It is the **only** model of the four that added no wrong unit of its own: all 50 of its false positives came from the rules, which it is not allowed to overrule.
- p95 3,771 ms, comfortably under the 6 s bar inside the 9 s worker timeout; p50 1,696 ms.
- It raised 12 flags on the rules and every one of them was right (100% flag precision, the only model at 100%).

Why gpt-5.4-mini is the fallback: next-strongest reader (F1 83.2%) and the fastest of the four (p50 1,041 ms, p95 2,407 ms), so a gpt-5.5 outage costs 0.6 F1 and no latency.

Why effort stays `low`: measured on the 185-sentence corpus at effort `medium`, gpt-5.4-mini went **down** (86.1 → 85.5 F1) and gpt-5.5's p95 rose to 6,094 ms — over the bar. Medium buys nothing and costs the timeout margin.

## Every false positive, and what fixes it

On the chosen reader, **50 of 50 false positives are rules answers, 0 are the prompt.** The model may never
overrule a phrase the rules already read, so the ceiling on precision is `lib/mapper.ts`, not the reader.
Each family below is a work order for the rules lane; the reader already flags several of them at run time.

**A. A substring matched, not the word (20 cases).** Fix: match on whole words with boundaries, and require
the full term, not a fragment of it.

- 82 "the magnesium came back low" → `cms-img-mri-lumbar-nc` — "back" + "low" read as a lower-back scan.
- 95 "looked at it under the microscope" and 63 "put the scope down" → `cms-proc-colonoscopy` — the substring "scope".
- 55 "a picture of my lungs" and 202 "the injection and the pictures" → `cms-eye-fundus-photos` — "picture".
- 48 "damage to the heart muscle" → `cms-test-emg` — "muscle".
- 187 "bone density scan of my hips and spine" → `cms-img-mri-lumbar-nc` — "spine".
- 160 "sleap study" → `cms-test-ncs-3-4`; the typo should reach `cms-test-sleep-study`, not a nerve study.
- 30, 72, 110, 196 → `cms-ed-99284-complete` — "room" in "waiting room", "clinic room", "in the room".
- 22, 64, 66, 167, 194 → `cms-mh-therapy-45` — "therapy"/"therapist" with no reading of who or how long.
- 56 "scanned my head in the tunnel" and 133 "all in my head" → `cms-mh-psych-eval`; 126 "brain fog" → `cms-img-mri-brain-both`.

**B. The generic sibling wins over the specific one the sentence names (10 cases).** Fix: order the keyword
table most-specific-first and require the qualifier before falling back.

- 44 "went off to the lab to be grown" → urinalysis, should be `cms-lab-urine-culture`.
- 80 "a second confirming Lyme test" → screen, should be `cms-lab-lyme-confirm`.
- 78 "the high sensitivity version" → ESR, should be `cms-lab-hscrp`.
- 190 "a belt round my chest and a probe on my finger" → basic, should be `cms-test-home-sleep-full`.
- 191 "again after they gave me the inhaler" → spirometry, should be `cms-test-spirometry-bronchodilator`.
- 203 "an echo done through my throat" → echo, should be `cms-img-tee`.
- 204 "took out a polyp" → colonoscopy, should be `cms-proc-colonoscopy-polyp`.
- 36 "lower back inside the tunnel machine" → CT, should be `cms-img-mri-lumbar-nc` (a tunnel is an MRI).
- 136 "with and without dye" → `-nc`, should be `cms-img-mri-brain-both`.
- 35 "my belly with the jelly and the wand" → transvaginal, should be `cms-img-us-abdomen`.

**C. A visit id swallows the test, or the wrong panel is named (13 cases).** Fix: a specialty word plus a
procedure is one event and the more specific unit wins; a named analyte is never a different panel.

- 3, 42, 28, 69, 75, 154, 169 — a visit code printed where the sentence named a test (`cms-test-spirometry`, `cms-eye-exam-new`, `cms-mh-psych-eval`, `cms-g0444`, `cms-lab-electrolytes`, CBC+CMP, A1c+lipids).
- 16 "was told it was all anxiety" → `cms-99214` + `cms-mh-psych-eval`; the sentence says a follow-up, `cms-99213`.
- 155 "the transitional care call" → `cms-99214`, should be `cms-99495` + `cms-99213`.
- 7 "blood to check my thyroid" and 87 "the syphilis screen" → `cms-lab-cbc`; should be `cms-lab-tsh` and `cms-lab-syphilis`.
- 50 "how fast my blood clots" → D-dimer, should be `cms-lab-pt-inr`; 52 "the male hormone" → B12, should be `cms-lab-free-testosterone`.

**D. Care that never happened is priced anyway (7 cases).** Fix: a negation, a future tense or a third-person
subject inside the clause suppresses the match. This is the highest-value fix — every one of these puts a
federal figure on the page for care the person did not receive.

- 115 "suggested physical therapy and I never went" · 122 "they never ran the Lyme test" · 123 "no one ever ordered an EMG for me".
- 181 "I read online that a tilt table test might explain it" · 183 "I want to ask about an EEG at my next appointment" · 209 "the mammogram is booked for next month".
- 182 "my sister had an MRI".

The reader already catches this class and says so — its flags on the live stack included
*"microscope urine test, not colonoscopy"*, *"throat scope is upper endoscopy"*, *"only wondered about a
test, not done"* and *"someone else had the MRI"* — but a flag is a report and never changes an answer,
a count or a price. Until the rules change, these stay wrong on the page.


## By kind of sentence (model + rules)

| kind | gpt-5.4-nano | gpt-5.4-mini | gpt-5.4 | gpt-5.5 |
|---|---|---|---|---|
| control (1) | p 100% / r 100% | p 100% / r 100% | p 100% / r 100% | p 100% / r 100% |
| lay (109) | p 71.2% / r 82.5% | p 73.3% / r 86.8% | p 73.9% / r 86.8% | p 74.6% / r 87.7% |
| not-received (15) | p 0% / r —% | p 0% / r —% | p 0% / r —% | p 0% / r —% |
| wait (7) | p 0% / r —% | p 0% / r —% | p 0% / r —% | p 0% / r —% |
| mixed (23) | p 90.4% / r 92.2% | p 90.4% / r 92.2% | p 90.4% / r 92.2% | p 90.4% / r 92.2% |
| count (11) | p 100% / r 100% | p 100% / r 100% | p 100% / r 100% | p 100% / r 100% |
| symptom (12) | p 0% / r —% | p 0% / r —% | p 0% / r —% | p 0% / r —% |
| typo (15) | p 84.2% / r 80% | p 84.2% / r 80% | p 84.2% / r 80% | p 84.2% / r 80% |
| place (10) | p 100% / r 86.7% | p 100% / r 86.7% | p 100% / r 86.7% | p 100% / r 86.7% |
| hypothetical (4) | p 0% / r —% | p 0% / r —% | p 0% / r —% | p 0% / r —% |
| someone-else (1) | p 0% / r —% | p 0% / r —% | p 0% / r —% | p 0% / r —% |
| demo (1) | p 100% / r 100% | p 100% / r 100% | p 100% / r 100% | p 100% / r 100% |

## Every false positive, per model

### gpt-5.4-nano — 52 sentence(s) carried a unit that should not be there

- **3** (lay) `the lung doctor had me blow into a tube as hard as I could`
  - produced: cms-99204 (from the rules)
  - expected: cms-test-spirometry
- **7** (lay) `a nurse drew blood to check my thyroid`
  - produced: cms-lab-cbc (from the rules)
  - expected: cms-lab-tsh
- **16** (mixed) `went back to my regular doctor and was told it was all anxiety`
  - produced: cms-99214, cms-mh-psych-eval (from the rules)
  - expected: cms-99213
- **22** (lay) `an hour with a psychologist doing memory and attention puzzles`
  - produced: cms-mh-therapy-45, cms-test-psych-testing-1h (from the model: cms-test-psych-testing-1h)
  - expected: cms-test-neuropsych-1h
- **28** (lay) `a first appointment with a psychiatrist to be assessed`
  - produced: cms-99205 (from the rules)
  - expected: cms-mh-psych-eval
- **30** (lay) `I filled in the little questionnaire about my mood in the waiting room`
  - produced: cms-ed-99284-complete (from the rules)
  - expected: cms-96127
- **35** (lay) `they scanned my belly with the jelly and the wand`
  - produced: cms-img-us-transvaginal (from the rules)
  - expected: cms-img-us-abdomen
- **36** (lay) `a scan of my lower back inside the tunnel machine`
  - produced: cms-img-ct-lumbar (from the rules)
  - expected: cms-img-mri-lumbar-nc
- **37** (lay) `they put my knee in the tube and took pictures of the inside of the joint`
  - produced: cms-surg-knee-arthroscopy (from the model: cms-surg-knee-arthroscopy)
  - expected: cms-img-mri-joint-nc
- **42** (lay) `the eye doctor dilated my pupils and went through everything for the first time`
  - produced: cms-99204 (from the rules)
  - expected: cms-eye-exam-new
- **44** (lay) `the urine sample I gave went off to the lab to be grown`
  - produced: cms-lab-urinalysis (from the rules)
  - expected: cms-lab-urine-culture
- **48** (lay) `the test for damage to the heart muscle came back normal`
  - produced: cms-test-emg (from the rules)
  - expected: cms-lab-troponin
- **50** (lay) `they tested how fast my blood clots before the procedure`
  - produced: cms-lab-ddimer (from the rules)
  - expected: cms-lab-pt-inr
- **52** (lay) `they checked the level of the male hormone`
  - produced: cms-lab-b12 (from the rules)
  - expected: cms-lab-free-testosterone
- **55** (lay) `a picture of my lungs with the flat plate against my back`
  - produced: cms-eye-fundus-photos (from the rules)
  - expected: cms-img-cxr
- **56** (lay) `they scanned my head in the tunnel with no dye at all`
  - produced: cms-mh-psych-eval (from the rules)
  - expected: cms-img-mri-brain-nc
- **60** (lay) `they sealed me into a glass box and told me to pant`
  - produced: cms-test-spirometry (from the model: cms-test-spirometry)
  - expected: cms-test-lung-volumes
- **63** (lay) `they numbed my throat, put the scope down and pinched off a piece of tissue`
  - produced: cms-proc-colonoscopy (from the rules)
  - expected: cms-proc-egd-biopsy
- **64** (lay) `a first hour with a physical therapist who measured everything I could do`
  - produced: cms-mh-therapy-45, cms-99205, cms-pt-eval-high (from the model: cms-pt-eval-high)
  - expected: cms-pt-eval-low
- **66** (lay) `an hour long session with my therapist`
  - produced: cms-mh-therapy-45 (from the rules)
  - expected: cms-mh-therapy-60
- **69** (lay) `before the visit they screened me for depression the way they do every year`
  - produced: cms-99213 (from the rules)
  - expected: cms-g0444
- **72** (lay) `the hospital sent a second bill just for using their clinic room`
  - produced: cms-ed-99284-complete (from the rules)
  - expected: cms-g0463-hospital-clinic-fee
- **75** (lay) `just the electrolytes panel that time`
  - produced: cms-99203 (from the rules)
  - expected: cms-lab-electrolytes
- **78** (lay) `the high sensitivity version of the inflammation test`
  - produced: cms-lab-esr (from the rules)
  - expected: cms-lab-hscrp
- **80** (lay) `a second confirming Lyme test after the first one`
  - produced: cms-lab-lyme-screen (from the rules)
  - expected: cms-lab-lyme-confirm
- **82** (lay) `the magnesium came back low`
  - produced: cms-img-mri-lumbar-nc (from the rules)
  - expected: cms-lab-magnesium
- **87** (lay) `the syphilis screen was part of that panel`
  - produced: cms-lab-cbc (from the rules)
  - expected: cms-lab-syphilis
- **95** (lay) `they dipped my urine and then looked at it under the microscope`
  - produced: cms-proc-colonoscopy (from the rules)
  - expected: cms-lab-urinalysis
- **110** (wait) `two hours in the waiting room before anybody called my name`
  - produced: cms-ed-99284-complete (from the rules)
  - expected: nothing
- **115** (not-received) `my doctor suggested physical therapy and I never went`
  - produced: cms-pt-exercise-15 (from the rules)
  - expected: nothing
- **122** (not-received) `they never ran the Lyme test even though I asked`
  - produced: cms-lab-lyme-screen (from the rules)
  - expected: nothing
- **123** (not-received) `no one ever ordered an EMG for me`
  - produced: cms-test-emg (from the rules)
  - expected: nothing
- **126** (symptom) `the brain fog got so bad I forgot my own address`
  - produced: cms-img-mri-brain-both (from the rules)
  - expected: nothing
- **133** (symptom) `I was frightened it really was all in my head`
  - produced: cms-mh-psych-eval (from the rules)
  - expected: nothing
- **136** (mixed) `I saw my regular doctor three times, waited five months for neurology, then had a brain MRI with and without dye`
  - produced: cms-img-mri-brain-nc (from the rules)
  - expected: cms-99213, cms-img-mri-brain-both
- **154** (mixed) `three years, eleven doctors, and the only tests were a CBC and a metabolic panel`
  - produced: cms-99213 (from the rules)
  - expected: cms-lab-cbc, cms-lab-cmp
- **155** (mixed) `after the hospital they did the transitional care call and then a follow-up with my doctor`
  - produced: cms-99214 (from the rules)
  - expected: cms-99495, cms-99213
- **160** (typo) `sleap study at the hospital`
  - produced: cms-test-ncs-3-4 (from the rules)
  - expected: cms-test-sleep-study
- **167** (typo) `physcial therapy for my neck twice a week`
  - produced: cms-mh-therapy-45 (from the rules)
  - expected: cms-pt-exercise-15
- **169** (typo) `my pcp ordered a1c and lipids`
  - produced: cms-99214 (from the rules)
  - expected: cms-lab-a1c, cms-lab-lipid-panel
- **181** (hypothetical) `I read online that a tilt table test might explain it`
  - produced: cms-test-tilt-table (from the rules)
  - expected: nothing
- **182** (someone-else) `my sister had an MRI and hers showed something`
  - produced: cms-img-mri-brain-nc (from the rules)
  - expected: nothing
- **183** (hypothetical) `I want to ask about an EEG at my next appointment`
  - produced: cms-test-eeg (from the rules)
  - expected: nothing
- **187** (lay) `a bone density scan of my hips and spine`
  - produced: cms-img-mri-lumbar-nc (from the rules)
  - expected: cms-img-dexa
- **190** (lay) `a home sleep test with a belt round my chest and a probe on my finger`
  - produced: cms-test-home-sleep-basic (from the rules)
  - expected: cms-test-home-sleep-full
- **191** (lay) `the breathing test again after they gave me the inhaler`
  - produced: cms-test-spirometry (from the rules)
  - expected: cms-test-spirometry-bronchodilator
- **194** (lay) `thirty minutes with my therapist`
  - produced: cms-mh-therapy-45 (from the rules)
  - expected: cms-mh-therapy-30
- **196** (lay) `family therapy with my husband in the room`
  - produced: cms-ed-99284-complete (from the rules)
  - expected: cms-mh-family-therapy
- **202** (lay) `a nuclear stress test with the injection and the pictures`
  - produced: cms-eye-fundus-photos (from the rules)
  - expected: cms-img-nuclear-stress
- **203** (lay) `an echo done through my throat with the probe`
  - produced: cms-img-echo (from the rules)
  - expected: cms-img-tee
- **204** (lay) `a colonoscopy where they took out a polyp`
  - produced: cms-proc-colonoscopy (from the rules)
  - expected: cms-proc-colonoscopy-polyp
- **209** (hypothetical) `the mammogram is booked for next month`
  - produced: cms-img-mammo-screen (from the rules)
  - expected: nothing

### gpt-5.4-mini — 51 sentence(s) carried a unit that should not be there

- **3** (lay) `the lung doctor had me blow into a tube as hard as I could`
  - produced: cms-99204 (from the rules)
  - expected: cms-test-spirometry
- **7** (lay) `a nurse drew blood to check my thyroid`
  - produced: cms-lab-cbc (from the rules)
  - expected: cms-lab-tsh
- **16** (mixed) `went back to my regular doctor and was told it was all anxiety`
  - produced: cms-99214, cms-mh-psych-eval (from the rules)
  - expected: cms-99213
- **22** (lay) `an hour with a psychologist doing memory and attention puzzles`
  - produced: cms-mh-therapy-45 (from the rules)
  - expected: cms-test-neuropsych-1h
- **28** (lay) `a first appointment with a psychiatrist to be assessed`
  - produced: cms-99205 (from the rules)
  - expected: cms-mh-psych-eval
- **30** (lay) `I filled in the little questionnaire about my mood in the waiting room`
  - produced: cms-ed-99284-complete (from the rules)
  - expected: cms-96127
- **35** (lay) `they scanned my belly with the jelly and the wand`
  - produced: cms-img-us-transvaginal (from the rules)
  - expected: cms-img-us-abdomen
- **36** (lay) `a scan of my lower back inside the tunnel machine`
  - produced: cms-img-ct-lumbar (from the rules)
  - expected: cms-img-mri-lumbar-nc
- **42** (lay) `the eye doctor dilated my pupils and went through everything for the first time`
  - produced: cms-99204 (from the rules)
  - expected: cms-eye-exam-new
- **44** (lay) `the urine sample I gave went off to the lab to be grown`
  - produced: cms-lab-urinalysis (from the rules)
  - expected: cms-lab-urine-culture
- **48** (lay) `the test for damage to the heart muscle came back normal`
  - produced: cms-test-emg (from the rules)
  - expected: cms-lab-troponin
- **50** (lay) `they tested how fast my blood clots before the procedure`
  - produced: cms-lab-ddimer (from the rules)
  - expected: cms-lab-pt-inr
- **52** (lay) `they checked the level of the male hormone`
  - produced: cms-lab-b12 (from the rules)
  - expected: cms-lab-free-testosterone
- **55** (lay) `a picture of my lungs with the flat plate against my back`
  - produced: cms-eye-fundus-photos (from the rules)
  - expected: cms-img-cxr
- **56** (lay) `they scanned my head in the tunnel with no dye at all`
  - produced: cms-mh-psych-eval (from the rules)
  - expected: cms-img-mri-brain-nc
- **63** (lay) `they numbed my throat, put the scope down and pinched off a piece of tissue`
  - produced: cms-proc-colonoscopy (from the rules)
  - expected: cms-proc-egd-biopsy
- **64** (lay) `a first hour with a physical therapist who measured everything I could do`
  - produced: cms-mh-therapy-45, cms-99205, cms-pt-eval-high (from the model: cms-pt-eval-high)
  - expected: cms-pt-eval-low
- **66** (lay) `an hour long session with my therapist`
  - produced: cms-mh-therapy-45 (from the rules)
  - expected: cms-mh-therapy-60
- **69** (lay) `before the visit they screened me for depression the way they do every year`
  - produced: cms-99213 (from the rules)
  - expected: cms-g0444
- **72** (lay) `the hospital sent a second bill just for using their clinic room`
  - produced: cms-ed-99284-complete (from the rules)
  - expected: cms-g0463-hospital-clinic-fee
- **73** (lay) `they took blood and counted the red and the white cells`
  - produced: cms-lab-venipuncture (from the model: cms-lab-venipuncture)
  - expected: cms-lab-cbc
- **75** (lay) `just the electrolytes panel that time`
  - produced: cms-99203 (from the rules)
  - expected: cms-lab-electrolytes
- **78** (lay) `the high sensitivity version of the inflammation test`
  - produced: cms-lab-esr (from the rules)
  - expected: cms-lab-hscrp
- **80** (lay) `a second confirming Lyme test after the first one`
  - produced: cms-lab-lyme-screen (from the rules)
  - expected: cms-lab-lyme-confirm
- **82** (lay) `the magnesium came back low`
  - produced: cms-img-mri-lumbar-nc (from the rules)
  - expected: cms-lab-magnesium
- **87** (lay) `the syphilis screen was part of that panel`
  - produced: cms-lab-cbc (from the rules)
  - expected: cms-lab-syphilis
- **95** (lay) `they dipped my urine and then looked at it under the microscope`
  - produced: cms-proc-colonoscopy (from the rules)
  - expected: cms-lab-urinalysis
- **110** (wait) `two hours in the waiting room before anybody called my name`
  - produced: cms-ed-99284-complete (from the rules)
  - expected: nothing
- **115** (not-received) `my doctor suggested physical therapy and I never went`
  - produced: cms-pt-exercise-15 (from the rules)
  - expected: nothing
- **122** (not-received) `they never ran the Lyme test even though I asked`
  - produced: cms-lab-lyme-screen (from the rules)
  - expected: nothing
- **123** (not-received) `no one ever ordered an EMG for me`
  - produced: cms-test-emg (from the rules)
  - expected: nothing
- **126** (symptom) `the brain fog got so bad I forgot my own address`
  - produced: cms-img-mri-brain-both (from the rules)
  - expected: nothing
- **133** (symptom) `I was frightened it really was all in my head`
  - produced: cms-mh-psych-eval (from the rules)
  - expected: nothing
- **136** (mixed) `I saw my regular doctor three times, waited five months for neurology, then had a brain MRI with and without dye`
  - produced: cms-img-mri-brain-nc (from the rules)
  - expected: cms-99213, cms-img-mri-brain-both
- **154** (mixed) `three years, eleven doctors, and the only tests were a CBC and a metabolic panel`
  - produced: cms-99213 (from the rules)
  - expected: cms-lab-cbc, cms-lab-cmp
- **155** (mixed) `after the hospital they did the transitional care call and then a follow-up with my doctor`
  - produced: cms-99214 (from the rules)
  - expected: cms-99495, cms-99213
- **160** (typo) `sleap study at the hospital`
  - produced: cms-test-ncs-3-4 (from the rules)
  - expected: cms-test-sleep-study
- **167** (typo) `physcial therapy for my neck twice a week`
  - produced: cms-mh-therapy-45 (from the rules)
  - expected: cms-pt-exercise-15
- **169** (typo) `my pcp ordered a1c and lipids`
  - produced: cms-99214 (from the rules)
  - expected: cms-lab-a1c, cms-lab-lipid-panel
- **181** (hypothetical) `I read online that a tilt table test might explain it`
  - produced: cms-test-tilt-table (from the rules)
  - expected: nothing
- **182** (someone-else) `my sister had an MRI and hers showed something`
  - produced: cms-img-mri-brain-nc (from the rules)
  - expected: nothing
- **183** (hypothetical) `I want to ask about an EEG at my next appointment`
  - produced: cms-test-eeg (from the rules)
  - expected: nothing
- **187** (lay) `a bone density scan of my hips and spine`
  - produced: cms-img-mri-lumbar-nc (from the rules)
  - expected: cms-img-dexa
- **190** (lay) `a home sleep test with a belt round my chest and a probe on my finger`
  - produced: cms-test-home-sleep-basic (from the rules)
  - expected: cms-test-home-sleep-full
- **191** (lay) `the breathing test again after they gave me the inhaler`
  - produced: cms-test-spirometry (from the rules)
  - expected: cms-test-spirometry-bronchodilator
- **194** (lay) `thirty minutes with my therapist`
  - produced: cms-mh-therapy-45 (from the rules)
  - expected: cms-mh-therapy-30
- **196** (lay) `family therapy with my husband in the room`
  - produced: cms-ed-99284-complete (from the rules)
  - expected: cms-mh-family-therapy
- **202** (lay) `a nuclear stress test with the injection and the pictures`
  - produced: cms-eye-fundus-photos (from the rules)
  - expected: cms-img-nuclear-stress
- **203** (lay) `an echo done through my throat with the probe`
  - produced: cms-img-echo (from the rules)
  - expected: cms-img-tee
- **204** (lay) `a colonoscopy where they took out a polyp`
  - produced: cms-proc-colonoscopy (from the rules)
  - expected: cms-proc-colonoscopy-polyp
- **209** (hypothetical) `the mammogram is booked for next month`
  - produced: cms-img-mammo-screen (from the rules)
  - expected: nothing

### gpt-5.4 — 50 sentence(s) carried a unit that should not be there

- **3** (lay) `the lung doctor had me blow into a tube as hard as I could`
  - produced: cms-99204 (from the rules)
  - expected: cms-test-spirometry
- **7** (lay) `a nurse drew blood to check my thyroid`
  - produced: cms-lab-cbc (from the rules)
  - expected: cms-lab-tsh
- **16** (mixed) `went back to my regular doctor and was told it was all anxiety`
  - produced: cms-99214, cms-mh-psych-eval (from the rules)
  - expected: cms-99213
- **22** (lay) `an hour with a psychologist doing memory and attention puzzles`
  - produced: cms-mh-therapy-45, cms-test-neurobehavioral-1h (from the model: cms-test-neurobehavioral-1h)
  - expected: cms-test-neuropsych-1h
- **28** (lay) `a first appointment with a psychiatrist to be assessed`
  - produced: cms-99205 (from the rules)
  - expected: cms-mh-psych-eval
- **30** (lay) `I filled in the little questionnaire about my mood in the waiting room`
  - produced: cms-ed-99284-complete (from the rules)
  - expected: cms-96127
- **35** (lay) `they scanned my belly with the jelly and the wand`
  - produced: cms-img-us-transvaginal (from the rules)
  - expected: cms-img-us-abdomen
- **36** (lay) `a scan of my lower back inside the tunnel machine`
  - produced: cms-img-ct-lumbar (from the rules)
  - expected: cms-img-mri-lumbar-nc
- **42** (lay) `the eye doctor dilated my pupils and went through everything for the first time`
  - produced: cms-99204 (from the rules)
  - expected: cms-eye-exam-new
- **44** (lay) `the urine sample I gave went off to the lab to be grown`
  - produced: cms-lab-urinalysis (from the rules)
  - expected: cms-lab-urine-culture
- **48** (lay) `the test for damage to the heart muscle came back normal`
  - produced: cms-test-emg (from the rules)
  - expected: cms-lab-troponin
- **50** (lay) `they tested how fast my blood clots before the procedure`
  - produced: cms-lab-ddimer (from the rules)
  - expected: cms-lab-pt-inr
- **52** (lay) `they checked the level of the male hormone`
  - produced: cms-lab-b12 (from the rules)
  - expected: cms-lab-free-testosterone
- **55** (lay) `a picture of my lungs with the flat plate against my back`
  - produced: cms-eye-fundus-photos (from the rules)
  - expected: cms-img-cxr
- **56** (lay) `they scanned my head in the tunnel with no dye at all`
  - produced: cms-mh-psych-eval (from the rules)
  - expected: cms-img-mri-brain-nc
- **63** (lay) `they numbed my throat, put the scope down and pinched off a piece of tissue`
  - produced: cms-proc-colonoscopy (from the rules)
  - expected: cms-proc-egd-biopsy
- **64** (lay) `a first hour with a physical therapist who measured everything I could do`
  - produced: cms-mh-therapy-45, cms-99205 (from the rules)
  - expected: cms-pt-eval-low
- **66** (lay) `an hour long session with my therapist`
  - produced: cms-mh-therapy-45 (from the rules)
  - expected: cms-mh-therapy-60
- **69** (lay) `before the visit they screened me for depression the way they do every year`
  - produced: cms-99213 (from the rules)
  - expected: cms-g0444
- **72** (lay) `the hospital sent a second bill just for using their clinic room`
  - produced: cms-ed-99284-complete (from the rules)
  - expected: cms-g0463-hospital-clinic-fee
- **75** (lay) `just the electrolytes panel that time`
  - produced: cms-99203 (from the rules)
  - expected: cms-lab-electrolytes
- **78** (lay) `the high sensitivity version of the inflammation test`
  - produced: cms-lab-esr (from the rules)
  - expected: cms-lab-hscrp
- **80** (lay) `a second confirming Lyme test after the first one`
  - produced: cms-lab-lyme-screen (from the rules)
  - expected: cms-lab-lyme-confirm
- **82** (lay) `the magnesium came back low`
  - produced: cms-img-mri-lumbar-nc (from the rules)
  - expected: cms-lab-magnesium
- **87** (lay) `the syphilis screen was part of that panel`
  - produced: cms-lab-cbc (from the rules)
  - expected: cms-lab-syphilis
- **95** (lay) `they dipped my urine and then looked at it under the microscope`
  - produced: cms-proc-colonoscopy (from the rules)
  - expected: cms-lab-urinalysis
- **110** (wait) `two hours in the waiting room before anybody called my name`
  - produced: cms-ed-99284-complete (from the rules)
  - expected: nothing
- **115** (not-received) `my doctor suggested physical therapy and I never went`
  - produced: cms-pt-exercise-15 (from the rules)
  - expected: nothing
- **122** (not-received) `they never ran the Lyme test even though I asked`
  - produced: cms-lab-lyme-screen (from the rules)
  - expected: nothing
- **123** (not-received) `no one ever ordered an EMG for me`
  - produced: cms-test-emg (from the rules)
  - expected: nothing
- **126** (symptom) `the brain fog got so bad I forgot my own address`
  - produced: cms-img-mri-brain-both (from the rules)
  - expected: nothing
- **133** (symptom) `I was frightened it really was all in my head`
  - produced: cms-mh-psych-eval (from the rules)
  - expected: nothing
- **136** (mixed) `I saw my regular doctor three times, waited five months for neurology, then had a brain MRI with and without dye`
  - produced: cms-img-mri-brain-nc (from the rules)
  - expected: cms-99213, cms-img-mri-brain-both
- **154** (mixed) `three years, eleven doctors, and the only tests were a CBC and a metabolic panel`
  - produced: cms-99213 (from the rules)
  - expected: cms-lab-cbc, cms-lab-cmp
- **155** (mixed) `after the hospital they did the transitional care call and then a follow-up with my doctor`
  - produced: cms-99214 (from the rules)
  - expected: cms-99495, cms-99213
- **160** (typo) `sleap study at the hospital`
  - produced: cms-test-ncs-3-4 (from the rules)
  - expected: cms-test-sleep-study
- **167** (typo) `physcial therapy for my neck twice a week`
  - produced: cms-mh-therapy-45 (from the rules)
  - expected: cms-pt-exercise-15
- **169** (typo) `my pcp ordered a1c and lipids`
  - produced: cms-99214 (from the rules)
  - expected: cms-lab-a1c, cms-lab-lipid-panel
- **181** (hypothetical) `I read online that a tilt table test might explain it`
  - produced: cms-test-tilt-table (from the rules)
  - expected: nothing
- **182** (someone-else) `my sister had an MRI and hers showed something`
  - produced: cms-img-mri-brain-nc (from the rules)
  - expected: nothing
- **183** (hypothetical) `I want to ask about an EEG at my next appointment`
  - produced: cms-test-eeg (from the rules)
  - expected: nothing
- **187** (lay) `a bone density scan of my hips and spine`
  - produced: cms-img-mri-lumbar-nc (from the rules)
  - expected: cms-img-dexa
- **190** (lay) `a home sleep test with a belt round my chest and a probe on my finger`
  - produced: cms-test-home-sleep-basic (from the rules)
  - expected: cms-test-home-sleep-full
- **191** (lay) `the breathing test again after they gave me the inhaler`
  - produced: cms-test-spirometry (from the rules)
  - expected: cms-test-spirometry-bronchodilator
- **194** (lay) `thirty minutes with my therapist`
  - produced: cms-mh-therapy-45 (from the rules)
  - expected: cms-mh-therapy-30
- **196** (lay) `family therapy with my husband in the room`
  - produced: cms-ed-99284-complete (from the rules)
  - expected: cms-mh-family-therapy
- **202** (lay) `a nuclear stress test with the injection and the pictures`
  - produced: cms-eye-fundus-photos (from the rules)
  - expected: cms-img-nuclear-stress
- **203** (lay) `an echo done through my throat with the probe`
  - produced: cms-img-echo (from the rules)
  - expected: cms-img-tee
- **204** (lay) `a colonoscopy where they took out a polyp`
  - produced: cms-proc-colonoscopy (from the rules)
  - expected: cms-proc-colonoscopy-polyp
- **209** (hypothetical) `the mammogram is booked for next month`
  - produced: cms-img-mammo-screen (from the rules)
  - expected: nothing

### gpt-5.5 — 50 sentence(s) carried a unit that should not be there

- **3** (lay) `the lung doctor had me blow into a tube as hard as I could`
  - produced: cms-99204 (from the rules)
  - expected: cms-test-spirometry
- **7** (lay) `a nurse drew blood to check my thyroid`
  - produced: cms-lab-cbc (from the rules)
  - expected: cms-lab-tsh
- **16** (mixed) `went back to my regular doctor and was told it was all anxiety`
  - produced: cms-99214, cms-mh-psych-eval (from the rules)
  - expected: cms-99213
- **22** (lay) `an hour with a psychologist doing memory and attention puzzles`
  - produced: cms-mh-therapy-45 (from the rules)
  - expected: cms-test-neuropsych-1h
- **28** (lay) `a first appointment with a psychiatrist to be assessed`
  - produced: cms-99205 (from the rules)
  - expected: cms-mh-psych-eval
- **30** (lay) `I filled in the little questionnaire about my mood in the waiting room`
  - produced: cms-ed-99284-complete (from the rules)
  - expected: cms-96127
- **35** (lay) `they scanned my belly with the jelly and the wand`
  - produced: cms-img-us-transvaginal (from the rules)
  - expected: cms-img-us-abdomen
- **36** (lay) `a scan of my lower back inside the tunnel machine`
  - produced: cms-img-ct-lumbar (from the rules)
  - expected: cms-img-mri-lumbar-nc
- **42** (lay) `the eye doctor dilated my pupils and went through everything for the first time`
  - produced: cms-99204 (from the rules)
  - expected: cms-eye-exam-new
- **44** (lay) `the urine sample I gave went off to the lab to be grown`
  - produced: cms-lab-urinalysis (from the rules)
  - expected: cms-lab-urine-culture
- **48** (lay) `the test for damage to the heart muscle came back normal`
  - produced: cms-test-emg (from the rules)
  - expected: cms-lab-troponin
- **50** (lay) `they tested how fast my blood clots before the procedure`
  - produced: cms-lab-ddimer (from the rules)
  - expected: cms-lab-pt-inr
- **52** (lay) `they checked the level of the male hormone`
  - produced: cms-lab-b12 (from the rules)
  - expected: cms-lab-free-testosterone
- **55** (lay) `a picture of my lungs with the flat plate against my back`
  - produced: cms-eye-fundus-photos (from the rules)
  - expected: cms-img-cxr
- **56** (lay) `they scanned my head in the tunnel with no dye at all`
  - produced: cms-mh-psych-eval (from the rules)
  - expected: cms-img-mri-brain-nc
- **63** (lay) `they numbed my throat, put the scope down and pinched off a piece of tissue`
  - produced: cms-proc-colonoscopy (from the rules)
  - expected: cms-proc-egd-biopsy
- **64** (lay) `a first hour with a physical therapist who measured everything I could do`
  - produced: cms-mh-therapy-45, cms-99205 (from the rules)
  - expected: cms-pt-eval-low
- **66** (lay) `an hour long session with my therapist`
  - produced: cms-mh-therapy-45 (from the rules)
  - expected: cms-mh-therapy-60
- **69** (lay) `before the visit they screened me for depression the way they do every year`
  - produced: cms-99213 (from the rules)
  - expected: cms-g0444
- **72** (lay) `the hospital sent a second bill just for using their clinic room`
  - produced: cms-ed-99284-complete (from the rules)
  - expected: cms-g0463-hospital-clinic-fee
- **75** (lay) `just the electrolytes panel that time`
  - produced: cms-99203 (from the rules)
  - expected: cms-lab-electrolytes
- **78** (lay) `the high sensitivity version of the inflammation test`
  - produced: cms-lab-esr (from the rules)
  - expected: cms-lab-hscrp
- **80** (lay) `a second confirming Lyme test after the first one`
  - produced: cms-lab-lyme-screen (from the rules)
  - expected: cms-lab-lyme-confirm
- **82** (lay) `the magnesium came back low`
  - produced: cms-img-mri-lumbar-nc (from the rules)
  - expected: cms-lab-magnesium
- **87** (lay) `the syphilis screen was part of that panel`
  - produced: cms-lab-cbc (from the rules)
  - expected: cms-lab-syphilis
- **95** (lay) `they dipped my urine and then looked at it under the microscope`
  - produced: cms-proc-colonoscopy (from the rules)
  - expected: cms-lab-urinalysis
- **110** (wait) `two hours in the waiting room before anybody called my name`
  - produced: cms-ed-99284-complete (from the rules)
  - expected: nothing
- **115** (not-received) `my doctor suggested physical therapy and I never went`
  - produced: cms-pt-exercise-15 (from the rules)
  - expected: nothing
- **122** (not-received) `they never ran the Lyme test even though I asked`
  - produced: cms-lab-lyme-screen (from the rules)
  - expected: nothing
- **123** (not-received) `no one ever ordered an EMG for me`
  - produced: cms-test-emg (from the rules)
  - expected: nothing
- **126** (symptom) `the brain fog got so bad I forgot my own address`
  - produced: cms-img-mri-brain-both (from the rules)
  - expected: nothing
- **133** (symptom) `I was frightened it really was all in my head`
  - produced: cms-mh-psych-eval (from the rules)
  - expected: nothing
- **136** (mixed) `I saw my regular doctor three times, waited five months for neurology, then had a brain MRI with and without dye`
  - produced: cms-img-mri-brain-nc (from the rules)
  - expected: cms-99213, cms-img-mri-brain-both
- **154** (mixed) `three years, eleven doctors, and the only tests were a CBC and a metabolic panel`
  - produced: cms-99213 (from the rules)
  - expected: cms-lab-cbc, cms-lab-cmp
- **155** (mixed) `after the hospital they did the transitional care call and then a follow-up with my doctor`
  - produced: cms-99214 (from the rules)
  - expected: cms-99495, cms-99213
- **160** (typo) `sleap study at the hospital`
  - produced: cms-test-ncs-3-4 (from the rules)
  - expected: cms-test-sleep-study
- **167** (typo) `physcial therapy for my neck twice a week`
  - produced: cms-mh-therapy-45 (from the rules)
  - expected: cms-pt-exercise-15
- **169** (typo) `my pcp ordered a1c and lipids`
  - produced: cms-99214 (from the rules)
  - expected: cms-lab-a1c, cms-lab-lipid-panel
- **181** (hypothetical) `I read online that a tilt table test might explain it`
  - produced: cms-test-tilt-table (from the rules)
  - expected: nothing
- **182** (someone-else) `my sister had an MRI and hers showed something`
  - produced: cms-img-mri-brain-nc (from the rules)
  - expected: nothing
- **183** (hypothetical) `I want to ask about an EEG at my next appointment`
  - produced: cms-test-eeg (from the rules)
  - expected: nothing
- **187** (lay) `a bone density scan of my hips and spine`
  - produced: cms-img-mri-lumbar-nc (from the rules)
  - expected: cms-img-dexa
- **190** (lay) `a home sleep test with a belt round my chest and a probe on my finger`
  - produced: cms-test-home-sleep-basic (from the rules)
  - expected: cms-test-home-sleep-full
- **191** (lay) `the breathing test again after they gave me the inhaler`
  - produced: cms-test-spirometry (from the rules)
  - expected: cms-test-spirometry-bronchodilator
- **194** (lay) `thirty minutes with my therapist`
  - produced: cms-mh-therapy-45 (from the rules)
  - expected: cms-mh-therapy-30
- **196** (lay) `family therapy with my husband in the room`
  - produced: cms-ed-99284-complete (from the rules)
  - expected: cms-mh-family-therapy
- **202** (lay) `a nuclear stress test with the injection and the pictures`
  - produced: cms-eye-fundus-photos (from the rules)
  - expected: cms-img-nuclear-stress
- **203** (lay) `an echo done through my throat with the probe`
  - produced: cms-img-echo (from the rules)
  - expected: cms-img-tee
- **204** (lay) `a colonoscopy where they took out a polyp`
  - produced: cms-proc-colonoscopy (from the rules)
  - expected: cms-proc-colonoscopy-polyp
- **209** (hypothetical) `the mammogram is booked for next month`
  - produced: cms-img-mammo-screen (from the rules)
  - expected: nothing

## Flags the model raised about the rules (report only, never applied)

| reader | flags | on a rules answer that IS wrong | on one that is right | flag precision | share of the ${results[0].falsePositives.filter((f) => !f.fromModel.length).length} wrong-rules sentences flagged |
|---|---|---|---|---|---|
| gpt-5.4-nano | 19 | 9 | 10 | 47.4% | 18% |
| gpt-5.4-mini | 15 | 13 | 2 | 86.7% | 26% |
| gpt-5.4 | 15 | 12 | 3 | 80% | 24% |
| gpt-5.5 | 12 | 12 | 0 | 100% | 24% |

Every flag raised (the strongest reader):

- **12** (lay) rules said `cms-proc-egd-biopsy` for "they sent me for the camera down my throat" — flag: *Looks consistent: camera down throat with biopsy (snip). No issue found* ❌ false alarm
- **22** (lay) rules said `cms-mh-therapy-45` for "an hour with a psychologist doing memory" — flag: *Keyword matched “memory” to therapy, but puzzles sound psych testing* ✅ the rules were wrong
- **35** (lay) rules said `cms-img-us-transvaginal` for "the wand" — flag: *ALREADY READ says transvaginal; this phrase says belly ultrasound* ✅ the rules were wrong
- **54** (lay) rules said `cms-img-us-abdomen` for "my gallbladder with the ultrasound" — flag: *Already-read phrase mentions gallbladder only; may still be abdomen ultrasound.* ❌ false alarm
- **58** (lay) rules said `null` for "had me pedal until I could not go on" — flag: *Already-read left unit blank; mask-on pedaling fits CPET* ✅ the rules were wrong
- **63** (lay) rules said `cms-proc-colonoscopy` for "put the scope down" — flag: *Already read says colonoscopy, but story describes throat scope/EGD biopsy.* ✅ the rules were wrong
- **64** (lay) rules said `cms-mh-therapy-45` for "a first hour with a physical therapist" — flag: *Listed as therapy (45 min) but phrase describes evaluation measurements* ✅ the rules were wrong
- **64** (lay) rules said `cms-99205` for "first hour with a physical" — flag: *Listed as doctor office visit (99205) but care was physical therapist* ✅ the rules were wrong
- **67** (lay) rules said `cms-mh-psych-eval` for "the intake with psychiatry" — flag: *none* ❌ false alarm
- **74** (lay) rules said `cms-lab-cmp` for "the full chemistry panel with the liver" — flag: *No issue: 'kidney numbers' fits CMP already read* ❌ false alarm
- **95** (lay) rules said `null` for "they dipped my urine" — flag: *Already read maps microscope urine to colonoscopy; should be urinalysis* ✅ the rules were wrong
- **104** (count) rules said `cms-pt-exercise-15` for "ten sessions of PT" — flag: *Mismatch: keyword matcher marked 10 PT sessions, but story says approval stopped.* ❌ false alarm
- **139** (mixed) rules said `cms-99203` for "urgent care sent me for a chest x-ray" — flag: *Looks right: urgent care visit for chest x-ray* ❌ false alarm
- **139** (mixed) rules said `cms-img-cxr` for "chest x-ray" — flag: *Looks right: chest x-ray was performed* ❌ false alarm
- **159** (typo) rules said `cms-img-cxr` for "a chest xray" — flag: *The ALREADY READ chest X-ray is not mentioned to be spirometry* ❌ false alarm
- **164** (typo) rules said `cms-test-emg` for "emg" — flag: *Keyword match set whole EMG; phrase specifically says NCV part.* ❌ false alarm
- **174** (place) rules said `cms-img-mri-brain-nc` for "I had two brain MRIs" — flag: *Brain MRIs done twice, but contrast status not specified (nc vs both unknown)* ❌ false alarm
- **181** (hypothetical) rules said `cms-test-tilt-table` for "a tilt table test might explain it" — flag: *Phrase says read online, not that a tilt-table test happened* ✅ the rules were wrong
- **190** (lay) rules said `null` for "a probe on my finger" — flag: *Story mentions finger probe; matcher read only belt home sleep test* ✅ the rules were wrong

Full rows, including every flag with its phrase: /private/tmp/claude-501/-Users-bo-Documents-100M-Lifetime-Revenue-Precision-Federal-Proposal-Builder-runs-TOPX-HHS-PHASE2-waypoint-app/1dbdfa79-3850-4f07-a82f-264c56014309/scratchpad/final209-low.json

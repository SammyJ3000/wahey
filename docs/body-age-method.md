# Body age: the method

A motivational estimate, not a medical measure and not WHOOP Age. It is deliberately simple enough to check by hand.

**Body age = real age + the sum of the years in the rows.**

- Seven inputs are scored. Each is an average over the last 90 days, held against a published guideline or reference range for an adult man, and mapped to years in half-year steps. Minus takes years off, plus adds them.
- Every input is capped (the widest is ±1.5 years). The sum is capped at ±8 years. With the caps below, the most the seven can take off is 7.5 and the most they can add is 9.5, so the total cap only ever bites on the "older" side.
- Zero is roughly "typical". Meeting the guideline takes years off; missing it adds them.
- Real age is completed years from the date of birth in `localStorage` (`ow_dob`). Ages 18 to 100 only, because the guidelines are for adults.
- The size of each step is a design choice, not a published conversion. No study says "8,000 steps = 0.5 years". The sources fix where the bands start and stop and which direction is better; the half-year sizes are ours, kept small on purpose.

## When an input counts

| Input | Counts once it has | Until then |
|---|---|---|
| Sleep, sleep consistency, resting heart rate | 21 nights in the last 90 days, 7 of them in the last 30 | "Still learning", shows your number, adds 0 |
| Steps | 21 complete days in the last 90, 7 in the last 30 (today is left out, it isn't finished) | same |
| Active minutes | 14 days with the watch on for 1,000+ minutes (the app's `fullDay`), 7 in the last 30 | same |
| Strength training | a gym log at least 28 days old (first logged session to today) | same |
| Body fat | 3 weigh-ins with body fat in the last 30 days, and a date of birth | same |
| HRV | never counted | shown for interest |

- **A total is shown only when 5 of the 7 count.** Below that the total line shows a dash and says how many are ready.
- When 5 or 6 count, the total is labelled "from N of 7 inputs" and a line gives the range it could land in once the others count (their caps added to the sum).
- If the watch goes quiet, the "7 in the last 30 days" rule drops inputs back to not counted, so an old average can't keep a number on screen.

## The inputs

### 1. Sleep (cap −0.5 to +1.5)
Average minutes asleep per night (`sleep.asleep_min`).

| Average | Years |
|---|---|
| under 5h | +1.5 |
| 5h to under 6h | +1 |
| 6h to under 6h30 | +0.5 |
| 6h30 to under 7h | 0 |
| 7h to 9h | −0.5 |
| over 9h to 9h30 | 0 |
| over 9h30 | +0.5 |

Sources: adults should sleep 7 or more hours a night; 6 or fewer is inadequate (AASM and Sleep Research Society consensus, Watson et al. 2015: https://www.aasm.org/resources/pdf/adultsleepdurationconsensus.pdf). 7 to 9 hours for adults 18 to 64 (National Sleep Foundation, Hirshkowitz et al. 2015, Sleep Health 1(4):233-243: https://pubmed.ncbi.nlm.nih.gov/29073412/).
Limit: the watch reports time asleep, which runs shorter than time in bed, and the guidelines were mostly built on self-reported sleep. The benefit side is kept small (−0.5) for that reason.

### 2. Sleep consistency (cap −1 to +1)
Night-to-night spread (sample standard deviation) of minutes asleep.

| Spread | Years |
|---|---|
| 45 min or less | −1 |
| 46 to 60 min | −0.5 |
| 61 to 90 min | 0 |
| 91 to 120 min | +0.5 |
| over 120 min | +1 |

Source: MESA (Huang, Mariani and Redline, JACC 2020, doi 10.1016/j.jacc.2019.12.054). Against a spread of 60 min or less, cardiovascular risk was 1.09 at 61 to 90, 1.59 at 91 to 120 and 2.14 over 120 min. The 60/90/120 cut points are theirs. Summary: https://pace-cme.org/2020/03/24/irregular-sleep-duration-and-timing-associated-with-increased-risk-of-cvd . The extra 45-minute band is ours.
Bed and wake times: only some nights have `sleep.start` / `sleep.end`. When 7 or more do, the row shows the spread of bedtime and wake-up time for interest. They are not scored, so nights without clock times are not treated differently.
Limit: MESA measured 7 nights in adults aged 45 to 84; we use up to 90 nights in a younger adult.

### 3. Resting heart rate (cap −1.5 to +1.5)
Average overnight resting heart rate (`rhr`).

| Average | Years |
|---|---|
| under 50 | −1.5 |
| 50 to 54 | −1 |
| 55 to 59 | −0.5 |
| 60 to 69 | 0 |
| 70 to 79 | +0.5 |
| 80 to 89 | +1 |
| 90 and over | +1.5 |

Sources: each 10 bpm higher went with 9% higher all-cause mortality; 60 to 80 bpm 1.12 and over 80 bpm 1.45 against the lowest group (Zhang, Shen and Qi, CMAJ 2016, 46 cohorts: https://www.cmaj.ca/content/188/3/E53). Graded risk in men independent of fitness (Copenhagen Male Study, Jensen et al., Heart 2013: https://pubmed.ncbi.nlm.nih.gov/23595657/). About 15% of US men sit under 60 bpm seated (NCHS report 41, Ostchega et al. 2011: https://www.cdc.gov/nchs/data/nhsr/nhsr041.pdf).
Limit: those studies measured pulse seated in a clinic. The watch's overnight figure runs lower, which flatters this row. The bands are in 5 bpm steps below 60 so a merely average reading gets little credit, but this is a judgement, not a correction from a study.

### 4. Steps (cap −1 to +1.5)
Average steps on complete days.

| Average | Years |
|---|---|
| under 3,000 | +1.5 |
| 3,000 to 4,999 | +1 |
| 5,000 to 5,999 | +0.5 |
| 6,000 to 7,999 | 0 |
| 8,000 to 9,999 | −0.5 |
| 10,000 and over | −1 |

Source: meta-analysis of 15 cohorts (Paluch et al., Lancet Public Health 2022;7:e219-e228, doi 10.1016/S2468-2667(21)00302-9: https://discovery.ucl.ac.uk/id/eprint/10170017/1/1-s2.0-S2468266721003029-main.pdf). Risk fell with more steps and levelled off around 8,000 to 10,000 a day for younger adults (6,000 to 8,000 for older adults). Against the lowest quarter, the next three quarters had hazard ratios of 0.60, 0.55 and 0.47.
Limit: steps and active minutes overlap (a brisk walk feeds both), so the benefit side is capped at −1. Days the phone or watch stayed at home count as low days.

### 5. Active minutes (cap −1.5 to +1.5)
From `hr_buckets` on full-wear days, using the same heart rate reserve sum as `strainOf` (bucket midpoint, the app's `maxHr` and `restHr`). Moderate = 40 to 59% of reserve, hard = 60% and up. Weekly figure = (moderate + 2 × hard) per day × 7, because the WHO counts a vigorous minute as two moderate ones.

| Moderate-equivalent minutes a week | Years |
|---|---|
| under 75 | +1.5 |
| 75 to 149 | +0.5 |
| 150 to 299 | −0.5 |
| 300 to 449 | −1 |
| 450 and over | −1.5 |

Sources: 150 to 300 min moderate or 75 to 150 min vigorous a week, more for extra benefit (WHO 2020, Bull et al., BJSM 54:1451: https://bjsm.bmj.com/content/54/24/1451 ; guideline: https://www.who.int/publications/i/item/9789240015128). Mortality 20% lower below the minimum, 31% lower at 1 to 2 times it, 39% lower at 3 to 5 times it, flat beyond (Arem et al., JAMA Intern Med 2015: https://pmc.ncbi.nlm.nih.gov/articles/PMC4451435). Intensity as a share of heart rate reserve follows the ACSM position stand (Garber et al., MSSE 2011, doi 10.1249/MSS.0b013e318213fefb).
Limits: a wrist sensor reads all-day heart rate, so stress, heat or caffeine can count as "moderate". Max heart rate is the app's estimate (never below 185), not a tested max. Days the watch was off are left out, which assumes they looked like the days it was on.

### 6. Strength training (cap −1 to +1)
Distinct gym days in the last 28 days, divided by 4.

| Gym days a week | Years |
|---|---|
| none | +1 |
| under 1 | +0.5 |
| 1 to under 2 | 0 |
| 2 or more | −1 |

Sources: muscle-strengthening on 2 or more days a week (WHO 2020, as above). 10 to 17% lower all-cause mortality with muscle-strengthening activity, greatest at about 30 to 60 min a week (Momma et al., BJSM 2022;56:755-763, doi 10.1136/bjsports-2021-105061).
Limit: counts sessions, not how hard or how complete they were. Anything not logged in the gym app doesn't exist to it.

### 7. Body fat (cap −1 to +1.5)
Average `body_fat_pct` from the smart scale over the last 30 days, against the range for the user's age.

| Age | Below range (0) | Healthy (−1) | Above (+0.5) | Well above (+1.5) |
|---|---|---|---|---|
| 18 to 39 | under 8% | 8 to 19% | 20 to 24% | 25% and over |
| 40 to 59 | under 11% | 11 to 21% | 22 to 27% | 28% and over |
| 60 and over | under 13% | 13 to 24% | 25 to 29% | 30% and over |

Source: Gallagher et al., "Healthy percentage body fat ranges", Am J Clin Nutr 2000;72:694-701: https://pubmed.ncbi.nlm.nih.gov/10966886/ . The paper derives these from BMI cut-offs (18.5, 25, 30), not from health outcomes, and calls them provisional. The paper's own labels for the last two columns are overweight and obese; the app only says "above the healthy range".
Lean mass (weight × (1 − fat)) is shown on the row but not scored. Judging it needs height (fat-free mass index), and height isn't in the data.
Limits: a bathroom scale estimates fat from a small current through the feet and shifts with hydration and time of day, which is why one reading never counts. The published ranges are for white and African American adults; other groups differ.

### HRV (not counted)
Shown with its 90-day average and a line saying why it is left out: normal values differ hugely between healthy people (Nunan, Sandercock and Brodie, Pacing Clin Electrophysiol 2010;33:1407-17: https://pubmed.ncbi.nlm.nih.gov/20663071/), so a single reading can't fairly be turned into years. It already drives the recovery score, where it is compared with your own baseline.

## What it cannot tell you
- Anything about illness, family history, smoking, alcohol, diet, blood pressure or blood tests. None of those are in the data.
- Fitness. There is no VO2 max, which is the strongest single input in tools of this kind (WHOOP's included).
- Cause. The sources are studies of large groups: they show what goes with living longer across thousands of people, not what will happen to one.
- Precision. Half-year steps and an "about" in the wording are the honest resolution. Two people with the same number can be in very different health.
- Whether WHOOP would agree. WHOOP's weights are private and it uses six months of data plus VO2 max.

## Checked and not checked
- Confirmed by web search on 2026-11-11: the AASM/SRS and NSF sleep figures, the MESA cut points and hazard ratios, the CMAJ and Copenhagen heart rate figures, the Paluch steps figures, the WHO activity ranges, the Arem dose figures, the Momma strength figures, the existence and method of the Gallagher paper, the Nunan review.
- **Not confirmed against the original table:** the exact Gallagher body fat cut points (the 8/20/25, 11/22/28 and 13/25/30 rows are the widely reproduced chart from the paper; secondary sources agree on the under-40 row, the paper itself sat behind a browser check). Worth one look at Table 4 before relying on it.
- **Not confirmed in the search results:** the ACSM 40 to 59% / 60 to 89% heart rate reserve bands (from memory of the 2011 position stand), and the WHO "2 or more days" wording in the paper itself (confirmed in WHO's own summary only).

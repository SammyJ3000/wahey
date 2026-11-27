# How WHOOP scores (public information, researched 12 Nov 2026)

WHOOP has never published its formulas. Weights, baseline window and the deviation-to-percent curve are proprietary.

## Recovery
Published by WHOOP:
- Inputs: HRV, resting HR, sleep performance, respiratory rate; skin temp and SpO2 mainly as illness signals. https://www.whoop.com/thelocker/how-does-whoop-recovery-work-101/ · https://developer.whoop.com/docs/whoop-101
- HRV dominates; resting HR and sleep count "far less" because they overlap with HRV. https://www.whoop.com/thelocker/podcast-40-whoop-recovery-maximize-readiness/
- Bands: green 67–100, yellow 34–66, red 0–33. Member average 58%. https://www.whoop.com/thelocker/member-averages-recovery-strain-sleep-hrv/
- About 12–13% of days are red. https://www.whoop.com/us/en/thelocker/podcast-109-covid-vaccine-heart-rate-hrv/
- HRV = RMSSD in overlapping 5-minute windows across the whole sleep, weighted to slow-wave sleep and later in the night. https://www.community.whoop.com/t/hrv-extreme-spikes/6472/31

Third-party (estimates):
- One refit of 15 months of WHOOP data: HRV about half the score, sleep vs need about a quarter, resting HR 3–5%. https://www.linkedin.com/feed/update/urn:li:activity:7515438642446786560
- User reports: HRV 10% down with 100% sleep gave 43%; 16% down gave yellow or red. https://www.community.whoop.com/t/nonsensical-recovery-score-make-it-make-sense/9660/2
- Illness (NCAA athletes on WHOOP): respiratory rate up 3 days before a positive COVID test, resting HR up and HRV down 1 day before. https://pmc.ncbi.nlm.nih.gov/articles/PMC10333556/
- Open-source clones: healthgraph-agent (0.6/0.2/0.2, 50 ± 25z; same as Wahey v1), noop (logistic curve centred so a typical day is about 58). https://github.com/ryanbr/noop

## Strain
- 0–21, logarithmic, from time in heart-rate-reserve zones plus muscular load. Formula unpublished. Morning routine about 4–5; member average day about 11.0. https://www.whoop.com/us/en/thelocker/how-does-whoop-strain-work-101/
- noop: Edwards/Banister TRIMP compressed as 21·ln(TRIMP+1)/ln(7201).

## Sleep
- Need = baseline + strain + sleep debt − naps. https://developer.whoop.com/docs/developing/user-data/sleep
- Since May 2025 sleep performance blends hours vs need, consistency, efficiency and sleep stress (weights unpublished).

## Wahey recovery v2, as built in `lib/score.js` (heuristic, not WHOOP's formula)
- HRV: 58 + 130·ln(HRV / usual), with the ratio capped at +30% and at ln −0.45 (about −36%).
- Resting HR: −1.5 points per bpm beyond 1 bpm from usual, capped ±9.
- Sleep: 0.4 points per % of need around 85%, capped −12 / +6.

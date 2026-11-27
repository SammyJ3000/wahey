# Changelog

What changed in Wahey, newest last. Personal details and readings are not included.

## 10 Nov 2026: first version

- The server side: `api/health.js` takes the morning send from the iPhone, `api/gym.js` reads the gym app's backup (read only), `api/coach.js` writes the morning call, and `lib/summarise.js` and `lib/store.js` turn samples into days and keep them.
- Deployed to Vercel with a private Blob store. Until `APP_KEY` is set, the health check reports that the app is not ready.

## 10 Nov 2026: redesign

- One continuous page. The recovery drivers show as range rulers (today's value, "Lower than usual", the usual range), other vitals as big number tiles.
- The 7 day chart became two charts on one day axis, with no second y axis. Strain stops at yesterday to match the Strain ring.
- Motion: days slide from side to side, Claude's call appears word by word, ruler markers slide from your usual to today, bars grow and lines draw. Reduced motion is respected.
- Phosphor icons. Trends starts each metric where its data starts and shows how many nights it covers.
- The morning call is cached with the recovery it was written for, and asked again when the score changes.

## 11 Nov 2026: HRV and sleep from intervals.icu

- Zepp writes neither HRV nor sleep to Apple Health. `lib/intervals.js` now reads Zepp's wellness data from intervals.icu (read only) and fills gaps in the stored days each time the app opens.
- The sleep card copes with Zepp sleep, which has a total and a score but no stages.
- The iPhone Shortcut runs when the alarm is stopped. The steps are in `docs/iphone-shortcut.md`.

## 11 Nov 2026: heart rate during a gym session

- The Shortcut now keeps heart rate per minute. The gym card cuts out the session's window and shows average and peak heart rate, session strain, time and the heart rate line.
- `config.json` has a `gym_corrections` block for one off fixes when the gym app files a session under the wrong day.

## 11 Nov 2026: steadier recovery while the baseline is short

- Under 30 nights, the HRV spread never counts as less than 10% either way and resting heart rate as less than 3 bpm, so a short run of similar nights no longer makes the score jumpy. The screen says "Still learning your normal" with the count of nights.

## 11 Nov 2026: am and pm fix

- With the iPhone on the 12 hour clock, the date parser ignored "pm", so afternoon heart rate landed in the morning. Fixed in `lib/summarise.js`.

## 11 Nov 2026: Tonight

- A Tonight section on the latest day: sleep need itemised (base, today's strain, sleep you are short, time awake) ending on "In bed by". The wake time is your usual once three wake ups are known, otherwise 7:00am, and you can set it by tapping it.

## 11 Nov 2026: strain target

- A target strain range for the day, set by the recovery band as a share of your usual day (the median of full wear days in the last 60). It is drawn on one 0 to 21 ruler with your progress, plus a sentence comparing a recent gym session.

## 11 Nov 2026: why the score is what it is

- "What's behind your recovery" is now a sum: a normal morning for you, then the points HRV, resting heart rate and sleep added or took away, each with its value, direction and ruler, ending on the recovery score.

## 11 Nov 2026: Strength tab

- A third tab: kg moved and sessions each week, each lift's top set and estimated one rep max (Epley, 1 to 12 reps; a true single counts as the weight), personal bests, and an honest state for the first week. `api/gym.js` now passes the top set and estimated one rep max for each exercise.

## 11 Nov 2026: tiles redesign, journal, ask the coach and body age

- The whole interface rebuilt in tiles and the Slate palette. Today is three rings (sleep, recovery, strain) over Claude's call and a tile grid. Recovery, Sleep and Strain each have their own screen. Trends and Strength use the same tiles. The scoring maths did not change.
- Journal (`api/journal.js`, `prompts/journal.md`) with "What affects you" on Trends.
- Ask the coach, with a memory you can edit (`api/chat.js`, `prompts/chat.md`).
- A body age estimate at the foot of Trends. The method is in `docs/body-age-method.md`.
- The morning call was cut off mid sentence: the model's thinking counts against `max_tokens`. The limit went from 800 to 3000, and a cut off reply is never shown or cached.

## 11 Nov 2026: the app is called Wahey

- New name and home screen icon: the three scores as nested rings, in Slate colours. On an iPhone, remove the old home screen icon and add it again to pick up the new one.

## 12 Nov 2026: recovery scoring v2

- Recovery now follows the shape Whoop has published: a normal morning is 58, HRV against your usual moves it most, and resting heart rate and sleep nudge it. With no HRV there is no score, and the app says it is waiting for HRV. HRV now counts as a capped ratio to your usual, so the minimum spread from 11 Nov no longer plays a part. The research is in `docs/scoring-research.md`.
- Zepp's sleep total and step count (through intervals.icu) now win over Apple Health's, which ran short on sleep and counted phone and watch steps together.
- The app refreshes when it is reopened.
- Pull down to sync on the main screens. On an iPhone it runs the Shortcut and waits until the server has heard from the phone; elsewhere it is a plain refresh.
- The points panel shows each reading with its usual, and sleep counts from the same 58 start.

## 14 Nov 2026: type in HRV by hand

- When HRV has not arrived, "Type it in from Zepp" saves the figure from the Zepp app. The figure from intervals.icu replaces it when it arrives.
- Why HRV went missing: intervals.icu only pulls from Zepp when its website is opened, and Zepp's feed runs about a day behind the Zepp app.

## 27 Nov 2026: the code split into files

- `index.html` was one file of about 3,000 lines, with all the styles and the whole app inline. It is now markup only. The styles are in `css/` and the app is in `js/`, with one file per screen plus the shared pieces. Babel still compiles it in the browser, so there is still no build step.
- The helpers with no DOM moved into `lib/` beside `score.js`, each with its own tests: dates and durations, the warning and strain sentences, the Strength maths, the journal's habit effects and body age.
- ESLint now checks the app's JSX as well as the server code.
- Nothing on screen changed. Every screen was checked against the old page with the same fictional data, and they matched pixel for pixel.

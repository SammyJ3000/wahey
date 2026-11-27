# Changelog

Personal details and readings have been taken out of this public copy. The entries are otherwise as logged during the build.

## 2026-11-10 Session 1
- Scaffolded from an empty folder: api/health.js, api/gym.js (read-only gym link), api/coach.js, lib/summarise.js, lib/store.js.

## 2026-11-10 First production deploy
- Created the Vercel project. Before any keys were set, /api/health?ping=1 returned ok:false and CLAUDE.md was not served, as intended.
- Redeployed with APP_KEY, ANTHROPIC_API_KEY, GYM_BACKUP_KEY and a private Blob store.

## 2026-11-10 Redesign v3
- One continuous page, no cards; glow removed; vitals capsule replaced by range rulers (value, "Lower than usual", the usual range) for the recovery drivers and big-number tiles for other vitals.
- 7-day chart split into two charts on one day axis (no dual y-axis); strain stops at yesterday to match the Strain ring.
- Motion: day-to-day slide with blur, Claude's call reveals word by word, ruler marker slides from usual to today (transform), bars grow, lines draw, sliding pills on tabs and range, sheet slides up. Reduced motion respected.
- Phosphor icons replace hand-drawn SVGs. Trends starts each metric where its data starts and shows the night count.
- Coach cache now stores the recovery it was written for and re-asks when the score changes.

## 2026-11-11 HRV and sleep from intervals.icu; morning Shortcut built
- Zepp writes neither HRV nor sleep to Apple Health. New `lib/intervals.js` reads Zepp's wellness from intervals.icu (read-only, INTERVALS_ATHLETE_ID + INTERVALS_API_KEY) and fills gaps in the stored days on every GET /api/health. Checked against the Zepp app: HRV lands on the same days.
- Sleep card copes with Zepp sleep (total + score, no stages). HRV "missing" copy no longer blames Apple Health.
- iPhone Shortcut "Send To Recovery" built and running on alarm stop; notes in docs/iphone-shortcut.md.

## 2026-11-11 Heart rate during the gym session
- Shortcut heart rate is now also kept per minute (hr_min). The gym card cuts out the session window (set tick times, else start/finish) and shows average, peak, session strain, time and the HR line.
- config.json gym_corrections: a one-off fix for a session the gym app filed under the wrong day (times taken from the backup upload log).

## 2026-11-11 Steadier recovery while the baseline is short
- Under 30 nights, the HRV spread never counts as less than +/-10% and resting HR less than +/-3 bpm, so a short run of very similar nights stops making the score jumpy. Drivers header shows "Still learning your normal (n of 30 nights)". Recheck once 30 nights exist.

## 2026-11-11 am/pm fix
- The iPhone was set to the 12-hour clock and the parser ignored "pm", so afternoon heart rate landed in the morning (a gym session's window came up empty). Fixed in lib/summarise.js ms().

## 2026-11-11 Feature 1: Tonight (bedtime)
- New Tonight section on the latest day: sleep need itemised (base, today's strain, sleep short, time awake) ending on "In bed by". Wake time is the user's usual once 3 wake-ups are known, else 7:00am, and can be set by tapping it (saved on the phone).

## 2026-11-11 Feature 4: Strain target
- Target strain range from recovery band as a share of the user's usual day (median of full-wear days, last 60), drawn on one 0-21 ruler with progress and a sentence comparing a recent gym session. Built by a subagent as a separate feature, integrated and checked on live data.

## 2026-11-11 Feature 3: why the score is what it is
- "What's behind your recovery" is now a sum: a normal morning for you, then points added or taken by HRV, resting HR and sleep (each with value, direction and ruler), ending on the recovery score. Built by a subagent as a separate feature, integrated and checked on live data.

## 2026-11-11 Feature 5: Strength tab
- Third tab: weekly kg moved and sessions, lifts with top set and estimated 1RM (Epley, 1-12 reps; a true single counts as the weight), personal bests, honest first-week state. api/gym.js now passes top and e1rm per exercise (read-only). Built by a subagent as a separate feature, integrated and checked on live data.

## 2026-11-11 v4: redesign (tiles, Slate) with journal, ask the coach and body age
- Whole UI rebuilt from the approved mock-ups in the Slate palette: Today is three rings (sleep, recovery, strain) over Claude's call and a tile grid; Recovery, Sleep and Strain / heart-rate day are their own screens; Trends and Strength in the same tile language. Scoring maths unchanged.
- New: journal (api/journal.js, prompts/journal.md) with "What affects you" on Trends; ask the coach with editable memory (api/chat.js, prompts/chat.md); body age estimate at the bottom of Trends (method: docs/body-age-method.md, three source details still to verify).
- Coach fix: max_tokens 800 cut the morning call mid-sentence (thinking counts against it); raised to 3000 and a truncated reply is never shown or cached.

## 2026-11-11 App renamed Wahey, with a home-screen icon
- Title and home-screen name are now "Wahey". New icon: the three scores as nested rings, Slate colours (icons/, manifest.webmanifest). On iPhone the old home-screen icon has to be removed and re-added to pick it up.

## 2026-11-12
- Recovery scoring v2, on WHOOP's published shape: a normal morning is 58, HRV against your usual moves it most (130 x log ratio), resting HR and sleep nudge it. No score without HRV ("Waiting for HRV from Zepp"). Research: docs/scoring-research.md.
- Zepp's sleep total and step count (via intervals.icu) now win over Apple Health's, which ran short on sleep and doubled steps with the phone.
- App refreshes when reopened; Claude's call is re-asked when the score changes; "normal" label reworded.
- Open: intervals.icu did not pull from Zepp by itself and missed the morning's HRV; the alarm automation did not fire.
- Pull down to sync on the main screens: ring fills as you pull, spins while fetching, ticks when done.
- Points panel: shows each reading and its usual, points labelled, sleep counted from the same 58 start.
- Pull to sync now runs the iPhone Shortcut ("Send To Recovery"), then shows a loading pill until the server has heard from the phone. Off the iPhone it is a plain refresh.

## 2026-11-14
- "Waiting for HRV from Zepp" now has a "Type it in from Zepp" link: POST /api/health { hrv: { date, ms } } stores the figure marked `hrv_from: 'manual'`; the intervals.icu figure replaces it when it arrives.
- Cause of the missing HRV: intervals.icu only polls Zepp when its website is opened, and Zepp's API had no HRV for the day until the next morning.

## 2026-11-24 Missing HRV and sleep for a few days (diagnosis, no code change)
- The app, server and the morning phone send all work. Zepp writes no sleep or HRV to Apple Health, so both come only from intervals.icu.
- intervals.icu only pulls Zepp wellness when its website is visited; the API key can't trigger it (`POST /api/zepp/download-wellness` needs a web login; no v1 equivalent). Even a forced download had no row for the night just gone: Zepp's partner feed runs about a day behind the Zepp app.
- Backfilled the missing days by hand. One night has none (watch off).
- Proposed fix: turn on Zepp's newer "HRV (and sleep) to Apple Health" sharing, then put the HRV block back in the Shortcut. The server already reads HRV and sleep from the phone (lib/summarise.js).

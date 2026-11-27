// intervals.icu: Zepp sends it the overnight numbers it never writes to Apple Health (HRV, sleep, sleep score).
// Read-only. Needs INTERVALS_ATHLETE_ID and INTERVALS_API_KEY; without them this does nothing.
//
// Checked against the Zepp app itself: HRV for a run of days lands on the same dates Zepp shows.

const BASE = 'https://intervals.icu/api/v1/athlete/';

// The first day the iPhone Shortcut supplied steps (config.json shortcut_from). Days before it came from a full
// Health export, which can tell phone steps from watch steps, so Zepp's count does not replace them.
const SHORTCUT_FROM = (require('../config.json').shortcut_from) || '0000-01-01';

function iso(d) { return d.toISOString().slice(0, 10); }

async function fetchWellness(days = 45) {
  const id = process.env.INTERVALS_ATHLETE_ID, key = process.env.INTERVALS_API_KEY;
  if (!id || !key) return null;
  const newest = new Date(), oldest = new Date(Date.now() - days * 864e5);
  const r = await fetch(`${BASE}${encodeURIComponent(id)}/wellness?oldest=${iso(oldest)}&newest=${iso(newest)}`, {
    headers: { Authorization: 'Basic ' + Buffer.from('API_KEY:' + key).toString('base64') },
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`intervals.icu said ${r.status}`);
  return r.json();
}

// One intervals.icu wellness row -> the fields our day summary uses. Only what's actually there.
function toDay(w) {
  const d = { date: w.id };
  if (w.hrv) d.hrv_ms = w.hrv;
  if (w.restingHR) d.rhr = w.restingHR;
  if (w.sleepSecs) d.sleep = { asleep_min: Math.round(w.sleepSecs / 60), source: 'zepp' };
  if (w.sleepScore) d.sleep_score = w.sleepScore;
  if (w.avgSleepingHR) d.sleep_hr = w.avgSleepingHR;
  if (w.spO2) d.spo2 = w.spO2;
  if (w.respiration) d.resp_rate = w.respiration;
  return d;
}

// Fill gaps only: Apple Health data already stored (sleep stages, the Shortcut's resting HR) wins.
// Two exceptions, where Zepp's own figure is right and Apple Health's is not (checked against the Zepp app):
//   sleep total - Health's stage pieces add up about 30 minutes short of the night Zepp reports
//   steps       - Health holds the phone's count as well as the watch's, and the Shortcut can't tell them apart
function fillFrom(existing, rows) {
  const out = { ...existing };
  let changed = false;
  for (const w of rows || []) {
    const add = toDay(w);
    const prev = out[add.date] || { date: add.date };
    const next = { ...prev };
    for (const [k, v] of Object.entries(add)) {
      if (k === 'date') continue;
      if (next[k] == null) { next[k] = v; changed = true; }
      else if (k === 'hrv_ms' && next.hrv_from === 'manual') { next.hrv_ms = v; delete next.hrv_from; changed = true; }   // a hand-typed figure gives way to the real one
    }

    const zeppMin = w.sleepSecs ? Math.round(w.sleepSecs / 60) : null;
    const sl = next.sleep;
    if (zeppMin && sl && sl.asleep_min && Math.abs(sl.asleep_min - zeppMin) >= 1) {
      // Keep Health's split between the stages, stretched to Zepp's total so the stages still add up to the headline.
      const f = zeppMin / sl.asleep_min, fixed = { ...sl, asleep_min: zeppMin, total_from: 'zepp' };
      if (sl.deep_min != null || sl.rem_min != null) {
        fixed.deep_min = Math.round((sl.deep_min || 0) * f);
        fixed.rem_min = Math.round((sl.rem_min || 0) * f);
        fixed.core_min = zeppMin - fixed.deep_min - fixed.rem_min;
      }
      next.sleep = fixed; changed = true;
    }

    // Zepp's step count for a finished day (pulled after that day ended) replaces the Shortcut's.
    const final = w.updated && String(w.updated).slice(0, 10) > add.date;
    // Only for days the Shortcut supplied (SHORTCUT_FROM on): earlier days came from a full export that could tell phone from watch.
    if (final && add.date >= SHORTCUT_FROM && w.steps && next.steps !== w.steps) { next.steps = w.steps; changed = true; }

    if (Object.keys(next).length > 1) out[add.date] = next;
  }
  return { days: out, changed };
}

module.exports = { fetchWellness, fillFrom, toDay };

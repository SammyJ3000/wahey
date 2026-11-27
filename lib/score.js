// Scoring maths for Wahey: recovery, strain, sleep need, the bedtime and the strain target.
// Pure functions with no DOM, so the page and the Node tests run the same code.
// In the browser it sets window.Score (index.html loads it before the app); in Node it is a CommonJS module.
// Our own take on the idea, not Whoop's maths. Everything is compared with the user's own last 30 days.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Score = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BASE_NEED = 465;                                      // 7h45 of sleep before adjustments
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))) || 1; };
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const range = (a) => (a.length >= 5 ? { lo: Math.min(...a), hi: Math.max(...a), m: mean(a), sd: sd(a) } : null);

  function strainOf(day, maxHr, restHr) {
    if (!day || !day.hr_buckets) return null;
    let load = 0;
    day.hr_buckets.forEach((mins, i) => {
      const reserve = (42.5 + i * 5 - restHr) / (maxHr - restHr);
      if (reserve > 0.3) load += mins * (reserve - 0.3) * 10;     // harder minutes count for much more
    });
    return Math.round(clamp(6.5 * Math.log(1 + load / 15), 0, 21) * 10) / 10;
  }

  // Heart rate during one gym session: cut the session's window out of that day's per-minute series.
  const londonMin = (ms) => { const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms).split(':'); return +h * 60 + +m; };
  function sessionHr(s, day) {
    if (!s.start || !s.end || !day || !day.hr_min) return null;
    const a = londonMin(s.start), b = londonMin(s.end), pts = [];
    for (let i = 0; i < day.hr_min.length; i += 2) if (day.hr_min[i] >= a && day.hr_min[i] <= b) pts.push([day.hr_min[i], day.hr_min[i + 1]]);
    if (pts.length < 3) return null;
    let load = 0, mins = 0, sum = 0;
    pts.forEach(([m, bpm], i) => {
      const dur = Math.min((i + 1 < pts.length ? pts[i + 1][0] : b) - m, 5) || 1;
      const reserve = (bpm - day.restHr) / (day.maxHr - day.restHr);
      if (reserve > 0.3) load += dur * (reserve - 0.3) * 10;
      mins += dur; sum += bpm * dur;
    });
    return { avg: Math.round(sum / mins), max: Math.max(...pts.map((p) => p[1])), minutes: b - a, a, b, pts,
      strain: Math.round(clamp(6.5 * Math.log(1 + load / 15), 0, 21) * 10) / 10 };
  }

  const REC_NORMAL = 58;                                      // a morning with everything at your usual (WHOOP's member average)
  const sleepPoints = (perf) => clamp(0.4 * (Math.min(perf, 1) * 100 - 85), -12, 6);

  function computeAll(days) {
    const maxObs = days.map((d) => d.hr_max).filter((x) => x && x < 215).sort((a, b) => a - b);
    const maxHr = Math.max(maxObs.length ? maxObs[Math.floor(maxObs.length * 0.98)] : 0, 185);   // wrist HR rarely sees a true max
    const restHr = median(days.map((d) => d.rhr).filter(Boolean)) || 60;

    const out = [];
    days.forEach((d, i) => {
      const prev = days.slice(Math.max(0, i - 30), i);
      const pick = (f) => prev.map(f).filter((x) => x != null && x !== 0);
      const hrvBase = pick((p) => p.hrv_ms).map(Math.log);
      const rhrBase = pick((p) => p.rhr);
      const strain = strainOf(d, maxHr, restHr);
      const yStrain = i > 0 && Date.parse(d.date) - Date.parse(days[i - 1].date) === 864e5 ? out[i - 1].strain : null;

      const recent = prev.slice(-3).map((p) => p.sleep && p.sleep.asleep_min).filter(Boolean);
      const debt = Math.min(90, recent.reduce((a, m) => a + Math.max(0, BASE_NEED - m), 0));
      const need = Math.round(BASE_NEED + Math.max(0, (yStrain || 0) - 12) * 8 + debt / 3);
      const asleep = d.sleep ? d.sleep.asleep_min : null;
      const sleepPerf = asleep ? asleep / need : null;

      // Recovery, on WHOOP's published shape (docs/scoring-research.md): a normal morning is 58,
      // HRV against your own usual moves it most, resting heart rate and sleep only nudge it. Each part is in points.
      // Needs HRV: without it there is no score, because heart rate and sleep alone gave misleading ones.
      const parts = {};
      if (d.hrv_ms && hrvBase.length >= 5) parts.hrv = 130 * clamp(Math.log(d.hrv_ms) - mean(hrvBase), -0.45, Math.log(1.3));
      if (parts.hrv != null && d.rhr && rhrBase.length >= 5) { const dv = d.rhr - mean(rhrBase); parts.rhr = clamp(dv > 1 ? -1.5 * (dv - 1) : dv < -1 ? -1.5 * (dv + 1) : 0, -9, 9); }
      if (parts.hrv != null && sleepPerf) parts.sleep = sleepPoints(sleepPerf);
      const recovery = parts.hrv != null ? Math.round(clamp(REC_NORMAL + Object.values(parts).reduce((x, y) => x + y, 0), 1, 99)) : null;

      const stageRange = {};
      for (const k of ['awake_min', 'core_min', 'deep_min', 'rem_min']) stageRange[k] = range(pick((p) => p.sleep && p.sleep[k]));

      out.push({
        ...d, strain, yStrain, need, debt, asleep, sleepPerf, recovery, parts, stageRange, maxHr, restHr,
        baseNights: Math.min(hrvBase.length, rhrBase.length),
        hrvNormal: hrvBase.length >= 5 ? Math.round(Math.exp(mean(hrvBase))) : null,
        rhrNormal: rhrBase.length >= 5 ? Math.round(mean(rhrBase)) : null,
        ranges: { rhr: range(rhrBase), hrv: range(pick((p) => p.hrv_ms)), resp: range(pick((p) => p.resp_rate)),
          spo2: range(pick((p) => p.spo2)), sleep: range(pick((p) => p.sleep && p.sleep.asleep_min)) },
      });
    });
    return out;
  }

  const band = (r) => (r == null ? null : r >= 67 ? 'good' : r >= 34 ? 'meh' : 'bad');

  function weightSeries(days, gymBody) {
    const map = {};
    (gymBody || []).forEach((b) => { map[b.date] = b.weight; });
    days.forEach((d) => { if (d.weight_kg) map[d.date] = d.weight_kg; });      // the scale wins on the same day
    const pts = Object.entries(map).map(([date, w]) => ({ date, w })).sort((a, b) => a.date.localeCompare(b.date));
    return pts.map((p) => {
      const t = Date.parse(p.date);
      const win = pts.filter((q) => Date.parse(q.date) <= t && Date.parse(q.date) > t - 7 * 864e5);
      return { ...p, avg: Math.round(mean(win.map((q) => q.w)) * 10) / 10 };
    });
  }

  // Your usual = the middle of your last 30 nights (mean ± 1 sd, kept inside what you've actually hit).
  const usual = (r) => (r ? [Math.max(r.lo, r.m - r.sd), Math.min(r.hi, r.m + r.sd)] : null);
  function verdict(v, r) {
    const u = usual(r);
    if (v == null || !u) return null;
    return v < u[0] ? 'below' : v > u[1] ? 'above' : 'within';
  }

  // Same weights as computeAll, shared out over the drivers that have a reading this morning.
  // "Normal" is every driver at its usual: HRV and resting HR parts sit at 50 there by definition; for sleep
  // it is your usual night's length held against today's sleep need. Rounded so start + points = the ring.
  // Where a normal morning starts, and what each driver added or took away from it.
  function driverPoints(day) {
    const have = Object.keys(day.parts || {});
    if (day.recovery == null || !have.length) return null;
    const sr = day.ranges && day.ranges.sleep;
    // Every part counts from the same starting line (58), so a good night shows as points gained, not as "0, same as usual".
    const start = REC_NORMAL;
    const normal = Math.round(REC_NORMAL + (sr && day.need && day.parts.sleep != null ? sleepPoints(sr.m / day.need) : 0));   // what your usual morning scores
    const raw = have.map((k) => day.parts[k]);
    const pts = raw.map(Math.round);
    let left = day.recovery - start - pts.reduce((a, b) => a + b, 0);
    while (left !== 0) {                                        // nudge whichever driver was rounded the furthest the other way
      const s = Math.sign(left);
      let best = 0;
      raw.forEach((x, i) => { if ((x - pts[i]) * s > (raw[best] - pts[best]) * s) best = i; });
      pts[best] += s; left -= s;
    }
    const by = {};
    have.forEach((k, i) => { by[k] = pts[i]; });
    return { start, normal, by };
  }

  // Tonight: sleep need for the coming night, itemised, ending on a time to be in bed. Same maths as the sleep score.
  const minOfDay = (iso) => londonMin(Date.parse(iso));
  function tonightPlan(all, idx, setWake) {
    const day = all[idx], nights = all.slice(Math.max(0, idx - 20), idx + 1).filter((d) => d.sleep);
    const wakes = nights.map((d) => d.sleep.end && minOfDay(d.sleep.end)).filter((x) => x != null && x !== false);
    if (!nights.length) return null;
    const last3 = all.slice(Math.max(0, idx - 2), idx + 1).map((d) => d.sleep && d.sleep.asleep_min).filter(Boolean);
    const debt = Math.min(90, last3.reduce((a, m) => a + Math.max(0, BASE_NEED - m), 0));
    const forStrain = Math.round(Math.max(0, (day.strain || 0) - 12) * 8), forDebt = Math.round(debt / 3);
    const awakes = nights.map((d) => d.sleep.awake_min).filter((x) => x != null);
    const awake = Math.round(clamp(awakes.length ? median(awakes) + 10 : 15, 10, 45));   // nodding off, plus his usual time awake in the night
    const inBed = BASE_NEED + forStrain + forDebt + awake;
    const wake = setWake != null ? setWake : wakes.length >= 3 ? median(wakes) : 7 * 60;
    return { base: BASE_NEED, forStrain, forDebt, awake, inBed, wake, bed: wake - inBed, wakeFrom: setWake != null ? 'set' : wakes.length >= 3 ? 'usual' : 'guess', strain: day.strain || 0, short: Math.round(debt), nights: last3.length };
  }

  // Strain target. How hard to go today, as a range on our own 0–21 strain scale. The rule, in one line:
  // take the user's usual day (the median strain of his full-wear days in the last 60) and aim for a share of it
  // that depends on this morning's recovery band. Low: about half. Part recovered: around it. Recovered: above it.
  const STRAIN_AIM = {
    bad: [0.35, 0.65, 'About half your usual day'],
    meh: [0.7, 1.1, 'Around your usual day'],
    good: [1.1, 1.45, 'Above your usual day'],
  };
  const STRAIN_USUAL_START = 11;                                // used until there are 7 full days to learn from
  const fullDay = (d) => d.strain != null && !!d.hr_buckets && d.hr_buckets.reduce((a, b) => a + b, 0) >= 1000;   // watch on for most of the day

  function strainTarget(all, idx) {
    const day = all[idx];
    if (!day) return null;
    const past = all.slice(Math.max(0, idx - 60), idx).filter(fullDay).map((d) => d.strain);
    const learning = past.length < 7;
    const usualDay = learning ? STRAIN_USUAL_START : clamp(median(past), 8, 16);
    const aim = STRAIN_AIM[band(day.recovery)];
    if (!aim) return { usualDay, learning, days: past.length, lo: null, hi: null, why: null };
    const lo = Math.round(usualDay * aim[0]), hi = Math.min(20, Math.max(lo + 2, Math.round(usualDay * aim[1])));
    return { usualDay, learning, days: past.length, lo, hi, why: aim[2] };
  }

  // Strain is a log of load, so two efforts add as loads, not as scores.
  const strainLoad = (s) => 15 * (Math.exp(s / 6.5) - 1);
  const strainPlus = (a, b) => Math.round(clamp(6.5 * Math.log(1 + (strainLoad(a) + strainLoad(b)) / 15), 0, 21) * 10) / 10;

  return {
    BASE_NEED,
    mean,
    sd,
    clamp,
    median,
    range,
    strainOf,
    londonMin,
    sessionHr,
    REC_NORMAL,
    sleepPoints,
    computeAll,
    band,
    weightSeries,
    usual,
    verdict,
    driverPoints,
    minOfDay,
    tonightPlan,
    STRAIN_AIM,
    STRAIN_USUAL_START,
    fullDay,
    strainTarget,
    strainLoad,
    strainPlus,
  };
});

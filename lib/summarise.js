// Raw Apple Health samples -> one summary per day.
//
// Input (from the iPhone Shortcut or the Health export importer), every field optional:
//   { hrv:[{t,v,src}], rhr:[...], hr:[...], steps:[...], kcal:[...], weight:[...], fat:[...], spo2:[...], resp:[...],
//     sleep:[{start,end,stage,src}], workouts:[{start,end,type,kcal}] }
// t/start/end are ISO strings (with offset) or epoch ms. Stages: inbed, asleep, core, deep, rem, awake.
//
// Day rules: a night's sleep belongs to the morning it ends; everything else to its calendar day (Europe/London).
// Heart rate is stored as minutes per 5-bpm bucket so the app can work out zones and strain with any max/resting HR,
// plus a per-minute series (hr_min: [minute of day, bpm, ...]) so a gym session's own window can be cut out.

const TZ = 'Europe/London';
const MIN = 60 * 1000;
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

// Shortcuts sends dates like "10 Nov 2026 at 02:13" or "10/11/2026, 02:13" with no zone: those are London wall time.
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function londonWall(y, mo, d, h, mi, s) {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(new Date(guess)).map((x) => [x.type, Number(x.value)]));
  const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return guess - (shown - guess);
}
function ms(t) {
  if (typeof t === 'number') return t;
  if (typeof t !== 'string') return NaN;
  const s = t.trim();
  if (/\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s) || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}$/.test(s)) {
    return Date.parse(s.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/, '$1T$2$3:$4'));
  }
  // iPhones set to the 12-hour clock send "2:08 pm" (sometimes with a narrow no-break space): honour the am/pm.
  const AP = '(?:[\\s\\u202f\\u00a0]*([ap])\\.?m\\.?)?';
  const h24 = (h, ap) => (!ap ? h : (h % 12) + (ap.toLowerCase() === 'p' ? 12 : 0));
  let m = s.match(new RegExp('^(\\d{1,2}) ([A-Za-z]{3})[a-z]* (\\d{4})(?:,| at)? (\\d{1,2}):(\\d{2})(?::(\\d{2}))?' + AP, 'i'));
  if (m) return londonWall(+m[3], MONTHS[m[2].toLowerCase()], +m[1], h24(+m[4], m[7]), +m[5], +(m[6] || 0));
  m = s.match(new RegExp('^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4}),? (\\d{1,2}):(\\d{2})(?::(\\d{2}))?' + AP, 'i'));
  if (m) return londonWall(+m[3], +m[2] - 1, +m[1], h24(+m[4], m[7]), +m[5], +(m[6] || 0));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return londonWall(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  return Date.parse(s);
}
function local(t) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms(t))).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
const byDay = (rows) => rows.reduce((m, r) => ((m[local(r.t).day] ||= []).push(r), m), {});
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x, d = 0) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const valid = (rows) => (rows || []).filter((r) => Number.isFinite(Number(r.v)) && Number.isFinite(ms(r.t))).map((r) => ({ ...r, v: Number(r.v) }));

// Phone and watch both count steps; take the source with the highest daily total instead of adding them up.
function bestSourceTotal(rows) {
  const per = {};
  for (const r of rows) per[r.src || '?'] = (per[r.src || '?'] || 0) + r.v;
  const vals = Object.values(per);
  return vals.length ? Math.max(...vals) : null;
}

// Sleep segments -> sessions (gaps under an hour join up) -> the longest one ending each morning.
function nights(segs) {
  const asleep = segs
    .filter((s) => s.stage && s.stage !== 'inbed')
    .map((s) => ({ ...s, s: ms(s.start), e: ms(s.end) }))
    .filter((s) => s.e > s.s)
    .sort((a, b) => a.s - b.s);
  const sessions = [];
  for (const seg of asleep) {
    const cur = sessions[sessions.length - 1];
    if (cur && seg.s - cur.e < 60 * MIN) { cur.segs.push(seg); cur.e = Math.max(cur.e, seg.e); }
    else sessions.push({ s: seg.s, e: seg.e, segs: [seg] });
  }
  const out = {};
  for (const ses of sessions) {
    const end = local(ses.e);
    if (end.hour < 3 || end.hour > 15) continue;           // naps and odd fragments don't count as the night
    const mins = { deep: 0, rem: 0, core: 0, asleep: 0, awake: 0 };
    for (const g of ses.segs) mins[g.stage] = (mins[g.stage] || 0) + (g.e - g.s) / MIN;
    const asleepMin = mins.deep + mins.rem + mins.core + mins.asleep;
    if (asleepMin < 120) continue;
    if (!out[end.day] || asleepMin > out[end.day].asleep_min) {
      out[end.day] = {
        start: new Date(ses.s).toISOString(), end: new Date(ses.e).toISOString(),
        asleep_min: round(asleepMin), deep_min: round(mins.deep), rem_min: round(mins.rem),
        core_min: round(mins.core + mins.asleep), awake_min: round(mins.awake),
      };
    }
  }
  return out;
}

// Minutes spent in each 5-bpm bucket (index 0 = 40–44 bpm). Each reading counts until the next one, up to 5 minutes.
function hrBuckets(rows) {
  const sorted = rows.slice().sort((a, b) => ms(a.t) - ms(b.t));
  const out = {};
  sorted.forEach((r, i) => {
    const next = sorted[i + 1];
    const dur = Math.min(next ? (ms(next.t) - ms(r.t)) / MIN : 1, 5);
    if (dur <= 0) return;
    const d = local(r.t).day;
    const b = Math.max(0, Math.min(36, Math.floor((r.v - 40) / 5)));
    (out[d] ||= { buckets: new Array(37).fill(0), max: 0 });
    out[d].buckets[b] += dur;
    out[d].max = Math.max(out[d].max, r.v);
    const m = local(r.t).minute;
    ((out[d].mins ||= {})[m] ||= []).push(r.v);
  });
  for (const d of Object.keys(out)) {
    out[d].buckets = out[d].buckets.map((m) => round(m, 1));
    out[d].series = Object.entries(out[d].mins || {}).sort((a, b) => a[0] - b[0]).flatMap(([m, vs]) => [Number(m), round(mean(vs))]);
  }
  return out;
}

function summarise(raw) {
  const days = {};
  const day = (d) => (days[d] ||= { date: d });

  const sleep = nights(raw.sleep || []);
  for (const [d, s] of Object.entries(sleep)) day(d).sleep = s;

  // HRV: readings taken during that night's sleep (Zepp measures overnight). Fallback: midnight to 10am.
  for (const [d, rows] of Object.entries(byDay(valid(raw.hrv)))) {
    const s = sleep[d];
    let use = s ? rows.filter((r) => ms(r.t) >= ms(s.start) - 30 * MIN && ms(r.t) <= ms(s.end) + 30 * MIN) : [];
    if (!use.length) use = rows.filter((r) => local(r.t).hour < 10);
    if (!use.length) continue;
    day(d).hrv_ms = round(mean(use.map((r) => r.v)), 1);
    day(d).hrv_n = use.length;
  }

  for (const [d, rows] of Object.entries(byDay(valid(raw.rhr)))) day(d).rhr = round(rows[rows.length - 1].v);
  for (const [d, h] of Object.entries(hrBuckets(valid(raw.hr)))) { day(d).hr_buckets = h.buckets; day(d).hr_max = h.max; day(d).hr_min = h.series; }
  for (const [d, rows] of Object.entries(byDay(valid(raw.steps)))) day(d).steps = round(bestSourceTotal(rows));
  for (const [d, rows] of Object.entries(byDay(valid(raw.kcal)))) day(d).active_kcal = round(bestSourceTotal(rows));
  for (const [d, rows] of Object.entries(byDay(valid(raw.weight)))) day(d).weight_kg = round(rows.sort((a, b) => ms(a.t) - ms(b.t))[rows.length - 1].v, 2);
  for (const [d, rows] of Object.entries(byDay(valid(raw.fat)))) {
    const v = rows.sort((a, b) => ms(a.t) - ms(b.t))[rows.length - 1].v;
    day(d).body_fat_pct = round(v <= 1 ? v * 100 : v, 1);   // Health stores a fraction
  }
  for (const [d, rows] of Object.entries(byDay(valid(raw.spo2)))) {
    const m = mean(rows.map((r) => r.v));
    day(d).spo2 = round(m <= 1 ? m * 100 : m, 1);
  }
  for (const [d, rows] of Object.entries(byDay(valid(raw.resp)))) day(d).resp_rate = round(mean(rows.map((r) => r.v)), 1);

  for (const w of raw.workouts || []) {
    if (!Number.isFinite(ms(w.start)) || !Number.isFinite(ms(w.end))) continue;
    (day(local(w.start).day).workouts ||= []).push({
      type: w.type || 'Workout', start: new Date(ms(w.start)).toISOString(),
      minutes: round((ms(w.end) - ms(w.start)) / MIN), kcal: w.kcal == null ? null : round(Number(w.kcal)),
    });
  }
  return days;
}

// New values overwrite old ones field by field, so a partial morning sync never wipes yesterday's steps.
function merge(existing, incoming) {
  const out = { ...existing };
  for (const [d, s] of Object.entries(incoming)) {
    const prev = out[d] || {};
    const next = { ...prev };
    for (const [k, v] of Object.entries(s)) if (v != null) next[k] = v;
    if (prev.workouts && s.workouts) {
      const seen = new Set(prev.workouts.map((w) => w.start));
      next.workouts = prev.workouts.concat(s.workouts.filter((w) => !seen.has(w.start)));
    }
    out[d] = next;
  }
  return out;
}

module.exports = { summarise, merge, local };

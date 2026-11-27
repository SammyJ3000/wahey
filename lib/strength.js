// Strength progress from the gym app's own log (read only): kg moved and sessions per week, each lift's latest top set
// and estimated one rep max, and personal bests. Reads sets and volume per exercise from /api/gym, plus top { weight, reps }
// or { secs } and e1rm where the backup has them. Nothing here is ever invented: a figure the gym link didn't send is
// left out, not guessed.
// Pure functions with no DOM. In the browser it sets window.StrengthStats; in Node it is a CommonJS module.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StrengthStats = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ST_DAY = 864e5;
  const stT = (iso) => Date.parse(iso + 'T12:00:00Z');
  const stIso = (t) => new Date(t).toISOString().slice(0, 10);
  const stWeekStart = (iso) => { const t = stT(iso); return stIso(t - ((new Date(t).getUTCDay() + 6) % 7) * ST_DAY); };   // weeks run Monday to Sunday
  const stHalf = (v) => Math.round(v * 2) / 2;
  const stKg = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-GB') : String(stHalf(v)));
  const stDate = (iso, day) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', day ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });
  const stPlural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // One entry per week from the first logged session to this week, empty weeks included.
  function strengthWeeks(sessions, today) {
    if (!sessions.length) return [];
    const first = stWeekStart(sessions[0].date), last = stWeekStart(today < sessions[sessions.length - 1].date ? sessions[sessions.length - 1].date : today);
    const weeks = [];
    for (let t = stT(first); t <= stT(last); t += 7 * ST_DAY) weeks.push({ start: stIso(t), volume: 0, count: 0, sets: 0 });
    sessions.forEach((s) => { const w = weeks[Math.round((stT(stWeekStart(s.date)) - stT(first)) / (7 * ST_DAY))]; if (w) { w.volume += s.volume || 0; w.count += 1; w.sets += s.sets || 0; } });
    return weeks;
  }

  // What each lift is tracked by, best measure first. `volume` is the fallback when the gym link sends no set detail.
  const ST_KIND = {
    e1rm: { unit: 'kg', label: 'est. 1RM', fmt: stKg },
    weight: { unit: 'kg', label: 'top weight', fmt: stKg },
    reps: { unit: 'reps', label: 'most reps', fmt: (v) => String(Math.round(v)) },
    secs: { unit: 's', label: 'longest hold', fmt: (v) => String(Math.round(v)) },
    volume: { unit: 'kg', label: 'moved', fmt: stKg },
  };
  const stTopText = (e) => {
    const t = e.top;
    if (!t) return stPlural(e.sets, 'set');
    if (t.secs) return `${Math.round(t.secs)} s hold`;
    return t.weight > 0 ? `${stKg(t.weight)} kg × ${t.reps}` : `${t.reps} reps, bodyweight`;
  };

  // Every exercise with its history, oldest first. A point is one session's best for that lift.
  function strengthLifts(sessions) {
    const by = {};
    sessions.forEach((s) => (s.exercises || []).forEach((e, order) => {
      const L = by[e.name] || (by[e.name] = { name: e.name, entries: [], days: [] });
      L.entries.push({ date: s.date, session: s.name, sets: e.sets, volume: e.volume, top: e.top || null, e1rm: e.e1rm || null, order });
      if (!L.days.includes(s.name)) L.days.push(s.name);
    }));
    return Object.values(by).map((L) => {
      const last = L.entries[L.entries.length - 1], t = last.top;
      const kind = last.e1rm ? 'e1rm' : t && t.weight > 0 ? 'weight' : t && t.reps ? 'reps' : t && t.secs ? 'secs' : 'volume';
      const val = (e) => (kind === 'e1rm' ? e.e1rm : kind === 'volume' ? e.volume : e.top ? e.top[kind] : null);
      const pts = L.entries.map((e) => ({ date: e.date, v: val(e), e })).filter((p) => p.v > 0).map((p) => ({ ...p, v: ST_KIND[kind].unit === 'kg' ? stHalf(p.v) : p.v }));
      // A best is a point that beats everything before it. The first time is a starting mark, not a best.
      const bests = [];
      let top = pts.length ? pts[0].v : 0;
      if (kind !== 'volume') pts.slice(1).forEach((p) => { if (p.v > top) { bests.push({ name: L.name, kind, date: p.date, v: p.v, was: top, e: p.e }); top = p.v; } });
      return { ...L, kind, pts, last, bests, isBest: bests.length > 0 && bests[bests.length - 1].date === last.date };
    }).sort((a, b) => b.last.date.localeCompare(a.last.date) || a.last.order - b.last.order);
  }

  // "Up 2.5 kg on last time, up 9 kg since 15 Sep". Words and ink only: colour is kept for recovery.
  function stChange(lift) {
    const p = lift.pts, k = ST_KIND[lift.kind];
    if (p.length < 2) return null;
    const say = (d, cap) => { const w = d > 0 ? 'up' : 'down', a = `${k.fmt(Math.abs(d))} ${k.unit === 'reps' && Math.abs(d) === 1 ? 'rep' : k.unit}`; return (cap ? w[0].toUpperCase() + w.slice(1) : w) + ' ' + a; };
    const d1 = p[p.length - 1].v - p[p.length - 2].v, d0 = p[p.length - 1].v - p[0].v;
    const head = d1 === 0 ? 'Same as last time' : `${say(d1, true)} on last time`;
    const tail = p.length >= 3 && d0 !== 0 && d0 !== d1 ? `, ${say(d0)} since ${stDate(p[0].date)}` : '';
    return { icon: d1 > 0 ? 'arrow-up' : d1 < 0 ? 'arrow-down' : 'equals', text: head + tail };
  }

  function stSummary(weeks) {
    if (weeks.length < 2) return 'Your first week in the gym app. Every week you train adds a column here.';
    const a = weeks[weeks.length - 2], b = weeks[weeks.length - 3];
    if (!a.count) return 'Nothing logged last week.';
    const pct = b && b.volume ? Math.round((a.volume / b.volume - 1) * 100) : null;
    return `Last week you moved ${stKg(a.volume)} kg in ${stPlural(a.count, 'session')}${pct == null ? '' : pct === 0 ? ', level with the week before' : `, ${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} than the week before`}.`;
  }

  // "Aesthetic 4 day block" says how many sessions a week the programme asks for. No number in the name, no target shown.
  const planDays = (gym) => { const m = gym && gym.programme && gym.programme.name && gym.programme.name.match(/(\d)[\s-]*day/i); return m ? Number(m[1]) : null; };

  return {
    planDays,
    ST_DAY,
    stT,
    stIso,
    ST_KIND,
    stWeekStart,
    stHalf,
    stKg,
    stDate,
    stPlural,
    stTopText,
    strengthWeeks,
    strengthLifts,
    stChange,
    stSummary,
  };
});

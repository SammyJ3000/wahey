// The sentences Wahey builds from the numbers: which overnight readings are outside your usual range, and how today's
// strain sits against its target range. The range itself (strainTarget) is in score.js; this part puts it into words.
// Pure functions with no DOM. In the browser it sets window.Words; in Node it is a CommonJS module.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./score.js'), require('./format.js'));
  else root.Words = factory(root.Score, root.Format);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Score, Format) {
  'use strict';

  const { verdict, sessionHr, strainPlus } = Score;
  const { cap1, listAnd } = Format;

  // The readings that can warn early, each with the direction that matters.
  function watchList(day) {
    return [
      { k: 'hrv', name: 'Heart rate variability', short: 'HRV', value: day.hrv_ms ? Math.round(day.hrv_ms) : null, r: day.ranges.hrv, bad: 'below', fmt: (x) => Math.round(x) + ' ms', none: 'No reading' },
      { k: 'rhr', name: 'Resting heart rate', short: 'resting heart rate', value: day.rhr ?? null, r: day.ranges.rhr, bad: 'above', fmt: (x) => Math.round(x) + ' bpm', none: 'No reading' },
      { k: 'resp', name: 'Breathing rate', short: 'breathing rate', value: day.resp_rate ?? null, r: day.ranges.resp, bad: 'above', fmt: (x) => x.toFixed(1) + ' a minute', none: 'Not recorded' },
      { k: 'spo2', name: 'Blood oxygen', short: 'blood oxygen', value: day.spo2 != null ? Math.round(day.spo2) : null, r: day.ranges.spo2, bad: 'below', fmt: (x) => Math.round(x) + '%', none: 'Not recorded' },
    ].map((x) => { const vd = verdict(x.value, x.r); return { ...x, vd, out: vd != null && vd === x.bad }; });
  }
  function warningLine(day) {
    const out = watchList(day).filter((x) => x.out);
    if (!out.length) return null;
    if (out.length === 1) return `${cap1(out[0].short)} is ${out[0].vd} your usual range this morning.`;
    return `${cap1(listAnd(out.map((x) => x.short)))} are ${out.length === 2 ? 'both' : 'all'} outside your usual range this morning.`;
  }

  // Direction in words. Inside the usual range it still says which end, because the score moves before a reading leaves the range.
  function driverSay(value, r) {
    const vd = verdict(value, r);
    if (!vd) return null;
    if (vd === 'below') return ['arrow-down', 'Below your usual'];
    if (vd === 'above') return ['arrow-up', 'Above your usual'];
    if (value < r.m - r.sd / 4) return ['arrow-down', 'Low end of your usual'];
    if (value > r.m + r.sd / 4) return ['arrow-up', 'High end of your usual'];
    return ['check', 'Right on your usual'];
  }

  // The most recent gym session in the week before this day that has heart rate, as a yardstick ("yesterday's Chest & Triceps (8.7)").
  function strainYardstick(all, idx, gym) {
    const day = all[idx], t = Date.parse(day.date);
    const list = (gym && gym.sessions ? gym.sessions : []).filter((s) => s.date < day.date && t - Date.parse(s.date) <= 6 * 864e5).sort((a, b) => b.date.localeCompare(a.date));
    for (const s of list) {
      const hr = sessionHr(s, all.find((d) => d.date === s.date));
      if (hr && hr.strain > 0) {
        const when = t - Date.parse(s.date) === 864e5 ? 'yesterday' : new Date(s.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
        return { label: `${when}’s ${s.name}`, strain: hr.strain };
      }
    }
    return null;
  }

  function strainSentence({ strain, lo, hi, live, yard, trained }) {
    const f = (x) => x.toFixed(1);
    if (!live) return strain < lo ? `You finished ${f(lo - strain)} short of the range.` : strain > hi ? `You finished ${f(strain - hi)} over the top of the range.` : 'You finished in range.';
    if (strain > hi) return `You’re ${f(strain - hi)} past the top of today’s range. Take the rest of the day easy.`;
    if (strain >= lo) return `You’re in range. Anything up to ${hi} still fits today.`;
    if (trained || !yard) return `You’re ${f(lo - strain)} short of the range${trained ? ', with today’s gym session already in' : ''}. ${lo - strain <= 3 ? 'A walk closes the gap.' : 'There’s room for a proper training session.'}`;
    const to = strainPlus(strain, yard.strain), sess = `A gym session like ${yard.label} (${f(yard.strain)})`;
    if (to > hi + 1) return `${sess} would take you to ${f(to)}, well past the top. Keep today to a walk or an easy session.`;
    if (to > hi) return `${sess} would take you just past the top. Go a little lighter than that today.`;
    if (to >= lo) return `${sess} would land you in range.`;
    return `${sess} would take you to ${f(to)}. You’d need a bit more on top to reach ${lo}.`;
  }

  return {
    watchList,
    warningLine,
    driverSay,
    strainYardstick,
    strainSentence,
  };
});

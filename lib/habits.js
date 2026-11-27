// The journal's maths. An entry belongs to the day the habits happened and is set against the NEXT morning's recovery.
// Nothing here claims a cause: it is averages, with the counts shown.
// Pure functions with no DOM. In the browser it sets window.Habits; in Node it is a CommonJS module.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./score.js'));
  else root.Habits = factory(root.Score);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Score) {
  'use strict';

  const { mean } = Score;

  const JN_MIN = 5;                                              // nights with and nights without before an effect is shown
  const JN_STARTERS = [['alcohol', 'Alcohol'], ['late_meal', 'Late meal'], ['screen_in_bed', 'Screen in bed'], ['caffeine_late', 'Late caffeine'], ['stretched', 'Stretched']];
  const jnShift = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const jnDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const jnNights = (n) => `${n} night${n === 1 ? '' : 's'}`;

  // The chips offered for one tap: his most-used habits first, topped up with common ones until he has his own.
  function jnTop(entries, n = 5) {
    const count = {}, label = {};
    entries.forEach((e) => (e.habits || []).forEach((h) => { count[h.slug] = (count[h.slug] || 0) + 1; label[h.slug] = h.label; }));
    const mine = Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b)).map((slug) => ({ slug, label: label[slug] }));
    const rest = JN_STARTERS.filter(([slug]) => !count[slug]).map(([slug, l]) => ({ slug, label: l }));
    return [...mine, ...rest].slice(0, n);
  }

  // For each habit: next-morning recovery on the nights with it against the logged nights without it.
  // Only logged days count as "without", so an unlogged day is never assumed to be a clean one.
  function jnInsights(entries, all) {
    const rec = {};
    all.forEach((d) => { if (d.recovery != null) rec[d.date] = d.recovery; });
    const nights = entries.map((e) => ({ e, r: rec[jnShift(e.date, 1)] })).filter((x) => x.r != null);
    const label = {};
    entries.forEach((e) => (e.habits || []).forEach((h) => { label[h.slug] = h.label; }));
    const rows = Object.keys(label).map((slug) => {
      const on = [], off = [];
      nights.forEach(({ e, r }) => ((e.habits || []).some((h) => h.slug === slug) ? on : off).push(r));
      const ready = on.length >= JN_MIN && off.length >= JN_MIN;
      const a = on.length ? Math.round(mean(on)) : null, b = off.length ? Math.round(mean(off)) : null;
      return { slug, label: label[slug], on: on.length, off: off.length, ready, a, b, diff: ready ? a - b : null };
    });
    const effects = rows.filter((r) => r.ready).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
    const waiting = rows.filter((r) => !r.ready).sort((x, y) => y.on - x.on || x.label.localeCompare(y.label));
    return { logged: entries.length, nights: nights.length, effects, waiting };
  }

  // The effect in words. "Tends to" and "on average" on purpose: this is a pattern in his nights, not a cause.
  function jnSay(r) {
    const gap = Math.abs(r.diff);
    if (gap < 2) return `No clear difference so far. Recovery averages ${r.a}% the morning after, and ${r.b}% without.`;
    return `Recovery tends to be ${gap} points ${r.diff < 0 ? 'lower' : 'higher'} the morning after. On average ${r.a}%, against ${r.b}% without.`;
  }
  // What a habit still needs before it is compared.
  function jnNeed(r) {
    if (r.on < JN_MIN) return `${r.on} of ${JN_MIN} nights logged`;
    return `Needs ${jnNights(JN_MIN - r.off).replace(/^(\d+)/, '$1 more')} without`;
  }

  return {
    JN_MIN,
    JN_STARTERS,
    jnShift,
    jnDate,
    jnNights,
    jnTop,
    jnInsights,
    jnSay,
    jnNeed,
  };
});

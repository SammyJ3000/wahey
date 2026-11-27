// Body age: an honest estimate, not WHOOP's maths. Seven habits and readings from the last 90 days are each held against
// a published guideline for an adult man and turned into years added or taken off, in half year steps, each capped.
// Body age = real age + the sum. An input only counts once it has enough days behind it; until then it adds nothing.
// The bands, caps, thresholds and sources are written up in docs/body-age-method.md.
// Pure functions with no DOM. In the browser it sets window.BodyAgeStats; in Node it is a CommonJS module.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./score.js'), require('./format.js'));
  else root.BodyAgeStats = factory(root.Score, root.Format);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Score, Format) {
  'use strict';

  const { mean, clamp, minOfDay, fullDay } = Score;
  const { dur } = Format;

  const BA_DAYS = 90;                      // how far back an input looks
  const BA_RECENT = 30;                    // and how recent some of it has to be
  const BA_MIN_READY = 5;                  // inputs that must count before a total is shown (of 7)
  const BA_CAP = 8;                        // the total never moves the age by more than this
  const BA_DAY = 864e5;
  const baT = (iso) => Date.parse(iso + 'T12:00:00Z');
  const baSd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };   // night-to-night spread (sample SD)
  const baBand = (bands, v) => { for (const [under, years] of bands) if (v < under) return years; return 0; };
  const baDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const baCount = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // Years for each band: [value is under this, years]. Minus takes years off. Sources for every line are in docs/body-age-method.md.
  const BA_BANDS = {
    sleep: [[300, 1.5], [360, 1], [390, 0.5], [420, 0], [540.5, -0.5], [570.5, 0], [Infinity, 0.5]],          // minutes asleep a night
    steady: [[45.5, -1], [60.5, -0.5], [90.5, 0], [120.5, 0.5], [Infinity, 1]],                                 // minutes of night-to-night swing
    rhr: [[50, -1.5], [55, -1], [60, -0.5], [70, 0], [80, 0.5], [90, 1], [Infinity, 1.5]],                      // bpm, measured overnight
    steps: [[3000, 1.5], [5000, 1], [6000, 0.5], [8000, 0], [10000, -0.5], [Infinity, -1]],                     // a day
    active: [[75, 1.5], [150, 0.5], [300, -0.5], [450, -1], [Infinity, -1.5]],                                  // moderate-equivalent minutes a week
    strength: [[0.01, 1], [1, 0.5], [2, 0], [Infinity, -1]],                                                    // gym days a week
  };
  const BA_CAPS = { sleep: [-0.5, 1.5], steady: [-1, 1], rhr: [-1.5, 1.5], steps: [-1, 1.5], active: [-1.5, 1.5], strength: [-1, 1], fat: [-1, 1.5] };
  // Body fat for men by age: [age under, healthy from, overweight from, obese from] in % (Gallagher 2000).
  const BA_FAT = [[40, 8, 20, 25], [60, 11, 22, 28], [Infinity, 13, 25, 30]];
  const baFatRow = (age) => BA_FAT.find((r) => age < r[0]);
  const baFatYears = (pct, age) => { const [, lo, over, obese] = baFatRow(age); return pct < lo ? 0 : pct < over ? -1 : pct < obese ? 0.5 : 1.5; };

  // Age in completed years, or null if the date isn't one an adult guideline covers.
  function baAge(dob, today) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob || '')) return null;
    const [y, m, d] = dob.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number);
    const a = ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
    return a >= 18 && a <= 100 ? a : null;
  }

  // Enough days to count? Needs `need` of them in the last 90 and `fresh` of those in the last 30.
  function baEnough(n, recent, need, fresh, noun) {
    if (n < need) return { status: 'learning', why: `Still learning. ${n} of ${need} ${noun} so far, so this isn’t counted yet.` };
    if (recent < fresh) return { status: 'learning', why: `Gone quiet. Only ${recent} of the ${fresh} ${noun} it needs from the last 30 days, so this isn’t counted for now.` };
    return { status: 'ready', why: null };
  }

  // One row per input: your number, the range it is held against, and the years it adds or takes off (null until it counts).
  function baInputs(all, gym, today, age) {
    const t0 = baT(today);
    const ago = (d) => Math.round((t0 - baT(d.date)) / BA_DAY);
    const win = all.filter((d) => ago(d) >= 0 && ago(d) < BA_DAYS);
    const fresh = (list) => list.filter((d) => ago(d) < BA_RECENT).length;
    const rows = [];
    const add = (k, name, o) => rows.push({ k, name, cap: BA_CAPS[k] || null, status: 'missing', value: null, years: null, ...o });
    const pos = (v, band) => (v < band[0] ? 'below' : v > band[1] ? 'above' : 'in');

    // Sleep length and how steady it is, from the same nights.
    const nights = win.filter((d) => d.sleep && d.sleep.asleep_min);
    const asleep = nights.map((d) => d.sleep.asleep_min);
    const nightsOk = baEnough(nights.length, fresh(nights), 21, 7, 'nights');
    if (!nights.length) {
      add('sleep', 'Sleep', { why: 'No sleep recorded in the last 90 days.' });
      add('steady', 'Sleep consistency', { why: 'No sleep recorded in the last 90 days.' });
    } else {
      const avg = mean(asleep);
      add('sleep', 'Sleep', { ...nightsOk, value: avg, text: dur(avg), detail: `a night, over ${baCount(nights.length, 'night')}`,
        scale: [300, 600], band: [420, 540], range: 'Healthy range 7h to 9h', where: pos(Math.round(avg), [420, 540]),
        say: { in: 'In the healthy range', below: 'Below the healthy range', above: 'Above the healthy range' },
        years: nightsOk.status === 'ready' ? baBand(BA_BANDS.sleep, avg) : null });
      if (nights.length < 2) add('steady', 'Sleep consistency', { status: 'learning', why: 'Still learning. It takes more than one night to see how much your sleep varies.' });
      else {
        const swing = baSd(asleep);
        const timed = nights.filter((d) => d.sleep.start && d.sleep.end);
        const beds = timed.map((d) => { const m = minOfDay(d.sleep.start); return m > 720 ? m - 1440 : m; }), ups = timed.map((d) => minOfDay(d.sleep.end));
        add('steady', 'Sleep consistency', { ...nightsOk, value: swing, text: `${Math.round(swing)} min`, detail: 'swing in sleep length, night to night',
          scale: [0, 150], band: [0, 60], range: 'Target 60 min or less', where: pos(Math.round(swing), [0, 60]),
          say: { in: 'On target', above: 'More than the target' },
          extra: timed.length >= 7 ? `Bedtime swings by ${Math.round(baSd(beds))} min and wake-up by ${Math.round(baSd(ups))} min, from the ${timed.length} nights with clock times. Shown for interest, not scored.` : null,
          years: nightsOk.status === 'ready' ? baBand(BA_BANDS.steady, swing) : null });
      }
    }

    const hearts = win.filter((d) => d.rhr);
    if (!hearts.length) add('rhr', 'Resting heart rate', { why: 'No resting heart rate in the last 90 days.' });
    else {
      const ok = baEnough(hearts.length, fresh(hearts), 21, 7, 'nights'), avg = mean(hearts.map((d) => d.rhr));
      add('rhr', 'Resting heart rate', { ...ok, value: avg, text: `${Math.round(avg)} bpm`, detail: `overnight, over ${baCount(hearts.length, 'night')}`,
        scale: [40, 100], band: [40, 59.9], range: 'Target under 60 bpm', where: pos(avg, [0, 59.999]),
        say: { in: 'On target', above: 'Above the target' }, years: ok.status === 'ready' ? baBand(BA_BANDS.rhr, avg) : null });
    }

    const walked = win.filter((d) => d.steps > 0 && d.date !== today);          // today isn't finished, so it would drag the average down
    if (!walked.length) add('steps', 'Steps', { why: 'No step counts in the last 90 days.' });
    else {
      const ok = baEnough(walked.length, fresh(walked), 21, 7, 'days'), avg = mean(walked.map((d) => d.steps));
      add('steps', 'Steps', { ...ok, value: avg, text: Math.round(avg).toLocaleString('en-GB'), detail: `a day, over ${baCount(walked.length, 'day')}`,
        scale: [0, 14000], band: [8000, 14000], range: 'Target 8,000 or more', where: pos(avg, [8000, Infinity]),
        say: { in: 'On target', below: 'Short of the target' }, years: ok.status === 'ready' ? baBand(BA_BANDS.steps, avg) : null });
    }

    // Minutes at a moderate (40 to 59% of heart rate reserve) and hard (60% and up) heart rate, on days the watch was on
    // for most of the day. Same reserve sum as strainOf. A hard minute counts as two, as the WHO guideline counts it.
    const worn = win.filter(fullDay);
    if (!worn.length) add('active', 'Active minutes', { why: 'No full day of heart rate in the last 90 days. The watch has to be on for most of a day.' });
    else {
      let mod = 0, hard = 0;
      worn.forEach((d) => d.hr_buckets.forEach((mins, i) => {
        const reserve = (42.5 + i * 5 - d.restHr) / (d.maxHr - d.restHr);
        if (reserve >= 0.6) hard += mins; else if (reserve >= 0.4) mod += mins;
      }));
      const wk = (x) => x / worn.length * 7, total = wk(mod) + 2 * wk(hard);
      const ok = baEnough(worn.length, fresh(worn), 14, 7, 'full days of heart rate');
      add('active', 'Active minutes', { ...ok, value: total, text: `${Math.round(total)} min`, detail: `a week, over ${baCount(worn.length, 'full day')} of heart rate`,
        scale: [0, 450], band: [150, 450], range: 'Target 150 or more', where: pos(total, [150, Infinity]),
        say: { in: 'On target', below: 'Short of the target' },
        extra: `${Math.round(wk(mod))} min at a moderate heart rate and ${Math.round(wk(hard))} min at a hard one. A hard minute counts as two.`,
        years: ok.status === 'ready' ? baBand(BA_BANDS.active, total) : null });
    }

    // Strength: gym days a week over the last four weeks, once the gym log itself is four weeks old.
    const sessions = ((gym && gym.sessions) || []).filter((s) => s.date <= today);
    const gymDays = [...new Set(sessions.map((s) => s.date))].sort();
    if (!gymDays.length) add('strength', 'Strength training', { why: gym && gym.connected ? 'No gym sessions logged yet.' : 'Your gym app isn’t connected.' });
    else {
      const logAge = Math.round((t0 - baT(gymDays[0])) / BA_DAY), recent = gymDays.filter((d) => t0 - baT(d) < 28 * BA_DAY).length, perWeek = recent / 4;
      const ready = logAge >= 28, show = (x) => String(Math.round(x * 10) / 10);
      add('strength', 'Strength training', ready
        ? { status: 'ready', value: perWeek, text: show(perWeek), detail: `gym ${perWeek === 1 ? 'day' : 'days'} a week, last 4 weeks`, scale: [0, 4], band: [2, 4], range: 'Target 2 or more',
          where: pos(perWeek, [2, Infinity]), say: { in: 'On target', below: 'Short of the target' }, years: baBand(BA_BANDS.strength, perWeek) }
        : { status: 'learning', text: baCount(gymDays.length, 'session'), detail: `logged since ${baDate(gymDays[0])}`,
          why: 'Still learning. The target is 2 or more gym days a week, and your gym log needs 4 weeks behind it before a weekly average means anything. Not counted yet.' });
    }

    // Body fat from the scale. Needs three weigh-ins this month (one reading swings with how much water you've had) and your age.
    const weighed = win.filter((d) => d.body_fat_pct && ago(d) < BA_RECENT);
    if (!weighed.length) add('fat', 'Body fat', { why: 'No body fat reading from the scale in the last 30 days.' });
    else {
      const pct = mean(weighed.map((d) => d.body_fat_pct)), kgs = weighed.filter((d) => d.weight_kg).map((d) => d.weight_kg);
      const kg = kgs.length ? mean(kgs) : null, f = age != null ? baFatRow(age) : null;
      const st = weighed.length < 3 ? { status: 'learning', why: `Still learning. ${weighed.length} of 3 weigh-ins this month, so this isn’t counted yet. One reading shifts with how much water you’ve had.` }
        : age == null ? { status: 'learning', why: 'Needs your date of birth. The healthy range for body fat moves up with age.' } : { status: 'ready', why: null };
      add('fat', 'Body fat', { ...st, value: pct, text: `${Math.round(pct * 10) / 10}%`, detail: `from the scale, ${baCount(weighed.length, 'weigh-in')}`,
        ...(f ? { scale: [5, 35], band: [f[1], f[2] - 0.1], range: `Healthy range ${f[1]} to ${f[2] - 1}%`, where: pos(pct, [f[1], f[2] - 0.001]),
          say: { in: 'In the healthy range', below: 'Below the healthy range', above: 'Above the healthy range' } } : {}),
        extra: kg ? `At ${Math.round(kg * 10) / 10} kg that is about ${Math.round(kg * (1 - pct / 100) * 10) / 10} kg of lean mass. Lean mass isn’t scored, because judging it needs your height.` : null,
        years: st.status === 'ready' ? baFatYears(pct, age) : null });
    }

    // HRV is shown but never counted.
    const hrv = win.filter((d) => d.hrv_ms).map((d) => d.hrv_ms);
    add('hrv', 'Heart rate variability', { status: 'info', value: hrv.length ? mean(hrv) : null, text: hrv.length ? `${Math.round(mean(hrv))} ms` : null,
      detail: hrv.length ? `overnight, over ${baCount(hrv.length, 'night')}` : null,
      why: 'Left out on purpose. A normal HRV for one healthy person can be several times another’s, so it can’t be turned into years fairly. It drives your recovery score instead.' });
    return rows;
  }

  // The sum. `years` only counts inputs that are ready; lo and hi show how far the inputs still waiting could move it.
  function baTotal(rows, age) {
    const scored = rows.filter((r) => r.cap), ready = scored.filter((r) => r.status === 'ready'), waiting = scored.filter((r) => r.status !== 'ready');
    const sum = ready.reduce((a, r) => a + r.years, 0), enough = ready.length >= BA_MIN_READY;
    const cap = (x) => clamp(x, -BA_CAP, BA_CAP);
    return { ready: ready.length, of: scored.length, enough, waiting, years: cap(sum),
      lo: cap(sum + waiting.reduce((a, r) => a + r.cap[0], 0)), hi: cap(sum + waiting.reduce((a, r) => a + r.cap[1], 0)),
      bodyAge: enough && age != null ? age + cap(sum) : null };
  }
  const baList = (names) => (names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]);
  const baYearsSay = (y) => (y === 0 ? 'The same as your age' : `${Math.abs(y) === 0.5 ? 'Half a year' : Math.abs(y) === 1 ? '1 year' : Math.abs(y) + ' years'} ${y < 0 ? 'younger' : 'older'} than your age`);

  // "57 bpm" as [57, bpm], so the unit can be set small like every other number in the app.
  const baSplit = (t) => { const m = String(t).match(/^([\d.,]+)\s?(.*)$/); return m ? [m[1], m[2]] : [t, '']; };

  return {
    BA_DAYS,
    BA_RECENT,
    BA_MIN_READY,
    BA_CAP,
    BA_BANDS,
    BA_CAPS,
    BA_FAT,
    baFatYears,
    baAge,
    baEnough,
    baInputs,
    baTotal,
    baList,
    baYearsSay,
    baSplit,
  };
});

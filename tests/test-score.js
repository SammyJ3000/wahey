// Unit tests for lib/score.js, the scoring maths the page runs. Pure functions, so no store, network or key.
//   node --test tests/test-score.js
const { test, describe } = require('node:test');
const assert = require('assert');
const S = require('../lib/score.js');

// A run of identical mornings, so every usual is known exactly.
const steady = (n, o = {}) => Array.from({ length: n }, (_, i) => ({
  date: new Date(Date.UTC(2030, 0, 1 + i)).toISOString().slice(0, 10),
  hrv_ms: 60, rhr: 60, sleep: { asleep_min: S.BASE_NEED, awake_min: 20 }, ...o,
}));
const near = (a, b, eps = 1e-9) => assert(Math.abs(a - b) < eps, `${a} is not ${b}`);

describe('small helpers', () => {
  test('mean, clamp and median', () => {
    assert.strictEqual(S.mean([1, 2, 3, 6]), 3);
    assert.strictEqual(S.clamp(5, 0, 3), 3);
    assert.strictEqual(S.clamp(-1, 0, 3), 0);
    assert.strictEqual(S.median([3, 1, 2]), 2);
    assert.strictEqual(S.median([4, 1, 3, 2]), 3);             // upper middle for an even count
    assert.strictEqual(S.median([]), null);
  });
  test('sd never returns 0, so a flat run cannot divide by zero', () => {
    assert.strictEqual(S.sd([5, 5, 5]), 1);
    assert.strictEqual(S.sd([2, 4, 4, 4, 5, 5, 7, 9]), 2);
  });
  test('range needs five readings', () => {
    assert.strictEqual(S.range([1, 2, 3, 4]), null);
    assert.deepStrictEqual(S.range([1, 2, 3, 4, 5]), { lo: 1, hi: 5, m: 3, sd: Math.sqrt(2) });
  });
  test('usual is mean plus or minus one sd, kept inside what was reached', () => {
    assert.deepStrictEqual(S.usual({ lo: 50, hi: 70, m: 60, sd: 5 }), [55, 65]);
    assert.deepStrictEqual(S.usual({ lo: 58, hi: 70, m: 60, sd: 5 }), [58, 65]);
    assert.strictEqual(S.usual(null), null);
    assert.strictEqual(S.verdict(54, { lo: 50, hi: 70, m: 60, sd: 5 }), 'below');
    assert.strictEqual(S.verdict(60, { lo: 50, hi: 70, m: 60, sd: 5 }), 'within');
    assert.strictEqual(S.verdict(66, { lo: 50, hi: 70, m: 60, sd: 5 }), 'above');
    assert.strictEqual(S.verdict(null, { lo: 50, hi: 70, m: 60, sd: 5 }), null);
  });
  test('recovery bands', () => {
    assert.strictEqual(S.band(67), 'good');
    assert.strictEqual(S.band(66), 'meh');
    assert.strictEqual(S.band(34), 'meh');
    assert.strictEqual(S.band(33), 'bad');
    assert.strictEqual(S.band(null), null);
  });
});

describe('strain', () => {
  test('no heart rate means no strain', () => {
    assert.strictEqual(S.strainOf({}, 190, 60), null);
    assert.strictEqual(S.strainOf(null, 190, 60), null);
  });
  test('easy minutes add nothing', () => {
    const b = new Array(37).fill(0); b[3] = 600;              // 57.5 bpm all day
    assert.strictEqual(S.strainOf({ hr_buckets: b }, 190, 60), 0);
  });
  test('harder minutes add strain on a log scale, capped at 21', () => {
    const b = new Array(37).fill(0); b[20] = 30;               // 142.5 bpm for 30 minutes
    const reserve = (142.5 - 60) / (190 - 60), load = 30 * (reserve - 0.3) * 10;
    assert.strictEqual(S.strainOf({ hr_buckets: b }, 190, 60), Math.round(6.5 * Math.log(1 + load / 15) * 10) / 10);
    b[30] = 100000;
    assert.strictEqual(S.strainOf({ hr_buckets: b }, 190, 60), 21);
  });
  test('two efforts add as loads, not as scores', () => {
    assert.strictEqual(S.strainPlus(0, 0), 0);
    assert.strictEqual(S.strainPlus(10, 0), 10);
    assert(S.strainPlus(10, 10) < 20 && S.strainPlus(10, 10) > 10);
    near(S.strainLoad(0), 0);
  });
  test('the strain target follows the recovery band', () => {
    const all = [{ date: '2030-01-01', recovery: 80 }];
    assert.deepStrictEqual(S.strainTarget(all, 0), { usualDay: 11, learning: true, days: 0, lo: 12, hi: 16, why: 'Above your usual day' });
    all[0].recovery = 50;
    assert.deepStrictEqual(S.strainTarget(all, 0), { usualDay: 11, learning: true, days: 0, lo: 8, hi: 12, why: 'Around your usual day' });
    all[0].recovery = 20;
    assert.deepStrictEqual(S.strainTarget(all, 0), { usualDay: 11, learning: true, days: 0, lo: 4, hi: 7, why: 'About half your usual day' });
    all[0].recovery = null;
    assert.deepStrictEqual(S.strainTarget(all, 0), { usualDay: 11, learning: true, days: 0, lo: null, hi: null, why: null });
    assert.strictEqual(S.strainTarget(all, 5), null);
  });
  test('the usual day is learned from full wear days once there are seven', () => {
    const full = new Array(37).fill(0); full[3] = 1000;
    const all = Array.from({ length: 8 }, (_, i) => ({ date: `2030-01-0${i + 1}`, strain: 14, hr_buckets: full, recovery: 50 }));
    const t = S.strainTarget(all, 7);
    assert.strictEqual(t.learning, false); assert.strictEqual(t.days, 7); assert.strictEqual(t.usualDay, 14);
    assert.strictEqual(S.fullDay({ strain: 3, hr_buckets: [999] }), false);
  });
  test('gym session heart rate needs a window and at least three readings', () => {
    assert.strictEqual(S.sessionHr({}, {}), null);
    const day = { restHr: 60, maxHr: 190, hr_min: [600, 120, 602, 140, 604, 150, 606, 130] };
    const s = { start: Date.parse('2030-06-01T10:00:00+01:00'), end: Date.parse('2030-06-01T10:10:00+01:00') };   // 10:00 to 10:10 London time, in ms as api/gym.js sends it
    const hr = S.sessionHr(s, day);
    assert.strictEqual(hr.a, 600); assert.strictEqual(hr.b, 610); assert.strictEqual(hr.minutes, 10);
    assert.strictEqual(hr.max, 150); assert.strictEqual(hr.pts.length, 4);
    assert(hr.strain > 0);
  });
});

describe('recovery', () => {
  test('a normal morning with enough sleep scores 58 plus the sleep nudge', () => {
    const all = S.computeAll(steady(6));
    const d = all[5];
    assert.strictEqual(d.parts.hrv, 0);
    assert.strictEqual(d.parts.rhr, 0);
    assert.strictEqual(d.need, S.BASE_NEED);
    assert.strictEqual(d.parts.sleep, 6);                       // a full night: 0.4 x (100 - 85)
    assert.strictEqual(d.recovery, 64);
    assert.strictEqual(d.hrvNormal, 60); assert.strictEqual(d.rhrNormal, 60); assert.strictEqual(d.baseNights, 5);
  });
  test('no HRV, no score', () => {
    const days = steady(6); days[5].hrv_ms = null;
    const d = S.computeAll(days)[5];
    assert.strictEqual(d.recovery, null); assert.deepStrictEqual(d.parts, {});
  });
  test('fewer than five earlier nights, no score', () => {
    assert.strictEqual(S.computeAll(steady(5))[4].recovery, null);
  });
  test('HRV moves it most and is capped both ways', () => {
    const hi = steady(6); hi[5].hrv_ms = 60 * 3;
    near(S.computeAll(hi)[5].parts.hrv, 130 * Math.log(1.3));
    assert.strictEqual(S.computeAll(hi)[5].recovery, Math.round(58 + 130 * Math.log(1.3) + 6));
    const lo = steady(6); lo[5].hrv_ms = 10;
    near(S.computeAll(lo)[5].parts.hrv, 130 * -0.45);
  });
  test('resting heart rate counts only beyond 1 bpm from the usual', () => {
    const one = steady(6); one[5].rhr = 61;
    assert.strictEqual(S.computeAll(one)[5].parts.rhr, 0);
    const four = steady(6); four[5].rhr = 64;
    assert.strictEqual(S.computeAll(four)[5].parts.rhr, -4.5);
    const far = steady(6); far[5].rhr = 90;
    assert.strictEqual(S.computeAll(far)[5].parts.rhr, -9);
  });
  test('sleep points', () => {
    assert.strictEqual(S.sleepPoints(1), 6);
    assert.strictEqual(S.sleepPoints(1.4), 6);
    near(S.sleepPoints(0.85), 0);
    assert.strictEqual(S.sleepPoints(0.5), -12);
  });
  test('the score stays between 1 and 99', () => {
    const lo = steady(6); lo[5].hrv_ms = 1; lo[5].rhr = 120; lo[5].sleep = { asleep_min: 10 };
    assert.strictEqual(S.computeAll(lo)[5].recovery, 1);
  });
  test('driver points add up to the ring', () => {
    const days = steady(8).map((d, i) => ({ ...d, hrv_ms: 55 + i, rhr: 58 + (i % 3), sleep: { asleep_min: 420 + i * 7 } }));
    days[7].hrv_ms = 49.3; days[7].rhr = 63;
    const d = S.computeAll(days)[7], dp = S.driverPoints(d);
    assert.strictEqual(dp.start, S.REC_NORMAL);
    assert.strictEqual(dp.start + Object.values(dp.by).reduce((a, b) => a + b, 0), d.recovery);
    assert.strictEqual(S.driverPoints({ recovery: null, parts: {} }), null);
  });
  test('sleep debt from the last three nights raises the need, up to 90 minutes', () => {
    const days = steady(6); days[2].sleep = { asleep_min: 300 }; days[3].sleep = { asleep_min: 300 }; days[4].sleep = { asleep_min: 300 };
    const d = S.computeAll(days)[5];
    assert.strictEqual(d.debt, 90); assert.strictEqual(d.need, S.BASE_NEED + 30);
  });
});

describe('tonight and weight', () => {
  test('tonight adds strain, debt and time awake to the base need', () => {
    const all = S.computeAll(steady(6)).map((d) => ({ ...d, strain: 15 }));
    const p = S.tonightPlan(all, 5, null);
    assert.strictEqual(p.base, S.BASE_NEED); assert.strictEqual(p.forStrain, 24); assert.strictEqual(p.forDebt, 0);
    assert.strictEqual(p.awake, 30); assert.strictEqual(p.inBed, S.BASE_NEED + 24 + 30);
    assert.strictEqual(p.wake, 7 * 60); assert.strictEqual(p.wakeFrom, 'guess'); assert.strictEqual(p.bed, 7 * 60 - p.inBed);
    assert.strictEqual(S.tonightPlan(all, 5, 6 * 60).wakeFrom, 'set');
    assert.strictEqual(S.tonightPlan([{ date: '2030-01-01' }], 0, null), null);
  });
  test('weight is a seven day average, and the scale wins over the gym app', () => {
    const w = S.weightSeries([{ date: '2030-01-01', weight_kg: 80 }, { date: '2030-01-03', weight_kg: 82 }, { date: '2030-01-20', weight_kg: 79 }], [{ date: '2030-01-01', weight: 99 }, { date: '2030-01-02', weight: 81 }]);
    assert.deepStrictEqual(w.map((p) => [p.date, p.w, p.avg]), [['2030-01-01', 80, 80], ['2030-01-02', 81, 80.5], ['2030-01-03', 82, 81], ['2030-01-20', 79, 79]]);
  });
});

// Unit tests for lib/body-age.js: real age, each input's years, and the capped total.
//   node --test tests/test-body-age.js
const { test, describe } = require('node:test');
const assert = require('assert');
const B = require('../lib/body-age.js');

const TODAY = '2026-11-20';
// Thirty nights of 7h 30m asleep at a resting heart rate of 55, nothing else.
const nights = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(Date.parse(TODAY + 'T12:00:00Z') - i * 864e5).toISOString().slice(0, 10), sleep: { asleep_min: 450 }, rhr: 55,
}));

describe('body age', () => {
  test('age in completed years, adults only', () => {
    assert.strictEqual(B.baAge('1991-05-14', TODAY), 35);
    assert.strictEqual(B.baAge('1991-11-21', TODAY), 34);       // birthday tomorrow
    assert.strictEqual(B.baAge('2010-01-01', TODAY), null);     // under 18
    assert.strictEqual(B.baAge('not a date', TODAY), null);
  });
  test('body fat years move with the age row', () => {
    assert.strictEqual(B.baFatYears(7, 35), 0);
    assert.strictEqual(B.baFatYears(15, 35), -1);
    assert.strictEqual(B.baFatYears(22, 35), 0.5);
    assert.strictEqual(B.baFatYears(26, 35), 1.5);
    assert.strictEqual(B.baFatYears(21, 45), -1);              // healthy runs higher from 40
  });
  test('each input with enough days gets its years; the rest say why not', () => {
    const rows = Object.fromEntries(B.baInputs(nights, null, TODAY, 35).map((r) => [r.k, r]));
    assert.deepStrictEqual(Object.keys(rows), ['sleep', 'steady', 'rhr', 'steps', 'active', 'strength', 'fat', 'hrv']);
    assert.strictEqual(rows.sleep.status, 'ready');
    assert.strictEqual(rows.sleep.text, '7h 30m');
    assert.strictEqual(rows.sleep.years, -0.5);
    assert.strictEqual(rows.steady.years, -1);                 // the same length every night
    assert.strictEqual(rows.rhr.years, -0.5);
    assert.strictEqual(rows.steps.status, 'missing');
    assert.strictEqual(rows.strength.why, 'Your gym app isn’t connected.');
    assert.strictEqual(rows.hrv.status, 'info');
  });
  test('too few nights is still learning and adds nothing', () => {
    const [sleep] = B.baInputs(nights.slice(0, 10), null, TODAY, 35);
    assert.strictEqual(sleep.status, 'learning');
    assert.strictEqual(sleep.years, null);
    assert.match(sleep.why, /^Still learning\. 10 of 21 nights/);
  });
  test('the total counts ready inputs, shows how far the rest could move it, and is capped', () => {
    const ready = (years) => ({ cap: [-1, 1], status: 'ready', years });
    const rows = [ready(-0.5), ready(-1), ready(0), ready(0.5), ready(-1), { cap: [-1, 1.5], status: 'learning', years: null }, { cap: null, status: 'info' }];
    assert.deepStrictEqual(B.baTotal(rows, 35), { ready: 5, of: 6, enough: true, waiting: [rows[5]], years: -2, lo: -3, hi: -0.5, bodyAge: 33 });
    assert.strictEqual(B.baTotal(rows.slice(1), 35).bodyAge, null);   // four ready is not enough
    assert.strictEqual(B.baTotal([1, 2, 3, 4, 5].map(() => ready(2)), 35).years, 8);
  });
  test('years and numbers in words', () => {
    assert.strictEqual(B.baYearsSay(0), 'The same as your age');
    assert.strictEqual(B.baYearsSay(-0.5), 'Half a year younger than your age');
    assert.strictEqual(B.baYearsSay(1), '1 year older than your age');
    assert.strictEqual(B.baYearsSay(-2.5), '2.5 years younger than your age');
    assert.deepStrictEqual(B.baSplit('57 bpm'), ['57', 'bpm']);
    assert.deepStrictEqual(B.baSplit('4,198'), ['4,198', '']);
    assert.deepStrictEqual(B.baSplit('19.5%'), ['19.5', '%']);
  });
});

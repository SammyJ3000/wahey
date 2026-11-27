// Unit tests for lib/words.js: the warning line on Today, each driver in words, and today's strain against its range.
//   node --test tests/test-words.js
const { test, describe } = require('node:test');
const assert = require('assert');
const W = require('../lib/words.js');
const S = require('../lib/score.js');

const range = (m, sd) => ({ lo: m - 3 * sd, hi: m + 3 * sd, m, sd });
const morning = (o) => ({ hrv_ms: 60, rhr: 60, resp_rate: null, spo2: null, ranges: { hrv: range(60, 5), rhr: range(60, 2), resp: null, spo2: null }, ...o });

describe('overnight readings', () => {
  test('no warning when everything is usual', () => {
    assert.strictEqual(W.warningLine(morning()), null);
  });
  test('one reading out names it and its direction', () => {
    assert.strictEqual(W.warningLine(morning({ hrv_ms: 40 })), 'HRV is below your usual range this morning.');
  });
  test('only the direction that matters warns', () => {
    assert.strictEqual(W.warningLine(morning({ hrv_ms: 80 })), null);          // a high HRV is not a warning
  });
  test('two readings out are listed together', () => {
    assert.strictEqual(W.warningLine(morning({ hrv_ms: 40, rhr: 70 })), 'HRV and resting heart rate are both outside your usual range this morning.');
  });
  test('driverSay still says which end of the usual range a reading sits at', () => {
    const r = range(60, 8);
    assert.deepStrictEqual(W.driverSay(40, r), ['arrow-down', 'Below your usual']);
    assert.deepStrictEqual(W.driverSay(55, r), ['arrow-down', 'Low end of your usual']);
    assert.deepStrictEqual(W.driverSay(60, r), ['check', 'Right on your usual']);
    assert.deepStrictEqual(W.driverSay(65, r), ['arrow-up', 'High end of your usual']);
    assert.strictEqual(W.driverSay(null, r), null);
  });
});

describe('strain against the range', () => {
  const tg = { lo: 8, hi: 12 };
  test('a finished day', () => {
    assert.strictEqual(W.strainSentence({ ...tg, strain: 5 }), 'You finished 3.0 short of the range.');
    assert.strictEqual(W.strainSentence({ ...tg, strain: 13.5 }), 'You finished 1.5 over the top of the range.');
    assert.strictEqual(W.strainSentence({ ...tg, strain: 10 }), 'You finished in range.');
  });
  test('today, so far', () => {
    assert.strictEqual(W.strainSentence({ ...tg, live: true, strain: 14 }), 'You’re 2.0 past the top of today’s range. Take the rest of the day easy.');
    assert.strictEqual(W.strainSentence({ ...tg, live: true, strain: 9 }), 'You’re in range. Anything up to 12 still fits today.');
    assert.strictEqual(W.strainSentence({ ...tg, live: true, strain: 6, trained: true }), 'You’re 2.0 short of the range, with today’s gym session already in. A walk closes the gap.');
    assert.strictEqual(W.strainSentence({ ...tg, live: true, strain: 2 }), 'You’re 6.0 short of the range. There’s room for a proper training session.');
  });
  test('with a recent session as the yardstick', () => {
    const yard = { label: 'yesterday’s Legs', strain: 8.7 };
    const to = S.strainPlus(2, 8.7);
    assert(to >= 8 && to <= 12, `expected ${to} to land in range for this case`);
    assert.strictEqual(W.strainSentence({ ...tg, live: true, strain: 2, yard }), 'A gym session like yesterday’s Legs (8.7) would land you in range.');
  });
  test('no gym log means no yardstick', () => {
    assert.strictEqual(W.strainYardstick([{ date: '2026-11-20' }], 0, null), null);
  });
});

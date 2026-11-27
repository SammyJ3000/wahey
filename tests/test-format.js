// Unit tests for lib/format.js: how durations, clock times and dates read on screen.
//   node --test tests/test-format.js
const { test, describe } = require('node:test');
const assert = require('assert');
const F = require('../lib/format.js');

describe('durations', () => {
  test('hm always shows hours and two digit minutes', () => {
    assert.strictEqual(F.hm(125), '2h 05m');
    assert.strictEqual(F.hm(0), '0h 00m');
    assert.strictEqual(F.hm(null), '–');
  });
  test('dur drops the hours under an hour', () => {
    assert.strictEqual(F.dur(45), '45m');
    assert.strictEqual(F.dur(59.4), '59m');
    assert.strictEqual(F.dur(60), '1h 00m');
    assert.strictEqual(F.dur(452), '7h 32m');
    assert.strictEqual(F.dur(undefined), '–');
  });
  test('signed uses a true minus sign', () => {
    assert.strictEqual(F.signed(3), '+3');
    assert.strictEqual(F.signed(-3), '−3');
    assert.strictEqual(F.signed(0), '0');
  });
});

describe('clock times', () => {
  test('clock12 turns minutes after midnight into a 12 hour time, wrapping either way', () => {
    assert.strictEqual(F.clock12(0), '12:00am');
    assert.strictEqual(F.clock12(720), '12:00pm');
    assert.strictEqual(F.clock12(22 * 60 + 45), '10:45pm');
    assert.strictEqual(F.clock12(-30), '11:30pm');
    assert.strictEqual(F.clock12(1440 + 30), '12:30am');
  });
  test('clock reads an ISO time in UK time, summer and winter', () => {
    assert.strictEqual(F.clock('2026-07-01T21:49:00Z'), '10:49pm');
    assert.strictEqual(F.clock('2026-01-15T21:49:00Z'), '9:49pm');
    assert.strictEqual(F.clock(null), '');
  });
});

describe('dates', () => {
  test('a YYYY-MM-DD day in its short, week and long forms', () => {
    assert.strictEqual(F.shortDate('2026-11-20'), '20 Nov');
    assert.strictEqual(F.wkDate('2026-11-20'), 'Fri 20 Nov');
    assert.strictEqual(F.longDate('2026-11-20'), 'Friday 20 November');
    assert.strictEqual(F.wkShort('2026-11-20'), 'Fri');
  });
  test('dayLabel says Today and Yesterday, and the date otherwise', () => {
    const yesterday = new Date(Date.now() - 864e5).toLocaleDateString('en-CA');
    assert.match(F.isoToday(), /^\d{4}-\d{2}-\d{2}$/);
    assert.strictEqual(F.dayLabel(F.isoToday()), 'Today');
    assert.strictEqual(F.dayLabel(yesterday), 'Yesterday');
    assert.strictEqual(F.dayLabel('2020-03-02'), 'Mon 2 Mar');
  });
  test('cap1 and listAnd', () => {
    assert.strictEqual(F.cap1('resting heart rate'), 'Resting heart rate');
    assert.strictEqual(F.listAnd([]), '');
    assert.strictEqual(F.listAnd(['HRV']), 'HRV');
    assert.strictEqual(F.listAnd(['HRV', 'sleep']), 'HRV and sleep');
    assert.strictEqual(F.listAnd(['HRV', 'sleep', 'steps']), 'HRV, sleep and steps');
  });
});

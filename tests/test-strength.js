// Unit tests for lib/strength.js: weeks, lifts, personal bests and the sentences on the Strength screen.
//   node --test tests/test-strength.js
const { test, describe } = require('node:test');
const assert = require('assert');
const St = require('../lib/strength.js');

const bench = (date, e1rm) => ({ date, name: 'Push', sets: 3, volume: 1440,
  exercises: [{ name: 'Bench Press', sets: 3, volume: 1440, top: { weight: 60, reps: 8 }, e1rm }] });

describe('weeks', () => {
  test('weeks run Monday to Sunday', () => {
    assert.strictEqual(St.stWeekStart('2026-11-16'), '2026-11-16');   // Monday
    assert.strictEqual(St.stWeekStart('2026-11-20'), '2026-11-16');   // Friday
    assert.strictEqual(St.stWeekStart('2026-11-22'), '2026-11-16');   // Sunday
  });
  test('one entry per week up to this week, empty weeks included', () => {
    const sessions = [{ date: '2026-11-03', volume: 1000, sets: 10 }, { date: '2026-11-05', volume: 500, sets: 5 }, { date: '2026-11-18', volume: 800, sets: 8 }];
    assert.deepStrictEqual(St.strengthWeeks(sessions, '2026-11-20'), [
      { start: '2026-11-02', volume: 1500, count: 2, sets: 15 },
      { start: '2026-11-09', volume: 0, count: 0, sets: 0 },
      { start: '2026-11-16', volume: 800, count: 1, sets: 8 },
    ]);
    assert.deepStrictEqual(St.strengthWeeks([], '2026-11-20'), []);
  });
  test('the summary compares last week with the week before', () => {
    assert.match(St.stSummary([{ volume: 0, count: 0 }]), /^Your first week/);
    assert.strictEqual(St.stSummary([{ volume: 1000, count: 2 }, { volume: 1200, count: 3 }, { volume: 0, count: 0 }]),
      'Last week you moved 1,200 kg in 3 sessions, 20% more than the week before.');
    assert.strictEqual(St.stSummary([{ volume: 1000, count: 2 }, { volume: 0, count: 0 }, { volume: 0, count: 0 }]), 'Nothing logged last week.');
  });
});

describe('lifts', () => {
  test('kg are shown to the nearest half, with thousands separated', () => {
    assert.strictEqual(St.stKg(62.3), '62.5');
    assert.strictEqual(St.stKg(60), '60');
    assert.strictEqual(St.stKg(12345.6), '12,346');
  });
  test('the top set in words', () => {
    assert.strictEqual(St.stTopText({ sets: 3, top: null }), '3 sets');
    assert.strictEqual(St.stTopText({ sets: 1, top: null }), '1 set');
    assert.strictEqual(St.stTopText({ top: { secs: 60 } }), '60 s hold');
    assert.strictEqual(St.stTopText({ top: { weight: 60, reps: 8 } }), '60 kg × 8');
    assert.strictEqual(St.stTopText({ top: { weight: 0, reps: 12 } }), '12 reps, bodyweight');
  });
  test('a lift is tracked by estimated 1RM, and a best has to beat everything before it', () => {
    const [lift] = St.strengthLifts([bench('2026-11-02', 76), bench('2026-11-09', 78.3), bench('2026-11-16', 77)]);
    assert.strictEqual(lift.name, 'Bench Press');
    assert.strictEqual(lift.kind, 'e1rm');
    assert.deepStrictEqual(lift.pts.map((p) => p.v), [76, 78.5, 77]);
    assert.deepStrictEqual(lift.bests.map((b) => [b.date, b.v, b.was]), [['2026-11-09', 78.5, 76]]);
    assert.strictEqual(lift.isBest, false);
    assert.deepStrictEqual(St.stChange(lift), { icon: 'arrow-down', text: 'Down 1.5 kg on last time, up 1 kg since 2 Nov' });
  });
  test('the first session is a starting mark, not a best', () => {
    const [lift] = St.strengthLifts([bench('2026-11-02', 76)]);
    assert.deepStrictEqual(lift.bests, []);
    assert.strictEqual(St.stChange(lift), null);
  });
});

// Unit tests for lib/habits.js: the journal's chips and what each habit does to the next morning's recovery.
//   node --test tests/test-habits.js
const { test, describe } = require('node:test');
const assert = require('assert');
const H = require('../lib/habits.js');

// Ten logged days. Alcohol on the even ones; the morning after scores 50 with it and 70 without.
const days = Array.from({ length: 11 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);
const entries = days.slice(0, 10).map((date, i) => ({ date, habits: i % 2 ? [] : [{ slug: 'alcohol', label: 'Alcohol' }] }));
const all = days.map((date, i) => ({ date, recovery: i === 0 ? null : (i - 1) % 2 ? 70 : 50 }));

describe('habits', () => {
  test('jnShift moves a day across month ends', () => {
    assert.strictEqual(H.jnShift('2026-11-30', 1), '2026-12-01');
    assert.strictEqual(H.jnShift('2026-03-01', -1), '2026-02-28');
  });
  test('the chips: his own habits first, topped up with common ones', () => {
    const top = H.jnTop([{ habits: [{ slug: 'late_meal', label: 'Late meal' }] }, { habits: [{ slug: 'sauna', label: 'Sauna' }, { slug: 'late_meal', label: 'Late meal' }] }]);
    assert.deepStrictEqual(top.map((h) => h.slug), ['late_meal', 'sauna', 'alcohol', 'screen_in_bed', 'caffeine_late']);
  });
  test('an effect needs five nights with and five without, and compares the next morning', () => {
    const r = H.jnInsights(entries, all);
    assert.strictEqual(r.logged, 10);
    assert.strictEqual(r.nights, 10);
    assert.deepStrictEqual(r.effects, [{ slug: 'alcohol', label: 'Alcohol', on: 5, off: 5, ready: true, a: 50, b: 70, diff: -20 }]);
    assert.strictEqual(H.jnSay(r.effects[0]), 'Recovery tends to be 20 points lower the morning after. On average 50%, against 70% without.');
  });
  test('too few nights waits, and says what it still needs', () => {
    const r = H.jnInsights(entries.slice(0, 6), all);
    assert.deepStrictEqual(r.effects, []);
    assert.strictEqual(r.waiting[0].on, 3);
    assert.strictEqual(H.jnNeed(r.waiting[0]), '3 of 5 nights logged');
    assert.strictEqual(H.jnNeed({ on: 5, off: 2 }), 'Needs 3 more nights without');
    assert.strictEqual(H.jnNeed({ on: 5, off: 4 }), 'Needs 1 more night without');
  });
  test('a small gap is not called a difference', () => {
    assert.match(H.jnSay({ diff: 1, a: 61, b: 60 }), /^No clear difference so far/);
  });
});

// Offline tests for api/health.js: the { days } check and the error reply. Uses ?dry=1, so nothing is written to the store.
//   node --test tests/test-api-health.js
const { test, describe } = require('node:test');
const path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
process.env.APP_KEY = 't'; delete process.env.BLOB_READ_WRITE_TOKEN;
// The store is wrapped before api/health.js loads it, so one test can make it fail.
const store = require(path.join(ROOT, 'lib', 'store.js'));
const realRead = store.readJSON;
let failRead = false;
store.readJSON = async (...a) => { if (failRead) throw new Error('secret detail from the store'); return realRead(...a); };
const h = require(path.join(ROOT, 'api', 'health.js'));
const { checkDays, MAX_DAYS } = h._test;

const call = async (method, { body, query } = {}) => {
  const out = {};
  const res = { setHeader() {}, status(c) { out.status = c; return res; }, json(o) { out.body = o; return res; } };
  await h({ method, headers: { 'x-app-key': 't' }, body, query: query || {} }, res);
  return out;
};
const day = (o = {}) => ({ date: '2030-01-01', hrv_ms: 61.2, hrv_n: 6, rhr: 58, steps: 7000,
  sleep: { start: '2029-12-31T23:10:00.000Z', end: '2030-01-01T06:40:00.000Z', asleep_min: 410, deep_min: 60, rem_min: 90, core_min: 260, awake_min: 20 },
  hr_buckets: new Array(37).fill(1), hr_max: 150, hr_min: [420, 60, 421, 62], workouts: [{ type: 'Walk', start: '2030-01-01T12:00:00.000Z', minutes: 30, kcal: 120 }], ...o });

describe('checkDays', () => {
  test('accepts a summarised day', () => {
    assert.strictEqual(checkDays([day()]), null);
  });
  test('rejects anything that is not a non empty list', () => {
    for (const v of [undefined, null, {}, 'x', []]) assert.match(checkDays(v), /non empty list/);
  });
  test('caps the number of days', () => {
    const many = Array.from({ length: MAX_DAYS + 1 }, (_, i) => day({ date: new Date(Date.UTC(2030, 0, 1 + i)).toISOString().slice(0, 10) }));
    assert.match(checkDays(many), /at most/);
    assert.strictEqual(checkDays(many.slice(0, MAX_DAYS)), null);
  });
  test('needs a real date on every day', () => {
    assert.match(checkDays([day({ date: '2030-1-1' })]), /YYYY-MM-DD/);
    assert.match(checkDays([day({ date: undefined })]), /YYYY-MM-DD/);
    assert.match(checkDays([42]), /object/);
  });
  test('rejects unknown fields and wrong shapes', () => {
    assert.match(checkDays([day({ owner: 'x' })]), /unknown field owner/);
    assert.match(checkDays([day({ rhr: '58' })]), /rhr has the wrong shape/);
    assert.match(checkDays([day({ hr_buckets: new Array(38).fill(0) })]), /hr_buckets/);
    assert.match(checkDays([day({ hr_min: new Array(2 * 1440 + 2).fill(1) })]), /hr_min/);
    assert.match(checkDays([day({ sleep: { asleep_min: { deep: 1 } } })]), /sleep/);
    assert.match(checkDays([day({ workouts: [{ type: 'x'.repeat(500) }] })]), /workouts/);
  });
});

describe('handler', () => {
  test('a valid { days } post is understood', async () => {
    const r = await call('POST', { body: { days: [day()] }, query: { dry: '1' } });
    assert.strictEqual(r.status, 200); assert.deepStrictEqual(Object.keys(r.body.understood), ['2030-01-01']);
  });
  test('a malformed { days } post is a 400 that says why', async () => {
    const r = await call('POST', { body: { days: [{ date: '2030-01-01', rhr: 'high' }] }, query: { dry: '1' } });
    assert.strictEqual(r.status, 400); assert.match(r.body.error, /rhr/);
  });
  test('a server error is logged, and the client gets a plain message', async () => {
    const realError = console.error, logged = [];
    failRead = true;
    console.error = (...a) => logged.push(a.map(String).join(' '));
    try {
      const r = await call('POST', { body: { hrv: { date: '2030-01-01', ms: 50 } } });
      assert.strictEqual(r.status, 500);
      assert.deepStrictEqual(r.body, { error: 'health failed' });
      assert(logged.some((l) => l.includes('secret detail from the store')));
    } finally { failRead = false; console.error = realError; }
  });
});

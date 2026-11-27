#!/usr/bin/env node
// Demo data: 60 days of believable, entirely fictional summaries for the persona "Alex" (34, office worker,
// trains three times a week), so the app can be run locally with no watch, phone or keys.
// Writes tmp/store/health/days.json. A real import overwrites it.
const { writeJSON } = require('../lib/store');
delete process.env.BLOB_READ_WRITE_TOKEN;

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

const days = {};
const today = new Date();
let weight = 84.0;
for (let i = 59; i >= 0; i--) {
  const d = new Date(today.getTime() - i * 864e5);
  const date = d.toISOString().slice(0, 10);
  const gym = [1, 3, 5].includes(d.getDay());        // Mon, Wed, Fri
  const bad = rnd() < 0.15;
  const asleep = Math.round(400 + gauss() * 40 - (bad ? 70 : 0));
  const buckets = new Array(37).fill(0);
  buckets[3] = 300; buckets[4] = 420; buckets[5] = 260; buckets[6] = 120; buckets[7] = 60;
  if (gym) { buckets[10] = 18; buckets[12] = 14; buckets[14] = 9; buckets[16] = 4; }
  weight += -0.05 + gauss() * 0.25;
  days[date] = {
    date, hrv_ms: Math.round((62 + gauss() * 8 - (bad ? 11 : 0)) * 10) / 10, hrv_n: 6, rhr: Math.round(61 + gauss() * 2 + (bad ? 3 : 0)),
    sleep: { start: '', end: '', asleep_min: asleep, deep_min: Math.round(asleep * 0.16), rem_min: Math.round(asleep * 0.22), core_min: Math.round(asleep * 0.62), awake_min: 25 },
    hr_buckets: buckets, hr_max: gym ? 168 : 124, steps: Math.round(6500 + gauss() * 2500), active_kcal: Math.round(450 + gauss() * 120),
    weight_kg: i % 2 ? Math.round(weight * 10) / 10 : null, spo2: 96, resp_rate: 14.5,
  };
}
writeJSON('health/days.json', days).then(() => console.log('Fictional sample data written (60 days) to tmp/store/health/days.json.'));

#!/usr/bin/env node
// Backfill from Apple Health's "Export All Health Data" zip (or its unzipped export.xml).
// Streams the file line by line, keeps the last N days of the types we use, summarises them and either
// writes them to the local store or sends them to the live API.
//
//   node executions/import_health_export.js inputs/export.zip --days 60            -> local store (tmp/store)
//   node executions/import_health_export.js inputs/export.zip --days 60 --to URL   -> POST URL/api/health (needs APP_KEY in .env)
//   add --out tmp/summary.json to also save the summaries

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');
const { summarise, merge } = require('../lib/summarise');

const args = process.argv.slice(2);
const src = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DAYS = Number(opt('--days', 60));
const TO = opt('--to', null);
const OUT = opt('--out', null);
if (!src) { console.error('usage: import_health_export.js <export.zip|export.xml> [--days 60] [--to https://…] [--out file]'); process.exit(1); }

const TYPES = {
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: 'hrv',
  HKQuantityTypeIdentifierRestingHeartRate: 'rhr',
  HKQuantityTypeIdentifierHeartRate: 'hr',
  HKQuantityTypeIdentifierStepCount: 'steps',
  HKQuantityTypeIdentifierActiveEnergyBurned: 'kcal',
  HKQuantityTypeIdentifierBodyMass: 'weight',
  HKQuantityTypeIdentifierBodyFatPercentage: 'fat',
  HKQuantityTypeIdentifierOxygenSaturation: 'spo2',
  HKQuantityTypeIdentifierRespiratoryRate: 'resp',
  HKCategoryTypeIdentifierSleepAnalysis: 'sleep',
};
const STAGES = {
  HKCategoryValueSleepAnalysisInBed: 'inbed', HKCategoryValueSleepAnalysisAsleepUnspecified: 'asleep', HKCategoryValueSleepAnalysisAsleep: 'asleep',
  HKCategoryValueSleepAnalysisAsleepCore: 'core', HKCategoryValueSleepAnalysisAsleepDeep: 'deep', HKCategoryValueSleepAnalysisAsleepREM: 'rem',
  HKCategoryValueSleepAnalysisAwake: 'awake',
};
const attr = (line, name) => { const m = line.match(new RegExp(name + '="([^"]*)"')); return m ? m[1] : null; };
const isoOf = (s) => s.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/, '$1T$2$3:$4');

function xmlStream(file) {
  if (file.endsWith('.zip')) {
    const list = execFileSync('unzip', ['-Z1', file], { maxBuffer: 1 << 26 }).toString().split('\n');
    const entry = list.find((n) => /export\.xml$/.test(n) && !/cda/i.test(n));
    if (!entry) throw new Error('no export.xml inside the zip');
    const { spawn } = require('child_process');
    return spawn('unzip', ['-p', file, entry]).stdout;
  }
  return fs.createReadStream(file);
}

(async () => {
  const since = Date.now() - (DAYS + 1) * 864e5;
  const raw = { sleep: [], workouts: [] };
  for (const k of Object.values(TYPES)) if (k !== 'sleep') raw[k] = [];
  let lines = 0, kept = 0;

  const rl = readline.createInterface({ input: xmlStream(path.resolve(src)), crlfDelay: Infinity });
  for await (const line of rl) {
    lines++;
    if (line.includes('<Record ')) {
      const type = TYPES[attr(line, 'type')];
      if (!type) continue;
      const start = isoOf(attr(line, 'startDate') || '');
      if (Date.parse(start) < since) continue;
      const src = attr(line, 'sourceName') || '?';
      if (type === 'sleep') raw.sleep.push({ stage: STAGES[attr(line, 'value')] || 'asleep', start, end: isoOf(attr(line, 'endDate')), src });
      else raw[type].push({ t: start, v: Number(attr(line, 'value')), src });
      kept++;
    } else if (line.includes('<Workout ')) {
      const start = isoOf(attr(line, 'startDate') || '');
      if (Date.parse(start) < since) continue;
      raw.workouts.push({ type: (attr(line, 'workoutActivityType') || '').replace('HKWorkoutActivityType', ''), start, end: isoOf(attr(line, 'endDate')), kcal: attr(line, 'totalEnergyBurned') });
      kept++;
    }
  }

  const days = summarise(raw);
  const list = Object.values(days).filter((d) => Date.parse(d.date) >= since).sort((a, b) => a.date.localeCompare(b.date));
  const count = (k) => list.filter((d) => d[k] != null).length;
  console.log(`read ${lines.toLocaleString()} lines, kept ${kept.toLocaleString()} samples → ${list.length} days`);
  console.log(`days with: hrv ${count('hrv_ms')} · resting HR ${count('rhr')} · sleep ${count('sleep')} · heart rate ${count('hr_buckets')} · steps ${count('steps')} · weight ${count('weight_kg')}`);
  console.log('sources:', [...new Set(Object.values(raw).flat().map((r) => r.src).filter(Boolean))].join(', '));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(list, null, 1));

  if (TO) {
    const key = process.env.APP_KEY || (fs.existsSync('.env') && (fs.readFileSync('.env', 'utf8').match(/^APP_KEY=(.*)$/m) || [])[1]);
    if (!key) throw new Error('APP_KEY missing: add it to .env');
    const r = await fetch(TO.replace(/\/$/, '') + '/api/health', { method: 'POST', headers: { 'content-type': 'application/json', 'x-app-key': key.trim() }, body: JSON.stringify({ days: list }) });
    console.log('sent:', r.status, await r.text());
  } else {
    const { readJSON, writeJSON } = require('../lib/store');
    delete process.env.BLOB_READ_WRITE_TOKEN;                // local import never touches the live store
    const all = merge(await readJSON('health/days.json', {}), Object.fromEntries(list.map((d) => [d.date, d])));
    await writeJSON('health/days.json', all);
    console.log('saved to tmp/store/health/days.json');
  }
})().catch((e) => { console.error(e.message); process.exit(1); });

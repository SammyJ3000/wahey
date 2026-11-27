// Daily health data.
//
//   GET  /api/health?ping=1        -> { ok } (true once APP_KEY is set)
//   POST /api/health               -> body { samples } from the iPhone Shortcut, or { days } from the importer
//   POST /api/health               -> body { hrv: { date, ms } } saves an HRV figure typed in by hand
//   POST /api/health?dry=1         -> same, but only returns what it understood (for building the Shortcut)
//   GET  /api/health               -> { days: [...] } oldest first, topped up with HRV and sleep from intervals.icu
// Every call except ping needs the x-app-key header.

const { keyOk } = require('../lib/auth');
const { readJSON, writeJSON } = require('../lib/store');
const { summarise, merge } = require('../lib/summarise');
const { fetchWellness, fillFrom } = require('../lib/intervals');

const FILE = 'health/days.json';
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_DAYS = 400;            // days in one { days } post: the importer sends 60 by default, a year at most is plenty

// The fields a stored day may have (from lib/summarise.js and lib/intervals.js) and what each must be.
const num = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));
const str = (v) => v === null || (typeof v === 'string' && v.length <= 80);
const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const numList = (max) => (v) => v === null || (Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'number' && Number.isFinite(x)));
const flat = (maxKeys) => (v) => v === null || (plain(v) && Object.keys(v).length <= maxKeys && Object.values(v).every((x) => num(x) || str(x)));
const DAY_FIELDS = {
  hrv_ms: num, hrv_n: num, hrv_from: str, rhr: num, sleep_score: num, sleep_hr: num, hr_max: num, steps: num, active_kcal: num,
  weight_kg: num, body_fat_pct: num, spo2: num, resp_rate: num,
  sleep: flat(12),
  hr_buckets: numList(37),            // minutes in each 5 bpm band
  hr_min: numList(2 * 1440),          // [minute, bpm] pairs, at most one per minute of the day
  workouts: (v) => v === null || (Array.isArray(v) && v.length <= 50 && v.every(flat(8))),
};

// Checks a { days } post from the importer. Returns null when it is fine, or what is wrong.
function checkDays(days) {
  if (!Array.isArray(days) || !days.length) return 'days must be a non empty list';
  if (days.length > MAX_DAYS) return `at most ${MAX_DAYS} days in one post`;
  for (const d of days) {
    if (!plain(d)) return 'each day must be an object';
    if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || Number.isNaN(Date.parse(d.date))) return 'each day needs a date as YYYY-MM-DD';
    for (const [k, v] of Object.entries(d)) {
      if (k === 'date') continue;
      if (!Object.prototype.hasOwnProperty.call(DAY_FIELDS, k)) return `${d.date}: unknown field ${k.slice(0, 40)}`;
      if (!DAY_FIELDS[k](v)) return `${d.date}: ${k} has the wrong shape`;
    }
  }
  return null;
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) return JSON.parse(req.body);
  return {};
}

// Shortcuts sends lists as text ("52, 48, 61" or one per line). Turn {values, dates} pairs into [{t, v}].
function fromShortcut(s) {
  const split = (x) => (Array.isArray(x) ? x : String(x || '').split(/\n|,(?=\s*\d{1,2}[ /])|;/)).map((v) => String(v).trim()).filter(Boolean);
  const out = {};
  for (const [k, val] of Object.entries(s)) {
    if (val && typeof val === 'object' && !Array.isArray(val) && ('values' in val || 'dates' in val)) {
      const v = split(val.values), t = split(val.dates);
      out[k] = v.map((x, i) => ({ v: parseFloat(String(x).replace(/[^\d.-]/g, '')), t: t[i], src: val.source || 'shortcut' }));
    } else if (k === 'sleep' && val && typeof val === 'object' && 'stages' in val) {
      const st = split(val.stages), a = split(val.starts), b = split(val.ends);
      out.sleep = st.map((x, i) => ({ stage: stageName(x), start: a[i], end: b[i] }));
    } else out[k] = val;
  }
  return out;
}
function stageName(x) {
  const s = String(x).toLowerCase();
  if (s.includes('deep')) return 'deep';
  if (s.includes('rem')) return 'rem';
  if (s.includes('core') || s.includes('light')) return 'core';
  if (s.includes('awake')) return 'awake';
  if (s.includes('bed')) return 'inbed';
  return 'asleep';
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET' && req.query.ping) return res.status(200).json({ ok: !!process.env.APP_KEY });
  if (!process.env.APP_KEY) return res.status(503).json({ error: 'APP_KEY not set' });
  if (!keyOk(req)) return res.status(401).json({ error: 'wrong key' });

  try {
    if (req.method === 'GET') {
      if (req.query.sync) return res.status(200).json(await readJSON('health/last-sync.json', null) || { at: null });   // when the phone last sent, for the app's pull-to-sync
      if (req.query.raw) return res.status(200).json(await readJSON('health/last-raw.json', null) || { none: true });   // the phone's latest send, for tracing
      let all = await readJSON(FILE, {});
      // Top up HRV and sleep from intervals.icu each time the app opens. A failure here never blocks the app.
      try {
        const filled = fillFrom(all, await fetchWellness());
        if (filled.changed) { all = filled.days; await writeJSON(FILE, all); }
      } catch (err) { console.error('intervals.icu sync failed', err.message); }
      return res.status(200).json({ days: Object.values(all).sort((a, b) => a.date.localeCompare(b.date)) });
    }
    if (req.method === 'POST') {
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      if (Buffer.byteLength(raw) > MAX_BYTES) return res.status(413).json({ error: 'too large' });
      const body = parseBody(req);
      // HRV typed in by hand from the Zepp app, for mornings intervals.icu hasn't passed it on yet.
      // Marked so the figure from intervals.icu replaces it when that arrives.
      if (body.hrv) {
        const ms = Number(body.hrv.ms), date = String(body.hrv.date || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(ms >= 5 && ms <= 250)) return res.status(400).json({ error: 'expected hrv { date, ms } with ms between 5 and 250' });
        const all = await readJSON(FILE, {});
        all[date] = { ...(all[date] || { date }), hrv_ms: Math.round(ms), hrv_from: 'manual' };
        await writeJSON(FILE, all);
        return res.status(200).json({ ok: true, date, hrv_ms: Math.round(ms) });
      }
      let incoming;
      if (body.days) {
        const bad = checkDays(body.days);
        if (bad) return res.status(400).json({ error: bad });
        incoming = Object.fromEntries(body.days.map((d) => [d.date, d]));
      }
      else if (body.samples) incoming = summarise(fromShortcut(body.samples));
      else return res.status(400).json({ error: 'expected { samples } or { days }' });

      if (req.query.dry) return res.status(200).json({ understood: incoming });
      // Keep the latest raw send (private store) so a figure that disagrees with Zepp can be traced to its samples.
      // A failure here only loses the trace copy, so it is logged and the sync carries on.
      if (body.samples) {
        await writeJSON('health/last-raw.json', { at: new Date().toISOString(), samples: body.samples })
          .catch((err) => console.error('saving the raw send failed', err.message));
      }
      const all = merge(await readJSON(FILE, {}), incoming);
      await writeJSON(FILE, all);
      await writeJSON('health/last-sync.json', { at: new Date().toISOString(), days: Object.keys(incoming) });
      return res.status(200).json({ ok: true, days: Object.keys(incoming).sort() });
    }
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('health failed', err);                       // the detail stays in the server log
    return res.status(500).json({ error: 'health failed' });
  }
};

module.exports._test = { checkDays, MAX_DAYS };

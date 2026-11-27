// Read-only link to a gym app. Fetches its online backup (GYM_API_URL, sent with GYM_BACKUP_KEY in the x-backup-key
// header) and returns only what this app needs. Never writes to the gym app. Without both env vars it reports
// { connected: false } and the rest of the app carries on without gym data.
//
//   GET /api/gym  -> { sessions: [{ date, name, sets, volume, exercises: [{ name, sets, volume, top, e1rm }], start, end }], body: [{ date, weight }], goal }

const { keyOk } = require('../lib/auth');

// One-off corrections for sessions the gym app filed wrongly (see config.json). Never written back to the gym app.
const FIXES = (require('../config.json').gym_corrections) || {};

function toNum(w) { const n = parseFloat(String(w ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0; }

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.APP_KEY) return res.status(503).json({ error: 'APP_KEY not set' });
  if (!keyOk(req)) return res.status(401).json({ error: 'wrong key' });
  if (!process.env.GYM_API_URL || !process.env.GYM_BACKUP_KEY) return res.status(200).json({ connected: false, sessions: [], body: [] });

  try {
    const r = await fetch(process.env.GYM_API_URL, { headers: { 'x-backup-key': process.env.GYM_BACKUP_KEY }, cache: 'no-store' });
    if (!r.ok) return res.status(200).json({ connected: false, error: `gym app said ${r.status}`, sessions: [], body: [] });
    const snap = await r.json();
    const data = snap.data || {};
    const get = (k) => { const v = data[k]; return typeof v === 'string' ? JSON.parse(v) : v; };

    const sessions = (get('fitness_sessions') || []).map((s) => {
      const exercises = (s.exercises || []).map((e) => {
        const done = (e.sets || []).filter((x) => x.done !== false && (x.reps || x.secs));
        // Best set of the day: heaviest weight, most reps as the tie-break. Timed sets (secs, no reps) give the longest hold instead.
        const lifted = done.map((x) => ({ weight: toNum(x.weight), reps: Number(x.reps) || 0 })).filter((x) => x.reps > 0);
        const best = lifted.slice().sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
        const hold = Math.max(0, ...done.map((x) => (x.reps ? 0 : Number(x.secs) || 0)));
        // Estimated one-rep max (Epley), best across the day's sets. Only loaded sets of 1 to 12 reps: beyond that it stops being a fair guess.
        const e1rm = Math.max(0, ...lifted.filter((x) => x.weight > 0 && x.reps <= 12).map((x) => (x.reps === 1 ? x.weight : x.weight * (1 + x.reps / 30))));
        return { name: e.exercise, sets: done.length, volume: done.reduce((a, x) => a + (Number(x.reps) || 0) * toNum(x.weight), 0),
          top: best || (hold ? { secs: hold } : null), e1rm: e1rm ? Math.round(e1rm * 10) / 10 : null };
      }).filter((e) => e.sets);
      // When the session actually happened: set tick times if the gym app recorded them, else start/finish, else a correction.
      const ats = (s.exercises || []).flatMap((e) => (e.sets || []).map((x) => x.at)).filter(Number.isFinite).sort((a, b) => a - b);
      const fix = (FIXES[s.id] || {});
      const start = fix.start ? Date.parse(fix.start) : ats.length ? ats[0] - 5 * 60e3 : s.startedAt || null;
      const end = fix.end ? Date.parse(fix.end) : s.finishedAt || (ats.length ? ats[ats.length - 1] + 3 * 60e3 : null);
      return { date: fix.date || String(s.date).slice(0, 10), name: s.day || 'Session', sets: exercises.reduce((a, e) => a + e.sets, 0),
        volume: Math.round(exercises.reduce((a, e) => a + e.volume, 0)), exercises, start, end: end && start && end - start < 4 * 3600e3 ? end : null };
    }).filter((s) => s.sets).sort((a, b) => a.date.localeCompare(b.date));

    const body = (get('fitness_body') || []).map((b) => ({ date: String(b.date).slice(0, 10), weight: Number(b.weight) })).filter((b) => b.weight);
    return res.status(200).json({ connected: true, sessions, body, goal: get('fitness_active_goal') || null, programme: get('fitness_programme_state') || null });
  } catch (err) {
    console.error('gym failed', err);
    return res.status(200).json({ connected: false, error: err.message, sessions: [], body: [] });
  }
};

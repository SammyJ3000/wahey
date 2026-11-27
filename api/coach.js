// Claude's daily call. The app sends today's scores and the last week; Claude answers in two or three sentences.
// One call per day is cached, so opening the app ten times costs one request.
//
//   POST /api/coach          -> { message, date, cached }
//   POST /api/coach?fresh=1  -> asks again even if today's call exists

const fs = require('fs');
const path = require('path');
const { keyOk } = require('../lib/auth');
const { readJSON, writeJSON } = require('../lib/store');

const PROMPT = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'coach.md'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
// The model thinks before it writes and thinking counts against this; 800 cut the call off mid sentence.
const MAX_TOKENS = 3000;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.APP_KEY) return res.status(503).json({ error: 'APP_KEY not set' });
  if (!keyOk(req)) return res.status(401).json({ error: 'wrong key' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const date = String(body.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date missing' });

    const file = `coach/${date}.json`;
    if (!req.query.fresh) {
      const cached = await readJSON(file, null);
      // A saved call only stands while the score it was written for does; re-imported data asks again.
      if (cached && cached.recovery === body.recovery) return res.status(200).json({ ...cached, cached: true });
    }
    if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ message: null, error: 'ANTHROPIC_API_KEY not set', date });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: CONFIG.coach_model,
        max_tokens: MAX_TOKENS,
        system: PROMPT,
        messages: [{ role: 'user', content: 'Here is today. Make the call.\n\n' + JSON.stringify(body, null, 1) }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(200).json({ message: null, error: (j.error && j.error.message) || `Claude said ${r.status}`, date });
    const message = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    // A reply that ran out of room is half a sentence: never show or save it.
    if (j.stop_reason === 'max_tokens') return res.status(200).json({ message: null, error: 'reply was cut short', date });
    if (!message) return res.status(200).json({ message: null, error: `empty reply (${j.stop_reason || 'unknown'}: ${(j.content || []).map((c) => c.type).join(',')})`, date });
    const out = { message, date, recovery: body.recovery, at: new Date().toISOString() };
    await writeJSON(file, out);
    return res.status(200).json({ ...out, cached: false });
  } catch (err) {
    console.error('coach failed', err);
    return res.status(500).json({ error: 'coach failed: ' + err.message });
  }
};

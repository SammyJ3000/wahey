// The journal: what the user did on a day, kept so it can be set against the next morning's recovery.
//
//   GET  /api/journal   -> { entries: [...] } oldest first
//   POST /api/journal   -> body { date, text?, habits?, nothing? } -> { entry, parsed, note? }
//       date     the day the habits happened (YYYY-MM-DD), not the morning after
//       text     a line in his own words. Claude turns it into habits. Sending "" clears the note.
//       habits   the day's full set of chips, [{ slug, label, amount?, src? }]. Leaving one out removes it.
//       nothing  true = "nothing to note", so the night still counts as one without each habit
//   A day with no text, no habits and no "nothing" is deleted.
//   Without ANTHROPIC_API_KEY (or if Claude can't be reached) the note and chips are still stored; parsed is false.
// Every call needs the x-app-key header.

const fs = require('fs');
const path = require('path');
const { keyOk } = require('../lib/auth');
const { readJSON, writeJSON } = require('../lib/store');

const PROMPT = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'journal.md'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));

const FILE = 'journal/entries.json';
const MAX_TEXT = 500;
const MAX_HABITS = 12;
const MAX_TOKENS = 400;   // the reply is a few short JSON objects; low effort keeps thinking from eating this

// The habits Claude is steered towards, so the same thing always lands on the same slug.
const CANON = {
  alcohol: 'Alcohol', late_meal: 'Late meal', screen_in_bed: 'Screen in bed', caffeine_late: 'Late caffeine',
  stretched: 'Stretched', walk: 'Walk', stressed: 'Stressed', nap: 'Nap',
  big_meal: 'Big meal', sauna: 'Sauna', ill: 'Ill', travel: 'Travel', read_before_bed: 'Read before bed',
  meditated: 'Meditated', magnesium: 'Magnesium',
};
const ALIAS = {
  drink: 'alcohol', drinks: 'alcohol', drinking: 'alcohol', beer: 'alcohol', wine: 'alcohol', booze: 'alcohol', pints: 'alcohol',
  ate_late: 'late_meal', late_eating: 'late_meal', late_dinner: 'late_meal', late_food: 'late_meal',
  phone_in_bed: 'screen_in_bed', screens_in_bed: 'screen_in_bed', screen_time_in_bed: 'screen_in_bed',
  late_caffeine: 'caffeine_late', late_coffee: 'caffeine_late', coffee_late: 'caffeine_late',
  stretching: 'stretched', stretch: 'stretched', walked: 'walk', walking: 'walk', stress: 'stressed',
  napped: 'nap', sick: 'ill', illness: 'ill', travelled: 'travel', traveled: 'travel', meditation: 'meditated', reading: 'read_before_bed',
};

const slugOf = (x) => {
  const s = String(x || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  return ALIAS[s] || s;
};
const labelOf = (slug, given) => {
  if (CANON[slug]) return CANON[slug];
  const l = String(given || '').replace(/\s+/g, ' ').trim().slice(0, 40) || slug.replace(/_/g, ' ');
  return l.charAt(0).toUpperCase() + l.slice(1);
};

// One habit, cleaned. Accepts a bare slug or an object; returns null for anything unusable.
function cleanHabit(h, src) {
  if (typeof h === 'string') h = { slug: h };
  if (!h || typeof h !== 'object' || Array.isArray(h)) return null;
  const slug = slugOf(h.slug || h.id || h.habit || h.label);
  if (!slug) return null;
  const out = { slug, label: labelOf(slug, h.label), src: src || (h.src === 'text' ? 'text' : 'chip') };
  const amount = h.amount == null ? '' : String(h.amount).replace(/\s+/g, ' ').trim().slice(0, 24);
  if (amount && !/^(null|none|n\/a|yes|true)$/i.test(amount)) out.amount = amount;
  return out;
}
// A list of habits, cleaned, one per slug (the first wins), capped.
function cleanHabits(list, src) {
  const seen = new Set(), out = [];
  for (const h of Array.isArray(list) ? list : []) {
    const c = cleanHabit(h, src);
    if (c && !seen.has(c.slug)) { seen.add(c.slug); out.push(c); }
    if (out.length >= MAX_HABITS) break;
  }
  return out;
}

// Pull the habits out of whatever the model replied. It is asked for {"habits":[...]} and nothing else, but this also
// copes with code fences, a sentence before or after, a bare array, and trailing commas. Returns null if there is no JSON.
function extractHabits(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const text = raw.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '');
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{' && text[i] !== '[') continue;
    const end = closing(text, i);
    if (end < 0) continue;
    let val;
    const chunk = text.slice(i, end + 1);
    try { val = JSON.parse(chunk); } catch { try { val = JSON.parse(chunk.replace(/,\s*([}\]])/g, '$1')); } catch { continue; } }
    const list = Array.isArray(val) ? val : val && Array.isArray(val.habits) ? val.habits : null;
    if (list) return cleanHabits(list, 'text');
  }
  return null;
}
// Index of the bracket that closes the one at `start`, minding strings.
function closing(s, start) {
  let depth = 0, inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// Ask Claude for the habits in one note. Returns { habits } or { error }; never throws.
async function parseNote(text, known) {
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'ANTHROPIC_API_KEY not set' };
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: CONFIG.journal_model || CONFIG.coach_model,
        max_tokens: MAX_TOKENS,
        output_config: { effort: 'low' },
        system: PROMPT,
        messages: [{ role: 'user', content: JSON.stringify({ note: text, known_habits: known }) }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return { error: (j.error && j.error.message) || `Claude said ${r.status}` };
    const reply = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    const habits = extractHabits(reply);
    if (!habits) return { error: `no JSON in the reply (${j.stop_reason || 'unknown'})` };
    return { habits };
  } catch (err) {
    return { error: 'Claude could not be reached: ' + err.message };
  }
}

const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T12:00:00Z')) && Date.parse(d + 'T00:00:00Z') <= Date.now() + 864e5;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.APP_KEY) return res.status(503).json({ error: 'APP_KEY not set' });
  if (!keyOk(req)) return res.status(401).json({ error: 'wrong key' });

  try {
    if (req.method === 'GET') {
      const all = await readJSON(FILE, {});
      return res.status(200).json({ entries: Object.values(all).sort((a, b) => a.date.localeCompare(b.date)) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const date = String(body.date || '').slice(0, 10);
    if (!validDate(date)) return res.status(400).json({ error: 'date missing or not a real day' });
    const hasText = typeof body.text === 'string';
    if (!hasText && !Array.isArray(body.habits) && body.nothing == null) return res.status(400).json({ error: 'expected text, habits or nothing' });

    const all = await readJSON(FILE, {});
    const old = all[date] || { date, text: '', habits: [] };
    let habits = Array.isArray(body.habits) ? cleanHabits(body.habits) : cleanHabits(old.habits);
    let text = old.text || '', parsed = null, note;

    if (hasText) {
      text = body.text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
      if (!text) habits = habits.filter((h) => h.src !== 'text');           // note cleared: what came from it goes too
      else {
        const custom = Object.values(all).flatMap((e) => e.habits || []).filter((h) => !CANON[h.slug]);
        const known = [...Object.entries(CANON).map(([slug, label]) => ({ slug, label })), ...cleanHabits(custom).map(({ slug, label }) => ({ slug, label }))];
        const got = await parseNote(text, known);
        if (got.habits) {
          // A rewritten note replaces what the old note produced; chips he tapped himself stay.
          const mine = habits.filter((h) => h.src !== 'text'), have = new Set(mine.map((h) => h.slug));
          habits = [...mine.map((h) => { const t = got.habits.find((g) => g.slug === h.slug); return t && t.amount ? { ...h, amount: t.amount } : h; }),
            ...got.habits.filter((g) => !have.has(g.slug))].slice(0, MAX_HABITS);
          parsed = true;
        } else { parsed = false; note = got.error; }                         // keep the note and the chips as they were
      }
    }

    const nothing = habits.length ? false : body.nothing != null ? !!body.nothing : !!old.nothing;
    if (!text && !habits.length && !nothing) {
      delete all[date];
      await writeJSON(FILE, all);
      return res.status(200).json({ entry: null, date, parsed });
    }
    const entry = { date, text, habits, at: new Date().toISOString() };
    if (nothing) entry.nothing = true;
    all[date] = entry;
    await writeJSON(FILE, all);
    return res.status(200).json({ entry, date, parsed, ...(note ? { note } : {}) });
  } catch (err) {
    console.error('journal failed', err);
    return res.status(500).json({ error: 'journal failed: ' + err.message });
  }
};

module.exports.extractHabits = extractHabits;       // exported for tests
module.exports.cleanHabits = cleanHabits;

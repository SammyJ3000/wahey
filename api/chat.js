// Ask the coach: a day's conversation with Claude about the user's numbers, plus the short list of facts Claude keeps about him.
// Nothing is remembered silently: Claude can only propose a line, and it is saved when the user taps it.
//
//   GET    /api/chat?date=YYYY-MM-DD        -> { date, messages, memory }
//   POST   /api/chat  { date, question, context }
//                                           -> { date, messages, memory }            (question and reply appended and stored)
//                                           -> { date, messages, memory, error }     (nothing stored; the app offers "Try again")
//   PUT    /api/chat  { memory: [{ id?, text }] }      -> replaces the list (add, edit, delete are all this)
//   PUT    /api/chat  { date, remember: messageId }    -> saves the line Claude proposed in that reply
//   PUT    /api/chat  { date, dismiss: messageId }     -> drops the proposal
//   DELETE /api/chat?date=YYYY-MM-DD        -> clears that day's conversation (memory is untouched)
//
// Files: chat/<date>.json and coach/memory.json.

const fs = require('fs');
const path = require('path');
const { keyOk } = require('../lib/auth');
const { readJSON, writeJSON } = require('../lib/store');

const PROMPT_FILE = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'chat.md'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));

const MEMORY_FILE = 'coach/memory.json';
const QUESTION_MAX = 600;        // characters in one question
const CONTEXT_MAX = 24000;       // characters of JSON the app may send as the day's data
const HISTORY_TURNS = 6;         // earlier question-and-answer pairs sent back to Claude
const DAY_MAX = 60;              // messages kept for one day; the oldest pairs drop off after that
const MEMORY_MAX = 40;           // lines
const LINE_MAX = 160;            // characters in one memory line
const MAX_TOKENS = Number(CONFIG.chat_max_tokens) || 2000;   // the reply is short; the room is for the model's thinking

/* ---------------------------------------------------------------- pure helpers (unit-tested) */

// prompts/chat.md ends with a "memory-seed" comment: the facts the list starts with. It is not sent as part of the prompt.
function splitPrompt(file) {
  const m = file.match(/<!--\s*memory-seed[^\n]*\n([\s\S]*?)-->/);
  const seed = m ? m[1].split('\n').map((l) => l.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean) : [];
  return { prompt: file.replace(/<!--\s*memory-seed[\s\S]*?-->/, '').trim(), seed };
}

const cleanLine = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').replace(/^["'“‘\s-]+|["'”’\s]+$/g, '').replace(/\.$/, '').trim().slice(0, LINE_MAX);
const sameLine = (a, b) => cleanLine(a).toLowerCase() === cleanLine(b).toLowerCase();
const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Claude's reply is plain text. If it wants a fact kept, the last line is "REMEMBER: <one short fact>".
// Returns the text the user reads and the proposed line (or null). Anything already on the list is not proposed again.
function parseReply(raw, memory = []) {
  let remember = null;
  const kept = String(raw || '').replace(/\r/g, '').split('\n');
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  // Only the last line counts, and only in capitals, so a sentence that happens to start "Remember:" stays in the answer.
  const m = kept.length ? kept[kept.length - 1].match(/^\s*(?:[-*>]\s*)?\**\s*REMEMBER\s*\**\s*[:：]\s*\**\s*(.*)$/) : null;
  if (m) { kept.pop(); const t = cleanLine(m[1].replace(/\*+/g, '')); if (t && !/^(none|nothing|n\/a|no)$/i.test(t)) remember = t; }
  const text = kept.join('\n')
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '')       // the app sets its own type; markdown marks would show as symbols
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (remember && memory.some((l) => sameLine(l.text, remember))) remember = null;
  return { text, remember };
}

// The list as Claude sees it.
const memoryBlock = (lines) => (lines.length
  ? 'What you know about Alex (he wrote or approved every line):\n' + lines.map((l) => '- ' + l.text).join('\n')
  : 'You have no saved facts about Alex yet.');

// Earlier turns as plain text, capped; today's data rides on the newest question only, so it is sent once and is always current.
function buildMessages(history, question, context) {
  const past = history.filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text).slice(-HISTORY_TURNS * 2);
  while (past.length && past[0].role !== 'user') past.shift();      // the API wants the first message to be the user's
  const out = past.map((m) => ({ role: m.role, content: m.text }));
  out.push({ role: 'user', content: 'His numbers right now, as JSON:\n' + context + '\n\nAlex asks: ' + question });
  return out;
}

// A replacement list from the app: keeps ids and origins of lines that already exist, drops blanks and repeats.
function mergeMemory(existing, incoming) {
  const out = [];
  for (const item of Array.isArray(incoming) ? incoming : []) {
    const text = cleanLine(item && typeof item === 'object' ? item.text : item);
    if (!text || out.some((l) => sameLine(l.text, text))) continue;
    const old = item && item.id ? existing.find((l) => l.id === item.id) : null;
    out.push(old ? { ...old, text, ...(old.text === text ? {} : { edited: new Date().toISOString() }) } : { id: newId('f'), text, from: 'user', at: new Date().toISOString() });
    if (out.length >= MEMORY_MAX) break;
  }
  return out;
}

/* ---------------------------------------------------------------- storage */

const { prompt: PROMPT, seed: SEED } = splitPrompt(PROMPT_FILE);

async function readMemory() {
  const saved = await readJSON(MEMORY_FILE, null);
  if (saved && Array.isArray(saved.lines)) return saved.lines;            // an emptied list stays empty
  return SEED.map((text, i) => ({ id: 'seed' + (i + 1), text: cleanLine(text), from: 'seed' }));   // shown, but only written once the user changes something
}
const writeMemory = (lines) => writeJSON(MEMORY_FILE, { lines, updated: new Date().toISOString() });
const dayFile = (date) => `chat/${date}.json`;
const readDay = async (date) => { const d = await readJSON(dayFile(date), null); return d && Array.isArray(d.messages) ? d.messages : []; };
const writeDay = (date, messages) => writeJSON(dayFile(date), { date, messages, updated: new Date().toISOString() });

/* ---------------------------------------------------------------- handler */

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

async function ask(question, context, history, memory) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: CONFIG.coach_model,
      max_tokens: MAX_TOKENS,
      ...(CONFIG.chat_effort ? { output_config: { effort: CONFIG.chat_effort } } : {}),
      system: PROMPT + '\n\n' + memoryBlock(memory),
      messages: buildMessages(history, question, context),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: (j.error && j.error.message) || `Claude said ${r.status}` };
  if (j.stop_reason === 'refusal') return { error: 'Claude declined to answer that one.' };
  const raw = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
  if (!raw) return { error: `empty reply (${j.stop_reason || 'unknown'})` };
  const parsed = parseReply(raw, memory);
  if (!parsed.text) return { error: 'empty reply (only a memory line)' };
  return parsed;
}

const handler = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.APP_KEY) return res.status(503).json({ error: 'APP_KEY not set' });
  if (!keyOk(req)) return res.status(401).json({ error: 'wrong key' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const query = req.query || {};
    const date = String(body.date || query.date || '').slice(0, 10);

    if (req.method === 'GET') {
      if (date && !isDate(date)) return res.status(400).json({ error: 'date missing' });
      return res.status(200).json({ date: date || null, messages: date ? await readDay(date) : [], memory: await readMemory() });
    }

    if (req.method === 'DELETE') {
      if (!isDate(date)) return res.status(400).json({ error: 'date missing' });
      await writeDay(date, []);
      return res.status(200).json({ date, messages: [], memory: await readMemory() });
    }

    if (req.method === 'PUT') {
      const memory = await readMemory();
      if (Array.isArray(body.memory)) {
        const next = mergeMemory(memory, body.memory);
        await writeMemory(next);
        return res.status(200).json({ memory: next });
      }
      const id = body.remember || body.dismiss;
      if (!id || !isDate(date)) return res.status(400).json({ error: 'nothing to change' });
      const messages = await readDay(date);
      const msg = messages.find((m) => m.id === id && m.role === 'assistant' && m.remember);
      if (!msg) return res.status(404).json({ error: 'no such suggestion', messages, memory });
      let next = memory;
      if (body.remember) {
        if (memory.length >= MEMORY_MAX) return res.status(200).json({ error: 'The list is full. Delete a line first.', messages, memory });
        if (!memory.some((l) => sameLine(l.text, msg.remember))) {
          next = [...memory, { id: newId('f'), text: cleanLine(msg.remember), from: 'claude', at: new Date().toISOString() }];
          await writeMemory(next);
        }
        msg.remembered = true;
      } else {
        delete msg.remember;
      }
      await writeDay(date, messages);
      return res.status(200).json({ date, messages, memory: next });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

    if (!isDate(date)) return res.status(400).json({ error: 'date missing' });
    const question = String(body.question || '').replace(/\s+/g, ' ').trim();
    if (!question) return res.status(400).json({ error: 'question missing' });
    if (question.length > QUESTION_MAX) return res.status(400).json({ error: `Keep the question under ${QUESTION_MAX} characters.` });
    const context = JSON.stringify(body.context && typeof body.context === 'object' ? body.context : {});
    if (context.length > CONTEXT_MAX) return res.status(400).json({ error: 'context too large' });

    const [messages, memory] = await Promise.all([readDay(date), readMemory()]);
    if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ date, messages, memory, error: 'ANTHROPIC_API_KEY not set' });

    const reply = await ask(question, context, messages, memory);
    if (reply.error) return res.status(200).json({ date, messages, memory, error: reply.error });

    const at = new Date().toISOString();
    messages.push({ id: newId('q'), role: 'user', text: question, at });
    messages.push({ id: newId('a'), role: 'assistant', text: reply.text, at, ...(reply.remember ? { remember: reply.remember } : {}) });
    const kept = messages.slice(-DAY_MAX);
    while (kept.length && kept[0].role !== 'user') kept.shift();
    await writeDay(date, kept);
    return res.status(200).json({ date, messages: kept, memory });
  } catch (err) {
    console.error('chat failed', err);
    return res.status(500).json({ error: 'chat failed: ' + err.message });
  }
};

module.exports = handler;
module.exports._test = { splitPrompt, parseReply, buildMessages, mergeMemory, memoryBlock, cleanLine };

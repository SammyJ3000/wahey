// Offline tests for api/chat.js: reply parsing, memory rules and the handler. No network: fetch is a stub, no API key needed.
//   node tests/test-api-chat.js
// Uses the local store (tmp/store) under a far-future date and removes what it wrote.
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const PROMPT = path.join(ROOT, 'prompts', 'chat.md');
const realRead = fs.readFileSync;
const load = () => require(path.join(ROOT, 'api', 'chat.js'));
process.env.APP_KEY = 't'; delete process.env.BLOB_READ_WRITE_TOKEN; delete process.env.ANTHROPIC_API_KEY;
const h = load(), T = h._test;
const call = async (method, { body, query, key = 't' } = {}) => { let out = {}; const res = { setHeader() {}, status(c) { out.status = c; return res; }, json(o) { out.body = o; return res; } };
  await h({ method, headers: { 'x-app-key': key }, body, query: query || {} }, res); return out; };
const D = '2099-01-01';
const store = path.join(ROOT, 'tmp/store');
const mine = [path.join(store, 'chat', D + '.json'), path.join(store, 'coach', 'memory.json')];
for (const f of mine) assert(!fs.existsSync(f), 'refusing to run: ' + f + ' already exists');
const chatDirExisted = fs.existsSync(path.join(store, 'chat'));
let n = 0; const ok = (name) => { n++; console.log('ok', name); };
(async () => { try {
  // ---- parsing
  let p = T.parseReply('Keep it light.\n\nHRV is 41 ms.\nREMEMBER: Trains at a leisure centre.');
  assert.deepStrictEqual(p, { text: 'Keep it light.\n\nHRV is 41 ms.', remember: 'Trains at a leisure centre' }); ok('remember line parsed and removed');
  p = T.parseReply('Plain answer with **bold** 41 ms.\n\n\n\nSecond.'); assert.deepStrictEqual(p, { text: 'Plain answer with bold 41 ms.\n\nSecond.', remember: null }); ok('no remember; markdown stripped; blank lines collapsed');
  p = T.parseReply('Answer.\n**REMEMBER:** "Trains fasted"\n\n'); assert.strictEqual(p.remember, 'Trains fasted'); assert.strictEqual(p.text, 'Answer.'); ok('bold/quoted variant, trailing blank lines');
  p = T.parseReply('Remember: sleep matters most.\nSo bed by 11.'); assert.strictEqual(p.remember, null); assert(p.text.startsWith('Remember: sleep')); ok('prose starting "Remember:" stays in the answer');
  p = T.parseReply('REMEMBER: x\nAnswer after.'); assert.strictEqual(p.remember, null); ok('only the last line counts');
  p = T.parseReply('Answer.\nREMEMBER: none'); assert.strictEqual(p.remember, null); ok('"none" ignored');
  p = T.parseReply('Answer.\nREMEMBER: trains three times a week.', [{ text: 'Trains three times a week' }]); assert.strictEqual(p.remember, null); ok('already known is not proposed');
  p = T.parseReply('REMEMBER: this line only'); assert.strictEqual(p.text, ''); ok('only a memory line gives empty text');
  p = T.parseReply('I will remember: that is fine mid-sentence.'); assert.strictEqual(p.remember, null); ok('mid-sentence "remember:" is not a proposal');
  p = T.parseReply('A.\nREMEMBER: ' + 'x'.repeat(400)); assert.strictEqual(p.remember.length, 160); ok('line capped at 160');
  const sp = T.splitPrompt(realRead(PROMPT, 'utf8')); assert.deepStrictEqual(sp.seed, ['Is 34 and works in an office', 'Trains three times a week', 'Goal: get fitter and sleep better']); assert(!/memory-seed/.test(sp.prompt) && !/works in an office/.test(sp.prompt)); ok('seed split from prompt');
  const hist = []; for (let i = 0; i < 20; i++) hist.push({ role: 'user', text: 'q' + i }, { role: 'assistant', text: 'a' + i });
  let ms = T.buildMessages(hist, 'now?', '{"recovery":29}'); assert.strictEqual(ms.length, 13); assert.strictEqual(ms[0].content, 'q14'); assert(ms[12].content.endsWith('Alex asks: now?') && ms[12].content.includes('{"recovery":29}')); ok('history capped to 6 turns, starts on a user turn');
  ms = T.buildMessages([{ role: 'assistant', text: 'orphan' }], 'q', '{}'); assert.strictEqual(ms.length, 1); ok('orphan assistant turn dropped');
  let mm = T.mergeMemory([{ id: 'seed1', text: 'A', from: 'seed' }], [{ id: 'seed1', text: 'A2' }, { text: ' new one. ' }, { text: 'NEW ONE' }, { text: '  ' }, 'plain string']);
  assert.strictEqual(mm.length, 3); assert.strictEqual(mm[0].id, 'seed1'); assert.strictEqual(mm[0].text, 'A2'); assert(mm[0].edited); assert.strictEqual(mm[1].text, 'new one'); assert.strictEqual(mm[1].from, 'user'); ok('mergeMemory keeps ids, dedupes, drops blanks');

  // ---- handler
  let r = await call('GET', { query: { date: D }, key: 'nope' }); assert.strictEqual(r.status, 401); ok('wrong key 401');
  r = await call('GET', { query: { date: D } }); assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.body.messages, []); assert.strictEqual(r.body.memory.length, 3); assert.strictEqual(r.body.memory[0].from, 'seed'); assert(!fs.existsSync(mine[1])); ok('GET: empty day, seeded memory, nothing written');
  r = await call('GET', { query: { date: 'x' } }); assert.strictEqual(r.status, 400); ok('GET bad date 400');
  r = await call('POST', { body: { date: D, question: 'Why is my recovery low?', context: { recovery: 29 } } }); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.error, 'ANTHROPIC_API_KEY not set'); assert.deepStrictEqual(r.body.messages, []); assert(!fs.existsSync(mine[0])); ok('POST without API key: plain error, nothing stored');
  r = await call('POST', { body: JSON.stringify({ date: D, question: '  ' }) }); assert.strictEqual(r.status, 400); ok('POST empty question 400 (string body)');
  r = await call('POST', { body: { date: D, question: 'x'.repeat(601) } }); assert.strictEqual(r.status, 400); ok('POST long question 400');
  r = await call('POST', { body: { date: D, question: 'q', context: { big: 'x'.repeat(30000) } } }); assert.strictEqual(r.status, 400); ok('POST oversized context 400');

  process.env.ANTHROPIC_API_KEY = 'stub-not-a-key';
  let sent = null, next = null;
  global.fetch = async (url, o) => { assert.strictEqual(url, 'https://api.anthropic.com/v1/messages'); sent = JSON.parse(o.body); return next; };
  const reply = (status, j) => ({ ok: status < 300, status, json: async () => j });
  next = reply(529, { error: { message: 'Overloaded' } });
  r = await call('POST', { body: { date: D, question: 'Why is my recovery low?', context: { recovery: 29 } } }); assert.strictEqual(r.body.error, 'Overloaded'); assert(!fs.existsSync(mine[0])); ok('API error: message passed on, nothing stored');
  next = reply(200, { stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '' }] });
  r = await call('POST', { body: { date: D, question: 'q', context: {} } }); assert.strictEqual(r.body.error, 'empty reply (max_tokens)'); ok('empty reply handled');
  next = reply(200, { stop_reason: 'refusal', content: [] });
  r = await call('POST', { body: { date: D, question: 'q', context: {} } }); assert(/declined/.test(r.body.error)); ok('refusal handled');
  next = { ok: false, status: 502, json: async () => { throw new Error('not json'); } };
  r = await call('POST', { body: { date: D, question: 'q', context: {} } }); assert.strictEqual(r.body.error, 'Claude said 502'); ok('non-JSON error body handled');

  next = reply(200, { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Mostly HRV: 41 ms against your usual 47.' }] });
  r = await call('POST', { body: { date: D, question: 'Why is my recovery low?', context: { recovery: 29 } } });
  assert.strictEqual(r.body.messages.length, 2); assert.strictEqual(r.body.messages[1].text, 'Mostly HRV: 41 ms against your usual 47.'); assert(!('remember' in r.body.messages[1]));
  assert.strictEqual(sent.model, JSON.parse(realRead(path.join(ROOT, 'config.json'), 'utf8')).coach_model); assert.strictEqual(sent.max_tokens, 2000); assert(!('output_config' in sent));
  assert(sent.system.includes('- Trains three times a week') && !sent.system.includes('memory-seed')); assert.strictEqual(sent.messages.length, 1); ok('POST stores Q and A; request carries prompt + memory, model from config');
  next = reply(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Keep it light.\nREMEMBER: Trains at a leisure centre' }] });
  r = await call('POST', { body: { date: D, question: 'I train at the leisure centre. Should I go?', context: { recovery: 29 } } });
  assert.strictEqual(r.body.messages.length, 4); const a = r.body.messages[3]; assert.strictEqual(a.remember, 'Trains at a leisure centre'); assert.strictEqual(a.text, 'Keep it light.'); assert.strictEqual(sent.messages.length, 3); assert.strictEqual(sent.messages[1].role, 'assistant');
  assert(!fs.existsSync(mine[1])); ok('proposal stored on the message, memory NOT written');
  r = await call('GET', { query: { date: D } }); assert.strictEqual(r.body.messages.length, 4); ok('conversation persists');
  r = await call('PUT', { body: { date: D, remember: 'nope' } }); assert.strictEqual(r.status, 404); ok('remember unknown id 404');
  r = await call('PUT', { body: { date: D, remember: a.id } }); assert.strictEqual(r.body.memory.length, 4); assert.strictEqual(r.body.memory[3].from, 'claude'); assert.strictEqual(r.body.messages[3].remembered, true); assert(fs.existsSync(mine[1])); ok('tap to remember saves the line');
  r = await call('PUT', { body: { memory: [...r.body.memory.slice(1).map((l) => ({ id: l.id, text: l.id === 'seed2' ? 'Trains 3 times a week' : l.text })), { text: 'No barbell at the gym' }] } });
  assert.deepStrictEqual(r.body.memory.map((l) => l.text), ['Trains 3 times a week', 'Goal: get fitter and sleep better', 'Trains at a leisure centre', 'No barbell at the gym']); ok('PUT replaces list: delete + edit + add');
  r = await call('PUT', { body: { memory: [] } }); assert.deepStrictEqual(r.body.memory, []); r = await call('GET', {}); assert.deepStrictEqual(r.body.memory, []); ok('emptied list stays empty (no reseed)');
  next = reply(200, { content: [{ type: 'text', text: 'Ok.\nREMEMBER: Sore left shoulder' }] });
  r = await call('POST', { body: { date: D, question: 'My left shoulder is sore', context: {} } }); const b = r.body.messages[5];
  assert(sent.system.includes('no saved facts'));
  r = await call('PUT', { body: { date: D, dismiss: b.id } }); assert(!('remember' in r.body.messages[5])); assert.deepStrictEqual(r.body.memory, []); ok('dismiss drops the proposal, saves nothing');
  r = await call('DELETE', { query: { date: D } }); assert.deepStrictEqual(r.body.messages, []); r = await call('GET', { query: { date: D } }); assert.deepStrictEqual(r.body.messages, []); ok('DELETE clears the day');
  r = await call('PATCH', {}); assert.strictEqual(r.status, 405); ok('other methods 405');
  console.log(n + ' checks passed');
} finally {
  for (const f of mine) if (fs.existsSync(f)) fs.unlinkSync(f);
  if (!chatDirExisted && fs.existsSync(path.join(store, 'chat')) && !fs.readdirSync(path.join(store, 'chat')).length) fs.rmdirSync(path.join(store, 'chat'));
} })().catch((e) => { console.error('FAILED', e); process.exit(1); });

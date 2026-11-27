// Offline tests for api/chat.js: reply parsing, memory rules and the handler. No network: fetch is a stub, no API key needed.
//   node --test tests/test-api-chat.js
// Uses the local store (tmp/store) under a far-future date and removes what it wrote.
// The handler tests run in order and share state, as one conversation would.
const { test, describe, before, after } = require('node:test');
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
let chatDirExisted = false;

describe('parsing', () => {
  test('remember line parsed and removed', () => {
    const p = T.parseReply('Keep it light.\n\nHRV is 41 ms.\nREMEMBER: Trains at a leisure centre.');
    assert.deepStrictEqual(p, { text: 'Keep it light.\n\nHRV is 41 ms.', remember: 'Trains at a leisure centre' });
  });
  test('no remember; markdown stripped; blank lines collapsed', () => {
    const p = T.parseReply('Plain answer with **bold** 41 ms.\n\n\n\nSecond.');
    assert.deepStrictEqual(p, { text: 'Plain answer with bold 41 ms.\n\nSecond.', remember: null });
  });
  test('bold/quoted variant, trailing blank lines', () => {
    const p = T.parseReply('Answer.\n**REMEMBER:** "Trains fasted"\n\n');
    assert.strictEqual(p.remember, 'Trains fasted'); assert.strictEqual(p.text, 'Answer.');
  });
  test('prose starting "Remember:" stays in the answer', () => {
    const p = T.parseReply('Remember: sleep matters most.\nSo bed by 11.');
    assert.strictEqual(p.remember, null); assert(p.text.startsWith('Remember: sleep'));
  });
  test('only the last line counts', () => {
    assert.strictEqual(T.parseReply('REMEMBER: x\nAnswer after.').remember, null);
  });
  test('"none" ignored', () => {
    assert.strictEqual(T.parseReply('Answer.\nREMEMBER: none').remember, null);
  });
  test('already known is not proposed', () => {
    assert.strictEqual(T.parseReply('Answer.\nREMEMBER: trains three times a week.', [{ text: 'Trains three times a week' }]).remember, null);
  });
  test('only a memory line gives empty text', () => {
    assert.strictEqual(T.parseReply('REMEMBER: this line only').text, '');
  });
  test('mid-sentence "remember:" is not a proposal', () => {
    assert.strictEqual(T.parseReply('I will remember: that is fine mid-sentence.').remember, null);
  });
  test('line capped at 160', () => {
    assert.strictEqual(T.parseReply('A.\nREMEMBER: ' + 'x'.repeat(400)).remember.length, 160);
  });
  test('seed split from prompt', () => {
    const sp = T.splitPrompt(realRead(PROMPT, 'utf8'));
    assert.deepStrictEqual(sp.seed, ['Is 34 and works in an office', 'Trains three times a week', 'Goal: get fitter and sleep better']);
    assert(!/memory-seed/.test(sp.prompt) && !/works in an office/.test(sp.prompt));
  });
  test('history capped to 6 turns, starts on a user turn', () => {
    const hist = []; for (let i = 0; i < 20; i++) hist.push({ role: 'user', text: 'q' + i }, { role: 'assistant', text: 'a' + i });
    const ms = T.buildMessages(hist, 'now?', '{"recovery":29}');
    assert.strictEqual(ms.length, 13); assert.strictEqual(ms[0].content, 'q14');
    assert(ms[12].content.endsWith('Alex asks: now?') && ms[12].content.includes('{"recovery":29}'));
  });
  test('orphan assistant turn dropped', () => {
    assert.strictEqual(T.buildMessages([{ role: 'assistant', text: 'orphan' }], 'q', '{}').length, 1);
  });
  test('mergeMemory keeps ids, dedupes, drops blanks', () => {
    const mm = T.mergeMemory([{ id: 'seed1', text: 'A', from: 'seed' }], [{ id: 'seed1', text: 'A2' }, { text: ' new one. ' }, { text: 'NEW ONE' }, { text: '  ' }, 'plain string']);
    assert.strictEqual(mm.length, 3); assert.strictEqual(mm[0].id, 'seed1'); assert.strictEqual(mm[0].text, 'A2'); assert(mm[0].edited);
    assert.strictEqual(mm[1].text, 'new one'); assert.strictEqual(mm[1].from, 'user');
  });
});

describe('handler', () => {
  let r, sent = null, next = null, a, b;
  const reply = (status, j) => ({ ok: status < 300, status, json: async () => j });
  const realFetch = global.fetch;

  before(() => {
    for (const f of mine) assert(!fs.existsSync(f), 'refusing to run: ' + f + ' already exists');
    chatDirExisted = fs.existsSync(path.join(store, 'chat'));
  });
  after(() => {
    global.fetch = realFetch;
    for (const f of mine) if (fs.existsSync(f)) fs.unlinkSync(f);
    if (!chatDirExisted && fs.existsSync(path.join(store, 'chat')) && !fs.readdirSync(path.join(store, 'chat')).length) fs.rmdirSync(path.join(store, 'chat'));
  });

  test('wrong key 401', async () => {
    r = await call('GET', { query: { date: D }, key: 'nope' }); assert.strictEqual(r.status, 401);
  });
  test('GET: empty day, seeded memory, nothing written', async () => {
    r = await call('GET', { query: { date: D } }); assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.body.messages, []);
    assert.strictEqual(r.body.memory.length, 3); assert.strictEqual(r.body.memory[0].from, 'seed'); assert(!fs.existsSync(mine[1]));
  });
  test('GET bad date 400', async () => {
    r = await call('GET', { query: { date: 'x' } }); assert.strictEqual(r.status, 400);
  });
  test('POST without API key: plain error, nothing stored', async () => {
    r = await call('POST', { body: { date: D, question: 'Why is my recovery low?', context: { recovery: 29 } } }); assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.error, 'ANTHROPIC_API_KEY not set'); assert.deepStrictEqual(r.body.messages, []); assert(!fs.existsSync(mine[0]));
  });
  test('POST empty question 400 (string body)', async () => {
    r = await call('POST', { body: JSON.stringify({ date: D, question: '  ' }) }); assert.strictEqual(r.status, 400);
  });
  test('POST long question 400', async () => {
    r = await call('POST', { body: { date: D, question: 'x'.repeat(601) } }); assert.strictEqual(r.status, 400);
  });
  test('POST oversized context 400', async () => {
    r = await call('POST', { body: { date: D, question: 'q', context: { big: 'x'.repeat(30000) } } }); assert.strictEqual(r.status, 400);
  });

  test('API error: message passed on, nothing stored', async () => {
    process.env.ANTHROPIC_API_KEY = 'stub-not-a-key';
    global.fetch = async (url, o) => { assert.strictEqual(url, 'https://api.anthropic.com/v1/messages'); sent = JSON.parse(o.body); return next; };
    next = reply(529, { error: { message: 'Overloaded' } });
    r = await call('POST', { body: { date: D, question: 'Why is my recovery low?', context: { recovery: 29 } } });
    assert.strictEqual(r.body.error, 'Overloaded'); assert(!fs.existsSync(mine[0]));
  });
  test('empty reply handled', async () => {
    next = reply(200, { stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '' }] });
    r = await call('POST', { body: { date: D, question: 'q', context: {} } }); assert.strictEqual(r.body.error, 'empty reply (max_tokens)');
  });
  test('refusal handled', async () => {
    next = reply(200, { stop_reason: 'refusal', content: [] });
    r = await call('POST', { body: { date: D, question: 'q', context: {} } }); assert(/declined/.test(r.body.error));
  });
  test('non-JSON error body handled', async () => {
    next = { ok: false, status: 502, json: async () => { throw new Error('not json'); } };
    r = await call('POST', { body: { date: D, question: 'q', context: {} } }); assert.strictEqual(r.body.error, 'Claude said 502');
  });

  test('POST stores Q and A; request carries prompt + memory, model from config', async () => {
    next = reply(200, { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Mostly HRV: 41 ms against your usual 47.' }] });
    r = await call('POST', { body: { date: D, question: 'Why is my recovery low?', context: { recovery: 29 } } });
    assert.strictEqual(r.body.messages.length, 2); assert.strictEqual(r.body.messages[1].text, 'Mostly HRV: 41 ms against your usual 47.'); assert(!('remember' in r.body.messages[1]));
    assert.strictEqual(sent.model, JSON.parse(realRead(path.join(ROOT, 'config.json'), 'utf8')).coach_model); assert.strictEqual(sent.max_tokens, 2000); assert(!('output_config' in sent));
    assert(sent.system.includes('- Trains three times a week') && !sent.system.includes('memory-seed')); assert.strictEqual(sent.messages.length, 1);
  });
  test('proposal stored on the message, memory NOT written', async () => {
    next = reply(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Keep it light.\nREMEMBER: Trains at a leisure centre' }] });
    r = await call('POST', { body: { date: D, question: 'I train at the leisure centre. Should I go?', context: { recovery: 29 } } });
    assert.strictEqual(r.body.messages.length, 4); a = r.body.messages[3]; assert.strictEqual(a.remember, 'Trains at a leisure centre'); assert.strictEqual(a.text, 'Keep it light.');
    assert.strictEqual(sent.messages.length, 3); assert.strictEqual(sent.messages[1].role, 'assistant');
    assert(!fs.existsSync(mine[1]));
  });
  test('conversation persists', async () => {
    r = await call('GET', { query: { date: D } }); assert.strictEqual(r.body.messages.length, 4);
  });
  test('remember unknown id 404', async () => {
    r = await call('PUT', { body: { date: D, remember: 'nope' } }); assert.strictEqual(r.status, 404);
  });
  test('tap to remember saves the line', async () => {
    r = await call('PUT', { body: { date: D, remember: a.id } }); assert.strictEqual(r.body.memory.length, 4); assert.strictEqual(r.body.memory[3].from, 'claude');
    assert.strictEqual(r.body.messages[3].remembered, true); assert(fs.existsSync(mine[1]));
  });
  test('PUT replaces list: delete + edit + add', async () => {
    r = await call('PUT', { body: { memory: [...r.body.memory.slice(1).map((l) => ({ id: l.id, text: l.id === 'seed2' ? 'Trains 3 times a week' : l.text })), { text: 'No barbell at the gym' }] } });
    assert.deepStrictEqual(r.body.memory.map((l) => l.text), ['Trains 3 times a week', 'Goal: get fitter and sleep better', 'Trains at a leisure centre', 'No barbell at the gym']);
  });
  test('emptied list stays empty (no reseed)', async () => {
    r = await call('PUT', { body: { memory: [] } }); assert.deepStrictEqual(r.body.memory, []);
    r = await call('GET', {}); assert.deepStrictEqual(r.body.memory, []);
  });
  test('dismiss drops the proposal, saves nothing', async () => {
    next = reply(200, { content: [{ type: 'text', text: 'Ok.\nREMEMBER: Sore left shoulder' }] });
    r = await call('POST', { body: { date: D, question: 'My left shoulder is sore', context: {} } }); b = r.body.messages[5];
    assert(sent.system.includes('no saved facts'));
    r = await call('PUT', { body: { date: D, dismiss: b.id } }); assert(!('remember' in r.body.messages[5])); assert.deepStrictEqual(r.body.memory, []);
  });
  test('DELETE clears the day', async () => {
    r = await call('DELETE', { query: { date: D } }); assert.deepStrictEqual(r.body.messages, []);
    r = await call('GET', { query: { date: D } }); assert.deepStrictEqual(r.body.messages, []);
  });
  test('other methods 405', async () => {
    r = await call('PATCH', {}); assert.strictEqual(r.status, 405);
  });
});

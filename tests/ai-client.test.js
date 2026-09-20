'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAIClient, classifyError, parseJsonLoose, AIError } = require('../src/ai/client');

const clientWith = (fn, opts = {}) =>
  createAIClient({ apiKey: 'k', model: 'm', timeoutMs: 100, retries: 1, sleep: async () => {}, client: { models: { generateContent: fn } }, ...opts });

test('parses fenced and prose-wrapped JSON', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('Sure! {"a":2} hope that helps'), { a: 2 });
  assert.throws(() => parseJsonLoose(''), (e) => e.code === 'AI_BAD_RESPONSE');
  assert.throws(() => parseJsonLoose('no json here'), (e) => e.code === 'AI_BAD_RESPONSE');
});

test('classifies provider errors', () => {
  assert.equal(classifyError({ status: 429 }).code, 'AI_RATE_LIMIT');
  assert.equal(classifyError({ status: 403, message: 'API key invalid' }).code, 'AI_AUTH');
  assert.equal(classifyError({ status: 400 }).code, 'AI_BAD_REQUEST');
  assert.equal(classifyError({ status: 503 }).code, 'AI_UNAVAILABLE');
  assert.equal(classifyError(new Error('fetch failed')).code, 'AI_UNAVAILABLE');
  assert.ok(classifyError({ status: 500 }).retryable);
  assert.ok(!classifyError({ status: 401 }).retryable);
});

test('retries transient failures once, then succeeds', async () => {
  let n = 0;
  const c = clientWith(async () => { n += 1; if (n === 1) throw Object.assign(new Error('x'), { status: 503 }); return { text: '{"ok":true}' }; });
  assert.deepEqual(await c.generateJSON({ system: 's', text: 't' }), { ok: true });
  assert.equal(n, 2);
});

test('does not retry auth errors and never leaks the provider message', async () => {
  let n = 0;
  const c = clientWith(async () => { n += 1; throw Object.assign(new Error('API key AIzaSECRET is invalid'), { status: 403 }); });
  await assert.rejects(c.generateJSON({ system: 's', text: 't' }), (e) => e.code === 'AI_AUTH' && !/AIzaSECRET/.test(e.message));
  assert.equal(n, 1);
});

test('times out slow calls', async () => {
  const c = clientWith(() => new Promise(() => {}), { retries: 0, timeoutMs: 30 });
  await assert.rejects(c.generateJSON({ system: 's', text: 't' }), (e) => e.code === 'AI_TIMEOUT');
});

test('blocked prompts and empty candidates become typed errors', async () => {
  const blocked = clientWith(async () => ({ promptFeedback: { blockReason: 'SAFETY' } }), { retries: 0 });
  await assert.rejects(blocked.generateJSON({ system: 's', text: 't' }), (e) => e.code === 'AI_BLOCKED');
  const empty = clientWith(async () => ({ candidates: [] }), { retries: 0 });
  await assert.rejects(empty.generateJSON({ system: 's', text: 't' }), (e) => e instanceof AIError && e.code === 'AI_BAD_RESPONSE');
});

test('reads text from candidates when .text is absent, and sends image parts', async () => {
  let seen;
  const c = clientWith(async (req) => { seen = req; return { candidates: [{ content: { parts: [{ text: '{"v":1}' }] } }] }; });
  const out = await c.generateJSON({ system: 'sys', text: 'hello', image: { mimeType: 'image/png', base64: 'AAAA' } });
  assert.deepEqual(out, { v: 1 });
  assert.equal(seen.contents[0].parts[1].inlineData.mimeType, 'image/png');
  assert.equal(seen.config.responseMimeType, 'application/json');
});

test('unconfigured client reports so and does not load the SDK', () => {
  const c = createAIClient({ apiKey: '', model: 'm' });
  assert.equal(c.isConfigured(), false);
});

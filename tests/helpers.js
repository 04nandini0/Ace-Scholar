'use strict';

const { loadConfig } = require('../src/config');
const { loadKnowledge } = require('../src/knowledge');
const { createApi } = require('../src/api');
const { createAIClient } = require('../src/ai/client');

const silentLog = { warn() {}, error() {}, log() {} };

/** A syntactically valid-looking PNG/JPEG payload (magic bytes + padding). */
function fakeImage(type = 'png', size = 600) {
  const magic = {
    png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    jpeg: [0xff, 0xd8, 0xff, 0xe0],
  }[type];
  const buf = Buffer.concat([Buffer.from(magic), Buffer.alloc(size, 7)]);
  const mime = type === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/**
 * Build an API whose Gemini client is replaced by `handler(request)`.
 * `handler` may return an object (serialised as the model's JSON), or throw.
 */
function makeApi({ handler = null, env = {} } = {}) {
  const config = loadConfig({ AI_RETRIES: '0', ...env });
  const knowledge = loadKnowledge();
  const calls = [];
  const client = handler
    ? {
        models: {
          async generateContent(req) {
            calls.push(req);
            const out = await handler(req);
            return { text: typeof out === 'string' ? out : JSON.stringify(out) };
          },
        },
      }
    : null;
  const ai = createAIClient({
    apiKey: handler ? 'test-key' : '',
    model: 'test-model',
    timeoutMs: 500,
    retries: 0,
    client,
    sleep: async () => {},
  });
  const api = createApi({ config, knowledge, ai, log: silentLog });
  return { api, calls, knowledge, config };
}

module.exports = { makeApi, fakeImage, silentLog };

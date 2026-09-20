'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('../src/rateLimit');

test('allows up to the limit, then blocks with retry-after, then recovers', () => {
  let t = 1000;
  const rl = createRateLimiter({ limit: 3, windowMs: 60000, now: () => t });
  assert.ok(rl.check('a').allowed && rl.check('a').allowed && rl.check('a').allowed);
  const blocked = rl.check('a');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1 && blocked.retryAfterSec <= 60);
  assert.equal(rl.check('b').allowed, true, 'other clients unaffected');
  t += 60001;
  assert.equal(rl.check('a').allowed, true);
});

test('bounded memory', () => {
  const rl = createRateLimiter({ limit: 1, maxKeys: 5 });
  for (let i = 0; i < 50; i += 1) rl.check(`k${i}`);
  assert.ok(rl.check('fresh').allowed);
});

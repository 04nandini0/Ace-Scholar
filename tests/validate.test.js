'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');
const platforms = require('../src/platforms');
const { validateRouteRequest } = require('../src/validate');
const { fakeImage } = require('./helpers');

const config = loadConfig({});
const check = (body) => validateRouteRequest(body, { config, platforms });

test('accepts a normal question and defaults the platform', () => {
  const r = check({ question: '  DBMS   attendance ' });
  assert.equal(r.ok, true);
  assert.equal(r.value.question, 'DBMS attendance');
  assert.equal(r.value.platform, 'digicampus');
});

test('rejects non-object bodies, unknown platforms, non-string questions', () => {
  assert.equal(check(undefined).code, 'INVALID_REQUEST');
  assert.equal(check([]).code, 'INVALID_REQUEST');
  assert.equal(check({ platform: 'blackboard', question: 'x y' }).code, 'UNKNOWN_PLATFORM');
  assert.equal(check({ question: 42 }).code, 'INVALID_QUESTION');
});

test('rejects empty, whitespace-only and punctuation-only input', () => {
  assert.equal(check({ question: '' }).code, 'EMPTY_INPUT');
  assert.equal(check({ question: '   ' }).code, 'EMPTY_INPUT');
  assert.equal(check({ question: '?!?!' }).code, 'EMPTY_INPUT');
});

test('rejects overlong questions', () => {
  assert.equal(check({ question: 'a'.repeat(501) }).code, 'QUESTION_TOO_LONG');
  assert.equal(check({ question: 'a'.repeat(500) }).ok, true);
});

test('strips control characters', () => {
  assert.equal(check({ question: 'DBMS\u0000\u0007 marks\n\nplease' }).value.question, 'DBMS marks please');
});

test('accepts an image on its own, and sniffs the real type', () => {
  const r = check({ image: fakeImage('png') });
  assert.equal(r.ok, true);
  assert.equal(r.value.image.mimeType, 'image/png');
  assert.equal(r.value.question, '');
  // declared jpeg but bytes are png -> trust the bytes
  const lie = fakeImage('png').replace('data:image/png', 'data:image/jpeg');
  assert.equal(check({ image: lie }).value.image.mimeType, 'image/png');
});

test('rejects bad images', () => {
  assert.equal(check({ image: 'not-a-data-url' }).code, 'INVALID_IMAGE');
  assert.equal(check({ image: 'data:image/gif;base64,R0lGODlh' }).code, 'INVALID_IMAGE');
  assert.equal(check({ image: 'data:image/png;base64,@@@@' }).code, 'INVALID_IMAGE');
  const tiny = 'data:image/png;base64,' + Buffer.from('abc').toString('base64');
  assert.equal(check({ image: tiny }).code, 'INVALID_IMAGE');
  const notImage = 'data:image/png;base64,' + Buffer.alloc(500, 1).toString('base64');
  assert.equal(check({ image: notImage }).code, 'INVALID_IMAGE');
});

test('rejects oversized images', () => {
  const small = loadConfig({});
  const cfg = { ...small, maxImageBytes: 1000 };
  const r = validateRouteRequest({ image: fakeImage('png', 5000) }, { config: cfg, platforms });
  assert.equal(r.code, 'IMAGE_TOO_LARGE');
});

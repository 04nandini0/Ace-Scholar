'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseQuery } = require('../src/query');

test('extracts intent and course from the flagship example', () => {
  const r = parseQuery('Where can I find my DBMS attendance?');
  assert.equal(r.primary, 'attendance');
  assert.equal(r.course, 'DBMS');
  assert.equal(r.searchMode, false);
});

test('handles phrasing variants', () => {
  assert.equal(parseQuery('Where are my DBMS attendance records?').course, 'DBMS');
  assert.equal(parseQuery('attendance in operating systems').course, 'Operating Systems');
  assert.equal(parseQuery('CS 101 marks').course, 'CS 101');
  assert.equal(parseQuery('attendance on Moodle for DSA').course, 'DSA');
});

test('no course is invented when none is present', () => {
  for (const q of ["Where's my attendance?", 'Find my notes', 'Where is my attendance for the semester']) {
    assert.equal(parseQuery(q).course, null, q);
  }
});

test('detects universal-search requests', () => {
  const r = parseQuery('Show me everything related to DBMS');
  assert.equal(r.searchMode, true);
  assert.equal(r.course, 'DBMS');
  assert.equal(parseQuery('DBMS').searchMode, true);
  assert.equal(parseQuery('everything about attendance').course, null);
});

test('flags faculty-side actions', () => {
  assert.equal(parseQuery('How do I upload marks?').facultyAction, true);
  assert.equal(parseQuery('upload assignment').facultyAction, false);
  assert.equal(parseQuery('Where are my marks?').facultyAction, false);
});

test('reports platform mentions', () => {
  assert.equal(parseQuery('attendance on Moodle').platformMention, 'moodle');
  assert.equal(parseQuery('my digi campus fees').platformMention, 'digicampus');
  assert.equal(parseQuery('moodle or canvas attendance').platformMention, null);
});

test('flags ambiguity between close intents', () => {
  const r = parseQuery('assignment marks');
  assert.ok(r.alsoLikely.length >= 1);
});

test('empty / punctuation-only input has no content', () => {
  assert.equal(parseQuery('!!! ???').hasContent, false);
  assert.equal(parseQuery('').primary, null);
});

test('greetings are not mistaken for courses', () => {
  assert.equal(parseQuery('hello').course, null);
});

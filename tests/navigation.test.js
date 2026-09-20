'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadKnowledge } = require('../src/knowledge');
const platforms = require('../src/platforms');
const { buildRoute, universalSearch, resolveEntry } = require('../src/navigation');

const kb = loadKnowledge();
const labels = (route) => route.breadcrumb.map((n) => n.label);

test('database integrity: every platform is covered and entries are well-formed', () => {
  assert.deepEqual(kb.warnings, []);
  for (const p of platforms.all()) {
    const entries = kb.entriesFor(p.id);
    assert.ok(entries.length >= 10, `${p.id} has routes`);
    const intents = entries.map((e) => e.intent);
    assert.equal(new Set(intents).size, intents.length, `${p.id} intents are unique`);
    for (const e of entries) {
      assert.ok(Array.isArray(e.path) && e.path.length, `${p.id}/${e.intent} has a path`);
      assert.ok(['course', 'global', 'none'].includes(e.scope), `${p.id}/${e.intent} scope`);
      if (e.scope === 'course') assert.ok(e.path.includes('{course}'), `${p.id}/${e.intent} course placeholder`);
      if (e.course_step !== undefined) assert.ok(e.course_step < e.verified_route.length);
    }
  }
});

test('original verified routes are preserved verbatim', () => {
  const route = kb.find('moodle', 'attendance').verified_route;
  assert.deepEqual(route.map((s) => s.title), [
    'Log in to Moodle', 'Go to My Courses', 'Find Attendance Block', 'View Attendance Report',
  ]);
  assert.equal(kb.find('canvas', 'assignments').verified_route.length, 5);
  assert.equal(kb.find('digicampus', 'fees').verified_route[1].title, 'Go to Finance/Payments');
});

test('Moodle DBMS attendance builds Moodle > Dashboard > My courses > DBMS > Attendance', () => {
  const r = buildRoute({ platformId: 'moodle', entry: kb.find('moodle', 'attendance'), course: 'DBMS' });
  assert.deepEqual(labels(r), ['Moodle', 'Dashboard', 'My courses', 'DBMS', 'Attendance']);
  assert.equal(r.breadcrumb.at(-1).final, true);
  assert.match(r.steps[1].description, /DBMS/);
  assert.equal(r.steps.length, 4);
});

test('global-scope routes append the course as the row to look for', () => {
  const r = buildRoute({ platformId: 'digicampus', entry: kb.find('digicampus', 'attendance'), course: 'DBMS' });
  assert.deepEqual(labels(r), ['DigiCampus', 'Academics', 'Attendance', 'DBMS']);
  assert.match(r.steps[3].description, /DBMS/);
});

test('course-scoped route without a course gives a placeholder and a tip', () => {
  const r = buildRoute({ platformId: 'canvas', entry: kb.find('canvas', 'attendance'), course: null });
  assert.equal(r.breadcrumb[2].label, 'Your course');
  assert.equal(r.breadcrumb[2].placeholder, true);
  assert.ok(r.notes.some((n) => /course name/i.test(n)));
});

test('a route that has no course step still tells the user to open the course first', () => {
  const r = buildRoute({ platformId: 'moodle', entry: kb.find('moodle', 'messaging'), course: 'DBMS' });
  assert.ok(r.notes.some((n) => /DBMS/.test(n)));
});

test('screenshot on the dashboard marks login done and highlights the dashboard', () => {
  const r = buildRoute({
    platformId: 'moodle', entry: kb.find('moodle', 'attendance'), course: 'DBMS',
    screen: { screenType: 'dashboard', courseMatches: null, isAcademic: true },
  });
  assert.equal(r.steps[0].done, true);
  assert.equal(r.steps[1].done, false);
  assert.equal(r.breadcrumb.find((n) => n.here).label, 'Dashboard');
});

test('screenshot already on the right course skips course selection', () => {
  const r = buildRoute({
    platformId: 'moodle', entry: kb.find('moodle', 'attendance'), course: 'DBMS',
    screen: { screenType: 'course_page', courseMatches: true, isAcademic: true },
  });
  assert.deepEqual(r.steps.map((s) => s.done), [true, true, false, false]);
  assert.equal(r.breadcrumb.find((n) => n.here).label, 'DBMS');
});

test('screenshot on a different course does not skip anything and warns', () => {
  const r = buildRoute({
    platformId: 'moodle', entry: kb.find('moodle', 'attendance'), course: 'DBMS',
    screen: { screenType: 'course_page', courseMatches: false, isAcademic: true },
  });
  assert.equal(r.steps[1].done, false);
  assert.ok(r.notes.some((n) => /different course/i.test(n)));
});

test('screenshot already at the destination is recognised', () => {
  const r = buildRoute({
    platformId: 'canvas', entry: kb.find('canvas', 'marks'), course: null,
    screen: { screenType: 'grades', courseMatches: null, isAcademic: true },
  });
  assert.equal(r.atDestination, true);
  assert.equal(r.steps.filter((s) => !s.done).length, 1);
});

test('login screen leaves every step pending', () => {
  const r = buildRoute({
    platformId: 'moodle', entry: kb.find('moodle', 'attendance'), course: null,
    screen: { screenType: 'login', courseMatches: null, isAcademic: true },
  });
  assert.ok(r.steps.every((s) => !s.done));
});

test('related-intent fallback: timetable <-> calendar', () => {
  assert.equal(resolveEntry(kb, 'moodle', 'timetable').intentUsed, 'calendar');
  assert.equal(resolveEntry(kb, 'digicampus', 'calendar').intentUsed, 'timetable');
  assert.equal(resolveEntry(kb, 'moodle', 'fees'), null);
});

test('universal search groups categories and reports unmapped ones honestly', () => {
  const s = universalSearch({ knowledge: kb, platformId: 'moodle', course: 'DBMS' });
  assert.deepEqual(s.groups.map((g) => g.category), [
    'Course', 'Attendance', 'Assignments', 'Marks', 'Materials', 'Exams', 'Announcements',
  ]);
  const byCat = Object.fromEntries(s.groups.map((g) => [g.category, g.status]));
  assert.equal(byCat.Announcements, 'unmapped'); // Moodle has no verified announcements route
  assert.equal(byCat.Materials, 'mapped');
  assert.equal(s.mappedCount, 6);

  const d = universalSearch({ knowledge: kb, platformId: 'digicampus', course: 'DBMS' });
  assert.equal(d.groups.find((g) => g.category === 'Materials').status, 'unmapped');
  const c = universalSearch({ knowledge: kb, platformId: 'canvas', course: 'DBMS' });
  assert.equal(c.mappedCount, 7);
});

test('keyword fallback still uses the original task_keywords', () => {
  const hit = kb.matchKeywords('moodle', 'how to turn in task');
  assert.equal(hit.entry.intent, 'assignments');
  assert.equal(kb.matchKeywords('moodle', 'banana smoothie recipe'), null);
});

test('a malformed database entry is skipped, not fatal', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const file = path.join(os.tmpdir(), `ace-bad-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify({ moodle: [{ intent: 'x' }, kb.entriesFor('moodle')[0]] }));
  const bad = loadKnowledge(file);
  assert.equal(bad.entriesFor('moodle').length, 1);
  assert.ok(bad.warnings.some((w) => /malformed/i.test(w)));
  fs.unlinkSync(file);
  const missing = loadKnowledge('/nonexistent/db.json');
  assert.ok(missing.warnings.length > 0);
});

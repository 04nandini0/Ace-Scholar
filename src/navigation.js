'use strict';

const platforms = require('./platforms');
const { RELATED, SEARCH_CATEGORIES, labelFor } = require('./intents');

const LOGIN_RE = /\blog ?in\b/i;

/** Screen types the vision model may report, and which intents they already satisfy. */
const SCREEN_TYPES = [
  'login', 'dashboard', 'course_list', 'course_page', 'grades', 'assignments',
  'calendar', 'inbox', 'other', 'unknown',
];
const SCREEN_SATISFIES = {
  grades: ['marks'],
  assignments: ['assignments'],
  calendar: ['calendar', 'timetable'],
  inbox: ['messaging'],
};
const LOGGED_IN_SCREENS = new Set([
  'dashboard', 'course_list', 'course_page', 'grades', 'assignments', 'calendar', 'inbox',
]);

/**
 * Pick the verified entry for an intent, falling back to a closely related
 * intent (e.g. timetable <-> calendar) when the platform lacks a direct route.
 * @returns {{entry: object, intentUsed: string, viaRelated: boolean}|null}
 */
function resolveEntry(knowledge, platformId, intentId) {
  const direct = knowledge.find(platformId, intentId);
  if (direct) return { entry: direct, intentUsed: intentId, viaRelated: false };
  for (const alt of RELATED[intentId] || []) {
    const entry = knowledge.find(platformId, alt);
    if (entry) return { entry, intentUsed: alt, viaRelated: true };
  }
  return null;
}

function buildBreadcrumb(platform, entry, course) {
  const nodes = [{ label: platform.name, kind: 'platform' }];
  for (const token of entry.path || []) {
    if (token === '{course}') {
      nodes.push({ label: course || 'Your course', kind: 'course', placeholder: !course });
    } else {
      nodes.push({ label: token, kind: 'nav' });
    }
  }
  const last = nodes[nodes.length - 1];
  if (last.kind === 'nav') last.kind = 'target';

  // Course-independent screens (e.g. a global Gradebook) still list courses:
  // show the requested course as the final "row to look for".
  if (entry.scope === 'global' && course) nodes.push({ label: course, kind: 'course' });

  nodes[nodes.length - 1].final = true;
  return nodes;
}

/**
 * Build a structured route from a verified database entry.
 *
 * @param {object} args
 * @param {object} args.knowledge  loaded knowledge base
 * @param {string} args.platformId
 * @param {object} args.entry      database entry
 * @param {string|null} args.course  course name taken from the user's own words
 * @param {{screenType?:string, courseMatches?:boolean|null, isAcademic?:boolean}|null} args.screen
 */
function buildRoute({ platformId, entry, course = null, screen = null }) {
  const platform = platforms.get(platformId);
  const intentId = entry.intent || 'unknown';
  const notes = [];

  const steps = entry.verified_route.map((s) => ({ title: s.title, description: s.description, done: false }));
  const breadcrumb = buildBreadcrumb(platform, entry, course);
  const hasCourseStep = Number.isInteger(entry.course_step) && steps[entry.course_step];

  if (course && hasCourseStep) {
    steps[entry.course_step].description += ` Look for \u201C${course}\u201D.`;
  } else if (course && entry.scope === 'course') {
    notes.push(`Open \u201C${course}\u201D first \u2014 this feature lives inside each course.`);
  } else if (!course && entry.scope === 'course' && intentId !== 'course') {
    notes.push('Tip: add your course name (for example \u201CDBMS attendance\u201D) and the route will be tailored to it.');
  }
  if (entry.note) notes.push(entry.note);

  let hereIndex = null;
  let atDestination = false;

  if (screen && screen.screenType) {
    const type = screen.screenType;
    const loggedIn = LOGGED_IN_SCREENS.has(type) || (type === 'other' && screen.isAcademic);
    if (loggedIn && steps[0] && LOGIN_RE.test(steps[0].title)) steps[0].done = true;

    if (type === 'dashboard' || type === 'course_list') {
      const i = breadcrumb.findIndex((n) => /dashboard|global navigation|my courses/i.test(n.label));
      hereIndex = i >= 0 ? i : 0;
    } else if (type === 'course_page') {
      const i = entry.scope === 'course' ? breadcrumb.findIndex((n) => n.kind === 'course') : -1;
      if (i >= 0 && screen.courseMatches !== false) {
        hereIndex = i;
        if (hasCourseStep) for (let s = 1; s <= entry.course_step && s < steps.length - 1; s += 1) steps[s].done = true;
      } else if (entry.scope === 'course' && screen.courseMatches === false) {
        notes.push('The course page on your screen looks like a different course, so start from the course list.');
      }
    }

    if ((SCREEN_SATISFIES[type] || []).includes(intentId)) {
      atDestination = true;
      hereIndex = breadcrumb.length - 1;
      steps.forEach((s, i) => { if (i < steps.length - 1) s.done = true; });
      notes.push('This screen already looks like the page you are after \u2014 check it before following the rest.');
    }
  }

  if (hereIndex !== null && breadcrumb[hereIndex]) breadcrumb[hereIndex].here = true;

  return {
    intent: { id: intentId, label: labelFor(intentId) },
    platform: { id: platform.id, name: platform.name },
    course,
    scope: entry.scope || 'none',
    derived: Boolean(entry.derived),
    breadcrumb,
    steps,
    notes,
    atDestination,
  };
}

/**
 * Universal academic search: everything the platform's verified routes can
 * reach for one course, grouped by category. Categories with no verified
 * route are reported as unmapped instead of being invented.
 */
function universalSearch({ knowledge, platformId, course }) {
  const platform = platforms.get(platformId);
  const groups = SEARCH_CATEGORIES.map(({ intent, label }) => {
    const entry = knowledge.find(platformId, intent);
    if (!entry) {
      return { category: label, intent, status: 'unmapped', route: null };
    }
    return { category: label, intent, status: 'mapped', route: buildRoute({ platformId, entry, course }) };
  });
  const mapped = groups.filter((g) => g.status === 'mapped').length;
  return {
    platform: { id: platform.id, name: platform.name },
    course,
    groups,
    mappedCount: mapped,
    totalCount: groups.length,
  };
}

module.exports = { buildRoute, universalSearch, resolveEntry, SCREEN_TYPES };

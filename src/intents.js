'use strict';

/**
 * Platform-independent intents. Each platform decides (through database.json)
 * which intents it has a verified route for.
 *
 * `terms` are [regex, weight] pairs matched against lower-cased text.
 */
const INTENTS = [
  {
    id: 'attendance',
    label: 'Attendance',
    terms: [
      [/\battendance\b/, 3],
      [/\b(?:present|absent|roll ?call|bunk(?:ed|ing)?|shortage|detained)\b/, 2],
      [/\battend(?:ed|ing)?\b/, 1.5],
    ],
  },
  {
    id: 'assignments',
    label: 'Assignments',
    terms: [
      [/\bassignments?\b/, 3],
      [/\b(?:homework|hw|submissions?|turn in|hand in)\b/, 2.5],
      [/\bsubmit(?:ted|ting)?\b/, 2],
      [/\bupload(?:ing)?\b/, 1.2],
    ],
  },
  {
    id: 'marks',
    label: 'Marks & grades',
    terms: [
      [/\b(?:marks?|grades?|grading|gradebook|results?|scores?|scorecard|gpa|cgpa|sgpa|report card|transcript|marksheet)\b/, 3],
    ],
  },
  {
    id: 'materials',
    label: 'Notes & materials',
    terms: [
      [/\b(?:notes?|materials?|resources?|slides?|ppts?|pdfs?|lectures?|readings?|study|textbooks?|content|files?|modules?|downloads?|videos?)\b/, 2.5],
    ],
  },
  {
    id: 'exams',
    label: 'Exams & quizzes',
    terms: [
      [/\b(?:exams?|examinations?|quiz(?:zes)?|tests?|mid ?sems?|end ?sems?|internals?|viva|hall ticket|admit card)\b/, 3],
    ],
  },
  {
    id: 'announcements',
    label: 'Announcements',
    terms: [[/\b(?:announcements?|notices?|news|circulars?|updates?|notifications?|alerts?)\b/, 3]],
  },
  {
    id: 'syllabus',
    label: 'Syllabus',
    terms: [[/\b(?:syllabus|syllabi|course outline|course plan|curriculum|course structure)\b/, 3]],
  },
  {
    id: 'fees',
    label: 'Fees & payments',
    terms: [
      [/\b(?:fees?|tuition|payments?|dues|challan|fee receipt)\b/, 3],
      [/\bpay\b/, 2.5],
    ],
  },
  {
    id: 'timetable',
    label: 'Timetable',
    terms: [
      [/\b(?:time ?table|class schedule|routine|periods?|class timings?)\b/, 3],
      [/\bschedule\b/, 2],
    ],
  },
  {
    id: 'calendar',
    label: 'Calendar & deadlines',
    terms: [
      [/\b(?:calendar|deadlines?|upcoming|events?)\b/, 3],
      [/\bschedule\b/, 1.5],
    ],
  },
  {
    id: 'registration',
    label: 'Course registration',
    terms: [[/\b(?:regist(?:er|ration|ering)|enrol(?:l|lment|ling)?|electives?)\b/, 3]],
  },
  {
    id: 'messaging',
    label: 'Message faculty',
    terms: [
      [/\b(?:message|messages|contact|email|mail|dm|write to|reach|talk to|chat with)\b/, 2],
      [/\b(?:professors?|profs?|faculty|teachers?|instructors?|lecturers?|mentor|sir|madam)\b/, 2],
    ],
  },
  {
    id: 'forums',
    label: 'Forums & discussions',
    terms: [[/\b(?:forums?|discussions?|discussion board|threads?)\b/, 3]],
  },
  {
    id: 'participants',
    label: 'Classmates & participants',
    terms: [[/\b(?:participants?|classmates?|class list|course members|enrolled students|batchmates?|people)\b/, 3]],
  },
  {
    id: 'course',
    label: 'Course page',
    terms: [
      [/\b(?:my courses|course page|open (?:the |my )?course|enrolled courses|my subjects|subjects)\b/, 2.5],
      [/\bcourses?\b/, 1.5],
    ],
  },
];

const BY_ID = new Map(INTENTS.map((i) => [i.id, i]));

/** Minimum weighted score before an intent is trusted. */
const MIN_SCORE = 2;
/** A runner-up scoring at least this share of the leader makes the query ambiguous. */
const AMBIGUITY_RATIO = 0.7;

/** When a platform has no route for an intent, these are the closest alternatives to try. */
const RELATED = {
  timetable: ['calendar'],
  calendar: ['timetable'],
};

/** Sections shown by universal academic search, in display order. */
const SEARCH_CATEGORIES = [
  { intent: 'course', label: 'Course' },
  { intent: 'attendance', label: 'Attendance' },
  { intent: 'assignments', label: 'Assignments' },
  { intent: 'marks', label: 'Marks' },
  { intent: 'materials', label: 'Materials' },
  { intent: 'exams', label: 'Exams' },
  { intent: 'announcements', label: 'Announcements' },
];

function normalize(text) {
  return String(text || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ranked list of {id, score} for every intent with a non-zero score. */
function scoreIntents(text) {
  const norm = normalize(text);
  const ranked = [];
  for (const intent of INTENTS) {
    let score = 0;
    for (const [re, weight] of intent.terms) if (re.test(norm)) score += weight;
    if (score > 0) ranked.push({ id: intent.id, score });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

/** True when a single word already signals an intent (used to strip it from course names). */
function isIntentWord(word) {
  const w = normalize(word);
  return INTENTS.some((intent) => intent.terms.some(([re]) => re.test(w)));
}

function labelFor(id) {
  return BY_ID.has(id) ? BY_ID.get(id).label : id;
}

function isKnownIntent(id) {
  return BY_ID.has(id);
}

module.exports = {
  INTENTS,
  MIN_SCORE,
  AMBIGUITY_RATIO,
  SEARCH_CATEGORIES,
  RELATED,
  normalize,
  scoreIntents,
  isIntentWord,
  labelFor,
  isKnownIntent,
};

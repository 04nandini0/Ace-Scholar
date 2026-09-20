'use strict';

/**
 * A platform profile describes everything that is specific to one academic
 * platform *except* its routes (those live in database.json, keyed by `id`).
 *
 * To add a new platform:
 *   1. Create a profile like this one in src/platforms/.
 *   2. Register it in src/platforms/index.js.
 *   3. Add a top-level key with the same `id` to database.json.
 */
module.exports = {
  id: 'moodle',
  name: 'Moodle',
  // Regex sources used to spot the platform name inside a question.
  aliases: ['moodle'],
  tagline: 'Course-centric LMS',
  examples: [
    'Where can I find my DBMS attendance?',
    'Show me everything related to DBMS',
    'Where are my marks?',
    'Find my notes',
  ],
  // Visual / textual cues the vision model may look for. These are hints,
  // not guarantees: institutions customise themes heavily.
  screenCues: [
    "Top bar with 'Home', 'Dashboard', 'My courses' links and a user menu",
    "Dashboard blocks such as 'Timeline', 'Calendar' or 'Course overview'",
    "Course page with tabs such as 'Course', 'Participants', 'Grades' and a course index drawer",
    "Activity icons for 'Assignment', 'Quiz', 'Forum', 'Attendance'",
  ],
};

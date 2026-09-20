'use strict';

module.exports = {
  id: 'digicampus',
  name: 'DigiCampus',
  aliases: ['digi\\s*-?\\s*campus'],
  tagline: 'ERP-style student portal',
  examples: [
    "Where's my attendance?",
    'Show me everything related to DBMS',
    'Find my notes',
    'Where are my marks?',
  ],
  // DigiCampus layouts differ per institution, so cues are label-based.
  screenCues: [
    "Main menu tabs such as 'Academics' or 'Student ERP'",
    "Modules labelled 'Attendance' / 'My Attendance', 'Gradebook' / 'My Grades', 'My Timetable'",
    "Finance area with 'Fee Payments' and a 'Course Registration' section",
    "Branding or URL containing 'DigiCampus' (if visible)",
  ],
};

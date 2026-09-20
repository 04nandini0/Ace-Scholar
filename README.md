🎓 ACE-Scholar

Your Academic Compass

ACE-Scholar is an AI-powered academic navigation assistant that helps students find information inside complex academic platforms such as Moodle, DigiCampus, and Canvas.

Instead of manually searching through multiple menus, students can ask ACE-Scholar what they need in natural language or upload a screenshot of the screen they are currently viewing.

The system understands the request, identifies the relevant academic intent and platform, finds a verified navigation route, and presents clear step-by-step instructions.

Student Question / Screenshot
            ↓
      Query Understanding
            ↓
       Intent Detection
            ↓
      Platform Detection
            ↓
       Target Detection
            ↓
     Navigation Engine
            ↓
   Verified Route / Search /
   Clarification / Alternative
            ↓
       Student Guidance

---

🚀 Why ACE-Scholar?

Academic institutions often use multiple digital platforms for different parts of student life.

A student may need to navigate through:

- Moodle for courses and attendance
- DigiCampus for academic information
- Canvas for course content and activities
- Institution-specific menus and course structures

The problem is not always finding the information — it is knowing where to look for it.

ACE-Scholar turns natural-language questions into actionable navigation guidance.

Example

Instead of searching through menus:

«"Where can I find my DBMS attendance?"»

ACE-Scholar can understand:

Intent      → Attendance
Platform    → Moodle
Course      → DBMS
Destination → Attendance

and produce a route such as:

Moodle
  → Dashboard
  → My Courses
  → DBMS
  → Attendance

---

✨ Core Features

💬 1. Natural-Language Academic Navigation

Students can ask questions in normal language.

Examples:

Where can I find my attendance?

Where are my DBMS assignment marks?

Where can I see my exam results?

Where can I find my course materials?

Where is the enrollment form?

Show me everything related to DBMS.

The navigation pipeline converts a question into:

Query
  → Intent
  → Platform
  → Target
  → Navigation Path
  → Instructions

Clear queries can be resolved locally using the application's verified navigation knowledge, allowing fast responses without unnecessary AI calls.

When the rules cannot confidently determine the user's intent, the Gemini-powered AI layer can assist with interpretation.

---

📸 2. Screenshot-Based Navigation Assistance

Students can upload a screenshot of the academic platform they are currently viewing.

For example:

«"I am on this screen. Where can I find my attendance?"»

ACE-Scholar uses Gemini vision capabilities to analyse the screenshot and understand relevant screen information.

The system can determine:

- Which supported platform is visible
- What screen the student appears to be viewing
- What the student is trying to find
- Which part of the navigation route has already been completed
- What steps remain

Instead of repeatedly showing the entire route, the interface can indicate where the student currently is and guide them through the remaining steps.

Example:

Moodle
  ✓ Dashboard
  ✓ My Courses
  → DBMS
  → Attendance

The application also validates uploaded images for:

- Supported image type
- Actual file content
- File size
- Corrupted images
- Unsupported or irrelevant images

If the system cannot confidently understand the screenshot, it communicates the uncertainty instead of pretending to know.

---

🔎 3. Universal Academic Search

ACE-Scholar supports broader academic searches such as:

«"Show me everything related to DBMS."»

Search results can be organized into categories such as:

- Courses
- Attendance
- Assignments
- Marks
- Materials
- Exams
- Announcements

Only available and verified navigation information is presented.

Areas that are not mapped for a platform are explicitly labelled rather than being invented.

---

🧭 4. Visual Navigation

Navigation results are designed to be easy to follow.

The interface can provide:

Breadcrumb Navigation

Moodle › Dashboard › My Courses › DBMS › Attendance

Numbered Steps

1. Open Dashboard.
2. Select My Courses.
3. Open DBMS.
4. Select Attendance.

Route Progress

The interface can show completed steps and indicate the student's current location.

Additional Guidance

Responses can include:

- Understanding of the user's request
- Detected screen
- Notices
- Warnings
- Alternative routes
- Confidence information

A copy-steps action is also available for convenient reuse.

---

🌐 Supported Platforms

ACE-Scholar currently provides platform-specific navigation support for:

Platform| Support
Moodle| ✅
DigiCampus| ✅
Canvas| ✅

Each platform has its own navigation profile and route data.

This separation makes the system easier to maintain and extend as additional academic platforms are introduced.

---

🧠 Intelligent Navigation Architecture

ACE-Scholar uses a layered navigation architecture.

User Input
    │
    ├── Text Question
    │
    └── Screenshot + Question
            │
            ▼
      Input Validation
            │
            ▼
      Query Processing
            │
            ▼
      Intent Detection
            │
            ▼
     Platform Detection
            │
            ▼
       Target Detection
            │
            ▼
    Navigation Knowledge
            │
            ▼
     Route Resolution
            │
      ┌─────┼──────────┐
      ▼     ▼          ▼
    Route  Search   Clarify
      │
      ▼
 Structured Response
      │
      ▼
     UI Guidance

The application distinguishes between verified routes, search results, clarification requests, partial results, and errors.

This prevents uncertain AI output from automatically becoming a supposedly verified navigation path.

---

🤖 AI Integration

ACE-Scholar uses the Google Gemini API for AI-assisted capabilities.

Gemini is used for:

- Understanding ambiguous natural-language questions
- Analysing uploaded screenshots
- Identifying relevant screen information
- Supporting intent and platform interpretation when deterministic rules are insufficient

The application includes an AI client layer with:

- Request timeouts
- Retry handling
- Typed AI errors
- Structured response parsing
- Graceful failure handling

AI output is validated before being consumed by the application's navigation system.

The system is designed to avoid treating unsupported AI-generated information as a verified route.

---

🛡️ Reliability & Error Handling

ACE-Scholar is designed to fail safely when information is uncertain or services are unavailable.

The application supports:

- Input validation
- Image validation
- Image type detection from actual file content
- Image size limits
- Corruption detection
- Request timeouts
- Automatic retry handling
- Typed AI errors
- Graceful fallback behaviour
- Clarification instead of guessing
- Partial results when a verified route is unavailable
- User-facing retry states
- Rate limiting
- Health monitoring

When the application does not have enough verified information, it communicates that limitation instead of presenting an invented answer as fact.

---

🔐 Security

Security considerations are built into the application architecture.

Environment Variables

API credentials are supplied through environment variables rather than hard-coded into the source code.

GEMINI_API_KEY=your_key_here

Input Protection

The API validates incoming requests and uploaded images before processing them.

Rate Limiting

Requests are rate-limited to reduce abuse and unnecessary API usage.

Secure Output Handling

Frontend text is rendered safely without relying on unsafe HTML injection.

API Health Endpoint

The application provides a health endpoint without exposing secret credentials.

---

🏗️ Project Structure

ACE-Scholar/
│
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
│
├── src/
│   ├── ai/
│   │   ├── client.js
│   │   ├── parsers.js
│   │   └── prompts.js
│   │
│   ├── platforms/
│   │   ├── canvas.js
│   │   ├── digicampus.js
│   │   ├── index.js
│   │   └── moodle.js
│   │
│   ├── api.js
│   ├── app.js
│   ├── config.js
│   ├── intents.js
│   ├── knowledge.js
│   ├── navigation.js
│   ├── query.js
│   ├── rateLimit.js
│   └── validate.js
│
├── tests/
│   ├── ai-client.test.js
│   ├── api.test.js
│   ├── helpers.js
│   ├── navigation.test.js
│   ├── query.test.js
│   ├── rateLimit.test.js
│   └── validate.test.js
│
├── database.json
├── server.js
├── package.json
├── .env.example
├── .gitignore
└── README.md

---

🔌 API

"POST /api/route"

Main navigation endpoint.

Request

{
  "platform": "moodle",
  "question": "Where can I find my DBMS attendance?",
  "image": "data:image/png;base64,..."
}

Parameters

Parameter| Description
"platform"| Target academic platform
"question"| User's natural-language request
"image"| Optional PNG, JPEG, or WebP data URL

Images are subject to application-level size and validation rules.

---

Response Types

Successful Route

status: "ok"
mode: "route"

Can contain:

route.breadcrumb
route.steps
understanding
screen
notices
warnings

Route steps may include completion information.

---

Search Response

status: "ok"
mode: "search"

Search results are available through:

search.groups[]

---

Clarification Response

status: "clarify"

Used when the application requires more information instead of making an uncertain assumption.

Contains:

message
options[]

---

Partial Response

status: "partial"

Used when a verified route is unavailable.

The response can provide:

alternatives
approximateRoute

Approximate routes are explicitly labelled.

---

Error Response

status: "error"

Contains:

code
error
retryable

---

Additional Endpoints

GET /api/platforms
GET /api/health

---

➕ Extending ACE-Scholar

The platform-aware architecture makes it possible to add additional academic systems.

To add a platform:

1. Create a platform profile

src/platforms/<platform-id>.js

The profile contains platform information such as:

- Name
- Aliases
- Example questions
- Screenshot cues

2. Register the platform

Update:

src/platforms/index.js

3. Add navigation knowledge

Add the platform's route data to:

database.json

Navigation entries contain information such as:

intent
scope
path
task_keywords
verified_route

The supported scope values are:

course
global
none

Optional course-specific navigation information can also be supplied.

---

🧪 Testing

ACE-Scholar includes automated tests using Node.js's built-in test runner.

The test suite covers important application behaviour including:

- AI client handling
- API responses
- Navigation logic
- Query processing
- Rate limiting
- Input validation

The current project contains 71 automated tests.

The AI client is stubbed during automated testing so that the test suite does not depend on a live Gemini API request.

---

⚙️ Local Development

Requirements

- Node.js
- Google Gemini API key

Install dependencies

npm install

Configure environment

Create a ".env" file based on ".env.example".

GEMINI_API_KEY=your_key_here

An optional Gemini model can also be configured:

GEMINI_MODEL=your_model

Start the application

npm start

The application uses port "3000" by default.

Run tests

npm test

---

⚠️ Current Limitations

ACE-Scholar is designed around verified navigation knowledge rather than unrestricted web browsing.

Therefore:

- Platform layouts can vary between institutions.
- Menu labels may differ from the routes stored in the application.
- Only mapped routes are treated as verified.
- Some faculty-side workflows are not currently mapped.
- Some academic features may not yet be available for every supported platform.
- Course names and targets may require clarification when the user's wording is ambiguous.
- Screenshot understanding depends on the quality and relevance of the uploaded image.
- Live AI behaviour depends on Gemini availability, API configuration, and the selected model.

ACE-Scholar provides navigation assistance; it does not replace the official academic platform or institution.

---

🎯 Real-World Use

ACE-Scholar is designed for students who regularly interact with multiple academic systems and need a faster way to locate information.

Potential use cases include:

- Attendance tracking
- Assignment discovery
- Marks and grades
- Course materials
- Examination information
- Academic forms
- Course-specific information
- Platform navigation assistance

The platform-aware architecture can also be extended to support additional institutions and academic systems.

---

🔮 Future Scope

Potential future improvements include:

- Additional academic platforms
- Institution-specific navigation profiles
- More comprehensive academic knowledge bases
- Deeper personalization
- Improved screenshot understanding
- More visual navigation cues
- Expanded accessibility support
- Additional academic workflows
- Broader multilingual assistance

---

👩‍💻 Developer

Nandini Sharma

ACE-Scholar is an independently developed academic navigation assistant focused on making digital academic systems easier for students to navigate.

---

🤖 AI Disclosure

ACE-Scholar uses the Google Gemini API as part of its product functionality for natural-language interpretation and screenshot analysis.

AI-assisted development tools were also used during development for implementation, debugging, testing, and documentation.

The application validates AI-generated information before using it within its navigation workflow and does not intentionally present unsupported AI output as a verified navigation route.

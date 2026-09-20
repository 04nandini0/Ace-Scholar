🎓 Ace Scholar

AI-powered academic navigation assistant for Moodle, DigiCampus, and Canvas.

Ace Scholar helps students find information inside fragmented academic platforms without having to manually search through confusing menus.

Instead of asking “Where is my attendance?” and figuring out which menu to open, students can simply ask Ace Scholar. They can also upload a screenshot of their current screen and ask where to find something.

---

✨ What Ace Scholar Does

Ace Scholar combines natural-language understanding, platform-specific navigation knowledge, and screenshot analysis to guide students to the right location.

💬 Natural-Language Navigation

Ask questions such as:

- “Where can I check my attendance?”
- “Where are my assignment marks?”
- “Where can I find my exam results?”
- “Where can I see my pending fees?”
- “Where do I find the enrollment form?”

The application converts the query into:

Question → Intent → Platform → Target → Navigation Path → Instructions

---

📸 Screenshot-Based Assistance

Students can upload a screenshot of their current academic platform and ask a question such as:

«“I am on this screen. Where can I find my attendance?”»

Ace Scholar can analyse the screenshot, identify relevant screen information, understand the user's request, and provide a step-by-step navigation path.

When the available information is insufficient, the application can ask for clarification instead of blindly guessing.

---

🔎 Universal Academic Search

The application can search across the supported academic knowledge for relevant information and organize results into meaningful groups.

---

🧭 Visual Navigation

Navigation results can include:

- Breadcrumbs
- Step-by-step instructions
- Completed/done states
- Screen understanding
- Notices
- Warnings
- Alternative routes when an exact route cannot be verified

---

🌐 Supported Platforms

Ace Scholar currently supports:

- Moodle
- DigiCampus
- Canvas

The platform architecture is modular so additional academic platforms can be added without rewriting the entire application.

---

🏗️ Architecture

User Question / Screenshot
            │
            ▼
     Query Understanding
            │
            ▼
      Intent Detection
            │
            ▼
     Platform Detection
            │
            ▼
     Navigation Engine
            │
            ├── Verified Route
            ├── Clarification
            ├── Alternative
            └── Partial Result
            │
            ▼
       Structured Response
            │
            ▼
        Student UI

Project Structure

public/               Frontend UI
src/
  ai/                 Gemini client, prompts and response parsers
  platforms/          One profile per platform
  api.js              API routes
  app.js              Application setup
  config.js           Configuration
  intents.js          Intent detection
  knowledge.js        Academic navigation knowledge
  navigation.js       Navigation engine
  query.js            Query processing
  rateLimit.js        Request rate limiting
  validate.js         Input validation
tests/                Node.js test suites
database.json         Platform navigation data
server.js             Express server entry point

---

🧠 AI + Reliability

Ace Scholar uses the Google Gemini API for:

- Understanding ambiguous natural-language questions
- Analysing uploaded screenshots
- Identifying relevant platform/screen information

AI output is validated before it is used by the navigation system.

The application is designed to avoid inventing navigation routes. If a verified route is unavailable, it can return a clarification, partial result, or alternative instead.

The AI client also includes:

- Request timeouts
- Retry handling
- Error typing
- Structured response parsing

---

🔌 API

"POST /api/route"

Accepts:

{
  "platform": "moodle",
  "question": "Where can I check my attendance?",
  "image": "data:image/png;base64,..."
}

"image" is an optional PNG/JPEG/WebP data URL with a maximum size of approximately 6 MB.

Response Modes

"status: "ok", mode: "route""

Returns:

- "route.breadcrumb"
- "route.steps"
- "understanding"
- "screen"
- "notices"
- "warnings"

Each route step can contain a "done" state.

A top-level "steps" array is also maintained for compatibility with the original client.

"status: "ok", mode: "search""

Returns grouped search results through:

search.groups[]

"status: "clarify""

The application asks the user for clarification instead of guessing.

Returns:

message
options[]

"status: "partial""

Returned when a verified route is unavailable for the selected platform.

May include:

alternatives
approximateRoute

Any approximate route is explicitly labelled.

"status: "error""

Returns:

code
error
retryable

Other Endpoints

GET /api/platforms
GET /api/health

The health endpoint does not expose secrets.

---

➕ Adding Another Platform

To add a new academic platform:

1. Create a platform profile

Create:

src/platforms/<id>.js

The profile should define the platform name, aliases, example questions, and screenshot cues.

2. Register the platform

Add it to:

src/platforms/index.js

3. Add navigation knowledge

Add a corresponding platform array to:

database.json

Each navigation entry requires:

intent
scope
path
task_keywords
verified_route

"scope" can be:

course
global
none

A "course_step" can optionally be provided.

The existing UI, intent detection, screenshot prompts, search system, and tests are designed to pick up the new platform architecture automatically.

---

🧪 Testing

Ace Scholar includes automated Node.js test suites covering areas such as:

- AI client behaviour
- API responses
- Navigation
- Query processing
- Rate limiting
- Input validation

The project currently contains 71 tests.

The automated tests use a stubbed Gemini client, so live Gemini behaviour depends on the configured API key and model.

---

⚙️ Local Setup

Requirements

- Node.js
- A Google Gemini API key

Install

npm install

Configure environment variables

Create a ".env" file based on:

.env.example

Set:

GEMINI_API_KEY=your_key_here

Optionally configure:

GEMINI_MODEL=your_model

Run

npm start

The server runs on port "3000" by default.

Run tests

npm test

---

🔐 Security

Secrets should never be committed to the repository.

The project uses ".env" for local credentials and ".gitignore" excludes:

.env
node_modules/
*.log
coverage/
.cache/

Only ".env.example" is intended to be committed.

---

⚠️ Honest Limitations

- Navigation routes describe common platform layouts. Institutions can customize their menus, so labels may differ. The application therefore encourages users to verify the guidance against their own screen.
- Only routes present in "database.json" are returned as verified routes.
- Faculty-side tasks such as uploading marks, as well as unsupported features such as some Moodle announcements or DigiCampus materials, may not yet be mapped.
- Course names are extracted from the user's own wording. Acronyms, course codes, or unusual phrasing may sometimes require clarification or rephrasing.
- Automated tests use a stubbed Gemini client. Live AI behaviour depends on the configured Gemini API key and model.
- Ace Scholar is a navigation assistant; it does not replace the official academic platform or institution.

---

🤖 AI Disclosure

Product

The core product uses the Google Gemini API to interpret ambiguous questions and analyse uploaded screenshots. AI output is validated and is not used to invent verified navigation routes.

Development

During the HackDevengers 2.0 upgrade, an AI coding assistant (Claude) assisted with implementation and troubleshooting, including the intent pipeline, screenshot analysis, platform architecture, UI improvements, reliability work, testing, and documentation.

The original Ace Scholar project was created independently before the hackathon. The HackDevengers 2.0 work substantially upgraded the existing project.

---

👨‍💻 Developer

Designed & developed by Nandini Sharma.

Ace Scholar is an independently developed academic navigation project, substantially upgraded for HackDevengers 2.0.

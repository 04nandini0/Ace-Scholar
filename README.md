# ⌖ ACE-Scholar | Your Academic Compass

**Stop wasting your time. Just get your work done.**

ACE-Scholar is an AI-powered navigation assistant for students who are lost inside academic platforms such as **Moodle**, **DigiCampus** and **Canvas**. Ask *"Where can I find my DBMS attendance?"* and it returns the exact route. Upload a screenshot of the page you are stuck on and it tells you where you are and what to click next.

```
Query → Intent → Platform → Target → Navigation path → Instructions
"Where are my DBMS attendance records?"
   → attendance → Moodle → DBMS → Moodle › Dashboard › My courses › DBMS › Attendance
```

## What it does

| Feature | Details |
|---|---|
| **Intelligent navigation** | Questions are understood as intent + platform + course target, then turned into a breadcrumb path and numbered steps built from `database.json`. Clear questions are resolved locally (fast, no AI call, cannot hallucinate). Gemini is consulted only when the rules are unsure. |
| **Screenshot assistance** | Gemini vision identifies the platform and the current screen, reads your goal, and the route is trimmed to what is left ("You appear to be on the Moodle dashboard": login step ticked off, *You are here* on the path). Low confidence, unknown platform, or a non-academic image is stated plainly. |
| **Universal academic search** | "Show me everything related to DBMS" returns Course, Attendance, Assignments, Marks, Materials, Exams and Announcements cards. Sections with no verified route for that platform are labelled *not mapped yet*, never invented. |
| **Visual navigation** | Breadcrumb path, numbered steps, pipeline summary (intent / platform / target / confidence), collapsible search cards, copy-steps button. Mobile turns the path into a vertical trail. |
| **Platform-aware architecture** | Moodle, DigiCampus and Canvas are separate profiles and separate route sets. Adding a platform touches three places (below). |
| **Reliability** | Input and image validation (type sniffed from real bytes, size, corruption), request timeouts, one automatic retry, typed AI errors, graceful fallback to text-only answers when AI fails, clarification instead of guessing, inline error states with retry, offline/timeout handling. |
| **Security** | Secrets only via environment variables, `.env` git-ignored, only `public/` is served, strict CSP + security headers, per-IP rate limiting, AI output validated against fixed enums, all text rendered with `textContent` (no `innerHTML`). |

## Tech stack (unchanged)

- **Frontend:** HTML/CSS/vanilla JS, retro Monocraft aesthetic (`public/`)
- **Backend:** Node.js + Express 5
- **Data:** local JSON routing index (`database.json`)
- **AI:** Google Gemini via `@google/genai` (multimodal)
- **Deploy:** [Zerops](https://zerops.io) (`zerops.yml`)

No new frameworks or services were added; the dependency list is exactly the original four.

## Run locally

```bash
npm install
cp .env.example .env        # then put your key in .env
npm start                   # http://localhost:3000
npm test                    # 71 tests, no network needed
```

Without `GEMINI_API_KEY` the app still runs: typed questions, search and all routes work; screenshot analysis is disabled and the UI says so.

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `GEMINI_API_KEY` | Enables screenshot analysis + AI-assisted understanding | *(unset)* |
| `GEMINI_MODEL` | Gemini model id. Set this to the model you deployed with | `gemini-2.5-flash` |
| `PORT` | HTTP port | `3000` |
| `AI_TIMEOUT_MS` / `AI_RETRIES` | Per-call timeout / extra attempts | `25000` / `1` |
| `RATE_LIMIT_PER_MIN` | Requests per IP per minute on `/api/route` | `30` |
| `ALLOWED_ORIGINS` | Comma-separated origins for cross-origin API use | *(same-origin only)* |

## Project layout

```
server.js               entry point (env, wiring, listen)
database.json           verified routes per platform (+ intent / scope / path metadata)
public/                 index.html, styles.css, app.js  (the only files served)
src/
  app.js                Express: headers, CSP, body limit, rate limit, static, error handler
  api.js                the pipeline: validate → screenshot → platform → course → intent → route
  query.js, intents.js  intent scoring, course extraction, search-mode detection
  navigation.js         breadcrumb + steps builder, screenshot trimming, universal search
  knowledge.js          loads and validates database.json (bad entries are skipped, not fatal)
  validate.js           question / platform / image validation
  platforms/            one profile per platform (moodle.js, digicampus.js, canvas.js)
  ai/                   client.js (timeouts, retries, error typing), prompts.js, parsers.js
tests/                  node:test suites (71 tests)
```

## API

`POST /api/route` with `{ platform, question?, image? }` (`image` is a PNG/JPEG/WebP data URL, max ~6 MB).

- `status: "ok"`, `mode: "route"` → `route.breadcrumb`, `route.steps` (with `done` flags), `understanding`, `screen`, `notices`, `warnings`. A top-level `steps: [{title, description}]` array is kept for backward compatibility with the original client.
- `status: "ok"`, `mode: "search"` → `search.groups[]`
- `status: "clarify"` → `message` + `options[]` (the app asks rather than guesses)
- `status: "partial"` → no verified route on this platform; `alternatives`, optional labelled `approximateRoute`
- `status: "error"` → `code`, `error` (human message), `retryable`

`GET /api/platforms`, `GET /api/health` (never expose secrets).

## Adding another platform

1. Create `src/platforms/<id>.js` (name, aliases, example questions, screenshot cues), copy `moodle.js`.
2. Register it in `src/platforms/index.js`.
3. Add a `"<id>": [ ... ]` array to `database.json`. Each entry needs `intent`, `scope` (`course` | `global` | `none`), `path`, `task_keywords`, `verified_route`, and optionally `course_step`.

The UI, intent detection, screenshot prompts, search and tests pick it up automatically.

## Deploying on Zerops

Unchanged: one Node.js service built from this repository, port 3000. Set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) in the Zerops dashboard so credentials never enter the repo.

> **Housekeeping:** if `node_modules/` was ever committed, remove it from the index once with `git rm -r --cached node_modules`. `.gitignore` now excludes it and `.env`.

## Honest limitations

- Routes describe common platform layouts. Institutions customise menus, so labels may differ; the app says to trust your own screen.
- Only routes present in `database.json` are returned. Faculty-side tasks (e.g. uploading marks) and features such as Moodle announcements or DigiCampus materials are reported as *not mapped yet*.
- The course name is taken only from the user's own words (acronyms, codes, or after "for/in/of"); unusual phrasing may need a rephrase, and the UI shows what was understood.
- The automated tests use a stubbed Gemini client. Live Gemini behaviour depends on your key and model.

## 🤖 AI Disclosure (Code of Conduct)

- **The core product** uses the Google Gemini API to interpret ambiguous questions and to analyse uploaded screenshots. Model output is validated and never used to invent routes.
- **Development assistance:** during the hackathon an AI coding assistant helped troubleshoot Git rebase conflicts, Express routing bugs and Zerops configuration. For the 2.0 upgrade, an AI assistant (Claude) helped implement the intent pipeline, screenshot analysis, platform architecture, UI polish, reliability work, tests and this README, on top of the existing project.

## 👨‍💻 Developer

Designed & Encoded by **Nandini Sharma** for the WeMakeDevs x Zerops Challenge (HackDevengers 2.0 upgrade).

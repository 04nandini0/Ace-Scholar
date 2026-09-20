'use strict';

const platforms = require('./platforms');
const { validateRouteRequest } = require('./validate');
const { parseQuery } = require('./query');
const { labelFor } = require('./intents');
const { buildRoute, universalSearch, resolveEntry } = require('./navigation');
const { intentSystemPrompt, intentUserText, screenshotSystemPrompt, screenshotUserText } = require('./ai/prompts');
const { parseIntentResult, parseScreenResult } = require('./ai/parsers');

/** Canonical phrasing used for "did you mean" buttons; each re-parses to its intent. */
const ASK = {
  attendance: 'attendance', assignments: 'assignments', marks: 'marks', materials: 'notes',
  exams: 'exams', announcements: 'announcements', syllabus: 'syllabus', fees: 'fees',
  timetable: 'timetable', calendar: 'calendar', registration: 'course registration',
  messaging: 'message professor', forums: 'discussion forum', participants: 'classmates', course: 'my courses',
};

/** Intents that live on a course page, so "open the course" is a fair fallback. */
const COURSE_RELATED = new Set([
  'attendance', 'assignments', 'marks', 'materials', 'exams', 'announcements', 'syllabus', 'forums', 'participants',
]);

const SCREEN_LABEL = {
  login: 'login page', dashboard: 'dashboard', course_list: 'course list', course_page: 'course page',
  grades: 'grades page', assignments: 'assignments page', calendar: 'calendar', inbox: 'inbox',
  other: 'page', unknown: 'screen',
};

const AI_FAILURE_HTTP = {
  AI_TIMEOUT: [504, 'The AI took too long to analyse your screenshot. Please try again.'],
  AI_RATE_LIMIT: [503, 'The AI service is busy right now. Wait a few seconds and try again.'],
  AI_BLOCKED: [422, 'The AI could not process that screenshot. Try a different one.'],
  AI_BAD_RESPONSE: [502, 'The AI gave an answer we could not use. Please try again.'],
  AI_AUTH: [503, 'Screenshot analysis is temporarily unavailable on this server.'],
  AI_BAD_REQUEST: [422, 'The AI could not process that screenshot. Try a different one.'],
  AI_UNAVAILABLE: [503, 'The AI service is unreachable right now. Please try again shortly.'],
};

const confidenceLabel = (n) => (n >= 0.8 ? 'high' : n >= 0.55 ? 'medium' : 'low');
const sameText = (a, b) => Boolean(a && b) && a.trim().toLowerCase() === b.trim().toLowerCase();
const optionQuestion = (intent, course) => (course ? `${course} ${ASK[intent] || intent}` : ASK[intent] || intent);

function createApi({ config, knowledge, ai, log = console }) {
  const ok = (body) => ({ status: 200, body });
  const failure = (status, code, error, extra = {}) => ({ status, body: { status: 'error', code, error, ...extra } });

  function platformName(id) {
    const p = platforms.get(id);
    return p ? p.name : id;
  }

  function otherPlatformsWith(intentId, exceptId) {
    return platforms
      .all()
      .filter((p) => p.id !== exceptId && resolveEntry(knowledge, p.id, intentId))
      .map((p) => ({ id: p.id, name: p.name }));
  }

  function quickOptions(platformId, course) {
    const wanted = ['attendance', 'marks', 'assignments', 'materials', 'calendar', 'timetable'];
    const supported = new Set(knowledge.supportedIntents(platformId));
    return wanted
      .filter((i) => supported.has(i))
      .slice(0, 4)
      .map((i) => ({ label: labelFor(i), question: optionQuestion(i, course) }));
  }

  function describeScreen(screen, platformId) {
    if (!screen) return null;
    const detected = screen.platform ? platformName(screen.platform) : null;
    const type = SCREEN_LABEL[screen.screenType] || 'screen';
    const course = screen.screenType === 'course_page' && screen.visibleCourse ? ` for \u201C${screen.visibleCourse}\u201D` : '';
    const where = detected ? `the ${detected} ${type}` : `a ${type}`;
    const headline = !screen.isAcademic
      ? 'This does not look like an academic platform screen.'
      : screen.confidence >= 0.5
        ? `You appear to be on ${where}${course}.`
        : `I am not sure, but this might be ${where}${course}.`;
    return {
      headline,
      isAcademic: screen.isAcademic,
      platform: detected,
      platformId: screen.platform,
      platformConfidence: screen.platformConfidence,
      platformEvidence: screen.platformEvidence,
      screenType: screen.screenType,
      description: screen.screenDescription,
      visibleMenuItems: screen.visibleMenuItems,
      visibleCourse: screen.visibleCourse,
      matchingElementVisible: screen.matchingElementVisible,
      confidence: screen.confidence,
      confidenceLabel: confidenceLabel(screen.confidence),
      uncertainty: screen.uncertainty,
      usedPlatformId: platformId,
    };
  }

  const routeText = (route) => route.breadcrumb.map((n) => n.label).join(' \u2192 ');

  async function route(body) {
    // ---- 1. Validate -------------------------------------------------------
    const checked = validateRouteRequest(body, { config, platforms });
    if (!checked.ok) {
      return failure(checked.status, checked.code, checked.message, { field: checked.field });
    }
    const { platform: selected, question, image } = checked.value;
    const parsed = parseQuery(question);
    const warnings = [];
    const notices = [];
    const meta = { aiUsed: false, aiDegraded: false };

    // Faculty-side actions are not part of the verified student routes.
    if (parsed.facultyAction && !image) {
      return ok({
        status: 'clarify',
        mode: 'clarify',
        message:
          'That sounds like a faculty task (entering or uploading marks/attendance). ACE Scholar only has verified student-side routes so far. I can show where students view them.',
        options: [
          { label: 'Where can I view my marks?', question: 'marks' },
          { label: 'Where can I view my attendance?', question: 'attendance' },
        ],
        platform: { id: selected, name: platformName(selected) },
        warnings, meta,
      });
    }

    // ---- 2. Screenshot understanding ----------------------------------------
    let screen = null;
    if (image) {
      let failureCode = null;
      if (!ai.isConfigured()) {
        failureCode = 'AI_NOT_CONFIGURED';
      } else {
        try {
          const raw = await ai.generateJSON({
            system: screenshotSystemPrompt(),
            text: screenshotUserText({ question, selectedPlatformName: platformName(selected) }),
            image,
          });
          screen = parseScreenResult(raw);
          meta.aiUsed = true;
        } catch (err) {
          failureCode = err.code || 'AI_UNAVAILABLE';
          log.warn(`[ace] screenshot analysis failed: ${failureCode}`);
        }
      }

      if (failureCode) {
        if (parsed.hasContent) {
          meta.aiDegraded = true;
          warnings.push(
            failureCode === 'AI_NOT_CONFIGURED'
              ? 'Screenshot analysis is not enabled on this server, so I used only your text.'
              : 'I could not analyse the screenshot right now, so I used only your text.',
          );
        } else if (failureCode === 'AI_NOT_CONFIGURED') {
          return failure(503, failureCode, 'Screenshot analysis is not enabled on this server. Type your question instead.', { retryable: false });
        } else {
          const [status, message] = AI_FAILURE_HTTP[failureCode] || AI_FAILURE_HTTP.AI_UNAVAILABLE;
          return failure(status, failureCode, message, { retryable: status !== 422 });
        }
      }
    }

    // ---- 3. Platform --------------------------------------------------------
    let platformId = selected;
    let platformSource = 'selected';
    let screenUsable = Boolean(screen) && screen.confidence >= 0.5;

    if (parsed.platformMention) {
      platformSource = 'query';
      if (parsed.platformMention !== selected) {
        platformId = parsed.platformMention;
        notices.push(`You mentioned ${platformName(platformId)}, so I used it instead of ${platformName(selected)}.`);
        screenUsable = false; // the screenshot may belong to a different platform
      }
    } else if (screen && screen.platform && screen.platformConfidence >= 0.7) {
      if (screen.platform !== selected) {
        platformId = screen.platform;
        platformSource = 'screenshot';
        notices.push(`Your screenshot looks like ${platformName(platformId)}, so I switched from ${platformName(selected)}.`);
      } else {
        platformSource = 'screenshot';
      }
    } else if (screen) {
      warnings.push(`I could not confirm the platform from the screenshot, so I am using ${platformName(selected)} as selected.`);
    }

    if (screen && !screen.isAcademic) {
      warnings.push('The screenshot does not look like an academic platform screen.');
      screenUsable = false;
    } else if (screen && screen.confidence < 0.5) {
      warnings.push('I am not confident about what this screenshot shows, so treat the guidance below as a best guess.');
    }

    const screenInfo = describeScreen(screen, platformId);
    const platformInfo = { id: platformId, name: platformName(platformId), source: platformSource };

    // ---- 4. Course target (only ever taken from the user's own words) --------
    let course = parsed.course;
    if (!course && screen && screen.goalCourse && question.toLowerCase().includes(screen.goalCourse.toLowerCase())) {
      course = screen.goalCourse;
    }

    // ---- 5. Universal academic search ---------------------------------------
    if (parsed.searchMode && (course || !parsed.primary)) {
      if (!course && screen && screen.visibleCourse && screenUsable) {
        course = screen.visibleCourse;
        notices.push(`Using the course shown on your screen: \u201C${course}\u201D.`);
      }
      if (!course) {
        return ok({
          status: 'clarify', mode: 'clarify',
          message: 'Which course should I look up? Add its name, for example \u201Ceverything related to DBMS\u201D.',
          options: [], platform: platformInfo, screen: screenInfo, warnings, notices, meta,
        });
      }
      const search = universalSearch({ knowledge, platformId, course });
      return ok({
        status: 'ok', mode: 'search',
        understanding: {
          intent: { id: 'search', label: 'Everything about a course' },
          platform: platformInfo, course, method: 'rules',
          confidence: 0.85, confidenceLabel: 'high',
        },
        search, screen: screenInfo, warnings, notices, meta,
      });
    }

    // ---- 6. Intent ----------------------------------------------------------
    let intentId = null;
    let method = 'rules';
    let confidence = parsed.confidence;
    let directEntry = null; // for entries without an `intent` field (custom data)

    if (parsed.primary) {
      const candidates = [parsed.primary, ...parsed.alsoLikely];
      const mapped = candidates.filter((i) => resolveEntry(knowledge, platformId, i));
      if (candidates.length === 1) {
        intentId = parsed.primary;
      } else if (mapped.length === 1) {
        intentId = mapped[0];
      } else {
        return ok({
          status: 'clarify', mode: 'clarify',
          message: 'I found more than one thing in your question. Which one do you need?',
          options: candidates.map((i) => ({ label: labelFor(i), question: optionQuestion(i, course) })),
          platform: platformInfo, screen: screenInfo, warnings, notices, meta,
        });
      }
    }

    // Screenshot-derived goal when the text gave nothing usable.
    if (!intentId && screen && screen.isAcademic && screen.goalIntent && screen.confidence >= 0.5) {
      intentId = screen.goalIntent;
      method = 'ai-vision';
      confidence = Math.min(0.9, screen.confidence);
    }

    // Ask the language model only when the local rules are unsure.
    let aiClarifying = null;
    if (!intentId && parsed.hasContent && !image && ai.isConfigured()) {
      try {
        const result = parseIntentResult(
          await ai.generateJSON({ system: intentSystemPrompt(), text: intentUserText(question) }),
        );
        meta.aiUsed = true;
        if (result.intent && result.confidence >= 0.6) {
          intentId = result.intent;
          method = 'ai';
          confidence = Math.min(0.9, result.confidence);
          if (!course && result.course && question.toLowerCase().includes(result.course.toLowerCase())) {
            course = result.course;
          }
        } else {
          aiClarifying = result.clarifyingQuestion;
        }
      } catch (err) {
        meta.aiDegraded = true;
        log.warn(`[ace] intent classification failed: ${err.code || 'unknown'}`);
        warnings.push('Smart interpretation is unavailable right now, so I matched your words against known routes only.');
      }
    }

    // Original keyword phrases from database.json as a last local resort.
    if (!intentId && parsed.hasContent) {
      const hit = knowledge.matchKeywords(platformId, question);
      if (hit) {
        if (hit.entry.intent) intentId = hit.entry.intent;
        else directEntry = hit.entry;
        method = 'keywords';
        confidence = 0.6;
      }
    }

    // ---- 7. Clarify instead of guessing --------------------------------------
    if (!intentId && !directEntry) {
      let message;
      if (screenInfo && !screenInfo.isAcademic) {
        message = 'That does not look like a Moodle, DigiCampus or Canvas screen. Upload a screenshot of the portal, or type your question.';
      } else if (screenInfo) {
        message = `${screenInfo.headline} What would you like to find from here?`;
      } else if (aiClarifying) {
        message = aiClarifying;
      } else {
        message = 'I am not sure what you are looking for. Try naming the thing and, if you can, the course, for example \u201CDBMS attendance\u201D.';
      }
      return ok({
        status: 'clarify', mode: 'clarify', message,
        options: quickOptions(platformId, course),
        platform: platformInfo, screen: screenInfo, warnings, notices, meta,
      });
    }

    // ---- 8. Build the route from verified data -------------------------------
    const resolved = directEntry
      ? { entry: directEntry, intentUsed: directEntry.intent || 'unknown', viaRelated: false }
      : resolveEntry(knowledge, platformId, intentId);

    if (!resolved) {
      // No verified route on this platform: be honest and offer real alternatives.
      const alternatives = otherPlatformsWith(intentId, platformId);
      let approximate = null;
      if (COURSE_RELATED.has(intentId)) {
        const courseEntry = knowledge.find(platformId, 'course');
        if (courseEntry) approximate = buildRoute({ platformId, entry: courseEntry, course });
      }
      return ok({
        status: 'partial', mode: 'partial',
        understanding: {
          intent: { id: intentId, label: labelFor(intentId) }, platform: platformInfo, course, method,
          confidence, confidenceLabel: confidenceLabel(confidence),
        },
        message: `${platformName(platformId)} does not have a verified route for \u201C${labelFor(intentId)}\u201D yet.`,
        approximateRoute: approximate,
        approximateNote: approximate
          ? 'Closest verified route: open the course page and look there. This has not been verified for this specific feature.'
          : null,
        alternatives,
        options: alternatives.map((p) => ({ label: `Try on ${p.name}`, platform: p.id, question })),
        screen: screenInfo, warnings, notices, meta,
      });
    }

    const courseMatches = screen && screen.visibleCourse && course ? sameText(screen.visibleCourse, course) : null;
    if (!course && screen && screen.visibleCourse && screenUsable && resolved.entry.scope === 'course' && resolved.intentUsed !== 'course') {
      course = screen.visibleCourse;
      notices.push(`Using the course shown on your screen: \u201C${course}\u201D.`);
    }

    const built = buildRoute({
      platformId,
      entry: resolved.entry,
      course,
      screen: screenUsable ? { screenType: screen.screenType, courseMatches, isAcademic: screen.isAcademic } : null,
    });

    if (resolved.viaRelated) {
      notices.push(`${platformName(platformId)} has no separate \u201C${labelFor(intentId)}\u201D page, so this is the closest match: ${labelFor(resolved.intentUsed)}.`);
    }
    if (screen && screen.matchingElementVisible && screenUsable) {
      notices.push(`I can see \u201C${screen.matchingElementVisible}\u201D on your screen \u2014 that is likely your next click.`);
    }
    if (method === 'ai' || method === 'ai-vision') {
      warnings.push('I inferred what you need from context. If this is not right, rephrase your question.');
    }
    if (confidence < 0.55 && method !== 'keywords') {
      warnings.push('I am not fully sure I understood this. Double-check the route or rephrase.');
    }

    const remaining = built.steps.filter((s) => !s.done);
    return ok({
      status: 'ok',
      mode: 'route',
      understanding: {
        intent: built.intent, platform: platformInfo, course, method,
        confidence: Number(confidence.toFixed(2)), confidenceLabel: confidenceLabel(confidence),
      },
      route: built,
      routeText: routeText(built),
      // Backwards-compatible with the original client contract.
      steps: remaining.map(({ title, description }) => ({ title, description })),
      screen: screenInfo,
      warnings, notices, meta,
    });
  }

  function listPlatforms() {
    return { platforms: platforms.publicList(), aiEnabled: ai.isConfigured() };
  }

  function health() {
    return { ok: true, aiConfigured: ai.isConfigured(), routeWarnings: knowledge.warnings.length };
  }

  return { route, listPlatforms, health };
}

module.exports = { createApi };

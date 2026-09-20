'use strict';

const platforms = require('../platforms');
const { isKnownIntent } = require('../intents');
const { SCREEN_TYPES } = require('../navigation');

/**
 * Model output is untrusted: it may be malformed, hallucinated, or influenced
 * by text inside a screenshot. These helpers only let through values that are
 * of the expected type/shape and drawn from our own enumerations.
 */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

function str(value, max) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

function strList(value, maxItems, maxLen) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => str(v, maxLen)).filter(Boolean).slice(0, maxItems);
}

function score(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function intentOrNull(value) {
  const v = str(value, 40);
  return v && isKnownIntent(v.toLowerCase()) ? v.toLowerCase() : null;
}

function platformOrNull(value) {
  const v = str(value, 40);
  return v && platforms.has(v.toLowerCase()) ? v.toLowerCase() : null;
}

function courseOrNull(value) {
  const v = str(value, 40);
  return v && /[A-Za-z0-9]/.test(v) ? v : null;
}

/** @returns {{intent:string|null, course:string|null, platform:string|null, confidence:number, clarifyingQuestion:string|null}} */
function parseIntentResult(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    intent: intentOrNull(r.intent),
    course: courseOrNull(r.course),
    platform: platformOrNull(r.platform),
    confidence: score(r.confidence),
    clarifyingQuestion: str(r.clarifyingQuestion, 200),
  };
}

/** @returns {object} normalised screenshot analysis */
function parseScreenResult(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const screenType = str(r.screenType, 30);
  return {
    isAcademic: r.isAcademicPlatform === true,
    platform: platformOrNull(r.platform),
    platformConfidence: score(r.platformConfidence),
    platformEvidence: strList(r.platformEvidence, 3, 140),
    screenType: screenType && SCREEN_TYPES.includes(screenType.toLowerCase()) ? screenType.toLowerCase() : 'unknown',
    screenDescription: str(r.screenDescription, 240),
    visibleMenuItems: strList(r.visibleMenuItems, 10, 40),
    visibleCourse: courseOrNull(r.visibleCourse),
    goalIntent: intentOrNull(r.goalIntent),
    goalCourse: courseOrNull(r.goalCourse),
    matchingElementVisible: str(r.matchingElementVisible, 80),
    confidence: score(r.confidence),
    uncertainty: str(r.uncertainty, 280),
  };
}

module.exports = { parseIntentResult, parseScreenResult, str };

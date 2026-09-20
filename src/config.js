'use strict';

/**
 * All runtime configuration comes from environment variables.
 * Nothing secret is ever hard-coded or logged.
 */

function posInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function loadConfig(env = process.env) {
  return Object.freeze({
    port: posInt(env.PORT, 3000),
    geminiApiKey: (env.GEMINI_API_KEY || '').trim(),
    geminiModel: (env.GEMINI_MODEL || 'gemini-2.5-flash').trim(),
    aiTimeoutMs: posInt(env.AI_TIMEOUT_MS, 25000),
    aiRetries: Math.min(posInt(env.AI_RETRIES, 1), 3),
    rateLimitPerMin: posInt(env.RATE_LIMIT_PER_MIN, 30),
    allowedOrigins: (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    maxQuestionChars: 500,
    maxImageBytes: 6 * 1024 * 1024,
    jsonBodyLimit: '9mb',
    defaultPlatform: 'digicampus',
  });
}

module.exports = { loadConfig };

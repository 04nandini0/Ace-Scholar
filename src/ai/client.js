'use strict';

/**
 * Thin, defensive wrapper around the Gemini SDK.
 *
 * - The SDK is loaded lazily, so the app still boots (and text navigation
 *   still works) when no API key is configured.
 * - Every failure is converted to an AIError with a stable `code`, so callers
 *   can degrade gracefully and the API can return a helpful message without
 *   leaking provider internals or secrets.
 */

class AIError extends Error {
  constructor(code, message, { retryable = false, status = null } = {}) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

const sleepReal = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Turn whatever the SDK / network threw into an AIError. */
function classifyError(err) {
  if (err instanceof AIError) return err;
  const status = Number(err && (err.status || err.code || (err.error && err.error.code))) || null;
  const msg = String((err && err.message) || err || '');

  if (status === 429 || /quota|rate.?limit|resource.?exhausted/i.test(msg)) {
    return new AIError('AI_RATE_LIMIT', 'The AI service is busy right now.', { retryable: true, status: 429 });
  }
  if (status === 401 || status === 403 || /api key|permission|unauthori[sz]ed|forbidden/i.test(msg)) {
    return new AIError('AI_AUTH', 'The AI service rejected the server credentials.', { status });
  }
  if (status === 400) {
    return new AIError('AI_BAD_REQUEST', 'The AI service could not process this request.', { status });
  }
  if ((status && status >= 500) || /ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed|network|socket|unavailable|overloaded/i.test(msg)) {
    return new AIError('AI_UNAVAILABLE', 'The AI service is temporarily unreachable.', { retryable: true, status });
  }
  return new AIError('AI_UNAVAILABLE', 'The AI service returned an unexpected error.', { retryable: true, status });
}

/** Parse JSON even if the model wrapped it in code fences or added prose. */
function parseJsonLoose(text) {
  const cleaned = String(text || '').replace(/^\uFEFF/, '').replace(/```(?:json)?/gi, '').trim();
  if (!cleaned) throw new AIError('AI_BAD_RESPONSE', 'The AI returned an empty response.', { retryable: true });
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (_) { /* fall through */ }
    }
  }
  throw new AIError('AI_BAD_RESPONSE', 'The AI response was not valid JSON.', { retryable: true });
}

function extractText(response) {
  if (!response) return '';
  if (typeof response.text === 'string') return response.text;
  const parts = response.candidates && response.candidates[0] && response.candidates[0].content
    ? response.candidates[0].content.parts || []
    : [];
  return parts.map((p) => p.text || '').join('');
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {number} opts.timeoutMs
 * @param {number} opts.retries      extra attempts after the first
 * @param {object} [opts.client]     pre-built client (used by tests)
 * @param {Function} [opts.sleep]    injectable delay (used by tests)
 */
function createAIClient({ apiKey, model, timeoutMs = 25000, retries = 1, client = null, sleep = sleepReal }) {
  let sdkClient = client;

  function getClient() {
    if (!sdkClient) {
      // eslint-disable-next-line global-require
      const { GoogleGenAI } = require('@google/genai');
      sdkClient = new GoogleGenAI({ apiKey });
    }
    return sdkClient;
  }

  async function callOnce({ system, text, image }) {
    const parts = [{ text }];
    if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });

    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new AIError('AI_TIMEOUT', 'The AI took too long to respond.', { retryable: true })),
        timeoutMs,
      );
    });

    try {
      const response = await Promise.race([
        getClient().models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
          config: {
            systemInstruction: system,
            temperature: 0.2,
            responseMimeType: 'application/json',
            maxOutputTokens: 2048,
          },
        }),
        timeout,
      ]);

      const blockReason = response && response.promptFeedback && response.promptFeedback.blockReason;
      if (blockReason) {
        throw new AIError('AI_BLOCKED', 'The AI declined to process this input.', { status: 400 });
      }
      return parseJsonLoose(extractText(response));
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    isConfigured: () => Boolean(apiKey) || Boolean(client),
    model,

    /** Ask the model for a JSON object. Throws AIError. */
    async generateJSON({ system, text, image = null }) {
      let lastError;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          return await callOnce({ system, text, image });
        } catch (err) {
          lastError = classifyError(err);
          if (!lastError.retryable || attempt === retries) break;
          await sleep(600 * (attempt + 1));
        }
      }
      throw lastError;
    },
  };
}

module.exports = { createAIClient, AIError, classifyError, parseJsonLoose };

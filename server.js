'use strict';

// Load .env for local development. In production (e.g. Zerops) variables are
// injected by the platform, so a missing dotenv/.env file is not an error.
try {
  require('dotenv').config({ quiet: true });
} catch (_) { /* optional */ }

const { loadConfig } = require('./src/config');
const { loadKnowledge } = require('./src/knowledge');
const { createAIClient } = require('./src/ai/client');
const { createApi } = require('./src/api');
const { createApp } = require('./src/app');

const config = loadConfig();
const knowledge = loadKnowledge();
const ai = createAIClient({
  apiKey: config.geminiApiKey,
  model: config.geminiModel,
  timeoutMs: config.aiTimeoutMs,
  retries: config.aiRetries,
});

knowledge.warnings.forEach((w) => console.warn(`[ace] ${w}`));
if (!ai.isConfigured()) {
  console.warn('[ace] GEMINI_API_KEY is not set: text navigation works, screenshot analysis is disabled.');
}

const app = createApp({ config, api: createApi({ config, knowledge, ai }) });

app.listen(config.port, () => {
  console.log(`[ace] ACE Scholar listening on port ${config.port}`);
});

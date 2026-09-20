'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const { createRateLimiter } = require('./rateLimit');

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://cdn.jsdelivr.net",
  "font-src 'self' https://cdn.jsdelivr.net data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Builds the Express app. All logic lives in `api`; this file only handles
 * HTTP concerns: security headers, body parsing, rate limiting, static files.
 */
function createApp({ config, api, log = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Zerops / most PaaS sit behind a proxy

  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Same-origin by default. Cross-origin access is opt-in via ALLOWED_ORIGINS.
  if (config.allowedOrigins.length) {
    app.use('/api', cors({ origin: config.allowedOrigins }));
  }

  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', express.json({ limit: config.jsonBodyLimit }));

  const limiter = createRateLimiter({ limit: config.rateLimitPerMin });
  const rateLimit = (req, res, next) => {
    const verdict = limiter.check(req.ip || 'unknown');
    if (verdict.allowed) return next();
    res.setHeader('Retry-After', String(verdict.retryAfterSec));
    return res.status(429).json({
      status: 'error',
      code: 'RATE_LIMITED',
      error: `Too many requests. Try again in ${verdict.retryAfterSec} seconds.`,
      retryable: true,
      retryAfter: verdict.retryAfterSec,
    });
  };

  app.get('/api/health', (req, res) => res.json(api.health()));
  app.get('/api/platforms', (req, res) => res.json(api.listPlatforms()));

  app.post('/api/route', rateLimit, async (req, res) => {
    try {
      const result = await api.route(req.body);
      res.status(result.status).json(result.body);
    } catch (err) {
      log.error('[ace] unexpected error in /api/route:', err && err.message);
      res.status(500).json({
        status: 'error', code: 'INTERNAL_ERROR', retryable: true,
        error: 'Something went wrong on our side. Please try again.',
      });
    }
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ status: 'error', code: 'NOT_FOUND', error: 'Unknown API endpoint.' });
  });

  // Only the public/ folder is served: database.json, .env and source stay private.
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

  // JSON error handler (malformed JSON, oversized bodies, ...).
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({
        status: 'error', code: 'PAYLOAD_TOO_LARGE',
        error: 'That upload is too large. Use a smaller screenshot.',
      });
    }
    if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
      return res.status(400).json({ status: 'error', code: 'INVALID_JSON', error: 'The request was not valid JSON.' });
    }
    log.error('[ace] unhandled error:', err && err.message);
    return res.status(500).json({
      status: 'error', code: 'INTERNAL_ERROR', retryable: true,
      error: 'Something went wrong on our side. Please try again.',
    });
  });

  return app;
}

module.exports = { createApp, CSP };

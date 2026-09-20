'use strict';

const fs = require('fs');
const path = require('path');
const platforms = require('./platforms');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'database.json');

const FILLER = new Set([
  'a', 'an', 'the', 'my', 'me', 'to', 'in', 'on', 'of', 'for', 'and', 'or', 'is', 'are',
  'i', 'how', 'do', 'can', 'where', 'what', 'find', 'see', 'get', 'view', 'check', 'show',
]);

function stem(word) {
  return word.replace(/(ing|ed|es|s)$/, '');
}

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function isValidEntry(entry) {
  return (
    entry &&
    Array.isArray(entry.task_keywords) &&
    entry.task_keywords.every((k) => typeof k === 'string') &&
    Array.isArray(entry.verified_route) &&
    entry.verified_route.length > 0 &&
    entry.verified_route.every((s) => s && typeof s.title === 'string' && typeof s.description === 'string')
  );
}

/**
 * Loads database.json and exposes lookups by platform. A malformed entry is
 * skipped (and reported in `warnings`) instead of crashing the server.
 */
function loadKnowledge(dbPath = DEFAULT_DB_PATH) {
  const warnings = [];
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch (err) {
    warnings.push(`Could not read routing database (${err.message}). Navigation will be empty.`);
    raw = {};
  }

  const index = new Map(); // platformId -> entries[]
  for (const [platformId, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) {
      warnings.push(`Platform "${platformId}" in database.json is not an array; skipped.`);
      continue;
    }
    const clean = [];
    list.forEach((entry, i) => {
      if (isValidEntry(entry)) clean.push(entry);
      else warnings.push(`Skipped malformed entry #${i} for "${platformId}".`);
    });
    index.set(platformId, clean);
  }

  for (const p of platforms.all()) {
    if (!index.has(p.id)) warnings.push(`Platform "${p.id}" is registered but has no routes in database.json.`);
  }

  function entriesFor(platformId) {
    return index.get(platformId) || [];
  }

  /** The verified entry for an intent on a platform, or null when unmapped. */
  function find(platformId, intentId) {
    return entriesFor(platformId).find((e) => e.intent === intentId) || null;
  }

  function supportedIntents(platformId) {
    return entriesFor(platformId).map((e) => e.intent).filter(Boolean);
  }

  /**
   * Fallback matcher that uses the original `task_keywords` phrases. It keeps
   * queries working even when the intent classifier finds nothing.
   */
  function matchKeywords(platformId, text) {
    const platform = platforms.get(platformId);
    const platformWords = new Set(tokens(platform ? platform.name : '').concat(platformId));
    const queryStems = new Set(tokens(text).map(stem));
    let best = null;

    for (const entry of entriesFor(platformId)) {
      for (const phrase of entry.task_keywords) {
        const words = tokens(phrase).filter((w) => !FILLER.has(w) && !platformWords.has(w));
        if (words.length < 2) continue;
        const hit = words.filter((w) => queryStems.has(stem(w))).length;
        const ratio = hit / words.length;
        const score = ratio * words.length;
        if (ratio >= 0.75 && score >= 1.5 && (!best || score > best.score)) {
          best = { entry, score, phrase };
        }
      }
    }
    return best;
  }

  return { entriesFor, find, supportedIntents, matchKeywords, warnings };
}

module.exports = { loadKnowledge, DEFAULT_DB_PATH };

'use strict';

/**
 * Platform registry. The rest of the app only talks to this module, so a new
 * platform can be added without touching intent detection, navigation
 * building, the AI layer or the UI.
 */
const profiles = [
  require('./digicampus'),
  require('./moodle'),
  require('./canvas'),
];

const byId = new Map();

function register(profile) {
  if (!profile || !/^[a-z0-9_-]+$/.test(profile.id || '')) {
    throw new Error('Platform profile needs a lowercase id');
  }
  if (!profile.name) throw new Error(`Platform "${profile.id}" needs a name`);
  const aliasSources = profile.aliases && profile.aliases.length ? profile.aliases : [profile.id];
  byId.set(profile.id, {
    ...profile,
    screenCues: profile.screenCues || [],
    examples: profile.examples || [],
    aliasRegex: new RegExp(`\\b(?:${aliasSources.join('|')})\\b`, 'i'),
  });
}

profiles.forEach(register);

function all() {
  return [...byId.values()];
}

function get(id) {
  return byId.get(String(id || '').toLowerCase()) || null;
}

function has(id) {
  return byId.has(String(id || '').toLowerCase());
}

/** Find a platform explicitly named in free text, e.g. "attendance on Moodle". */
function detectInText(text) {
  const hits = all().filter((p) => p.aliasRegex.test(text || ''));
  return hits.length === 1 ? hits[0].id : null; // ambiguous mention => no override
}

/** Safe, UI-facing view of the registry. */
function publicList() {
  return all().map((p) => ({
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    examples: p.examples,
  }));
}

module.exports = { register, all, get, has, detectInText, publicList };

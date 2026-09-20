'use strict';

const platforms = require('./platforms');
const {
  MIN_SCORE,
  AMBIGUITY_RATIO,
  normalize,
  scoreIntents,
  isIntentWord,
} = require('./intents');

const STOP = new Set(`
where what whats where's wheres how when why who which can could would should will do does did is are was am be been
i me my mine we you your our the a an and or but of to in on at by from with about regarding for please pls plz kindly
show find get give tell see view check open look looking want need wanna help know list display take go goto related
everything anything all any some this that these those there here it its if so then than also just only still again now
today tomorrow yesterday latest new recent current upload submit download access use using make put add enter update post
pay register hello hi hey thanks thank ok okay test testing asap urgent quick quickly bro sir madam buddy dude yaar
something someone anyone tell me
`.split(/\s+/).filter(Boolean));

const GENERIC = new Set(`
course courses subject subjects class classes record records status details detail info information semester sem term
year week month portal page section app application platform lms website site tab thing stuff data report reports total
overall
`.split(/\s+/).filter(Boolean));

const CUE_PREPS = new Set(['for', 'in', 'of', 'on', 'about', 'regarding', 'to', 'from', 'under', 'within']);
const CUE_NOUNS = new Set(['course', 'subject', 'class']);

function tokenize(text) {
  return String(text || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[?!,;:()"\u201C\u201D[\]]/g, ' ')
    .replace(/\.(?=\s|$)/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, key: raw.toLowerCase().replace(/'s$/, '').replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '') }));
}

function isPlatformWord(key) {
  if (['digi', 'campus', 'digicampus'].includes(key)) return true;
  return platforms.all().some((p) => p.aliasRegex.test(key));
}

function isCut(tok) {
  if (!tok.key) return true;
  if (/^\d+$/.test(tok.key)) return false; // course numbers (e.g. CS 101) stay
  return STOP.has(tok.key) || GENERIC.has(tok.key) || isPlatformWord(tok.key) || isIntentWord(tok.key);
}

function formatCourse(runTokens) {
  const text = runTokens.map((t) => t.raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')).join(' ');
  if (/[A-Z]/.test(text)) return text; // user already capitalised it
  if (runTokens.length === 1 && text.length <= 4 && !/\d/.test(text)) return text.toUpperCase();
  return text.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Pull a course name out of free text without any course database:
 * whatever is left after removing question words, intent words and platform
 * names, if it looks like a course (acronym, code, or introduced by "for/in/of").
 */
function extractCourse(text) {
  const toks = tokenize(text);
  const runs = [];
  let current = [];
  toks.forEach((tok, i) => {
    if (isCut(tok)) {
      if (current.length) runs.push(current);
      current = [];
    } else {
      current.push({ ...tok, i });
    }
  });
  if (current.length) runs.push(current);

  let best = null;
  for (const run of runs) {
    const joined = run.map((t) => t.raw).join(' ');
    if (!/[A-Za-z]/.test(joined) || run.length > 4 || joined.length > 40) continue;

    const first = run[0].i;
    const last = run[run.length - 1].i;
    const prev = toks[first - 1] ? toks[first - 1].key : '';
    const next = toks[last + 1] ? toks[last + 1].key : '';

    let score = 0;
    if (CUE_PREPS.has(prev) || CUE_NOUNS.has(prev) || CUE_NOUNS.has(next)) score += 2;
    if ((prev && isIntentWord(prev)) || (next && isIntentWord(next))) score += 2;
    const cleaned = run.map((t) => t.raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''));
    if (run.length === 1 && /^[A-Z]{2,8}$/.test(cleaned[0])) score += 2;
    if (/^[A-Za-z]{2,5}[- ]?\d{2,4}[A-Za-z]?$/.test(cleaned.join(' '))) score += 2;
    if (run.some((t) => t.i > 0 && /^[A-Z][a-z]/.test(t.raw))) score += 1.5;
    if (toks.length === 1 && run.length === 1) score += 2; // a lone word like "dbms" is most likely a course

    if (score >= 2 && (!best || score > best.score)) best = { run, score };
  }
  return best ? formatCourse(best.run) : null;
}

const SEARCH_MODE_RE = /\b(?:everything|anything)\b|\ball (?:about|info|information|details)\b|\boverview\b|\bfull details\b|\bcomplete (?:details|info)\b/;
// Faculty-side actions ("upload marks", "enter attendance") have no verified routes yet.
const FACULTY_RE = /\b(?:upload|enter|publish|post|fill)\b[^.?!]*\b(?:marks?|grades?|attendance)\b/;

/**
 * @returns {{
 *  normalized: string, hasContent: boolean, platformMention: string|null,
 *  ranked: {id:string,score:number}[], primary: string|null, alsoLikely: string[],
 *  strongCount: number, course: string|null, searchMode: boolean,
 *  facultyAction: boolean, confidence: number
 * }}
 */
function parseQuery(text) {
  const normalized = normalize(text);
  const hasContent = /[\p{L}\p{N}]/u.test(normalized);
  const ranked = scoreIntents(normalized).filter((r) => r.score >= MIN_SCORE);
  const top = ranked[0] || null;
  const alsoLikely = top
    ? ranked.slice(1).filter((r) => r.score >= top.score * AMBIGUITY_RATIO).map((r) => r.id)
    : [];

  const faculty = FACULTY_RE.test(normalized) && !/\bassignments?\b/.test(normalized);

  const course = extractCourse(text);
  const wordCount = normalized.split(' ').filter(Boolean).length;
  // A bare course ("DBMS", "operating systems") means "show me everything"; a long
  // sentence with an unrecognised intent goes to the AI / clarification path instead.
  const searchMode = SEARCH_MODE_RE.test(normalized) || (Boolean(course) && !top && wordCount <= 3) || ranked.length >= 3;

  let confidence = 0;
  if (top) confidence = Math.min(0.95, 0.5 + top.score * 0.1) - (alsoLikely.length ? 0.2 : 0);

  return {
    normalized,
    hasContent,
    platformMention: platforms.detectInText(normalized),
    ranked,
    primary: top ? top.id : null,
    alsoLikely,
    strongCount: ranked.length,
    course,
    searchMode,
    facultyAction: faculty,
    confidence: Math.max(0, Number(confidence.toFixed(2))),
  };
}

module.exports = { parseQuery, extractCourse };

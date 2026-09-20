'use strict';

const DATA_URL_PREFIX = /^data:(image\/(?:png|jpe?g|webp));base64,/i;
const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/;

function fail(code, message, field) {
  return { ok: false, status: 400, code, message, field };
}

/** Identify the real image type from magic bytes (never trust the declared MIME). */
function sniffImageType(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function validateImage(dataUrl, maxBytes) {
  if (typeof dataUrl !== 'string' || !DATA_URL_PREFIX.test(dataUrl)) {
    return fail('INVALID_IMAGE', 'Upload a PNG, JPEG or WebP screenshot.', 'image');
  }
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  if (!BASE64_BODY.test(base64)) {
    return fail('INVALID_IMAGE', 'The screenshot data is corrupted. Try uploading it again.', 'image');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 200) {
    return fail('INVALID_IMAGE', 'That image is too small to read. Upload a full screenshot.', 'image');
  }
  if (bytes.length > maxBytes) {
    return fail(
      'IMAGE_TOO_LARGE',
      `The screenshot is larger than ${Math.round(maxBytes / (1024 * 1024))} MB. Crop it or use a smaller image.`,
      'image',
    );
  }
  const mimeType = sniffImageType(bytes);
  if (!mimeType) {
    return fail('INVALID_IMAGE', 'That file is not a valid PNG, JPEG or WebP image.', 'image');
  }
  return { ok: true, value: { mimeType, base64, size: bytes.length } };
}

/**
 * @returns {{ok:true,value:{platform:string,question:string,image:object|null}}
 *          |{ok:false,status:number,code:string,message:string,field?:string}}
 */
function validateRouteRequest(body, { config, platforms }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail('INVALID_REQUEST', 'Send a JSON body with a question and/or a screenshot.');
  }

  // Platform: default to the configured one, but never accept unknown values.
  let platform = config.defaultPlatform;
  if (body.platform !== undefined && body.platform !== null && body.platform !== '') {
    if (typeof body.platform !== 'string' || !platforms.has(body.platform)) {
      return fail('UNKNOWN_PLATFORM', 'Choose one of the supported platforms.', 'platform');
    }
    platform = body.platform.toLowerCase();
  }

  // Question
  let question = '';
  if (body.question !== undefined && body.question !== null) {
    if (typeof body.question !== 'string') return fail('INVALID_QUESTION', 'The question must be text.', 'question');
    // eslint-disable-next-line no-control-regex
    question = body.question.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (question.length > config.maxQuestionChars) {
      return fail(
        'QUESTION_TOO_LONG',
        `Keep your question under ${config.maxQuestionChars} characters (it is ${question.length}).`,
        'question',
      );
    }
  }

  // Screenshot
  let image = null;
  if (body.image !== undefined && body.image !== null && body.image !== '') {
    const checked = validateImage(body.image, config.maxImageBytes);
    if (!checked.ok) return checked;
    image = checked.value;
  }

  const hasText = /[\p{L}\p{N}]/u.test(question);
  if (!hasText && !image) {
    return fail(
      'EMPTY_INPUT',
      question
        ? 'That does not look like a question. Try something like \u201CDBMS attendance\u201D.'
        : 'Describe what you are looking for, or attach a screenshot.',
      'question',
    );
  }

  return { ok: true, value: { platform, question: hasText ? question : '', image } };
}

module.exports = { validateRouteRequest, validateImage, sniffImageType };

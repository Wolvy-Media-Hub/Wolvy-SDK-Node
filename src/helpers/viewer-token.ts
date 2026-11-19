import { createHmac } from 'node:crypto';

/** Shortest lifetime the API issues, in seconds. */
export const VIEWER_TOKEN_MIN_TTL = 60;
/** Longest lifetime the API issues, in seconds (24 hours). */
export const VIEWER_TOKEN_MAX_TTL = 86400;
/** Longest viewer id, in UTF-8 bytes. */
export const VIEWER_ID_MAX_BYTES = 64;

export interface SignViewerTokenOptions {
  /** The signing time, as Unix seconds or a Date. Default: now. `exp` is `now + ttlSeconds`. */
  now?: number | Date;
}

/**
 * Sign a viewer token (`vt`) locally, with no API call:
 *
 *     payload = base64url(JSON {"vid": viewerId, "exp": now + ttlSeconds})
 *     vt      = payload + "." + base64url(HMAC-SHA256(secret, payload))
 *
 * The result is byte-identical to the `vt` of `POST /v1/videos/{id}/playback-tokens`
 * for the same viewer id, lifetime and second, because the same rules apply: the id is
 * trimmed of spaces, tabs, line breaks, NUL and vertical tab at both ends and must then be
 * 1–64 UTF-8 bytes; the lifetime is a whole number from 60 to 86400 seconds; the JSON is
 * written as PHP's json_encode writes it (`/` as `\/`, non-ASCII as `\uXXXX`).
 *
 * `secret` is the account's signing secret (dashboard: Settings → Watermark → Signing
 * secret), used as the text shown there — never hex-decoded. Keep it on your server.
 *
 * Throws TypeError or RangeError for input the API would refuse.
 */
export function signViewerToken(
  viewerId: string,
  ttlSeconds: number,
  secret: string,
  options: SignViewerTokenOptions = {},
): string {
  if (typeof viewerId !== 'string') {
    throw new TypeError('signViewerToken: viewerId must be a string.');
  }
  const vid = phpTrim(viewerId);
  if (vid === '') {
    throw new RangeError('signViewerToken: viewerId must not be empty.');
  }
  if (hasLoneSurrogate(vid)) {
    throw new RangeError('signViewerToken: viewerId is not valid Unicode text.');
  }
  if (Buffer.byteLength(vid, 'utf8') > VIEWER_ID_MAX_BYTES) {
    throw new RangeError(`signViewerToken: viewerId must be at most ${VIEWER_ID_MAX_BYTES} bytes (UTF-8).`);
  }
  if (
    typeof ttlSeconds !== 'number' ||
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < VIEWER_TOKEN_MIN_TTL ||
    ttlSeconds > VIEWER_TOKEN_MAX_TTL
  ) {
    throw new RangeError(
      `signViewerToken: ttlSeconds must be a whole number from ${VIEWER_TOKEN_MIN_TTL} to ${VIEWER_TOKEN_MAX_TTL}.`,
    );
  }
  if (typeof secret !== 'string' || secret === '') {
    throw new TypeError('signViewerToken: secret must be a non-empty string (the account signing secret).');
  }

  const exp = unixSeconds(options.now) + ttlSeconds;
  const json = `{"vid":${phpJsonString(vid)},"exp":${exp}}`;
  const payload = Buffer.from(json, 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function unixSeconds(now: number | Date | undefined): number {
  if (now === undefined) return Math.floor(Date.now() / 1000);
  const seconds = now instanceof Date ? Math.floor(now.getTime() / 1000) : now;
  if (typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds < 0) {
    throw new TypeError('signViewerToken: options.now must be whole Unix seconds or a valid Date.');
  }
  return seconds;
}

/** PHP's trim(): only " \t\n\r\0\x0B", not every Unicode space as String.prototype.trim. */
export function phpTrim(value: string): string {
  return value.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, '');
}

function hasLoneSurrogate(value: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
}

/** A JSON string literal exactly as PHP's json_encode() (no flags) writes it. */
export function phpJsonString(value: string): string {
  let out = '"';
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    switch (c) {
      case 0x22:
        out += '\\"';
        break;
      case 0x5c:
        out += '\\\\';
        break;
      case 0x2f:
        out += '\\/';
        break;
      case 0x08:
        out += '\\b';
        break;
      case 0x0c:
        out += '\\f';
        break;
      case 0x0a:
        out += '\\n';
        break;
      case 0x0d:
        out += '\\r';
        break;
      case 0x09:
        out += '\\t';
        break;
      default:
        // Control characters and everything outside ASCII as \uXXXX (UTF-16 units, so a
        // character outside the BMP becomes its surrogate pair), lower-case hex. DEL stays raw.
        out += c < 0x20 || c > 0x7f ? `\\u${c.toString(16).padStart(4, '0')}` : value[i];
    }
  }
  return `${out}"`;
}

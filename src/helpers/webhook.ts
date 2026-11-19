import { createHmac, timingSafeEqual } from 'node:crypto';
import { WolvySignatureVerificationError } from '../errors.js';
import type { WolvyWebhookEvent } from '../types.js';

/** The header every delivery carries: `Wolvy-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>`. */
export const WEBHOOK_SIGNATURE_HEADER = 'wolvy-signature';
/** How far `t` may be from your clock, in seconds, by default. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export interface VerifyWebhookOptions {
  /** Your clock, as Unix seconds. Default: now. For tests and test vectors. */
  now?: number;
}

/**
 * Verify a webhook delivery and return its event.
 *
 * Checks `v1 = hex(HMAC-SHA256(secret, t + "." + rawBody))` in constant time, then that `t`
 * is within `tolerance` seconds of now (default 300; pass Infinity to skip). Throws
 * WolvySignatureVerificationError otherwise: answer such a delivery with 400 and ignore it.
 *
 * `rawBody` must be the exact bytes received (a string or Buffer), read before any JSON
 * parser: a re-serialised object never matches. `secret` is the endpoint's `whsec_…` secret,
 * as returned once by webhookEndpoints.create().
 */
export function verifyWebhook(
  rawBody: string | Uint8Array,
  signatureHeader: string | readonly string[] | null | undefined,
  secret: string,
  tolerance: number = WEBHOOK_TOLERANCE_SECONDS,
  options: VerifyWebhookOptions = {},
): WolvyWebhookEvent {
  const body = rawBytes(rawBody);
  if (typeof secret !== 'string' || secret === '') {
    throw new TypeError('verifyWebhook: secret must be the endpoint signing secret (whsec_…).');
  }
  if (typeof tolerance !== 'number' || Number.isNaN(tolerance) || tolerance < 0) {
    throw new RangeError('verifyWebhook: tolerance must be a number of seconds, 0 or more (Infinity skips the check).');
  }

  const header = Array.isArray(signatureHeader) ? signatureHeader.join(',') : signatureHeader;
  if (typeof header !== 'string' || header.trim() === '') {
    throw fail('missing_signature_header', 'The delivery has no Wolvy-Signature header.');
  }

  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't' && timestamp === null) timestamp = value;
    if (key === 'v1') signatures.push(value.toLowerCase());
  }
  if (timestamp === null || !/^\d{1,15}$/.test(timestamp) || signatures.length === 0) {
    throw fail('invalid_signature_header', 'The Wolvy-Signature header is not in the form t=<unix seconds>,v1=<hex>.');
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest();
  const matched = signatures.some((signature) => {
    if (!/^[0-9a-f]{64}$/.test(signature)) return false;
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
  });
  if (!matched) {
    throw fail(
      'signature_mismatch',
      'The signature does not match: check the endpoint secret, and pass the raw body exactly as received.',
    );
  }

  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > tolerance) {
    throw fail(
      'timestamp_outside_tolerance',
      `The delivery was signed at ${timestamp}, more than ${tolerance} seconds from now (${now}): possibly a replay.`,
    );
  }

  let event: unknown;
  try {
    event = JSON.parse(body.toString('utf8'));
  } catch (cause) {
    throw fail('invalid_payload', 'The signature is valid but the body is not JSON.', cause);
  }
  if (typeof event !== 'object' || event === null || typeof (event as { type?: unknown }).type !== 'string') {
    throw fail('invalid_payload', 'The signature is valid but the body is not a Wolvy event.');
  }
  return event as WolvyWebhookEvent;
}

function rawBytes(rawBody: unknown): Buffer {
  if (typeof rawBody === 'string') return Buffer.from(rawBody, 'utf8');
  if (Buffer.isBuffer(rawBody)) return rawBody;
  if (rawBody instanceof Uint8Array) return Buffer.from(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength);
  if (rawBody instanceof ArrayBuffer) return Buffer.from(rawBody);
  throw new TypeError(
    'verifyWebhook: rawBody must be the raw request body as a string or Buffer, not a parsed object. ' +
      'In Express use express.raw({ type: "application/json" }) on the webhook route; ' +
      'in a Next.js route handler use await request.text().',
  );
}

function fail(code: string, message: string, cause?: unknown): WolvySignatureVerificationError {
  return new WolvySignatureVerificationError(message, { code, cause });
}

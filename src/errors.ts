/**
 * Every error the SDK throws is a WolvyError.
 *
 *   WolvyError
 *   ├── WolvyAPIError                    the API answered with an error (has `status`)
 *   │   ├── WolvyInvalidRequestError     type invalid_request_error: 400, 405, 422
 *   │   │   ├── WolvyNotFoundError       404
 *   │   │   └── WolvyConflictError       409
 *   │   ├── WolvyAuthenticationError     401
 *   │   ├── WolvyPermissionError         403
 *   │   ├── WolvyRateLimitError          429
 *   │   └── WolvyServerError             500 and above
 *   ├── WolvyConnectionError             no answer: network failure or aborted request
 *   │   └── WolvyTimeoutError            no answer within `timeout`
 *   └── WolvySignatureVerificationError  verifyWebhook() refused a delivery
 *
 * Branch on `code`: it is the API's stable machine code (`video_not_found`,
 * `rate_limit_exceeded`, …). Errors the SDK raises itself have codes of their own,
 * listed on each class.
 */

/** The X-RateLimit-* and Retry-After headers of an answer, as numbers. */
export interface RateLimitInfo {
  /** Requests allowed per minute for this key. */
  limit: number | null;
  /** Requests left in the current minute. */
  remaining: number | null;
  /** When the minute window resets, as Unix seconds. */
  reset: number | null;
  /** Requests allowed per day for this key. */
  dailyLimit: number | null;
  /** Requests left today (UTC). */
  dailyRemaining: number | null;
  /** Seconds to wait before retrying, from Retry-After (429 answers). */
  retryAfter: number | null;
}

/** The error codes the Developer API documents. Others may be added; `code` is typed as string. */
export type WolvyErrorCode =
  | 'invalid_json'
  | 'unsupported_content_type'
  | 'unknown_parameter'
  | 'missing_parameter'
  | 'invalid_parameter'
  | 'no_fields'
  | 'too_many_ids'
  | 'invalid_cursor'
  | 'invalid_idempotency_key'
  | 'folder_not_found'
  | 'missing_api_key'
  | 'invalid_api_key'
  | 'expired_api_key'
  | 'insufficient_scope'
  | 'ip_not_allowed'
  | 'account_inactive'
  | 'unknown_endpoint'
  | 'not_found'
  | 'video_not_found'
  | 'caption_not_found'
  | 'chapter_not_found'
  | 'moment_not_found'
  | 'tag_not_found'
  | 'session_not_found'
  | 'viewer_not_found'
  | 'webhook_endpoint_not_found'
  | 'method_not_allowed'
  | 'idempotency_key_reused'
  | 'request_in_progress'
  | 'chapter_overlap'
  | 'moment_exists'
  | 'folder_loop'
  | 'folder_too_deep'
  | 'not_available'
  | 'no_active_plan'
  | 'insufficient_storage'
  | 'too_many_tags'
  | 'invalid_source_url'
  | 'source_not_allowed'
  | 'source_unreachable'
  | 'unsupported_source_type'
  | 'source_too_large'
  | 'too_many_redirects'
  | 'invalid_caption_file'
  | 'account_settings_missing'
  | 'rate_limit_exceeded'
  | 'internal_error'
  | 'service_unavailable';

/** Codes the SDK itself uses, for failures that are not an API error answer. */
export type WolvySdkErrorCode =
  | 'connection_error'
  | 'request_aborted'
  | 'timeout'
  | 'unexpected_response'
  | 'invalid_response'
  | 'no_next_page'
  | 'missing_signature_header'
  | 'invalid_signature_header'
  | 'signature_mismatch'
  | 'timestamp_outside_tolerance'
  | 'invalid_payload';

/** The `error.type` values of the API. */
export type WolvyErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'permission_error'
  | 'rate_limit_error'
  | 'api_error';

export interface WolvyErrorInit {
  code: string;
  status?: number | null;
  type?: string | null;
  param?: string | null;
  requestId?: string | null;
  headers?: Record<string, string>;
  rateLimit?: RateLimitInfo | null;
  raw?: unknown;
  cause?: unknown;
}

export class WolvyError extends Error {
  /** The API's stable machine code, or one of the SDK's own codes (WolvySdkErrorCode). */
  readonly code: WolvyErrorCode | WolvySdkErrorCode | (string & {});
  /** HTTP status of the answer; null when there was no answer. */
  readonly status: number | null;
  /** The API's `error.type`. */
  readonly type: WolvyErrorType | (string & {}) | null;
  /** The request field or query parameter the error is about, when the API names one. */
  readonly param: string | null;
  /** The API's request id (`req_…`): quote it to Wolvy support. */
  readonly requestId: string | null;
  /** Rate-limit headers of the answer (the API sends them on every authenticated answer). */
  readonly rateLimit: RateLimitInfo | null;
  /** Response headers, lower-cased names. Empty when there was no answer. */
  readonly headers: Record<string, string>;
  /** The parsed error body, or the raw text when it was not JSON. */
  readonly raw: unknown;

  constructor(message: string, init: WolvyErrorInit) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = new.target.name;
    this.code = init.code;
    this.status = init.status ?? null;
    this.type = init.type ?? null;
    this.param = init.param ?? null;
    this.requestId = init.requestId ?? null;
    this.rateLimit = init.rateLimit ?? null;
    this.headers = init.headers ?? {};
    this.raw = init.raw;
  }
}

/** The API answered with an HTTP error. `status` is always set. */
export class WolvyAPIError extends WolvyError {
  declare readonly status: number;
}

/** 400, 405 and 422 answers (`type: invalid_request_error`), and the parent of 404 and 409. */
export class WolvyInvalidRequestError extends WolvyAPIError {}

/** 404: the resource does not exist, or belongs to another account (the API never tells the two apart). */
export class WolvyNotFoundError extends WolvyInvalidRequestError {}

/** 409: `idempotency_key_reused`, `request_in_progress`, `chapter_overlap`, `moment_exists`, `folder_loop`, `folder_too_deep`, `not_available`. */
export class WolvyConflictError extends WolvyInvalidRequestError {}

/** 401: `missing_api_key`, `invalid_api_key`, `expired_api_key`. */
export class WolvyAuthenticationError extends WolvyAPIError {}

/** 403: `insufficient_scope`, `ip_not_allowed`, `account_inactive`. */
export class WolvyPermissionError extends WolvyAPIError {}

/** 429 `rate_limit_exceeded`, after the SDK's own retries (if any) were used up. */
export class WolvyRateLimitError extends WolvyAPIError {
  /** Seconds the API asked to wait (Retry-After). */
  get retryAfter(): number | null {
    return this.rateLimit?.retryAfter ?? null;
  }
}

/** 500 `internal_error`, 503 `service_unavailable`, and any other 5xx (also from a proxy in front of the API). */
export class WolvyServerError extends WolvyAPIError {}

/** The request got no answer: a network failure (`connection_error`) or your AbortSignal (`request_aborted`). */
export class WolvyConnectionError extends WolvyError {}

/** No answer within the configured `timeout` (`code: timeout`). */
export class WolvyTimeoutError extends WolvyConnectionError {}

/**
 * verifyWebhook() refused a delivery. `code` says why: `missing_signature_header`,
 * `invalid_signature_header`, `signature_mismatch`, `timestamp_outside_tolerance` or
 * `invalid_payload`. Answer the delivery with a 400 and do not act on it.
 */
export class WolvySignatureVerificationError extends WolvyError {}

/** The class for an API error answer, by HTTP status (then by the API's `type`). */
export function errorClassFor(status: number, type: string | null): typeof WolvyAPIError {
  switch (status) {
    case 401:
      return WolvyAuthenticationError;
    case 403:
      return WolvyPermissionError;
    case 404:
      return WolvyNotFoundError;
    case 409:
      return WolvyConflictError;
    case 429:
      return WolvyRateLimitError;
  }
  if (status >= 500) return WolvyServerError;
  if (status >= 400 && status < 500 && (type === 'invalid_request_error' || type === null)) {
    return WolvyInvalidRequestError;
  }
  return WolvyAPIError;
}

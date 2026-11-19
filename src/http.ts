import { randomUUID } from 'node:crypto';
import {
  errorClassFor,
  WolvyConnectionError,
  WolvyError,
  WolvyTimeoutError,
  type RateLimitInfo,
  type WolvyAPIError,
} from './errors.js';
import { VERSION } from './version.js';

export const DEFAULT_BASE_URL = 'https://api.wolvy.net/v1';
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_RETRIES = 2;

/** A wait longer than this (a daily-limit 429, say) is not slept through: the error is thrown instead. */
const MAX_RETRY_WAIT_MS = 60_000;
const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8_000;

/** The subset of fetch the SDK uses. Node's global fetch fits; so does undici's or a test double. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface WolvyClientOptions {
  /** A Developer API key (`wv_live_…`). Default: the WOLVY_API_KEY environment variable. */
  apiKey?: string;
  /** Default `https://api.wolvy.net/v1`. Must include the `/v1`. */
  baseUrl?: string;
  /** Milliseconds to wait for each attempt's answer. Default 60000. */
  timeout?: number;
  /** Retries after a network error, a timeout, a 429, a 409 request_in_progress or a 5xx. Default 2. */
  maxRetries?: number;
  /** A fetch implementation. Default: the global fetch (Node 18+). */
  fetch?: FetchLike;
  /** Headers added to every request. */
  defaultHeaders?: Record<string, string>;
}

/** Per-call options, the last argument of every method. */
export interface RequestOptions {
  /**
   * POST only. The SDK sends a new random key on every POST that changes something and reuses
   * it for that call's retries, so a retry never runs the operation twice. Pass your own to make
   * a POST safe across your own retries (at most 255 characters), or null to send none.
   * Minting a playback token sends none unless you pass one (minting changes nothing).
   */
  idempotencyKey?: string | null;
  /** Milliseconds, per attempt. */
  timeout?: number;
  maxRetries?: number;
  /** Abort the call (no retry follows an abort). */
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ApiRequest {
  method: HttpMethod;
  /** Relative to the base URL, starting with "/" (`/videos/abc`). */
  path: string;
  query?: object | undefined;
  body?: unknown;
  options?: RequestOptions | undefined;
  /** Resolve against the API root instead of the versioned base (only GET /health). */
  root?: boolean;
  /**
   * A POST with no side effect (minting a playback token): no automatic Idempotency-Key, and
   * still retried after network errors, timeouts and 5xx, since running it twice is harmless.
   */
  safeToRepeat?: boolean;
}

export interface RawAnswer {
  status: number;
  headers: Record<string, string>;
  text: string;
}

/** The HTTP engine: headers, timeouts, retries, idempotency keys and error mapping. */
export class HttpClient {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly #apiKey: string;
  readonly #fetch: FetchLike;
  readonly #defaultHeaders: Record<string, string>;

  constructor(options: WolvyClientOptions = {}) {
    const apiKey = options.apiKey ?? readEnv('WOLVY_API_KEY');
    if (typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new TypeError(
        'Wolvy: no API key. Pass { apiKey } or set the WOLVY_API_KEY environment variable. ' +
          'Keys are created in the dashboard (Settings → API keys).',
      );
    }
    const fetchImpl = options.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (typeof fetchImpl !== 'function') {
      throw new TypeError('Wolvy: no fetch available. Use Node 18 or later, or pass { fetch }.');
    }
    this.#apiKey = apiKey.trim();
    this.#fetch = fetchImpl;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = nonNegative(options.timeout, DEFAULT_TIMEOUT_MS, 'timeout');
    this.maxRetries = nonNegativeInt(options.maxRetries, DEFAULT_MAX_RETRIES, 'maxRetries');
    this.#defaultHeaders = { ...(options.defaultHeaders ?? {}) };
    // Validate the base URL now rather than on the first request.
    new URL(this.baseUrl);
  }

  /** The URL a request goes to. */
  url(path: string, query?: object, root = false): string {
    let base = this.baseUrl;
    if (root) {
      const u = new URL(base);
      u.pathname = u.pathname.replace(/\/v\d+\/?$/, '').replace(/\/+$/, '');
      base = u.toString().replace(/\/+$/, '');
    }
    const qs = query ? serializeQuery(query) : '';
    return base + path + (qs ? `?${qs}` : '');
  }

  /** Send a request; resolve to the parsed JSON answer (undefined for 204), or throw a WolvyError. */
  async request<T>(req: ApiRequest): Promise<T> {
    const answer = await this.send(req);
    if (answer.status === 204 || answer.text === '') return undefined as T;
    try {
      return JSON.parse(answer.text) as T;
    } catch (cause) {
      throw new WolvyError(`Wolvy API answered HTTP ${answer.status} with a body that is not JSON.`, {
        code: 'invalid_response',
        status: answer.status,
        headers: answer.headers,
        requestId: answer.headers['x-request-id'] ?? null,
        rateLimit: parseRateLimit(answer.headers),
        raw: answer.text,
        cause,
      });
    }
  }

  /** Send a request with retries; resolve to the raw 2xx answer. */
  async send(req: ApiRequest): Promise<RawAnswer> {
    const options = req.options ?? {};
    const url = this.url(req.path, req.query, req.root);
    const timeout = nonNegative(options.timeout, this.timeout, 'timeout');
    const maxRetries = nonNegativeInt(options.maxRetries, this.maxRetries, 'maxRetries');

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': userAgent(),
      ...this.#defaultHeaders,
      Authorization: `Bearer ${this.#apiKey}`,
    };
    let body: string | undefined;
    if (req.body !== undefined) {
      body = JSON.stringify(req.body);
      headers['Content-Type'] = 'application/json';
    }
    if (req.method === 'POST') {
      // One key per call, reused by every retry of it: a retry after a lost answer is replayed
      // by the API (Idempotent-Replay: true) instead of running twice. A POST that changes
      // nothing gets none by default: the API would store every answer for 24 hours.
      const key =
        options.idempotencyKey !== undefined ? options.idempotencyKey : req.safeToRepeat ? null : randomUUID();
      if (key !== null) headers['Idempotency-Key'] = key;
    }
    Object.assign(headers, options.headers ?? {});
    // A POST sent without an Idempotency-Key may have run although its answer was lost, so
    // only a refusal that certainly ran nothing (429) is retried for it, unless running it
    // twice is harmless.
    const replaySafe = req.method !== 'POST' || req.safeToRepeat === true || headers['Idempotency-Key'] !== undefined;

    for (let attempt = 0; ; attempt++) {
      let answer: RawAnswer;
      try {
        answer = await this.#attempt(url, { method: req.method, headers, body }, timeout, options.signal);
      } catch (error) {
        const wolvyError = error as WolvyError;
        if (wolvyError.code !== 'request_aborted' && replaySafe && attempt < maxRetries) {
          await sleep(backoff(attempt), options.signal);
          continue;
        }
        throw wolvyError;
      }

      if (answer.status >= 200 && answer.status < 300) return answer;

      const error = apiError(answer);
      if (attempt < maxRetries && isRetryable(answer.status, error.code) && (replaySafe || answer.status === 429)) {
        const wait = retryWait(answer, attempt);
        if (wait !== null) {
          await sleep(wait, options.signal);
          continue;
        }
      }
      throw error;
    }
  }

  async #attempt(
    url: string,
    init: { method: string; headers: Record<string, string>; body: string | undefined },
    timeout: number,
    signal: AbortSignal | undefined,
  ): Promise<RawAnswer> {
    if (signal?.aborted) throw aborted(signal.reason);
    const controller = new AbortController();
    let timedOut = false;
    // setTimeout cannot wait longer than 2^31 - 1 ms; anything above that means "no timeout".
    const timer = timeout > 0 && timeout <= 2_147_483_647
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeout)
      : undefined;
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const requestInit: RequestInit = { method: init.method, headers: init.headers, signal: controller.signal };
      if (init.body !== undefined) requestInit.body = init.body;
      const response = await this.#fetch(url, requestInit);
      const text = await response.text();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        headers[name.toLowerCase()] = value;
      });
      return { status: response.status, headers, text };
    } catch (cause) {
      if (signal?.aborted) throw aborted(signal.reason);
      if (timedOut) {
        throw new WolvyTimeoutError(`Wolvy API did not answer within ${timeout} ms.`, { code: 'timeout', cause });
      }
      throw new WolvyConnectionError(`Could not reach the Wolvy API: ${describe(cause)}`, {
        code: 'connection_error',
        cause,
      });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

/** `wolvy-node/1.0.1 node/22.11.0` */
export function userAgent(): string {
  const node = typeof process !== 'undefined' && process.versions?.node ? process.versions.node : 'unknown';
  return `wolvy-node/${VERSION} node/${node}`;
}

/** The error for a non-2xx answer: the API's own error body when there is one. */
export function apiError(answer: RawAnswer): WolvyAPIError {
  let parsed: unknown;
  try {
    parsed = answer.text === '' ? undefined : JSON.parse(answer.text);
  } catch {
    parsed = undefined;
  }
  const body = isRecord(parsed) && isRecord(parsed['error']) ? parsed['error'] : null;
  const type = body && typeof body['type'] === 'string' ? body['type'] : null;
  const code = body && typeof body['code'] === 'string' ? body['code'] : 'unexpected_response';
  const message =
    body && typeof body['message'] === 'string'
      ? body['message']
      : `Wolvy API answered HTTP ${answer.status} without a Wolvy error body.`;
  const ErrorClass = errorClassFor(answer.status, type);
  return new ErrorClass(message, {
    code,
    status: answer.status,
    type,
    param: body && typeof body['param'] === 'string' ? body['param'] : null,
    requestId:
      body && typeof body['request_id'] === 'string' ? body['request_id'] : (answer.headers['x-request-id'] ?? null),
    headers: answer.headers,
    rateLimit: parseRateLimit(answer.headers),
    raw: parsed ?? answer.text,
  });
}

/** X-RateLimit-* and Retry-After as numbers; null when the answer carries none of them. */
export function parseRateLimit(headers: Record<string, string>): RateLimitInfo | null {
  const num = (name: string): number | null => {
    const value = headers[name];
    if (value === undefined || value.trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const info: RateLimitInfo = {
    limit: num('x-ratelimit-limit'),
    remaining: num('x-ratelimit-remaining'),
    reset: num('x-ratelimit-reset'),
    dailyLimit: num('x-ratelimit-daily-limit'),
    dailyRemaining: num('x-ratelimit-daily-remaining'),
    retryAfter: parseRetryAfter(headers['retry-after']),
  };
  return Object.values(info).every((v) => v === null) ? null : info;
}

/** Retry-After in seconds: a number of seconds, or an HTTP date. */
export function parseRetryAfter(value: string | undefined, now = Date.now()): number | null {
  if (value === undefined || value.trim() === '') return null;
  if (/^\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim());
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - now) / 1000));
}

/**
 * Retried: 429, 408, 409 request_in_progress (the original call with this idempotency key is
 * still running) and every 5xx. Never retried: other 4xx, which would fail the same way again.
 */
export function isRetryable(status: number, code: string): boolean {
  return status === 429 || status === 408 || status >= 500 || (status === 409 && code === 'request_in_progress');
}

/**
 * How long to wait before the next attempt, in ms; null when the API asks for longer than
 * MAX_RETRY_WAIT_MS (a daily limit), so the 429 is thrown rather than slept through.
 */
export function retryWait(answer: RawAnswer, attempt: number, now = Date.now()): number | null {
  const retryAfter = parseRetryAfter(answer.headers['retry-after'], now);
  let wait: number;
  if (retryAfter !== null) {
    wait = retryAfter * 1000;
  } else if (answer.status === 429 && answer.headers['x-ratelimit-reset'] !== undefined) {
    const reset = Number(answer.headers['x-ratelimit-reset']);
    wait = Number.isFinite(reset) ? Math.max(0, reset * 1000 - now) : backoff(attempt);
  } else {
    return backoff(attempt);
  }
  return wait > MAX_RETRY_WAIT_MS ? null : wait;
}

/** Exponential backoff with jitter: about 0.5 s, 1 s, 2 s … capped at 8 s. */
export function backoff(attempt: number): number {
  const base = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * 2 ** attempt);
  return Math.round(base * (0.75 + Math.random() * 0.25));
}

/**
 * Query string from a params object: undefined and null are left out, a Date is sent as
 * RFC 3339 (or as its UTC day for `from` and `to`).
 */
export function serializeQuery(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new TypeError(`Wolvy: '${key}' is an invalid Date.`);
      const iso = value.toISOString();
      params.append(key, key === 'from' || key === 'to' ? iso.slice(0, 10) : `${iso.slice(0, 19)}Z`);
    } else {
      params.append(key, String(value));
    }
  }
  return params.toString();
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(aborted(signal.reason));
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(aborted(signal?.reason));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function aborted(reason: unknown): WolvyConnectionError {
  return new WolvyConnectionError('The request was aborted.', { code: 'request_aborted', cause: reason });
}

function describe(cause: unknown): string {
  if (cause instanceof Error) {
    const inner = (cause as Error & { cause?: unknown }).cause;
    return inner instanceof Error ? `${cause.message} (${inner.message})` : cause.message;
  }
  return String(cause);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readEnv(name: string): string | undefined {
  return typeof process !== 'undefined' ? process.env?.[name] : undefined;
}

function nonNegative(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new TypeError(`Wolvy: '${name}' must be a number of 0 or more.`);
  }
  return value;
}

function nonNegativeInt(value: number | undefined, fallback: number, name: string): number {
  const n = nonNegative(value, fallback, name);
  if (!Number.isInteger(n)) throw new TypeError(`Wolvy: '${name}' must be a whole number.`);
  return n;
}

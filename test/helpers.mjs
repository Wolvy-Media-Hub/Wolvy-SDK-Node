// Test doubles for fetch: a scripted sequence of answers, with every request recorded.

/** A Response-like answer. `body` objects are sent as JSON. */
export function answer(status, body, headers = {}) {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  const h = new Headers(headers);
  if (body !== undefined && typeof body !== 'string' && !h.has('content-type')) {
    h.set('content-type', 'application/json; charset=utf-8');
  }
  return new Response(status === 204 ? null : text, { status, headers: h });
}

/** An API error body as the Developer API writes it. */
export function apiErrorBody(type, code, message, extra = {}) {
  return { error: { type, code, message, ...extra, request_id: 'req_0123456789abcdef01234567' } };
}

/**
 * A fake fetch. `script` is a list of steps, one per call; a step is an answer, an Error to
 * throw, or a function (url, init, call) returning either. After the script ends, the last
 * step repeats. `calls` records { url, method, headers, body } for each call.
 */
export function fakeFetch(script) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const headers = {};
    new Headers(init.headers ?? {}).forEach((value, name) => {
      headers[name] = value;
    });
    const call = { url: String(url), method: init.method ?? 'GET', headers, body: init.body, signal: init.signal };
    calls.push(call);
    let step = script[Math.min(calls.length - 1, script.length - 1)];
    if (typeof step === 'function') step = await step(String(url), init, call);
    if (step instanceof Error) throw step;
    return typeof step?.clone === 'function' ? step.clone() : step;
  };
  return { fetch, calls };
}

/** A fetch that never answers until its signal aborts (for timeouts and aborts). */
export function hangingFetch() {
  const calls = [];
  const fetch = (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => {
        const error = new Error('This operation was aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });
  };
  return { fetch, calls };
}

export const TEST_KEY = 'wv_live_0123456789abcdefghijklmnopqrstuv';

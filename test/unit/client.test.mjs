import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  VERSION,
  Wolvy,
  WolvyAPIError,
  WolvyAuthenticationError,
  WolvyConflictError,
  WolvyConnectionError,
  WolvyError,
  WolvyInvalidRequestError,
  WolvyNotFoundError,
  WolvyPermissionError,
  WolvyRateLimitError,
  WolvyServerError,
  WolvyTimeoutError,
} from '@wolvy/node';
import { answer, apiErrorBody, fakeFetch, hangingFetch, TEST_KEY } from '../helpers.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VIDEO = { id: 'a1b2c3d4e5f60718293a', object: 'video', title: 'Onboarding' };
const FOLDER = { id: 9, object: 'folder', name: 'Week 1' };
const RATE = {
  'X-RateLimit-Limit': '120',
  'X-RateLimit-Remaining': '0',
  'X-RateLimit-Reset': '1795082280',
  'X-RateLimit-Daily-Limit': '10000',
  'X-RateLimit-Daily-Remaining': '9876',
  'X-Request-Id': 'req_header0000000000000000',
};

const client = (fetch, options = {}) => new Wolvy({ apiKey: TEST_KEY, fetch, ...options });

describe('client configuration', () => {
  it('needs an API key, and reads WOLVY_API_KEY when none is passed', () => {
    const saved = process.env.WOLVY_API_KEY;
    try {
      delete process.env.WOLVY_API_KEY;
      assert.throws(() => new Wolvy(), /no API key/);
      assert.throws(() => new Wolvy({ apiKey: '  ' }), TypeError);
      process.env.WOLVY_API_KEY = TEST_KEY;
      assert.ok(new Wolvy({ fetch: async () => answer(200, {}) }));
    } finally {
      if (saved === undefined) delete process.env.WOLVY_API_KEY;
      else process.env.WOLVY_API_KEY = saved;
    }
  });

  it('refuses a bad base URL, timeout or maxRetries', () => {
    assert.throws(() => client(async () => {}, { baseUrl: 'not a url' }));
    assert.throws(() => client(async () => {}, { timeout: -1 }), TypeError);
    assert.throws(() => client(async () => {}, { maxRetries: 1.5 }), TypeError);
  });

  it('defaults to https://api.wolvy.net/v1', async () => {
    const { fetch, calls } = fakeFetch([answer(200, { object: 'account', id: 42 })]);
    const wolvy = client(fetch);
    assert.equal(wolvy.baseUrl, 'https://api.wolvy.net/v1');
    await wolvy.account.retrieve();
    assert.equal(calls[0].url, 'https://api.wolvy.net/v1/account');
  });
});

describe('requests', () => {
  it('sends the key, identifies the SDK and asks for JSON', async () => {
    const { fetch, calls } = fakeFetch([answer(200, VIDEO)]);
    await client(fetch).videos.retrieve(VIDEO.id);
    const h = calls[0].headers;
    assert.equal(h.authorization, `Bearer ${TEST_KEY}`);
    assert.equal(h['user-agent'], `wolvy-node/${VERSION} node/${process.versions.node}`);
    assert.match(h['user-agent'], /^wolvy-node\/\d+\.\d+\.\d+ node\/\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/); // pre-releases too (CI "current")
    assert.equal(h.accept, 'application/json');
    assert.equal(h['content-type'], undefined, 'no body, no Content-Type');
    assert.equal(calls[0].method, 'GET');
  });

  it('sends a JSON body with Content-Type on writes, keeping null (move to root)', async () => {
    const { fetch, calls } = fakeFetch([answer(200, VIDEO)]);
    await client(fetch).videos.update(VIDEO.id, { folder_id: null, title: 'New', description: undefined });
    assert.equal(calls[0].method, 'PATCH');
    assert.equal(calls[0].headers['content-type'], 'application/json');
    assert.equal(calls[0].body, '{"folder_id":null,"title":"New"}');
  });

  it('builds query strings: skips undefined, sends dates in the formats the API reads', async () => {
    const { fetch, calls } = fakeFetch([answer(200, { object: 'list', data: [], has_more: false, next_cursor: null })]);
    const wolvy = client(fetch, { baseUrl: 'http://127.0.0.1:9/v1/' });
    await wolvy.videos.list({
      limit: 20,
      folder_id: 'root',
      q: 'a&b c',
      status: undefined,
      created_after: new Date('2026-09-01T10:20:30.456Z'),
    });
    assert.equal(
      calls[0].url,
      'http://127.0.0.1:9/v1/videos?limit=20&folder_id=root&q=a%26b+c&created_after=2026-09-01T10%3A20%3A30Z',
    );
    await wolvy.analytics.daily({ from: new Date('2026-09-01T23:59:00Z'), to: '2026-09-15' });
    assert.equal(calls[1].url, 'http://127.0.0.1:9/v1/analytics/daily?from=2026-09-01&to=2026-09-15');
    await wolvy.analytics.overview();
    assert.equal(calls[2].url, 'http://127.0.0.1:9/v1/analytics/overview');
  });

  it('URL-encodes path segments and refuses empty or malformed ids', async () => {
    const { fetch, calls } = fakeFetch([answer(204)]);
    const wolvy = client(fetch);
    await wolvy.tags.remove(VIDEO.id, 'Week 1');
    assert.equal(calls[0].url, `https://api.wolvy.net/v1/videos/${VIDEO.id}/tags/Week%201`);
    await wolvy.captions.delete(VIDEO.id, 'pt-BR');
    assert.equal(calls[1].url, `https://api.wolvy.net/v1/videos/${VIDEO.id}/captions/pt-BR`);
    assert.throws(() => wolvy.videos.retrieve(''), TypeError);
    assert.throws(() => wolvy.videos.retrieve(undefined), TypeError);
    assert.throws(() => wolvy.folders.retrieve(-1), TypeError);
    assert.throws(() => wolvy.folders.retrieve(1.5), TypeError);
    assert.throws(() => wolvy.chapters.update(VIDEO.id, 'x', {}), TypeError);
    assert.throws(() => wolvy.viewers.retrieve('a/b'), /viewers\.list/);
    assert.equal(calls.length, 2);
  });

  it('reaches /health beside the versioned base, with or without a path prefix', async () => {
    const { fetch, calls } = fakeFetch([answer(200, { object: 'health', status: 'ok', database: 'ok' })]);
    assert.equal((await client(fetch).health.check()).status, 'ok');
    await client(fetch, { baseUrl: 'http://127.0.0.1:8231/v1' }).health.check();
    await client(fetch, { baseUrl: 'https://proxy.example.com/wolvy/v1/' }).health.check();
    assert.deepEqual(
      calls.map((c) => c.url),
      ['https://api.wolvy.net/health', 'http://127.0.0.1:8231/health', 'https://proxy.example.com/wolvy/health'],
    );
  });

  it('resolves a 204 to undefined', async () => {
    const { fetch } = fakeFetch([answer(204)]);
    assert.equal(await client(fetch).videos.delete(VIDEO.id), undefined);
  });

  it('adds default and per-call headers', async () => {
    const { fetch, calls } = fakeFetch([answer(200, VIDEO)]);
    await client(fetch, { defaultHeaders: { 'X-Team': 'a' } }).videos.retrieve(VIDEO.id, { headers: { 'X-Trace': 'b' } });
    assert.equal(calls[0].headers['x-team'], 'a');
    assert.equal(calls[0].headers['x-trace'], 'b');
  });
});

describe('idempotency keys', () => {
  it('sends a fresh UUID on every POST and none on other methods', async () => {
    const { fetch, calls } = fakeFetch([answer(201, FOLDER)]);
    const wolvy = client(fetch);
    await wolvy.folders.create({ name: 'A' });
    await wolvy.folders.create({ name: 'A' });
    await wolvy.webhookEndpoints.sendTest(3);
    await wolvy.folders.retrieve(9);
    await wolvy.folders.update(9, { name: 'B' });
    await wolvy.tags.replace(VIDEO.id, { tags: [] });
    await wolvy.folders.delete(9);
    const keys = calls.map((c) => c.headers['idempotency-key']);
    assert.match(keys[0], UUID);
    assert.match(keys[1], UUID);
    assert.match(keys[2], UUID);
    assert.notEqual(keys[0], keys[1]);
    assert.deepEqual(keys.slice(3), [undefined, undefined, undefined, undefined]);
    assert.equal(calls[2].body, undefined, 'a POST without parameters sends no body');
  });

  it('uses your key, or none with null', async () => {
    const { fetch, calls } = fakeFetch([answer(201, FOLDER)]);
    const wolvy = client(fetch);
    await wolvy.folders.create({ name: 'A' }, { idempotencyKey: 'order-1234' });
    await wolvy.folders.create({ name: 'A' }, { idempotencyKey: null });
    assert.equal(calls[0].headers['idempotency-key'], 'order-1234');
    assert.equal(calls[1].headers['idempotency-key'], undefined);
  });

  it('keeps the same key and body across retries, so the API replays instead of running twice', async () => {
    const { fetch, calls } = fakeFetch([
      new TypeError('fetch failed'),
      answer(500, apiErrorBody('api_error', 'internal_error', 'A server error occurred.')),
      answer(201, FOLDER, { 'Idempotent-Replay': 'true' }),
    ]);
    const folder = await client(fetch).folders.create({ name: 'Week 1', parent_id: 7 });
    assert.deepEqual(folder, FOLDER);
    assert.equal(calls.length, 3);
    assert.equal(new Set(calls.map((c) => c.headers['idempotency-key'])).size, 1);
    assert.equal(new Set(calls.map((c) => c.body)).size, 1);
  });

  it('retries 409 request_in_progress (the original call is still running)', async () => {
    const { fetch, calls } = fakeFetch([
      answer(409, apiErrorBody('invalid_request_error', 'request_in_progress', 'still running')),
      answer(201, FOLDER),
    ]);
    assert.deepEqual(await client(fetch).folders.create({ name: 'A' }), FOLDER);
    assert.equal(calls.length, 2);
  });

  it('does not retry a POST sent without a key after a network error or a 5xx', async () => {
    const a = fakeFetch([new TypeError('fetch failed'), answer(201, FOLDER)]);
    await assert.rejects(client(a.fetch).folders.create({ name: 'A' }, { idempotencyKey: null }), WolvyConnectionError);
    assert.equal(a.calls.length, 1);
    const b = fakeFetch([answer(503, apiErrorBody('api_error', 'service_unavailable', 'down')), answer(201, FOLDER)]);
    await assert.rejects(client(b.fetch).folders.create({ name: 'A' }, { idempotencyKey: null }), WolvyServerError);
    assert.equal(b.calls.length, 1);
    const c = fakeFetch([answer(429, apiErrorBody('rate_limit_error', 'rate_limit_exceeded', 'slow'), { 'Retry-After': '0' }), answer(201, FOLDER)]);
    assert.deepEqual(await client(c.fetch).folders.create({ name: 'A' }, { idempotencyKey: null }), FOLDER);
    assert.equal(c.calls.length, 2, 'a 429 ran nothing, so it is retried even without a key');
  });
});

describe('minting playback tokens', () => {
  const TOKEN = { object: 'playback_token', video_id: VIDEO.id, viewer_id: 'user-8813', vt: 'p.s' };

  it('sends no Idempotency-Key by default (minting changes nothing)', async () => {
    const { fetch, calls } = fakeFetch([answer(201, TOKEN)]);
    const token = await client(fetch).playback.createToken(VIDEO.id, { viewer_id: 'user-8813', ttl_seconds: 3600 });
    assert.deepEqual(token, TOKEN);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].headers['idempotency-key'], undefined);
    assert.equal(calls[0].body, '{"viewer_id":"user-8813","ttl_seconds":3600}');
  });

  it('is still retried after a network error, a timeout, a 5xx and a 429, never with a key', async () => {
    let call = 0;
    const { fetch, calls } = fakeFetch([
      new TypeError('fetch failed'),
      (url, init) =>
        new Promise((_, reject) => {
          init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
      answer(503, apiErrorBody('api_error', 'service_unavailable', 'down')),
      answer(429, apiErrorBody('rate_limit_error', 'rate_limit_exceeded', 'slow'), { 'Retry-After': '0' }),
      () => {
        call++;
        return answer(201, TOKEN);
      },
    ]);
    const token = await client(fetch, { maxRetries: 4, timeout: 50 }).playback.createToken(VIDEO.id, { viewer_id: 'user-8813' });
    assert.deepEqual(token, TOKEN);
    assert.equal(calls.length, 5);
    assert.equal(call, 1);
    assert.deepEqual(calls.map((c) => c.headers['idempotency-key']), [undefined, undefined, undefined, undefined, undefined]);
  });

  it('sends your key when you pass one, the same on every retry', async () => {
    const { fetch, calls } = fakeFetch([answer(500, apiErrorBody('api_error', 'internal_error', 'x')), answer(201, TOKEN)]);
    await client(fetch).playback.createToken(VIDEO.id, { viewer_id: 'user-8813' }, { idempotencyKey: 'mint-42' });
    assert.deepEqual(calls.map((c) => c.headers['idempotency-key']), ['mint-42', 'mint-42']);
  });

  it('other POSTs still get a key automatically', async () => {
    const { fetch, calls } = fakeFetch([answer(202, { object: 'webhook_delivery', id: 1 })]);
    await client(fetch).webhookEndpoints.sendTest(3);
    assert.match(calls[0].headers['idempotency-key'], UUID);
  });
});

describe('retries', () => {
  it('retries a 5xx and a network error, then succeeds', async () => {
    const { fetch, calls } = fakeFetch([
      answer(503, apiErrorBody('api_error', 'service_unavailable', 'down')),
      new TypeError('fetch failed', { cause: new Error('ECONNRESET') }),
      answer(200, VIDEO),
    ]);
    assert.deepEqual(await client(fetch).videos.retrieve(VIDEO.id), VIDEO);
    assert.equal(calls.length, 3);
  });

  it('gives up after maxRetries (default 2) with the last error', async () => {
    const { fetch, calls } = fakeFetch([answer(502, '<html>Bad gateway</html>', { 'X-Request-Id': 'req_x' })]);
    await assert.rejects(client(fetch).videos.retrieve(VIDEO.id), (error) => {
      assert.ok(error instanceof WolvyServerError);
      assert.equal(error.status, 502);
      assert.equal(error.code, 'unexpected_response');
      assert.equal(error.requestId, 'req_x');
      assert.equal(error.raw, '<html>Bad gateway</html>');
      return true;
    });
    assert.equal(calls.length, 3);
  });

  it('obeys maxRetries per client and per call', async () => {
    const a = fakeFetch([new TypeError('fetch failed')]);
    await assert.rejects(client(a.fetch, { maxRetries: 0 }).videos.retrieve(VIDEO.id), WolvyConnectionError);
    assert.equal(a.calls.length, 1);
    const b = fakeFetch([new TypeError('fetch failed')]);
    await assert.rejects(client(b.fetch).videos.retrieve(VIDEO.id, { maxRetries: 4 }), (e) => e.code === 'connection_error');
    assert.equal(b.calls.length, 5);
  });

  it('honours Retry-After on a 429', async () => {
    const { fetch, calls } = fakeFetch([
      answer(429, apiErrorBody('rate_limit_error', 'rate_limit_exceeded', 'Rate limit exceeded.'), { ...RATE, 'Retry-After': '1' }),
      answer(200, VIDEO),
    ]);
    const started = Date.now();
    await client(fetch).videos.retrieve(VIDEO.id);
    assert.ok(Date.now() - started >= 950, 'waited about one second');
    assert.equal(calls.length, 2);
  });

  it('falls back to X-RateLimit-Reset when a 429 has no Retry-After', async () => {
    const reset = String(Math.floor(Date.now() / 1000));
    const { fetch, calls } = fakeFetch([
      answer(429, apiErrorBody('rate_limit_error', 'rate_limit_exceeded', 'slow'), { 'X-RateLimit-Reset': reset }),
      answer(200, VIDEO),
    ]);
    await client(fetch).videos.retrieve(VIDEO.id);
    assert.equal(calls.length, 2);
  });

  it('does not sleep through a long wait (a daily limit): throws the 429 at once', async () => {
    const { fetch, calls } = fakeFetch([
      answer(429, apiErrorBody('rate_limit_error', 'rate_limit_exceeded', 'Daily rate limit exceeded: 10000 requests per day.'), {
        ...RATE,
        'Retry-After': '36000',
      }),
    ]);
    await assert.rejects(client(fetch).videos.retrieve(VIDEO.id), (error) => {
      assert.ok(error instanceof WolvyRateLimitError);
      assert.equal(error.retryAfter, 36000);
      assert.deepEqual(error.rateLimit, {
        limit: 120,
        remaining: 0,
        reset: 1795082280,
        dailyLimit: 10000,
        dailyRemaining: 9876,
        retryAfter: 36000,
      });
      return true;
    });
    assert.equal(calls.length, 1);
  });

  it('never retries other 4xx answers', async () => {
    for (const [status, type, code] of [
      [400, 'invalid_request_error', 'invalid_parameter'],
      [401, 'authentication_error', 'invalid_api_key'],
      [404, 'invalid_request_error', 'video_not_found'],
      [409, 'invalid_request_error', 'idempotency_key_reused'],
      [422, 'invalid_request_error', 'no_active_plan'],
    ]) {
      const { fetch, calls } = fakeFetch([answer(status, apiErrorBody(type, code, 'no'))]);
      await assert.rejects(client(fetch).videos.retrieve(VIDEO.id), (e) => e.code === code);
      assert.equal(calls.length, 1, `${status} ${code}`);
    }
  });

  it('times out each attempt and retries, then throws WolvyTimeoutError', async () => {
    const { fetch, calls } = hangingFetch();
    await assert.rejects(client(fetch, { timeout: 30, maxRetries: 1 }).videos.retrieve(VIDEO.id), (error) => {
      assert.ok(error instanceof WolvyTimeoutError);
      assert.ok(error instanceof WolvyConnectionError);
      assert.equal(error.code, 'timeout');
      assert.equal(error.status, null);
      return true;
    });
    assert.equal(calls.length, 2);
  });

  it('stops at once, without retrying, when your AbortSignal fires', async () => {
    const { fetch, calls } = hangingFetch();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    await assert.rejects(client(fetch).videos.retrieve(VIDEO.id, { signal: controller.signal }), (error) => {
      assert.ok(error instanceof WolvyConnectionError);
      assert.ok(!(error instanceof WolvyTimeoutError));
      assert.equal(error.code, 'request_aborted');
      return true;
    });
    assert.equal(calls.length, 1);
    await assert.rejects(client(fetch).videos.retrieve(VIDEO.id, { signal: controller.signal }), (e) => e.code === 'request_aborted');
    assert.equal(calls.length, 1, 'an already aborted signal sends nothing');
  });

  it('an abort during the backoff wait ends the call', async () => {
    const { fetch, calls } = fakeFetch([answer(429, apiErrorBody('rate_limit_error', 'rate_limit_exceeded', 'x'), { 'Retry-After': '5' })]);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    const started = Date.now();
    await assert.rejects(client(fetch).videos.retrieve(VIDEO.id, { signal: controller.signal }), (e) => e.code === 'request_aborted');
    assert.ok(Date.now() - started < 2000);
    assert.equal(calls.length, 1);
  });
});

describe('errors', () => {
  const cases = [
    [400, 'invalid_request_error', 'unknown_parameter', WolvyInvalidRequestError, 'encryption'],
    [401, 'authentication_error', 'missing_api_key', WolvyAuthenticationError],
    [403, 'permission_error', 'insufficient_scope', WolvyPermissionError],
    [404, 'invalid_request_error', 'video_not_found', WolvyNotFoundError],
    [405, 'invalid_request_error', 'method_not_allowed', WolvyInvalidRequestError],
    [409, 'invalid_request_error', 'chapter_overlap', WolvyConflictError],
    [422, 'invalid_request_error', 'account_settings_missing', WolvyInvalidRequestError],
    [429, 'rate_limit_error', 'rate_limit_exceeded', WolvyRateLimitError],
    [500, 'api_error', 'internal_error', WolvyServerError],
    [503, 'api_error', 'service_unavailable', WolvyServerError],
  ];
  for (const [status, type, code, ErrorClass, param] of cases) {
    it(`maps ${status} ${code} to ${ErrorClass.name}`, async () => {
      const { fetch } = fakeFetch([
        answer(status, apiErrorBody(type, code, `message for ${code}`, param ? { param } : {}), { ...RATE, 'Retry-After': '3600' }),
      ]);
      await assert.rejects(client(fetch, { maxRetries: 0 }).videos.retrieve(VIDEO.id), (error) => {
        assert.ok(error instanceof ErrorClass);
        assert.ok(error instanceof WolvyAPIError);
        assert.ok(error instanceof WolvyError);
        assert.ok(error instanceof Error);
        assert.equal(error.name, ErrorClass.name);
        assert.equal(error.status, status);
        assert.equal(error.type, type);
        assert.equal(error.code, code);
        assert.equal(error.message, `message for ${code}`);
        assert.equal(error.param, param ?? null);
        assert.equal(error.requestId, 'req_0123456789abcdef01234567', 'the body id wins over the header');
        assert.equal(error.rateLimit.remaining, 0);
        assert.equal(error.headers['x-ratelimit-limit'], '120');
        assert.equal(error.raw.error.code, code);
        return true;
      });
    });
  }

  it('404 and 409 are also invalid-request errors', () => {
    assert.ok(WolvyNotFoundError.prototype instanceof WolvyInvalidRequestError);
    assert.ok(WolvyConflictError.prototype instanceof WolvyInvalidRequestError);
  });

  it('reports a 2xx that is not JSON', async () => {
    const { fetch } = fakeFetch([answer(200, 'oops', { 'X-Request-Id': 'req_y' })]);
    await assert.rejects(client(fetch).videos.retrieve(VIDEO.id), (e) => e instanceof WolvyError && e.code === 'invalid_response' && e.requestId === 'req_y');
  });

  it('an error answer without rate-limit headers has rateLimit null', async () => {
    const { fetch } = fakeFetch([answer(404, apiErrorBody('invalid_request_error', 'unknown_endpoint', 'No route.'))]);
    await assert.rejects(client(fetch).videos.retrieve('x'), (e) => e.rateLimit === null && e.code === 'unknown_endpoint');
  });
});

describe('pagination', () => {
  const pages = {
    '': { data: [1, 2], next_cursor: 'c1' },
    c1: { data: [3, 4], next_cursor: 'c2' },
    c2: { data: [5], next_cursor: null },
  };
  const listFetch = () =>
    fakeFetch([
      (url) => {
        const cursor = new URL(url).searchParams.get('starting_after') ?? '';
        const page = pages[cursor];
        return answer(200, { object: 'list', data: page.data.map((n) => ({ id: n })), has_more: page.next_cursor !== null, next_cursor: page.next_cursor });
      },
    ]);

  it('await gives the first page, with the API fields', async () => {
    const { fetch, calls } = listFetch();
    const page = await client(fetch).videos.list({ limit: 2, status: 'ready' });
    assert.deepEqual(page.data, [{ id: 1 }, { id: 2 }]);
    assert.equal(page.object, 'list');
    assert.equal(page.has_more, true);
    assert.equal(page.next_cursor, 'c1');
    assert.equal(page.hasNextPage(), true);
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(page)), { object: 'list', data: [{ id: 1 }, { id: 2 }], has_more: true, next_cursor: 'c1' });
  });

  it('for await walks every page with the same filters', async () => {
    const { fetch, calls } = listFetch();
    const ids = [];
    for await (const video of client(fetch).videos.list({ limit: 2, status: 'ready' })) ids.push(video.id);
    assert.deepEqual(ids, [1, 2, 3, 4, 5]);
    assert.deepEqual(
      calls.map((c) => new URL(c.url).search),
      ['?limit=2&status=ready', '?limit=2&status=ready&starting_after=c1', '?limit=2&status=ready&starting_after=c2'],
    );
  });

  it('getNextPage(), toArray() and the end of the list', async () => {
    const { fetch } = listFetch();
    const wolvy = client(fetch);
    const first = await wolvy.sessions.list();
    const second = await first.getNextPage();
    assert.deepEqual(second.data, [{ id: 3 }, { id: 4 }]);
    const last = await second.getNextPage();
    assert.equal(last.hasNextPage(), false);
    assert.equal(last.has_more, false);
    await assert.rejects(last.getNextPage(), (e) => e instanceof WolvyError && e.code === 'no_next_page');
    assert.deepEqual((await wolvy.folders.list().toArray()).map((x) => x.id), [1, 2, 3, 4, 5]);
    assert.deepEqual((await wolvy.securityEvents.list().toArray({ limit: 3 })).map((x) => x.id), [1, 2, 3]);
    const fromSecond = [];
    for await (const item of second) fromSecond.push(item.id);
    assert.deepEqual(fromSecond, [3, 4, 5]);
  });

  it('sends nothing until awaited or iterated, and only once', async () => {
    const { fetch, calls } = listFetch();
    const pending = client(fetch).viewers.list();
    assert.equal(calls.length, 0);
    const [a, b] = await Promise.all([pending, pending.then((p) => p.data.length)]);
    assert.equal(a.data.length, b);
    assert.equal(calls.length, 1);
  });

  it('starts from your starting_after', async () => {
    const { fetch, calls } = listFetch();
    const ids = (await client(fetch).webhookDeliveries.list({ starting_after: 'c1' }).toArray()).map((x) => x.id);
    assert.deepEqual(ids, [3, 4, 5]);
    assert.equal(new URL(calls[0].url).searchParams.get('starting_after'), 'c1');
  });

  it('passes list errors to await, catch and for await', async () => {
    const { fetch } = fakeFetch([answer(400, apiErrorBody('invalid_request_error', 'invalid_cursor', 'bad', { param: 'starting_after' }))]);
    const wolvy = client(fetch);
    await assert.rejects(wolvy.videos.list({ starting_after: 'zz' }), WolvyInvalidRequestError);
    assert.equal(await wolvy.videos.list().catch((e) => e.param), 'starting_after');
    await assert.rejects(async () => {
      for await (const _ of wolvy.videos.list()) void _;
    }, (e) => e.code === 'invalid_cursor');
  });
});

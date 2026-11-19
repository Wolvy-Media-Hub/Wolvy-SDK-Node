// Against a real local copy of the Developer API (see env.mjs). Runs in order: later tests
// read what earlier ones created.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  embedUrl,
  signViewerToken,
  Wolvy,
  WolvyAuthenticationError,
  WolvyConflictError,
  WolvyInvalidRequestError,
  WolvyNotFoundError,
  WolvyPermissionError,
  WolvyRateLimitError,
} from '@wolvy/node';
import { IT, OTHER_ACCOUNT_VIDEO, SEEDED_VIDEOS, SKIP } from './env.mjs';

const wolvy = IT && new Wolvy({ apiKey: IT.apiKey, baseUrl: IT.baseUrl });
const VIDEO = 'a1b2c3d4e5f60718293a';
const REQUEST_ID = /^req_[0-9a-f]{24}$/;
const exp = (vt) => JSON.parse(Buffer.from(vt.split('.')[0], 'base64url').toString()).exp;

describe('Developer API (local copy)', { skip: SKIP }, () => {
  it('health and account', async () => {
    assert.deepEqual(await wolvy.health.check(), { object: 'health', status: 'ok', database: 'ok' });
    const account = await wolvy.account.retrieve();
    assert.equal(account.object, 'account');
    assert.equal(account.id, IT.accountId);
    assert.equal(account.plan.protection, 'drm');
    assert.equal(account.api_key.scopes.length, 9);
    assert.equal(account.rate_limits.per_minute, 1000);
  });

  it('lists videos: first page, then every page with for await', async () => {
    const page = await wolvy.videos.list({ limit: 3 });
    assert.equal(page.object, 'list');
    assert.equal(page.data.length, 3);
    assert.equal(page.has_more, true);
    assert.equal(typeof page.next_cursor, 'string');
    assert.deepEqual(page.data.map((v) => v.id), SEEDED_VIDEOS.slice(0, 3).map((v) => v.id));

    const seen = [];
    for await (const video of wolvy.videos.list({ limit: 3 })) {
      assert.equal(video.object, 'video');
      seen.push({ id: video.id, status: video.status });
    }
    assert.deepEqual(seen, SEEDED_VIDEOS, 'three pages of 3, 3 and 1, newest first, nothing from the other account');

    const second = await page.getNextPage();
    assert.deepEqual(second.data.map((v) => v.id), SEEDED_VIDEOS.slice(3, 6).map((v) => v.id));
    const third = await second.getNextPage();
    assert.equal(third.hasNextPage(), false);
    assert.equal(third.data.length, 1);
  });

  it('list filters reach the API as it expects them', async () => {
    const ready = await wolvy.videos.list({ status: 'ready' }).toArray();
    assert.deepEqual(ready.map((v) => v.id), SEEDED_VIDEOS.filter((v) => v.status === 'ready').map((v) => v.id));
    assert.equal((await wolvy.videos.list({ q: 'Algebra' }).toArray()).length, 2);
    assert.equal((await wolvy.videos.list({ folder_id: 9 }).toArray()).length, 2);
    assert.equal((await wolvy.videos.list({ folder_id: 'root' }).toArray()).length, 4);
    assert.equal((await wolvy.videos.list({ created_after: new Date(Date.now() + 86_400_000) }).toArray()).length, 0);
  });

  it('retrieves a video and its status', async () => {
    const video = await wolvy.videos.retrieve(VIDEO);
    assert.equal(video.title, 'Onboarding');
    assert.equal(video.folder_id, 7);
    assert.deepEqual(video.captions, [{ label: 'English', language_code: 'en' }]);
    assert.deepEqual(video.chapters, [{ title: 'Introduction', start: 0, end: 45 }]);
    const status = await wolvy.videos.retrieveStatus(VIDEO);
    assert.equal(status.object, 'video_status');
    assert.equal(status.status, 'ready');
  });

  it('a 404 is a WolvyNotFoundError with the stable code, request id and rate limits', async () => {
    for (const id of ['doesnotexist00000000', OTHER_ACCOUNT_VIDEO]) {
      await assert.rejects(wolvy.videos.retrieve(id), (error) => {
        assert.ok(error instanceof WolvyNotFoundError);
        assert.ok(error instanceof WolvyInvalidRequestError);
        assert.equal(error.status, 404);
        assert.equal(error.type, 'invalid_request_error');
        assert.equal(error.code, 'video_not_found');
        assert.match(error.requestId, REQUEST_ID);
        assert.equal(error.headers['x-request-id'], error.requestId);
        assert.equal(error.rateLimit.limit, 1000, 'rate-limit headers come with errors too');
        assert.equal(error.rateLimit.dailyLimit, 100000);
        return true;
      });
    }
    await assert.rejects(wolvy.folders.retrieve(999999), (e) => e instanceof WolvyNotFoundError && e.code === 'folder_not_found');
  });

  it('createToken: the API token is byte-identical to signViewerToken for the same input', async () => {
    const ids = ['user-8813', 'élève/42 "q"', '  padded\t', '\u{1F600} emoji', 'x'.repeat(64), 'sara@example.com'];
    for (const viewerId of ids) {
      const token = await wolvy.playback.createToken(VIDEO, { viewer_id: viewerId, ttl_seconds: 3600 });
      assert.equal(token.object, 'playback_token');
      assert.equal(token.video_id, VIDEO);
      const local = signViewerToken(viewerId, 3600, IT.viewerSecret, { now: exp(token.vt) - 3600 });
      assert.equal(local, token.vt, `viewer id ${JSON.stringify(viewerId)}`);
      assert.equal(token.expires_at, new Date(exp(token.vt) * 1000).toISOString().replace('.000Z', '+00:00'));
      assert.equal(token.embed_url, embedUrl(VIDEO, IT.accountId, local));
      assert.equal(token.deep_link, `wolvy://play/${VIDEO}/${Buffer.from(String(IT.accountId)).toString('base64')}/${local}`);
    }
    // Default lifetime: 6 hours.
    const token = await wolvy.playback.createToken(VIDEO, { viewer_id: 'user-8813' });
    assert.equal(signViewerToken('user-8813', 21600, IT.viewerSecret, { now: exp(token.vt) - 21600 }), token.vt);
  });

  it('minting sends no Idempotency-Key by default; an explicit key is sent and replays', async () => {
    const sent = [];
    const watching = async (url, init) => {
      const response = await fetch(url, init);
      sent.push({ key: new Headers(init.headers).get('idempotency-key'), replay: response.headers.get('idempotent-replay') });
      return response;
    };
    const client = new Wolvy({ apiKey: IT.apiKey, baseUrl: IT.baseUrl, fetch: watching });
    await client.playback.createToken(VIDEO, { viewer_id: 'no-key', ttl_seconds: 600 });
    await client.playback.createToken(VIDEO, { viewer_id: 'no-key', ttl_seconds: 600 });
    assert.deepEqual(sent.slice(0, 2), [{ key: null, replay: null }, { key: null, replay: null }]);

    const key = `mint-${randomUUID()}`;
    const first = await client.playback.createToken(VIDEO, { viewer_id: 'keyed', ttl_seconds: 600 }, { idempotencyKey: key });
    const again = await client.playback.createToken(VIDEO, { viewer_id: 'keyed', ttl_seconds: 600 }, { idempotencyKey: key });
    assert.equal(sent[2].key, key);
    assert.equal(sent[3].replay, 'true');
    assert.equal(again.vt, first.vt, 'the replay hands back the stored token');
  });

  it('the API and signViewerToken refuse the same lifetimes and ids', async () => {
    for (const [params, local] of [
      [{ viewer_id: 'v', ttl_seconds: 59 }, () => signViewerToken('v', 59, IT.viewerSecret)],
      [{ viewer_id: 'v', ttl_seconds: 86401 }, () => signViewerToken('v', 86401, IT.viewerSecret)],
      [{ viewer_id: 'x'.repeat(65) }, () => signViewerToken('x'.repeat(65), 3600, IT.viewerSecret)],
      [{ viewer_id: '   ' }, () => signViewerToken('   ', 3600, IT.viewerSecret)],
    ]) {
      await assert.rejects(wolvy.playback.createToken(VIDEO, params), (e) => e.code === 'invalid_parameter' && ['viewer_id', 'ttl_seconds'].includes(e.param));
      assert.throws(local, RangeError);
    }
    assert.ok(await wolvy.playback.createToken(VIDEO, { viewer_id: 'v', ttl_seconds: 86400 }));
    assert.ok(signViewerToken('v', 86400, IT.viewerSecret));
  });

  it('embed URL: the API, the video object and embedUrl() agree', async () => {
    const embed = await wolvy.playback.retrieveEmbed(VIDEO);
    const video = await wolvy.videos.retrieve(VIDEO);
    assert.equal(embed.embed_url, embedUrl(VIDEO, IT.accountId));
    assert.equal(video.embed_url, embedUrl(VIDEO, IT.accountId));
    assert.equal(embed.embed_url, `https://embed.wolvy.stream/${VIDEO}/NDI=`);
    assert.ok(embed.iframe_html.includes(embed.embed_url));
  });

  it('idempotent retry: a POST whose answer is lost is retried with the same key and replayed, not run twice', async () => {
    const seen = [];
    let dropped = false;
    const flaky = async (url, init) => {
      const response = await fetch(url, init);
      seen.push({ key: new Headers(init.headers).get('idempotency-key'), status: response.status, replay: response.headers.get('idempotent-replay') });
      if (!dropped) {
        dropped = true; // the API did the work; the client never hears back
        throw new TypeError('fetch failed', { cause: new Error('socket hang up') });
      }
      return response;
    };
    const client = new Wolvy({ apiKey: IT.apiKey, baseUrl: IT.baseUrl, fetch: flaky });
    const name = `SDK retry ${randomUUID()}`;
    const folder = await client.folders.create({ name, parent_id: 7 });
    assert.equal(seen.length, 2);
    assert.equal(seen[0].key, seen[1].key);
    assert.equal(seen[0].status, 201);
    assert.equal(seen[1].status, 201);
    assert.equal(seen[1].replay, 'true', 'the second attempt was a replay');
    assert.equal(folder.name, name);
    const matches = await wolvy.folders.list({ q: name }).toArray();
    assert.deepEqual(matches.map((f) => f.id), [folder.id], 'exactly one folder was created');
    await wolvy.folders.delete(folder.id);
  });

  it('idempotency: same key with another body is a 409; a failed POST gives its key back', async () => {
    const key = `sdk-node-${randomUUID()}`;
    const first = await wolvy.folders.create({ name: 'Idem A' }, { idempotencyKey: key });
    const again = await wolvy.folders.create({ name: 'Idem A' }, { idempotencyKey: key });
    assert.equal(again.id, first.id);
    await assert.rejects(wolvy.folders.create({ name: 'Idem B' }, { idempotencyKey: key }), (e) => {
      assert.ok(e instanceof WolvyConflictError);
      assert.equal(e.code, 'idempotency_key_reused');
      return true;
    });
    // Wave-4 fix: a failed POST no longer keeps its key claimed for 24 hours.
    const key2 = `sdk-node-${randomUUID()}`;
    await assert.rejects(wolvy.folders.create({ name: 'Idem C', parent_id: 999999 }, { idempotencyKey: key2 }), (e) => e.code === 'folder_not_found' && e.status === 400);
    const fixed = await wolvy.folders.create({ name: 'Idem C' }, { idempotencyKey: key2 });
    assert.equal(fixed.name, 'Idem C');
    await wolvy.folders.delete(first.id);
    await wolvy.folders.delete(fixed.id);
  });

  it('auth, scope and parameter errors map to their classes', async () => {
    const bad = new Wolvy({ apiKey: 'wv_live_00000000000000000000000000000000', baseUrl: IT.baseUrl });
    await assert.rejects(bad.account.retrieve(), (e) => e instanceof WolvyAuthenticationError && e.code === 'invalid_api_key' && e.status === 401);
    const readOnly = new Wolvy({ apiKey: IT.readOnlyKey, baseUrl: IT.baseUrl });
    assert.ok((await readOnly.videos.list()).data.length > 0);
    await assert.rejects(readOnly.account.retrieve(), (e) => {
      assert.ok(e instanceof WolvyPermissionError);
      assert.equal(e.code, 'insufficient_scope');
      assert.match(e.message, /account:read/);
      assert.ok(e.rateLimit !== null, 'a refused scope still carries the rate-limit numbers');
      return true;
    });
    await assert.rejects(
      wolvy.videos.create({ source_url: 'https://media.example.com/a.mp4', encryption: 'drm' }),
      (e) => e instanceof WolvyInvalidRequestError && e.code === 'unknown_parameter' && e.param === 'encryption',
    );
    await assert.rejects(wolvy.videos.list({ limit: 101 }), (e) => e.code === 'invalid_parameter' && e.param === 'limit');
    await assert.rejects(wolvy.videos.list({ starting_after: '!!' }), (e) => e.code === 'invalid_cursor');
  });

  it('a 429 carries Retry-After and the limits; with retries on, the SDK waits and gets through', { timeout: 150_000 }, async () => {
    const strict = new Wolvy({ apiKey: IT.onePerMinuteKey, baseUrl: IT.baseUrl, maxRetries: 0 });
    let limited = null;
    for (let i = 0; i < 3 && !limited; i++) {
      try {
        await strict.videos.list({ limit: 1 });
      } catch (error) {
        limited = error;
      }
    }
    assert.ok(limited instanceof WolvyRateLimitError, 'one of three quick requests is refused');
    assert.equal(limited.code, 'rate_limit_exceeded');
    assert.ok(limited.retryAfter >= 1 && limited.retryAfter <= 60);
    assert.equal(limited.rateLimit.limit, 1);
    assert.equal(limited.rateLimit.remaining, 0);

    const patient = new Wolvy({ apiKey: IT.onePerMinuteKey, baseUrl: IT.baseUrl, maxRetries: 2 });
    const started = Date.now();
    const page = await patient.videos.list({ limit: 1 });
    assert.equal(page.data.length, 1);
    assert.ok(Date.now() - started >= 500, 'it waited for the next minute');
  });

  it('every SDK method reaches its route on the real API', { timeout: 60_000 }, async () => {
    const answers = [];
    const ok = async (name, promise) => {
      const value = await promise;
      answers.push(name);
      return value;
    };
    const fails = async (name, promise, code) => {
      await assert.rejects(promise, (e) => {
        assert.equal(e.code, code, `${name}: ${e.message}`);
        return true;
      });
      answers.push(name);
    };

    await ok('account.retrievePlayerSettings', wolvy.account.retrievePlayerSettings()).then((s) => {
      assert.equal(s.object, 'player_settings');
      assert.deepEqual(s.allowed_domains, ['academy.example.com']);
      assert.deepEqual(s.allowed_apps, []);
    });
    const folder = await ok('folders.create', wolvy.folders.create({ name: 'SDK tour', parent_id: 7 }));
    assert.deepEqual(folder.path.map((p) => p.id), [7, folder.id]);
    await ok('folders.retrieve', wolvy.folders.retrieve(folder.id));
    await ok('folders.update', wolvy.folders.update(folder.id, { name: 'SDK tour 2', parent_id: null })).then((f) => assert.equal(f.parent_id, null));
    await ok('folders.list', wolvy.folders.list({ parent_id: 'root' }).toArray()).then((list) => assert.ok(list.some((f) => f.id === folder.id)));
    await ok('videos.update', wolvy.videos.update('b1000000000000000003', { folder_id: folder.id, title: 'Geometry' }));
    await ok('folders.delete', wolvy.folders.delete(folder.id));
    assert.equal((await wolvy.videos.retrieve('b1000000000000000003')).folder_id, null, 'its video moved up to the root');

    await ok('tags.replace', wolvy.tags.replace(VIDEO, { tags: ['onboarding', 'Week 1'] })).then((t) => assert.deepEqual(t.tags, ['onboarding', 'Week 1']));
    await ok('tags.add', wolvy.tags.add(VIDEO, { tags: ['algebra'] }));
    await ok('tags.list', wolvy.tags.list()).then((t) => assert.equal(t.data.length, 3));
    await ok('tags.remove', wolvy.tags.remove(VIDEO, 'Week 1'));
    await fails('tags.remove (again)', wolvy.tags.remove(VIDEO, 'Week 1'), 'tag_not_found');
    await ok('videos.bulk', wolvy.videos.bulk({ action: 'tag_remove', ids: [VIDEO, 'nope'], tags: ['algebra', 'onboarding'] })).then((r) => {
      assert.equal(r.object, 'bulk_result');
      assert.equal(r.done, 1);
      assert.equal(r.failed, 1);
      assert.equal(r.results[1].error.code, 'video_not_found');
    });

    await ok('captions.list', wolvy.captions.list(VIDEO)).then((l) => assert.equal(l.data[0].language_code, 'en'));
    // Captions are stored on the media server; this copy has none (MEDIA_SERVER_DOMAIN=invalid).
    await fails('captions.create', wolvy.captions.create(VIDEO, { language_code: 'ar', content: 'WEBVTT\n\n' }, { maxRetries: 0 }), 'service_unavailable');
    await fails('captions.delete', wolvy.captions.delete(VIDEO, 'en', { maxRetries: 0 }), 'service_unavailable');

    await ok('chapters.create', wolvy.chapters.create(VIDEO, { title: 'Setup', start: 45, end: 210 })).then((l) => assert.equal(l.data.length, 2));
    await fails('chapters.create (overlap)', wolvy.chapters.create(VIDEO, { title: 'X', start: 100, end: 300 }), 'chapter_overlap');
    await ok('chapters.update', wolvy.chapters.update(VIDEO, 1, { title: 'Setting up' }));
    await ok('chapters.list', wolvy.chapters.list(VIDEO)).then((l) => assert.equal(l.data[1].title, 'Setting up'));
    await ok('chapters.delete', wolvy.chapters.delete(VIDEO, 1));
    await fails('chapters.delete (gone)', wolvy.chapters.delete(VIDEO, 1), 'chapter_not_found');

    await ok('moments.create', wolvy.moments.create(VIDEO, { label: 'Quiz', timestamp: 300 }));
    await fails('moments.create (same second)', wolvy.moments.create(VIDEO, { label: 'Again', timestamp: 300 }), 'moment_exists');
    await ok('moments.update', wolvy.moments.update(VIDEO, 1, { label: 'Final quiz' }));
    await ok('moments.list', wolvy.moments.list(VIDEO)).then((l) => assert.equal(l.data[1].label, 'Final quiz'));
    await ok('moments.delete', wolvy.moments.delete(VIDEO, 1));

    await ok('analytics.overview', wolvy.analytics.overview({ from: '2026-01-01', to: new Date() })).then((o) => assert.equal(o.video_count, 7));
    await ok('analytics.daily', wolvy.analytics.daily());
    await ok('analytics.countries', wolvy.analytics.countries({ video_id: VIDEO }));
    await ok('analytics.devices', wolvy.analytics.devices()).then((d) => assert.equal(d.object, 'analytics_devices'));
    await ok('analytics.video', wolvy.analytics.video(VIDEO)).then((a) => assert.equal(a.video_id, VIDEO));
    await fails('analytics.daily (from after to)', wolvy.analytics.daily({ from: '2026-09-15', to: '2026-09-01' }), 'invalid_parameter');

    await ok('usage.retrieve', wolvy.usage.retrieve()).then((u) => assert.equal(u.storage.limit_bytes, 536870912000));
    await ok('usage.history', wolvy.usage.history({ from: '2026-11-01' }));
    await ok('usage.retrievePlan', wolvy.usage.retrievePlan()).then((p) => assert.equal(p.name, 'DRM Pro'));

    await ok('sessions.list', wolvy.sessions.list({ country: 'eg' }).toArray());
    await ok('sessions.listForVideo', wolvy.sessions.listForVideo(VIDEO).toArray());
    await fails('sessions.retrieve', wolvy.sessions.retrieve('9f2b6c1d3e4a5b60718293a4b5c6d7e8'), 'session_not_found');
    await ok('viewers.list', wolvy.viewers.list({ q: 'user' }).toArray());
    await fails('viewers.retrieve', wolvy.viewers.retrieve('user-8813'), 'viewer_not_found');
    await ok('viewers.listSharing', wolvy.viewers.listSharing({ grade: 'warn' }).toArray());
    await ok('securityEvents.list', wolvy.securityEvents.list({ severity: 'critical' }).toArray());
    await fails('securityEvents.list (unknown type)', wolvy.securityEvents.list({ event_type: 'nope' }), 'invalid_parameter');

    // The API refuses a URL it cannot reach before it creates anything (*.invalid never resolves).
    await fails('videos.create', wolvy.videos.create({ source_url: 'https://media.invalid/a.mp4', title: 'x' }), 'source_unreachable');
    // Deleting needs the media server, which this copy cannot reach: 503, and the video stays.
    await fails('videos.delete', wolvy.videos.delete('b1000000000000000006', { maxRetries: 0 }), 'service_unavailable');
    assert.equal((await wolvy.videos.retrieve('b1000000000000000006')).id, 'b1000000000000000006');

    const endpoint = await ok('webhookEndpoints.create', wolvy.webhookEndpoints.create({ url: 'https://example.com/sdk-tour', events: ['video.ready'] }));
    assert.match(endpoint.secret, /^whsec_[0-9a-f]{48}$/);
    await ok('webhookEndpoints.retrieve', wolvy.webhookEndpoints.retrieve(endpoint.id)).then((e) => assert.equal(e.secret, undefined));
    await ok('webhookEndpoints.update', wolvy.webhookEndpoints.update(endpoint.id, { events: ['video.ready', 'caption.ready'], is_active: false }));
    await ok('webhookEndpoints.list', wolvy.webhookEndpoints.list()).then((l) => assert.ok(l.data.some((e) => e.id === endpoint.id && !e.is_active)));
    await ok('webhookEndpoints.sendTest', wolvy.webhookEndpoints.sendTest(endpoint.id)).then((d) => assert.equal(d.status, 'pending'));
    await ok('webhookDeliveries.list', wolvy.webhookDeliveries.list({ endpoint_id: endpoint.id, status: 'pending' }).toArray()).then((l) => assert.equal(l.length, 1));
    await ok('webhookEndpoints.delete', wolvy.webhookEndpoints.delete(endpoint.id));
    await fails('webhookEndpoints.retrieve (deleted)', wolvy.webhookEndpoints.retrieve(endpoint.id), 'webhook_endpoint_not_found');
    await fails('webhookEndpoints.create (private address)', wolvy.webhookEndpoints.create({ url: 'https://127.0.0.1/h', events: ['video.ready'] }), 'source_not_allowed');

    assert.ok(answers.length >= 50);
  });
});

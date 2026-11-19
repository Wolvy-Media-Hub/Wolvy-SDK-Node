// One SDK method per Developer API endpoint: every endpoint of the docs' api.js (snapshot in
// test/fixtures/api-endpoints.json) is called through the SDK against a fake fetch, and the
// method, path and success status are checked. When the docs repository sits beside this
// one (or WOLVY_DOCS_DIR points at it), the snapshot is also compared with the live api.js.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WEBHOOK_EVENT_TYPES, Wolvy } from '@wolvy/node';
import { answer, fakeFetch, TEST_KEY } from '../helpers.mjs';

const SNAPSHOT = JSON.parse(readFileSync(new URL('../fixtures/api-endpoints.json', import.meta.url), 'utf8'));
const V = 'a1b2c3d4e5f60718293a';

/** api.js endpoint id → the SDK call, and the concrete path it must request. */
const CALLS = {
  'get-health': [(w) => w.health.check(), '/health'],
  'get-account': [(w) => w.account.retrieve(), '/v1/account'],
  'get-player-settings': [(w) => w.account.retrievePlayerSettings(), '/v1/settings/player'],
  'list-videos': [(w) => w.videos.list(), '/v1/videos'],
  'create-video': [(w) => w.videos.create({ source_url: 'https://media.example.com/a.mp4' }), '/v1/videos'],
  'get-video': [(w) => w.videos.retrieve(V), `/v1/videos/${V}`],
  'get-video-status': [(w) => w.videos.retrieveStatus(V), `/v1/videos/${V}/status`],
  'update-video': [(w) => w.videos.update(V, { title: 'T' }), `/v1/videos/${V}`],
  'delete-video': [(w) => w.videos.delete(V), `/v1/videos/${V}`],
  'bulk-videos': [(w) => w.videos.bulk({ action: 'delete', ids: [V] }), '/v1/videos/bulk'],
  'list-folders': [(w) => w.folders.list(), '/v1/folders'],
  'create-folder': [(w) => w.folders.create({ name: 'F' }), '/v1/folders'],
  'get-folder': [(w) => w.folders.retrieve(7), '/v1/folders/7'],
  'update-folder': [(w) => w.folders.update(7, { name: 'G' }), '/v1/folders/7'],
  'delete-folder': [(w) => w.folders.delete(7), '/v1/folders/7'],
  'list-tags': [(w) => w.tags.list(), '/v1/tags'],
  'replace-video-tags': [(w) => w.tags.replace(V, { tags: ['a'] }), `/v1/videos/${V}/tags`],
  'add-video-tags': [(w) => w.tags.add(V, { tags: ['a'] }), `/v1/videos/${V}/tags`],
  'remove-video-tag': [(w) => w.tags.remove(V, 'Week 1'), `/v1/videos/${V}/tags/Week%201`],
  'list-captions': [(w) => w.captions.list(V), `/v1/videos/${V}/captions`],
  'add-caption': [(w) => w.captions.create(V, { language_code: 'en', content: 'WEBVTT\n' }), `/v1/videos/${V}/captions`],
  'delete-caption': [(w) => w.captions.delete(V, 'en'), `/v1/videos/${V}/captions/en`],
  'list-chapters': [(w) => w.chapters.list(V), `/v1/videos/${V}/chapters`],
  'add-chapter': [(w) => w.chapters.create(V, { title: 'I', start: 0, end: 45 }), `/v1/videos/${V}/chapters`],
  'update-chapter': [(w) => w.chapters.update(V, 0, { title: 'J' }), `/v1/videos/${V}/chapters/0`],
  'delete-chapter': [(w) => w.chapters.delete(V, 0), `/v1/videos/${V}/chapters/0`],
  'list-moments': [(w) => w.moments.list(V), `/v1/videos/${V}/moments`],
  'add-moment': [(w) => w.moments.create(V, { label: 'L', timestamp: 120 }), `/v1/videos/${V}/moments`],
  'update-moment': [(w) => w.moments.update(V, 0, { label: 'M' }), `/v1/videos/${V}/moments/0`],
  'delete-moment': [(w) => w.moments.delete(V, 0), `/v1/videos/${V}/moments/0`],
  'create-playback-token': [(w) => w.playback.createToken(V, { viewer_id: 'user-8813' }), `/v1/videos/${V}/playback-tokens`],
  'get-embed': [(w) => w.playback.retrieveEmbed(V), `/v1/videos/${V}/embed`],
  'analytics-overview': [(w) => w.analytics.overview(), '/v1/analytics/overview'],
  'analytics-daily': [(w) => w.analytics.daily(), '/v1/analytics/daily'],
  'analytics-countries': [(w) => w.analytics.countries(), '/v1/analytics/countries'],
  'analytics-devices': [(w) => w.analytics.devices(), '/v1/analytics/devices'],
  'video-analytics': [(w) => w.analytics.video(V), `/v1/videos/${V}/analytics`],
  'get-usage': [(w) => w.usage.retrieve(), '/v1/usage'],
  'usage-history': [(w) => w.usage.history(), '/v1/usage/history'],
  'get-plan': [(w) => w.usage.retrievePlan(), '/v1/plan'],
  'list-sessions': [(w) => w.sessions.list(), '/v1/sessions'],
  'get-session': [(w) => w.sessions.retrieve('9f2b6c1d3e4a5b60718293a4b5c6d7e8'), '/v1/sessions/9f2b6c1d3e4a5b60718293a4b5c6d7e8'],
  'video-sessions': [(w) => w.sessions.listForVideo(V), `/v1/videos/${V}/sessions`],
  'list-viewers': [(w) => w.viewers.list(), '/v1/viewers'],
  'get-viewer': [(w) => w.viewers.retrieve('user 8813@x'), '/v1/viewers/user%208813%40x'],
  'sharing-report': [(w) => w.viewers.listSharing(), '/v1/analytics/sharing'],
  'list-security-events': [(w) => w.securityEvents.list(), '/v1/security-events'],
  'list-webhook-endpoints': [(w) => w.webhookEndpoints.list(), '/v1/webhook-endpoints'],
  'create-webhook-endpoint': [(w) => w.webhookEndpoints.create({ url: 'https://example.com/h', events: ['video.ready'] }), '/v1/webhook-endpoints'],
  'get-webhook-endpoint': [(w) => w.webhookEndpoints.retrieve(3), '/v1/webhook-endpoints/3'],
  'update-webhook-endpoint': [(w) => w.webhookEndpoints.update(3, { is_active: true }), '/v1/webhook-endpoints/3'],
  'delete-webhook-endpoint': [(w) => w.webhookEndpoints.delete(3), '/v1/webhook-endpoints/3'],
  'test-webhook-endpoint': [(w) => w.webhookEndpoints.sendTest(3), '/v1/webhook-endpoints/3/test'],
  'list-webhook-deliveries': [(w) => w.webhookDeliveries.list(), '/v1/webhook-deliveries'],
};

describe('endpoint coverage', () => {
  it('has one SDK call for every endpoint of api.js, and no extra', () => {
    assert.equal(SNAPSHOT.endpoints.length, 54);
    assert.deepEqual(Object.keys(CALLS).sort(), SNAPSHOT.endpoints.map((e) => e.id).sort());
  });

  for (const endpoint of SNAPSHOT.endpoints) {
    it(`${endpoint.method} ${endpoint.path} (${endpoint.id})`, async () => {
      const [call, path] = CALLS[endpoint.id];
      const body = endpoint.status === 204 ? undefined : { object: 'list', data: [], has_more: false, next_cursor: null };
      const { fetch, calls } = fakeFetch([answer(endpoint.status, body)]);
      const wolvy = new Wolvy({ apiKey: TEST_KEY, fetch, baseUrl: 'https://api.wolvy.net/v1' });
      await call(wolvy);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, endpoint.method);
      const url = new URL(calls[0].url);
      assert.equal(url.origin, 'https://api.wolvy.net');
      assert.equal(url.pathname, path);
      // The concrete path fits the documented template.
      const template = new RegExp(`^${endpoint.path.replace(/\{[a-z_]+\}/g, '[^/]+')}$`);
      assert.match(url.pathname, template);
      // Every POST gets an automatic Idempotency-Key, except minting a token (no side effect).
      const keyed = endpoint.method === 'POST' && endpoint.id !== 'create-playback-token';
      assert.equal(calls[0].headers['idempotency-key'] !== undefined, keyed);
    });
  }

  it('knows every subscribable webhook event of the docs', () => {
    assert.deepEqual([...WEBHOOK_EVENT_TYPES], SNAPSHOT.webhook_events.filter((e) => e !== 'webhook.test'));
  });

  const here = dirname(fileURLToPath(import.meta.url));
  const docs = process.env.WOLVY_DOCS_DIR ?? join(here, '..', '..', '..', 'Wolvy-Docs-UI');
  const apiJs = join(docs, 'src', 'data', 'api.js');
  it('the snapshot still matches the docs api.js', { skip: existsSync(apiJs) ? false : 'Wolvy-Docs-UI not found' }, async () => {
    const { ENDPOINTS } = await import(pathToFileURL(apiJs).href);
    const { EVENTS } = await import(pathToFileURL(join(docs, 'src', 'data', 'webhooks.js')).href);
    assert.deepEqual(
      ENDPOINTS.map((e) => ({ id: e.id, method: e.method, path: e.path, scope: e.scope, status: e.status })),
      SNAPSHOT.endpoints,
    );
    assert.deepEqual(EVENTS.map((e) => e.name), SNAPSHOT.webhook_events);
  });
});
